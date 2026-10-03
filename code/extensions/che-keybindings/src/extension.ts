/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */
import * as vscode from "vscode";
import { USER_KEYBINDINGS_URI } from "./keybindings";

export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel("Che Keybindings Sync");
	context.subscriptions.push(output);

	output.show(true);
	output.appendLine("======================================");
	output.appendLine("Che Keybindings Investigation");
	output.appendLine(`Activated: ${new Date().toISOString()}`);
	output.appendLine("======================================");

	try {
		const doc = await vscode.workspace.openTextDocument(USER_KEYBINDINGS_URI);

		output.appendLine("Successfully opened keybindings.json");
		output.appendLine(`URI    : ${doc.uri.toString()}`);
		output.appendLine(`Scheme : ${doc.uri.scheme}`);
		output.appendLine(`Path   : ${doc.uri.path}`);
		output.appendLine(`Length : ${doc.getText().length}`);

		output.appendLine("----- Current Content -----");
		output.appendLine(doc.getText());
		output.appendLine("---------------------------");
	} catch (err) {
		output.appendLine(`Failed to open keybindings.json: ${err}`);
	}

	// Fires whenever keybindings.json is saved
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(doc => {
			output.appendLine("");
			output.appendLine("===== onDidSaveTextDocument =====");
			output.appendLine(`Saved: ${doc.uri.toString()}`);

			if (doc.uri.toString() === USER_KEYBINDINGS_URI.toString()) {
				output.appendLine("Detected keybindings.json save");
				output.appendLine(`Length: ${doc.getText().length}`);
				output.appendLine(doc.getText());
			}
		}),
	);

	// Fires whenever any text document changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === USER_KEYBINDINGS_URI.toString()) {
				output.appendLine("");
				output.appendLine("===== onDidChangeTextDocument =====");
				output.appendLine(`Changes: ${event.contentChanges.length}`);

				for (const change of event.contentChanges) {
					output.appendLine(
						`Range: ${change.rangeOffset}-${change.rangeOffset + change.rangeLength}`,
					);
					output.appendLine(`Inserted: ${JSON.stringify(change.text)}`);
				}
			}
		}),
	);

	output.appendLine("Listening for keybindings changes...");
}

export function deactivate() {}
