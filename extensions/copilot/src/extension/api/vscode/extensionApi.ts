/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextEditor, window } from 'vscode';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { CopilotExtensionApi as ICopilotExtensionApi } from './api';

export class CopilotExtensionApi implements ICopilotExtensionApi {
	public static readonly version = 1;

	constructor(@IScopeSelector private readonly _scopeSelector: IScopeSelector) { }

	async selectScope(editor?: TextEditor, options?: { reason?: string }) {
		editor ??= window.activeTextEditor;
		if (!editor) {
			return;
		}
		return this._scopeSelector.selectEnclosingScope(editor, options);
	}
}
