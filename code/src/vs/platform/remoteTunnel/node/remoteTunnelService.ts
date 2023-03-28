/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, ConnectionInfo, IRemoteTunnelAccount, IRemoteTunnelService, LOGGER_NAME, LOG_ID, TunnelStates, TunnelStatus } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogger, ILoggerService, LogLevelToString } from 'vs/platform/log/common/log';
import { dirname, join } from 'vs/base/common/path';
import { ChildProcess, spawn } from 'child_process';
import { IProductService } from 'vs/platform/product/common/productService';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { ISharedProcessLifecycleService } from 'vs/platform/lifecycle/node/sharedProcessLifecycleService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { hostname, homedir } from 'os';

type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Remote Tunnel access is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag indicating if Remote Tunnel Access is enabled or not' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
};

const restartTunnelOnConfigurationChanges: readonly string[] = [
	CONFIGURATION_KEY_HOST_NAME,
	CONFIGURATION_KEY_PREVENT_SLEEP,
];

/**
 * This service runs on the shared service. It is running the `code-tunnel` command
 * to make the current machine available for remote access.
 */
export class RemoteTunnelService extends Disposable implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidTokenFailedEmitter = new Emitter<boolean>();
	public readonly onDidTokenFailed = this._onDidTokenFailedEmitter.event;

	private readonly _onDidChangeTunnelStatusEmitter = new Emitter<TunnelStatus>();
	public readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;

	private readonly _onDidChangeAccountEmitter = new Emitter<IRemoteTunnelAccount | undefined>();
	public readonly onDidChangeAccount = this._onDidChangeAccountEmitter.event;

	private readonly _logger: ILogger;

	private _account: IRemoteTunnelAccount | undefined;
	private _tunnelProcess: CancelablePromise<void> | undefined;

	private _tunnelStatus: TunnelStatus = TunnelStates.disconnected;
	private _startTunnelProcessDelayer: Delayer<void>;

	private _tunnelCommand: string | undefined;


	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessLifecycleService sharedProcessLifecycleService: ISharedProcessLifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._logger = this._register(loggerService.createLogger(LOG_ID, { name: LOGGER_NAME }));
		this._startTunnelProcessDelayer = new Delayer(100);

		this._register(this._logger.onDidChangeLogLevel(l => this._logger.info('Log level changed to ' + LogLevelToString(l))));

		this._register(sharedProcessLifecycleService.onWillShutdown(() => {
			this._tunnelProcess?.cancel();
			this._tunnelProcess = undefined;
			this.dispose();
		}));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (restartTunnelOnConfigurationChanges.some(c => e.affectsConfiguration(c))) {
				this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			}
		}));
	}

	async getAccount(): Promise<IRemoteTunnelAccount | undefined> {
		return this._account;
	}

	async updateAccount(account: IRemoteTunnelAccount | undefined): Promise<TunnelStatus> {
		if (account && this._account ? account.token !== this._account.token || account.providerId !== this._account.providerId : account !== this._account) {
			this._account = account;
			this._onDidChangeAccountEmitter.fire(account);

			if (account) {
				this._logger.info(`Account updated: ${account.accountLabel} (${account.providerId})`);
			} else {
				this._logger.info(`Account reset`);
			}

			this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', { enabled: !!account });

			try {
				await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			} catch (e) {
				this._logger.error(e);
			}
		}
		return this._tunnelStatus;
	}

	private getTunnelCommandLocation() {
		if (!this._tunnelCommand) {
			let binParentLocation;
			if (isMacintosh) {
				// appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
				// bin = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin
				binParentLocation = this.environmentService.appRoot;
			} else {
				// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
				// bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
				// appRoot = /usr/share/code-insiders/resources/app
				// bin = /usr/share/code-insiders/bin
				binParentLocation = dirname(dirname(this.environmentService.appRoot));
			}
			this._tunnelCommand = join(binParentLocation, 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
		}
		return this._tunnelCommand;
	}

	private async updateTunnelProcess(): Promise<void> {
		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}
		if (!this._account) {
			this.setTunnelStatus(TunnelStates.disconnected);
			return;
		}
		const { token, providerId, accountLabel: accountName } = this._account;

		this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.authorizing', comment: ['{0} is a user account name, {1} a provider name (e.g. Github)'] }, 'Connecting as {0} ({1})', accountName, providerId)));
		const onOutput = (a: string, isErr: boolean) => {
			a = a.replaceAll(token, '*'.repeat(4));
			if (isErr) {
				this._logger.error(a);
			} else {
				this._logger.info(a);
			}
			if (!this.environmentService.isBuilt && a.startsWith('   Compiling')) {
				this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.building', 'Building CLI from sources')));
			}
		};
		const loginProcess = this.runCodeTunneCommand('login', ['user', 'login', '--provider', providerId, '--access-token', token, '--log', LogLevelToString(this._logger.getLevel())], onOutput);
		this._tunnelProcess = loginProcess;
		try {
			await loginProcess;
			if (this._tunnelProcess !== loginProcess) {
				return;
			}
		} catch (e) {
			this._logger.error(e);
			this._tunnelProcess = undefined;
			this._onDidTokenFailedEmitter.fire(true);
			this.setTunnelStatus(TunnelStates.disconnected);
			return;
		}

		const hostName = this._getHostName();
		if (hostName) {
			this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.openTunnelWithName', comment: ['{0} is a tunnel name'] }, 'Opening tunnel {0}', hostName)));
		} else {
			this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.openTunnel', 'Opening tunnel')));
		}
		const args = ['--parent-process-id', String(process.pid), '--accept-server-license-terms', '--log', LogLevelToString(this._logger.getLevel())];
		if (hostName) {
			args.push('--name', hostName);
		} else {
			args.push('--random-name');
		}
		if (this._preventSleep()) {
			args.push('--no-sleep');
		}
		const serveCommand = this.runCodeTunneCommand('tunnel', args, (message: string, isErr: boolean) => {
			if (isErr) {
				this._logger.error(message);
			} else {
				this._logger.info(message);
			}
			const m = message.match(/^\s*Open this link in your browser (https:\/\/([^\/\s]+)\/([^\/\s]+)\/([^\/\s]+))/);
			if (m) {
				const info: ConnectionInfo = { link: m[1], domain: m[2], hostName: m[4] };
				this.setTunnelStatus(TunnelStates.connected(info));
			} else if (message.match(/error refreshing token/)) {
				serveCommand.cancel();
				this._onDidTokenFailedEmitter.fire(true);
				this.setTunnelStatus(TunnelStates.disconnected);
			}
		});
		this._tunnelProcess = serveCommand;
		serveCommand.finally(() => {
			if (serveCommand === this._tunnelProcess) {
				// process exited unexpectedly
				this._logger.info(`tunnel process terminated`);
				this._tunnelProcess = undefined;
				this._account = undefined;

				this.setTunnelStatus(TunnelStates.disconnected);
			}
		});
	}

	public async getTunnelStatus(): Promise<TunnelStatus> {
		return this._tunnelStatus;
	}

	private setTunnelStatus(tunnelStatus: TunnelStatus) {
		this._tunnelStatus = tunnelStatus;
		this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
	}

	private runCodeTunneCommand(logLabel: string, commandArgs: string[], onOutput: (message: string, isError: boolean) => void = () => { }): CancelablePromise<void> {
		return createCancelablePromise<void>(token => {
			return new Promise((resolve, reject) => {
				if (token.isCancellationRequested) {
					resolve();
				}
				let tunnelProcess: ChildProcess | undefined;
				token.onCancellationRequested(() => {
					if (tunnelProcess) {
						this._logger.info(`${logLabel} terminating(${tunnelProcess.pid})`);
						tunnelProcess.kill();
					}
				});
				if (!this.environmentService.isBuilt) {
					onOutput('Building tunnel CLI from sources and run', false);
					onOutput(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(' ')}`, false);
					tunnelProcess = spawn('cargo', ['run', '--', 'tunnel', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli') });
				} else {
					onOutput('Running tunnel CLI', false);
					const tunnelCommand = this.getTunnelCommandLocation();
					onOutput(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(' ')}`, false);
					tunnelProcess = spawn(tunnelCommand, ['tunnel', ...commandArgs], { cwd: homedir() });
				}

				tunnelProcess.stdout!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, false);
					}
				});
				tunnelProcess.stderr!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, true);
					}
				});
				tunnelProcess.on('exit', e => {
					if (tunnelProcess) {
						onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
						tunnelProcess = undefined;
						if (e === 0) {
							resolve();
						} else {
							reject();
						}
					}
				});
				tunnelProcess.on('error', e => {
					if (tunnelProcess) {
						onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
						tunnelProcess = undefined;
						reject();
					}
				});
			});
		});
	}

	public async getHostName(): Promise<string | undefined> {
		return this._getHostName();
	}

	private _preventSleep() {
		return !!this.configurationService.getValue<boolean>(CONFIGURATION_KEY_PREVENT_SLEEP);
	}

	private _getHostName(): string | undefined {
		let name = this.configurationService.getValue<string>(CONFIGURATION_KEY_HOST_NAME) || hostname();
		name = name.replace(/^-+/g, '').replace(/[^\w-]/g, '').substring(0, 20);
		return name || undefined;
	}

}
