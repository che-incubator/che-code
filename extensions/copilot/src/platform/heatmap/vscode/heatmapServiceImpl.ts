/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { disposableTimeout } from '../../../util/vs/base/common/async';
import { DisposableStore, MutableDisposable } from '../../../util/vs/base/common/lifecycle';
import { LRUCache, ResourceMap } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { isEqual } from '../../../util/vs/base/common/resources';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { IGitExtensionService } from '../../git/common/gitExtensionService';
import { Repository } from '../../git/vscode/git';
import { IIgnoreService } from '../../ignore/common/ignoreService';
import { IHeatmapService, SelectionPoint } from '../common/heatmapService';

export class HeatmapServiceImpl implements IHeatmapService {

	_serviceBrand: undefined;

	private readonly _store = new DisposableStore();

	private readonly _entries = new LRUCache<vscode.TextDocument, SelectionPoint[]>(30);

	constructor(
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IFileSystemService fileSystemService: IFileSystemService,
	) {

		this._store.add(vscode.commands.registerCommand('github.copilot.chat.clearTemporalContext', () => {
			this._entries.clear();
			vscode.window.showInformationMessage('Temporal Context Cleared', { modal: true });
		}));

		const watcher = fileSystemService.createFileSystemWatcher('**/*');
		this._store.add(watcher);
		this._store.add(watcher.onDidDelete(e => {
			for (const [doc] of Array.from(this._entries)) {
				if (isEqual(doc.uri, e)) {
					this._entries.delete(doc);
				}
			}
		}));

		this._store.add(vscode.workspace.onDidOpenTextDocument(e => {
			for (const [key, value] of Array.from(this._entries)) {
				if (key.isClosed && key.uri.toString() === e.uri.toString()) {
					// document is being re-opened, remove the old key/reference
					// but keep the previous points
					this._entries.delete(key);
					this._entries.set(e, value);
				}
			}
		}));

		this._store.add(vscode.workspace.onDidCloseTextDocument(e => {
			if (vscode.workspace.fs.isWritableFileSystem(e.uri.scheme) === undefined) {
				// REMOVED closed documents that are not backed by a file system
				this._entries.delete(e);
			}
		}));

		this._store.add(vscode.workspace.onDidChangeTextDocument(e => {

			if (e.contentChanges.length === 0) {
				// nothing to adjust
				return;
			}

			const offsets = this._entries.get(e.document);
			if (!offsets) {
				// nothing to adjust
				return;
			}

			for (const change of e.contentChanges) {

				const delta = change.text.length - change.rangeLength;

				for (let i = 0; i < offsets.length; i++) {
					const point = offsets[i];
					if (point.offset > change.rangeOffset) {
						offsets[i] = point.adjust(delta);
					}
				}
			}
		}));

		const ignoredLanguages: vscode.DocumentSelector = [
			'markdown',
			'plaintext',
			{ scheme: 'git' }, // has a fs but we don't want it
			{ pattern: '**/settings.json' },
			{ pattern: '**/keybindings.json' },
			{ pattern: '**/.vscode/**' },
			{ pattern: '**/*.prompt.md' }
		];

		const updatePositions = async (textEditor: vscode.TextEditor, ranges: readonly vscode.Range[]) => {

			// IGNORE selected documents
			if (vscode.languages.match(ignoredLanguages, textEditor.document)) {
				return;
			}

			// IGNORE document without file system provider unless they are allow listed
			if (vscode.workspace.fs.isWritableFileSystem(textEditor.document.uri.scheme) === undefined) {
				return;
			}

			const document = textEditor.document;

			let collection = this._entries.get(document);
			if (!collection) {
				collection = [];
				this._entries.set(document, collection);
			}

			for (const range of ranges) {
				collection.push(new SelectionPoint(document.offsetAt(range.start), Date.now()));
				if (!range.isEmpty) {
					collection.push(new SelectionPoint(document.offsetAt(range.end), Date.now()));
				}
			}

			if (collection.length > 100) {
				collection.splice(0, 33); // remove old entries
			}
		};


		const timeout = this._store.add(new MutableDisposable());
		this._store.add(vscode.window.onDidChangeTextEditorVisibleRanges(_e => {
			timeout.value = disposableTimeout(() => {
				if (vscode.window.activeTextEditor) {
					updatePositions(vscode.window.activeTextEditor, vscode.window.activeTextEditor.visibleRanges);
				}
			}, 3000);
		}));

		this._store.add(vscode.window.onDidChangeTextEditorSelection(e => {
			updatePositions(e.textEditor, e.selections);
		}));

		this._store.add(vscode.window.onDidChangeActiveTextEditor(e => {
			if (e) {
				updatePositions(e, e.selections);
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
		this._entries.clear();
	}

	async getEntries(): Promise<Map<vscode.TextDocument, SelectionPoint[]>> {

		const result = new Map<vscode.TextDocument, SelectionPoint[]>();

		// check with copilot ignore
		for (const [key, value] of this._entries.entries()) {
			if (await this._ignoreService.isCopilotIgnored(key.uri)) {
				continue;
			}
			result.set(key, value);
		}

		// check with .gitignore
		const gitApi = this._gitExtensionService.getExtensionApi();
		if (gitApi) {

			const repos = new ResourceMap<{ repo: Repository; docs: vscode.TextDocument[] }>();
			for (const [doc] of result) {
				if (doc.uri.scheme !== Schemas.file) {
					continue;
				}
				const repo = gitApi.getRepository(doc.uri);
				if (!repo) {
					continue;
				}

				let item = repos.get(repo.rootUri);
				if (!item) {
					item = { repo, docs: [] };
					repos.set(repo.rootUri, item);
				}
				item.docs.push(doc);
			}

			for (const { repo, docs } of repos.values()) {
				const ignored = await repo.checkIgnore(docs.map(d => d.uri.fsPath));
				for (const doc of docs) {
					if (ignored.has(doc.uri.path)) {
						result.delete(doc);
					}
				}
			}
		}

		return result;
	}
}
