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

import { CancellationToken } from 'vs/base/common/cancellation';
import { asJson, IRequestService } from 'vs/platform/request/common/request';
import { IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';

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
	private restartingDevWorkspaceUrl: string | undefined;

	constructor(private requestService: IRequestService, private environmentVariableService: IEnvironmentVariableService) { }

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

	getRestartingWorkspaceUrl(): string {
		if (!this.restartingDevWorkspaceUrl) {
			this.provideWorkspaceUrls();
		}
		return this.restartingDevWorkspaceUrl!;
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
		this.restartingDevWorkspaceUrl = `${dashboardUrl}/dashboard/#/ide/${workspaceNamespace}/${workspaceName}`;
		this.getDevWorkspaceUrl = `${dashboardUrl}/dashboard/api/namespace/${workspaceNamespace}/devworkspaces/${workspaceName}`;
	}

	restartWorkspace(): void {
		const restartingDevWorkspaceUrl = this.getRestartingWorkspaceUrl();
		window.location.href = restartingDevWorkspaceUrl;
	}

	goToDashboard(): void {
		const dashboardUrl = this.getDashboardUrl();
		window.location.href = dashboardUrl;
	}
}
