/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { ISecretStorageProvider } from 'vs/platform/secrets/common/secrets';

export class CheSecretStorageProvider implements ISecretStorageProvider {

    type: 'in-memory' | 'persisted' | 'unknown' = 'persisted';
    
    constructor() {
        console.log('>>> creating CheSecretStorageProvider !!');
    }

    async get(key: string): Promise<string | undefined> {
        console.log(`>> CheSecretStorageProvider :: get [${key}]`);
        return 'dummy-value';
    }

    async set(key: string, value: string): Promise<void> {
        console.log(`>> CheSecretStorageProvider :: set [${key}] value [${value}]`);
    }

    async delete(key: string): Promise<void> {
        console.log(`>> CheSecretStorageProvider :: delete [${key}]`);
    }

}
