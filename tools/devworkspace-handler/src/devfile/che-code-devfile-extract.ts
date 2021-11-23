/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { inject, injectable } from 'inversify';

import {
  V1alpha2DevWorkspace,
  V1alpha2DevWorkspaceSpecTemplate,
  V1alpha2DevWorkspaceSpecTemplateComponents,
} from '@devfile/api';
import * as jsYaml from 'js-yaml';
import { DevContainerComponentUpdater } from './dev-container-component-updater';
/**
 * This class handle the extraction of the original devfile from a DevWorkspace object
 */
@injectable()
export class CheCodeDevfileExtract {
  /**
   * Extracts devfile from the given DevWorkspace
   */
  async extract(devfile: any, devWorkspace: V1alpha2DevWorkspace): Promise<string> {
    if (devWorkspace.spec?.template == null) {
      throw new Error('Requires a template in devWorkspace object');
    }

    // search in main devWorkspace (exclude che-code as component name)
    const contributedComponentContainer = devWorkspace.spec.template.components?.find(
      component => component.attributes?.[DevContainerComponentUpdater.CONTRIBUTE_CONTAINER]
    );

    if (!contributedComponentContainer) {
      throw new Error('Unable to find contribution container');
    }

    // remove contributed objects
    this.removeContributedVolumes(contributedComponentContainer);
    this.removeContributedVolumeComponents(
      contributedComponentContainer,
      devWorkspace.spec.template,
      devWorkspace.spec.template.components
    );
    this.removeContributedEndpoints(contributedComponentContainer);
    this.removeContributedEntrypoint(contributedComponentContainer);
    this.removeContributedResources(contributedComponentContainer);
    this.removeContributedAttributes(contributedComponentContainer);

    const builtDevfile: any = {
      schemaVersion: devfile.schemaVersion,
      metadata: devfile.metadata,
      ...devWorkspace.spec.template,
    };
    return jsYaml.dump(builtDevfile);
  }

  // remove contributed resources
  removeContributedResources(contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents): void {
    this.removeContributedResource(contributedComponentContainer, 'memoryLimit');
    this.removeContributedResource(contributedComponentContainer, 'memoryRequest');
    this.removeContributedResource(contributedComponentContainer, 'cpuLimit');
    this.removeContributedResource(contributedComponentContainer, 'cpuRequest');
  }

  // remove contributed resource
  removeContributedResource(
    contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents,
    resourceName: string
  ): void {
    const attributeName = `${DevContainerComponentUpdater.CONTRIBUTE_PREFIX}${resourceName}`;
    const originalAttributeName = `${DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_PREFIX}${resourceName}`;

    if (contributedComponentContainer.attributes[attributeName]) {
      delete contributedComponentContainer.container[resourceName];
    }
    // restore original resource
    if (contributedComponentContainer.attributes[originalAttributeName]) {
      contributedComponentContainer.container[resourceName] =
        contributedComponentContainer.attributes[originalAttributeName];
    }
  }

  // remove contributed entrypoint
  removeContributedEntrypoint(contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents): void {
    // remove entrypoint
    if (contributedComponentContainer.attributes[DevContainerComponentUpdater.CONTRIBUTE_ENTRYPOINT]) {
      delete contributedComponentContainer.container.command;
    }
    // restore original entrypoint
    if (contributedComponentContainer.attributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT]) {
      contributedComponentContainer.container.command =
        contributedComponentContainer.attributes[DevContainerComponentUpdater.CONTRIBUTE_ORIGINAL_ENTRYPOINT];
    }
  }

  // remove contributed volumes
  removeContributedVolumes(contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents): void {
    const contributedVolumeNames = Object.keys(contributedComponentContainer.attributes)
      .filter(key => key.startsWith(DevContainerComponentUpdater.CONTRIBUTE_VOLUME_MOUNT))
      .map(key => key.substring(DevContainerComponentUpdater.CONTRIBUTE_VOLUME_MOUNT.length));
    contributedComponentContainer.container.volumeMounts.forEach((volumeMount, index) => {
      if (contributedVolumeNames.includes(volumeMount.name)) {
        delete contributedComponentContainer.container.volumeMounts[index];
      }
    });
    // cleanup volumeMounts
    this.cleanupArray(
      contributedComponentContainer.container,
      'volumeMounts',
      contributedComponentContainer.container.volumeMounts
    );
  }

  // remove contributed volume components
  removeContributedVolumeComponents(
    contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents,
    template: V1alpha2DevWorkspaceSpecTemplate,
    currentComponents: V1alpha2DevWorkspaceSpecTemplateComponents[]
  ): void {
    const contributedVolumeComponents = Object.keys(contributedComponentContainer.attributes)
      .filter(key => key.startsWith(DevContainerComponentUpdater.CONTRIBUTE_VOLUME_COMPONENT))
      .map(key => key.substring(DevContainerComponentUpdater.CONTRIBUTE_VOLUME_COMPONENT.length));
    currentComponents.forEach((component, index) => {
      if (contributedVolumeComponents.includes(component.name)) {
        delete currentComponents[index];
      }
    });
    // remove non null elements
    currentComponents = currentComponents.filter(a => a);
    template.components = currentComponents;
  }

  // remove contributed endpoints
  removeContributedEndpoints(contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents): void {
    const contributedEndpoints = Object.keys(contributedComponentContainer.attributes)
      .filter(key => key.startsWith(DevContainerComponentUpdater.CONTRIBUTE_ENDPOINT))
      .map(key => key.substring(DevContainerComponentUpdater.CONTRIBUTE_ENDPOINT.length));
    contributedComponentContainer.container.endpoints.forEach((endpoint, index) => {
      if (contributedEndpoints.includes(endpoint.name)) {
        delete contributedComponentContainer.container.endpoints[index];
      }
    });
    // cleanup endpoints
    this.cleanupArray(
      contributedComponentContainer.container,
      'endpoints',
      contributedComponentContainer.container.endpoints
    );
  }

  // remove all contributed attributes
  removeContributedAttributes(contributedComponentContainer: V1alpha2DevWorkspaceSpecTemplateComponents): void {
    Object.keys(contributedComponentContainer.attributes).forEach(key => {
      if (key.startsWith(DevContainerComponentUpdater.CHECODE_ATTRIBUTE_PREFIX)) {
        delete contributedComponentContainer.attributes[key];
      }
    });

    // delete all attributes if no-entry
    if (Object.keys(contributedComponentContainer.attributes).length === 0) {
      delete contributedComponentContainer.attributes;
    }
  }

  // remove any null, undefined element from the array and if at the end the array is empty, remove the element
  cleanupArray(parent: any, attributeName: string, array: unknown[]): void {
    // remove non null elements
    array = array.filter(a => a);
    parent[attributeName] = array;
    if (array.length === 0) {
      delete parent[attributeName];
    }
  }
}
