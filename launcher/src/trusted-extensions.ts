/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from 'process';
import { ProductJSON } from './product-json';

export class TrustedExtensions {
  async configure(): Promise<void> {
    console.log('# Configuring Trusted Extensions...');

    if (env.TRUSTED_EXTENSIONS === undefined) {
      console.log('  > env.TRUSTED_EXTENSIONS is not set, skip this step');
      return;
    }

    try {
      const extensions = env.TRUSTED_EXTENSIONS.split(',');
      console.log(`> extensions: ${extensions.length}`);

      if (!extensions.length) {
        console.log('  > env.TRUSTED_EXTENSIONS is empty, skip this step');
        return;
      }

      for (const e of extensions) {
        console.log(`  > extension ${e}`);
      }

      const productJSON = await new ProductJSON().load();
      let productJSONChanged = false;

      let access = productJSON.getTrustedExtensionAuthAccess();
      if (access === undefined) {
        console.log('> access is UNDEFINED');
        access = [];
        access.push(...extensions);
        console.log(`> access [${access.toString()}]`);
        productJSON.setTrustedExtensionAuthAccess(access);
        productJSONChanged = true;
      } else if (Array.isArray(access)) {
        console.log('>> access is ARRAY');

        for (const e of extensions) {
          if (!access.includes(e)) {
            access.push(e);
            productJSONChanged = true;
          }
        }

        console.log(`> access [${access.toString()}]`);
      } else {
        console.log(`>> access is not an ARRAY. Type is: ${typeof access}`);

        const newList: string[] = [];

        for (const key of Object.keys(access)) {
          console.log(`>>> key [${key}]`);
          for (const e of access[key]) {
            console.log(`    > extension [${e}]`);
            if (!newList.includes(e)) {
              newList.push(e);
            }
          }
        }

        console.log('> combined extensions');
        for (const e of newList) {
          console.log(`  > extension [${e}]`);
        }

        // add missing
        for (const e of extensions) {
          if (!newList.includes(e)) {
            newList.push(e);
            productJSONChanged = true;
          }
        }

        if (productJSONChanged) {
          productJSON.setTrustedExtensionAuthAccess(newList);
        }
      }

      if (productJSONChanged) {
        await productJSON.save();
      }
    } catch (err) {
      console.error(`${err.message} Failure to configure OpenVSIX registry.`);
    }
  }
}
