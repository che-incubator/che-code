/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { FILE_WORKBENCH_WEB_MAIN } from './files';
import * as fs from './fs-extra';

const AES_CRYPT_KEY_MASK = '{{AES-GCM-CRYPT}}{{DEFAULT-KEY}}';

export class StorageCrypto {
  async configure(): Promise<void> {
    console.log('# Injecting AES public key to che-code...');

    const value = 'aaaabbbbccccddddeeeeffffgggghhhh';
    // console.log(`  > apply DevWorkspace ID [${env.DEVWORKSPACE_ID}]`);

    try {
      await this.update(FILE_WORKBENCH_WEB_MAIN, AES_CRYPT_KEY_MASK, value);
    } catch (err) {
      console.error(`${err.message} Failure to inject AES public key.`);
    }
  }

  async update(file: string, text: string, newText: string): Promise<void> {
    const content = await fs.readFile(file);
    const newContent = content.replace(text, newText);
    await fs.writeFile(file, newContent);
  }
}
