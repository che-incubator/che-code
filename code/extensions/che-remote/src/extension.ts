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
import * as vscode from 'vscode';

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
  }

}


export function deactivate(): void {

}
