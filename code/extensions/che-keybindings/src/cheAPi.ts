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
export type KeybindingsResponse = {
  keybindingsJson: string;
  meta?: {
    resourceVersion?: string;
    updatedAt?: string;
  };
};

const API_PREFIX = '/api';

export async function getKeybindings(namespace: string): Promise<KeybindingsResponse | null> {
  const res = await fetch(
    `${API_PREFIX}/namespace/${namespace}/keybindings`,
    { credentials: 'include' }
  );

  if (!res.ok) {
    return null;
  }
  const data = await res.json() as KeybindingsResponse;
  return data;
}

export async function patchKeybindings(
  namespace: string,
  keybindingsJson: string,
  clientId: string
): Promise<void> {
  await fetch(
    `${API_PREFIX}/namespace/${namespace}/keybindings`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keybindingsJson,
        meta: { clientId },
      }),
    }
  );
}
