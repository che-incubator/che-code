/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { isTestFile, TestFileFinder } from '../../prompt/node/testFiles';


export class TestRelatedFilesProvider extends Disposable implements vscode.ChatRelatedFilesProvider {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	private isEnabled() {
		return this._configurationService.getConfig(ConfigKey.Test2SrcRelatedFilesProvider) === true;
	}

	async provideRelatedFiles(chatRequest: vscode.ChatRequestDraft, token: vscode.CancellationToken): Promise<vscode.ChatRelatedFile[] | undefined> {
		if (!this.isEnabled()) {
			return;
		}

		const result: vscode.ChatRelatedFile[] = [];

		const finder = this._instantiationService.createInstance(TestFileFinder);

		for (const candidate of chatRequest.files) {
			const doc = await this._workspaceService.openTextDocumentAndSnapshot(candidate);
			if (!isTestFile(doc)) {
				continue;
			}
			const srcUri = await finder.findFileForTestFile(doc, token);
			if (srcUri) {
				result.push({ uri: srcUri, description: l10n.t('Tested by {0}', this._workspaceService.asRelativePath(doc.uri)) });
			}
		}
		return result;
	}
}
