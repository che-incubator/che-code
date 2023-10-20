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
import { Logger } from './logger';

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
	}

	async trigger(scopes = 'user:email'): Promise<string> {
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

		await this.githubService.updateCachedToken(token);
		await this.gitHubAuthProvider.createSession([scopes]);

		this.onTokenGenerated(token, scopes);
		return token;
	}

	private async onTokenGenerated(token: string, scopes: string): Promise<void> {
		const githubTokenSecretExists = await this.githubService.githubTokenSecretExists();
		if (githubTokenSecretExists) {
			this.githubService.persistToken(token);

			const message = `A new session has been created for ${scopes} scopes. Please reload window to apply it.`
			const reloadNow = vscode.l10n.t('Reload Now');
			const action = await vscode.window.showInformationMessage(message, reloadNow);
			if (action === reloadNow) {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		} else {
			const message = 'A new token was generated successfully. The workspace restarting is required to store the token to the git-credentials secret.'
			const restartWorkspace = vscode.l10n.t('Restart Workspace');
			const action = await vscode.window.showInformationMessage(message, restartWorkspace);
			
			if (action === restartWorkspace) {
				await this.githubService.persistToken(token);
				vscode.commands.executeCommand('che-remote.command.restartWorkspace');
			}
		}
	}
}
