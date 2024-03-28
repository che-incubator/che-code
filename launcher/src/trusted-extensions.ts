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
import { ProductJSON } from './product-json';

export class TrustedExtensions {
  async configure(): Promise<void> {
    console.log('# Configuring Trusted Extensions...');

    if (!env.VSCODE_TRUSTED_EXTENSIONS) {
      console.log('  > env.VSCODE_TRUSTED_EXTENSIONS is not defined, skip this step');
      return;
    }

    try {
      const extensions: string[] = [];

      const tmp = env.VSCODE_TRUSTED_EXTENSIONS.split(',');
      for (const e of tmp) {
        if (e) {
          extensions.push(e);
        }
      }

      if (!extensions.length) {
        console.log('  > env.VSCODE_TRUSTED_EXTENSIONS does not specify any extension');
        return;
      }

      for (const e of extensions) {
        console.log(`  > add ${e}`);
      }

      const productJSON = await new ProductJSON().load();
      let productJSONChanged = false;

      let access = productJSON.getTrustedExtensionAuthAccess();
      if (access === undefined) {
        productJSON.setTrustedExtensionAuthAccess([...extensions]);
        productJSONChanged = true;
      } else if (Array.isArray(access)) {
        for (const e of extensions) {
          if (!access.includes(e)) {
            access.push(e);
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
