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
import { getKeybindings, patchKeybindings } from "./cheAPi";
import {
	readUserKeybindings,
	writeUserKeybindings,
	USER_KEYBINDINGS_URI,
} from "./keybindings";
import { getOrCreateClientId } from "./utils";

export class SyncManager implements vscode.Disposable {
	private suppressPush = false;

	private clientId: string;

	private namespace: string;

	private lastSynced = "";

	private timer?: NodeJS.Timeout;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly output: vscode.OutputChannel,
	) {
		const cfg = vscode.workspace.getConfiguration("cheKeybindingsSync");

		this.namespace = cfg.get("namespace", "default");
		this.clientId = getOrCreateClientId(context.globalState);

		this.output.appendLine("===== SyncManager Created =====");
		this.output.appendLine(`Namespace : ${this.namespace}`);
		this.output.appendLine(`Client ID : ${this.clientId}`);
	}

	async initialize() {
		this.output.appendLine("Initializing SyncManager...");

		try {
			await this.pull();
			this.output.appendLine("Initial pull completed.");
		} catch (err) {
			this.output.appendLine(`Initial pull failed: ${err}`);
		}

		this.context.subscriptions.push(
			vscode.workspace.onDidSaveTextDocument(this.onSave, this),
		);

		this.output.appendLine("Registered onDidSaveTextDocument listener.");

		this.timer = setInterval(() => {
			this.output.appendLine("Polling backend for remote keybindings...");
			this.pull().catch((err) =>
				this.output.appendLine(`Polling failed: ${err}`),
			);
		}, 10000);

		this.output.appendLine("Polling started (every 10 seconds).");
	}

	dispose() {
		this.output.appendLine("Disposing SyncManager...");

		if (this.timer) {
			clearInterval(this.timer);
			this.output.appendLine("Polling timer stopped.");
		}
	}

	private async onSave(doc: vscode.TextDocument) {
		this.output.appendLine(`Document saved: ${doc.uri.toString()}`);

		if (doc.uri.toString() !== USER_KEYBINDINGS_URI.toString()) {
			this.output.appendLine("Not keybindings.json. Ignoring.");
			return;
		}

		this.output.appendLine("Detected keybindings.json save.");

		if (this.suppressPush) {
			this.output.appendLine("Push suppressed (local update from backend).");
			this.suppressPush = false;
			return;
		}

		const text = doc.getText();

		if (text === this.lastSynced) {
			this.output.appendLine("No changes detected. Skipping push.");
			return;
		}

		this.output.appendLine(
			`Pushing keybindings to backend (${text.length} bytes)...`,
		);

		try {
			await patchKeybindings(this.namespace, text, this.clientId);

			this.lastSynced = text;

			this.output.appendLine("Push completed successfully.");
		} catch (err) {
			this.output.appendLine(`Push failed: ${err}`);
		}
	}

	async pull() {
		this.output.appendLine("Pulling keybindings from backend...");

		try {
			const remote = await getKeybindings(this.namespace);

			if (!remote) {
				this.output.appendLine("No response from backend.");
				return;
			}

			this.output.appendLine(
				`Received remote keybindings (${remote.keybindingsJson.length} bytes).`,
			);

			if (remote.meta?.clientId === this.clientId) {
				this.output.appendLine(
					"Remote update originated from this client. Ignoring.",
				);
				return;
			}

			const local = await readUserKeybindings();

			this.output.appendLine(
				`Local size: ${local.length}, Remote size: ${remote.keybindingsJson.length}`,
			);

			if (local === remote.keybindingsJson) {
				this.output.appendLine("Local keybindings already up-to-date.");
				this.lastSynced = local;
				return;
			}

			this.output.appendLine("Applying remote keybindings...");

			this.suppressPush = true;

			await writeUserKeybindings(remote.keybindingsJson);

			this.lastSynced = remote.keybindingsJson;

			this.output.appendLine("Remote keybindings applied successfully.");
		} catch (err) {
			this.output.appendLine(`Pull failed: ${err}`);
		}
	}
}
