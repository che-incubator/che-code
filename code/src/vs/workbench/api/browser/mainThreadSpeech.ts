/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostContext, ExtHostSpeechShape, MainContext, MainThreadSpeechShape } from 'vs/workbench/api/common/extHost.protocol';
import { IKeywordRecognitionEvent, ISpeechProviderMetadata, ISpeechService, ISpeechToTextEvent } from 'vs/workbench/contrib/speech/common/speechService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

type SpeechToTextSession = {
	readonly onDidChange: Emitter<ISpeechToTextEvent>;
};

type KeywordRecognitionSession = {
	readonly onDidChange: Emitter<IKeywordRecognitionEvent>;
};

@extHostNamedCustomer(MainContext.MainThreadSpeech)
export class MainThreadSpeech implements MainThreadSpeechShape {

	private readonly proxy: ExtHostSpeechShape;

	private readonly providerRegistrations = new Map<number, IDisposable>();

	private readonly speechToTextSessions = new Map<number, SpeechToTextSession>();
	private readonly keywordRecognitionSessions = new Map<number, KeywordRecognitionSession>();

	constructor(
		extHostContext: IExtHostContext,
		@ISpeechService private readonly speechService: ISpeechService,
		@ILogService private readonly logService: ILogService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostSpeech);
	}

	$registerProvider(handle: number, identifier: string, metadata: ISpeechProviderMetadata): void {
		this.logService.trace('[Speech] extension registered provider', metadata.extension.value);

		const registration = this.speechService.registerSpeechProvider(identifier, {
			metadata,
			createSpeechToTextSession: token => {
				if (token.isCancellationRequested) {
					return {
						onDidChange: Event.None
					};
				}

				const disposables = new DisposableStore();
				const session = Math.random();

				this.proxy.$createSpeechToTextSession(handle, session);

				const onDidChange = disposables.add(new Emitter<ISpeechToTextEvent>());
				this.speechToTextSessions.set(session, { onDidChange });

				disposables.add(token.onCancellationRequested(() => {
					this.proxy.$cancelSpeechToTextSession(session);
					this.speechToTextSessions.delete(session);
					disposables.dispose();
				}));

				return {
					onDidChange: onDidChange.event
				};
			},
			createKeywordRecognitionSession: token => {
				if (token.isCancellationRequested) {
					return {
						onDidChange: Event.None
					};
				}

				const disposables = new DisposableStore();
				const session = Math.random();

				this.proxy.$createKeywordRecognitionSession(handle, session);

				const onDidChange = disposables.add(new Emitter<IKeywordRecognitionEvent>());
				this.keywordRecognitionSessions.set(session, { onDidChange });

				disposables.add(token.onCancellationRequested(() => {
					this.proxy.$cancelKeywordRecognitionSession(session);
					this.keywordRecognitionSessions.delete(session);
					disposables.dispose();
				}));

				return {
					onDidChange: onDidChange.event
				};
			}
		});
		this.providerRegistrations.set(handle, {
			dispose: () => {
				registration.dispose();
			}
		});
	}

	$unregisterProvider(handle: number): void {
		const registration = this.providerRegistrations.get(handle);
		if (registration) {
			registration.dispose();
			this.providerRegistrations.delete(handle);
		}
	}

	$emitSpeechToTextEvent(session: number, event: ISpeechToTextEvent): void {
		const providerSession = this.speechToTextSessions.get(session);
		providerSession?.onDidChange.fire(event);
	}

	$emitKeywordRecognitionEvent(session: number, event: IKeywordRecognitionEvent): void {
		const providerSession = this.keywordRecognitionSessions.get(session);
		providerSession?.onDidChange.fire(event);
	}

	dispose(): void {
		this.providerRegistrations.forEach(disposable => disposable.dispose());
		this.providerRegistrations.clear();

		this.speechToTextSessions.forEach(session => session.onDidChange.dispose());
		this.speechToTextSessions.clear();

		this.keywordRecognitionSessions.forEach(session => session.onDidChange.dispose());
		this.keywordRecognitionSessions.clear();
	}
}
