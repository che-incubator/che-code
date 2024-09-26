/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from 'process';
import { ProductJSON } from './product-json.js';

export class TrustedExtensions {
  async configure(): Promise<void> {
    console.log('# Configuring Trusted Extensions...');

    if (!env.VSCODE_TRUSTED_EXTENSIONS) {
      console.log('  > env.VSCODE_TRUSTED_EXTENSIONS is not defined, skip this step');
      return;
    }

    console.log(`  > env.VSCODE_TRUSTED_EXTENSIONS is set to [${env.VSCODE_TRUSTED_EXTENSIONS}]`);

    try {
      const extensions: string[] = [];

      for (const extension of env.VSCODE_TRUSTED_EXTENSIONS.split(',')) {
        if (extension) {
          if (extension.match(/^[A-Za-z0-9][A-Za-z0-9-]*\.[A-Za-z0-9][A-Za-z0-9-.]*$/)) {
            extensions.push(extension.toLowerCase());
            console.log(`  > add ${extension}`);
          } else {
            console.log(`  > failure to add [${extension}] because of wrong identifier`);
          }
        }
      }

      if (!extensions.length) {
        console.log(
          '  > ERROR: The variable provided most likely has wrong format. It should specify one or more extensions separated by comma.'
        );
        return;
      }

      const productJSON = await new ProductJSON().load();
      let productJSONChanged = false;

      let access = productJSON.getTrustedExtensionAuthAccess();
      if (access === undefined) {
        productJSON.setTrustedExtensionAuthAccess([...extensions]);
        productJSONChanged = true;
      } else if (Array.isArray(access)) {
        for (const extension of extensions) {
          if (!access.includes(extension)) {
            access.push(extension);
            productJSONChanged = true;
          }
        }
      } else {
        console.log('  > Unexpected type of trustedExtensionAuthAccess in product.json. Skip this step');
        return;
      }

      if (productJSONChanged) {
        await productJSON.save();
      }
    } catch (err) {
      console.error(`${err.message} Failure to configure trusted extensions in product.json.`);
    }
  }
}
