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
import { SyncManager } from "./syncManager";

export async function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel("Che Keybindings Sync");
	context.subscriptions.push(output);

	output.appendLine("======================================");
	output.appendLine("Che Keybindings Sync Extension");
	output.appendLine(`Activated at: ${new Date().toISOString()}`);
	output.appendLine("Creating SyncManager...");

	try {
		const manager = new SyncManager(context, output);

		output.appendLine("Initializing SyncManager...");
		await manager.initialize();

		context.subscriptions.push(manager);

		output.appendLine("SyncManager initialized successfully.");
		output.appendLine("Extension activation completed.");
	} catch (err) {
		output.appendLine(`Extension activation failed: ${err}`);
		vscode.window.showErrorMessage(
			`Che Keybindings Sync activation failed. Check Output -> Che Keybindings Sync`,
		);
	}

	output.appendLine("======================================");
}

export function deactivate() {
	console.log("Che Keybindings Sync deactivated.");
}
