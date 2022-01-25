/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { CancellationToken } from 'vs/base/common/cancellation';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IProcessDataEvent, IShellLaunchConfigDto, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { ICreateTerminalProcessResult } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import * as WS from 'ws';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise } from 'vs/base/common/async';


/**
 * Handle the channel for the remote terminal using machine exec
 * @see RemoteTerminalChannelClient
 */
export class RemoteTerminalMachineExecChannel implements IServerChannel<RemoteAgentConnectionContext> {

	private readonly _onProcessData = new Emitter<{ id: number, event: IProcessDataEvent | string }>();
	readonly onProcessData = this._onProcessData.event;
	private readonly _onProcessReady = new Emitter<{ id: number, event: { pid: number, cwd: string } }>();
	readonly onProcessReady = this._onProcessReady.event;

	private readonly _onProcessExit = new Emitter<{ id: number, event: number | undefined }>();
	readonly onProcessExit = this._onProcessExit.event;


	private machineExecWebSocket: ReconnectingWebSocket | undefined;
	// start at 1 as there are some checks with id and then if (id) is returning false with 0
	private id: number = 1;

	private terminals: Map<number, WS> = new Map<number, WS>();
	private terminalIds: Map<number, number> = new Map<number, number>();

	private deferredContainers = new DeferredPromise<string[]>();

	constructor(private readonly logService: ILogService) {
		this.machineExecWebSocket = new ReconnectingWebSocket('ws://localhost:3333/connect', this.terminals, this.terminalIds, this._onProcessData, this._onProcessReady, this._onProcessExit, this.deferredContainers);
	}


	async call<T>(ctx: RemoteAgentConnectionContext, command: string, args?: any, cancellationToken?: CancellationToken): Promise<any> {
		// provide default shell to be like bash
		if ('$getDefaultSystemShell' === command) {
			return '/bin/bash';
		}

		if (command === '$getProfiles') {

			const availableContainers = await this.deferredContainers.p;

			return availableContainers.map(containerName => {
				const profile: ITerminalProfile = {
					profileName: containerName,
					path: '/bin/bash',
					isDefault: false,
					isAutoDetected: false,
					args: undefined,
					env: undefined,
					overrideName: true,
					color: 'f00',
				};
				return profile;
			});


			// // profile should provide all containers of the pod
			// const profile: ITerminalProfile = {
			// 	profileName: 'ubi8',
			// 	path: '/bin/bash',
			// 	isDefault: true,
			// 	isAutoDetected: false,
			// 	args: undefined,
			// 	env: undefined,
			// 	overrideName: true,
			// 	color: 'f00',
			// };

			// const profile2: ITerminalProfile = {
			// 	profileName: 'machine-exec',
			// 	path: '/bin/sh',
			// 	isDefault: true,
			// 	isAutoDetected: false,
			// 	args: undefined,
			// 	env: undefined,
			// 	overrideName: true,
			// 	color: 'f00',
			// };

			// return [profile, profile2];
		}
		if (command === '$start') {
			return undefined;
		}

		// args are like: [ 1, 'g' ]
		if (command === '$input') {
			// grab args
			this.terminals.get(args[0])?.send(args[1]);
			return undefined;
		}

		// args is a json object
		// @see ICreateTerminalProcessArguments
		if (command === '$createProcess') {
			const newId = this.id++;

			const resolvedShellLaunchConfig: IShellLaunchConfigDto = args.shellLaunchConfig;
			const createProcessResult: ICreateTerminalProcessResult = {
				persistentTerminalId: newId,
				resolvedShellLaunchConfig
			};

			const commandLine = [resolvedShellLaunchConfig.executable];
			if (resolvedShellLaunchConfig.args) {
				if (Array.isArray(resolvedShellLaunchConfig.args)) {
					commandLine.push(...resolvedShellLaunchConfig.args);
				} else {
					commandLine.push(resolvedShellLaunchConfig.args);
				}
			}

			const cwdUri = (typeof resolvedShellLaunchConfig.cwd === 'string') ? URI.parse(resolvedShellLaunchConfig.cwd) : URI.revive(resolvedShellLaunchConfig.cwd);

			const openTerminalMachineExecCall = {
				identifier: {
					machineName: resolvedShellLaunchConfig.name,
					workspaceId: '1234',
				},
				cmd: commandLine,
				tty: true,
				cwd: cwdUri?.path,
			};

			const jsonCommand = {
				jsonrpc: '2.0',
				method: 'create',
				params: openTerminalMachineExecCall,
				id: newId
			};

			if (this.machineExecWebSocket) {
				this.machineExecWebSocket.send(JSON.stringify(jsonCommand));
			}

			return createProcessResult;
		}

		this.logService.error(`RemoteTerminalChannel: unsupported command/${command}`);
		return undefined;
	}

	listen<T>(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {

		if (event === '$onProcessDataEvent') {
			return this.onProcessData;
		}
		if (event === '$onProcessReadyEvent') {
			return this.onProcessReady;
		}

		if (event === '$onProcessExitEvent') {
			return this.onProcessExit;
		}

		this.logService.trace(`RemoteTerminalChannel: unsupported event/${event}`);

		// FIXME: provide dummy event for now for unsupported case
		return new Emitter().event;

	}

}


/** Websocket wrapper allows to reconnect in case of failures */
export class ReconnectingWebSocket {
	/** Delay before trying to reconnect */
	private static RECONNECTION_DELAY: number = 10000;
	private static PING_INTERVAL: number = 30000;

	private reconnectionTimeout: NodeJS.Timeout | undefined;
	private pingIntervalID: NodeJS.Timeout | undefined;

	/** Instance of the websocket library. */
	private ws: WS | undefined;

	/** URL for connection */
	private readonly url: string;

	private readonly LIST_CONTAINERS_ID = -5;


	constructor(targetUrl: string,
		private terminals: Map<number, WS>,
		private terminalIds: Map<number, number>,
		private onProcessData: Emitter<{ id: number, event: IProcessDataEvent | string }>,
		private onProcessReady: Emitter<{ id: number, event: { pid: number, cwd: string } }>,
		private onProcessExit: Emitter<{ id: number, event: number | undefined }>,
		private deferredContainers: DeferredPromise<string[]>,

	) {
		this.url = targetUrl;
		this.open();
		this.onProcessData = onProcessData;
	}

	/** Open the websocket. If error, try to reconnect. */
	open(): void {
		this.ws = new WS(this.url);

		this.ws.on('open', () => {
			this.schedulePing();
		});

		this.ws.on('message', (data: WS.Data) => {
			try {
				const message = JSON.parse(data.toString());

				// is it RPC call ?
				if (message.method === 'connected') {
					// got connection message

					// ask the list of containers
					const jsonListContainersCommand = {
						jsonrpc: '2.0',
						method: 'listContainers',
						params: [],
						id: this.LIST_CONTAINERS_ID,
					};
					this.send(JSON.stringify(jsonListContainersCommand));
					return;
				}

				// handle error in the process
				if (message.method === 'onExecError') {
					// const errorMessage = message.params.stack;
					this.onProcessExit.fire({ id: this.terminalIds.get(message.params.id) || -1, event: -1 });
					return;
				}
				// handle successful end of the process
				if (message.method === 'onExecExit') {
					// exit with code 0
					this.onProcessExit.fire({ id: this.terminalIds.get(message.params.id) || -1, event: 0 });
					return;
				}

				// handle list of containers result
				if (message.id === this.LIST_CONTAINERS_ID) {
					// resolve with container attribute of containerInfo
					this.deferredContainers.complete(message.result.map((containerInfo: any) => containerInfo.container));
					return;
				}

				// connect to the embedded machine-exec
				const wsTerminal = new WS(`ws://localhost:3333/attach/${message.result}`);

				this.terminalIds.set(message.result, message.id);
				this.terminals.set(message.id, wsTerminal);

				// the shell is ready
				this.onProcessReady.fire({ id: message.id, event: { pid: message.id, cwd: '' } });

				// redirect everything to the client
				wsTerminal.on('message', (data: WS.Data) => {
					this.onProcessData.fire({ id: message.id, event: data.toString() });
				});
			} catch (e) {
				console.error('Unable to parse result', e);
			}
		});

		this.ws.on('close', (code: number, reason: string) => {
			this.onDidConnectionLose();

			if (code !== 1000) {
				this.reconnect(reason);
			}
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.ws.on('error', (error: any) => {
			this.onDidConnectionLose();

			if (error.code === 'ECONNREFUSED') {
				this.reconnect(error);
			}
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public send(data: any): void {
		if (this.ws) {
			try {
				this.ws.send(data);
			} catch (error) {
				this.ws.emit('error', error);
			}
		}
	}

	public close(): void {
		if (this.ws) {
			this.ws.removeAllListeners();
			this.onDidConnectionLose();

			this.ws.close(1000);
		}
	}

	private schedulePing(): void {
		if (this.ws) {
			this.pingIntervalID = setInterval(() => {
				if (this.ws) {
					this.ws.ping();
				}
			}, ReconnectingWebSocket.PING_INTERVAL);
		}
	}

	private reconnect(reason: string): void {
		if (this.ws) {

			this.ws.removeAllListeners();

			console.warn(
				`webSocket: Reconnecting in ${ReconnectingWebSocket.RECONNECTION_DELAY}ms due to ${reason}`
			);

			this.reconnectionTimeout = setTimeout(() => {
				console.warn('webSocket: Reconnecting...');
				this.open();
			}, ReconnectingWebSocket.RECONNECTION_DELAY);
		}
	}

	private onDidConnectionLose(): void {
		if (this.reconnectionTimeout) {
			clearTimeout(this.reconnectionTimeout);
		}

		if (this.pingIntervalID) {
			clearInterval(this.pingIntervalID);
		}
	}

}
