/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as vscode from "vscode";
import { ActivityTrackerService, WorkspaceService } from "./activity-tracker-service";

export async function activate(context: vscode.ExtensionContext) {

	const eventsToTrack = [
		vscode.workspace.onDidChangeTextDocument,
		vscode.window.onDidChangeActiveTextEditor,
		vscode.window.onDidChangeTextEditorSelection,
		vscode.window.onDidChangeTextEditorViewColumn,
		vscode.window.onDidChangeWindowState,
		vscode.window.onDidChangeTerminalState,
		vscode.window.onDidChangeActiveTerminal,
	];

	await track(eventsToTrack, context);
}

async function track(events: vscode.Event<any>[], context: vscode.ExtensionContext) {
	const workspaceService = await getWorkspaceService();
	const activityTracker = new ActivityTrackerService(workspaceService);
	events.forEach((e: vscode.Event<any>) => {
		context.subscriptions.push(
			e(async () => {
				await activityTracker.resetTimeout();
			})
		);
	});
}

async function getWorkspaceService(): Promise<WorkspaceService> {
	const CHE_API = 'eclipse-che.api';
	const extensionApi = vscode.extensions.getExtension(CHE_API);
	if (!extensionApi) {
		throw Error(`Failed to get workspace service. Extension ${CHE_API} is not installed.`);
	}

	try {
		await extensionApi.activate();
		const cheApi: any = extensionApi?.exports;
		return cheApi.getWorkspaceService();
	} catch {
		throw Error(`Failed to get workspace service. Could not activate and retrieve exports from extension ${CHE_API}.`);
	}
}

export function deactivate() {}
