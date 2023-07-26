/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from "process";
import * as path from "path";
import * as fs from "../src/fs-extra";
import { WebviewResources } from "../src/webview-resources";

describe("Test Configuring of WebView static resources:", () => {
  test("should skip if WEBVIEW_LOCAL_RESOURCES is not set", async () => {
    delete env.WEBVIEW_LOCAL_RESOURCES;

    const getCheCodeEndpointMock = jest.fn();
    jest.mock("../src/flattened-devfile", () => ({
      FlattenedDevfile: function () {
        return { getCheCodeEndpoint: getCheCodeEndpointMock };
      },
    }));

    const resources = new WebviewResources();
    await resources.configure();
    expect(getCheCodeEndpointMock).toHaveBeenCalledTimes(0);
  });

  test("should get Webview resources URL from product.json", async () => {
    // load "out/vs/workbench/workbench.web.main.js"
    const fileWorkbenchWebMain = await fs.readFile(
      path.resolve(__dirname, "_data", "workbench.web.main.js")
    );

    const fileWorkbenchWebMainExpected = await fs.readFile(
      path.resolve(
        __dirname,
        "_data",
        "workbench.web.main.test-webview-resources.js"
      )
    );

    // load "out/vs/workbench/api/node/extensionHostProcess.js"
    const fileExtensionHostProcess = await fs.readFile(
      path.resolve(__dirname, "_data", "extensionHostProcess.js")
    );

    const fileExtensionHostProcessExpected = await fs.readFile(
      path.resolve(
        __dirname,
        "_data",
        "extensionHostProcess.test-webview-resources.js"
      )
    );

    // load "product.json"
    const fileProductJSON = await fs.readFile(
      path.resolve(__dirname, "_data", "product.json")
    );

    // load "flattened.devworkspace.yaml"
    const fileDevworkspaceFlattenedDevfile = await fs.readFile(
      path.resolve(__dirname, "_data", "flattened.devworkspace.yaml")
    );

    // configure the environment variable
    env.DEVWORKSPACE_FLATTENED_DEVFILE = "flattened.devworkspace.yaml";
    env.WEBVIEW_LOCAL_RESOURCES = "true";

    const webviewResources = new WebviewResources();

    const updateMock = jest.spyOn(webviewResources, "update") as jest.Mock;

    const readFileMock = jest.fn();
    readFileMock.mockImplementation(async (fileName: string) => {
      switch (fileName) {
        case "product.json":
          return fileProductJSON;

        case "flattened.devworkspace.yaml":
          return fileDevworkspaceFlattenedDevfile;

        case "out/vs/workbench/workbench.web.main.js":
          return fileWorkbenchWebMain;

        case "out/vs/workbench/api/node/extensionHostProcess.js":
          return fileExtensionHostProcess;
      }

      return undefined;
    });

    let gotFileWorkbenchWebMain;
    let gotFileExtensionHostProcess;

    const writeFileMock = jest.fn();
    writeFileMock.mockImplementation(async (fileName: string, data: string) => {
      switch (fileName) {
        case "out/vs/workbench/workbench.web.main.js":
          gotFileWorkbenchWebMain = data;

        case "out/vs/workbench/api/node/extensionHostProcess.js":
          gotFileExtensionHostProcess = data;
      }
    });

    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: writeFileMock,
    });

    await webviewResources.configure();

    expect(updateMock).toHaveBeenCalledTimes(2);

    expect(updateMock).toHaveBeenCalledWith(
      "out/vs/workbench/workbench.web.main.js",
      "https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/",
      "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/"
    );

    expect(updateMock).toHaveBeenCalledWith(
      "out/vs/workbench/api/node/extensionHostProcess.js",
      "https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/",
      "https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/"
    );

    expect(fileWorkbenchWebMainExpected).toBe(gotFileWorkbenchWebMain);
    expect(fileExtensionHostProcessExpected).toBe(gotFileExtensionHostProcess);
  });
});
