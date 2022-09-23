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

	const disposable = vscode.commands.registerCommand('che-terminal.new', async () => {
		const quickPickItems = containers.map(container => {
			return <ContainerQuickPickItem>{
				label: '$(terminal) ' + container,
				containerName: container
			};
		});

		const item = await vscode.window.showQuickPick<ContainerQuickPickItem>(quickPickItems, { placeHolder: 'Select a container to open a terminal to' });
		if (item) {
			const pty = new MachineExecPTY(item.containerName, '', '');
			const terminal = vscode.window.createTerminal({ name: `${item.containerName} component`, pty });
			terminal.show();
		}
	});

	context.subscriptions.push(disposable);

	const api: Api = {
		getMachineExecPTY(component: string, cmd: string, workdir: string): MachineExecPTY {
			return new MachineExecPTY(component, cmd, workdir);
		}
	};
	return api;
}

interface ContainerQuickPickItem extends vscode.QuickPickItem {
	containerName: string;
}

interface Api {
	getMachineExecPTY(component: string, cmd: string, workdir: string): MachineExecPTY;
}

export function deactivate(): void {
}
