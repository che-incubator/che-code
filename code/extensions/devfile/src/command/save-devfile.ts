/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as vscode from 'vscode';
import { inject, injectable } from "inversify";
import { DevfileService } from "../devfile/devfile-service";
import { log } from '../logger';
import { SaveDevfile } from '../model/extension-model';

@injectable()
export class SaveDevfileImpl implements SaveDevfile {

    @inject(DevfileService)
    private service: DevfileService;

    async onDidDevfileUpdate(message?: string): Promise<void> {
        if (this.service.getDevfileSource() === 'unset') {
            return;
        }

        try {
            await this.service.saveToFileSystem();

            if (message) {
                vscode.window.showInformationMessage(message, 'Open Devfile').then(async answer => {
                    if ('Open Devfile' === answer) {
                        const devfileURI = this.service.getDevfileURI();
                        vscode.window.showTextDocument(devfileURI);
                    }
                });
            }

        } catch (err) {
            log(`ERROR occured: ${err.message}`);
        }
    }

}
