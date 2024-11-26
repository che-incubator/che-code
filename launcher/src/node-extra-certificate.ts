/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from './fs-extra.js';

export const NODE_EXTRA_CERTIFICATE_DIR = '/tmp/node-extra-certificates';
export const NODE_EXTRA_CERTIFICATE = `${NODE_EXTRA_CERTIFICATE_DIR}/ca.crt`;

const CHE_CERTIFICATE = '/tmp/che/secret/ca.crt';
const PUBLIC_CERTS_DIR = '/public-certs';

export class NodeExtraCertificate {
  /*****************************************************************************************************************
   *
   * Prepares `/tmp/node-extra-certificates/ca.crt` certificate, initilizes NODE_EXTRA_CA_CERTS.
   *
   * It's a replacement of
   * https://github.com/che-incubator/che-code/blob/f9389060f4dd7a435b13c75b63f6f12ec41fbd8e/build/scripts/entrypoint-volume.sh#L120-L161
   *
   *****************************************************************************************************************/
  async configure(): Promise<void> {
    console.log('# Configuring Node extra certificates...');

    if (await fs.pathExists(NODE_EXTRA_CERTIFICATE)) {
      console.log(`  > File ${NODE_EXTRA_CERTIFICATE} is already exist, skip this step`);
      return;
    }

    let data = '';

    // Check if we have a custom Che CA certificate
    if (await fs.pathExists(CHE_CERTIFICATE)) {
      console.log(`  > found ${CHE_CERTIFICATE}`);

      let content = await fs.readFile(CHE_CERTIFICATE);
      data += content ? (content.endsWith('\n') ? content : (content += '\n')) : '';
    }

    // Check if we have public certificates in /public-certs
    if (await fs.pathExists(PUBLIC_CERTS_DIR)) {
      const dir = await fs.readdir(PUBLIC_CERTS_DIR);

      for (const item of dir) {
        const file = `${PUBLIC_CERTS_DIR}/${item}`;

        if (await fs.isFile(file)) {
          console.log(`  > found ${file}`);
          let content = await fs.readFile(file);
          data += content ? (content.endsWith('\n') ? content : (content += '\n')) : '';
        }
      }
    }

    if (!data) {
      console.log('  > did not find any key');
      return;
    }

    console.log(`  > writing ${NODE_EXTRA_CERTIFICATE}..`);

    // ensure dir is present
    await fs.mkdir(NODE_EXTRA_CERTIFICATE_DIR);

    await fs.writeFile(NODE_EXTRA_CERTIFICATE, data);
  }
}
