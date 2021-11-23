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
import { CheCodeDescriptionComponentFinder } from '../../src/devfile/che-code-description-component-finder';

describe('Test CheCodeDescriptionComponentFinder', () => {
  let container: Container;

  let cheCodeDescriptionComponentFinder: CheCodeDescriptionComponentFinder;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(CheCodeDescriptionComponentFinder).toSelf().inSingletonScope();
    cheCodeDescriptionComponentFinder = container.get(CheCodeDescriptionComponentFinder);
  });

  test('in a template', async () => {
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
      ],
    } as CheCodeDevfileContext;
    const devWorkspaceSpectTemplateComponents = await cheCodeDescriptionComponentFinder.find(devfileContext);
    expect(devWorkspaceSpectTemplateComponents.name).toBe('che-code-runtime-description');
  });

  test('in the main devWorkspace', async () => {
    const devfileContext = {
      devWorkspaceTemplates: [],
      devWorkspace: {
        spec: {
          template: {
            components: [
              { name: 'foo' },
              {
                name: 'che-code-runtime-description',
              },
            ],
          },
        },
      },
    } as any as CheCodeDevfileContext;
    const devWorkspaceSpectTemplateComponents = await cheCodeDescriptionComponentFinder.find(devfileContext);
    expect(devWorkspaceSpectTemplateComponents.name).toBe('che-code-runtime-description');
  });

  test('missing', async () => {
    const devfileContext = {
      devWorkspaceTemplates: [],
      devWorkspace: {},
    } as any as CheCodeDevfileContext;
    await expect(cheCodeDescriptionComponentFinder.find(devfileContext)).rejects.toThrow(
      'Not able to find che-code-description component in DevWorkspace and its templates'
    );
  });
});
