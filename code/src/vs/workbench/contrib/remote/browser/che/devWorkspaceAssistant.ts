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
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
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
	annotations: { [key: string]: string },
	resourceVersion?: string;

}

export type DevWorkspaceLike = {
	status: Status,
	metadata: Metadata
}

export class DevWorkspaceAssistant {
	static STOPPED_BY_ANNOTATION = 'controller.devfile.io/stopped-by';
	static INACTIVITY_REASON = 'inactivity';
	static RUN_TIMEOUT_REASON = 'run-timeout';

	private static readonly POLL_INTERVAL_MS = 2000;
	private static readonly STOP_TIMEOUT_MS = 10000;

	// Maximum time to wait for a workspace decision.
	private static readonly STATUS_CHECK_TIMEOUT_MS = 60000;

	/**
	 * Tracks the intentional workspace lifecycle action in progress:
	 * - 'idle': no action, disconnection handler shows normal dialogs
	 * - 'restartPending': devfile update is about to happen; if extension host dies, redirect to dashboard
	 * - 'stopping': doRestart/stopWorkspace is running on browser side, handler should not interfere
	 */
	private _pendingAction: 'idle' | 'restartPending' | 'stopping' = 'idle';
	private dashboardUrl: string | undefined;
	private getDevWorkspaceUrl: string | undefined;
	private startingDevWorkspaceUrl: string | undefined;

	constructor(
		private requestService: IRequestService,
		private environmentVariableService: IEnvironmentVariableService,
		private progressService: IProgressService) {
		CommandsRegistry.registerCommand('che-remote.command.restartWorkspace', () => {
			console.log('[CRW-12719] Restarting workspace called from extension host...');
			this.restartWorkspace();
		});
		CommandsRegistry.registerCommand('che-remote.command.stopWorkspaceAndRedirectToDashboard', () => {
			this.stopWorkspaceAndRedirectToDashboard();
		});
		CommandsRegistry.registerCommand('che-remote.command.prepareForRestart', () => {
			console.log('[CRW-12719] Preparing for workspace restart called from extension host...');
			this._pendingAction = 'restartPending';
		});
		CommandsRegistry.registerCommand('che-remote.command.cancelRestart', () => {
			console.log('[CRW-12719] Canceling workspace restart called from extension host...');
			this._pendingAction = 'idle';
		});
	}

	async getDevWorkspace(timeoutMs = 5000): Promise<DevWorkspaceLike> {
		const url = this.getWorkspaceUrl();
		const context = await this.requestService.request({
			type: 'get',
			url,
			timeout: timeoutMs,
			callSite: 'che-remote.devWorkspaceAssistant',
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

	/**
	 * Stop the workspace via the Dashboard PATCH API.
	 * This runs entirely on the browser side, so it works even after the
	 * extension host (remote server) has died.
	 */
	private async stopWorkspaceViaDashboardApi(): Promise<void> {
		const url = this.getWorkspaceUrl();
		const patch = JSON.stringify([{ op: 'replace', path: '/spec/started', value: false }]);

		const context = await this.requestService.request({
			type: 'PATCH',
			url,
			data: patch,
			headers: { 'Content-Type': 'application/json' },
			timeout: 10000,
			callSite: 'che-remote.devWorkspaceAssistant.stop',
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode >= 400) {
			throw new Error(`Failed to stop workspace: HTTP ${context.res.statusCode}`);
		}
	}

	/**
	 * Poll the Dashboard API until the workspace reaches STOPPED (or FAILED) status.
	 * Resolves on timeout so the redirect to Dashboard can still proceed.
	 */
	private async waitForStopped(): Promise<void> {
		const deadline = Date.now() + DevWorkspaceAssistant.STOP_TIMEOUT_MS;

		while (Date.now() < deadline) {
			const result = await this.getDevWorkspace();
			const phase = result.status?.phase;

			if (phase === DevWorkspaceStatus.STOPPED) {
				return;
			}

			if (phase === DevWorkspaceStatus.FAILED || phase === DevWorkspaceStatus.FAILING) {
				throw new Error(`Workspace entered ${phase} state: ${result.status?.message}`);
			}

			await new Promise(resolve =>
				setTimeout(resolve, DevWorkspaceAssistant.POLL_INTERVAL_MS)
			);
		}

		throw new Error('Timed out waiting for workspace to stop.');
	}

	async restartWorkspace(): Promise<void> {
		this.progressService.withProgress(
			{
				location: ProgressLocation.Dialog,
				buttons: ['Reload Now'],
				detail: 'Your workspace will be restarted soon',
				title: 'Workspace is restarting...',
				sticky: true
			},
			() => this.doRestart(),
			() => this.startWorkspace()
		);
	}

	get pendingAction(): 'idle' | 'restartPending' | 'stopping' {
		return this._pendingAction;
	}

	private async doRestart(): Promise<void> {
		this._pendingAction = 'stopping';
		try {
			await this.stopWorkspaceViaDashboardApi();
			await this.waitForStopped();
			this.startWorkspace();
		} catch (e) {
			this._pendingAction = 'idle';
			throw e;
		}
	}

	async stopWorkspaceAndRedirectToDashboard(): Promise<void> {
		this._pendingAction = 'stopping';
		try {
			await this.stopWorkspaceViaDashboardApi();
			this.goToDashboard();
		} catch (e) {
			this._pendingAction = 'idle';
			throw e;
		}
	}

	startWorkspace(): void {
		const startingDevWorkspaceUrl = this.getStartingWorkspaceUrl();
		window.location.href = startingDevWorkspaceUrl;
	}

	goToDashboard(): void {
		const dashboardUrl = this.getDashboardUrl();
		window.location.href = dashboardUrl;
	}

	/**
	 * Wait until the workspace reaches a decision phase.
	 *
	 * Maximum wait: 30 seconds.
	 * Check interval: 2 seconds.
	 *
	 * Returns immediately when RUNNING, STOPPED or FAILED
	 * is observed. Throws when the maximum wait is exceeded.
	 */
	async waitForWorkspaceDecision(): Promise<DevWorkspaceLike> {
		const deadline = Date.now() + DevWorkspaceAssistant.STATUS_CHECK_TIMEOUT_MS;

		while (true) {
			const remainingTime = deadline - Date.now();

			if (remainingTime <= 0) {
				throw new Error('Timed out waiting for workspace status.');
        	}

			try {
				const workspace = await this.getDevWorkspace(Math.min(5000, remainingTime));
				const phase = workspace?.status?.phase;

				console.log(`[CRW-12719] Workspace phase: ${phase}`);

				switch (phase) {
					case DevWorkspaceStatus.RUNNING:
					case DevWorkspaceStatus.STOPPED:
					case DevWorkspaceStatus.FAILED:
						return workspace;

					case DevWorkspaceStatus.STARTING:
					case DevWorkspaceStatus.FAILING:
					case DevWorkspaceStatus.STOPPING:
					case DevWorkspaceStatus.TERMINATING:
						// Continue observing transitional phases.
						break;

					default:
						console.warn(`[CRW-12719] Unknown workspace phase: ${phase}`);
						break;
					}

			} catch (error) {
				console.warn(
					'[CRW-12719] Unable to retrieve workspace status. Retrying.',
					error
				);
			}

			const nextDelay = Math.min(DevWorkspaceAssistant.POLL_INTERVAL_MS,deadline - Date.now());

			if (nextDelay > 0) {
				await new Promise(resolve => setTimeout(resolve, nextDelay));
			}
		}
	}
}
