/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, PrioritizedList, PromptElement, PromptPiece, PromptSizing, TokenLimit, UserMessage } from '@vscode/prompt-tsx';
import { Location } from '../../../../vscodeTypes';
import { ChatVariablesCollection, PromptVariable } from '../../../prompt/common/chatVariablesCollection';
import { Turn, TurnStatus } from '../../../prompt/common/conversation';
import { InstructionMessage } from '../base/instructionMessage';
import { IPromptEndpoint } from '../base/promptRenderer';
import { ChatVariablesAndQuery } from './chatVariables';
import { URI } from '../../../../util/vs/base/common/uri';
import { modelPrefersInstructionsAfterHistory } from '../../../../platform/endpoint/common/chatModelCapabilities';

interface ConversationHistoryProps extends BasePromptElementProps {
	history: readonly Turn[];
	priority: number;
	/**
	 * Signal that is used to roll up the history into a single message, only requests
	 * are considered (and historical responses are assumed to be source code).
	 */
	inline?: boolean;
	currentTurnVars?: ChatVariablesCollection;
	omitPromptVariables?: boolean;
}

/**
 * This element should wrap instructions specific to any given model. It should
 * include any {@link InstructionMessage}, and depending on the model it
 * either includes the history before or after the instruction message.
 *
 * You should use `passPriority` with this: https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#passing-priority
 *
 * @example
 *
 * <HistoryWithInstructions passPriority priority={700} history={history}>
 *   <InstructionMessage>Do the thing</InstructionMessage>
 * </HistoryWithInstructions>
 */
export class HistoryWithInstructions extends PromptElement<Omit<ConversationHistoryProps, 'priority'> & { historyPriority: number }> {
	constructor(
		props: Omit<ConversationHistoryProps, 'priority'> & { historyPriority: number },
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}
	override render(_state: void, sizing: PromptSizing): PromptPiece {
		const ep = this.promptEndpoint;
		const { children, ...props } = this.props;
		if (!children?.some(c => typeof c === 'object' && c.ctor === InstructionMessage)) {
			// This is a sanity check, and could be removed if we eventually want to
			// have wrappers around InstructionMessages, but for now this is useful.
			throw new Error(`HistoryWithInstructions must have an InstructionMessage child`);
		}

		const after = modelPrefersInstructionsAfterHistory(ep.family);
		return <>
			{after ? <ConversationHistory  {...props} passPriority={false} priority={this.props.historyPriority} /> : undefined}
			{...children}
			{after ? undefined : <ConversationHistory  {...props} passPriority={false} priority={this.props.historyPriority} />}
		</>;
	}
}

/**
 * @deprecated use `HistoryWithInstructions` instead
 */
export class ConversationHistory extends PromptElement<ConversationHistoryProps> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece<any, any> | undefined {
		let turnHistory = this.props.history;

		if (this.props.inline && turnHistory.length > 0) {
			const historyMessage = `The current code is a result of a previous interaction with you. Here are my previous messages: \n- ${turnHistory.map(r => r.request.message).join('\n- ')}`;
			turnHistory = [new Turn(undefined, { message: historyMessage, type: 'user' }, undefined)];
		}

		const history: (UserMessage | AssistantMessage)[] = [];
		turnHistory.forEach((turn, index) => {
			if (turn.request.type === 'user') {
				const promptVariables = (turn.promptVariables && !this.props.omitPromptVariables) ? this.removeDuplicateVars(turn.promptVariables, this.props.currentTurnVars, turnHistory.slice(index + 1)) : new ChatVariablesCollection([]);
				history.push(<ChatVariablesAndQuery priority={900} chatVariables={promptVariables} query={turn.request.message} omitReferences={true} embeddedInsideUserMessage={false} />);
			}
			if (turn.responseMessage?.type === 'model' && ![TurnStatus.OffTopic, TurnStatus.Filtered].includes(turn.responseStatus)) {
				history.push(<AssistantMessage name={turn.responseMessage.name}>{turn.responseMessage.message}</AssistantMessage>);
			}
		});

		return (
			// Conversation history is currently limited to 32k tokens to avoid
			// unnecessarily pushing into the larger and slower token SKUs
			<TokenLimit max={32768}>
				<PrioritizedList priority={this.props.priority} descending={false}>{history}</PrioritizedList>
			</TokenLimit>
		);
	}

	private removeDuplicateVars(historyVars: ChatVariablesCollection, currentTurnVars: ChatVariablesCollection | undefined, followingMessages: Turn[]): ChatVariablesCollection {
		// TODO this is very simple, maybe we could use getUniqueReferences to merge ranges and be smarter. But it would take some rewriting of history for the model to
		// understand what each history message was referring to.
		return historyVars.filter(v1 => {
			if (followingMessages.some(m => m.promptVariables?.find(v2 => variableEquals(v1, v2)))) {
				return false;
			}

			if (currentTurnVars?.find(v2 => variableEquals(v1, v2))) {
				return false;
			}

			return true;
		});
	}
}

function variableEquals(v1: PromptVariable, v2: PromptVariable) {
	if (v1.uniqueName !== v2.uniqueName) {
		return false;
	}

	if (URI.isUri(v1.value) && URI.isUri(v2.value)) {
		return v1.value.toString() === v2.value.toString();
	}

	if (v1.value instanceof Location && v2.value instanceof Location) {
		return JSON.stringify(v1.value) === JSON.stringify(v2.value);
	}

	return false;
}
