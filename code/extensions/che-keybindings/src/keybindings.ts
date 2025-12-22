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

export const USER_KEYBINDINGS_URI =
  vscode.Uri.parse('vscode-userdata:/User/keybindings.json');

export async function readUserKeybindings(): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(USER_KEYBINDINGS_URI);
  return doc.getText();
}

export async function applyUserKeybindings(content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(USER_KEYBINDINGS_URI);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    USER_KEYBINDINGS_URI,
    new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(doc.getText().length)
    ),
    content
  );

  await vscode.workspace.applyEdit(edit);
  await doc.save();
}
