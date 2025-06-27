/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

export class WalkthroughCommandContribution extends Disposable {
	constructor() {
		super();
		this._register(vscode.commands.registerCommand('github.copilot.open.walkthrough', () => {
			vscode.commands.executeCommand('workbench.action.openWalkthrough', { category: 'GitHub.copilot-chat#copilotWelcome' }, /* toSide */ false);
		}));
	}
}
