/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { FinishedCallback, OptionalChatRequestParams } from '../../../networking/common/fetch';
import { IChatEndpoint } from '../../../networking/common/networking';
import { TelemetryProperties } from '../../../telemetry/common/telemetry';
import { IChatMLFetcher, IntentParams, Source } from '../../common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse, ChatResponses } from '../../common/commonTypes';

export class MockChatMLFetcher implements IChatMLFetcher {
	_serviceBrand: undefined;
	onDidMakeChatMLRequest = Event.None;

	async fetchOne(debugName: string, messages: Raw.ChatMessage[], finishedCb: FinishedCallback | undefined, token: CancellationToken, location: ChatLocation, endpoint: IChatEndpoint, source?: Source, requestOptions?: Omit<OptionalChatRequestParams, 'n'>, userInitiatedRequest?: boolean, telemetryProperties?: TelemetryProperties, intentParams?: IntentParams): Promise<ChatResponse> {
		return { type: ChatFetchResponseType.Success, requestId: '', serverRequestId: '', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }, value: '' } satisfies ChatResponse;
	}

	async fetchMany(debugName: string, messages: Raw.ChatMessage[], finishedCb: FinishedCallback | undefined, token: CancellationToken, location: ChatLocation, chatEndpointInfo: IChatEndpoint, source?: Source, requestOptions?: OptionalChatRequestParams, userInitiatedRequest?: boolean, telemetryProperties?: TelemetryProperties, intentParams?: IntentParams): Promise<ChatResponses> {
		return { type: ChatFetchResponseType.Success, requestId: '', serverRequestId: '', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }, value: [''] } satisfies ChatResponses;
	}
}
