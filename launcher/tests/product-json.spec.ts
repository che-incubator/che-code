/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from "../src/fs-extra";
import { ProductJSON } from "../src/product-json";

const TEST_SET_WEBVIEW_CONTENT_BASE_URL_TEMPLATE = `{
\t"webviewContentExternalBaseUrlTemplate": "bar"
}`;

const TEST_SET_EXTENSIONS_GALLERY_URLS = `{
\t"extensionsGallery": {
\t\t"serviceUrl": "https://localhost/gallery",
\t\t"itemUrl": "https://localhost/item"
\t}
}`;

describe("Test Product JSON wrapper:", () => {
  test("should return getWebviewContentExternalBaseUrlTemplate", async () => {
    Object.assign(fs, {
      readFile: async () => `{
          "webviewContentExternalBaseUrlTemplate": "foo"
        }`,
    });

    const productJson = await new ProductJSON().load();

    const uri = productJson.getWebviewContentExternalBaseUrlTemplate();
    expect(uri).toEqual("foo");
  });

  test("should set .webviewContentExternalBaseUrlTemplate", async () => {
    const writeFileMock = jest.fn();

    Object.assign(fs, {
      readFile: () => `{
        "webviewContentExternalBaseUrlTemplate": "foo"
      }`,
      writeFile: writeFileMock,
    });

    const productJson = await new ProductJSON().load();
    productJson.setWebviewContentExternalBaseUrlTemplate("bar");
    await productJson.save();

    expect(writeFileMock).toHaveBeenCalledWith(
      "product.json",
      TEST_SET_WEBVIEW_CONTENT_BASE_URL_TEMPLATE
    );
  });

  test("should return getExtensionsGalleryServiceURL", async () => {
    Object.assign(fs, {
      readFile: async () => `{
          "extensionsGallery": {
            "serviceUrl": "https://open-vsx.org/vscode/gallery",
            "itemUrl": "https://open-vsx.org/vscode/item"
          }
        }`,
    });

    const product = await new ProductJSON().load();

    const uri = product.getExtensionsGalleryServiceURL();
    expect(uri).toEqual("https://open-vsx.org/vscode/gallery");
  });

  test("should set .extensionsGallery.serviceURL and .extensionsGallery.itemURL", async () => {
    const writeFileMock = jest.fn();

    Object.assign(fs, {
      readFile: () => "{}",
      writeFile: writeFileMock,
    });

    const product = await new ProductJSON().load();

    product.setExtensionsGalleryServiceURL("https://localhost/gallery");
    product.setExtensionsGalleryItemURL("https://localhost/item");
    await product.save();

    expect(writeFileMock).toHaveBeenCalledWith(
      "product.json",
      TEST_SET_EXTENSIONS_GALLERY_URLS
    );
  });
});
