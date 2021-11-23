/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { inject, injectable, named } from 'inversify';

import { CheCodeDevfileContext } from '../api/che-code-devfile-context';
import {
  V1alpha2DevWorkspaceSpecTemplateComponents,
  V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainer,
} from '@devfile/api';
import { K8SUnits } from '../k8s/k8s-units';

/**
 * Apply to the DevWorkspace component the information specified in a given DevContainer struct like preferences/extensions/endpoints, etc.
 */
@injectable()
export class DevContainerComponentUpdater {
  static readonly CHECODE_ATTRIBUTE_PREFIX = 'che-code.eclipse.org/';
  static readonly CONTRIBUTE_VOLUME_MOUNT = 'che-code.eclipse.org/contribute-volume-mount/';
  static readonly CONTRIBUTE_VOLUME_COMPONENT = 'che-code.eclipse.org/contribute-volume-component/';
  static readonly CONTRIBUTE_ENDPOINT = 'che-code.eclipse.org/contribute-endpoint/';
  static readonly CONTRIBUTE_CONTAINER = 'che-code.eclipse.org/contributed-container';
  static readonly CONTRIBUTE_ENTRYPOINT = 'che-code.eclipse.org/contribute-entry-point';
  static readonly CONTRIBUTE_ORIGINAL_ENTRYPOINT = 'che-code.eclipse.org/original-entry-point';
  static readonly CONTRIBUTE_PREFIX = 'che-code.eclipse.org/contribute-';
  static readonly CONTRIBUTE_ORIGINAL_PREFIX = 'che-code.eclipse.org/original-';

  @inject('boolean')
  @named('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN')
  private insertDevWorkspaceTemplatesAsPlugin: boolean;

  @inject(K8SUnits)
  private k8SUnits: K8SUnits;

  async update(
    devfileContext: CheCodeDevfileContext,
    cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents,
    devContainerComponent: V1alpha2DevWorkspaceSpecTemplateComponents,
    devContainerExisted: boolean
  ): Promise<void> {
    // ok so we need to enhance the devContainerComponent
    const devContainer = devContainerComponent.container;
    if (!devContainer) {
      throw new Error('The dev container should be a component with type "container".');
    }

    // check that there is a container in the che-code component
    const cheCodeDescriptionComponentContainer = cheCodeDescriptionComponent.container;
    if (!cheCodeDescriptionComponentContainer) {
      throw new Error('The che-code component should be a component with type "container".');
    }

    // add attributes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let devContainerAttributes: any = devContainerComponent.attributes;
    if (!devContainerAttributes) {
      devContainerAttributes = {};
      devContainerComponent.attributes = devContainerAttributes;
    }

    // first, we override the entrypoint
    // got one already ?
    const existingEntrypoint = devContainer.command;
    if (existingEntrypoint) {
      devContainerAttributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT] = true;
      devContainerAttributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT] = existingEntrypoint;
    } else {
      devContainer.command = cheCodeDescriptionComponentContainer.command;
      devContainerAttributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT] = true;
    }

    // and then the volumes
    const devContainerVolumes = devContainer.volumeMounts || [];
    devContainer.volumeMounts = devContainerVolumes;
    // pick up only volumes that are not already defined in the devContainer
    const toInsertVolumeMounts = (cheCodeDescriptionComponentContainer.volumeMounts || []).filter(
      volume => !devContainerVolumes.some(containerVolume => containerVolume.name === volume.name)
    );
    devContainer.volumeMounts.push(...toInsertVolumeMounts);

    // add information that this volume has been added
    toInsertVolumeMounts.forEach(volumeMount => {
      devContainerAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_VOLUME_MOUNT}${volumeMount.name}`] =
        volumeMount.path;
    });

    // check if we need to add component for these volumes
    const existingComponents = devfileContext.devWorkspace.spec.template.components;
    // keep only volumes that match the given component
    const volumeComponentsToAdd = toInsertVolumeMounts.filter(
      volumeMount => !existingComponents.find(component => component.volume && component.name == volumeMount.name)
    );
    volumeComponentsToAdd.forEach(volume => {
      // volume
      devContainerAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_VOLUME_COMPONENT}${volume.name}`] = true;
      existingComponents.push({ name: volume.name, volume: {} });
    });

    // endpoints
    const devContainerEndpoints = devContainer.endpoints || [];
    devContainer.endpoints = devContainerEndpoints;
    const cheCodeContainerEndpoints = cheCodeDescriptionComponentContainer.endpoints || [];
    // add all endpoints
    devContainer.endpoints.push(...cheCodeContainerEndpoints);

    cheCodeContainerEndpoints.forEach(endpoint => {
      const endpointAttributes = endpoint.attributes || {};
      endpoint.attributes = endpointAttributes;
      endpointAttributes['contributed-by'] = 'che-code.eclipse.org';
      devContainerAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_ENDPOINT}${endpoint.name}`] =
        endpoint.targetPort;
    });

    // Either perform a sum or just insert fields
    if (devContainerExisted) {
      // memory
      this.addOrSum(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'memoryLimit');
      this.addOrSum(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'memoryRequest');
      // cpu
      this.addOrSum(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'cpuLimit');
      this.addOrSum(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'cpuRequest');
    } else {
      // add attributes with original memory
      this.addIfExists(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'memoryLimit');
      this.addIfExists(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'memoryRequest');
      this.addIfExists(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'cpuLimit');
      this.addIfExists(cheCodeDescriptionComponentContainer, devContainer, devContainerAttributes, 'cpuRequest');
    }
    // add component that was updated
    devContainerAttributes[DevContainerComponentUpdater.CONTRIBUTE_CONTAINER] = devContainerComponent.name;

    // need to add the kubernetes plug-in in the devWorkspace object
    if (this.insertDevWorkspaceTemplatesAsPlugin) {
      devfileContext.devWorkspaceTemplates.map(template => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (template.metadata as any)?.name;
        if (!name) {
          throw new Error(`No name found for the template ${JSON.stringify(template, undefined, 2)}.`);
        }
        devfileContext.devWorkspace.spec.template.components.push({
          name,
          plugin: {
            kubernetes: {
              name,
            },
          },
        });
      });
    }
  }

  /**
   * Add the attribute if it's defined in the from definition
   * Also add a contributed field in that case
   */
  addIfExists(
    from: V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainer,
    toContainer: V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainer,
    toAttributes: any,
    attributeName: string
  ) {
    if (from[attributeName]) {
      toAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_PREFIX}${attributeName}`] = true;
      toContainer[attributeName] = from[attributeName];
    }
  }

  /**
   * Add the attribute if it's defined in the from definition
   * But if it also existing in the to component definition, add it by adding both values (sum)
   */
  addOrSum(
    from: V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainer,
    toContainer: V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainer,
    toAttributes: any,
    attributeName: string
  ) {
    if (from[attributeName]) {
      toAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_PREFIX}${attributeName}`] = true;
      if (toContainer[attributeName]) {
        // store previous value
        toAttributes[`${DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_PREFIX}${attributeName}`] =
          toContainer[attributeName];
        // add sum
        toContainer[attributeName] = this.k8SUnits.sumUnits(from[attributeName], toContainer[attributeName]);
      } else {
        // use value
        toContainer[attributeName] = from[attributeName];
      }
    }
  }
}
