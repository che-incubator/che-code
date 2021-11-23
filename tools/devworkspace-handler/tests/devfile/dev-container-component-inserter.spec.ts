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

import { Container } from 'inversify';
import { CheCodeDevfileContext } from '../../src/api/che-code-devfile-context';
import { DevContainerComponentInserter } from '../../src/devfile/dev-container-component-inserter';
import { V1alpha2DevWorkspaceSpecTemplateComponents } from '@devfile/api';

describe('Test DevContainerComponentInserter', () => {
  let container: Container;

  let devContainerComponentInserter: DevContainerComponentInserter;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(DevContainerComponentInserter).toSelf().inSingletonScope();
    devContainerComponentInserter = container.get(DevContainerComponentInserter);
  });

  test('basics', async () => {
    const devfileContext = {
      devWorkspace: {
        spec: {
          template: {
            components: [
              { name: 'foo' },
              {
                name: 'my-container',
                container: {
                  image: 'user-image:123',
                },
              },
            ],
          },
        },
      },
    } as CheCodeDevfileContext;

    const editorTemplate: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code',
    };

    const componentLengthBefore = devfileContext.devWorkspace.spec.template.components.length;
    await devContainerComponentInserter.insert(devfileContext, editorTemplate);
    expect(devfileContext.devWorkspace.spec.template.components.length).toBe(componentLengthBefore + 1);
    expect(
      devfileContext.devWorkspace.spec.template.components.find(component => component.name === 'che-code')
    ).toStrictEqual({ name: 'che-code' });
  });

  test('basics no spec', async () => {
    const devfileContext = {
      devWorkspace: {},
    } as CheCodeDevfileContext;

    const editorTemplate: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code',
    };

    await devContainerComponentInserter.insert(devfileContext, editorTemplate);
    expect(
      devfileContext.devWorkspace.spec.template.components.find(component => component.name === 'che-code')
    ).toStrictEqual({ name: 'che-code' });
  });
});
