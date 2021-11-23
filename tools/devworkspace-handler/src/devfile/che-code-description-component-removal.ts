/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { injectable } from 'inversify';

import { CheCodeDevfileContext } from '../api/che-code-devfile-context';
import { V1alpha2DevWorkspaceSpecTemplateComponents } from '@devfile/api';

/**
 * Responsible for removing the provided component from the devWorkspace templates
 */
@injectable()
export class CheCodeDescriptionComponentRemoval {
  async removeRuntimeComponent(
    devfileContext: CheCodeDevfileContext,
    cheCodeDescriptionComponent: V1alpha2DevWorkspaceSpecTemplateComponents
  ): Promise<void> {
    // Remove the component from the template
    for (const template of devfileContext.devWorkspaceTemplates) {
      for (var i = template.spec?.components.length; i--; ) {
        if (template.spec.components[i].name === cheCodeDescriptionComponent.name) {
          template.spec.components.splice(i, 1);
        }
      }
    }
  }
}
