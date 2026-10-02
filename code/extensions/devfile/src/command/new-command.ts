/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { inject, injectable } from "inversify";
import * as vscode from 'vscode';
import { log } from "../logger";
import * as devfile from "../devfile";
import { DevfileService } from "../devfile/devfile-service";
import { NewCommand, NewContainer, SaveDevfile } from "../model/extension-model";

@injectable()
export class NewCommandImpl implements NewCommand {

    @inject(DevfileService)
    private service: DevfileService;

    @inject(NewContainer)
    private newContainer: NewContainer;

    @inject(SaveDevfile)
    private saveDevfile: SaveDevfile;

    private idCounter = 0;

    async run(): Promise<boolean> {
        if (!await this.service.initDevfileFromProjectRoot()) {
            return;
        }

        try {
            if (!await this.newContainer.ensureAtLeastOneContainerExist()) {
                return;
            }

            const command = await this.defineCommand();
            if (command) {
                if (!this.service.getDevfile().commands) {
                    this.service.getDevfile().commands = [];
                }

                this.service.getDevfile().commands.push(command);

                // update Devfile, show a popup with proposal to open the Devfile
                await this.saveDevfile.onDidDevfileUpdate(`Command '${command.id}' has been created successfully`);
                return true;
            }

        } catch (err) {
            log(`ERROR occured: ${err.message}`);
        }

        return false;
    }

    private async defineCommand(): Promise<devfile.Command | undefined> {
        const label = await this.enterLabel();
        if (!label) {
            return undefined;
        }

        const component = await this.selectComponent();
        if (!component) {
            return undefined;
        }

        const commandLine = await this.enterCommandLine();
        if (!commandLine) {
            return undefined;
        }

        // form command ID
        let commandID;
        do {
            this.idCounter++;
            commandID = `command-${this.idCounter}`;
        } while (this.isCommandExist(commandID));

        return {
            id: commandID,
            exec: {
                label,
                component,
                commandLine,
                workingDir: '${PROJECT_SOURCE}'
            }
        };
    }

    /**
     * Asks user for the command label
     */
    private async enterLabel(): Promise<string> {
        return await vscode.window.showInputBox({
            value: 'Sample Command',
            title: 'Add Command Label',
            prompt: 'This label will be visible in the VS Code tasks view',

            validateInput: (value): string | vscode.InputBoxValidationMessage | undefined | null |
                Thenable<string | vscode.InputBoxValidationMessage | undefined | null> => {

                if (!value) {
                    return {
                        message: 'Command label cannot be empty',
                        severity: vscode.InputBoxValidationSeverity.Error
                    } as vscode.InputBoxValidationMessage;
                }

                const commands = this.service.getDevfile().commands;
                if (commands) {
                    for (const c of commands) {
                        if (c.exec.label && c.exec.label === value) {
                            return {
                                message: 'A command with this label alredy exists',
                                severity: vscode.InputBoxValidationSeverity.Error
                            } as vscode.InputBoxValidationMessage;
                        }
                    }

                }

                return undefined;
            }

        });
    }

    /**
     * Asks user for the component to run
     */
    private async selectComponent(): Promise<string | undefined> {
        const componentNames: string[] = this.service.getDevfile().components
            .filter(c => c.container)
            .map(c => c.name);

        if (componentNames.length === 1) {
            return componentNames[0];
        }

        const items: vscode.QuickPickItem[] = this.service.getDevfile().components
            .filter(c => c.container).map(c => {
                return {
                    label: c.name,
                    detail: c.container.image,
                } as vscode.QuickPickItem;
            });

        const item = await vscode.window.showQuickPick(items, {
            title: 'Select a container in which the command will be executed',
        });

        if (item) {
            return item.label;
        } else {
            return undefined;
        }
    }

    /**
     * Asks user to enter command line
     */
    private async enterCommandLine(): Promise<string> {
        return await vscode.window.showInputBox({
            value: 'echo "${WELCOME}"',
            title: 'Enter command line to be executed',

            validateInput: (value): string | vscode.InputBoxValidationMessage | undefined | null |
                Thenable<string | vscode.InputBoxValidationMessage | undefined | null> => {

                if (!value) {
                    return {
                        message: 'Command line cannot be empty',
                        severity: vscode.InputBoxValidationSeverity.Error
                    } as vscode.InputBoxValidationMessage;
                }

                return undefined;
            }

        });
    }

    private isCommandExist(id: string): boolean {
        const devfile = this.service.getDevfile();
        if (!devfile.commands) {
            return false;
        }

        for (const command of devfile.commands) {
            if (command.id === id) {
                return true;
            }
        }

        return false;
    }

}
