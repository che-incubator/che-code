/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, EventEmitter, TextDocumentContentProvider, Uri, workspace } from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { CopilotFileScheme, INewWorkspacePreviewContentManager } from '../node/newIntent';


export class NewWorkspaceTextDocumentProvider extends Disposable implements TextDocumentContentProvider {
	constructor(private readonly contentManager: INewWorkspacePreviewContentManager) {
		super();
		this._register(workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.scheme === CopilotFileScheme) {
				this.onDidChangeEmitter.fire(e.document.uri);
			}
		}));
	}

	onDidChangeEmitter = new EventEmitter<Uri>();
	public onDidChange = this.onDidChangeEmitter.event;

	async provideTextDocumentContent(uri: Uri, token: CancellationToken) {
		const node = this.contentManager.get(uri);
		if (!node) {
			return '';
		}
		let contentArray: Uint8Array | undefined;
		try {
			contentArray = await node.content;
		} catch { }
		return new TextDecoder().decode(contentArray) ?? '';
	}
}
