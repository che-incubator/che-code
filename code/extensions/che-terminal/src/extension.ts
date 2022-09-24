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

import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';
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
	const containers: string[] = await getContributedContainers();

	// machineExecConnection.on('message', async (data: WS.Data) => {
	// 	const message = JSON.parse(data.toString());
	// 	if (message.method === 'connected') {
	// 		containers.push(... await MachineExecClient.getConainers());
	// 	}
	// });

	const disposable = vscode.commands.registerCommand('che-terminal.new', async () => {
		let item;
		if (containers.length === 0) {
			// if there're no contributed containers,
			// open a VS Code built-in terminal to the editor container
			vscode.commands.executeCommand('workbench.action.terminal.new');
			return;
		}

		if (containers.length === 1) {
			item = containers[0];
		} else if (containers.length > 1) {
			item = await vscode.window.showQuickPick(containers, { placeHolder: 'Select a container to open a terminal to' });
		}

		// item is undefined in case the user closed the QuickPick
		if (item) {
			const pty = new MachineExecPTY(item, '', '');
			const terminal = vscode.window.createTerminal({ name: `${item} container`, pty });
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

interface Api {
	getMachineExecPTY(component: string, cmd: string, workdir: string): MachineExecPTY;
}

/** Returns the list of the containers the user might be interested in opening a terminal to. */
async function getContributedContainers(): Promise<string[]> {
	const originalDevFileContent = fs.readFileSync('/devworkspace-metadata/original.devworkspace.yaml', 'utf8');
	const devfile = jsYaml.load(originalDevFileContent) as any;

	const devfileComponents = devfile.components || [];
	const editorContainerAttribute = 'che-code.eclipse.org/contribute-endpoint/che-code';
	const devfileContainersNames = devfileComponents
		// we're only interested in those components that describe the contributed containers
		// so, filter out all others, e.g. volume, plugin, etc.
		.filter((component: any) => component.container)
		// and the editor container as well, since the user opens a terminal to it
		// with the VS Code built-in terminal
		.filter((component: any) => component.attributes && (component.attributes as any)[editorContainerAttribute] === undefined)
		.map((component: any) => component.name);

	// ask machine-exec to get all running containers and
	// filter out those not declared in the devfile, e.g. che-gateway, etc.
	const runningContainers = [... await MachineExecClient.getConainers()];
	const runningDevfileContainers = runningContainers.filter(containerName => devfileContainersNames.includes(containerName));

	return runningDevfileContainers;
}

export function deactivate(): void {
}
