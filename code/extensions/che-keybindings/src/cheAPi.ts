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

export interface KeybindingsResponse {
	keybindingsJson: string;

	meta?: {
		clientId?: string;
		resourceVersion?: string;
	};
}

const API = "/api";

export async function getKeybindings(
	namespace: string,
	output?: vscode.OutputChannel,
): Promise<KeybindingsResponse | null> {
	output?.appendLine(`[API] GET ${API}/namespace/${namespace}/keybindings`);

	const res = await fetch(`${API}/namespace/${namespace}/keybindings`, {
		credentials: "include",
	});

	output?.appendLine(`[API] GET Status: ${res.status}`);

	if (!res.ok) {
		output?.appendLine(`[API] GET Failed: ${await res.text()}`);
		return null;
	}

	const data = (await res.json()) as KeybindingsResponse;

	output?.appendLine(
		`[API] GET Success - Received ${data.keybindingsJson.length} bytes`,
	);

	if (data.meta) {
		output?.appendLine(
			`[API] Meta => clientId=${data.meta.clientId ?? "N/A"}, resourceVersion=${data.meta.resourceVersion ?? "N/A"}`,
		);
	}

	return data;
}

export async function patchKeybindings(
	namespace: string,
	keybindingsJson: string,
	clientId: string,
	output?: vscode.OutputChannel,
): Promise<void> {
	output?.appendLine(`[API] PATCH ${API}/namespace/${namespace}/keybindings`);
	output?.appendLine(`[API] Payload Size: ${keybindingsJson.length} bytes`);
	output?.appendLine(`[API] Client ID: ${clientId}`);

	const res = await fetch(`${API}/namespace/${namespace}/keybindings`, {
		method: "PATCH",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			keybindingsJson,
			meta: {
				clientId,
			},
		}),
	});

	output?.appendLine(`[API] PATCH Status: ${res.status}`);

	if (!res.ok) {
		const error = await res.text();
		output?.appendLine(`[API] PATCH Failed: ${error}`);
		throw new Error(error);
	}

	output?.appendLine("[API] PATCH Successful.");
}
