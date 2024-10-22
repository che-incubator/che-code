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
import * as fs from 'fs-extra';
import * as path from 'path';

const DEFAULT_EXTENSIONS_FILE = path.join(process.env.PROJECTS_ROOT!, '.default-extensions');

export class DefaultExtensions {

    async install(): Promise<void> {
        if (!process.env.DEFAULT_EXTENSIONS) {
            return;
        }

        try {
            // get list of extesions from DEFAULT_EXTENSIONS environment variable
            let extensions: string[] = process.env.DEFAULT_EXTENSIONS!.split(';').filter(value => (value.trim()));

            // filter the list, remove the extensions installed before
            const installed = await this.readDotDefaultExtensionsFile();
            extensions = extensions.filter(value => !installed.includes(value));

            if (extensions.length) {
                console.log(`Installing default extensions: ${extensions.join('; ')}`);
                const result = await this.installExtensions(extensions);
                if (result) {
                    this.writeDotDefaultExtensionsFile(extensions);
                }
            }
        } catch (error) {
            console.log(`Failed to install default extensions. ${error}`);
        }
    }

    async readDotDefaultExtensionsFile(): Promise<string[]> {
        try {
            if (await fs.pathExists(DEFAULT_EXTENSIONS_FILE)) {
                return (await fs.readFile(DEFAULT_EXTENSIONS_FILE, 'utf8')).split('\n');
            }

        } catch (error) {
            console.log(`> Failed to read .default-extensions file. ${error}`);
        }

        return [];
    }

    async writeDotDefaultExtensionsFile(defaultExtensions: string[]): Promise<void> {
        try {
            let fileContent: string = '';
            if (await fs.pathExists(DEFAULT_EXTENSIONS_FILE)) {
                fileContent = await fs.readFile(DEFAULT_EXTENSIONS_FILE, 'utf8');
            }

            let extensions: string[] = fileContent.split('\n').filter(value => (value));
            for (const extension of defaultExtensions) {
                if (!extensions.includes(extension)) {
                    extensions.push(extension);
                }
            }

            fileContent = extensions.join('\n');
            await fs.writeFile(DEFAULT_EXTENSIONS_FILE, fileContent);

        } catch (error) {
            console.log(`Failed to write to .default-extensions file`);
        }
    }

    async installExtensions(extensions: string[]): Promise<boolean> {
        const toInstall: vscode.Uri[] = extensions.map(value => vscode.Uri.file(value));

        let installed = false;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: 'Installing default extensions'
        }, async (progress) => {
            progress.report({ increment: 0 });

            try {
                await vscode.commands.executeCommand('workbench.extensions.command.installFromVSIX', toInstall);
                installed = true;
            } catch (error) {
                vscode.window.showInformationMessage(`Failed to install default extensions. ${error.message ? error.message : error}`);
            }

            progress.report({ increment: 100 });
        });

        return installed;
    }

}
