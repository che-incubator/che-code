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

export function getOrCreateClientId(
	state: vscode.Memento,
	output?: vscode.OutputChannel,
): string {
	output?.appendLine("[Utils] Retrieving client ID...");

	let id = state.get<string>("clientId");

	if (!id) {
		output?.appendLine(
			"[Utils] No existing client ID found. Generating a new one...",
		);

		id = Math.random().toString(36).slice(2);

		state.update("clientId", id);

		output?.appendLine(`[Utils] Generated new client ID: ${id}`);
	} else {
		output?.appendLine(`[Utils] Existing client ID found: ${id}`);
	}

	return id;
}
