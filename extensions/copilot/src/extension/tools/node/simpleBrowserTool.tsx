/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';
import { LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';


export interface ISimpleBrowserParams {
	url: string;
}

export class SimpleBrowserTool implements ICopilotTool<ISimpleBrowserParams> {
	public static toolName = ToolName.SimpleBrowser;
	private _alreadyApprovedDomains = new ResourceSet();

	constructor(
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISimpleBrowserParams>, token: vscode.CancellationToken) {
		this._alreadyApprovedDomains.add(URI.parse(options.input.url));
		this.commandService.executeCommand('simpleBrowser.show', options.input.url);
		return new LanguageModelToolResult([
			new LanguageModelTextPart(
				l10n.t('Simple Browser opened at {0}', options.input.url),
			)
		]);
	}

	async resolveInput(input: ISimpleBrowserParams, promptContext: IBuildPromptContext): Promise<ISimpleBrowserParams> {
		return input;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISimpleBrowserParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const urlsNeedingConfirmation = !this._alreadyApprovedDomains.has(URI.parse(options.input.url));
		let confirmationMessages: vscode.LanguageModelToolConfirmationMessages | undefined;
		if (urlsNeedingConfirmation) {
			confirmationMessages = { title: l10n.t`Open untrusted web page?`, message: new MarkdownString(l10n.t`${options.input.url}`) };
		}

		return {
			invocationMessage: new MarkdownString(l10n.t`Opening Simple Browser at ${options.input.url}`),
			pastTenseMessage: new MarkdownString(l10n.t`Opened Simple Browser at ${options.input.url}`),
			confirmationMessages
		};
	}
}

ToolRegistry.registerTool(SimpleBrowserTool);
