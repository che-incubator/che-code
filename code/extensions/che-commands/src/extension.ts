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

import * as vscode from 'vscode';
import { CheTaskProvider } from './taskProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const channel: vscode.OutputChannel = vscode.window.createOutputChannel('Che Commands');

	const cheAPI = await getExtensionAPI('eclipse-che.api');
	const terminalExtAPI = await getExtensionAPI('eclipse-che.terminal');

	const taskProvider = new CheTaskProvider(channel, cheAPI, terminalExtAPI);
	const disposable = vscode.tasks.registerTaskProvider('che', taskProvider);

	context.subscriptions.push(disposable);
}

async function getExtensionAPI(extID: string): Promise<any> {
	const ext = vscode.extensions.getExtension(extID);
	if (!ext) {
		throw Error(`Extension ${extID} is not installed.`);
	}
	try {
		return await ext.activate();
	} catch {
		throw Error(`Failed to activate ${extID} extension.`);
	}
}

export function deactivate(): void {
}
