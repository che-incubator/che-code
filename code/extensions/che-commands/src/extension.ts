/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as vscode from 'vscode';
import { CheTaskProvider } from './taskProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const channel: vscode.OutputChannel = vscode.window.createOutputChannel('Che Commands');

	registerTaskProvider(context, channel);
}

function registerTaskProvider(context: vscode.ExtensionContext, channel: vscode.OutputChannel) {
	const taskProvider = new CheTaskProvider(channel);
	const disposable = vscode.tasks.registerTaskProvider('che', taskProvider);
	context.subscriptions.push(disposable);
}

export function deactivate(): void {

}
