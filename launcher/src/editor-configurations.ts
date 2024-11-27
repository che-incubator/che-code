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

const CONFIGMAP_NAME = 'editor-configurations';

enum EditorConfigs {
  Settings = 'settings',
  Extensions = 'extensions',
}

export class EditorConfigurations {
  private coreV1API: k8s.CoreV1Api;

  constructor(private readonly workspaceFile: string) {}

  async configure(): Promise<void> {
    console.log('# Checking if editor configurations are provided...');

    const configmap = await this.getConfigmap();
    if (!configmap || !configmap.data) {
      console.log('  > Editor configurations are not provided');
      return;
    }

    console.log('  > Editor configurations are provided, trying to apply them...');

    const workspaceFileContent = await fs.readFile(this.workspaceFile);
    const existingData = parseJsonFrom(workspaceFileContent);
    if (!existingData) {
      console.log(`  > Can not apply editor configurations: failed to parse data from the ${this.workspaceFile}`);
      return;
    }

    let isDataSavingRequired: boolean = false;
    for (const config of Object.values(EditorConfigs)) {
      isDataSavingRequired = this.configureSection(config, configmap, existingData) || isDataSavingRequired;
    }

    if (isDataSavingRequired) {
      fs.writeFile(this.workspaceFile, JSON.stringify(existingData, null, '\t'));
      console.log('  > Editor configurations were applied successfully');
    }
  }

  /**
   * Adds configs from the given `configmap` to the `existingData` object.
   * @returns `true`, if the `existingData` object was updated
   */

  private configureSection(section: EditorConfigs, configmap: k8s.V1ConfigMap, existingData: any): boolean {
    const configmapContent = configmap.data![section];
    if (!configmapContent) {
      console.log(`  > Configurations for the ${section} are not provided`);
      return false;
    }

    const configsFromConfigmap = parseJsonFrom(configmapContent);
    if (!configsFromConfigmap) {
      console.log(
        `  > Can not apply editor configurations: failed to parse ${section} data from the configmap with ${CONFIGMAP_NAME} name`
      );
      return false;
    }

    if (!existingData[section]) {
      console.log('  > Settings section is absent in the workspace file, creating a new one...');
      existingData[section] = {};
    }
    existingData[section] = { ...existingData[section], ...configsFromConfigmap };
    return true;
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
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error(`  > Error parsing JSON: ${parseError}`);
  }
}
