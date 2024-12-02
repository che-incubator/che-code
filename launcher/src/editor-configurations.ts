/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as k8s from '@kubernetes/client-node';
import * as fs from './fs-extra.js';

const CONFIGMAP_NAME = 'vscode-editor-configurations';
const REMOTE_SETTINGS_PATH = '/checode/remote/data/Machine/settings.json';

const enum EditorConfigs {
  Settings = 'settings.json',
  Extensions = 'extensions.json',
}

export class EditorConfigurations {
  private coreV1API: k8s.CoreV1Api;

  constructor(private readonly workspaceFilePath?: string) {}

  async configure(): Promise<void> {
    console.log('# Checking if editor configurations are provided...');

    try {
      const configmap = await this.getConfigmap();
      if (!configmap || !configmap.data) {
        console.log('  > Editor configurations are not provided');
        return;
      }

      const settingsPromise = this.configureSettings(configmap);
      const extensionsPromise = this.configureExtensions(configmap);

      await Promise.all([settingsPromise, extensionsPromise]);
    } catch (error) {
      console.log(`  > Failed to apply editor configurations ${error}`);
    }
  }

  private async configureSettings(configmap: k8s.V1ConfigMap): Promise<void> {
    const configmapContent = configmap.data![EditorConfigs.Settings];
    if (!configmapContent) {
      console.log(`  > ${EditorConfigs.Settings} is not provided in the ${CONFIGMAP_NAME} configmap`);
      return;
    } else {
      console.log(
        `  > ${EditorConfigs.Settings} is provided in the ${CONFIGMAP_NAME} configmap, trying to apply it...`
      );
    }

    const settingsFromConfigmap = parseJsonFrom(configmapContent);
    if (!settingsFromConfigmap) {
      console.log(
        `    > Can not apply editor configurations: failed to parse ${EditorConfigs.Settings} data from the ${CONFIGMAP_NAME} configmap`
      );
      return;
    }

    let remoteSettingsJson;
    if (await fs.fileExists(REMOTE_SETTINGS_PATH)) {
      console.log(`    > File with settings is found: ${REMOTE_SETTINGS_PATH}`);

      const remoteSettingsContent = await fs.readFile(REMOTE_SETTINGS_PATH);
      remoteSettingsJson = parseJsonFrom(remoteSettingsContent);
    } else {
      console.log(`    > File with settings is not found, creating a new one: ${REMOTE_SETTINGS_PATH}`);
      remoteSettingsJson = {};
    }

    const mergedSettings = { ...remoteSettingsJson, ...settingsFromConfigmap };
    const json = JSON.stringify(mergedSettings, null, '\t');
    await fs.writeFile(REMOTE_SETTINGS_PATH, json);

    console.log(`    > ${EditorConfigs.Settings} configs were applied successfully!`);
  }

  private async configureExtensions(configmap: k8s.V1ConfigMap): Promise<void> {
    const configmapContent = configmap.data![EditorConfigs.Extensions];
    if (!configmapContent) {
      console.log(`  > ${EditorConfigs.Extensions} is not provided in the ${CONFIGMAP_NAME} configmap`);
      return;
    } else {
      console.log(
        `  > ${EditorConfigs.Extensions} is provided in the ${CONFIGMAP_NAME} configmap, trying to apply it...`
      );
    }

    const extensionsFromConfigmap = parseJsonFrom(configmapContent);
    if (!extensionsFromConfigmap) {
      console.log(
        `    > Can not apply editor configurations: failed to parse ${EditorConfigs.Extensions} data from the ${CONFIGMAP_NAME} configmap`
      );
      return;
    }

    if (this.workspaceFilePath && (await fs.fileExists(this.workspaceFilePath))) {
      console.log(`    > File with configs is found: ${this.workspaceFilePath}`);

      const workspaceFileContent = await fs.readFile(this.workspaceFilePath);
      const workspaceConfigData = parseJsonFrom(workspaceFileContent);
      if (!workspaceConfigData) {
        console.log(
          `    > Can not apply configurations for ${EditorConfigs.Extensions}: failed to parse data from the ${this.workspaceFilePath}`
        );
        return;
      }

      const extensionsSection = 'extensions';
      if (!workspaceConfigData[extensionsSection]) {
        console.log('    > Extensions section is absent in the workspace file, creating a new one...');
        workspaceConfigData[extensionsSection] = {};
      }

      workspaceConfigData[extensionsSection] = {
        ...workspaceConfigData[extensionsSection],
        ...extensionsFromConfigmap,
      };

      const json = JSON.stringify(workspaceConfigData, null, '\t');
      await fs.writeFile(this.workspaceFilePath, json);
      console.log(`    > ${EditorConfigs.Extensions} was applied successfully!`);
    } else {
      console.log(`    > Workspace Config File with s is not found: ${this.workspaceFilePath}`);
      // it's not possible to store extensions for the Remote scope,
      // for sinle root mode extensions should come with a project, like: /project/.vscode/extensions.json - Folder scope
      // so, we don't store extensions configs in another place if there is no workspace config file
      //
      return;
    }
  }

  private async getConfigmap(): Promise<k8s.V1ConfigMap | undefined> {
    const coreV1API = this.getCoreApi();
    const namespace = process.env.DEVWORKSPACE_NAMESPACE;
    if (!namespace) {
      console.log(
        '  > Error: Can not get Configmap with editor configurations - DEVWORKSPACE_NAMESPACE env variable is not defined'
      );
      return undefined;
    }

    try {
      const { body } = await coreV1API.readNamespacedConfigMap(CONFIGMAP_NAME, namespace);
      return body;
    } catch (error) {
      console.log(
        `#   > Warning: Can not get Configmap with editor configurations: ${error.message}, status code: ${error?.response?.statusCode}`
      );
      return undefined;
    }
  }

  getCoreApi(): k8s.CoreV1Api {
    if (!this.coreV1API) {
      const k8sConfig = new k8s.KubeConfig();
      k8sConfig.loadFromCluster();
      this.coreV1API = k8sConfig.makeApiClient(k8s.CoreV1Api);
    }
    return this.coreV1API;
  }
}

function parseJsonFrom(content: string): any {
  if (!content) {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error(`  > Error parsing JSON: ${parseError}`);
  }
}
