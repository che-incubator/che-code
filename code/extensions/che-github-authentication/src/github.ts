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
import { ErrorHandler } from './error-handler';
import { ExtensionContext } from './extension-context';
import { Logger } from './logger';

export interface GithubUser {
  login: string;
  id: number;
  name: string;
  email: string;
}

export interface GithubService {
  getToken(): Promise<string>;
  persistDeviceAuthToken(token: string, scopes: string[]): Promise<void>;
  removeDeviceAuthToken(): Promise<void>;
  getUser(): Promise<GithubUser>;
  getTokenScopes(token: string): Promise<string[]>;
}

@injectable()
export class GitHubAuthProvider implements vscode.AuthenticationProvider {
  private readonly sessions: vscode.AuthenticationSession[];
  private readonly sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  get onDidChangeSessions() {
    return this.sessionChangeEmitter.event;
  }

  constructor(
    @inject(Logger) private logger: Logger,
    @inject(ErrorHandler) private errorHandler: ErrorHandler,
    @inject(ExtensionContext) private extensionContext: ExtensionContext,
    @inject(Symbol.for('GithubServiceInstance')) private githubService: GithubService
  ) {
    this.sessions = this.extensionContext.getContext().workspaceState.get('sessions') || [];

    console.log('GitHubAuthProvider :: constructor :: list f sessions -------------------------------------');
    for (const s of this.sessions) {
      console.log(`>>> session [${s.id}] account [${s.account}] token [${s.accessToken}] scopes [${s.scopes}]`);
    }
    console.log('------------------------------------------------------------------------------------------');
    console.log();
    console.log();
    console.log();
  }

  async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    this.logger.info(`GitHubAuthProvider: GET SESSIONS for scopes: ${scopes}`);
    // console.log(new Error().stack);
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');

    console.log(`> GitHubAuthProvider :: getSessions for scopes [${scopes}]`);

    const match = function (sessionScopes: string[], matchScopes: string[]): boolean {
      for (const s of matchScopes) {
        if (!sessionScopes.includes(s)) {
          return false;
        }
      }
      return true;
    };

    const filteredSessions = (scopes && scopes.length)
      ? this.sessions.filter(session => match([...session.scopes], scopes!))
      : this.sessions;

    for (const session of filteredSessions) {
      try {
        await this.githubService.getTokenScopes(session.accessToken);
        // do we need to check the scopes here?
      } catch (e) {
        filteredSessions.splice(this.sessions.findIndex(s => s.id === session.id), 1);
        this.logger.info(`GitHubAuthProvider: GET sessions - removing one session for scopes: ${scopes}`);
        console.warn(e.message);
      }
    }
    this.logger.info(`GitHubAuthProvider: GET sessions - found ${filteredSessions.length} sessions for scopes: ${scopes}`);
    
    console.log(`> GitHubAuthProvider: GET sessions - found ${filteredSessions.length} sessions for scopes: ${scopes}`);

    for (const s of filteredSessions) {
      console.log(`> session [${s.id}] token [${s.accessToken}] account [${JSON.stringify(s.account)}] scopes [${s.scopes}]`);
    }

    return filteredSessions;
  }

  async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
    this.logger.info(`GitHubAuthProvider: CREATE SESSION for scopes: ${JSON.stringify(scopes)}`);
    
    console.log(`>> GitHubAuthProvider: CREATE SESSION for scopes: ${JSON.stringify(scopes)}`);
    console.log(`>> GitHubAuthProvider: CREATE SESSION for scopes: ${scopes.toString()}`);
    console.log(`>> GitHubAuthProvider: scopes length ${scopes.length}`);

    let token = '';
    try {
      token = await this.githubService.getToken();
    } catch (error) {
      this.logger.error(`GitHubAuthProvider: an error happened at session creation (get token step): ${error.message}`);

      this.errorHandler.onUnauthorizedError();

      throw new Error(error.message);
    }

    let githubUser;
    try {
      githubUser = await this.githubService.getUser();
    } catch (error) {
      this.logger.error(`GitHubAuthProvider: an error happened at session creation (get user step): ${error.message}`);

      if (error && error.response && error.response.status === 401) {
        this.errorHandler.onUnauthorizedError();
      }
      throw new Error(error.message);
    }

    const session = {
      id: v4(),
      accessToken: token,
      account: { label: githubUser.login, id: githubUser.id.toString() },
      scopes,
    };

    const sessionIndex = this.sessions.findIndex(s => s.id === session.id);
    if (sessionIndex > -1) {
      this.sessions.splice(sessionIndex, 1, session);
    } else {
      this.sessions.push(session);
    }

    this.extensionContext.getContext().workspaceState.update('sessions', this.sessions);
    this.sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

    this.logger.info(`GitHubAuthProvider: session was created successfully for scopes: ${JSON.stringify(scopes)}`);
    return session;
  }

  async removeSession(id: string) {
    this.logger.info(`GitHubAuthProvider: REMOVE SESSION `);

    const session = this.sessions.find(s => s.id === id);
    if (session) {
      this.sessions.splice(this.sessions.findIndex(s => s.id === id), 1);
      this.extensionContext.getContext().workspaceState.update('sessions', this.sessions);
      this.sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });

      this.logger.info(`GitHubAuthProvider: session was removed successfully! `);
    } else {
      this.logger.warn(`GitHubAuthProvider: session for removing not found`);
    }
  }
}
