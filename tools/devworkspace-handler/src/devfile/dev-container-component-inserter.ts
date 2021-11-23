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
 * Allow to add a new component on empty devfile by copying editor description
 */
@injectable()
export class DevContainerComponentInserter {
  async insert(
    devfileContext: CheCodeDevfileContext,
    cheCodeEditorTemplate: V1alpha2DevWorkspaceSpecTemplateComponents
  ): Promise<V1alpha2DevWorkspaceSpecTemplateComponents> {
    // add editor
    if (!devfileContext.devWorkspace.spec) {
      devfileContext.devWorkspace.spec = {
        started: false,
      };
    }
    if (!devfileContext.devWorkspace.spec.template) {
      devfileContext.devWorkspace.spec.template = {};
    }
    if (!devfileContext.devWorkspace.spec.template.components) {
      devfileContext.devWorkspace.spec.template.components = [];
    }
    devfileContext.devWorkspace.spec.template.components.push(cheCodeEditorTemplate);

    return cheCodeEditorTemplate;
  }
}
