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
import * as vscode from 'vscode';
import { ExtensionContext } from './extension-context';
import { GitHubAuthProvider, GithubService } from './github';
import { CHANNEL_NAME, Logger } from './logger';

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

  async trigger(scopes = 'user:email'): Promise<string | undefined> {
    this.logger.info(`Device Authentication is triggered for scopes: ${scopes}`);

    const sessionsToRemove = await this.gitHubAuthProvider.getSessions([scopes]);
    this.logger.info(`Device Authentication: found ${sessionsToRemove.length} existing sessions with scopes: ${scopes}`);

    for (const session of sessionsToRemove) {
      try {
        this.logger.info(`Device Authentication: removing a session with scopes: ${session.scopes}`);

        await this.gitHubAuthProvider.removeSession(session.id);

        this.logger.info(`Device Authentication: session with scopes: ${session.scopes} has been removed successfully`);
      } catch (e) {
        console.warn(e.message);
        this.logger.warn(`Device Authentication: an error happened at removing a session with scopes: ${session.scopes}`);
      }
    }

    const token = await vscode.commands.executeCommand<string>('github-authentication.device-code-flow');
    this.logger.info(`Device Authentication: token for scopes: ${scopes} has been generated successfully`);

    try {
      await this.githubService.persistDeviceAuthToken(token);
      await this.gitHubAuthProvider.createSession([scopes]);
      this.onTokenGenerated(scopes);

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
