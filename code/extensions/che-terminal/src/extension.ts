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
import { MachineExecClient, TerminalSession } from './machine-exec-client';

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Che Terminal');
	}
	return _channel;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const machineExecClient = new MachineExecClient();
	await machineExecClient.init();

	const containers: string[] = await machineExecClient.getContributedContainers();

	const disposable = vscode.commands.registerCommand('che-terminal.new', async () => {
		if (containers.length === 0) {
			// if there're no contributed containers,
			// open a VS Code built-in terminal to the editor container
			vscode.commands.executeCommand('workbench.action.terminal.new');
			return;
		}

		let containerName;
		if (containers.length === 1) {
			containerName = containers[0];
		} else if (containers.length > 1) {
			containerName = await vscode.window.showQuickPick(containers, { placeHolder: 'Select a container to open a terminal to' });
		}

		// containerName is undefined in case the user closed the QuickPick
		if (containerName) {
			const pty = new MachineExecPTY(machineExecClient, containerName);
			const terminal = vscode.window.createTerminal({ name: `${containerName} container`, pty });
			terminal.show();
		}
	});

	context.subscriptions.push(machineExecClient, disposable);
}

/**
 * The VS Code PTY implementation that enables opening a terminal to a DevWorkspace container.
 */
export class MachineExecPTY implements vscode.Pseudoterminal {

	private writeEmitter = new vscode.EventEmitter<string>();
	private closeEmitter = new vscode.EventEmitter<number | void>();

	/**
	 * The remote terminal session that VS Code PTY is connected to.
	 * It's undefined only when the corresponding VS Code terminal isn't opened yet.
	 */
	private terminalSession: TerminalSession | undefined;

	/**
	 * Constructs a new PTY to connect to the specified DevWorkspace container.
	 *
	 * @param machineExecClient client to communicate with the machine-exec server
	 * @param container name of the DevWorkspace component that represents a container to open a terminal to
	 * @param workdir optional working directory for a created terminal
	 * @param commandLine optional command that will be passed to the terminal
	 */
	constructor(private machineExecClient: MachineExecClient, private container: string, private workdir?: string, private commandLine?: string) {
	}

	onDidWrite: vscode.Event<string> = this.writeEmitter.event;

	onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

	onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;

	onDidChangeName?: vscode.Event<string> | undefined;

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		getOutputChannel().appendLine('New terminal session requested');

		this.terminalSession = await this.machineExecClient.createTerminalSession(this.container, this.workdir, this.commandLine, initialDimensions?.columns, initialDimensions?.rows);
		this.terminalSession.onOutput(e => this.writeEmitter.fire(e));
		this.terminalSession.onExit(e => this.closeEmitter.fire(e));
	}

	close(): void {
		getOutputChannel().appendLine(`Terminal session end requested: ID ${this.terminalSession?.id}`);

		this.terminalSession?.send('\x03');
	}

	handleInput?(data: string): void {
		this.terminalSession?.send(data);
	}

	setDimensions?(dimensions: vscode.TerminalDimensions): void {
		getOutputChannel().appendLine(`Terminal session dimensions change requested: ID ${this.terminalSession?.id}. New dimensions: ${dimensions.columns}, ${dimensions.rows}`);

		this.terminalSession?.resize(dimensions.columns, dimensions.rows);
	}
}

export function deactivate(): void {
}
