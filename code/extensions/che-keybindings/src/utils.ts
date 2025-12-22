/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */
export function getOrCreateClientId(state: any): string {
  let id = state.get('clientId');
  if (!id) {
    id = Math.random().toString(36).slice(2);
    state.update('clientId', id);
  }
  return id;
}
