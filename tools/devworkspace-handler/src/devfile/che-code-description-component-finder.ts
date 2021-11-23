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
import { V1alpha2DevWorkspaceSpecTemplateComponents } from '@devfile/api';
import { injectable } from 'inversify';

/**
 * Need to find che code component from main dev workspace or from a template
 */
@injectable()
export class CheCodeDescriptionComponentFinder {
  async find(devfileContext: CheCodeDevfileContext): Promise<V1alpha2DevWorkspaceSpecTemplateComponents> {
    // need to find definition

    // first, search in all templates
    for (const template of devfileContext.devWorkspaceTemplates) {
      const cheCodeDescriptionComponent = template.spec?.components?.find(
        component => component.name === 'che-code-runtime-description'
      );
      // got one
      if (cheCodeDescriptionComponent) {
        return cheCodeDescriptionComponent;
      }
    }

    // then search in main devWorkspace
    const cheCodeDescriptionComponent = devfileContext.devWorkspace.spec?.template?.components?.find(
      component => component.name === 'che-code-runtime-description'
    );
    // got one
    if (cheCodeDescriptionComponent) {
      return cheCodeDescriptionComponent;
    }

    throw new Error('Not able to find che-code-description component in DevWorkspace and its templates');
  }
}
