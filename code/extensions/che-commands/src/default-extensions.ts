/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';

export class DefaultExtensions {

    async install(): Promise<void> {
        const defaultExtensions = process.env.DEFAULT_EXTENSIONS;
        if (!defaultExtensions) {
            console.log('> Default extensions is not defined (DEFAULT_EXTENSIONS environment variable is unset).');
            return;
        }

        const extensions: vscode.Uri[] = [];

        const extensionList = defaultExtensions.split(';');
        for (const extension of extensionList) {
            if (extension.trim()) {
                console.log(`> default extension [${extension.trim()}]`);
                extensions.push(vscode.Uri.file(extension.trim()));
            }
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: 'Installing default extensions'
        }, async (progress) => {
            progress.report({ increment: 0 });

            try {
                await vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', extensions);
                progress.report({ increment: 100 });
            } catch (error) {
                vscode.window.showInformationMessage(`Failed to install default extensions. ${error.message ? error.message : error}`);
            }

            progress.report({ increment: 100 });
        });

    }

}
