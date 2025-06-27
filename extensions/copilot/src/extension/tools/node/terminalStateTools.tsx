/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export class GetTerminalSelectionTool implements ICopilotTool<void> {
	public static readonly toolName = ToolName.TerminalSelection;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<void>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const selection = this.terminalService.terminalSelection;
		if (!selection) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart('No text is currently selected in the active terminal.')
			]);
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(`The active terminal's selection:\n${selection}`)
		]);
	}

	prepareInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<void>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Reading terminal selection`,
			pastTenseMessage: l10n.t`Read terminal selection`
		};
	}
}

ToolRegistry.registerTool(GetTerminalSelectionTool);

export class GetTerminalLastCommandTool implements ICopilotTool<void> {
	public static readonly toolName = ToolName.TerminalLastCommand;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<void>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const command = this.terminalService.terminalLastCommand;
		if (!command) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart('No command has been run in the active terminal.')
			]);
		}

		const userPrompt: string[] = [];
		if (command.commandLine) {
			userPrompt.push(`The following is the last command run in the terminal:`);
			userPrompt.push(command.commandLine);
		}
		if (command.cwd) {
			userPrompt.push(`It was run in the directory:`);
			userPrompt.push(typeof command.cwd === 'object' ? command.cwd.toString() : command.cwd);
		}
		if (command.output) {
			userPrompt.push(`It has the following output:`);
			userPrompt.push(command.output);
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(userPrompt.join('\n'))
		]);
	}

	prepareInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<void>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Getting last terminal command`,
			pastTenseMessage: l10n.t`Got last terminal command`
		};
	}
}

ToolRegistry.registerTool(GetTerminalLastCommandTool);
