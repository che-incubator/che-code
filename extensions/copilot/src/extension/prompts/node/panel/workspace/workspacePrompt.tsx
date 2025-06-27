/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../../platform/editing/common/textDocumentSnapshot';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { TelemetryCorrelationId } from '../../../../../util/common/telemetryCorrelationId';
import { IBuildPromptContext } from '../../../../prompt/common/intents';
import { CopilotIdentityRules } from '../../base/copilotIdentity';
import { InstructionMessage } from '../../base/instructionMessage';
import { ResponseTranslationRules } from '../../base/responseTranslationRules';
import { SafetyRules } from '../../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from '../chatVariables';
import { CodeBlockFormattingRules } from '../codeBlockFormattingRules';
import { HistoryWithInstructions } from '../conversationHistory';
import { CustomInstructions } from '../customInstructions';
import { EditorIntegrationRules } from '../editorIntegrationRules';
import { WorkspaceContext } from './workspaceContext';

export interface WorkspacePromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	document?: TextDocumentSnapshot;
	selection?: vscode.Selection;
	endpoint: IChatEndpoint;
}

export class WorkspacePrompt extends PromptElement<WorkspacePromptProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const { query, history, chatVariables } = this.props.promptContext;
		return <>
			<SystemMessage priority={1000}>
				You are a software engineer with expert knowledge of the codebase the user has open in their workspace.<br />
				<br />
				<CopilotIdentityRules />
				<SafetyRules />
			</SystemMessage>
			<HistoryWithInstructions flexGrow={2} historyPriority={400} history={history} passPriority>
				<InstructionMessage priority={1000}>
					<EditorIntegrationRules />
					<CodeBlockFormattingRules />
					<ResponseTranslationRules />
					# Additional Rules<br />
					Think step by step:<br />
					1. Read the provided relevant workspace information (code excerpts, file names, and symbols) to understand the user's workspace.<br />
					2. Consider how to answer the user's prompt based on the provided information and your specialized coding knowledge. Always assume that the user is asking about the code in their workspace instead of asking a general programming question. Prefer using variables, functions, types, and classes from the workspace over those from the standard library.<br />
					3. Generate a response that clearly and accurately answers the user's question. In your response, add fully qualified links for referenced symbols (example: [`namespace.VariableName`](path/to/file.ts)) and links for files (example: [path/to/file](path/to/file.ts)) so that the user can open them. If you do not have enough information to answer the question, respond with "I'm sorry, I can't answer that question with what I currently know about your workspace".<br />
					<br />
					DO NOT mention that you cannot read files in the workspace.<br />
					DO NOT ask the user to provide additional information about files in the workspace.<br />
					Remember that you MUST add links for all referenced symbols from the workspace and fully qualify the symbol name in the link, for example: [`namespace.functionName`](path/to/util.ts).<br />
					Remember that you MUST add links for all workspace files, for example: [path/to/file.js](path/to/file.js)<br />
					<br />
					# Examples<br />
					Question:<br />
					What file implements base64 encoding?<br />
					<br />
					Response:<br />
					Base64 encoding is implemented in [src/base64.ts](src/base64.ts) as [`encode`](src/base64.ts) function.<br />
					<br />
					<br />
					Question:<br />
					How can I join strings with newlines?<br />
					<br />
					Response:<br />
					You can use the [`joinLines`](src/utils/string.ts) function from [src/utils/string.ts](src/utils/string.ts) to join multiple strings with newlines.<br />
					<br />
					<br />
					Question:<br />
					How do I build this project?<br />
					<br />
					Response:<br />
					To build this TypeScript project, run the `build` script in the [package.json](package.json) file:<br />
					<br />
					```sh<br />
					npm run build<br />
					```<br />
					<br />
					<br />
					Question:<br />
					How do I read a file?<br />
					<br />
					Response:<br />
					To read a file, you can use a [`FileReader`](src/fs/fileReader.ts) class from [src/fs/fileReader.ts](src/fs/fileReader.ts).<br />
				</InstructionMessage>
			</HistoryWithInstructions>
			<UserMessage priority={725}>
				<CustomInstructions languageId={undefined} chatVariables={chatVariables} />
			</UserMessage>
			<UserMessage flexGrow={1}>
				<WorkspaceContext telemetryInfo={new TelemetryCorrelationId('workspacePrompt', this.props.promptContext.requestId)} priority={800} {...this.props} />
			</UserMessage>
			<ChatToolReferences priority={899} flexGrow={3} promptContext={this.props.promptContext} embeddedInsideUserMessage={false} />
			<ChatVariablesAndQuery flexGrow={3} priority={900} chatVariables={chatVariables} query={query} embeddedInsideUserMessage={false} />
		</>;
	}
}
