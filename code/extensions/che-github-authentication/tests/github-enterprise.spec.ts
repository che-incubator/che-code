/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { GitHubEnterpriseAuthProvider } from '../src/github-enterprise';

describe('GitHubEnterpriseAuthProvider', () => {
  const provider = new GitHubEnterpriseAuthProvider();

  test('has no sessions', async () => {
    await expect(provider.getSessions([])).resolves.toEqual([]);
  });

  test('rejects sign-in attempts', async () => {
    await expect(provider.createSession(['repo'])).rejects.toThrow('GitHub Enterprise is not supported in Eclipse Che');
  });

  test('removing a session does nothing', async () => {
    await expect(provider.removeSession('id')).resolves.toBeUndefined();
  });
});
