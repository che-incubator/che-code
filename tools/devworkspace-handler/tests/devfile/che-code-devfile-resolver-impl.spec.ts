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
import { DevContainerComponentFinder } from '../../src/devfile/dev-container-component-finder';
import { CheCodeDevfileContext } from '../../src/api/che-code-devfile-context';
import { CheCodeDevfileResolverImpl } from '../../src/devfile/che-code-devfile-resolver-impl';
import { CheCodeDescriptionComponentFinder } from '../../src/devfile/che-code-description-component-finder';
import { CheCodeDescriptionComponentRemoval } from '../../src/devfile/che-code-description-component-removal';
import { DevContainerComponentUpdater } from '../../src/devfile/dev-container-component-updater';
import { DevContainerComponentInserter } from '../../src/devfile/dev-container-component-inserter';

describe('Test CheCodeDevfileResolverImpl', () => {
  let container: Container;

  const devContainerComponentFinderFindMethod = jest.fn();
  const devContainerComponentFinder = {
    find: devContainerComponentFinderFindMethod,
  } as any as DevContainerComponentFinder;

  const cheCodeDescriptionComponentFindMethod = jest.fn();
  const cheCodeDescriptionComponentFinder = {
    find: cheCodeDescriptionComponentFindMethod,
  } as any as CheCodeDescriptionComponentFinder;

  const cheCodeDescriptionComponentRemovalRemoveMethod = jest.fn();
  const cheCodeDescriptionComponentRemoval = {
    removeRuntimeComponent: cheCodeDescriptionComponentRemovalRemoveMethod,
  } as any as CheCodeDescriptionComponentRemoval;

  const devContainerComponentUpdaterUpdateMethod = jest.fn();
  const devContainerComponentUpdater = {
    update: devContainerComponentUpdaterUpdateMethod,
  } as any as DevContainerComponentUpdater;

  const devContainerComponentInserterInsertMethod = jest.fn();
  const devContainerComponentInserter = {
    insert: devContainerComponentInserterInsertMethod,
  } as any as DevContainerComponentInserter;

  let cheCodeDevfileResolverImpl: CheCodeDevfileResolverImpl;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(CheCodeDevfileResolverImpl).toSelf().inSingletonScope();
    container.bind(DevContainerComponentFinder).toConstantValue(devContainerComponentFinder);
    container.bind(CheCodeDescriptionComponentFinder).toConstantValue(cheCodeDescriptionComponentFinder);
    container.bind(CheCodeDescriptionComponentRemoval).toConstantValue(cheCodeDescriptionComponentRemoval);

    container.bind(DevContainerComponentUpdater).toConstantValue(devContainerComponentUpdater);
    container.bind(DevContainerComponentInserter).toConstantValue(devContainerComponentInserter);

    cheCodeDevfileResolverImpl = container.get(CheCodeDevfileResolverImpl);
  });

  test('basics with non existing', async () => {
    const devfileContext = {
      devWorkspace: {
        spec: {
          template: {
            components: [
              { name: 'foo' },
              {
                name: 'che-code',
              },
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

    const cheCodeEditor = {
      name: 'cheCodeEditor',
    };
    cheCodeDescriptionComponentFindMethod.mockResolvedValueOnce(cheCodeEditor);

    // no user container
    const exists = false;
    devContainerComponentFinderFindMethod.mockResolvedValue(undefined);

    const userContainer = {
      name: 'userContainer',
    };
    devContainerComponentInserterInsertMethod.mockResolvedValue(userContainer);

    await cheCodeDevfileResolverImpl.update(devfileContext);

    // check that insert has been called
    expect(devContainerComponentInserterInsertMethod).toBeCalled();

    expect(devContainerComponentUpdaterUpdateMethod).toBeCalledWith(
      devfileContext,
      cheCodeEditor,
      userContainer,
      exists
    );

    expect(cheCodeDescriptionComponentRemovalRemoveMethod).toBeCalledWith(devfileContext, cheCodeEditor);
  });

  test('basics with existing', async () => {
    const devfileContext = {
      devWorkspace: {
        spec: {
          template: {
            components: [
              { name: 'foo' },
              {
                name: 'che-code',
              },
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

    const cheCodeEditor = {
      name: 'cheCodeEditor',
    };
    cheCodeDescriptionComponentFindMethod.mockResolvedValueOnce(cheCodeEditor);

    // There is a user container
    const exists = true;
    const userContainer = {
      name: 'userContainer',
    };
    devContainerComponentFinderFindMethod.mockResolvedValue(userContainer);
    devContainerComponentInserterInsertMethod.mockResolvedValue(userContainer);

    await cheCodeDevfileResolverImpl.update(devfileContext);

    // check that insert has not been called
    expect(devContainerComponentInserterInsertMethod).toBeCalledTimes(0);

    expect(devContainerComponentUpdaterUpdateMethod).toBeCalledWith(
      devfileContext,
      cheCodeEditor,
      userContainer,
      exists
    );

    expect(cheCodeDescriptionComponentRemovalRemoveMethod).toBeCalledWith(devfileContext, cheCodeEditor);
  });

  test('missing che code editor', async () => {
    const devfileContext = {} as CheCodeDevfileContext;

    cheCodeDescriptionComponentFindMethod.mockResolvedValueOnce(undefined);

    await expect(cheCodeDevfileResolverImpl.update(devfileContext)).rejects.toThrow(
      'No che-code editor description found in DevWorkspaceTemplate'
    );
  });
});
