/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as os from 'os';
import * as vscode from 'vscode';

const TERMINAL_SECTION_ID = 'terminal';
const LINUX_DEFAULT_PROFILE_ID = 'integrated.defaultProfile.linux';
const WARNING_MESSAGE = 'Default terminal profile is not configured, you can try sh profile as default or select another profile in settings';
const SH_AS_DEFAULT = 'Use sh as default profile';
const OPEN_SETTINGS = 'Open Settings';

export async function resolveTerminalProfile(outputChannel: vscode.OutputChannel): Promise<void> {
	const shellEnvVar = process.env.SHELL;
	outputChannel.appendLine(`SHELL env variable: ${shellEnvVar}`);

	const terminalConfig = vscode.workspace.getConfiguration(TERMINAL_SECTION_ID);
	const defaultProfile = terminalConfig.get<string>(LINUX_DEFAULT_PROFILE_ID);
	outputChannel.appendLine(`Default terminal profile: ${defaultProfile}`);

	const currentShell = os.userInfo().shell;
	outputChannel.appendLine(`os.userInfo().shell: ${currentShell}`);

	if (defaultProfile || shellEnvVar) {
		return;
	}

	if (!currentShell || currentShell.includes('nologin') || currentShell.includes('false')) {
		return suggestProfileResolving(terminalConfig, outputChannel);
	}
}

async function suggestProfileResolving(terminalConfig: vscode.WorkspaceConfiguration, outputChannel: vscode.OutputChannel): Promise<void> {
	const selected = await vscode.window.showWarningMessage(WARNING_MESSAGE, OPEN_SETTINGS, SH_AS_DEFAULT);
	outputChannel.appendLine(`${selected} was selected for resolving default terminal profile`);

	if (selected === OPEN_SETTINGS) {
		vscode.commands.executeCommand('workbench.action.openSettings2', { query: `${TERMINAL_SECTION_ID}.${LINUX_DEFAULT_PROFILE_ID}` });
	} else if (selected === SH_AS_DEFAULT) {
		terminalConfig.update(LINUX_DEFAULT_PROFILE_ID, 'sh', false);
	}
}
