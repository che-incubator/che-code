/**********************************************************************
 * Copyright (c) 2024-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as k8s from '@kubernetes/client-node';
import * as fs from './fs-extra.js';
import { ProductJSON } from './product-json.js';
import { mergeFirstWithSecond, parseJSON } from './json-utils.js';

const CONFIGMAP_NAME = 'vscode-editor-configurations';
const REMOTE_SETTINGS_PATH = '/checode/remote/data/Machine/settings.json';

const enum EditorConfigs {
  Settings = 'settings.json',
  Extensions = 'extensions.json',
  Product = 'product.json',
}

/**
 * See following documentation for details
 * https://eclipse.dev/che/docs/stable/administration-guide/editor-configurations-for-microsoft-visual-studio-code/
 */

export class EditorConfigurations {
  constructor(private readonly workspaceFilePath?: string) {}

  async configure(): Promise<void> {
    console.log(`# Checking for editor configurations provided by '${CONFIGMAP_NAME}' Config Map...`);

    if (!process.env.DEVWORKSPACE_NAMESPACE) {
      console.log('  > process.env.DEVWORKSPACE_NAMESPACE is not set, skip this step');
      return;
    }

    try {
      const configmap = await this.getConfigmap();
      if (!configmap || !configmap.data) {
        console.log(`  > Config Map ${CONFIGMAP_NAME} is not provided, skip this step`);
        return;
      }

      await this.configureSettings(configmap);
      await this.configureExtensions(configmap);
      await this.configureProductJSON(configmap);
    } catch (error) {
      console.log(`  > Failed to apply editor configurations ${error}`);
    }
  }

  private async configureSettings(configmap: k8s.V1ConfigMap): Promise<void> {
    const configmapContent = configmap.data![EditorConfigs.Settings];
    if (!configmapContent) {
      return;
    }

    console.log('  > Configure editor settings...');

    try {
      const settingsFromConfigmap = parseJSON(configmapContent, {
        errorMessage: 'Configmap content is not valid.',
      });

      let remoteSettingsJson;
      if (await fs.fileExists(REMOTE_SETTINGS_PATH)) {
        console.log(`    > Found setings file: ${REMOTE_SETTINGS_PATH}`);
        const remoteSettingsContent = await fs.readFile(REMOTE_SETTINGS_PATH);
        remoteSettingsJson = parseJSON(remoteSettingsContent, {
          errorMessage: 'Settings.json file is not valid.',
        });
      } else {
        console.log(`    > Creating settings file: ${REMOTE_SETTINGS_PATH}`);
        remoteSettingsJson = {};
      }

      const mergedSettings = { ...remoteSettingsJson, ...settingsFromConfigmap };
      const json = JSON.stringify(mergedSettings, null, '\t');
      await fs.writeFile(REMOTE_SETTINGS_PATH, json);

      console.log('    > Editor settings have been configured.');
    } catch (error) {
      console.log('Failed to configure editor settings.', error);
    }
  }

  private async configureExtensions(configmap: k8s.V1ConfigMap): Promise<void> {
    const configmapContent = configmap.data![EditorConfigs.Extensions];
    if (!configmapContent) {
      console.log(`    > Configmap does not contain ${EditorConfigs.Extensions}. Skip this step.`);
      return;
    }

    console.log('  > Configure workspace extensions...');

    try {
      const parsedConfigmapContent = parseJSON(configmapContent, {
        errorMessage: 'Configmap content is not valid.',
      });

      const configMapExtensions = parsedConfigmapContent?.recommendations;
      if (!Array.isArray(configMapExtensions) || configMapExtensions.length < 1) {
        console.log(
          `    > ${EditorConfigs.Extensions} section of Configmap does not contain recomendations. Skip this step.`
        );
        return;
      } else {
        console.log(
          `    > ${EditorConfigs.Extensions} section of Configmap contains ${configMapExtensions.length} extensions.`
        );
      }

      if (!this.workspaceFilePath) {
        console.log('    > Missing workspace file. Skip this step.');
        return;
      }

      if (!(await fs.fileExists(this.workspaceFilePath))) {
        console.log(`    > Unable to find workspace file: ${this.workspaceFilePath}. Skip this step.`);
        return;
      }

      console.log(`    > Found workspace file: ${this.workspaceFilePath}`);

      const workspaceFileContent = await fs.readFile(this.workspaceFilePath);
      const workspaceConfigData = parseJSON(workspaceFileContent, {
        errorMessage: 'Workspace file is not valid.',
      });

      const workspaceFileExtensions = workspaceConfigData?.extensions?.recommendations || [];
      console.log(`    > Workspace file contains ${workspaceFileExtensions.length} extensions.`);

      const combinedExtensions = Array.from(new Set([...configMapExtensions, ...workspaceFileExtensions]));
      workspaceConfigData.extensions = workspaceConfigData.extensions ?? {};
      workspaceConfigData.extensions.recommendations = combinedExtensions;

      const json = JSON.stringify(workspaceConfigData, null, '\t');
      await fs.writeFile(this.workspaceFilePath, json);
      console.log('    > Workspace extensions have been configured.');
    } catch (error) {
      console.log('Failed to configure workspace extensions.', error);
    }
  }

  private async configureProductJSON(configmap: k8s.V1ConfigMap): Promise<void> {
    const configmapContent = configmap.data![EditorConfigs.Product];
    if (!configmapContent) {
      return;
    }

    console.log('  > Configure product.json ...');

    try {
      const productFromConfigmap = parseJSON(configmapContent, {
        errorMessage: 'Configmap content is not valid.',
      });

      const product = new ProductJSON();
      await product.load();

      mergeFirstWithSecond(productFromConfigmap, product.get());

      await product.save();

      console.log('    > product.json have been configured.');
    } catch (error) {
      console.log(`Failed to configure ${EditorConfigs.Product}.`, error);
    }
  }

  private async getConfigmap(): Promise<k8s.V1ConfigMap | undefined> {
    const k8sConfig = new k8s.KubeConfig();
    k8sConfig.loadFromCluster();
    const coreV1API = k8sConfig.makeApiClient(k8s.CoreV1Api);

    try {
      const { body } = await coreV1API.readNamespacedConfigMap(CONFIGMAP_NAME, process.env.DEVWORKSPACE_NAMESPACE!);
      return body;
    } catch (error) {
      console.log(
        `  > Warning: Can not get Configmap with editor configurations: ${error.message}, status code: ${error?.response?.statusCode}`
      );
      return undefined;
    }
  }
}
