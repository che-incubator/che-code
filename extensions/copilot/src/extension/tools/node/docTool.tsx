/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isLocation } from '../../../util/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';


interface IDocInfoTool {
	readonly filePaths: string[];
}

class DocInfoTool implements vscode.LanguageModelTool<IDocInfoTool> {

	static readonly toolName = ToolName.DocInfo;

	private static _docTypeNames = new Map<string, string>([
		['typescript', 'TSDoc comment'],
		['typescriptreact', 'TSDoc comment'],
		['javascript', 'JSDoc comment'],
		['javascriptreact', 'JSDoc comment'],
		['python', 'docstring'],
	]);

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IDocInfoTool>, token: vscode.CancellationToken) {

		const docNames = new Set<string>();

		for (const filePath of options.input.filePaths) {
			const uri = this._promptPathRepresentationService.resolveFilePath(filePath);
			if (!uri) {
				continue;
			}
			const doc = await this.workspaceService.openTextDocumentAndSnapshot(uri);
			const docName: string = DocInfoTool._docTypeNames.get(doc.languageId) || 'documentation comment';
			docNames.add(docName);
		}

		checkCancellation(token);
		return new LanguageModelToolResult([
			new LanguageModelTextPart(`Please generate ${Array.from(docNames).join(', ')} for the respective files. ONLY add documentation and do not change the code.`)
		]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IDocInfoTool>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		return {
			presentation: 'hidden',
		};
	}

	async provideInput(promptContext: IBuildPromptContext): Promise<IDocInfoTool | undefined> {
		const seen = new Set<string>();

		const filePaths: string[] = [];
		const ranges: ([a: number, b: number, c: number, d: number] | undefined)[] = [];

		function addPath(path: string, range: vscode.Range | undefined) {
			if (!seen.has(path)) {
				seen.add(path);
				filePaths.push(path);
				ranges.push(range && [range.start.line, range.start.character, range.end.line, range.end.character]);
			}
		}

		for (const ref of promptContext.chatVariables) {
			if (URI.isUri(ref.value)) {
				addPath(this._promptPathRepresentationService.getFilePath(ref.value), undefined);
			} else if (isLocation(ref.value)) {
				addPath(this._promptPathRepresentationService.getFilePath(ref.value.uri), ref.value.range);
			}
		}

		if (promptContext.workingSet) {
			for (const file of promptContext.workingSet) {
				addPath(this._promptPathRepresentationService.getFilePath(file.document.uri), file.range);
			}
		}

		if (!filePaths.length) {
			// no context variables or working set
		}

		return {
			filePaths,
		};
	}
}

ToolRegistry.registerTool(DocInfoTool);
