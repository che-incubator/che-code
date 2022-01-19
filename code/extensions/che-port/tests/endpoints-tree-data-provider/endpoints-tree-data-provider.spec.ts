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
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';
import { DevWorkspaceDevfileHandlerImpl } from '../../src/devfile-handler-devworkspace-impl';
import { DevfileHandler } from '../../src/devfile-handler';
import { EndpointsTreeDataProvider } from '../../src/endpoints-tree-data-provider';
import { ListeningPort } from '../../src/listening-port';
import { V1alpha2DevWorkspaceSpecTemplate } from '@devfile/api';
import * as vscode from 'vscode';

interface DevfileService {
  get(): Promise<V1alpha2DevWorkspaceSpecTemplate>;
}

describe('Test EndpointTree data provider', () => {
  let devfileHandler: DevfileHandler;
  let endpointsTreeDataProvider: EndpointsTreeDataProvider;

  const OLD_ENV = process.env;
  const getDevfileServiceGet = jest.fn();
  const devfileService: DevfileService = {
    get: getDevfileServiceGet
  };

  const api = {
    getDevfileService(): DevfileService {
      return devfileService;
    }
  };
  (vscode.extensions as any).setExtensionExport('eclipse-che.api', api);

  beforeEach(async () => {
    devfileHandler = new DevWorkspaceDevfileHandlerImpl();
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('test endpoint tree data provider', async () => {
    const output = await fs.readFile(__dirname + '/devworkspace-flattened.yaml', 'utf-8');
    const devfile = jsYaml.load(output);
    getDevfileServiceGet.mockResolvedValue(devfile);

    const listeningPort: ListeningPort[] = [{ portNumber: 3000, interfaceListen: '0.0.0.0' }];
    const endpoints = await devfileHandler.getEndpoints();
    endpointsTreeDataProvider = new EndpointsTreeDataProvider();
    endpointsTreeDataProvider['showPluginEndpoints'] = true;
    endpointsTreeDataProvider.updateEndpoints(endpoints, listeningPort);

    const children = await endpointsTreeDataProvider.getChildren();

    expect(children).toBeDefined();
    expect(Array.isArray(children)).toBe(true);
    expect(children!.length).toBe(1);

    const firstElement = endpointsTreeDataProvider.getTreeItem(children![0]);
    expect(firstElement.label).toBe('Public');

    // const secondElement = endpointsTreeDataProvider.getTreeItem(children![1]);
    // expect(secondElement.label).toBe('Internal');
  });
});
