/**********************************************************************
 * Copyright (c) 2024-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from './fs-extra.js';
import { ProductJSON } from './product-json.js';
import { mergeFirstWithSecond, parseJSON } from './json-utils.js';

const REMOTE_SETTINGS_PATH = '/checode/remote/data/Machine/settings.json';

// Must match CHE_CONFIG_KEYBINDINGS_PATH in code/src/vs/server/node/che/webClientServer.ts;
// the launcher is a separate project and cannot import it from there.
const CHECODE_CONFIG_KEYBINDINGS_PATH = '/checode-config/keybindings.json';

const enum EditorConfigs {
  Settings = 'settings.json',
  Extensions = 'extensions.json',
  Product = 'product.json',
  Keybindings = 'keybindings.json',
}

/**
 * See following documentation for details
 * https://eclipse.dev/che/docs/stable/administration-guide/editor-configurations-for-microsoft-visual-studio-code/
 */

export class EditorConfigurations {
  constructor(private readonly workspaceFilePath?: string, private readonly configmapData?: Record<string, string>) {}

  async configure(): Promise<void> {
    if (!this.configmapData) {
      return;
    }

    try {
      await this.configureSettings();
      await this.configureExtensions();
      await this.configureProductJSON();
      await this.checkKeybindingsMount();
    } catch (error) {
      console.log(`  > Failed to apply editor configurations ${error}`);
    }
  }

  private async configureSettings(): Promise<void> {
    const configmapContent = this.configmapData![EditorConfigs.Settings];
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

  private async configureExtensions(): Promise<void> {
    const configmapContent = this.configmapData![EditorConfigs.Extensions];
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

  private async configureProductJSON(): Promise<void> {
    const configmapContent = this.configmapData![EditorConfigs.Product];
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

  /**
   * Unlike the other keys of the ConfigMap, 'keybindings.json' is read by the editor
   * from the ConfigMap mounted into the workspace, not through the Kubernetes API.
   * Diagnostics only: never writes, and a failure here cannot skip the configuration
   * steps above (this method is called last).
   */
  private async checkKeybindingsMount(): Promise<void> {
    const configmapContent = this.configmapData![EditorConfigs.Keybindings];
    if (!configmapContent) {
      return;
    }

    try {
      if (await fs.fileExists(CHECODE_CONFIG_KEYBINDINGS_PATH)) {
        return;
      }

      console.log(
        `  > Warning: '${EditorConfigs.Keybindings}' is set in the 'vscode-editor-configurations' ConfigMap, but ${CHECODE_CONFIG_KEYBINDINGS_PATH} is not mounted, so the keybindings will not be applied. Mount the ConfigMap at /checode-config (annotations controller.devfile.io/mount-as: subpath, controller.devfile.io/mount-path: /checode-config).`
      );
    } catch (error) {
      console.log(`Failed to check the '${EditorConfigs.Keybindings}' mount.`, error);
    }
  }
}
