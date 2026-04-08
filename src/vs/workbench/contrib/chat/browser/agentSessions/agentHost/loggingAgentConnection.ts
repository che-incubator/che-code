/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult, AgentHostIpcLoggingSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents, type ComponentToState, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ICreateTerminalParams } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from '../../../../../services/output/common/output.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * JSON replacer that serializes revived URI objects to their string form,
 * keeping the rest of the payload intact.
 */
function uriReplacer(_key: string, value: unknown): unknown {
	if (value && typeof value === 'object' && (value as { $mid?: unknown }).$mid !== undefined && (value as { scheme?: unknown }).scheme !== undefined) {
		return URI.revive(value as UriComponents).toString();
	}
	return value;
}

function formatPayload(data: unknown): string {
	if (data === undefined) {
		return '';
	}
	try {
		return JSON.stringify(data, uriReplacer, 2);
	} catch {
		return String(data);
	}
}

/**
 * A logging wrapper around an {@link IAgentConnection} that writes all IPC
 * traffic to a dedicated output channel. Used by both local and remote agent
 * host contributions to provide per-host IPC tracing.
 *
 * The output channel is registered on construction and removed on dispose,
 * so its lifetime matches the connection.
 *
 * All method calls, results, errors, and events are logged with arrows:
 * - `>>` for outgoing calls
 * - `<<` for results
 * - `!!` for errors
 * - `**` for events (onDidAction, onDidNotification)
 */
export class LoggingAgentConnection extends Disposable implements IAgentConnection {

	declare readonly _serviceBrand: undefined;

	private static readonly _instances = new WeakMap<IAgentConnection, LoggingAgentConnection>();

	/**
	 * Returns an existing {@link LoggingAgentConnection} for the given inner
	 * connection, or creates one if none exists yet. The channel ID and label
	 * from the first caller win.
	 *
	 * Callers that own the lifecycle of the connection (e.g. contributions)
	 * should register the result for disposal. When disposed, the cached
	 * instance is removed from the WeakMap so a fresh one can be created
	 * on next access.
	 */
	static getOrCreate(
		instantiationService: IInstantiationService,
		inner: IAgentConnection,
		channelLabel: string,
	): LoggingAgentConnection {
		let instance = LoggingAgentConnection._instances.get(inner);
		if (!instance) {
			instance = instantiationService.createInstance(LoggingAgentConnection, inner, `agenthost.${inner.clientId}`, channelLabel);
			const captured = instance;
			instance._register({ dispose: () => LoggingAgentConnection._instances.delete(inner) });
			LoggingAgentConnection._instances.set(inner, captured);
		}
		return instance;
	}

	private _outputChannel: IOutputChannel | undefined;
	private readonly _enabled: boolean;

	readonly clientId: string;
	readonly onDidAction: Event<IActionEnvelope>;
	readonly onDidNotification: Event<INotification>;

	constructor(
		private readonly _inner: IAgentConnection,
		public readonly channelId: string,
		private readonly _channelLabel: string,
		@IOutputService private readonly _outputService: IOutputService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.clientId = _inner.clientId;
		this._enabled = !!configurationService.getValue<boolean>(AgentHostIpcLoggingSettingId);

		if (this._enabled) {
			// Register the output channel
			const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
			registry.registerChannel({
				id: this.channelId,
				label: this._channelLabel,
				log: false,
				languageId: 'log',
			});
			this._register({ dispose: () => registry.removeChannel(this.channelId) });
		}

		// Wrap events with logging
		const onDidActionEmitter = this._register(new Emitter<IActionEnvelope>());
		this._register(_inner.onDidAction(e => {
			this._log('**', 'onDidAction', e);
			onDidActionEmitter.fire(e);
		}));
		this.onDidAction = onDidActionEmitter.event;

		const onDidNotificationEmitter = this._register(new Emitter<INotification>());
		this._register(_inner.onDidNotification(e => {
			this._log('**', 'onDidNotification', e);
			onDidNotificationEmitter.fire(e);
		}));
		this.onDidNotification = onDidNotificationEmitter.event;
	}

	// ---- IAgentConnection method proxies with logging -----------------------

	async authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		return this._logCall('authenticate', params, () => this._inner.authenticate(params));
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._logCall('listSessions', undefined, () => this._inner.listSessions());
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		return this._logCall('createSession', config, () => this._inner.createSession(config));
	}

	async disposeSession(session: URI): Promise<void> {
		return this._logCall('disposeSession', session, () => this._inner.disposeSession(session));
	}

	async createTerminal(params: ICreateTerminalParams): Promise<void> {
		return this._logCall('createTerminal', params, () => this._inner.createTerminal(params));
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		return this._logCall('disposeTerminal', terminal, () => this._inner.disposeTerminal(terminal));
	}

	get rootState(): IAgentSubscription<IRootState> {
		return this._inner.rootState;
	}

	getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this._inner.getSubscription(kind, resource);
	}

	dispatch(action: ISessionAction | ITerminalAction): void {
		this._log('>>', 'dispatch', action);
		this._inner.dispatch(action);
	}

	async resourceList(uri: URI): Promise<IResourceListResult> {
		return this._logCall('resourceList', uri, () => this._inner.resourceList(uri));
	}

	async resourceRead(uri: URI): Promise<IResourceReadResult> {
		return this._logCall('resourceRead', uri, () => this._inner.resourceRead(uri));
	}

	async resourceWrite(params: IResourceWriteParams): Promise<IResourceWriteResult> {
		return this._logCall('resourceWrite', params, () => this._inner.resourceWrite(params));
	}

	async resourceCopy(params: IResourceCopyParams): Promise<IResourceCopyResult> {
		return this._logCall('resourceCopy', params, () => this._inner.resourceCopy(params));
	}

	async resourceDelete(params: IResourceDeleteParams): Promise<IResourceDeleteResult> {
		return this._logCall('resourceDelete', params, () => this._inner.resourceDelete(params));
	}

	async resourceMove(params: IResourceMoveParams): Promise<IResourceMoveResult> {
		return this._logCall('resourceMove', params, () => this._inner.resourceMove(params));
	}

	// ---- Public logging API for callers' catch blocks -----------------------

	/**
	 * Log an error to the output channel. Use this from caller catch blocks
	 * so connection errors appear in the per-host channel.
	 */
	logError(context: string, error: unknown): void {
		this._log('!!', context, error instanceof Error ? error.message : String(error));
	}

	// ---- Internal helpers ---------------------------------------------------

	private async _logCall<T>(method: string, params: unknown, fn: () => Promise<T>): Promise<T> {
		this._log('>>', method, params);
		try {
			const result = await fn();
			this._log('<<', method, result);
			return result;
		} catch (err) {
			this._log('!!', method, err instanceof Error ? err.message : String(err));
			throw err;
		}
	}

	private _log(arrow: string, method: string, data?: unknown): void {
		if (!this._enabled) {
			return;
		}

		if (!this._outputChannel) {
			this._outputChannel = this._outputService.getChannel(this.channelId);
			if (!this._outputChannel) {
				return;
			}
		}

		const timestamp = new Date().toISOString();
		const payload = formatPayload(data);
		this._outputChannel.append(`[${timestamp}] ${arrow} ${method}${payload ? `\n${payload}` : ''}\n`);
	}
}
