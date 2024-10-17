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

const PRODUCT_JSON = 'product.json';

export interface Record {
  [key: string]: string[];
}

export class ProductJSON {
  private json: any;

  async load(): Promise<ProductJSON> {
    const content = await fs.readFile(PRODUCT_JSON);
    this.json = JSON.parse(content);

    return this;
  }

  async save(): Promise<void> {
    const serialized = JSON.stringify(this.json, null, '\t');
    await fs.writeFile(PRODUCT_JSON, serialized);
  }

  getWebviewContentExternalBaseUrlTemplate(): string {
    const url = this.json.webviewContentExternalBaseUrlTemplate;

    if (!url) {
      throw new Error('Failure to find .webviewContentExternalBaseUrlTemplate in product.json.');
    }

    return url;
  }

  setWebviewContentExternalBaseUrlTemplate(url: string): void {
    this.json.webviewContentExternalBaseUrlTemplate = url;
  }

  getExtensionsGalleryServiceURL(): string {
    const gallery = this.json.extensionsGallery;
    if (!gallery) {
      throw new Error('Failure to find .extensionsGallery.serviceUrl in product.json.');
    }

    const url = gallery.serviceUrl;

    if (!url) {
      throw new Error('Failure to find .extensionsGallery.serviceUrl in product.json.');
    }

    return url;
  }

  setExtensionsGalleryServiceURL(url: string): void {
    let gallery = this.json.extensionsGallery;
    if (!gallery) {
      gallery = {};
      this.json.extensionsGallery = gallery;
    }

    gallery.serviceUrl = url;
  }

  getExtensionsGalleryItemURL(): string {
    const gallery = this.json.extensionsGallery;
    if (!gallery) {
      throw new Error('Failure to find .extensionsGallery.serviceUrl in product.json.');
    }

    const url = gallery.itemUrl;
    if (!url) {
      throw new Error('Failure to find .extensionsGallery.itemUrl in product.json.');
    }

    return url;
  }

  setExtensionsGalleryItemURL(url: string): void {
    let gallery = this.json.extensionsGallery;
    if (!gallery) {
      gallery = {};
      this.json.extensionsGallery = gallery;
    }

    gallery.itemUrl = url;
  }

  getTrustedExtensionAuthAccess(): string[] | Record | undefined {
    return this.json.trustedExtensionAuthAccess;
  }

  setTrustedExtensionAuthAccess(trustedExtensionAuthAccess: string[] | Record | undefined) {
    this.json.trustedExtensionAuthAccess = trustedExtensionAuthAccess;
  }
}
