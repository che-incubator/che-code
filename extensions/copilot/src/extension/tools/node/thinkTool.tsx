/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

interface IThinkToolParams {
	thoughts: string;
}
class ThinkTool implements vscode.LanguageModelTool<IThinkToolParams> {
	public static readonly toolName = ToolName.Think;

	constructor() { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IThinkToolParams>, token: vscode.CancellationToken) {
		const thoughts = options.input.thoughts;
		if (!thoughts) {
			throw new Error('Invalid arguments');
		}

		checkCancellation(token);
		return new LanguageModelToolResult([
			new LanguageModelTextPart(thoughts)
		]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IThinkToolParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: 'Thinking'
		};
	}
}

ToolRegistry.registerTool(ThinkTool);
