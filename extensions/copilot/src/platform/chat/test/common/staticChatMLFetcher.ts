/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { FinishedCallback, IResponseDelta, OptionalChatRequestParams } from '../../../networking/common/fetch';
import { IChatEndpoint } from '../../../networking/common/networking';
import { TelemetryProperties } from '../../../telemetry/common/telemetry';
import { IChatMLFetcher, IntentParams, Source } from '../../common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse, ChatResponses } from '../../common/commonTypes';

export type StaticChatMLFetcherInput = string | (string | IResponseDelta[])[];

export class StaticChatMLFetcher implements IChatMLFetcher {
	_serviceBrand: undefined;
	onDidMakeChatMLRequest = Event.None;
	private reqs = 0;

	constructor(public readonly value: StaticChatMLFetcherInput) { }

	async fetchOne(debugName: string, messages: Raw.ChatMessage[], finishedCb: FinishedCallback | undefined, token: CancellationToken, location: ChatLocation, endpoint: IChatEndpoint, source?: Source, requestOptions?: Omit<OptionalChatRequestParams, 'n'>, userInitiatedRequest?: boolean, telemetryProperties?: TelemetryProperties, intentParams?: IntentParams): Promise<ChatResponse> {
		// chunk up
		const value = typeof this.value === 'string'
			? this.value
			: (this.value.at(this.reqs++) || this.value.at(-1)!);

		const chunks: IResponseDelta[] = (Array.isArray(value) ? value : [value]).flatMap(value => {
			if (typeof value === 'string') {
				const chunks: IResponseDelta[] = [];
				for (let i = 0; i < value.length; i += 4) {
					const chunk = value.slice(i, i + 4);
					chunks.push({ text: chunk });
				}
				return chunks;
			} else {
				return value;
			}
		});

		// stream through finishedCb
		let responseSoFar = '';
		for (let i = 0; i < chunks.length; i++) {
			finishedCb?.(responseSoFar, i, chunks[i]);
			responseSoFar += chunks[i].text;
		}

		return { type: ChatFetchResponseType.Success, requestId: '', serverRequestId: '', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }, value: responseSoFar };
	}

	async fetchMany(debugName: string, messages: Raw.ChatMessage[], finishedCb: FinishedCallback | undefined, token: CancellationToken, location: ChatLocation, chatEndpointInfo: IChatEndpoint, source?: Source, requestOptions?: OptionalChatRequestParams, userInitiatedRequest?: boolean, telemetryProperties?: TelemetryProperties, intentParams?: IntentParams): Promise<ChatResponses> {
		throw new Error('Method not implemented.');
	}
}
