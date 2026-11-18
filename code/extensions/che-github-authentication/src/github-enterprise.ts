/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';

/**
 * Eclipse Che authenticates against GitHub.com through the Che server and does not
 * support GitHub Enterprise instances.
 *
 * The `github-enterprise` provider is still registered, without any sessions, so that
 * consumers probing it during activation do not wait for a provider that never registers.
 * The GitHub Pull Requests extension, for example, queries this provider first and its
 * activation fails with a timeout when the provider is missing.
 */
export class GitHubEnterpriseAuthProvider implements vscode.AuthenticationProvider {
  private readonly sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  get onDidChangeSessions(): vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> {
    return this.sessionChangeEmitter.event;
  }

  async getSessions(_sessionScopes?: string[]): Promise<vscode.AuthenticationSession[]> {
    return [];
  }

  async createSession(_scopes: string[]): Promise<vscode.AuthenticationSession> {
    throw new Error('GitHub Enterprise is not supported in Eclipse Che');
  }

  async removeSession(_sessionId: string): Promise<void> {
    // sessions are never created, so there is nothing to remove
  }
}
