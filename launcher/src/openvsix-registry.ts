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
import { FILE_WORKBENCH } from './files.js';
import * as fs from './fs-extra.js';
import { ProductJSON } from './product-json.js';

export class OpenVSIXRegistry {
  /*****************************************************************************************************************
   *
   * Configures OpenVSIX registry.
   *  - if OPENVSX_REGISTRY_URL environment variable exists, applies it as a extension registry.
   *  - if not, then uses CHE_PLUGIN_REGISTRY_URL.
   *
   * It's a replacement of
   * https://github.com/che-incubator/che-code/blob/f9389060f4dd7a435b13c75b63f6f12ec41fbd8e/build/scripts/entrypoint-volume.sh#L47-L66
   *
   *****************************************************************************************************************/
  async configure(): Promise<void> {
    console.log('# Configuring OpenVSIX registry...');

    if (env.OPENVSX_REGISTRY_URL === undefined) {
      console.log('  > env.OPENVSX_REGISTRY_URL is not set, skip this step');
      return;
    }

    try {
      let openvsxURL;
      if (env.OPENVSX_REGISTRY_URL) {
        console.log(`  > env.OPENVSX_REGISTRY_URL set to ${env.OPENVSX_REGISTRY_URL}`);
        openvsxURL = `${this.withoutTrailingSlash(env.OPENVSX_REGISTRY_URL)}/vscode`;
      } else if (env.CHE_PLUGIN_REGISTRY_URL) {
        console.log(
          `  > env.OPENVSX_REGISTRY_URL is empty, use env.CHE_PLUGIN_REGISTRY_URL ${env.CHE_PLUGIN_REGISTRY_URL}`
        );
        let registryURL = this.withoutTrailingSlash(env.CHE_PLUGIN_REGISTRY_URL);
        if (registryURL.endsWith('/v3')) {
          registryURL = registryURL.substring(0, registryURL.length - 3);
        }

        openvsxURL = `${registryURL}/openvsx/vscode`;
      } else {
        console.error('  > CHE_PLUGIN_REGISTRY_URL environment variable is not set');
        return;
      }

      console.log(`  > apply OpenVSIX URL [${openvsxURL}]`);

      const productJSON = await new ProductJSON().load();

      const serviceURL = productJSON.getExtensionsGalleryServiceURL();
      const itemURL = productJSON.getExtensionsGalleryItemURL();

      const newServiceURL = `${openvsxURL}/gallery`;
      const newItemURL = `${openvsxURL}/item`;

      productJSON.setExtensionsGalleryServiceURL(newServiceURL);
      productJSON.setExtensionsGalleryItemURL(newItemURL);
      await productJSON.save();

      await this.update(FILE_WORKBENCH, serviceURL, newServiceURL, itemURL, newItemURL);
    } catch (err) {
      console.error(`${err.message} Failure to configure OpenVSIX registry.`);
    }
  }

  async update(
    file: string,
    currentServiceURL: string,
    newServiceURL: string,
    currentItemURL: string,
    newItemURL: string
  ): Promise<void> {
    const content = await fs.readFile(file);
    const newContent = content.replace(
      `extensionsGallery:{serviceUrl:"${currentServiceURL}",itemUrl:"${currentItemURL}"}`,
      `extensionsGallery:{serviceUrl:"${newServiceURL}",itemUrl:"${newItemURL}"}`
    );
    await fs.writeFile(file, newContent);
  }

  withoutTrailingSlash(url: string): string {
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }

    return url;
  }
}
