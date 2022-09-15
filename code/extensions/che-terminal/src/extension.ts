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
	const machineExecChannel: vscode.OutputChannel = vscode.window.createOutputChannel('Che terminal');

	// Create a WebSocket connection to the machine-exec server.
	const machineExecConnection: WS = new WS('ws://localhost:3333/connect');
	machineExecConnection.on('message', (data: WS.Data) => {
		machineExecChannel.appendLine(data.toString());
	});

	const disposable = vscode.commands.registerCommand('che-machine-exec-support.openRemoteTerminal:tools', () => {
		const pty = new MachineExecPTY(machineExecConnection, 'tools', '', machineExecChannel);
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	const disposable2 = vscode.commands.registerCommand('che-machine-exec-support.executeCommand:tools', () => {
		const pty = new MachineExecPTY(machineExecConnection, 'tools', 'ls /etc', machineExecChannel);
		vscode.window.createTerminal({ name: 'tools component', pty }).show();
	});

	context.subscriptions.push(disposable, disposable2);
}

/**
 * VS Code PTY that communicates with the terminal sessions managed by machine-exec server.
 */
class MachineExecPTY implements vscode.Pseudoterminal {

	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	/**
	 * Remote terminal session that VS Code PTY is connected to.
	 */
	private terminalSession: TerminalSession | undefined;

	private machineExecServer: MachineExecClient;

	constructor(machineExecConnection: WS,
		private devWorkspaceComponent: string,
		private commandLine: string,
		private channel: vscode.OutputChannel) {
		this.machineExecServer = new MachineExecClient(machineExecConnection, channel);
	}

	onDidWrite: vscode.Event<string> = this.writeEmitter.event;

	onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

	onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;

	onDidChangeName?: vscode.Event<string> | undefined;

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		this.channel.appendLine(`new terminal opened with the dimentions: ${initialDimensions?.columns}, ${initialDimensions?.rows}`);

		this.terminalSession = await this.machineExecServer.createTerminalSession(this.devWorkspaceComponent, this.commandLine, initialDimensions);

		this.terminalSession.onOutput(e => this.writeEmitter.fire(e));
		this.terminalSession.onExit(e => this.closeEmitter.fire(e));
	}

	close(): void {
		this.channel.appendLine('terminal closed');
		this.terminalSession?.send('\x03');
	}

	handleInput?(data: string): void {
		this.terminalSession?.send(data);
	}

	setDimensions?(dimensions: vscode.TerminalDimensions): void {
		this.channel.appendLine(`the dimentions changed: ${dimensions.columns}, ${dimensions.rows}`);
		this.terminalSession?.resize(dimensions);
	}
}

class TerminalSession {

	/** The established connection for this terminal session. */
	private terminalConnection: WS;

	private onOutputEmitter = new vscode.EventEmitter<string>();

	private onExitEmitter = new vscode.EventEmitter<number>();

	/**
	 *
	 * @param id the terminal session ID
	 * @param machineExecConnection the established WebSocket connection
	 */
	constructor(private id: number, private machineExecConnection: WS) {
		this.terminalConnection = new WS(`ws://localhost:3333/attach/${id}`);

		this.terminalConnection.on('message', (data: WS.Data) => {
			this.onOutputEmitter.fire(data.toString());
		});

		machineExecConnection.on('message', (data: WS.Data) => {
			const message = JSON.parse(data.toString());
			if (message.method === 'onExecExit' && message.params.id === id) {
				this.onExitEmitter.fire(0);
			}
			if (message.method === 'onExecError' && message.params.id === id) {
				this.onExitEmitter.fire(1);
			}
		});
	}

	/** An event that when fired signals about an output data. */
	get onOutput(): vscode.Event<string> {
		return this.onOutputEmitter.event;
	}

	/** An event that when fired signals that the remote terminal session is ended. */
	get onExit(): vscode.Event<number> {
		return this.onExitEmitter.event;
	}

	send(data: string): void {
		this.terminalConnection.send(data);
	}

	resize(dimensions: vscode.TerminalDimensions): void {
		const resizeTerminalSessionCall = {
			id: this.id,
			cols: dimensions.columns,
			rows: dimensions.rows
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'resize',
			params: resizeTerminalSessionCall,
			id: 0
		};

		const command = JSON.stringify(jsonCommand);
		this.machineExecConnection.send(command);
	}
}

/** Client for the machine-exec server. */
class MachineExecClient {

	constructor(private connection: WS, private channel: vscode.OutputChannel) { }

	/**
	 * Requests the machine-exec server to create a new terminal session to the specified component.
	 *
	 * @param component
	 * @param commandLine
	 * @param dimensions
	 * @returns a WebSocket connection to communicate with the created terminal session
	 */
	createTerminalSession(component: string, commandLine: string, dimensions?: vscode.TerminalDimensions): Promise<TerminalSession> {
		const createTerminalSessionCall = {
			identifier: {
				machineName: component
			},
			cmd: commandLine ? ['sh', '-c', commandLine] : [],
			tty: true,
			cwd: '',
			cols: dimensions ? dimensions.columns : 100,
			rows: dimensions ? dimensions.rows : 10
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'create',
			params: createTerminalSessionCall,
			id: 0
		};

		const command = JSON.stringify(jsonCommand);
		this.channel.appendLine(command);
		this.connection.send(command);

		return new Promise(resolve => {
			this.connection.once('message', (data: WS.Data) => {
				const message = JSON.parse(data.toString());
				const sessionID = message.result;
				if (Number.isFinite(sessionID)) {
					resolve(new TerminalSession(sessionID, this.connection));
				}
			});
		});
	}
}

export function deactivate(): void {
}
