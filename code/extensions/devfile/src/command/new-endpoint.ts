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
import { log } from "../logger";
import { DevfileService } from "../devfile/devfile-service";
import { NewContainer, NewEndpoint, SaveDevfile } from "../model/extension-model";
import * as vscode from 'vscode';
import * as devfile from "../devfile";

@injectable()
export class NewEndpointImpl implements NewEndpoint {

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

            const endpoint = await this.defineEndpoint();
            if (endpoint) {
                // update Devfile, show a popup with proposal to open the Devfile
                await this.saveDevfile.onDidDevfileUpdate(`Endpoint '${endpoint.name}' has been created successfully`);
                return true;
            }

        } catch (err) {
            log(`ERROR occured: ${err.message}`);
        }

        return false;
    }

    private async defineEndpoint(): Promise<devfile.Endpoint | undefined> {
        // select component container
        const component = await this.selectComponent();
        if (!component) {
            return undefined;
        }

        // enter port
        const exposedPort = await this.enterExposedPort(component);
        if (!exposedPort) {
            return undefined;
        }

        // enter exposure
        const exposure = await this.enterExposure();
        if (!exposure) {
            return undefined;
        }

        if (!component.container.endpoints) {
            component.container.endpoints = [];
        }

        const endpoint: devfile.Endpoint = {
            name: `port-${exposedPort}`,
            targetPort: exposedPort,
            exposure
        };

        component.container.endpoints.push(endpoint);

        return endpoint;
    }

    /**
     * Asks user to select a container for the endpoint
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
            title: 'Select a container to which the new endpoint will be added',
        });

        if (item) {
            return this.service.getDevfile().components.find(c => c.name === item.label);
        } else {
            return undefined;
        }
    }

    private async enterExposedPort(component: devfile.Component): Promise<number | undefined> {
        const port = await vscode.window.showInputBox({
            value: '8080',
            title: 'Exposed Port',

            validateInput: (value): string | vscode.InputBoxValidationMessage | undefined | null |
                Thenable<string | vscode.InputBoxValidationMessage | undefined | null> => {
                if (!value) {
                    return {
                        message: 'Exposed port cannot be empty',
                        severity: vscode.InputBoxValidationSeverity.Error
                    } as vscode.InputBoxValidationMessage;
                }

                const pValue: number = Number.parseInt(value);
                if (!Number.isInteger(pValue)) {
                    return {
                        message: 'Only Integer is allowed',
                        severity: vscode.InputBoxValidationSeverity.Error
                    } as vscode.InputBoxValidationMessage;
                }

                if (component.container && component.container.endpoints) {
                    if (component.container.endpoints.find(e => e.targetPort === pValue)) {
                        return {
                            message: 'This port is already exposed',
                            severity: vscode.InputBoxValidationSeverity.Error
                        } as vscode.InputBoxValidationMessage;
                    }
                }

                return undefined;
            }
        });

        return Number.parseInt(port);
    }

    private async enterExposure(): Promise<'public' | 'internal' | 'none' | undefined> {
        const dPublic = 'Endpoint will be exposed on the public network';
        const dInternal = 'Endpoint will be exposed internally outside of the main devworkspace POD';
        const dNone = 'Endpoint will not be exposed and will only be accessible inside the main devworkspace POD';

        const items: vscode.QuickPickItem[] = [
            {
                label: 'public',
                detail: dPublic
            },
            {
                label: 'internal',
                detail: dInternal
            },
            {
                label: 'none',
                detail: dNone
            }
        ];

        const item = await vscode.window.showQuickPick(items, {
            title: 'Describe how the port should be exposed on the network'
        });

        if (item) {
            switch (item.label) {
                case 'public':
                    return 'public';
                case 'internal':
                    return 'internal';
                case 'none':
                    return 'none';
            }
        }

        return undefined;
    }

}
