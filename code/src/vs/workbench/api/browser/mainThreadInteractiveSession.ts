/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtHostContext, ExtHostInteractiveSessionShape, IInteractiveRequestDto, MainContext, MainThreadInteractiveSessionShape } from 'vs/workbench/api/common/extHost.protocol';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { IInteractiveProgress, IInteractiveRequest, IInteractiveResponse, IInteractiveSession, IInteractiveSessionDynamicRequest, IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadInteractiveSession)
export class MainThreadInteractiveSession extends Disposable implements MainThreadInteractiveSessionShape {

	private readonly _registrations = this._register(new DisposableMap<number>());
	private readonly _activeRequestProgressCallbacks = new Map<string, (progress: IInteractiveProgress) => void>();

	private readonly _proxy: ExtHostInteractiveSessionShape;

	constructor(
		extHostContext: IExtHostContext,
		@IInteractiveSessionService private readonly _interactiveSessionService: IInteractiveSessionService,
		@IInteractiveSessionContributionService private readonly interactiveSessionContribService: IInteractiveSessionContributionService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostInteractiveSession);

		this._register(this._interactiveSessionService.onDidPerformUserAction(e => {
			this._proxy.$onDidPerformUserAction(e);
		}));
	}

	async $registerInteractiveSessionProvider(handle: number, id: string, implementsProgress: boolean): Promise<void> {
		if (this.productService.quality === 'stable') {
			this.logService.trace(`The interactive session API is not supported in stable VS Code.`);
			return;
		}

		const registration = this.interactiveSessionContribService.registeredProviders.find(staticProvider => staticProvider.id === id);
		if (!registration) {
			throw new Error(`Provider ${id} must be declared in the package.json.`);
		}

		const unreg = this._interactiveSessionService.registerProvider({
			id,
			progressiveRenderingEnabled: implementsProgress,
			prepareSession: async (initialState, token) => {
				const session = await this._proxy.$prepareInteractiveSession(handle, initialState, token);
				if (!session) {
					return undefined;
				}

				const responderAvatarIconUri = session.responderAvatarIconUri ?
					URI.revive(session.responderAvatarIconUri) :
					registration.extensionIcon;
				return <IInteractiveSession>{
					id: session.id,
					requesterUsername: session.requesterUsername,
					requesterAvatarIconUri: URI.revive(session.requesterAvatarIconUri),
					responderUsername: session.responderUsername,
					responderAvatarIconUri,
					inputPlaceholder: session.inputPlaceholder,
					dispose: () => {
						this._proxy.$releaseSession(session.id);
					}
				};
			},
			resolveRequest: async (session, context, token) => {
				const dto = await this._proxy.$resolveInteractiveRequest(handle, session.id, context, token);
				return <IInteractiveRequest>{
					session,
					...dto
				};
			},
			provideReply: async (request, progress, token) => {
				const id = `${handle}_${request.session.id}`;
				this._activeRequestProgressCallbacks.set(id, progress);
				try {
					const requestDto: IInteractiveRequestDto = {
						message: request.message,
					};
					const dto = await this._proxy.$provideInteractiveReply(handle, request.session.id, requestDto, token);
					return <IInteractiveResponse>{
						session: request.session,
						...dto
					};
				} finally {
					this._activeRequestProgressCallbacks.delete(id);
				}
			},
			provideSuggestions: (token) => {
				return this._proxy.$provideInitialSuggestions(handle, token);
			},
			provideWelcomeMessage: (token) => {
				return this._proxy.$provideWelcomeMessage(handle, token);
			},
			provideSlashCommands: (session, token) => {
				return this._proxy.$provideSlashCommands(handle, session.id, token);
			},
			provideFollowups: (session, token) => {
				return this._proxy.$provideFollowups(handle, session.id, token);
			}
		});

		this._registrations.set(handle, unreg);
	}

	$acceptInteractiveResponseProgress(handle: number, sessionId: number, progress: IInteractiveProgress): void {
		const id = `${handle}_${sessionId}`;
		this._activeRequestProgressCallbacks.get(id)?.(progress);
	}

	async $acceptInteractiveSessionState(sessionId: number, state: any): Promise<void> {
		this._interactiveSessionService.acceptNewSessionState(sessionId, state);
	}

	$addInteractiveSessionRequest(context: any): void {
		this._interactiveSessionService.addInteractiveRequest(context);
	}

	$sendInteractiveRequestToProvider(providerId: string, message: IInteractiveSessionDynamicRequest): void {
		return this._interactiveSessionService.sendInteractiveRequestToProvider(providerId, message);
	}

	async $unregisterInteractiveSessionProvider(handle: number): Promise<void> {
		this._registrations.deleteAndDispose(handle);
	}
}
