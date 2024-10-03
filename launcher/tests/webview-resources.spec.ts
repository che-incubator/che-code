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
import * as path from 'path';
import * as fs from '../src/fs-extra';
import { WebviewResources } from '../src/webview-resources';

const getCheCodeEndpointMock = jest.fn();
jest.mock('../src/flattened-devfile', () => ({
  FlattenedDevfile: function () {
    return { getCheCodeEndpoint: getCheCodeEndpointMock };
  },
}));

describe('Test Configuring of WebView static resources:', () => {
  test('should get Webview resources URL from product.json', async () => {
    // had to combine two tests in one due to some issues with mocking the '../src/flattened-devfile' module

    // the first part checks that the relocating of webview resoures is skipped because of WEBVIEW_LOCAL_RESOURCES environment variable
    env.WEBVIEW_LOCAL_RESOURCES = 'false';
    new WebviewResources().configure();
    expect(getCheCodeEndpointMock).toHaveBeenCalledTimes(0);
    delete env.WEBVIEW_LOCAL_RESOURCES;

    // the second path tests the functionality of the WebviewResources module

    // load "out/vs/code/browser/workbench/workbench.js"
    const fileWorkbench = await fs.readFile(path.resolve(__dirname, '_data', 'workbench.js'));

    const fileWorkbenchExpected = await fs.readFile(
      path.resolve(__dirname, '_data', 'workbench.test-webview-resources.js')
    );

    // load "out/vs/workbench/api/node/extensionHostProcess.js"
    const fileExtensionHostProcess = await fs.readFile(path.resolve(__dirname, '_data', 'extensionHostProcess.js'));

    const fileExtensionHostProcessExpected = await fs.readFile(
      path.resolve(__dirname, '_data', 'extensionHostProcess.test-webview-resources.js')
    );

    // load "product.json"
    const fileProductJSON = await fs.readFile(path.resolve(__dirname, '_data', 'product.json'));

    getCheCodeEndpointMock.mockImplementation(() => {
      return 'https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/';
    });

    const webviewResources = new WebviewResources();

    const updateMock = jest.spyOn(webviewResources, 'update') as jest.Mock;

    const readFileMock = jest.fn();
    readFileMock.mockImplementation(async (fileName: string) => {
      switch (fileName) {
        case 'product.json':
          return fileProductJSON;

        case 'out/vs/code/browser/workbench/workbench.js':
          return fileWorkbench;

        case 'out/vs/workbench/api/node/extensionHostProcess.js':
          return fileExtensionHostProcess;
      }

      return undefined;
    });

    let gotFileWorkbench;
    let gotFileExtensionHostProcess;

    const writeFileMock = jest.fn();
    writeFileMock.mockImplementation(async (fileName: string, data: string) => {
      switch (fileName) {
        case 'out/vs/code/browser/workbench/workbench.js':
          gotFileWorkbench = data;

        case 'out/vs/workbench/api/node/extensionHostProcess.js':
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
      'out/vs/code/browser/workbench/workbench.js',
      'https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/',
      'https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/'
    );

    expect(updateMock).toHaveBeenCalledWith(
      'out/vs/workbench/api/node/extensionHostProcess.js',
      'https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/',
      'https://che-dogfooding.apps.che-dev.x6e0.p1.openshiftapps.com/vgulyy/che-code-multiroot/3100/oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/'
    );

    expect(fileWorkbenchExpected).toBe(gotFileWorkbench);
    expect(fileExtensionHostProcessExpected).toBe(gotFileExtensionHostProcess);
  });
});
