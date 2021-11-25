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
import { DevContainerComponentUpdater } from '../../src/devfile/dev-container-component-updater';
import { V1alpha2DevWorkspaceSpecTemplateComponents } from '@devfile/api';
import { K8SUnits } from '../../src/k8s/k8s-units';
import { CheCodeDevfileContext } from '../../src/api/che-code-devfile-context';

describe('Test DevContainerComponentUpdater', () => {
  let container: Container;

  let devContainerComponentUpdater: DevContainerComponentUpdater;
  const k8SUnitsSumUnitsMethod = jest.fn();
  const k8SUnits = {
    sumUnits: k8SUnitsSumUnitsMethod,
  } as any as K8SUnits;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    container = new Container();
    container.bind(DevContainerComponentUpdater).toSelf().inSingletonScope();
    container.bind(K8SUnits).toConstantValue(k8SUnits);
  });

  test('basics with existing devContainer', async () => {
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {
        image: 'foo',
        memoryLimit: '1024Mi',
        cpuRequest: '500m',
        cpuLimit: '1500m',
        env: [
          {
            name: 'EXISTING',
            value: 'EXISTING_VALUE',
          },
        ],
        endpoints: [{ name: 'existing', targetPort: 2 }],
        command: ['my-entrypoint.sh'],
        volumeMounts: [
          {
            name: 'existing',
            path: '/existing',
          },
        ],
      },
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-description',
      container: {
        image: 'foo-image',
        memoryLimit: '1024Mi',
        memoryRequest: '512Mi',
        cpuLimit: '1500m',
        env: [
          {
            name: 'FOO_ENV',
            value: 'FOO_VALUE',
          },
        ],
        volumeMounts: [
          {
            name: 'checode',
            path: '/checode',
          },
          {
            name: 'foo',
            path: '/bar',
          },
          {
            name: 'existing',
            path: '/existing',
          },
        ],
        endpoints: [
          {
            name: 'endpoint1',
            targetPort: 1,
          },
        ],
      },
    };

    const devfileContext = {
      devworkspaceTemplates: [
        {
          components: [
            cheCodeDescriptionComponent,
            {
              name: 'checode',
              volume: {},
            },
          ],
        },
      ],
      devWorkspace: {
        spec: {
          template: {
            components: [
              {
                name: 'hello',
                container: {
                  volumeMounts: [
                    {
                      name: 'baz',
                      path: '/baz',
                    },
                    {
                      name: 'bar',
                      path: '/bar',
                    },
                  ],
                },
              },
              {
                name: 'baz',
                volume: {},
              },
            ],
          },
        },
      },
    } as unknown as CheCodeDevfileContext;

    await devContainerComponentUpdater.update(devfileContext, cheCodeDescriptionComponent, devContainerComponent, true);

    // check that inside the devContainer we have stuff being added
    const attributes = devContainerComponent.attributes || ({} as any);

    // check entrypoint
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT]).toBeTruthy();
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT]).toStrictEqual(['my-entrypoint.sh']);

    // env is untouched
    expect(devContainerComponent?.container?.env).toStrictEqual([{ name: 'EXISTING', value: 'EXISTING_VALUE' }]);

    // new endpoint added
    expect(devContainerComponent?.container?.endpoints.length).toBe(2);
    expect(devContainerComponent?.container?.endpoints).toStrictEqual([
      { name: 'existing', targetPort: 2 },
      {
        name: 'endpoint1',
        targetPort: 1,
        attributes: {
          'contributed-by': 'che-code.eclipse.org',
        },
      },
    ]);

    // new volume added
    expect(devContainerComponent?.container?.volumeMounts).toStrictEqual([
      {
        name: 'existing',
        path: '/existing',
      },
      {
        name: 'checode',
        path: '/checode',
      },
      {
        name: 'foo',
        path: '/bar',
      },
    ]);
  });

  test('basics with existing devContainer', async () => {
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {
      devWorkspace: {
        spec: {
          template: {
            components: [
              {
                name: 'hello',
                container: {
                  volumeMounts: [
                    {
                      name: 'baz',
                      path: '/baz',
                    },
                    {
                      name: 'bar',
                      path: '/bar',
                    },
                  ],
                },
              },
              {
                name: 'baz',
                volume: {},
              },
            ],
          },
        },
      },
    } as unknown as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {
        image: 'foo',
        memoryLimit: '1024Mi',
        cpuRequest: '500m',
        cpuLimit: '1500m',
        env: [
          {
            name: 'EXISTING',
            value: 'EXISTING_VALUE',
          },
        ],
        endpoints: [{ name: 'existing', targetPort: 2 }],
        command: ['my-entrypoint.sh'],
        volumeMounts: [
          {
            name: 'existing',
            path: '/existing',
          },
        ],
      },
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-description',
      container: {
        image: 'foo-image',
        memoryLimit: '1024Mi',
        memoryRequest: '512Mi',
        cpuLimit: '1500m',
        env: [
          {
            name: 'FOO_ENV',
            value: 'FOO_VALUE',
          },
        ],
        volumeMounts: [
          {
            name: 'foo',
            path: '/bar',
          },
          {
            name: 'existing',
            path: '/existing',
          },
        ],
        endpoints: [
          {
            name: 'endpoint1',
            targetPort: 1,
          },
        ],
      },
    };
    await devContainerComponentUpdater.update(devfileContext, cheCodeDescriptionComponent, devContainerComponent, true);

    // check that inside the devContainer we have stuff being added
    const attributes = devContainerComponent.attributes || ({} as any);

    // check entrypoint
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT]).toBeTruthy();
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT]).toStrictEqual(['my-entrypoint.sh']);

    // env is untouched
    expect(devContainerComponent?.container?.env).toStrictEqual([{ name: 'EXISTING', value: 'EXISTING_VALUE' }]);

    // new endpoint added
    expect(devContainerComponent?.container?.endpoints.length).toBe(2);
    expect(devContainerComponent?.container?.endpoints).toStrictEqual([
      { name: 'existing', targetPort: 2 },
      {
        name: 'endpoint1',
        targetPort: 1,
        attributes: {
          'contributed-by': 'che-code.eclipse.org',
        },
      },
    ]);

    // new volume added
    expect(devContainerComponent?.container?.volumeMounts).toStrictEqual([
      {
        name: 'existing',
        path: '/existing',
      },
      {
        name: 'foo',
        path: '/bar',
      },
    ]);
  });

  test('basics with devContainer being added', async () => {
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {
      devWorkspace: {
        spec: {
          template: {},
        },
      },
    } as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {
        image: 'foo',
        memoryLimit: '1024Mi',
        memoryRequest: '512Mi',

        env: [
          {
            name: 'EXISTING',
            value: 'EXISTING_VALUE',
          },
        ],
      },
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-description',
      container: {
        cpuRequest: '500m',
        cpuLimit: '1500m',
        image: 'foo-image',
        env: [
          {
            name: 'FOO_ENV',
            value: 'FOO_VALUE',
          },
        ],
      },
    };
    await devContainerComponentUpdater.update(
      devfileContext,
      cheCodeDescriptionComponent,
      devContainerComponent,
      false
    );

    // check that inside the devContainer we have stuff being added
    const attributes = devContainerComponent.attributes || ({} as any);

    // check entrypoint
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT]).toBeTruthy();
    expect(attributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT]).toBeUndefined();

    // env is untouched
    expect(devContainerComponent?.container?.env).toStrictEqual([{ name: 'EXISTING', value: 'EXISTING_VALUE' }]);

    // new endpoint added
    expect(devContainerComponent?.container?.endpoints.length).toBe(0);

    // new volume added
    expect(devContainerComponent?.container?.volumeMounts).toStrictEqual([]);
  });

  test('basics with insertTemplateAsPlugin', async () => {
    container.bind('boolean').toConstantValue(true).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {
      devWorkspaceTemplates: [
        {
          metadata: {
            name: 'my-template',
          },
          spec: {
            components: [
              {
                name: 'foo',
              },
            ],
          },
        },
      ],
      devWorkspace: {
        spec: {
          template: {
            components: [],
          },
        },
      },
    } as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {
        image: 'foo',
        memoryLimit: '1024Mi',
        memoryRequest: '512Mi',

        env: [
          {
            name: 'EXISTING',
            value: 'EXISTING_VALUE',
          },
        ],
      },
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-description',
      container: {
        cpuRequest: '500m',
        cpuLimit: '1500m',
        image: 'foo-image',
        env: [
          {
            name: 'FOO_ENV',
            value: 'FOO_VALUE',
          },
        ],
      },
    };

    // before, no component
    expect(devfileContext.devWorkspace.spec.template.components.length).toBe(0);

    await devContainerComponentUpdater.update(
      devfileContext,
      cheCodeDescriptionComponent,
      devContainerComponent,
      false
    );

    // expect plugin has been added
    expect(devfileContext.devWorkspace.spec.template.components.length).toBe(1);
    expect(devfileContext.devWorkspace.spec.template.components[0]).toStrictEqual({
      name: 'my-template',
      plugin: { kubernetes: { name: 'my-template' } },
    });
  });

  test('error with insertTemplateAsPlugin missing template name', async () => {
    container.bind('boolean').toConstantValue(true).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {
      devWorkspaceTemplates: [
        {
          spec: {
            components: [
              {
                name: 'foo',
              },
            ],
          },
        },
      ],
      devWorkspace: {
        spec: {
          template: {
            components: [],
          },
        },
      },
    } as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {
        image: 'foo',
        memoryLimit: '1024Mi',
        memoryRequest: '512Mi',

        env: [
          {
            name: 'EXISTING',
            value: 'EXISTING_VALUE',
          },
        ],
      },
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'che-code-description',
      container: {
        cpuRequest: '500m',
        cpuLimit: '1500m',
        image: 'foo-image',
        env: [
          {
            name: 'FOO_ENV',
            value: 'FOO_VALUE',
          },
        ],
      },
    };

    await expect(
      devContainerComponentUpdater.update(devfileContext, cheCodeDescriptionComponent, devContainerComponent, false)
    ).rejects.toThrow('No name found for the template');
  });

  test('error missing dev container', async () => {
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {} as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
    };

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents =
      {} as V1alpha2DevWorkspaceSpecTemplateComponents;

    await expect(
      devContainerComponentUpdater.update(devfileContext, cheCodeDescriptionComponent, devContainerComponent, true)
    ).rejects.toThrow('The dev container should be a component with type "container".');
  });

  test('error missing che code container', async () => {
    container.bind('boolean').toConstantValue(false).whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');
    devContainerComponentUpdater = container.get(DevContainerComponentUpdater);
    const devfileContext = {} as CheCodeDevfileContext;

    const devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents = {
      name: 'foo',
      container: {},
    } as V1alpha2DevWorkspaceSpecTemplateComponents;

    const cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents =
      {} as V1alpha2DevWorkspaceSpecTemplateComponents;

    await expect(
      devContainerComponentUpdater.update(devfileContext, cheCodeDescriptionComponent, devContainerComponent, true)
    ).rejects.toThrow('The che-code component should be a component with type "container".');
  });
});
