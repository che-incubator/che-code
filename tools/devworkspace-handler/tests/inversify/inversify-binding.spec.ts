/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import 'reflect-metadata';

import fs from 'fs-extra';
import * as axios from 'axios';
import { InversifyBinding, InversifyBindingOptions } from '../../src/inversify/inversify-binding';

import { Container } from 'inversify';
import { DevContainerComponentFinder } from '../../src/devfile/dev-container-component-finder';
import { DevContainerComponentUpdater } from '../../src/devfile/dev-container-component-updater';
import { Generate } from '../../src/generate';
import { CheCodeDescriptionComponentFinder } from '../../src/devfile/che-code-description-component-finder';
import { CheCodeDescriptionComponentRemoval } from '../../src/devfile/che-code-description-component-removal';
import { DevContainerComponentInserter } from '../../src/devfile/dev-container-component-inserter';
import { CheCodeDevfileExtract } from '../../src/devfile/che-code-devfile-extract';
import { K8SUnits } from '../../src/k8s/k8s-units';
import { CheCodeDevfileResolver } from '../../src/api/che-code-devfile-resolver';
import { UrlFetcher } from '../../src/fetch/url-fetcher';
import { GithubResolver } from '../../src/github/github-resolver';
import { PluginRegistryResolver } from '../../src/plugin-registry/plugin-registry-resolver';

describe('Test InversifyBinding', () => {
  const mockedArgv: string[] = ['dummy', 'dummy'];
  const originalProcessArgv = process.argv;

  beforeEach(() => {
    mockedArgv.length = 2;
    process.argv = mockedArgv;
    const fsMkdirsSpy = jest.spyOn(fs, 'mkdirs');
    fsMkdirsSpy.mockReturnValue({});
  });
  afterEach(() => (process.argv = originalProcessArgv));

  test('default', async () => {
    const inversifyBinding = new InversifyBinding();

    const axiosInstance = axios.default;
    const options: InversifyBindingOptions = {
      pluginRegistryUrl: 'http://fake-registry',
      axiosInstance,
      insertDevWorkspaceTemplatesAsPlugin: false,
    };

    const container: Container = await inversifyBinding.initBindings(options);
    container.bind(Generate).toSelf().inSingletonScope();

    expect(inversifyBinding).toBeDefined();

    // check devfile module
    expect(container.get(CheCodeDescriptionComponentFinder)).toBeDefined();
    expect(container.get(CheCodeDescriptionComponentRemoval)).toBeDefined();
    expect(container.get(CheCodeDevfileResolver)).toBeDefined();
    expect(container.get(DevContainerComponentFinder)).toBeDefined();
    expect(container.get(DevContainerComponentInserter)).toBeDefined();
    expect(container.get(DevContainerComponentUpdater)).toBeDefined();
    expect(container.get(CheCodeDevfileExtract)).toBeDefined();

    // check fetch module
    expect(container.get(UrlFetcher)).toBeDefined();

    // check github module
    expect(container.get(GithubResolver)).toBeDefined();

    // check plugin-registry module
    expect(container.get(PluginRegistryResolver)).toBeDefined();

    // check k8s module
    expect(container.get(K8SUnits)).toBeDefined();

    // check main module
    expect(container.get(Generate)).toBeDefined();
  });
});
