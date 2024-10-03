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
import * as fs from './fs-extra.js';
import { FlattenedDevfile } from './flattened-devfile.js';
import { ProductJSON } from './product-json.js';

import { FILE_EXTENSION_HOST_PROCESS, FILE_WORKBENCH } from './files.js';

export class WebviewResources {
  /*****************************************************************************************************************
   *
   * Configures WebView lo load static resources from local host.
   * To turn the feature on, the 'WEBVIEW_LOCAL_RESOURCES' environment variable should be initialized with 'true'.
   *
   * It's a replacement of
   * https://github.com/che-incubator/che-code/blob/f9389060f4dd7a435b13c75b63f6f12ec41fbd8e/build/scripts/entrypoint-volume.sh#L69-L117
   *
   *****************************************************************************************************************/
  async configure(): Promise<void> {
    console.log('# Configuring Webview Resources location...');

    if (env.WEBVIEW_LOCAL_RESOURCES !== undefined && 'false' === env.WEBVIEW_LOCAL_RESOURCES) {
      console.log(`  > env.WEBVIEW_LOCAL_RESOURCES is set to 'false', skip this step`);
      return;
    }

    try {
      const cheCodeEndpoint = await new FlattenedDevfile().getCheCodeEndpoint();

      const newURL = `${cheCodeEndpoint}oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/`;

      const productJSON = await new ProductJSON().load();

      const currentURL = productJSON.getWebviewContentExternalBaseUrlTemplate();

      // update in product.json
      productJSON.setWebviewContentExternalBaseUrlTemplate(newURL);

      await productJSON.save();

      // update files
      await this.update(FILE_WORKBENCH, currentURL, newURL);
      await this.update(FILE_EXTENSION_HOST_PROCESS, currentURL, newURL);

      console.log(`  > webview resources endpoint ${newURL}`);
    } catch (err) {
      console.error(`${err.message} Webviews will not work if CDN disabled.`);
    }
  }

  async update(file: string, currentURL: string, newURL: string): Promise<void> {
    const content = await fs.readFile(file);
    const newContent = content.replace(currentURL, newURL);
    await fs.writeFile(file, newContent);
  }
}
