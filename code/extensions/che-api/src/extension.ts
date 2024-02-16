/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/


/* eslint-disable header/header */
import 'reflect-metadata';

import { Container } from 'inversify';
import * as vscode from 'vscode';
import { Api } from './api/api';
import { DevfileService } from './api/devfile-service';
import { K8SService } from './api/k8s-service';
import { K8sDevfileServiceImpl } from './impl/k8s-devfile-service-impl';
import { K8SServiceImpl } from './impl/k8s-service-impl';
import { K8sDevWorkspaceEnvVariables } from './impl/k8s-devworkspace-env-variables';
import { WorkspaceService } from './api/workspace-service';
import { K8sWorkspaceServiceImpl } from './impl/k8s-workspace-service-impl';
import { GithubService } from './api/github-service';
import { GithubServiceImpl } from './impl/github-service-impl';
import { TelemetryService } from './api/telemetry-service';
import { K8sTelemetryServiceImpl } from './impl/k8s-telemetry-service-impl';
import * as axios from 'axios';
import { Logger } from './logger';


export async function activate(_extensionContext: vscode.ExtensionContext): Promise<Api> {

    const container = new Container();
    container.bind(K8sDevfileServiceImpl).toSelf().inSingletonScope();
    container.bind(DevfileService).to(K8sDevfileServiceImpl).inSingletonScope();
    container.bind(WorkspaceService).to(K8sWorkspaceServiceImpl).inSingletonScope();
    container.bind(K8SServiceImpl).toSelf().inSingletonScope();
    container.bind(K8SService).to(K8SServiceImpl).inSingletonScope();
    container.bind(K8sDevWorkspaceEnvVariables).toSelf().inSingletonScope();
    container.bind(Symbol.for('AxiosInstance')).toConstantValue(axios);
    container.bind(GithubServiceImpl).toSelf().inSingletonScope();
    container.bind(GithubService).to(GithubServiceImpl).inSingletonScope();
    container.bind(TelemetryService).to(K8sTelemetryServiceImpl).inSingletonScope();
    container.bind(Logger).toSelf().inSingletonScope();

    const devfileService = container.get(DevfileService) as DevfileService;
    const workspaceService = container.get(WorkspaceService) as WorkspaceService;
    const githubService = container.get(GithubService) as GithubService;
    const telemetryService = container.get(TelemetryService) as TelemetryService;
    const api: Api = {
        getDevfileService(): DevfileService {
            return devfileService;
        },
        getWorkspaceService(): WorkspaceService {
            return workspaceService;
        },
        getGithubService(): GithubService {
            return githubService;
        },
        getTelemetryService(): TelemetryService {
            return telemetryService;
        },
    };

	const k8sDevWorkspaceEnvVariables = container.get(K8sDevWorkspaceEnvVariables);
	const dashboardUrl = k8sDevWorkspaceEnvVariables.getDashboardURL();
	const workspaceNamespace = k8sDevWorkspaceEnvVariables.getWorkspaceNamespace();
	const workspaceName = k8sDevWorkspaceEnvVariables.getWorkspaceName();
	const projectsRoot = k8sDevWorkspaceEnvVariables.getProjectsRoot();
	
	_extensionContext.environmentVariableCollection.append('DASHBOARD_URL', dashboardUrl);
	_extensionContext.environmentVariableCollection.append('WORKSPACE_NAME', workspaceName);
	_extensionContext.environmentVariableCollection.append('WORKSPACE_NAMESPACE', workspaceNamespace);
	_extensionContext.environmentVariableCollection.append('PROJECTS_ROOT', projectsRoot);

    return api;
}
