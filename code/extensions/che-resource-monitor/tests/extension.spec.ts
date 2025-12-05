/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

// Mock @kubernetes/client-node to avoid ESM issues in Jest
jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn(),
  CoreV1Api: jest.fn(),
  AppsV1Api: jest.fn(),
  RbacAuthorizationV1Api: jest.fn(),
  CustomObjectsApi: jest.fn(),
}));

import 'reflect-metadata';

import * as extension from '../src/extension';
import * as vscode from 'vscode';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container } from 'inversify';
import { InversifyBinding } from '../src/inversify-binding';
import { ResourceMonitor } from '../src/resource-monitor';

const uri: vscode.Uri = {
  authority: '',
  fragment: '',
  fsPath: '',
  path: '',
  query: '',
  scheme: '',
  toJSON: jest.fn(),
  toString: jest.fn(),
  with: jest.fn(),
};
const context: vscode.ExtensionContext = {
  environmentVariableCollection: {
    persistent: false,
    append: jest.fn(),
    clear: jest.fn(),
    delete: jest.fn(),
    forEach: jest.fn(),
    get: jest.fn(),
    prepend: jest.fn(),
    replace: jest.fn(),
    getScoped: jest.fn(),
    description: undefined,
    [Symbol.iterator]: jest.fn(),
  },
  secrets: {
    get: jest.fn(),
    delete: jest.fn(),
    store: jest.fn(),
    onDidChange: jest.fn(),
  },
  extensionPath: '',
  extensionUri: uri,
  storageUri: uri,
  logUri: uri,
  globalStorageUri: uri,
  globalState: {
    keys: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    setKeysForSync: jest.fn(),
  },
  globalStoragePath: '',
  logPath: '',
  storagePath: '',
  subscriptions: [],
  workspaceState: {
    keys: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  },
  asAbsolutePath: jest.fn(),
  extensionMode: 3,
  extension: {
    id: '',
    extensionUri: uri,
    extensionPath: '',
    isActive: true,
    packageJSON: {},
    extensionKind: 2,
    exports: {},
    activate: jest.fn(),
  },
  languageModelAccessInformation: {
    onDidChange: jest.fn(),
    canSendRequest: jest.fn(),
  } as any,
};

describe('Test Plugin', () => {
  jest.mock('../src/inversify-binding');
  const getNamespaceMethod = jest.fn();
  let oldBindings: any;
  let initBindings: jest.Mock;

  beforeEach(() => {
    // Prepare Namespace
    //che.workspace.getCurrentNamespace = getCurrentNamespace;
    getNamespaceMethod.mockReturnValue('che-namespace');
    oldBindings = InversifyBinding.prototype.initBindings;
    initBindings = jest.fn();
    InversifyBinding.prototype.initBindings = initBindings;
    const getWorkspaceServiceMethod = jest.fn();
    const exports = {
      getWorkspaceService: getWorkspaceServiceMethod,
    };
    const extensionApi = {
      activate: jest.fn(),
      exports,
    };
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue(extensionApi);
    const getPodNameMethod = jest.fn();
    getPodNameMethod.mockReturnValue('test-pod');
    const workspaceService = {
      getNamespace: getNamespaceMethod,
      getPodName: getPodNameMethod,
    } as any;
    getWorkspaceServiceMethod.mockReturnValue(workspaceService);
  });

  afterEach(() => {
    InversifyBinding.prototype.initBindings = oldBindings;
  });

  test('start', async () => {
    const container = new Container();
    const mockResourceMonitorPlugin = { start: jest.fn() };
    container.bind(ResourceMonitor).toConstantValue(mockResourceMonitorPlugin as any);
    initBindings.mockReturnValue(container);

    await extension.activate(context);
    expect(mockResourceMonitorPlugin.start).toBeCalled();
  });
});
