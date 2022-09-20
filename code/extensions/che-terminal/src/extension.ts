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
import * as WS from 'ws';
import { MachineExecPTY } from './pseudoterminal';

export const machineExecChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Che terminal');

// Create a WebSocket connection to the machine-exec server.
export const machineExecConnection: WS = new WS('ws://localhost:3333/connect');

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
	machineExecConnection.on('message', (data: WS.Data) => {
		machineExecChannel.appendLine(data.toString());
	});

	const disposable = vscode.commands.registerCommand('che-machine-exec-support.openRemoteTerminal:tools', () => {
		const pty = new MachineExecPTY('tools', '', '');
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	const disposable2 = vscode.commands.registerCommand('che-machine-exec-support.executeCommand:tools', () => {
		const pty = new MachineExecPTY('tools', 'ls /etc', '');
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	context.subscriptions.push(disposable, disposable2);

	const api: Api = {
		getMachineExecPTY(component: string, cmd: string): MachineExecPTY {
			return new MachineExecPTY(component, cmd, '');
		}
	};
	return api;
}

interface Api {
	getMachineExecPTY(component: string, cmd: string): MachineExecPTY;
}

export function deactivate(): void {
}
