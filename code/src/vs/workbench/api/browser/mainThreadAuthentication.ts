/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { getAuthenticationProviderActivationEvent, addAccountUsage } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IAuthenticationCreateSessionOptions, AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationProvider, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { ExtHostAuthenticationShape, ExtHostContext, MainContext, MainThreadAuthenticationShape } from '../common/extHost.protocol';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ActivationKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import type { AuthenticationGetSessionOptions } from 'vscode';
import { Emitter, Event } from 'vs/base/common/event';


export class MainThreadAuthenticationProvider extends Disposable implements IAuthenticationProvider {

	readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;

	constructor(
		private readonly _proxy: ExtHostAuthenticationShape,
		public readonly id: string,
		public readonly label: string,
		public readonly supportsMultipleAccounts: boolean,
		private readonly notificationService: INotificationService,
		onDidChangeSessionsEmitter: Emitter<AuthenticationSessionsChangeEvent>,
	) {
		super();
		this.onDidChangeSessions = onDidChangeSessionsEmitter.event;
	}

	async getSessions(scopes?: string[]) {
		return this._proxy.$getSessions(this.id, scopes);
	}

	createSession(scopes: string[], options: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> {
		return this._proxy.$createSession(this.id, scopes, options);
	}

	async removeSession(sessionId: string): Promise<void> {
		await this._proxy.$removeSession(this.id, sessionId);
		this.notificationService.info(nls.localize('signedOut', "Successfully signed out."));
	}
}

@extHostNamedCustomer(MainContext.MainThreadAuthentication)
export class MainThreadAuthentication extends Disposable implements MainThreadAuthenticationShape {
	private readonly _proxy: ExtHostAuthenticationShape;

	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostAuthentication);

		this._register(this.authenticationService.onDidChangeSessions(e => {
			this._proxy.$onDidChangeAuthenticationSessions(e.providerId, e.label);
		}));
	}

	async $registerAuthenticationProvider(id: string, label: string, supportsMultipleAccounts: boolean): Promise<void> {
		const emitter = new Emitter<AuthenticationSessionsChangeEvent>();
		this._registrations.set(id, emitter);
		const provider = new MainThreadAuthenticationProvider(this._proxy, id, label, supportsMultipleAccounts, this.notificationService, emitter);
		this.authenticationService.registerAuthenticationProvider(id, provider);
	}

	$unregisterAuthenticationProvider(id: string): void {
		this._registrations.deleteAndDispose(id);
		this.authenticationService.unregisterAuthenticationProvider(id);
	}

	async $ensureProvider(id: string): Promise<void> {
		if (!this.authenticationService.isAuthenticationProviderRegistered(id)) {
			return await this.extensionService.activateByEvent(getAuthenticationProviderActivationEvent(id), ActivationKind.Immediate);
		}
	}

	$sendDidChangeSessions(providerId: string, event: AuthenticationSessionsChangeEvent): void {
		const obj = this._registrations.get(providerId);
		if (obj instanceof Emitter) {
			obj.fire(event);
		}
	}

	$removeSession(providerId: string, sessionId: string): Promise<void> {
		return this.authenticationService.removeSession(providerId, sessionId);
	}
	private async loginPrompt(providerName: string, extensionName: string, recreatingSession: boolean, detail?: string): Promise<boolean> {
		const message = recreatingSession
			? nls.localize('confirmRelogin', "The extension '{0}' wants you to sign in again using {1}.", extensionName, providerName)
			: nls.localize('confirmLogin', "The extension '{0}' wants to sign in using {1}.", extensionName, providerName);
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Info,
			message,
			detail,
			primaryButton: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow")
		});

		return confirmed;
	}

	private async doGetSession(providerId: string, scopes: string[], extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const sessions = await this.authenticationService.getSessions(providerId, scopes, true);
		const supportsMultipleAccounts = this.authenticationService.supportsMultipleAccounts(providerId);

		// Error cases
		if (options.forceNewSession && options.createIfNone) {
			throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, createIfNone');
		}
		if (options.forceNewSession && options.silent) {
			throw new Error('Invalid combination of options. Please remove one of the following: forceNewSession, silent');
		}
		if (options.createIfNone && options.silent) {
			throw new Error('Invalid combination of options. Please remove one of the following: createIfNone, silent');
		}

		// Check if the sessions we have are valid
		if (!options.forceNewSession && sessions.length) {
			if (supportsMultipleAccounts) {
				if (options.clearSessionPreference) {
					// Clearing the session preference is usually paired with createIfNone, so just remove the preference and
					// defer to the rest of the logic in this function to choose the session.
					this.authenticationService.removeSessionPreference(providerId, extensionId, scopes);
				} else {
					// If we have an existing session preference, use that. If not, we'll return any valid session at the end of this function.
					const existingSessionPreference = this.authenticationService.getSessionPreference(providerId, extensionId, scopes);
					if (existingSessionPreference) {
						const matchingSession = sessions.find(session => session.id === existingSessionPreference);
						if (matchingSession && this.authenticationService.isAccessAllowed(providerId, matchingSession.account.label, extensionId)) {
							return matchingSession;
						}
					}
				}
			} else if (this.authenticationService.isAccessAllowed(providerId, sessions[0].account.label, extensionId)) {
				return sessions[0];
			}
		}

		// We may need to prompt because we don't have a valid session
		// modal flows
		console.log(`>>>>> EXISTING options.silent: ${options.silent}`);

		if (options.silent) {
			options.silent = false;
			options.createIfNone = true;
		}

		if (options.createIfNone || options.forceNewSession) {
			const providerName = this.authenticationService.getLabel(providerId);
			const detail = (typeof options.forceNewSession === 'object') ? options.forceNewSession.detail : undefined;

			// We only want to show the "recreating session" prompt if we are using forceNewSession & there are sessions
			// that we will be "forcing through".
			const recreatingSession = !!(options.forceNewSession && sessions.length);
			const isAllowed = await this.loginPrompt(providerName, extensionName, recreatingSession, detail);
			if (!isAllowed) {
				throw new Error('User did not consent to login.');
			}

			let session;
			if (sessions?.length && !options.forceNewSession) {
				session = supportsMultipleAccounts
					? await this.authenticationService.selectSession(providerId, extensionId, extensionName, scopes, sessions)
					: sessions[0];
			} else {
				let sessionToRecreate: AuthenticationSession | undefined;
				if (typeof options.forceNewSession === 'object' && options.forceNewSession.sessionToRecreate) {
					sessionToRecreate = options.forceNewSession.sessionToRecreate as AuthenticationSession;
				} else {
					const sessionIdToRecreate = this.authenticationService.getSessionPreference(providerId, extensionId, scopes);
					sessionToRecreate = sessionIdToRecreate ? sessions.find(session => session.id === sessionIdToRecreate) : undefined;
				}
				session = await this.authenticationService.createSession(providerId, scopes, { activateImmediate: true, sessionToRecreate });
			}

			this.authenticationService.updateAllowedExtension(providerId, session.account.label, extensionId, extensionName, true);
			this.authenticationService.updateSessionPreference(providerId, extensionId, session);
			return session;
		}

		// For the silent flows, if we have a session, even though it may not be the user's preference, we'll return it anyway because it might be for a specific
		// set of scopes.
		const validSession = sessions.find(session => this.authenticationService.isAccessAllowed(providerId, session.account.label, extensionId));
		if (validSession) {
			// Migration. If we have a valid session, but no preference, we'll set the preference to the valid session.
			// TODO: Remove this after in a few releases.
			if (!this.authenticationService.getSessionPreference(providerId, extensionId, scopes)) {
				if (this.storageService.get(`${extensionName}-${providerId}`, StorageScope.APPLICATION)) {
					this.storageService.remove(`${extensionName}-${providerId}`, StorageScope.APPLICATION);
				}
				this.authenticationService.updateAllowedExtension(providerId, validSession.account.label, extensionId, extensionName, true);
				this.authenticationService.updateSessionPreference(providerId, extensionId, validSession);
			}
			return validSession;
		}

		// passive flows (silent or default)
		// console.log(`>>>>> EXISTING options.silent: ${options.silent}`);
		// options.silent = false;
		if (!options.silent) {
			// If there is a potential session, but the extension doesn't have access to it, use the "grant access" flow,
			// otherwise request a new one.
			sessions.length
				? this.authenticationService.requestSessionAccess(providerId, extensionId, extensionName, scopes, sessions)
				: await this.authenticationService.requestNewSession(providerId, scopes, extensionId, extensionName);
		}
		return undefined;
	}

	async $getSession(providerId: string, scopes: string[], extensionId: string, extensionName: string, options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		const session = await this.doGetSession(providerId, scopes, extensionId, extensionName, options);

		if (session) {
			this.sendProviderUsageTelemetry(extensionId, providerId);
			addAccountUsage(this.storageService, providerId, session.account.label, extensionId, extensionName);
		}

		return session;
	}

	async $getSessions(providerId: string, scopes: readonly string[], extensionId: string, extensionName: string): Promise<AuthenticationSession[]> {
		const sessions = await this.authenticationService.getSessions(providerId, [...scopes], true);
		const accessibleSessions = sessions.filter(s => this.authenticationService.isAccessAllowed(providerId, s.account.label, extensionId));
		if (accessibleSessions.length) {
			this.sendProviderUsageTelemetry(extensionId, providerId);
			for (const session of accessibleSessions) {
				addAccountUsage(this.storageService, providerId, session.account.label, extensionId, extensionName);
			}
		}
		return accessibleSessions;
	}

	private sendProviderUsageTelemetry(extensionId: string, providerId: string): void {
		type AuthProviderUsageClassification = {
			owner: 'TylerLeonhardt';
			comment: 'Used to see which extensions are using which providers';
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
			providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider id.' };
		};
		this.telemetryService.publicLog2<{ extensionId: string; providerId: string }, AuthProviderUsageClassification>('authentication.providerUsage', { providerId, extensionId });
	}
}
