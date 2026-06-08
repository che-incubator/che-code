/**********************************************************************
 * Copyright (c) 2022-2026 Red Hat, Inc.
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
import { WebSocket } from 'ws';
import { getOutputChannel } from './extension';

/** Client for the machine-exec server. */
export class MachineExecClient implements vscode.Disposable {

	private static readonly MAX_RETRIES = 30;
	private static readonly RETRY_DELAY_MS = 1000;

	/** WebSocket connection to the machine-exec server. */
	private connection: WebSocket | undefined;

	private onExitEmitter = new vscode.EventEmitter<TerminalExitEvent>();

	private LIST_CONTAINERS_MESSAGE_ID = -5;

	/**
	 * Connects to the machine-exec server with retry logic.
	 * Resolves once the server sends the `connected` message.
	 * Rejects if all retry attempts are exhausted.
	 */
	async init(): Promise<void> {
		for (let attempt = 1; attempt <= MachineExecClient.MAX_RETRIES; attempt++) {
			try {
				await this.tryConnect();
				return;
			} catch (err: any) {
				getOutputChannel().appendLine(`[machine-exec] Connection attempt ${attempt}/${MachineExecClient.MAX_RETRIES} failed: ${err.message}`);
				if (attempt === MachineExecClient.MAX_RETRIES) {
					throw new Error(`Failed to connect to machine-exec after ${MachineExecClient.MAX_RETRIES} attempts: ${err.message}`);
				}
				await new Promise(resolve => setTimeout(resolve, MachineExecClient.RETRY_DELAY_MS));
			}
		}
	}

	private tryConnect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;

			const ws = new WebSocket('ws://localhost:3333/connect');
			ws
				.on('message', async (data: WS.Data) => {
					getOutputChannel().appendLine(`[WebSocket] <<< ${data.toString()}`);

					const message = JSON.parse(data.toString());
					if (message.method === 'connected') {
						settled = true;
						this.connection = ws;
						this.setupMessageHandler(ws);
						resolve();
					}
				})
				.on('close', (code: number, reason: Buffer) => {
					const msg = reason.toString() || `code ${code}`;
					getOutputChannel().appendLine(`[WebSocket] closed: ${msg}`);
					if (!settled) {
						settled = true;
						ws.removeAllListeners();
						reject(new Error(`WebSocket closed before ready: ${msg}`));
					}
				})
				.on('error', (err: Error) => {
					getOutputChannel().appendLine(`[WebSocket] error: ${err.message}`);
					if (!settled) {
						settled = true;
						ws.removeAllListeners();
						reject(new Error(err.message));
					}
				});
		});
	}

	private setupMessageHandler(ws: WebSocket): void {
		ws.on('message', (data: WS.Data) => {
			const message = JSON.parse(data.toString());
			if (message.method === 'onExecExit') {
				this.onExitEmitter.fire({ sessionId: message.params.id, exitCode: 0 });
			} else if (message.method === 'onExecError') {
				this.onExitEmitter.fire({ sessionId: message.params.id, exitCode: 1 });
			}
		});
	}

	dispose() {
		this.connection?.terminate();
	}

	/**
	 * Asks the machine-exec server to list all running DevWorkspace containers.
	 *
	 * @returns containers names
	 */
	async getContainers(): Promise<string[]> {
		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'listContainers',
			params: [],
			id: this.LIST_CONTAINERS_MESSAGE_ID,
		};

		const command = JSON.stringify(jsonCommand);
		getOutputChannel().appendLine(`[WebSocket] >>> ${command}`);
		this.connection!.send(command);

		return new Promise(resolve => {
			this.connection!.once('message', (data: WS.Data) => {
				const message = JSON.parse(data.toString());
				if (message.id === this.LIST_CONTAINERS_MESSAGE_ID) {
					const remoteContainers: string[] = message.result.map((containerInfo: any) => containerInfo.container);
					resolve(remoteContainers);
				}
			});
		});
	}

	/** Returns the list of the containers the user might be interested in opening a terminal to. */
	async getContributedContainers(): Promise<string[]> {
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
			.filter((component: any) => !component.attributes || (component.attributes as any)[editorContainerAttribute] === undefined)
			.map((component: any) => component.name);

		// ask machine-exec to get all running containers and
		// filter out those not declared in the devfile, e.g. che-gateway, etc.
		const runningContainers = [... await this.getContainers()];
		const runningDevfileContainers = runningContainers.filter(containerName => devfileContainersNames.includes(containerName));
		return runningDevfileContainers;
	}

	/**
	 * Asks the machine-exec server to start a new terminal session to the specified container.
	 *
	 * @param component name of the DevWorkspace component that represents a container to create a terminal session to
	 * @param commandLine optional command line to execute when starting a terminal session. If empty, machine-exec will start a default shell.
	 * @param workdir optional working directory
	 * @param columns the initial width of the new terminal
	 * @param rows the initial height of the new terminal
	 * @returns a TerminalSession object to manage the created terminal session
	 */
	async createTerminalSession(component: string, commandLine?: string, workdir?: string, columns: number = 80, rows: number = 24): Promise<TerminalSession> {
		if (commandLine) {
			commandLine = "test -f ${HOME}/.bashrc >> /dev/null 2>&1 && source ${HOME}/.bashrc >> /dev/null 2>&1;" + commandLine;
		}

		const createTerminalSessionCall = {
			identifier: {
				machineName: component
			},
			cmd: commandLine ? ['sh', '-c', commandLine] : [],
			tty: true,
			cwd: workdir || '',
			cols: columns,
			rows: rows
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'create',
			params: createTerminalSessionCall,
			id: 0
		};

		const command = JSON.stringify(jsonCommand);
		getOutputChannel().appendLine(`[WebSocket] >>> ${command}`);
		this.connection!.send(command);

		return new Promise(resolve => {
			this.connection!.once('message', (data: WS.Data) => {
				const message = JSON.parse(data.toString());
				const sessionID = message.result;
				if (Number.isFinite(sessionID)) {
					resolve(new TerminalSession(this, sessionID));
				}
			});
		});
	}

	/**
	 * Asks the machine-exec server to resize the specified terminal.
	 *
	 * @param sessionID
	 * @param columns new width
	 * @param rows new height
	 */
	async resize(sessionID: number, columns: number, rows: number): Promise<void> {
		const resizeTerminalCall = {
			id: sessionID,
			cols: columns,
			rows
		};

		const jsonCommand = {
			jsonrpc: '2.0',
			method: 'resize',
			params: resizeTerminalCall,
			id: 0
		};

		const command = JSON.stringify(jsonCommand);
		getOutputChannel().appendLine(`[WebSocket] >>> ${command}`);
		this.connection!.send(command);
	}

	get onExit(): vscode.Event<TerminalExitEvent> {
		return this.onExitEmitter.event;
	}
}

interface TerminalExitEvent {
	sessionId: number;
	exitCode: number;
}

/** Allows managing a remote terminal session. */
export class TerminalSession {

	/** This terminal session's ID that's assigned by the machine-exec server. */
	id: number;

	/** The WebSocket connection to the actual terminal. */
	private connection: WebSocket;

	private onOutputEmitter = new vscode.EventEmitter<string>();
	private onExitEmitter = new vscode.EventEmitter<number>();

	/**
	 * Attaches to an existing terminal session with the given ID.
	 *
	 * @param machineExecClient client to communicate with the machine-exec server
	 * @param id the terminal session ID assigned by the machine-exec server
	 */
	constructor(private machineExecClient: MachineExecClient, id: number) {
		this.id = id;

		this.connection = new WebSocket(`ws://localhost:3333/attach/${id}`);
		this.connection.on('message', (data: WS.Data) => {
			this.onOutputEmitter.fire(data.toString());
		});

		machineExecClient.onExit(e => {
			if (e.sessionId === id) {
				this.onExitEmitter.fire(e.exitCode);
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
		this.connection.send(data);
	}

	resize(columns: number, rows: number): void {
		this.machineExecClient.resize(this.id, columns, rows);
	}
}
