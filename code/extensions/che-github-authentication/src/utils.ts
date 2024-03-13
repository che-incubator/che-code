/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

export function createLabelsSelector(labels: { [key: string]: string; }): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}
