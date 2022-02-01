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

/**
 * Categorize the endpoint, by specifying if definition comes from a plug-in
 * or from devfile itself
 */
export enum EndpointCategory {
  /**
   * Brought by che-code/che/devworkspace operator
   */
  PLUGINS,

  /**
   * Defined by the user in its devfile
   */
  USER,
}
