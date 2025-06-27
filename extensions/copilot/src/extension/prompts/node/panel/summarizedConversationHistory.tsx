/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PrioritizedList, PromptElement, PromptMetadata, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { BudgetExceededError } from '@vscode/prompt-tsx/dist/base/materialized';
import { ChatMessage } from '@vscode/prompt-tsx/dist/base/output/rawTypes';
import type { ChatResponsePart, LanguageModelToolInformation, NotebookDocument, Progress } from 'vscode';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Iterable } from '../../../../util/vs/base/common/iterator';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart2 } from '../../../../vscodeTypes';
import { ToolCallingLoop } from '../../../intents/node/toolCallingLoop';
import { IResultMetadata } from '../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCallRound } from '../../../prompt/common/intents';
import { ToolName } from '../../../tools/common/toolNames';
import { normalizeToolSchema } from '../../../tools/common/toolSchemaNormalizer';
import { NotebookSummary } from '../../../tools/node/notebookSummaryTool';
import { renderPromptElement } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { AgentUserMessage, getUserMessagePropsFromAgentProps, getUserMessagePropsFromTurn } from './editAgentPrompt';
import { ChatToolCalls } from './toolCalling';

export class ConversationHistorySummarizationPrompt extends PromptElement<SummarizedAgentHistoryProps> {
	constructor(
		props: SummarizedAgentHistoryProps,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		return (
			<>
				<SystemMessage priority={this.props.priority}>
					You are an expert at summarizing conversations in VS Code's agent mode, which uses a model to autonomously search for context and edit code based on a user-specified task description.<br />
					VS Code's agent mode has a character limit on the amount of in-memory context it can retain.<br />
					Your task is to write a note to yourself that summarizes the following conversation history concisely while preserving important context. In future, you will only be able to see your summary and not the rest of the history.<br />

					Structure your summary using the following format:<br />

					TASK DESCRIPTION: (Preserve essential user requirements, goals, and clarifications in concise form)<br />

					COMPLETED: (Tasks completed so far, with brief results)<br />
					PENDING: (Tasks that still need to be done)<br />
					CURRENT_STATE: (Current variables, data structures, or relevant state)<br />

					For code-specific tasks, also include:<br />
					CODE STATE: (File paths, function signatures, data structures)<br />
					CHANGES: (Code edits, variable updates)<br />
					DEPS: (Dependencies, imports, external calls)<br />

					PRIORITIZE:<br />
					1. Capture key user requirements and goals<br />
					2. Track ALL file paths that were discussed or modified<br />
					3. Distinguish between completed and pending tasks<br />
					4. Keep all sections concise and relevant<br />

					Write your summary from the user's perspective, as the user will start the next conversation with this summary.<br />
					Focus on keeping key information that's relevant for continuing the conversation.<br />
					Limit your summary to 10000 characters or less.<br />
				</SystemMessage>
				<PrioritizedList priority={this.props.priority - 1} passPriority={true} descending={false}>
					<ConversationHistory priority={1} promptContext={this.props.promptContext} location={this.props.location} endpoint={this.props.endpoint} maxToolResultLength={this.props.maxToolResultLength} />
					{this.props.workingNotebook && <WorkingNotebookSummary priority={this.props.priority - 2} notebook={this.props.workingNotebook} />}
					<UserMessage>
						Summarize the conversation history so far. Structure your summary using the following format:<br />

						TASK DESCRIPTION: The description of the task to perform<br />

						COMPLETED: Tasks completed so far with brief results<br />
						PENDING: Tasks that still need to be done<br />

						CODE STATE: All file paths that were discussed or modified<br />
						CHANGES: Key code edits that have taken place<br />

						Include all important tool calls that have already taken place as part of the appropriate sections.
					</UserMessage>
				</PrioritizedList>
			</>
		);
	}
}

class WorkingNotebookSummary extends PromptElement<NotebookSummaryProps> {
	override async render(state: void, sizing: PromptSizing) {
		return (
			<UserMessage>
				This is the current state of the notebook that you have been working on:<br />
				<NotebookSummary notebook={this.props.notebook} />
			</UserMessage>
		);
	}
}

export interface NotebookSummaryProps extends BasePromptElementProps {
	notebook: NotebookDocument;
}

export interface ConversationHistoryProps extends SummarizedAgentHistoryProps {
}

export class ConversationHistory extends PromptElement<ConversationHistoryProps> {
	constructor(
		props: ConversationHistoryProps,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		// Iterate over the turns in reverse order until we find a turn with a tool call round that was summarized
		const history: PromptElement[] = [];

		// Handle the possibility that we summarized partway through the current turn (e.g. if we accumulated many tool call rounds)
		let summaryForCurrentTurn: string | undefined = undefined;
		if (this.props.promptContext.toolCallRounds?.length) {
			const toolCallRounds: IToolCallRound[] = [];
			for (let i = this.props.promptContext.toolCallRounds.length - 1; i >= 0; i--) {
				const toolCallRound = this.props.promptContext.toolCallRounds[i];
				if (toolCallRound.summary) {
					// This tool call round was summarized
					summaryForCurrentTurn = toolCallRound.summary;
					break;
				}
				toolCallRounds.push(toolCallRound);
			}

			// Reverse the tool call rounds so they are in chronological order
			toolCallRounds.reverse();
			history.push(<ChatToolCalls priority={899} flexGrow={2} promptContext={this.props.promptContext} toolCallRounds={toolCallRounds} toolCallResults={this.props.promptContext.toolCallResults} enableCacheBreakpoints={this.props.enableCacheBreakpoints} truncateAt={this.props.maxToolResultLength} />);
		}

		if (summaryForCurrentTurn) {
			history.push(<UserMessage>
				<Tag name='conversation-summary'>
					{summaryForCurrentTurn}
				</Tag>
			</UserMessage>);

			return (<PrioritizedList priority={this.props.priority} descending={false} passPriority={true}>
				{history.reverse()}
			</PrioritizedList>);
		}

		if (!this.props.promptContext.isContinuation) {
			history.push(<AgentUserMessage flexGrow={2} priority={900} {...getUserMessagePropsFromAgentProps(this.props)} />);
		}

		// We may have a summary from earlier in the conversation, but skip history if we have a new summary
		for (const [i, turn] of [...this.props.promptContext.history.entries()].reverse()) {
			const metadata = turn.resultMetadata;

			// Build this list in chronological order
			const turnComponents: PromptElement[] = [];

			// Turn anatomy
			// ______________
			// |            |
			// |    USER    |
			// |            |
			// |  ASSISTANT |
			// |            |
			// |    TOOL    | <-- { summary: ..., toolCallRoundId: ... }
			// |  ASSISTANT |
			// |____________|

			let summaryForTurn: SummarizedConversationHistoryMetadata | undefined;
			// If a tool call limit is exceeded, the tool call from this turn will
			// have been aborted and any result should be found in the next turn.
			const toolCallResultInNextTurn = metadata?.maxToolCallsExceeded;
			let toolCallResults = metadata?.toolCallResults;
			if (toolCallResultInNextTurn) {
				const nextMetadata = this.props.promptContext.history.at(i + 1)?.responseChatResult?.metadata as IResultMetadata | undefined;
				const mergeFrom = i === this.props.promptContext.history.length - 1 ? this.props.promptContext.toolCallResults : nextMetadata?.toolCallResults;
				toolCallResults = { ...toolCallResults, ...mergeFrom };
			}

			// Find the latest tool call round that was summarized
			const toolCallRounds: IToolCallRound[] = [];
			for (let i = turn.rounds.length - 1; i >= 0; i--) {
				const round = turn.rounds[i];
				summaryForTurn = round.summary ? new SummarizedConversationHistoryMetadata(round.id, round.summary) : undefined;
				if (summaryForTurn) {
					break;
				}
				toolCallRounds.push(round);
			}

			if (summaryForTurn) {
				// We have a summary for a tool call round that was part of this turn
				turnComponents.push(<UserMessage flexGrow={1}>
					<Tag name='conversation-summary'>
						{summaryForTurn.text}
					</Tag>
				</UserMessage>);
			} else {
				turnComponents.push(<AgentUserMessage flexGrow={1} {...getUserMessagePropsFromTurn(turn, this.props.endpoint)} />);
			}

			// Reverse the tool call rounds so they are in chronological order
			toolCallRounds.reverse();
			turnComponents.push(<ChatToolCalls
				flexGrow={1}
				promptContext={this.props.promptContext}
				toolCallRounds={toolCallRounds}
				toolCallResults={toolCallResults}
				isHistorical={!(toolCallResultInNextTurn && i === this.props.promptContext.history.length - 1)}
				truncateAt={this.props.maxToolResultLength}
			/>);

			history.push(...turnComponents.reverse());
			if (summaryForTurn) {
				// All preceding turns are covered by the summary and shouldn't be included verbatim
				break;
			}
		}

		return (<PrioritizedList priority={this.props.priority} descending={false} passPriority={true}>
			{history.reverse()}
		</PrioritizedList>);
	}
}

export class SummarizedConversationHistoryMetadata extends PromptMetadata {
	constructor(
		public readonly toolCallRoundId: string,
		public readonly text: string
	) {
		super();
	}
}

export interface SummarizedAgentHistoryProps extends BasePromptElementProps {
	readonly priority: number;
	readonly endpoint: IChatEndpoint;
	readonly location: ChatLocation;
	readonly promptContext: IBuildPromptContext;
	readonly triggerSummarize?: boolean;
	readonly tools?: ReadonlyArray<LanguageModelToolInformation> | undefined;
	readonly enableCacheBreakpoints?: boolean;
	readonly workingNotebook?: NotebookDocument;
	readonly maxToolResultLength: number;
}

export class SummarizedConversationHistory extends PromptElement<SummarizedAgentHistoryProps> {
	constructor(
		props: SummarizedAgentHistoryProps,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing, progress: Progress<ChatResponsePart> | undefined, token: CancellationToken | undefined) {
		const promptContext = { ...this.props.promptContext };
		let historyMetadata: SummarizedConversationHistoryMetadata | undefined;
		if (this.props.triggerSummarize) {
			const summarizationResult = await this.summarizeHistory(sizing, progress, token);
			if (summarizationResult) {
				historyMetadata = new SummarizedConversationHistoryMetadata(summarizationResult.toolCallRoundId, summarizationResult.summary);
			}
		}

		return <>
			{historyMetadata && <meta value={historyMetadata} />}
			<ConversationHistory
				{...this.props}
				promptContext={promptContext}
				enableCacheBreakpoints={this.props.enableCacheBreakpoints} />
		</>;
	}

	private async summarizeHistory(sizing: PromptSizing, progress: Progress<ChatResponsePart> | undefined, token: CancellationToken | undefined): Promise<{ summary: string; toolCallRoundId: string } | undefined> {
		const endpoint = this.props.endpoint;

		const propsInfo = this._instantiationService.createInstance(SummarizedConversationHistoryPropsBuilder).getProps(this.props);

		// Just a function for test to create props and call this
		let summarizationPrompt: ChatMessage[];
		try {
			summarizationPrompt = (await renderPromptElement(this._instantiationService, endpoint, ConversationHistorySummarizationPrompt, propsInfo.props)).messages;
		} catch (e) {
			const budgetExceeded = e instanceof BudgetExceededError;
			const outcome = budgetExceeded ? 'budget_exceeded' : 'renderError';
			this.sendSummarizationTelemetry(outcome, '', this.props.endpoint.model);
			throw e;
		}

		let summary: ChatResponse;
		try {
			const summaryPromise = endpoint.makeChatRequest('summarizeConversationHistory', ToolCallingLoop.stripInternalToolCallIds(summarizationPrompt), undefined, token ?? CancellationToken.None, ChatLocation.Other, undefined, {
				temperature: 0,
				stream: false,
				tool_choice: 'none',
				tools: normalizeToolSchema(
					endpoint.family,
					this.props.tools?.map(tool => ({
						function:
						{
							name: tool.name,
							description: tool.description,
							parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined
						}, type: 'function'
					})),
					(tool, rule) => {
						this._logService.logger.warn(`Tool ${tool} failed validation: ${rule}`);
					},
				),
			});
			progress?.report(new ChatResponseProgressPart2(l10n.t('Summarizing conversation history...'), async () => {
				await summaryPromise;
				return l10n.t('Summarized conversation history');
			}));

			// Make sure the summary actually fits in the token budget
			summary = await summaryPromise;
		} catch (e) {
			this.sendSummarizationTelemetry('requestThrow', '', this.props.endpoint.model);
			throw e;
		}

		if (summary.type !== ChatFetchResponseType.Success) {
			const outcome = summary.type === ChatFetchResponseType.Failed ?
				'failed' :
				summary.type;
			this.sendSummarizationTelemetry(outcome, summary.requestId, this.props.endpoint.model, summary.reason);
			throw new Error('Summarization failed');
		}

		if (await sizing.countTokens(summary.value) > sizing.tokenBudget) {
			this.sendSummarizationTelemetry('too_large', summary.requestId, this.props.endpoint.model);
			throw new Error('Summary too large');
		}

		if (summary.type === ChatFetchResponseType.Success) {
			this.sendSummarizationTelemetry('success', summary.requestId, this.props.endpoint.model);
			this.addSummaryToHistory(summary.value, propsInfo.summarizedToolCallRoundId);
			return { toolCallRoundId: propsInfo.summarizedToolCallRoundId, summary: summary.value };
		}
	}

	private addSummaryToHistory(summary: string, toolCallRoundId: string): void {
		const round = this.props.promptContext.toolCallRounds?.find(round => round.id === toolCallRoundId);
		if (round) {
			round.summary = summary;
			return;
		}

		// Adding summaries to rounds in previous turns will only be persisted during the current session.
		// For the next turn, need to restore them from metadata (see normalizeSummariesOnRounds).
		for (const turn of [...this.props.promptContext.history].reverse()) {
			const round = turn.rounds.find(round => round.id === toolCallRoundId);
			if (round) {
				round.summary = summary;
				break;
			}
		}
	}

	/**
	 * Send telemetry for conversation summarization.
	 * @param success Whether the summarization was successful
	 */
	private sendSummarizationTelemetry(outcome: string, requestId: string, model: string, detailedOutcome?: string): void {
		const numRoundsInHistory = this.props.promptContext.history
			.map(turn => turn.rounds.length)
			.reduce((a, b) => a + b, 0);
		const numRoundsInCurrentTurn = this.props.promptContext.toolCallRounds?.length ?? 0;
		const numRounds = numRoundsInHistory + numRoundsInCurrentTurn;

		const reversedCurrentRounds = [...(this.props.promptContext.toolCallRounds ?? [])].reverse();
		let numRoundsSinceLastSummarization = reversedCurrentRounds.findIndex(round => round.summary) ?? -1;
		if (numRoundsSinceLastSummarization === -1) {
			let count = numRoundsInCurrentTurn;
			for (const turn of Iterable.reverse(Array.from(this.props.promptContext.history))) {
				for (const round of Iterable.reverse(Array.from(turn.rounds ?? []))) {
					if (round.summary) {
						numRoundsSinceLastSummarization = count;
						break;
					}
					count++;
				}
			}
		}

		const lastUsedTool = this.props.promptContext.toolCallRounds?.at(-1)?.toolCalls?.at(-1)?.name ??
			this.props.promptContext.history?.at(-1)?.rounds.at(-1)?.toolCalls?.at(-1)?.name ?? 'none';

		const isDuringToolCalling = !!this.props.promptContext.toolCallRounds?.length ? 1 : 0;
		const conversationId = this.props.promptContext.conversation?.sessionId;

		/* __GDPR__
			"summarizedConversationHistory" : {
				"owner": "roblourens",
				"comment": "Tracks when summarization happens and what the outcome was",
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state or failure reason of the summarization." },
				"detailedOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "A more detailed error message." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID used for the summarization." },
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID from the summarization call." },
				"numRounds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of tool call rounds before this summarization was triggered." },
				"numRoundsSinceLastSummarization": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of tool call rounds since the last summarization." },
				"lastUsedTool": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the last tool used before summarization." },
				"isDuringToolCalling": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether this summarization was triggered during a tool calling loop." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', { outcome, detailedOutcome, requestId, model, lastUsedTool, conversationId }, { numRounds, numRoundsSinceLastSummarization, isDuringToolCalling });
	}
}

export interface ISummarizedConversationHistoryInfo {
	props: SummarizedAgentHistoryProps;
	summarizedToolCallRoundId: string;
}

export class SummarizedConversationHistoryPropsBuilder {
	constructor(
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
	}

	getProps(
		props: SummarizedAgentHistoryProps
	): ISummarizedConversationHistoryInfo {
		let toolCallRounds = props.promptContext.toolCallRounds;
		let isContinuation = props.promptContext.isContinuation;
		let summarizedToolCallRoundId = '';
		if (toolCallRounds && toolCallRounds.length > 1) {
			// If there are multiple tool call rounds, exclude the last one, because it must have put us over the limit.
			// Summarize from the previous round in this turn.
			toolCallRounds = toolCallRounds.slice(0, -1);
			summarizedToolCallRoundId = toolCallRounds.at(-1)!.id;
		} else if (props.promptContext.history.length > 0) {
			// If there is only one tool call round, then summarize from the last round of the last turn.
			// Or if there are no tool call rounds, then the new user message put us over the limit. (or the last assistant message?)
			// This flag excludes the last user message from the summary.
			isContinuation = true;
			toolCallRounds = [];
			summarizedToolCallRoundId = props.promptContext.history.at(-1)!.rounds.at(-1)!.id;
		} else {
			throw new Error('Nothing to summarize');
		}

		const promptContext = {
			...props.promptContext,
			toolCallRounds,
			isContinuation,
		};
		return {
			props: {
				...props,
				workingNotebook: this.getWorkingNotebook(props),
				promptContext
			},
			summarizedToolCallRoundId
		};
	}

	private getWorkingNotebook(props: SummarizedAgentHistoryProps): NotebookDocument | undefined {
		const toolCallRound = props.promptContext.toolCallRounds && [...props.promptContext.toolCallRounds].reverse().find(round => round.toolCalls.some(call => call.name === ToolName.RunNotebookCell));
		const toolCall = toolCallRound?.toolCalls.find(call => call.name === ToolName.RunNotebookCell);
		if (toolCall && toolCall.arguments) {
			try {
				const args = JSON.parse(toolCall.arguments);
				if (typeof args.filePath === 'string') {
					const uri = this._promptPathRepresentationService.resolveFilePath(args.filePath);
					if (!uri) {
						return undefined;
					}
					return this._workspaceService.notebookDocuments.find(doc => doc.uri.toString() === uri.toString());
				}
			} catch (e) {
				// Ignore parsing errors
			}
		}

		return undefined;
	}
}
