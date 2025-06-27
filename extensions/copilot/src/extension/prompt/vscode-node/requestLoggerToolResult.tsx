/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONTree, OutputMode, PromptElement, Raw, renderPrompt, UserMessage } from '@vscode/prompt-tsx';
import { LanguageModelPromptTsxPart } from '../../../vscodeTypes';

export async function renderToolResultToStringNoBudget(part: LanguageModelPromptTsxPart) {
	const r = await renderPrompt(class extends PromptElement {
		render() {
			return <UserMessage>
				<elementJSON data={part.value as JSONTree.PromptElementJSON} />
			</UserMessage>;
		}
	}, {}, {
		modelMaxPromptTokens: Infinity,
	}, { mode: OutputMode.Raw, countMessageTokens: () => 0, tokenLength: () => 0 });

	const c = r.messages[0].content;
	return typeof c === 'string' ? c : c.map(p => p.type === Raw.ChatCompletionContentPartKind.Text ? p.text : p.type === Raw.ChatCompletionContentPartKind.Image ? `<promptTsxImg src="${p.imageUrl}" />` : undefined).join('');
}
