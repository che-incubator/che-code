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

export class DefaultExtensions {

    async install(): Promise<void> {
        if (!process.env.DEFAULT_EXTENSIONS) {
            console.log('> Default extensions is not defined (DEFAULT_EXTENSIONS environment variable is unset).');
            return;
        }

        try {
            // get extesions from DEFAULT_EXTENSIONS environment cariable
            let extensions = this.getDefaultExtensions();

            // filter the list, remove the extensions installed before
            const installed = await this.readDotDefaultExtensionsFile();
            extensions = extensions.filter(value => !installed.includes(value));

            if (extensions.length) {
                const result = await this.installExtensions(extensions);
                if (result) {
                    this.writeDotDefaultExtensionsFile(extensions);
                }
            }
        } catch (error) {
            console.log(`Failed to install default extensions. ${error}`);
        }
    }

    getDefaultExtensions(): string[] {
        const extensions: string[] = [];

        console.log('--------------------------------------------');
        console.log(`> Default etensions:`);

        const extensionList = process.env.DEFAULT_EXTENSIONS!.split(';');
        for (const extension of extensionList) {
            if (extension.trim()) {
                console.log(`    > [${extension.trim()}]`);
                extensions.push(extension.trim());
            }
        }
        console.log('--------------------------------------------');

        return extensions;
    }

    async readDotDefaultExtensionsFile(): Promise<string[]> {
        try {
            const filePath = path.join(process.env.PROJECTS_ROOT!, '.default-extensions');
            console.log(`> default extensions file path: ${filePath}`);

            if (await fs.pathExists(filePath)) {
                console.log(`> reading default extensions file...`);

                const fileContent = await fs.readFile(filePath, 'utf8');
                // console.log(fileContent);

                const defaultExtensions: string[] = fileContent.split('\n');
                for (const de of defaultExtensions) {
                    console.log(`  > ${de}`);
                }

                return defaultExtensions;

            } else {
                console.log(`> default extensions file NOT found`);
            }

        } catch (error) {
            console.log(`> error: ${error}`);
        }

        return [];
    }

    async writeDotDefaultExtensionsFile(defaultExtensions: string[]): Promise<void> {
        console.log(`> write default extensions: ${defaultExtensions}`);

        
        try {
            const filePath = path.join(process.env.PROJECTS_ROOT!, '.default-extensions');
            console.log(`> default extensions file path: ${filePath}`);
            
            let fileContent: string = '';
            if (await fs.pathExists(filePath)) {
                fileContent = await fs.readFile(filePath, 'utf8');
            }

            let extensions: string[] = fileContent.split('\n').filter(value => (value));
            for (const extension of defaultExtensions) {
                if (!extensions.includes(extension)) {
                    extensions.push(extension);
                }
            }

            fileContent = extensions.join('\n');
            console.log('------------------------------');
            console.log(fileContent);
            console.log('------------------------------');

            await fs.writeFile(filePath, fileContent);

        } catch (error) {
            console.log(`Failure to write to .default-extensions file`);
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
