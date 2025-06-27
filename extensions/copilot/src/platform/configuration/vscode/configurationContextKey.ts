/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { Config, CopilotConfigPrefix, IConfigurationService } from '../common/configurationService';

export class ConfigContextKeyHelper extends DisposableStore {
	private readonly contextKeyName: string;

	constructor(
		private readonly setting: Config<unknown>,
		customContextKeyName: string | undefined,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.contextKeyName = customContextKeyName ?? `${setting.fullyQualifiedId}.enabled`;

		this.add(configurationService.onDidChangeConfiguration(e => {
			if (setting.advancedSubKey) {
				// This is a `github.copilot.advanced.*` setting
				if (e.affectsConfiguration(`${CopilotConfigPrefix}.advanced`)) {
					this.updateContextKey();
				}
			} else if (e.affectsConfiguration(setting.fullyQualifiedId)) {
				this.updateContextKey();
			}
		}));

		this.updateContextKey();
	}

	private updateContextKey() {
		vscode.commands.executeCommand('setContext', this.contextKeyName, this.configurationService.getConfig(this.setting));
	}
}
