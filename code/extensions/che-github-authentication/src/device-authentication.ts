/**********************************************************************
 * Copyright (c) 2023-2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';
import { ExtensionContext } from './extension-context';
import { GitHubAuthProvider, GithubService } from './github';
import { CHANNEL_NAME, Logger } from './logger';
import { DEVICE_AUTH_SCOPES } from './utils';

@injectable()
export class DeviceAuthentication {
  constructor(
    @inject(Logger) private logger: Logger,
    @inject(ExtensionContext) private extensionContext: ExtensionContext,
    @inject(GitHubAuthProvider) private gitHubAuthProvider: GitHubAuthProvider,
    @inject(Symbol.for('GithubServiceInstance')) private githubService: GithubService
  ) {
    this.extensionContext.getContext().subscriptions.push(
      vscode.commands.registerCommand('github-authentication.device-code-flow.authentication', async () => this.trigger()),
    );
    this.logger.info('Device Authentication command has been registered');

    this.extensionContext.getContext().subscriptions.push(
      vscode.commands.registerCommand('github-authentication.device-code-flow.remove-token', async () => this.removeDeviceAuthToken()),
    );
    this.logger.info('Remove Device Authentication Token command has been registered');
  }

  async runInteractiveFlow(scopes: string[]): Promise<string> {
    const sortedScopes = [...scopes].sort();
    const scopeString = sortedScopes.join(' ');
    this.logger.info(`Device Authentication: running interactive flow for scopes: ${scopeString}`);

    const token = await vscode.commands.executeCommand<string>('github-authentication.device-code-flow', scopeString);
    if (!token) {
      throw new Error('Device authentication was cancelled or failed');
    }

    this.logger.info(`Device Authentication: token for scopes: ${scopeString} has been generated successfully`);

    await this.gitHubAuthProvider.clearDeviceAuthSessions();

    this.githubService.persistDeviceAuthToken(token);
    return token;
  }

  async trigger(): Promise<string | undefined> {
    const scopes = [...DEVICE_AUTH_SCOPES];
    this.logger.info(`Device Authentication is triggered for scopes: ${scopes.join(' ')}`);

    try {
      const token = await this.runInteractiveFlow(scopes);
      await this.gitHubAuthProvider.createSession(scopes);
      this.onTokenGenerated(scopes.join(' '));

      return token;
    } catch (error) {
      const message = 'An error has occurred at the Device Authentication flow';

      this.logger.error(`${message}: ${error.message}`);
      vscode.window.showErrorMessage(`${message}, details are available in the ${CHANNEL_NAME} output channel.`);

      return undefined;
    }
  }

  async removeDeviceAuthToken(): Promise<void> {
    try {
      await this.gitHubAuthProvider.clearDeviceAuthSessions();
      await this.githubService.removeDeviceAuthToken();
      const message = 'The token was deleted successfully. Some operations may require Github Sign Out => Sign In to use another token.'
      vscode.window.showInformationMessage(message);
    } catch (error) {
      const message = `Can not remove Device Authentication token: ${error.message}`;
      vscode.window.showErrorMessage(message);
    }
  }

  private async onTokenGenerated(scopes: string): Promise<void> {
    const message = `A new session has been created for ${scopes} scopes. Please reload window to apply it.`
    const reloadNow = vscode.l10n.t('Reload Now');
    const action = await vscode.window.showInformationMessage(message, reloadNow);
    if (action === reloadNow) {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}
