/* eslint-disable header/header */
/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */

import 'reflect-metadata';

import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';
import * as path from 'path';

import { Container } from 'inversify';
import { K8SServiceImpl } from '../src/impl/k8s-service-impl';
import { K8sDevWorkspaceEnvVariables } from '../src/impl/k8s-devworkspace-env-variables';
import { K8sDevfileServiceImpl } from '../src/impl/k8s-devfile-service-impl';
import { V1alpha2DevWorkspaceSpecTemplate, V1alpha2DevWorkspaceSpecTemplateComponents, V1alpha2DevWorkspaceSpecTemplateProjects } from '@devfile/api';

describe('Test K8sDevfileServiceImpl', () => {
  let container: Container;

  let k8sDevfileServiceImpl: K8sDevfileServiceImpl;

  const k8sServiceMakeApiClientMethod = jest.fn();
  const k8sServiceMock = {
    makeApiClient: k8sServiceMakeApiClientMethod,
  } as any;

  const workspaceIdEnvVariablesMethod = jest.fn();
  const workspaceNameEnvVariablesMethod = jest.fn();
  const workspaceNamespaceEnvVariablesMethod = jest.fn();
  const devWorkspaceFlattenedDevfilePathEnvVariablesMethod = jest.fn();
  const k8sDevWorkspaceEnvVariables = {
    getWorkspaceId: workspaceIdEnvVariablesMethod,
    getWorkspaceName: workspaceNameEnvVariablesMethod,
    getWorkspaceNamespace: workspaceNamespaceEnvVariablesMethod,
    getDevWorkspaceFlattenedDevfilePath: devWorkspaceFlattenedDevfilePathEnvVariablesMethod,
  } as any;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(K8sDevWorkspaceEnvVariables).toConstantValue(k8sDevWorkspaceEnvVariables);
    container.bind(K8sDevfileServiceImpl).toSelf().inSingletonScope();
    container.bind(K8SServiceImpl).toConstantValue(k8sServiceMock);
    k8sDevfileServiceImpl = container.get(K8sDevfileServiceImpl);
    workspaceNameEnvVariablesMethod.mockReturnValue('fake-workspace-name');
    workspaceNamespaceEnvVariablesMethod.mockReturnValue('fake-workspace-namespace');
    workspaceNameEnvVariablesMethod.mockReturnValue('fake-workspace-name');
    devWorkspaceFlattenedDevfilePathEnvVariablesMethod.mockReturnValue('fake-devworkspace-path');
  });

  test('get', async () => {
    const flattenedDevfilePath = path.resolve(__dirname, '_data', 'flattened-devfile.yaml');
    const flattenedDevfileContent = await fs.readFile(flattenedDevfilePath, 'utf-8');
    const readFileSpy = jest.spyOn(fs, 'readFile') as jest.Mock;
    readFileSpy.mockReturnValue(flattenedDevfileContent);

    const devfile = await k8sDevfileServiceImpl.get();
    expect(devfile).toBeDefined();

    // check projects
    expect(devfile.projects?.length).toBe(1);
    let devfileProject: V1alpha2DevWorkspaceSpecTemplateProjects;
    if (devfile.projects && devfile.projects.length > 0) {
      devfileProject = devfile.projects[0];
    } else {
      fail('Did not found a project in the devfile');
    }
    expect(devfileProject.name).toBe('java-spring-petclinic');
    expect(devfileProject.git).toStrictEqual({
      checkoutFrom: {
        revision: 'devfilev2',
      },
      remotes: { origin: 'https://github.com/che-samples/java-spring-petclinic.git' },
    });

    // check components
    expect(devfile.components?.length).toBe(5);
    let cheCodeInjectorComponent: V1alpha2DevWorkspaceSpecTemplateComponents | undefined;
    if (devfile.components && devfile.components.length > 0) {
      cheCodeInjectorComponent = devfile.components.find(component => component.name === 'che-code-injector');
    } else {
      fail('Did not found a component in the devfile');
    }
    if (!cheCodeInjectorComponent) {
      fail('Missing component');
    }
    expect(cheCodeInjectorComponent.container).toBeDefined();
    expect(cheCodeInjectorComponent.container?.image).toBe('quay.io/che-incubator/che-code:insiders');
  });

  test('getRaw', async () => {
    const flattenedDevfilePath = path.resolve(__dirname, '_data', 'flattened-devfile.yaml');
    const flattenedDevfileContent = await fs.readFile(flattenedDevfilePath, 'utf-8');
    const readFileSpy = jest.spyOn(fs, 'readFile') as jest.Mock;
    readFileSpy.mockReturnValue(flattenedDevfileContent);

    const devfileYaml = await k8sDevfileServiceImpl.getRaw();
    expect(devfileYaml).toBeDefined();
    // able to convert result with jsYaml
    const devfileObject = jsYaml.load(devfileYaml) as V1alpha2DevWorkspaceSpecTemplate;

    // ensure yaml was correct to be converted to be a devfile
    expect(devfileObject.projects?.length).toBe(1);
    expect(devfileObject.components?.length).toBe(5);
  });

});
