/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { CheCodeDevfileContext } from '../api/che-code-devfile-context';
import { inject, injectable, named } from 'inversify';

import { CheCodeDevfileResolver } from '../api/che-code-devfile-resolver';
import { DevContainerComponentFinder } from './dev-container-component-finder';
import { CheCodeDescriptionComponentFinder } from './che-code-description-component-finder';
import { DevContainerComponentUpdater } from './dev-container-component-updater';
import { DevContainerComponentInserter } from './dev-container-component-inserter';
import { CheCodeDescriptionComponentRemoval } from './che-code-description-component-removal';

/**
 * This class handle the enhancement of the devWorkspace/DevWorkspaceTemplate for che-code
 * it's responsible for overriding entrypoint, increasing memory/cpu, adding endpoint, volumes
 * and adding a user container if there is no component yet.
 */
@injectable()
export class CheCodeDevfileResolverImpl implements CheCodeDevfileResolver {
  @inject(DevContainerComponentFinder)
  private devContainerComponentFinder: DevContainerComponentFinder;

  @inject(CheCodeDescriptionComponentFinder)
  private cheCodeComponentFinder: CheCodeDescriptionComponentFinder;

  @inject(CheCodeDescriptionComponentRemoval)
  private cheCodeComponentRemoval: CheCodeDescriptionComponentRemoval;

  @inject(DevContainerComponentUpdater)
  private devContainerComponentUpdater: DevContainerComponentUpdater;

  @inject(DevContainerComponentInserter)
  private devContainerComponentInserter: DevContainerComponentInserter;

  async update(devfileContext: CheCodeDevfileContext): Promise<void> {
    // get editor description
    const cheCodeEditor = await this.cheCodeComponentFinder.find(devfileContext);

    if (!cheCodeEditor) {
      throw new Error('No che-code editor description found in DevWorkspaceTemplate');
    }

    // grab container where to inject the editor
    let userContainer = await this.devContainerComponentFinder.find(devfileContext);
    let userContainerExisted;
    if (!userContainer) {
      // not found probably that it's an empty devfile
      // need to add one
      userContainer = await this.devContainerComponentInserter.insert(devfileContext, cheCodeEditor);
      userContainerExisted = false;
    } else {
      userContainerExisted = true;
    }

    // ok now need to apply settings on top of this container
    // like endpoint, volume
    // increase the memoryLimit/cpu, etc
    await this.devContainerComponentUpdater.update(devfileContext, cheCodeEditor, userContainer, userContainerExisted);

    // Remove the definition of the che-code from the devWorkspaceTemplace
    await this.cheCodeComponentRemoval.removeRuntimeComponent(devfileContext, cheCodeEditor);
  }
}
