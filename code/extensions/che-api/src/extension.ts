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


export async function activate(_extensionContext: vscode.ExtensionContext): Promise<Api> {

    const container = new Container();
    container.bind(K8sDevfileServiceImpl).toSelf().inSingletonScope();
    container.bind(DevfileService).to(K8sDevfileServiceImpl).inSingletonScope();
    container.bind(K8SServiceImpl).toSelf().inSingletonScope();
    container.bind(K8SService).to(K8SServiceImpl).inSingletonScope();
    container.bind(K8sDevWorkspaceEnvVariables).toSelf().inSingletonScope();

    const devfileService = container.get(DevfileService) as DevfileService;
    const api = {
        getDevfileService(): DevfileService {
            return devfileService;
        }
    };

    return api;
}
