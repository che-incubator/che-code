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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const machineExecChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Che machine-exec');
	const terminalsChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Che Terminal');

	// Create a WebSocket connection to the machine-exec component.
	const machineExecConnection: WS = new WS('ws://localhost:3333/connect');
	machineExecConnection.on('message', (data: WS.Data) => {
		machineExecChannel.appendLine(data.toString());
	});

	const disposable = vscode.commands.registerCommand('che-machine-exec-support.openRemoteTerminal:tools', () => {
		const pty = new MachineExecPTY(machineExecConnection, 'tools', '', terminalsChannel);
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	const disposable2 = vscode.commands.registerCommand('che-machine-exec-support.openRemoteTerminal:dev', () => {
		const pty = new MachineExecPTY(machineExecConnection, 'dev', '', terminalsChannel);
		vscode.window.createTerminal({ name: 'dev component', pty }).show();
	});

	context.subscriptions.push(disposable, disposable2);
}

class MachineExecPTY implements vscode.Pseudoterminal {

	private writeEmitter = new vscode.EventEmitter<string>();

	private terminalConnection: WS | undefined;

	private machineExec: MachineExec;

	constructor(machineExecConnection: WS,
		private devWorkspaceComponent: string,
		private commandLine: string,
		private channel: vscode.OutputChannel) {
		this.machineExec = new MachineExec(machineExecConnection);
	}

	onDidWrite: vscode.Event<string> = this.writeEmitter.event;

	onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

	onDidClose?: vscode.Event<number | void> | undefined;

	onDidChangeName?: vscode.Event<string> | undefined;

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		this.channel.appendLine(`new terminal opened with the dimentions: ${initialDimensions}`);

		this.terminalConnection = await this.machineExec.createTerminalSession(this.devWorkspaceComponent, this.commandLine, initialDimensions);

		if (this.terminalConnection) {
			this.terminalConnection.on('message', (data: WS.Data) => {
				this.writeEmitter.fire(data.toString());
			});
		}
	}

	close(): void {
		this.channel.appendLine('terminal closed');
	}

	handleInput?(data: string): void {
		if (this.terminalConnection) {
			this.terminalConnection.send(data);
		}
	}

	setDimensions?(dimensions: vscode.TerminalDimensions): void {
		this.channel.appendLine(`the dimentions changed: ${dimensions}`);
		// send the new dimensions to machine-exec
	}
}

class MachineExec {

	constructor(private connection: WS) { }

	/**
	 * Requests the machine-exec component to create a new terminal session on the specified component.
	 * @param component
	 * @param commandLine
	 * @param dimensions
	 * @returns a WebSocket connection to communicate with the created terminal session
	 */
	createTerminalSession(component: string, commandLine: string, dimensions?: vscode.TerminalDimensions): Promise<WS> {
		const createTerminalSessionCall = {
			identifier: {
				machineName: component
			},
			cmd: commandLine ? ['sh', '-c', commandLine] : 'sh',
			tty: true,
			cwd: '',
			cols: dimensions ? dimensions.columns : 100,
			rows: dimensions ? dimensions.rows : 10
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'create',
			params: createTerminalSessionCall,
			id: 1
		};

		this.connection.send(JSON.stringify(jsonCommand));

		return new Promise(resolve => {
			this.connection.on('message', (data: WS.Data) => {
				console.log(data.toString());
				const message = JSON.parse(data.toString());
				const sessionID = message.result;
				if (Number.isFinite(sessionID)) {
					resolve(new WS(`ws://localhost:3333/attach/${sessionID}`));
				}
			});
		});
	}
}

export function deactivate(): void {
}
