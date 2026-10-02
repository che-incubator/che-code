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
import * as devfile from '../devfile';
import { log } from "../logger";
import * as vscode from 'vscode';
import { posix } from 'path';
import { env } from "process";

import { safeDump, safeLoad } from 'js-yaml';

export const DEFAULT_SCHEMA_VERSION = '2.2.0';

@injectable()
export class DevfileService {

    private devfile: devfile.Devfile = {
        schemaVersion: DEFAULT_SCHEMA_VERSION
    };

    private devfileSource: 'unset' | '.devfile.yaml' | 'devfile.yaml' = 'unset';

    public async initDevfileFromProjectRoot(): Promise<devfile.Devfile | undefined> {

        if (!vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open the project to create a Devfile');
            return undefined;
        }

        let devfileYaml: {
            devfile: devfile.Devfile,
            source: '.devfile.yaml' | 'devfile.yaml'
        } | undefined;

        try {
            devfileYaml = await this.fetchDevfileFromFile('.devfile.yaml') || await this.fetchDevfileFromFile('devfile.yaml');
        } catch (err) {
            if ('Not a file' === err.message) {
                return undefined;
            }
        }

        if (devfileYaml) {
            // validate devfile
            if (!this.isDevfileValid(devfileYaml.devfile)) {
                if ('Open Devfile' === await vscode.window.showWarningMessage(
                    `Devfile ${devfileYaml.source} at the root of your project has invalid format`, 'Open Devfile')) {

                    const folderUri = vscode.workspace.workspaceFolders[0].uri;
                    const devfileUri = folderUri.with({ path: posix.join(folderUri.path, devfileYaml.source) });
                    vscode.window.showTextDocument(devfileUri);
                }

                return undefined;
            }

        } else {
            devfileYaml = {
                devfile: {
                    schemaVersion: DEFAULT_SCHEMA_VERSION
                },
                source: '.devfile.yaml'
            };
        }

        this.ensureNameIsSet(devfileYaml.devfile);

        this.devfile = devfileYaml.devfile;
        this.devfileSource = devfileYaml.source;

        return devfileYaml.devfile;
    }

    private async fetchDevfileFromFile(source: '.devfile.yaml' | 'devfile.yaml'): Promise<{
        devfile: devfile.Devfile,
        source: '.devfile.yaml' | 'devfile.yaml'
    } | undefined> {

        const wsFolderUri = vscode.workspace.workspaceFolders[0].uri;
        const dotDevfileUri = wsFolderUri.with({ path: posix.join(wsFolderUri.path, source) });

        try {
            const stat = await vscode.workspace.fs.stat(dotDevfileUri);
            if (stat.type === vscode.FileType.File) {
                const readData = await vscode.workspace.fs.readFile(dotDevfileUri);
                const readStr = Buffer.from(readData).toString('utf8');
                const devfile = safeLoad(readStr) as devfile.Devfile;
                return {
                    devfile,
                    source
                };
            }

            await vscode.window.showWarningMessage(`Found ${source}, but it is not a file`, 'Close');
        } catch (err) {
            if (err instanceof vscode.FileSystemError && 'FileNotFound' === err.code) {
                // Devfile is not found. It's normal behavior
            } else {
                log(err.message);
            }

            return undefined;
        }

        throw new Error('Not a file');
    }

    private ensureNameIsSet(devfile: devfile.Devfile): void {
        if (!devfile.metadata) {
            devfile.metadata = {};
        } else if (devfile.metadata.name) {
            // name is already set
            return;
        }

        // DevWorkspace specific
        if (env.DEVWORKSPACE_NAME) {
            devfile.metadata.name = env.DEVWORKSPACE_NAME;
            return;
        }

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
            devfile.metadata.name = vscode.workspace.workspaceFolders[0].name;
            return;
        }

        devfile.metadata.name = 'devfile-sample';
    }

    public getDevfile(): devfile.Devfile | undefined {
        return this.devfile;
    }

    public getDevfileSource() {
        return this.devfileSource;
    }

    public getDevfileURI(): vscode.Uri | undefined {
        if (!vscode.workspace.workspaceFolders ||
            vscode.workspace.workspaceFolders.length === 0) {
            return undefined;
        }

        const folderUri = vscode.workspace.workspaceFolders[0].uri;
        const devfileUri = folderUri.with({ path: posix.join(folderUri.path, this.devfileSource) });

        return devfileUri;
    }

    public async saveToFileSystem(): Promise<void> {
        const content = safeDump(this.devfile);
        const devfileUri = this.getDevfileURI();
        await vscode.workspace.fs.writeFile(devfileUri!, Buffer.from(content, 'utf8'));
    }

    private isDevfileValid(devfile: devfile.Devfile): boolean {
        try {
            if (!devfile) {
                return false;
            }

            // dummy check
            if (devfile.schemaVersion) {
                return true;
            }

            // need to find a way how to validate the Devfile

        } catch (e) {
            log(e.message);
        }

        return false;
    }

}
