/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { inject, injectable } from 'inversify';
import { v4 } from 'uuid';
import * as vscode from 'vscode';
import type { DeviceAuthentication } from './device-authentication';
import { ErrorHandler } from './error-handler';
import { ExtensionContext } from './extension-context';
import { Logger } from './logger';
import { getMatchingHydrationScopeBundles, hasAllScopes, isUnauthorizedError, sessionMatchesRequestedScopes } from './utils';
import { AuthenticationSession } from 'vscode';

export interface GithubUser {
  login: string;
  id: number;
  name: string;
  email: string;
}

export interface GithubService {
  readonly whenReady: Promise<void>;
  getToken(): Promise<string>;
  persistDeviceAuthToken(token: string): Promise<void>;
  removeDeviceAuthToken(): Promise<void>;
  getUser(): Promise<GithubUser>;
  getTokenScopes(token: string): Promise<string[]>;
  isDeviceAuthToken(): Promise<boolean>;
}

@injectable()
export class GitHubAuthProvider implements vscode.AuthenticationProvider {
  private readonly sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private sessionsPromise: Promise<vscode.AuthenticationSession[]>;

  get onDidChangeSessions() {
    return this.sessionChangeEmitter.event;
  }

  private deviceAuthentication?: DeviceAuthentication;

  private readonly storageKey: string;
  private readonly deviceAuthSessionStorageKey: string;

  constructor(
    @inject(Logger) private logger: Logger,
    @inject(ErrorHandler) private errorHandler: ErrorHandler,
    @inject(ExtensionContext) private extensionContext: ExtensionContext,
    @inject(Symbol.for('GithubServiceInstance')) private githubService: GithubService
  ) {
    const workspaceId = process.env.DEVWORKSPACE_ID || 'default';
    this.storageKey = `sessions:${workspaceId}`;
    this.deviceAuthSessionStorageKey = `device-auth-session-ids:${workspaceId}`;
    this.sessionsPromise = this.readSessions();
  }

  private async readSessions(): Promise<vscode.AuthenticationSession[]> {
    const raw = await this.extensionContext.getContext().secrets.get(this.storageKey);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        this.logger.warn('GitHubAuthProvider: failed to parse stored sessions, starting fresh');
      }
    }
    return [];
  }

  setDeviceAuthentication(deviceAuthentication: DeviceAuthentication): void {
    this.deviceAuthentication = deviceAuthentication;
  }

  async hydrateFromK8sToken(): Promise<void> {
    await Promise.race([
      this.githubService.whenReady,
      new Promise<void>(resolve => setTimeout(resolve, 5000))
    ]);

    let sessions = await this.sessionsPromise;

    const isDeviceAuthToken = await this.githubService.isDeviceAuthToken();

    let deviceAuthSessionIds = await this.getDeviceAuthSessionIds();

    /*
    * While Device Authentication is active, remember which persisted
    * sessions belong to Device Authentication.
    */
    if (isDeviceAuthToken && sessions.length > 0) {
      const currentToken = await this.githubService.getToken();

      const currentDeviceAuthSessions = sessions
				.filter((session) => session.accessToken === currentToken)
				.map((session) => session.id);

      const updatedDeviceAuthSessionIds = [
        ...new Set([...deviceAuthSessionIds, ...currentDeviceAuthSessions]),
      ];

      if (updatedDeviceAuthSessionIds.length !== deviceAuthSessionIds.length) {
        await this.storeDeviceAuthSessionIds(updatedDeviceAuthSessionIds);

        deviceAuthSessionIds = updatedDeviceAuthSessionIds;
      }
    }

    /*
    * VS Code restores persisted authentication sessions when the
    * workspace is restarted.
    *
		 * If Device Authentication is no longer active, remove only
		 * the sessions that were previously created using Device Authentication.
    */
    if (!isDeviceAuthToken && deviceAuthSessionIds.length > 0) {
			const removed = sessions.filter((session) =>
        deviceAuthSessionIds.includes(session.id),
      );

      const kept = sessions.filter(
				(session) => !deviceAuthSessionIds.includes(session.id),
      );

      if (removed.length > 0) {
        this.logger.info(
          `GitHubAuthProvider: removing ${removed.length} persisted Device Authentication session(s) because Device Authentication is no longer active`,
        );

        await this.storeSessions(kept);

				const removedIds = new Set(removed.map((session) => session.id));

        await this.storeDeviceAuthSessionIds(
					deviceAuthSessionIds.filter((id) => !removedIds.has(id)),
        );

        this.sessionChangeEmitter.fire({
          added: [],
          removed,
          changed: [],
        });

        sessions = kept;

        /*
        * Do not immediately recreate a session using the fallback
        * PAT/git-credential token. The user must authenticate again.
        */
        return;
      }
      // Clean up stale session IDs.
      await this.storeDeviceAuthSessionIds([]);
    }

    if (sessions.length > 0) {
      try {
        await this.githubService.getTokenScopes(sessions[0].accessToken);
        const currentToken = await this.githubService.getToken();
        if (sessions[0].accessToken === currentToken) {
          this.logger.info('GitHubAuthProvider: existing sessions are up to date');
          return;
        }
        this.logger.info('GitHubAuthProvider: token changed, re-hydrating sessions');
      } catch (error) {
        if (isUnauthorizedError(error)) {
          this.logger.warn('GitHubAuthProvider: existing session token is not valid, clearing sessions');
          const removed = [...sessions];
          await this.storeSessions([]);
          await this.storeDeviceAuthSessionIds([]);
          this.sessionChangeEmitter.fire({ added: [], removed, changed: [] });
          sessions = [];
        } else {
          this.logger.warn(`GitHubAuthProvider: session validation skipped: ${(error as Error).message}`);
          return;
        }
      }
    }

    const token = await this.githubService.getToken();

    const hydratedSessions = await this.doHydrateWithToken(token);

    if (isDeviceAuthToken && hydratedSessions.length > 0) {
      const hydratedSessionIds = hydratedSessions.map(session => session.id);

      const updatedDeviceAuthSessionIds = [
        ...new Set([...deviceAuthSessionIds, ...hydratedSessionIds]),
      ];

      try {
        await this.storeDeviceAuthSessionIds(updatedDeviceAuthSessionIds);
        deviceAuthSessionIds = updatedDeviceAuthSessionIds;
      } catch (error) {
        await this.rollbackHydratedSessions(hydratedSessions);
        throw error;
      }
    }
  }

  private async rollbackHydratedSessions(hydratedSessions: AuthenticationSession[]): Promise<void> {
    const hydratedSessionIds = new Set(hydratedSessions.map(session => session.id));
    const sessions = await this.sessionsPromise;
    const updatedSessions = sessions.filter(session => !hydratedSessionIds.has(session.id));

    await this.storeSessions(updatedSessions);

    this.sessionChangeEmitter.fire({
      added: [],
      removed: hydratedSessions,
      changed: [],
    });
  }

  private async getDeviceAuthSessionIds(): Promise<string[]> {
    const raw = await this.extensionContext
      .getContext()
      .secrets
      .get(this.deviceAuthSessionStorageKey);

    if (!raw) {
      return [];
    }

    try {
      const sessionIds: unknown = JSON.parse(raw);
      if (!Array.isArray(sessionIds) || !sessionIds.every(id => typeof id === 'string')) {
        throw new Error('Invalid device-auth session ID storage value');
      }
      return sessionIds;
    } catch {
      this.logger.warn(
        'GitHubAuthProvider: failed to parse persisted device-auth session IDs',
      );
      return [];
    }
  }

  private async storeDeviceAuthSessionIds(
    sessionIds: string[],
  ): Promise<void> {
    await this.extensionContext
      .getContext()
      .secrets
      .store(
        this.deviceAuthSessionStorageKey,
        JSON.stringify(sessionIds),
      );
  }

  private async waitForToken(timeoutMs: number, intervalMs: number): Promise<string | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        return await this.githubService.getToken();
      } catch {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
    return undefined;
  }

  private async doHydrateWithToken(token: string): Promise<AuthenticationSession[]> {
    try {
      const tokenScopes = await this.githubService.getTokenScopes(token);
      if (tokenScopes.length === 0) {
        this.logger.info('GitHubAuthProvider: hydrate skipped, token has no scopes');
        return [];
      }

      const githubUser = await this.githubService.getUser();
      const matchingBundles = getMatchingHydrationScopeBundles(tokenScopes);
      if (matchingBundles.length === 0) {
        this.logger.info('GitHubAuthProvider: hydrate skipped, token scopes match no known bundle');
        return [];
      }

      const account = { label: githubUser.login, id: githubUser.id.toString() };
      const hydratedSessions = matchingBundles.map(scopes => ({
        id: v4(),
        accessToken: token,
        account,
        scopes,
      }));

      await this.storeSessions(hydratedSessions);
      this.sessionChangeEmitter.fire({ added: hydratedSessions, removed: [], changed: [] });
      this.logger.info(`GitHubAuthProvider: hydrated ${hydratedSessions.length} session(s) from K8s token`);
      return hydratedSessions;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        this.logger.warn('GitHubAuthProvider: hydrate failed, token is not valid');
      } else {
        this.logger.warn(`GitHubAuthProvider: hydrate failed: ${(error as Error).message}`);
      }
      return [];
    }
  }

  async getSessions(sessionScopes?: string[]): Promise<vscode.AuthenticationSession[]> {
    this.logger.info(`GitHubAuthProvider: GET SESSIONS for scopes: ${sessionScopes}`);

    const sessions = await this.sessionsPromise;
    const sortedScopes = sessionScopes ? [...sessionScopes].sort() : [];
    const filteredSessions = sortedScopes.length
      ? sessions.filter(session => sessionMatchesRequestedScopes(session.scopes, sortedScopes))
      : [...sessions];

    this.logger.info(`GitHubAuthProvider: GET sessions - found ${filteredSessions.length} sessions for scopes: ${sessionScopes}`);
    return filteredSessions;
  }

  async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
    this.logger.info(`GitHubAuthProvider: CREATE SESSION for scopes: ${JSON.stringify(scopes)}`);
    const sortedScopes = [...scopes].sort();

    let token: string;
    try {
      token = await this.resolveToken(sortedScopes);
    } catch (error) {
      this.logger.error(`GitHubAuthProvider: an error happened at session creation (resolve token step): ${(error as Error).message}`);
      throw new Error((error as Error).message);
    }

    let githubUser: GithubUser;
    try {
      githubUser = await this.githubService.getUser();
    } catch (error) {
      this.logger.error(`GitHubAuthProvider: an error happened at session creation (get user step): ${(error as Error).message}`);

      if (isUnauthorizedError(error)) {
        try {
          token = await this.getDeviceAuthentication().runInteractiveFlow(sortedScopes);
          githubUser = await this.githubService.getUser();
        } catch (authError) {
          this.errorHandler.onUnauthorizedError();
          throw new Error((authError as Error).message);
        }
      } else {
        throw new Error((error as Error).message);
      }
    }

    const sessions = await this.sessionsPromise;
    const session: vscode.AuthenticationSession = {
      id: v4(),
      accessToken: token,
      account: { label: githubUser.login, id: githubUser.id.toString() },
      scopes,
    };

    const isDeviceAuth = await this.githubService.isDeviceAuthToken();
    if (isDeviceAuth) {
      const deviceAuthSessionIds = await this.getDeviceAuthSessionIds();

      if (!deviceAuthSessionIds.includes(session.id)) {
        await this.storeDeviceAuthSessionIds([
          ...deviceAuthSessionIds,
          session.id,
        ]);
      }
    }

    const sessionIndex = sessions.findIndex(s => sessionMatchesRequestedScopes(s.scopes, sortedScopes));
    const removed: vscode.AuthenticationSession[] = [];
    const updatedSessions = [...sessions];
    if (sessionIndex > -1) {
      removed.push(...updatedSessions.splice(sessionIndex, 1, session));
    } else {
      updatedSessions.push(session);
    }

    await this.storeSessions(updatedSessions);
    this.sessionChangeEmitter.fire({ added: [session], removed, changed: [] });

    this.logger.info(`GitHubAuthProvider: session was created successfully for scopes: ${JSON.stringify(scopes)}`);
    return session;
  }

  private async resolveToken(sortedScopes: string[]): Promise<string> {
    const token = await this.getTokenIfSufficient(sortedScopes);
    if (!token) {
      return await this.getDeviceAuthentication().runInteractiveFlow(sortedScopes);
    }
    return token;
  }

  private async getTokenIfSufficient(sortedScopes: string[]): Promise<string | undefined> {
    try {
      const token = await this.githubService.getToken();
      const existingScopes = await this.githubService.getTokenScopes(token);
      if (!hasAllScopes(existingScopes, sortedScopes)) {
        this.logger.info('GitHubAuthProvider: token lacks required scopes, starting device flow');
        return undefined;
      }

      const isDeviceAuth = await this.githubService.isDeviceAuthToken();
      if (!isDeviceAuth) {
        const sessions = await this.sessionsPromise;
        const hasExistingSession = sessions.some(s =>
          sessionMatchesRequestedScopes(s.scopes, sortedScopes)
        );
        if (hasExistingSession) {
          this.logger.info('GitHubAuthProvider: PAT session already exists for requested scopes, starting device auth flow');
          return undefined;
        }
      }

      return token;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        this.logger.info('GitHubAuthProvider: token is not valid, starting device flow');
      } else {
        this.logger.info('GitHubAuthProvider: no token available, starting device flow');
      }
      return undefined;
    }
  }

  private getDeviceAuthentication(): DeviceAuthentication {
    if (!this.deviceAuthentication) {
      throw new Error('Device authentication is not initialized');
    }
    return this.deviceAuthentication;
  }

  private async storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
    this.sessionsPromise = Promise.resolve(sessions);
    await this.extensionContext.getContext().secrets.store(this.storageKey, JSON.stringify(sessions));
  }

  async clearAllSessions(): Promise<void> {
    const sessions = await this.sessionsPromise;
    if (sessions.length === 0) {
      return;
    }
    this.logger.info(`GitHubAuthProvider: clearing all ${sessions.length} sessions`);
    const removed = [...sessions];
    await this.storeSessions([]);
    await this.storeDeviceAuthSessionIds([]);
    this.sessionChangeEmitter.fire({ added: [], removed, changed: [] });
  }

  async clearDeviceAuthSessions(): Promise<void> {
    const sessions = await this.sessionsPromise;
    if (sessions.length === 0) {
      return;
    }

    const isDeviceAuth = await this.githubService.isDeviceAuthToken();
    if (!isDeviceAuth) {
      this.logger.info('GitHubAuthProvider: skipping session clearing, existing sessions are from K8s token');
      return;
    }

    try {
      const currentToken = await this.githubService.getToken();
      const kept = sessions.filter(s => s.accessToken !== currentToken);
      const removed = sessions.filter(s => s.accessToken === currentToken);

      if (removed.length > 0) {
        this.logger.info(`GitHubAuthProvider: clearing ${removed.length} device-auth sessions, keeping ${kept.length} K8s sessions`);
        await this.storeSessions(kept);
        const deviceAuthSessionIds = await this.getDeviceAuthSessionIds();

        const removedIds = new Set(removed.map(session => session.id),);

        await this.storeDeviceAuthSessionIds(
          deviceAuthSessionIds.filter(
            id => !removedIds.has(id),
          ),
        );
        
        this.sessionChangeEmitter.fire({ added: [], removed, changed: [] });
      }
    } catch {
      this.logger.warn('GitHubAuthProvider: unable to determine device-auth token, keeping existing sessions');
    }
  }

  async removeSession(id: string) {
    this.logger.info(`GitHubAuthProvider: REMOVE SESSION `);

    const sessions = await this.sessionsPromise;
    const session = sessions.find(s => s.id === id);
    if (session) {
      const updatedSessions = sessions.filter(s => s.id !== id);
      await this.storeSessions(updatedSessions);
      const deviceAuthSessionIds = await this.getDeviceAuthSessionIds();
      if (deviceAuthSessionIds.includes(id)) {
        await this.storeDeviceAuthSessionIds(deviceAuthSessionIds.filter(
          sessionId => sessionId !== id,
        ));
      }
      this.sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });

      this.logger.info(`GitHubAuthProvider: session was removed successfully! `);
    } else {
      this.logger.warn(`GitHubAuthProvider: session for removing not found`);
    }
  }
}
