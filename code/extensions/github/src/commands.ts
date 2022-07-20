/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI } from './typings/git';
import { publishRepository } from './publish';
import { DisposableStore } from './util';
import { getPermalink } from './links';

async function copyVscodeDevLink(gitAPI: GitAPI, useSelection: boolean) {
	try {
		const permalink = getPermalink(gitAPI, useSelection, 'https://vscode.dev/github');
		if (permalink) {
			return vscode.env.clipboard.writeText(permalink);
		}
	} catch (err) {
		vscode.window.showErrorMessage(err.message);
	}
}

async function openVscodeDevLink(gitAPI: GitAPI): Promise<vscode.Uri | undefined> {
	try {
		const permalink = getPermalink(gitAPI, true, 'https://vscode.dev/github');
		return permalink ? vscode.Uri.parse(permalink) : undefined;
	} catch (err) {
		vscode.window.showErrorMessage(err.message);
		return undefined;
	}
}

export function registerCommands(gitAPI: GitAPI): vscode.Disposable {
	const disposables = new DisposableStore();

	disposables.add(vscode.commands.registerCommand('github.publish', async () => {
		try {
			publishRepository(gitAPI);
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLink', async () => {
		return copyVscodeDevLink(gitAPI, true);
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLinkFile', async () => {
		return copyVscodeDevLink(gitAPI, false);
	}));

	disposables.add(vscode.commands.registerCommand('github.openOnVscodeDev', async () => {
		return openVscodeDevLink(gitAPI);
	}));

	return disposables;
}
