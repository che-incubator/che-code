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

import * as vscode from "vscode";

export const USER_KEYBINDINGS_URI = vscode.Uri.parse(
	"vscode-userdata:/User/keybindings.json",
);

export async function readUserKeybindings(
	output?: vscode.OutputChannel,
): Promise<string> {
	output?.appendLine("[Keybindings] Reading user keybindings...");

	try {
		const doc = await vscode.workspace.openTextDocument(USER_KEYBINDINGS_URI);

		output?.appendLine(
			`[Keybindings] Opened: ${USER_KEYBINDINGS_URI.toString()}`,
		);

		const text = doc.getText();

		output?.appendLine(`[Keybindings] Read successful (${text.length} bytes).`);

		return text;
	} catch (err) {
		output?.appendLine(`[Keybindings] Failed to read keybindings: ${err}`);

		return "[]";
	}
}

export async function writeUserKeybindings(
	text: string,
	output?: vscode.OutputChannel,
): Promise<void> {
	output?.appendLine("[Keybindings] Writing user keybindings...");

	const doc = await vscode.workspace.openTextDocument(USER_KEYBINDINGS_URI);

	const current = doc.getText();

	output?.appendLine(`[Keybindings] Current size: ${current.length} bytes`);
	output?.appendLine(`[Keybindings] New size: ${text.length} bytes`);

	if (current === text) {
		output?.appendLine("[Keybindings] No changes detected. Skipping write.");
		return;
	}

	const edit = new vscode.WorkspaceEdit();

	edit.replace(
		USER_KEYBINDINGS_URI,
		new vscode.Range(doc.positionAt(0), doc.positionAt(current.length)),
		text,
	);

	output?.appendLine("[Keybindings] Applying workspace edit...");

	const applied = await vscode.workspace.applyEdit(edit);

	output?.appendLine(`[Keybindings] Workspace edit applied: ${applied}`);

	if (!applied) {
		throw new Error("Failed to apply workspace edit.");
	}

	output?.appendLine("[Keybindings] Saving keybindings.json...");

	const saved = await doc.save();

	output?.appendLine(`[Keybindings] Save completed: ${saved}`);

	output?.appendLine("[Keybindings] Write completed successfully.");
}
