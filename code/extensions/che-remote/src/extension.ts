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
import * as axios from 'axios';
import * as fs from 'fs-extra';
import * as vscode from 'vscode';

const DEVFILE_NAME = 'devfile.yaml';
const DOT_DEVFILE_NAME = '.devfile.yaml';
const DEFAULT_EDITOR_ENTRY = 'che-incubator/che-code/insiders';

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
          await vscode.commands.executeCommand('che-remote.command.restartWorkspace');
        } catch (error) {
          console.error(`Something went wrong for the 'Restart From Local Devfile' action: ${error}`);
          vscode.window.showErrorMessage(`Can not restart the workspace from the local devfile: ${error}`);
        }
      })
    );
  }
}

export function deactivate(): void {

}

async function updateDevfile(cheApi: any): Promise<void> {
  const devfileService: {
    get(): Promise<any>;
    getRaw(): Promise<string>;
    updateDevfile(devfile: any): Promise<void>;
  } = cheApi.getDevfileService();
  const devWorkspaceGenerator = new DevWorkspaceGenerator();

  const projectPath = process.env.PROJECT_SOURCE
  let devfilePath: string | undefined = `${projectPath}/${DEVFILE_NAME}`;

  let devfileExists = await fs.pathExists(devfilePath);
  if (!devfileExists) {
    devfilePath = `${projectPath}/${DOT_DEVFILE_NAME}`;
    devfileExists = await fs.pathExists(devfilePath);
  }

  if (!devfileExists) {
    devfilePath = await vscode.window.showInputBox({ title: 'Path to the devfile', value: `${projectPath}/` });
    devfileExists = devfilePath ? await fs.pathExists(devfilePath) : false;
  }

  if (!devfileExists) {
    throw new Error(`The devfile was not found at: ${devfilePath}`);
  }

  const currentDevfile = await devfileService.get()
  const projects = currentDevfile.projects || [];

  const newContent = await devWorkspaceGenerator.generateDevfileContext({ devfilePath, editorEntry: DEFAULT_EDITOR_ENTRY, projects: [] }, axios.default);
  if (newContent) {
    newContent.devWorkspace.spec!.template!.projects = projects;
    await devfileService.updateDevfile(newContent.devWorkspace.spec?.template);
  } else {
    throw new Error('An error occurred while generating new devfile context');
  }
}
