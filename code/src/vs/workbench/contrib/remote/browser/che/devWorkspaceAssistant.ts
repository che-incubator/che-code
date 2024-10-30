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

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { IEnvironmentVariableService } from '../../../terminal/common/environmentVariable.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';

export enum DevWorkspaceStatus {
	FAILED = 'Failed',
	FAILING = 'Failing',
	STARTING = 'Starting',
	TERMINATING = 'Terminating',
	RUNNING = 'Running',
	STOPPED = 'Stopped',
	STOPPING = 'Stopping',
}

export type Status = {
	phase: string,
	message: string
}

export type Metadata = {
	annotations: { [key: string]: string }
}

export type DevWorkspaceLike = {
	status: Status,
	metadata: Metadata
}

export class DevWorkspaceAssistant {
	static STOPPED_BY_ANNOTATION = 'controller.devfile.io/stopped-by';
	static INACTIVITY_REASON = 'inactivity';
	static RUN_TIMEOUT_REASON = 'run-timeout';

	private dashboardUrl: string | undefined;
	private getDevWorkspaceUrl: string | undefined;
	private startingDevWorkspaceUrl: string | undefined;

	constructor(
		private commandService: ICommandService,
		private requestService: IRequestService,
		private environmentVariableService: IEnvironmentVariableService,
		private progressService: IProgressService) {
		CommandsRegistry.registerCommand('che-remote.command.restartWorkspace', () => {
			this.restartWorkspace();
		});
		CommandsRegistry.registerCommand('che-remote.command.stopWorkspaceAndRedirectToDashboard', () => {
			this.stopWorkspaceAndRedirectToDashboard();
		});
	}

	async getDevWorkspace(): Promise<DevWorkspaceLike> {
		const url = this.getWorkspaceUrl();
		const context = await this.requestService.request({
			type: 'get',
			url,
			timeout: 5000
		}, CancellationToken.None);
		const result = await asJson(context);
		return result as DevWorkspaceLike;
	}

	getDashboardUrl(): string {
		if (!this.dashboardUrl) {
			this.provideWorkspaceUrls();
		}
		return this.dashboardUrl!;
	}

	getWorkspaceUrl(): string {
		if (!this.getDevWorkspaceUrl) {
			this.provideWorkspaceUrls();
		}
		return this.getDevWorkspaceUrl!;
	}

	getStartingWorkspaceUrl(): string {
		if (!this.startingDevWorkspaceUrl) {
			this.provideWorkspaceUrls();
		}
		return this.startingDevWorkspaceUrl!;
	}

	private provideWorkspaceUrls(): void {
		const envs = this.environmentVariableService.collections;
		const apiEnvs = envs.get('eclipse-che.api');
		if (!apiEnvs) {
			throw new Error('Che API is not available');
		}

		const dashboardUrl = apiEnvs?.map.get('DASHBOARD_URL')?.value;
		if (!dashboardUrl) {
			throw new Error('Env variable for the Che Dashboard URL is not provided');
		}

		const workspaceNamespace = apiEnvs?.map.get('WORKSPACE_NAMESPACE')?.value;
		if (!workspaceNamespace) {
			throw new Error('Env variable for the Che workspace namespace is not provided');
		}

		const workspaceName = apiEnvs?.map.get('WORKSPACE_NAME')?.value;
		if (!workspaceName) {
			throw new Error('Env variable for the Che workspace name is not provided');
		}

		this.dashboardUrl = dashboardUrl;
		this.startingDevWorkspaceUrl = `${dashboardUrl}/dashboard/#/ide/${workspaceNamespace}/${workspaceName}`;
		this.getDevWorkspaceUrl = `${dashboardUrl}/dashboard/api/namespace/${workspaceNamespace}/devworkspaces/${workspaceName}`;
	}

	async restartWorkspace(): Promise<void> {
		await this.commandService.executeCommand('che-remote.command.stopWorkspace');

		this.progressService.withProgress(
			{
				location: ProgressLocation.Dialog,
				buttons: ['Reload Now'],
				detail: 'Your workspace will be restarted soon',
				title: 'Workspace is restarting...',
				sticky: true
			},
			() => new Promise(() => {}),
			() => this.startWorkspace()
		);

		setInterval(async () => {
			try {
				const result = await this.getDevWorkspace();
				if (DevWorkspaceStatus.STOPPED === result.status.phase) {
					this.startWorkspace();
				}

			} catch (e) {
				console.error(e);
			}
		}, 2000);
	}

	async stopWorkspaceAndRedirectToDashboard(): Promise<void> {
		await this.commandService.executeCommand('che-remote.command.stopWorkspace');
		this.goToDashboard();
	}

	startWorkspace(): void {
		const startingDevWorkspaceUrl = this.getStartingWorkspaceUrl();
		window.location.href = startingDevWorkspaceUrl;
	}

	goToDashboard(): void {
		const dashboardUrl = this.getDashboardUrl();
		window.location.href = dashboardUrl;
	}
}
