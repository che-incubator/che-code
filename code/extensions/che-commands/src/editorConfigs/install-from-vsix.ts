/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';
import { EditorConfigurations } from './editor-configurations';

export const INSTALL_FROM_VSIX = 'extensions.install-from-vsix-enabled';

export class InstallFromVSIX {
    constructor(private outputChannel: vscode.OutputChannel) { }

    async apply(configs: EditorConfigurations): Promise<void> {
        this.outputChannel.appendLine('[InstallFromVSIX] Looking for configurations...');

        try {
            const installFromVsix = configs[INSTALL_FROM_VSIX];
            if (installFromVsix === undefined) {
                this.outputChannel.appendLine('[InstallFromVSIX] Configuration for the Install From VSIX command not found');
                return;
            }

            if (installFromVsix === false || installFromVsix === 'false') {
                this.outputChannel.appendLine(`[InstallFromVSIX] applying ${installFromVsix} value for the ${INSTALL_FROM_VSIX} configuration.`);
                // disable command
                vscode.commands.executeCommand('setContext', INSTALL_FROM_VSIX, false);
            }
        } catch (error) {
            this.outputChannel.appendLine(`[InstallFromVSIX] Failed to configure Install From VSIX command: ${error}`);
        }
    }
}
