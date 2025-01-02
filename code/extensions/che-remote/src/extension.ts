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

// local import to find the correct type
import { Main as DevWorkspaceGenerator } from '@eclipse-che/che-devworkspace-generator/lib/main';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { axiosInstance } from './axios-certificate-authority';
import * as path from 'path';
import { DevfileContext } from '@eclipse-che/che-devworkspace-generator/lib/api/devfile-context';
import * as jsYaml from 'js-yaml';

import { V1alpha2DevWorkspaceSpecTemplateProjects } from '@devfile/api';

const DEVFILE_NAMES = ['.devfile.yaml', 'devfile.yaml'];
const EDITOR_CONTENT_STUB: string = `
schemaVersion: 2.2.0
metadata:
  name: che-code
  `;

export async function activate(context: vscode.ExtensionContext): Promise<void> {

  // open documentation
  context.subscriptions.push(
    vscode.commands.registerCommand('che-remote.command.openDocumentation', () => {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://eclipse.org/che/docs/'));
    })
  );

  // add dashboard command only if env variable is set
  const dashboardUrl = process.env.CHE_DASHBOARD_URL;
  if (dashboardUrl) {
    // enable command
    vscode.commands.executeCommand('setContext', 'che-remote.dashboard-enabled', true);
    context.subscriptions.push(
      vscode.commands.registerCommand('che-remote.command.openDashboard', () => {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(dashboardUrl));
      })
    );
  }

  // add command only if Che Code is running on OpenShift
  const clusterConsoleUrl = process.env.CLUSTER_CONSOLE_URL;
  const clusterConsoleTitle = process.env.CLUSTER_CONSOLE_TITLE || '';
  if (clusterConsoleUrl && clusterConsoleTitle.includes('OpenShift')) {
    // enable command
    vscode.commands.executeCommand('setContext', 'che-remote.openshift-console-enabled', true);
    context.subscriptions.push(
      vscode.commands.registerCommand('che-remote.command.openOpenShiftConsole', () => {
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(clusterConsoleUrl));
      })
    );
  }

  const extensionApi = vscode.extensions.getExtension('eclipse-che.api');
  if (extensionApi) {
    await extensionApi.activate();
    const cheApi: any = extensionApi?.exports;
    const workspaceService = cheApi.getWorkspaceService();

    vscode.commands.executeCommand('setContext', 'che-remote.workspace-enabled', true);
    context.subscriptions.push(
      vscode.commands.registerCommand('che-remote.command.stopWorkspace', async () => {
        await workspaceService.stop();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('che-remote.command.restartFromLocalDevfile', async () => {
        try {
          const updated = await updateDevfile(cheApi);
          if (!updated) {
            return;
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update Devfile. ${error}`);
          return;
        }

        try {
          await vscode.commands.executeCommand('che-remote.command.restartWorkspace');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to restart the workpace: ${error}`);
        }
      })
    );
  }
}

export function deactivate(): void {

}

async function isFile(filePath: string): Promise<boolean> {
  try {
    if (await fs.pathExists(filePath)) {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return stat.type === vscode.FileType.File;
    }
  } catch (error) {
    console.error(error);
  }

  return false;
}

async function selectDevfile(): Promise<string | undefined> {
  const devfileItems: vscode.QuickPickItem[] = [];

  const projects = await fs.readdir(process.env.PROJECTS_ROOT as string);
  for (const project of projects) {
    for (const devfileName of DEVFILE_NAMES) {
      const devfilePath = path.join(process.env.PROJECTS_ROOT!, project, devfileName);
      if (await isFile(devfilePath)) {
        devfileItems.push({
          label: devfilePath,
          detail: project
        });
        break;
      }
    }
  }

  devfileItems.push({
    kind: vscode.QuickPickItemKind.Separator,
    label: 'alternative'
  });

  devfileItems.push({
    label: `${process.env.PROJECTS_ROOT!}/*`,
    detail: 'Select a Devfile with a different name'
  });

  const devfileItem = await vscode.window.showQuickPick(devfileItems, {
    title: 'Select a Devfile to be applied to the current workspace',
  });

  if (devfileItem) {
    return devfileItem.label;
  }

  return undefined;
}

async function updateDevfile(cheApi: any): Promise<boolean> {
  const devfileService: {
    get(): Promise<any>;
    getRaw(): Promise<string>;
    updateDevfile(devfile: any): Promise<void>;
  } = cheApi.getDevfileService();
  const devWorkspaceGenerator = new DevWorkspaceGenerator();

  let devfilePath = await selectDevfile();
  if (`${process.env.PROJECTS_ROOT!}/*` === devfilePath) {
    const uri = await vscode.window.showOpenDialog({
      canSelectFolders: false
    });
    if (uri && uri.length) {
      devfilePath = uri[0].path;
    } else {
      return false;
    }
  }

  if (!devfilePath) {
    return false;
  }

  const action = await vscode.window.showInformationMessage(
    'Workspace restart', {
      modal: true, detail: `Your workspace will be restarted from ${devfilePath}. This action is not revertable.`
    }, 'Restart');
  if ('Restart' !== action) {
    return false;
  }

  const pluginRegistryUrl = process.env.CHE_PLUGIN_REGISTRY_INTERNAL_URL;
  console.info(`Using ${pluginRegistryUrl} to generate new Devfile Context`);

  let devfileContext: DevfileContext | undefined = undefined;
  try {
    devfileContext = await devWorkspaceGenerator.generateDevfileContext(
      {
        devfilePath,
        editorContent: EDITOR_CONTENT_STUB,
        pluginRegistryUrl,
        projects: []
      }, axiosInstance);
  } catch (error) {
    const action = await vscode.window.showErrorMessage('Failed to generate new Devfile Context.', {
      modal: true,
      detail: error.message
    }, 'Open Devfile');

    if ('Open Devfile' === action) {
      const document = await vscode.workspace.openTextDocument(devfilePath);
      await vscode.window.showTextDocument(document);
    }
    return false;
  }

  let flattenedDevfile: any;

  try {
    const flattenedDevfileContent = await fs.readFile(process.env.DEVWORKSPACE_FLATTENED_DEVFILE!, 'utf8');
    flattenedDevfile = jsYaml.load(flattenedDevfileContent) as any;
  } catch (error) {
    await vscode.window.showErrorMessage(`Failed to read Devfile. ${error}`);
    return false;
  }

  try {
    // if a new Devfile does not contain projects, copy them from flattened Devfile
    let projects: V1alpha2DevWorkspaceSpecTemplateProjects[] | undefined = devfileContext.devWorkspace.spec!.template!.projects;
    if ((!projects || projects.length === 0) && flattenedDevfile.projects) {
      devfileContext.devWorkspace.spec!.template!.projects = flattenedDevfile.projects;
    }
  } catch (error) {
    await vscode.window.showErrorMessage(`Failed to update DevWorkspace projects. ${error}`);
    return false;
  }

  try {
    // keep spec.template.attributes
    if (!devfileContext.devWorkspace.spec!.template!.attributes) {
      devfileContext.devWorkspace.spec!.template!.attributes = {};
    }

    for (const key of Object.keys(flattenedDevfile.attributes)) {
      if (flattenedDevfile.attributes[key]) {
        devfileContext.devWorkspace.spec!.template!.attributes[key] = flattenedDevfile.attributes[key];
      }
    }
  } catch (error) {
    await vscode.window.showErrorMessage(`Failed to update DevWorkspace attributes. ${error}`);
    return false;
  }

  try {
    await devfileService.updateDevfile(devfileContext.devWorkspace.spec?.template);
  } catch (error) {
    if (error.body && error.body.message) {
      const action = await vscode.window.showErrorMessage('Failed to update Devfile.', {
        modal: true,
        detail: error.body.message
      }, 'Open Devfile');

      if ('Open Devfile' === action) {
        const document = await vscode.workspace.openTextDocument(devfilePath);
        await vscode.window.showTextDocument(document);
      }
    } else {
      vscode.window.showErrorMessage(`Failed to update Devfile. ${error}`);
    }

    return false;
  }

  return true;
}
