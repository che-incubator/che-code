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

// const DOT_DEVFILE_NAME = '.devfile.yaml';
// const DEVFILE_NAME = 'devfile.yaml';
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
          await updateDevfile(cheApi);
        } catch (error) {
          console.error(`Failed to update Devfile: ${error}`);
          vscode.window.showErrorMessage(`Failed to update Devfile: ${error}`);
          return;
        }

        try {
          await vscode.commands.executeCommand('che-remote.command.restartWorkspace');
        } catch (error) {
          console.error(`Failed to restart the workspace: ${error}`);
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

async function getDevfilePath(): Promise<string | undefined> {
  console.log(`> use PROJECTS_ROOT: ${process.env.PROJECTS_ROOT}`);
  if (!process.env.PROJECTS_ROOT) {
    process.env.PROJECTS_ROOT = '/projects';
  }

  const devfileItems: vscode.QuickPickItem[] = [];

  const projects = await fs.readdir(process.env.PROJECTS_ROOT as string);
  for (const project of projects) {
      const dotDevfilePath = path.join(process.env.PROJECTS_ROOT, project, '.devfile.yaml');
      if (await isFile(dotDevfilePath)) {
          devfileItems.push({
              label: dotDevfilePath,
              detail: project
          });
          continue;
      }

      const devfilePath = path.join(process.env.PROJECTS_ROOT, project, 'devfile.yaml');
      if (await isFile(devfilePath)) {
          devfileItems.push({
              label: devfilePath,
              detail: project
          });
      }
  }

  if (devfileItems.length === 1) {
      return devfileItems[0].label;
  } else if (devfileItems.length > 1) {
      const devfileItem = await vscode.window.showQuickPick(devfileItems, {
          title: 'Select a Devfile to be applied to the current workspace',
      });

      if (devfileItem) {
          return devfileItem.label;
      }
  }

  return undefined;
}

async function updateDevfile(cheApi: any): Promise<void> {
  console.log('>> Updating devfile...');

  const devfileService: {
    get(): Promise<any>;
    getRaw(): Promise<string>;
    updateDevfile(devfile: any): Promise<void>;
  } = cheApi.getDevfileService();
  const devWorkspaceGenerator = new DevWorkspaceGenerator();

  const devfilePath = await getDevfilePath();
  if (!devfilePath) {
    console.log('> cancelled!!!');
    return;
  }

  const currentDevfile = await devfileService.get();
  const currentProjects = currentDevfile.projects || [];
  
  console.log(`>> current projects: ${currentProjects.length}`);
  const pluginRegistryUrl = process.env.CHE_PLUGIN_REGISTRY_INTERNAL_URL;
  
  console.info(`Using ${pluginRegistryUrl} to generate a new Devfile Context`);
  const newContent = await devWorkspaceGenerator.generateDevfileContext({ devfilePath, editorContent: EDITOR_CONTENT_STUB, pluginRegistryUrl, projects: [] }, axiosInstance);
  if (newContent) {
    if (newContent.devWorkspace.spec!.template!.projects) {
      console.log(`>> new projects: ${newContent.devWorkspace.spec!.template!.projects!.length}`);
    } else {
      console.log('>> generated devfile does not contain any project');
    }
    // newContent.devWorkspace.spec!.template!.projects = currentProjects;
    await devfileService.updateDevfile(newContent.devWorkspace.spec?.template);
  } else {
    console.log('>> Unable to generate the devfile for some reasons');
    throw new Error('An error occurred while generating new devfile context');
  }
}
