/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { Main } from '../src/main';

const setDevWorkspaceIdMock = jest.fn();
jest.mock('../src/devworkspace-id', () => ({
  DevWorkspaceId: function () {
    return { configure: setDevWorkspaceIdMock };
  },
}));

const configureOpenVSIXRegistryMock = jest.fn();
jest.mock('../src/openvsix-registry', () => ({
  OpenVSIXRegistry: function () {
    return { configure: configureOpenVSIXRegistryMock };
  },
}));

const configureWebviewResourcesMock = jest.fn();
jest.mock('../src/webview-resources', () => ({
  WebviewResources: function () {
    return { configure: configureWebviewResourcesMock };
  },
}));

const configureNodeExtraCertificate = jest.fn();
jest.mock('../src/node-extra-certificate', () => ({
  NodeExtraCertificate: function () {
    return { configure: configureNodeExtraCertificate };
  },
}));

const configureLocalStorageKeyProvider = jest.fn();
jest.mock('../src/local-storage-key-provider', () => ({
  LocalStorageKeyProvider: function () {
    return { configure: configureLocalStorageKeyProvider };
  },
}));

const configureTustedExtensions = jest.fn();
jest.mock('../src/trusted-extensions', () => ({
  TrustedExtensions: function () {
    return { configure: configureTustedExtensions };
  },
}));

const generateCodeWorkspace = jest.fn();
jest.mock('../src/code-workspace', () => ({
  CodeWorkspace: function () {
    return { generate: generateCodeWorkspace };
  },
}));

const launchVsCode = jest.fn();
jest.mock('../src/vscode-launcher', () => ({
  VSCodeLauncher: function () {
    return { launch: launchVsCode };
  },
}));

const configureEditorConfigurations = jest.fn();
jest.mock('../src/editor-configurations', () => ({
  EditorConfigurations: function () {
    return { configure: configureEditorConfigurations };
  },
}));

describe('Test main flow:', () => {
  test('should configure all the stuff', async () => {
    await new Main().start();

    expect(setDevWorkspaceIdMock).toBeCalled();
    expect(configureOpenVSIXRegistryMock).toBeCalled();
    expect(configureWebviewResourcesMock).toBeCalled();
    expect(configureNodeExtraCertificate).toBeCalled();
    expect(configureLocalStorageKeyProvider).toBeCalled();
    expect(configureTustedExtensions).toBeCalled();

    expect(generateCodeWorkspace).toBeCalled();
    expect(configureEditorConfigurations).toBeCalled();

    expect(launchVsCode).toBeCalled();
  });
});
