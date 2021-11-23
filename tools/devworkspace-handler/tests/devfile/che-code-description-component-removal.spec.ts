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
import { CheCodeDescriptionComponentRemoval } from '../../src/devfile/che-code-description-component-removal';
import { V1alpha2DevWorkspaceSpecTemplateComponents } from '@devfile/api';

describe('Test CheCodeDescriptionComponentRemoval', () => {
  let container: Container;

  let cheCodeDescriptionComponentRemoval: CheCodeDescriptionComponentRemoval;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(CheCodeDescriptionComponentRemoval).toSelf().inSingletonScope();
    cheCodeDescriptionComponentRemoval = container.get(CheCodeDescriptionComponentRemoval);
  });

  test('remove template', async () => {
    const devfileContext = {
      devWorkspaceTemplates: [
        {},
        {
          spec: {
            components: [
              { name: 'foo' },
              {
                name: 'che-code-runtime-description',
              },
            ],
          },
        },
        {
          spec: {
            components: [
              {
                name: 'foobar',
                container: {},
              },
            ],
          },
        },
      ],
    } as CheCodeDevfileContext;

    const toBeRemoved: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-runtime-description',
    };

    expect(devfileContext.devWorkspaceTemplates.length).toBe(3);
    expect(devfileContext.devWorkspaceTemplates[1].spec.components.length).toBe(2);
    await cheCodeDescriptionComponentRemoval.removeRuntimeComponent(devfileContext, toBeRemoved);
    // same number of templates but one less component
    expect(devfileContext.devWorkspaceTemplates.length).toBe(3);
    expect(devfileContext.devWorkspaceTemplates[1].spec.components.length).toBe(1);
  });
});
