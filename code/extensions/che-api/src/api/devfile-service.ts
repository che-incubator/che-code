
/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import {
  V1alpha2DevWorkspaceSpecTemplate
} from '@devfile/api';

export const DevfileService = Symbol('DevfileService');

export interface DevfileService {
  // Provides raw content of the devfile as a string
  getRaw(): Promise<string>;
  // Get structured object of the devfile
  get(): Promise<V1alpha2DevWorkspaceSpecTemplate>;

  // Update the devfile based on the given content
  updateDevfile(devfile: V1alpha2DevWorkspaceSpecTemplate): Promise<void>;
}
