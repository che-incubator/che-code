/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { CheCodeDevfileContext } from './che-code-devfile-context';

/**
 * Entry point of the service.
 * Need to update templates based on the given devfile and repository files
 */
export const CheCodeDevfileResolver = Symbol.for('CheCodeDevfileResolver');
export interface CheCodeDevfileResolver {
  /**
   * Update the devWorkspace and templates to inject che code definition
   * @param devfileContext object containing all objects/definition to update
   */
  update(devfileContext: CheCodeDevfileContext): Promise<void>;
}
