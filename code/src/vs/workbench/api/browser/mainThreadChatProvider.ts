/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ExtHostChatProviderShape, ExtHostContext, MainContext, MainThreadChatProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatResponseProviderMetadata, IChatResponseFragment, IChatProviderService, IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationProviderCreateSessionOptions, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadChatProvider)
export class MainThreadChatProvider implements MainThreadChatProviderShape {

	private readonly _proxy: ExtHostChatProviderShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<number, IProgress<IChatResponseFragment>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatProviderService private readonly _chatProviderService: IChatProviderService,
		@IExtensionFeaturesManagementService private readonly _extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);

		this._proxy.$updateLanguageModels({ added: _chatProviderService.getProviders() });
		this._store.add(_chatProviderService.onDidChangeProviders(this._proxy.$updateLanguageModels, this._proxy));
	}

	dispose(): void {
		this._providerRegistrations.dispose();
		this._store.dispose();
	}

	$registerProvider(handle: number, identifier: string, metadata: IChatResponseProviderMetadata): void {
		const dipsosables = new DisposableStore();
		dipsosables.add(this._chatProviderService.registerChatResponseProvider(identifier, {
			metadata,
			provideChatResponse: async (messages, from, options, progress, token) => {
				const requestId = (Math.random() * 1e6) | 0;
				this._pendingProgress.set(requestId, progress);
				try {
					await this._proxy.$provideLanguageModelResponse(handle, requestId, from, messages, options, token);
				} finally {
					this._pendingProgress.delete(requestId);
				}
			}
		}));
		if (metadata.auth) {
			dipsosables.add(this._registerAuthenticationProvider(metadata.extension, metadata.auth));
		}
		dipsosables.add(Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
			id: `lm-${identifier}`,
			label: localize('languageModels', "Language Model ({0})", `${identifier}-${metadata.model}`),
			access: {
				canToggle: false,
			},
		}));
		this._providerRegistrations.set(handle, dipsosables);
	}

	async $handleProgressChunk(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(chunk);
	}

	$unregisterProvider(handle: number): void {
		this._providerRegistrations.deleteAndDispose(handle);
	}

	async $prepareChatAccess(extension: ExtensionIdentifier, providerId: string, justification?: string): Promise<IChatResponseProviderMetadata | undefined> {
		const metadata = this._chatProviderService.lookupChatResponseProvider(providerId);
		// TODO: This should use a real activation event. Perhaps following what authentication does.
		for (let i = 0; i < 3; i++) {
			if (metadata) {
				return metadata;
			}
			await timeout(2000);
		}
		return undefined;
	}

	async $fetchResponse(extension: ExtensionIdentifier, providerId: string, requestId: number, messages: IChatMessage[], options: {}, token: CancellationToken): Promise<any> {
		await this._extensionFeaturesManagementService.getAccess(extension, `lm-${providerId}`);

		this._logService.debug('[CHAT] extension request STARTED', extension.value, requestId);

		const task = this._chatProviderService.fetchChatResponse(providerId, extension, messages, options, new Progress(value => {
			this._proxy.$handleResponseFragment(requestId, value);
		}), token);

		task.catch(err => {
			this._logService.error('[CHAT] extension request ERRORED', err, extension.value, requestId);
			throw err;
		}).finally(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
		});

		return task;
	}

	private _registerAuthenticationProvider(extension: ExtensionIdentifier, auth: { providerLabel: string; accountLabel?: string | undefined }): IDisposable {
		// This needs to be done in both MainThread & ExtHost ChatProvider
		const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;

		// Only register one auth provider per extension
		if (this._authenticationService.getProviderIds().includes(authProviderId)) {
			return Disposable.None;
		}

		const accountLabel = auth.accountLabel ?? localize('languageModelsAccountId', 'Language Models');
		const disposables = new DisposableStore();
		this._authenticationService.registerAuthenticationProvider(authProviderId, new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabel));
		disposables.add(toDisposable(() => {
			this._authenticationService.unregisterAuthenticationProvider(authProviderId);
		}));
		disposables.add(this._authenticationService.onDidChangeSessions(async (e) => {
			if (e.providerId === authProviderId) {
				if (e.event.removed?.length) {
					const allowedExtensions = this._authenticationService.readAllowedExtensions(authProviderId, accountLabel);
					const extensionsToUpdateAccess = [];
					for (const allowed of allowedExtensions) {
						const from = await this._extensionService.getExtension(allowed.id);
						this._authenticationService.updateAllowedExtension(authProviderId, authProviderId, allowed.id, allowed.name, false);
						if (from) {
							extensionsToUpdateAccess.push({
								from: from.identifier,
								to: extension,
								enabled: false
							});
						}
					}
					this._proxy.$updateModelAccesslist(extensionsToUpdateAccess);
				}
			}
		}));
		disposables.add(this._authenticationService.onDidChangeExtensionSessionAccess(async (e) => {
			const allowedExtensions = this._authenticationService.readAllowedExtensions(authProviderId, accountLabel);
			const accessList = [];
			for (const allowedExtension of allowedExtensions) {
				const from = await this._extensionService.getExtension(allowedExtension.id);
				if (from) {
					accessList.push({
						from: from.identifier,
						to: extension,
						enabled: allowedExtension.allowed ?? true
					});
				}
			}
			this._proxy.$updateModelAccesslist(accessList);
		}));
		return disposables;
	}
}

// The fake AuthenticationProvider that will be used to gate access to the Language Model. There will be one per provider.
class LanguageModelAccessAuthProvider implements IAuthenticationProvider {
	supportsMultipleAccounts = false;

	// Important for updating the UI
	private _onDidChangeSessions: Emitter<AuthenticationSessionsChangeEvent> = new Emitter<AuthenticationSessionsChangeEvent>();
	onDidChangeSessions: Event<AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private _session: AuthenticationSession | undefined;

	constructor(readonly id: string, readonly label: string, private readonly _accountLabel: string) { }

	async getSessions(scopes?: string[] | undefined): Promise<readonly AuthenticationSession[]> {
		// If there are no scopes and no session that means no extension has requested a session yet
		// and the user is simply opening the Account menu. In that case, we should not return any "sessions".
		if (scopes === undefined && !this._session) {
			return [];
		}
		if (this._session) {
			return [this._session];
		}
		return [await this.createSession(scopes || [], {})];
	}
	async createSession(scopes: string[], options: IAuthenticationProviderCreateSessionOptions): Promise<AuthenticationSession> {
		this._session = this._createFakeSession(scopes);
		this._onDidChangeSessions.fire({ added: [this._session], changed: [], removed: [] });
		return this._session;
	}
	removeSession(sessionId: string): Promise<void> {
		if (this._session) {
			this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session!] });
			this._session = undefined;
		}
		return Promise.resolve();
	}

	private _createFakeSession(scopes: string[]): AuthenticationSession {
		return {
			id: 'fake-session',
			account: {
				id: this.id,
				label: this._accountLabel,
			},
			accessToken: 'fake-access-token',
			scopes,
		};
	}
}
