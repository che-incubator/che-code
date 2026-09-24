/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { injectable } from "inversify";
import * as vscode from 'vscode';

const SEARCH = 'Show in Marketplace';
const VSCODE_YAML = 'redhat.vscode-yaml';

@injectable()
export class InstallYaml {

    async run(): Promise<boolean> {
        const e = vscode.extensions.getExtension(VSCODE_YAML);
        if (e) {

            const answer = await vscode.window.showInformationMessage('YAML extension is already installed', SEARCH);
            if (SEARCH === answer) {
                await vscode.commands.executeCommand('workbench.extensions.search', VSCODE_YAML);
            }
            return true;
        } else {

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Installing YAML extension...",
            }, async (progress) => {
                progress.report({ increment: 10 });

                try {
                    await vscode.commands.executeCommand('workbench.extensions.installExtension', VSCODE_YAML);
                    progress.report({ increment: 50 });
                    // it's just to have a nice UX
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    progress.report({ increment: 100 });

                    vscode.window.showInformationMessage('YAML extension has been installed', SEARCH).then(answer => {
                        if (SEARCH === answer) {
                            vscode.commands.executeCommand('workbench.extensions.search', VSCODE_YAML);
                        }
                    });

                    return Promise.resolve();
                } catch (err) {
                    if (err.message) {
                        vscode.window.showWarningMessage(err.message);
                    }

                    return Promise.reject();
                }
            });

        }

        return false;
    }

}
