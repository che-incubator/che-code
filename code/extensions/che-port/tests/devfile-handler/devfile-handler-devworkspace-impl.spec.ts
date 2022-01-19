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
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';

import { DevWorkspaceDevfileHandlerImpl } from '../../src/devfile-handler-devworkspace-impl';
import { DevfileHandler } from '../../src/devfile-handler';
import { EndpointCategory } from '../../src/endpoint-category';
import { EndpointExposure } from '../../src/endpoint-exposure';
import * as vscode from 'vscode';
import { V1alpha2DevWorkspaceSpecTemplate } from '@devfile/api';

interface DevfileService {
  get(): Promise<V1alpha2DevWorkspaceSpecTemplate>;
}

describe('Test Workspace Endpoints', () => {
  let devfileHandler: DevfileHandler;
  const getDevfileServiceGet = jest.fn();

  const OLD_ENV = process.env;
  const devfileService: DevfileService = {
    get: getDevfileServiceGet
  };

  const api = {
    getDevfileService(): DevfileService {
      return devfileService;
    }
  };
  (vscode.extensions as any).setExtensionExport('eclipse-che.api', api);

  beforeEach(() => {
    devfileHandler = new DevWorkspaceDevfileHandlerImpl();
    jest.resetModules();
    process.env = {};
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('test ports opened', async () => {
    const output = await fs.readFile(__dirname + '/devworkspace-flattened.yaml', 'utf-8');
    const devfile = jsYaml.load(output);
    getDevfileServiceGet.mockResolvedValue(devfile);

    const endpoints = await devfileHandler.getEndpoints();

    expect(endpoints).toBeDefined();
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBe(4);

    expect(endpoints[2].targetPort).toBe(3100);
    expect(endpoints[2].url).toBe('https://che-eclipse-che.apps.cluster-c9b7.c9b7.sandbox909.opentlc.com/workspaced61b0d7d9ab04966/tools/3100/?tkn=eclipse-che');
    expect(endpoints[2].name).toBe('che-code');
    expect(endpoints[2].exposure).toBe(EndpointExposure.FROM_DEVFILE_PUBLIC);
    expect(endpoints[2].category).toBe(EndpointCategory.USER);

  });

  test('test petclinic workspace', async () => {
    const output = await fs.readFile(__dirname + '/devworkspace-flattened.yaml', 'utf-8');
    const devfile = jsYaml.load(output);
    getDevfileServiceGet.mockResolvedValue(devfile);


    const endpoints = await devfileHandler.getEndpoints();

    // check that quarkus debug port is private
    const result = endpoints.filter(endpoint => endpoint.name === 'debug');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBe(1);
    const quarkusEndpoint = result[0];
    expect(quarkusEndpoint.targetPort).toBe(5005);
    expect(quarkusEndpoint.exposure).toBe(EndpointExposure.FROM_DEVFILE_NONE);
    expect(quarkusEndpoint.category).toBe(EndpointCategory.USER);

    // check user public endpoints are filtered (when multiple endpoints have the same url/targetport, etc)
    const userPublicEndpoints = endpoints.filter(
      endpoint =>
        endpoint.exposure === EndpointExposure.FROM_DEVFILE_PUBLIC && endpoint.category === EndpointCategory.USER
    );
    expect(userPublicEndpoints).toBeDefined();
    expect(userPublicEndpoints!.length).toBe(2);
  });
});
