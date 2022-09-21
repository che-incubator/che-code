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
import { machineExecChannel, machineExecConnection } from './extension';

/**
 * VS Code PTY that communicates with the terminal sessions managed by machine-exec server.
 */
export class MachineExecPTY implements vscode.Pseudoterminal {

	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	/**
	 * Remote terminal session that VS Code PTY is connected to.
	 */
	private terminalSession: TerminalSession | undefined;

	constructor(private devWorkspaceComponent: string, private commandLine: string, private workdir: string) {
	}

	onDidWrite: vscode.Event<string> = this.writeEmitter.event;

	onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

	onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;

	onDidChangeName?: vscode.Event<string> | undefined;

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		machineExecChannel.appendLine(`new terminal opened with the dimentions: ${initialDimensions?.columns}, ${initialDimensions?.rows}`);

		this.terminalSession = await MachineExecClient.createTerminalSession(this.devWorkspaceComponent, this.commandLine, this.workdir, initialDimensions);

		this.terminalSession.onOutput(e => this.writeEmitter.fire(e));
		this.terminalSession.onExit(e => this.closeEmitter.fire(e));
	}

	close(): void {
		machineExecChannel.appendLine('terminal closed');
		this.terminalSession?.send('\x03');
	}

	handleInput?(data: string): void {
		this.terminalSession?.send(data);
	}

	setDimensions?(dimensions: vscode.TerminalDimensions): void {
		machineExecChannel.appendLine(`the dimentions changed: ${dimensions.columns}, ${dimensions.rows}`);
		this.terminalSession?.resize(dimensions);
	}
}

export class TerminalSession {

	/** The established connection for this terminal session. */
	private terminalConnection: WS;

	private onOutputEmitter = new vscode.EventEmitter<string>();

	private onExitEmitter = new vscode.EventEmitter<number>();

	/**
	 *
	 * @param id the terminal session ID
	 */
	constructor(private id: number) {
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
		const resizeTerminalCall = {
			id: this.id,
			cols: dimensions.columns,
			rows: dimensions.rows
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'resize',
			params: resizeTerminalCall,
			id: 0
		};

		const command = JSON.stringify(jsonCommand);
		machineExecChannel.appendLine(`WebSocket >>> ${command}`);
		machineExecConnection.send(command);
	}
}

/** Client for the machine-exec server. */
export namespace MachineExecClient {

	const LIST_CONTAINERS_ID = -5;

	export function getConainers(): Promise<string[]> {
		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'listContainers',
			params: [],
			id: LIST_CONTAINERS_ID,
		};

		const command = JSON.stringify(jsonCommand);
		machineExecChannel.appendLine(`WebSocket >>> ${command}`);
		machineExecConnection.send(command);

		return new Promise(resolve => {
			machineExecConnection.once('message', (data: WS.Data) => {
				const message = JSON.parse(data.toString());
				if (message.id === LIST_CONTAINERS_ID) {
					const remoteContainers: string[] = message.result.map((containerInfo: any) => containerInfo.container);
					resolve(remoteContainers);
				}
			});
		});
	}

	/**
	 * Requests the machine-exec server to create a new terminal session to the specified component.
	 *
	 * @param component
	 * @param commandLine
	 * @param dimensions
	 * @returns a WebSocket connection to communicate with the created terminal session
	 */
	export function createTerminalSession(component: string, commandLine: string, workdir: string, dimensions?: vscode.TerminalDimensions): Promise<TerminalSession> {
		const createTerminalSessionCall = {
			identifier: {
				machineName: component
			},
			cmd: commandLine ? ['sh', '-c', commandLine] : [],
			tty: true,
			cwd: workdir,
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
		machineExecChannel.appendLine(`WebSocket >>> ${command}`);
		machineExecConnection.send(command);

		return new Promise(resolve => {
			machineExecConnection.once('message', (data: WS.Data) => {
				const message = JSON.parse(data.toString());
				const sessionID = message.result;
				if (Number.isFinite(sessionID)) {
					resolve(new TerminalSession(sessionID));
				}
			});
		});
	}
}
