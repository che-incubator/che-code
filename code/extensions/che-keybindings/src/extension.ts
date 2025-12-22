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
import * as vscode from 'vscode';
import { getKeybindings, patchKeybindings } from './cheAPi';
import { readUserKeybindings, applyUserKeybindings, USER_KEYBINDINGS_URI } from './keybindings';
import { getOrCreateClientId } from './utils';

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('cheKeybindingsSync');
  if (config.get('storageMode') !== 'global') {
    return;
  }

  const namespace = config.get<string>('namespace', 'default');
  const clientId = getOrCreateClientId(context.globalState);

  const output = vscode.window.createOutputChannel('Che Keybindings Sync');
  output.appendLine('Activating Che Keybindings Sync');

  // ---------- PULL ON STARTUP ----------
  try {
    const remote = await getKeybindings(namespace);
    if (remote?.keybindingsJson) {
      const local = await readUserKeybindings();
      if (local !== remote.keybindingsJson) {
        await applyUserKeybindings(remote.keybindingsJson);
        output.appendLine('Applied keybindings from Che backend');
      }
    }
  } catch (e) {
    output.appendLine(`Pull failed: ${e}`);
  }

  // ---------- AUTO PUSH ON SAVE ----------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.uri.toString() !== USER_KEYBINDINGS_URI.toString()) {
        return;
      }

      try {
        await patchKeybindings(namespace, doc.getText(), clientId);
        output.appendLine('Pushed keybindings to Che backend');
      } catch (e) {
        output.appendLine(`Push failed: ${e}`);
      }
    })
  );

  // ---------- COMMANDS ----------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cheKeybindingsSync.pull',
      async () => {
        const remote = await getKeybindings(namespace);
        if (remote?.keybindingsJson) {
          await applyUserKeybindings(remote.keybindingsJson);
          vscode.window.showInformationMessage('Keybindings pulled from Che');
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cheKeybindingsSync.push',
      async () => {
        const local = await readUserKeybindings();
        await patchKeybindings(namespace, local, clientId);
        vscode.window.showInformationMessage('Keybindings pushed to Che');
      }
    )
  );
}

export function deactivate() {}