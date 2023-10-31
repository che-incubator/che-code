/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IChatAgent, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicReferencePart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequest, IParsedChatRequestPart, chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';

const agentReg = /^@([\w_\-]+)(?=(\s|$|\b))/i; // An @-agent
const variableReg = /^#([\w_\-]+)(:\d+)?(?=(\s|$|\b))/i; // A #-variable with an optional numeric : arg (@response:2)
const slashReg = /\/([\w_\-]+)(?=(\s|$|\b))/i; // A / command
const dollarSignVarReg = /\$([\w_\-]+):([\w_\-\.]+)(?=(\s|$|\b))/i; // A / command

export class ChatRequestParser {
	constructor(
		@IChatAgentService private readonly agentService: IChatAgentService,
		@IChatVariablesService private readonly variableService: IChatVariablesService,
		@IChatService private readonly chatService: IChatService,
	) { }

	async parseChatRequest(sessionId: string, message: string): Promise<IParsedChatRequest> {
		const parts: IParsedChatRequestPart[] = [];

		let lineNumber = 1;
		let column = 1;
		for (let i = 0; i < message.length; i++) {
			const previousChar = message.charAt(i - 1);
			const char = message.charAt(i);
			let newPart: IParsedChatRequestPart | undefined;
			if (previousChar === ' ' || i === 0) {
				if (char === chatVariableLeader) {
					newPart = this.tryToParseVariable(message.slice(i), i, new Position(lineNumber, column), parts);
				} else if (char === '@') {
					newPart = this.tryToParseAgent(message.slice(i), i, new Position(lineNumber, column), parts);
				} else if (char === '/') {
					// TODO try to make this sync
					newPart = await this.tryToParseSlashCommand(sessionId, message.slice(i), i, new Position(lineNumber, column), parts);
				} else if (char === '$') {
					newPart = await this.tryToParseDynamicVariable(sessionId, message.slice(i), i, new Position(lineNumber, column), parts);
				}
			}

			if (newPart) {
				if (i !== 0) {
					// Insert a part for all the text we passed over, then insert the new parsed part
					const previousPart = parts.at(-1);
					const previousPartEnd = previousPart?.range.endExclusive ?? 0;
					const previousPartEditorRangeEndLine = previousPart?.editorRange.endLineNumber ?? 1;
					const previousPartEditorRangeEndCol = previousPart?.editorRange.endColumn ?? 1;
					parts.push(new ChatRequestTextPart(
						new OffsetRange(previousPartEnd, i),
						new Range(previousPartEditorRangeEndLine, previousPartEditorRangeEndCol, lineNumber, column),
						message.slice(previousPartEnd, i)));
				}

				parts.push(newPart);
			}

			if (char === '\n') {
				lineNumber++;
				column = 1;
			} else {
				column++;
			}
		}

		const lastPart = parts.at(-1);
		const lastPartEnd = lastPart?.range.endExclusive ?? 0;
		if (lastPartEnd < message.length) {
			parts.push(new ChatRequestTextPart(
				new OffsetRange(lastPartEnd, message.length),
				new Range(lastPart?.editorRange.endLineNumber ?? 1, lastPart?.editorRange.endColumn ?? 1, lineNumber, column),
				message.slice(lastPartEnd, message.length)));
		}


		// fix up parts:
		// * only one agent at the beginning of the message
		// * only one agent command after the agent or at the beginning of the message
		let agentIndex = -1;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (part instanceof ChatRequestAgentPart) {
				if (i === 0) {
					agentIndex = 0;
				} else {
					// agent not first -> make text part
					parts[i] = new ChatRequestTextPart(part.range, part.editorRange, part.text);
				}
			}
			if (part instanceof ChatRequestAgentSubcommandPart) {
				if (!(i === 0 || agentIndex === 0 && i === 2 && /^\s+$/.test(parts[1].text))) {
					// agent command not after agent nor first -> make text part
					parts[i] = new ChatRequestTextPart(part.range, part.editorRange, part.text);
				}
			}
		}

		return {
			parts,
			text: message,
		};
	}

	private tryToParseAgent(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(agentReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		let agent: IChatAgent | undefined;
		if ((agent = this.agentService.getAgent(name))) {
			if (parts.some(p => p instanceof ChatRequestAgentPart)) {
				// Only one agent allowed
				return;
			} else {
				return new ChatRequestAgentPart(varRange, varEditorRange, agent);
			}
		}

		return;
	}

	private tryToParseVariable(message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): ChatRequestAgentPart | ChatRequestVariablePart | undefined {
		const nextVariableMatch = message.match(variableReg);
		if (!nextVariableMatch) {
			return;
		}

		const [full, name] = nextVariableMatch;
		const variableArg = nextVariableMatch[2] ?? '';
		const varRange = new OffsetRange(offset, offset + full.length);
		const varEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		if (this.variableService.hasVariable(name)) {
			return new ChatRequestVariablePart(varRange, varEditorRange, name, variableArg);
		}

		return;
	}

	private async tryToParseSlashCommand(sessionId: string, message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): Promise<ChatRequestSlashCommandPart | ChatRequestAgentSubcommandPart | undefined> {
		const nextSlashMatch = message.match(slashReg);
		if (!nextSlashMatch) {
			return;
		}

		if (parts.some(p => p instanceof ChatRequestSlashCommandPart)) {
			// Only one slash command allowed
			return;
		}

		const [full, command] = nextSlashMatch;
		const slashRange = new OffsetRange(offset, offset + full.length);
		const slashEditorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		const usedAgent = parts.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		if (usedAgent) {
			const subCommands = await usedAgent.agent.provideSlashCommands(CancellationToken.None);
			const subCommand = subCommands.find(c => c.name === command);
			if (subCommand) {
				// Valid agent subcommand
				return new ChatRequestAgentSubcommandPart(slashRange, slashEditorRange, subCommand);
			}
		} else {
			const slashCommands = await this.chatService.getSlashCommands(sessionId, CancellationToken.None);
			const slashCommand = slashCommands.find(c => c.command === command);
			if (slashCommand) {
				// Valid standalone slash command
				return new ChatRequestSlashCommandPart(slashRange, slashEditorRange, slashCommand);
			}
		}

		return;
	}

	private async tryToParseDynamicVariable(sessionId: string, message: string, offset: number, position: IPosition, parts: ReadonlyArray<IParsedChatRequestPart>): Promise<ChatRequestDynamicReferencePart | undefined> {
		const nextVarMatch = message.match(dollarSignVarReg);
		if (!nextVarMatch) {
			return;
		}

		const [full, name, arg] = nextVarMatch;
		const range = new OffsetRange(offset, offset + full.length);
		const editorRange = new Range(position.lineNumber, position.column, position.lineNumber, position.column + full.length);

		if (name !== 'file') {
			// I suppose we support other types later
			return;
		}

		const references = this.variableService.getDynamicReferences(sessionId);
		const refAtThisPosition = references.find(r =>
			r.range.startLineNumber === position.lineNumber &&
			r.range.startColumn === position.column &&
			r.range.endLineNumber === position.lineNumber &&
			r.range.endColumn === position.column + full.length);
		if (refAtThisPosition) {
			return new ChatRequestDynamicReferencePart(range, editorRange, name, arg, refAtThisPosition.data);
		}

		return;
	}
}
