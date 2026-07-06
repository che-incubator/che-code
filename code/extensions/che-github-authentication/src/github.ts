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

  constructor(
    @inject(Logger) private logger: Logger,
    @inject(ErrorHandler) private errorHandler: ErrorHandler,
    @inject(ExtensionContext) private extensionContext: ExtensionContext,
    @inject(Symbol.for('GithubServiceInstance')) private githubService: GithubService
  ) {
    const workspaceId = process.env.DEVWORKSPACE_ID || 'default';
    this.storageKey = `sessions:${workspaceId}`;
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
          this.sessionChangeEmitter.fire({ added: [], removed, changed: [] });
          sessions = [];
        } else {
          this.logger.warn(`GitHubAuthProvider: session validation skipped: ${(error as Error).message}`);
          return;
        }
      }
    }

    try {
      const token = await this.githubService.getToken();
      await this.doHydrateWithToken(token);
      return;
    } catch {
      this.logger.info('GitHubAuthProvider: no token available after initialization');
    }

    this.doHydrate().catch(err =>
      this.logger.error(`GitHubAuthProvider: background hydration failed: ${(err as Error).message}`)
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

  private async doHydrate(): Promise<void> {
    const token = await this.waitForToken(30000, 500);
    if (!token) {
      this.logger.warn('GitHubAuthProvider: hydrate failed, token not available after 30s');
      return;
    }
    await this.doHydrateWithToken(token);
  }

  private async doHydrateWithToken(token: string): Promise<void> {
    try {
      const tokenScopes = await this.githubService.getTokenScopes(token);
      if (tokenScopes.length === 0) {
        this.logger.info('GitHubAuthProvider: hydrate skipped, token has no scopes');
        return;
      }

      const githubUser = await this.githubService.getUser();
      const matchingBundles = getMatchingHydrationScopeBundles(tokenScopes);
      if (matchingBundles.length === 0) {
        this.logger.info('GitHubAuthProvider: hydrate skipped, token scopes match no known bundle');
        return;
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
    } catch (error) {
      if (isUnauthorizedError(error)) {
        this.logger.warn('GitHubAuthProvider: hydrate failed, token is not valid');
      } else {
        this.logger.warn(`GitHubAuthProvider: hydrate failed: ${(error as Error).message}`);
      }
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
      this.sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });

      this.logger.info(`GitHubAuthProvider: session was removed successfully! `);
    } else {
      this.logger.warn(`GitHubAuthProvider: session for removing not found`);
    }
  }
}
