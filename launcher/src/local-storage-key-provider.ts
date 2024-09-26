/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { FILE_WORKBENCH } from './files.js';
import * as fs from './fs-extra.js';

const SERVER_KEY_MASK = '{{LOCAL-STORAGE}}/{{SECURE-KEY}}';

const CERTS_DIR = '/etc/ssh';

/**
 * Finds a public key in `/etc/ssh` and initializes VS Code with 32 bytes (every fourth character) of the key.
 * The key is used to encrypt/decrypt the extension secrets stored in browser local storage.
 */
export class LocalStorageKeyProvider {
  async configure(): Promise<void> {
    console.log('# Injecting server public key to che-code...');

    try {
      const publicKeyFile = await this.findPublicKeyFile();
      console.log(`  > found key file ${publicKeyFile}`);

      const secret = await this.getPartOfPublicKey(publicKeyFile);
      await this.update(FILE_WORKBENCH, SERVER_KEY_MASK, secret);
    } catch (err) {
      console.error(err.message);
    }
  }

  async findPublicKeyFile(): Promise<string> {
    // Check for public certificates in /public-certs
    if (await fs.pathExists(CERTS_DIR)) {
      const dir = await fs.readdir(CERTS_DIR);

      for (const item of dir) {
        const file = `${CERTS_DIR}/${item}`;

        if (await fs.isFile(file)) {
          // check for it's public part
          const publicKey = file + '.pub';
          if ((await fs.pathExists(publicKey)) && (await fs.isFile(publicKey))) {
            return publicKey;
          }
        }
      }
    }

    throw new Error(`Public key file is not found in ${CERTS_DIR}`);
  }

  async getPartOfPublicKey(file: string): Promise<string> {
    let content = await fs.readFile(file);
    content = content.split(' ')[1];

    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += content.charAt(i * 2);
    }

    return secret;
  }

  async update(file: string, text: string, newText: string): Promise<void> {
    const content = await fs.readFile(file);
    const newContent = content.replace(text, newText);

    if (content === newContent) {
      console.log(`  > ${file} is not updated`);
    } else {
      await fs.writeFile(file, newContent);
      console.log(`  > ${file} has been updated`);
    }
  }
}
