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

import * as os from 'os';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { createURITransformer } from 'vs/workbench/api/node/uriTransformer';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { IProcessDataEvent, IShellLaunchConfigDto, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ICreateTerminalProcessResult, IWorkspaceFolderData } from 'vs/workbench/contrib/terminal/common/remoteTerminalChannel';
import { buildUserEnvironment } from 'vs/server/node/extensionHostConnection';
import * as WS from 'ws';
import * as path from 'path';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise } from 'vs/base/common/async';
import * as jsYaml from 'js-yaml';
import { Promises } from 'vs/base/node/pfs';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import * as platform from 'vs/base/common/platform';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IServerEnvironmentService } from '../serverEnvironmentService';
import { isUriComponents } from 'vs/platform/terminal/common/terminalProfiles';

class CustomVariableResolver extends AbstractVariableResolverService {
	constructor(
		env: platform.IProcessEnvironment,
		workspaceFolders: IWorkspaceFolder[],
		activeFileResource: URI | undefined,
		resolvedVariables: { [name: string]: string },
		extensionService: IExtensionManagementService,
	) {
		super({
			getFolderUri: (folderName: string): URI | undefined => {
				const found = workspaceFolders.filter(f => f.name === folderName);
				if (found && found.length > 0) {
					return found[0].uri;
				}
				return undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceFolders.length;
			},
			getConfigurationValue: (folderUri: URI, section: string): string | undefined => {
				return resolvedVariables[`config:${section}`];
			},
			getExecPath: (): string | undefined => {
				return env['VSCODE_EXEC_PATH'];
			},
			getAppRoot: (): string | undefined => {
				return env['VSCODE_CWD'];
			},
			getFilePath: (): string | undefined => {
				if (activeFileResource) {
					return path.normalize(activeFileResource.fsPath);
				}
				return undefined;
			},
			getSelectedText: (): string | undefined => {
				return resolvedVariables['selectedText'];
			},
			getLineNumber: (): string | undefined => {
				return resolvedVariables['lineNumber'];
			},
			getExtension: async id => {
				const installed = await extensionService.getInstalled();
				const found = installed.find(e => e.identifier.id === id);
				return found && { extensionLocation: found.location };
			},
		}, undefined, Promise.resolve(os.homedir()), Promise.resolve(env));
	}
}

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

	constructor(private readonly serverEnvironmentService: IServerEnvironmentService,
		private extensionManagementService: IExtensionManagementService,
		private readonly logService: ILogService) {
		this.machineExecWebSocket = new ReconnectingWebSocket('ws://localhost:3333/connect', this.terminals, this.terminalIds, this._onProcessData, this._onProcessReady, this._onProcessExit, this.deferredContainers);
	}


	async call<T>(ctx: RemoteAgentConnectionContext, command: string, args?: any, cancellationToken?: CancellationToken): Promise<any> {
		this.logService.debug('RemoteTerminalMachineExecChannel#call: ', ctx, command, args);

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
			const uriTransformer = createURITransformer(ctx.remoteAuthority);
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

			let machineExecComponent, machineExecCwd;

			const componentParam = ' --component'
			const cmdIndex = commandLine.findIndex(item => item?.includes(componentParam));
			if (cmdIndex > -1) {
				const taskCommandLine = commandLine[cmdIndex];
				const startIndex = taskCommandLine?.indexOf(componentParam)!;
				// In case of a request for running a task,
				// Che target component name is provided as a command line argument.
				machineExecComponent = taskCommandLine?.substring(startIndex + componentParam.length + 1);
				commandLine.splice(cmdIndex, 1, taskCommandLine?.substring(0, startIndex));

				if (isUriComponents(resolvedShellLaunchConfig.cwd)) {
					machineExecCwd = resolvedShellLaunchConfig.cwd.path;
				}
			} else {
				// In case of a request for starting a terminal session,
				// terminal profile name already contains Che target component.
				machineExecComponent = resolvedShellLaunchConfig.name;

				// Get the initial cwd
				const reviveWorkspaceFolder = (workspaceData: IWorkspaceFolderData): IWorkspaceFolder => {
					return {
						uri: URI.revive(uriTransformer.transformIncoming(workspaceData.uri)),
						name: workspaceData.name,
						index: workspaceData.index,
						toResource: () => {
							throw new Error('Not implemented');
						}
					};
				};
				const baseEnv = await buildUserEnvironment(args.resolverEnv, !!args.shellLaunchConfig.useShellEnvironment, platform.language, this.serverEnvironmentService, this.logService);

				const workspaceFolders = args.workspaceFolders.map(reviveWorkspaceFolder);
				const activeWorkspaceFolder = args.activeWorkspaceFolder ? reviveWorkspaceFolder(args.activeWorkspaceFolder) : undefined;
				const activeFileResource = args.activeFileResource ? URI.revive(uriTransformer.transformIncoming(args.activeFileResource)) : undefined;
				const customVariableResolver = new CustomVariableResolver(baseEnv, workspaceFolders, activeFileResource, args.resolvedVariables, this.extensionManagementService);

				const variableResolver = terminalEnvironment.createVariableResolver(activeWorkspaceFolder, process.env, customVariableResolver);
				machineExecCwd = await terminalEnvironment.getCwd( args.shellLaunchConfig, os.homedir(), variableResolver, activeWorkspaceFolder?.uri, args.configuration['terminal.integrated.cwd'], this.logService);
			}

			const openTerminalMachineExecCall = {
				identifier: {
					machineName: machineExecComponent,
					workspaceId: '1234',
				},
				cmd: commandLine,
				tty: true,
				cwd: machineExecCwd,
				cols: args.cols,
				rows: args.rows
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

		if (command === '$resize') {
			const resizeTerminalMachineExecCall = {
				id: args[0],
				cols: args[1],
				rows: args[2]
			};

			const jsonCommand = {
				jsonrpc: '2.0',
				method: 'resize',
				params: resizeTerminalMachineExecCall,
				id: -1
			};

			if (this.machineExecWebSocket) {
				this.machineExecWebSocket.send(JSON.stringify(jsonCommand));
			}

			return undefined;
		}

		this.logService.error(`RemoteTerminalChannel: unsupported command/${command}`);
		return {};
	}

	listen<T>(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
		this.logService.debug('RemoteTerminalMachineExecChannel#listen: ', ctx, event, arg);

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

		this.ws.on('message', async (data: WS.Data) => {
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
					const remoteContainers: string[] = message.result.map((containerInfo: any) => containerInfo.container);

					// read the original devfile to find the components that we want to have
					const originalDevworkspaceContent = await Promises.readFile(path.join('/devworkspace-metadata/', 'original.devworkspace.yaml'), 'utf-8');
					const devFileContent = jsYaml.load(originalDevworkspaceContent) as any;
					// search all component with a container
					const devfileComponents = devFileContent.components || [];
					const inDevfileComponentNames = devfileComponents.filter((component:any) => component.container).map((component :any)=> component.name)
					// keep only one that are inside the devfile
					const filteredContainers = remoteContainers.filter(containerName => inDevfileComponentNames.includes(containerName));
					this.deferredContainers.complete(filteredContainers);
					return;
				}

				// machine-exec responds a number of the created terminal session
				if (Number.isFinite(message.result)) {
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
				}
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
