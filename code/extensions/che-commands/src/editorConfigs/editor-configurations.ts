/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as k8s from '@kubernetes/client-node';
import * as vscode from 'vscode';
import { InstallFromVSIX } from './install-from-vsix';

const CONFIGS_SECTION = 'configurations.json';
const CONFIGMAP_NAME = 'vscode-editor-configurations';

export interface EditorConfigurations {
    [key: string]: any;
}

export class EditorConfigurations {
    constructor(private outputChannel: vscode.OutputChannel) { }

    async initialize(): Promise<void> {
        try {
            const configs = await this.getConfigurations();
            if (!configs) {
                this.outputChannel.appendLine(`[EditorConfigsHandler] configurations not found`);
                return;
            }
            await new InstallFromVSIX(this.outputChannel).apply(configs);
        } catch (error) {
            this.outputChannel.appendLine(`[EditorConfigsHandler] Failed to apply editor configurations ${error}`);
        }
    }

    private async getConfigurations(): Promise<EditorConfigurations | undefined> {
        if (!process.env.DEVWORKSPACE_NAMESPACE) {
            this.outputChannel.appendLine('[EditorConfigsHandler] process.env.DEVWORKSPACE_NAMESPACE is not set, EditorConfigsHandler skips editor configurations');
            return undefined;
        }

        this.outputChannel.appendLine(`[EditorConfigsHandler] Looking for editor configurations in the '${CONFIGMAP_NAME}' Config Map...`);

        const configmap = await this.getConfigmap();
        if (!configmap || !configmap.data) {
            this.outputChannel.appendLine(`[EditorConfigsHandler] Config Map ${CONFIGMAP_NAME} is not provided`);
            return undefined;
        }

        const configsContent = configmap.data[CONFIGS_SECTION];
        if (!configsContent) {
            this.outputChannel.appendLine(`[EditorConfigsHandler] ${CONFIGS_SECTION} section is absent in the Config Map ${CONFIGMAP_NAME}`);
            return undefined;
        }

        try {
            return JSON.parse(configsContent);
        } catch (error) {
            this.outputChannel.appendLine(`[EditorConfigsHandler] ConfigMap content is not valid ${error}`);
            return undefined;
        }
    }

    private async getConfigmap(): Promise<k8s.V1ConfigMap | undefined> {
        try {
            const k8sConfig = new k8s.KubeConfig();
            k8sConfig.loadFromCluster();
            const coreV1API = k8sConfig.makeApiClient(k8s.CoreV1Api);

            const body = await coreV1API.readNamespacedConfigMap({
                name: CONFIGMAP_NAME,
                namespace: process.env.DEVWORKSPACE_NAMESPACE!,
            });
            return body;
        } catch (error) {
            this.outputChannel.appendLine(`[EditorConfigsHandler] Can not get Configmap with editor configurations: ${error.message},
                 status code: ${error?.response?.statusCode}`);
            return undefined;
        }
    }
}
