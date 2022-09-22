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
import { MachineExecPTY, MachineExecClient } from './pseudoterminal';

export const machineExecChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Che Terminal');

// Create a WebSocket connection to the machine-exec server.
export const machineExecConnection: WS = new WS('ws://localhost:3333/connect');
machineExecConnection.on('message', async (data: WS.Data) => {
	machineExecChannel.appendLine(`WebSocket <<< ${data.toString()}`);
});

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
	const containers: string[] = [... await MachineExecClient.getConainers()];

	machineExecConnection.on('message', async (data: WS.Data) => {
		const message = JSON.parse(data.toString());
		if (message.method === 'connected') {
			containers.push(... await MachineExecClient.getConainers());
		}
	});

	const disposable = vscode.commands.registerCommand('che-machine-exec-support.openRemoteTerminal:tools', () => {
		const pty = new MachineExecPTY('tools', '', '');
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	const disposable2 = vscode.commands.registerCommand('che-machine-exec-support.executeCommand:tools', () => {
		const pty = new MachineExecPTY('tools', 'ls /etc', '');
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	const disposable3 = vscode.commands.registerCommand('che-terminal.new', async () => {
		const container = await vscode.window.showQuickPick(containers);
		const pty = new MachineExecPTY(container!, '', '');
		vscode.window.createTerminal({ name: `${container} container`, pty }).show();
	});

	context.subscriptions.push(disposable, disposable2, disposable3);

	const api: Api = {
		getMachineExecPTY(component: string, cmd: string, workdir: string): MachineExecPTY {
			return new MachineExecPTY(component, cmd, workdir);
		}
	};
	return api;
}

interface Api {
	getMachineExecPTY(component: string, cmd: string, workdir: string): MachineExecPTY;
}

export function deactivate(): void {
}
