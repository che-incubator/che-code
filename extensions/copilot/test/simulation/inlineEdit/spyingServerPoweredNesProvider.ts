/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServerPoweredInlineEditProvider } from '../../../src/extension/inlineEdits/node/serverPoweredInlineEditProvider';
import { IChatMLFetcher } from '../../../src/platform/chat/common/chatMLFetcher';
import { SpyingChatMLFetcher } from '../../base/spyingChatMLFetcher';
import { InterceptedRequest } from '../shared/sharedTypes';

export class SpyingServerPoweredNesProvider extends ServerPoweredInlineEditProvider {

	override spyOnPromptAndResponse(fetcher: IChatMLFetcher, { user_prompt, model_response }: { user_prompt: string; model_response: string }) {
		if (fetcher instanceof SpyingChatMLFetcher) {
			fetcher.requestCollector.addInterceptedRequest(Promise.resolve(new InterceptedRequest(
				user_prompt,
				{},
				{
					type: 'success',
					value: [model_response],
				},
				undefined,
				undefined,
			)));
		}
	}
}
