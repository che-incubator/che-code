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
import { NewContainer, NewEnvironmentVariable, SaveDevfile } from "../model/extension-model";

@injectable()
export class NewEnvironmentVariableImpl implements NewEnvironmentVariable {

    @inject(DevfileService)
    private service: DevfileService;

    @inject(NewContainer)
    private newContainer: NewContainer;

    @inject(SaveDevfile)
    private saveDevfile: SaveDevfile;

    async run(): Promise<boolean> {
        if (!await this.service.initDevfileFromProjectRoot()) {
            return;
        }

        try {
            if (!await this.newContainer.ensureAtLeastOneContainerExist()) {
                return;
            }

            const environmentVariable = await this.defineEnvironmentVariable();
            if (environmentVariable) {
                // update Devfile, show a popup with proposal to open the Devfile
                await this.saveDevfile.onDidDevfileUpdate(`Environment variable '${environmentVariable.name}' has been created successfully`);
                return true;
            }

        } catch (err) {
            log(`ERROR occured: ${err.message}`);
        }

        return false;
    }

    private async defineEnvironmentVariable(): Promise<devfile.EnvironmentVariable | undefined> {
        // select component container
        const component = await this.selectComponent();
        if (!component) {
            return undefined;
        }

        // enter name
        const name = await this.enterEnvironmentVariableName(component);
        if (!name) {
            return undefined;
        }

        const value = await this.enterEnvironmentVariableValue();
        // empty value is allowed
        if (value === undefined) {
            return undefined;
        }

        const environmentVariable: devfile.EnvironmentVariable = {
            name,
            value
        };

        if (!component.container.env) {
            component.container.env = [];
        }

        component.container.env.push(environmentVariable);
        return environmentVariable;
    }

    /**
     * Asks user to select a container for the environment variable
     */
    private async selectComponent(): Promise<devfile.Component | undefined> {
        const componentNames: string[] = this.service.getDevfile().components
            .filter(c => c.container)
            .map<string>(c => c.name);

        if (componentNames.length === 1) {
            return this.service.getDevfile().components.find(c => c.name === componentNames[0]);
        }

        const items: vscode.QuickPickItem[] = this.service.getDevfile().components
            .filter(c => c.container).map(c => {
                return {
                    label: c.name,
                    detail: c.container.image,
                } as vscode.QuickPickItem;
            });

        const item = await vscode.window.showQuickPick(items, {
            title: 'Select a container to which the new environment variable will be added',
        });

        if (item) {
            return this.service.getDevfile().components.find(c => c.name === item.label);
        } else {
            return undefined;
        }
    }

    /**
     * Ask user to enter environment variable name
     */
    private async enterEnvironmentVariableName(component: devfile.Component): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            value: 'WELCOME',
            title: 'Environment Variable Name',

            validateInput: (value): string | vscode.InputBoxValidationMessage | undefined | null |
                Thenable<string | vscode.InputBoxValidationMessage | undefined | null> => {
                if (!value) {
                    return {
                        message: 'Environment variable name cannot be empty',
                        severity: vscode.InputBoxValidationSeverity.Error
                    } as vscode.InputBoxValidationMessage;
                }

                if (component.container && component.container.env) {
                    if (component.container.env.find(e => e.name === value)) {
                        return {
                            message: 'Enviroment variable with this name already exists',
                            severity: vscode.InputBoxValidationSeverity.Error
                        } as vscode.InputBoxValidationMessage;
                    }
                }

                return undefined;
            }
        });
    }

    private async enterEnvironmentVariableValue(): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            value: 'Hello World',
            title: 'Environment Variable Value'
        });
    }

}
