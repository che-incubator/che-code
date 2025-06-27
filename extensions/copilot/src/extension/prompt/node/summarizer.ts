/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { TurnStatus } from '../common/conversation';
import { addHistoryToConversation } from './chatParticipantRequestHandler';

// Simple prompt template for summarization
// Consider adopting the more sophisticated summarizedConversationHistory.tsx
class SummaryPrompt {
	render() {
		return {
			messages: [
				{
					role: 'system' as const,
					content: `You are an expert at summarizing chat conversations. You will be provided a series of user/assistant message pairs in chronological order.
The user is iterating on a feature specification, bug fix, or other common programming task.
There may be relevant code snippets or files referenced in the conversation.
The user is collaborating with the assistant to refine their ideas and solutions, course-correcting the assistant as needed.
The user will provide feedback on the assistant's suggestions and may request changes or improvements.
Disregard messages that the user has indicated are incorrect, irrelevant, or unhelpful.
Preserve relevant and actiionable context and key information.

Structure your summary using the following format:

TITLE: A brief title for the summary
TASK DESCRIPTION: Main goals and user requirements
COMPLETED: What has been accomplished. Include file paths and other direct references.
PENDING: What still needs to be done
CODE STATE: Files discussed or modified. Provide code snippets or diffs that illustrate desired changes.
RELEVANT CODE/DOCUMENTATION SNIPPETS: Key code or documentation snippets from referenced files or discussions.
CHANGES: Key code changes made

If the conversation is long, keep the summary focused on the most recent task discussed. Prefer decisions in later messages over earlier ones`
				}
			]
		};
	}
}

export class ChatSummarizerProvider implements vscode.ChatSummarizer {

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEndpointProvider private endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async provideChatSummary(
		context: vscode.ChatContext,
		token: vscode.CancellationToken,
	): Promise<string> {

		const { turns } = this.instantiationService.invokeFunction(accessor => addHistoryToConversation(accessor, context.history));
		if (turns.filter(t => t.responseStatus === TurnStatus.Success).length === 0) {
			return '';
		}

		const endpoint = await this.endpointProvider.getChatEndpoint('gpt-4o-mini');

		// Use simple approach like TitlePrompt
		const summaryPrompt = new SummaryPrompt();
		const { messages: systemMessages } = summaryPrompt.render();

		// Condense each turn into a single user message containing both request and response
		const conversationContent = turns
			.filter(turn => turn.request?.message && turn.responseMessage?.message)
			.map(turn => {
				const userMsg = turn.request?.message || '';
				const assistantMsg = turn.responseMessage?.message || '';
				return `User: ${userMsg}\n\nAssistant: ${assistantMsg}`;
			})
			.join('\n\n---\n\n');

		const conversationMessages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.User,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Text,
					text: `Here is the conversation to summarize:\n\n${conversationContent}\n\nPlease summarize the conversation above.`
				}]
			}
		];

		const allMessages: Raw.ChatMessage[] = [
			{
				role: Raw.ChatRole.System,
				content: [{
					type: Raw.ChatCompletionContentPartKind.Text,
					text: systemMessages[0].content as string
				}]
			},
			...conversationMessages
		];

		const response = await endpoint.makeChatRequest(
			'summarize',
			allMessages,
			undefined,
			token,
			ChatLocation.Panel,
			undefined,
			undefined,
			false
		);

		if (token.isCancellationRequested) {
			return '';
		}

		if (response.type === ChatFetchResponseType.Success) {
			let summary = response.value.trim();
			if (summary.match(/^".*"$/)) {
				summary = summary.slice(1, -1);
			}

			return summary;
		} else {
			this.logService.logger.error(`Failed to fetch conversation summary because of response type (${response.type}) and reason (${response.reason})`);
			return '';
		}
	}
}
