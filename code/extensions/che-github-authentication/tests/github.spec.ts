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

import 'reflect-metadata';

import * as vscode from 'vscode';
import { ErrorHandler } from '../src/error-handler';
import { ExtensionContext } from '../src/extension-context';
import { GitHubAuthProvider, GithubService } from '../src/github';
import { Logger } from '../src/logger';

// ErrorHandler pulls in @kubernetes/client-node and is not used by session hydration
jest.mock('../src/error-handler', () => ({ ErrorHandler: class { } }));

const SESSIONS_KEY = 'sessions:default';
const DEVICE_AUTH_SESSION_IDS_KEY = 'device-auth-session-ids:default';

const ACCOUNT = { label: 'user', id: '1' };
const STANDARD_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'];
const GIST_SCOPES = ['gist', 'user:email'];

function session(id: string, accessToken: string, scopes: string[]): vscode.AuthenticationSession {
  return { id, accessToken, account: ACCOUNT, scopes };
}

/** Session change event with sessions reduced to ids (removed, changed) or scopes (added, as their ids are generated) */
function summarize(event: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent) {
  return {
    added: (event.added ?? []).map(s => s.scopes.join(' ')),
    removed: (event.removed ?? []).map(s => s.id),
    changed: (event.changed ?? []).map(s => s.id),
  };
}

describe('GitHubAuthProvider session hydration', () => {
  let secrets: Map<string, string>;
  let currentToken: string;
  let tokenScopes: Record<string, string[]>;
  let isDeviceAuthToken: boolean;
  let removeDeviceAuthToken: jest.Mock<Promise<void>, []>;
  let events: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[];

  function createProvider(): GitHubAuthProvider {
    const githubService: GithubService = {
      whenReady: Promise.resolve(),
      getToken: async () => currentToken,
      persistDeviceAuthToken: async () => { },
      removeDeviceAuthToken: () => removeDeviceAuthToken(),
      getUser: async () => ({ login: ACCOUNT.label, id: Number(ACCOUNT.id), name: '', email: '' }),
      getTokenScopes: async (token: string) => tokenScopes[token] ?? [],
      isDeviceAuthToken: async () => isDeviceAuthToken,
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const extensionContext = {
      getContext: () => ({
        secrets: {
          get: async (key: string) => secrets.get(key),
          store: async (key: string, value: string) => { secrets.set(key, value); },
        },
      }),
    } as unknown as ExtensionContext;

    const provider = new GitHubAuthProvider(logger, {} as ErrorHandler, extensionContext, githubService);
    provider.onDidChangeSessions(e => events.push(e));
    return provider;
  }

  beforeEach(() => {
    // hydrateFromK8sToken() races `whenReady` with a 5s timeout; keep the timer from holding the test run
    jest.useFakeTimers();
    delete process.env.DEVWORKSPACE_ID;
    secrets = new Map();
    tokenScopes = {};
    isDeviceAuthToken = false;
    removeDeviceAuthToken = jest.fn(async () => { });
    events = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps a session outside the scope bundles when the new token covers its scopes', async () => {
    secrets.set(SESSIONS_KEY, JSON.stringify([
      session('bundle-session', 'old-pat', STANDARD_SCOPES),
      session('gist-session', 'old-pat', GIST_SCOPES),
    ]));
    tokenScopes = { 'old-pat': [...STANDARD_SCOPES, 'gist'], 'new-pat': [...STANDARD_SCOPES, 'gist'] };
    currentToken = 'new-pat';

    const provider = createProvider();
    await provider.hydrateFromK8sToken();

    expect(events.map(summarize)).toEqual([{
      added: ['read:user user:email repo', 'read:user user:email', 'user:email'],
      removed: [],
      changed: ['bundle-session', 'gist-session'],
    }]);
    expect(await provider.getSessions(['gist'])).toEqual([session('gist-session', 'new-pat', GIST_SCOPES)]);
  });

  test('removes a session whose scopes the new token does not cover, in a separate first event', async () => {
    secrets.set(SESSIONS_KEY, JSON.stringify([
      session('bundle-session', 'old-pat', STANDARD_SCOPES),
      session('gist-session', 'old-pat', GIST_SCOPES),
    ]));
    tokenScopes = { 'old-pat': [...STANDARD_SCOPES, 'gist'], 'new-pat': STANDARD_SCOPES };
    currentToken = 'new-pat';

    const provider = createProvider();
    await provider.hydrateFromK8sToken();

    expect(events.map(summarize)).toEqual([
      { added: [], removed: ['gist-session'], changed: [] },
      { added: ['read:user user:email repo', 'read:user user:email', 'user:email'], removed: [], changed: ['bundle-session'] },
    ]);
    expect(await provider.getSessions(['gist'])).toEqual([]);
  });

  test('reports changed only for sessions whose token changed', async () => {
    // Restart after the Device Authentication token was removed: the device-auth session is
    // dropped and the remaining PAT sessions are re-hydrated with the same PAT
    secrets.set(SESSIONS_KEY, JSON.stringify([
      session('pat-session', 'pat', ['read:user', 'user:email', 'repo']),
      session('gist-session', 'pat', GIST_SCOPES),
      session('device-auth-session', 'device-auth-token', STANDARD_SCOPES),
    ]));
    secrets.set(DEVICE_AUTH_SESSION_IDS_KEY, JSON.stringify(['device-auth-session']));
    tokenScopes = { 'pat': [...STANDARD_SCOPES, 'gist'] };
    currentToken = 'pat';

    const provider = createProvider();
    await provider.hydrateFromK8sToken();

    expect(events.map(summarize)).toEqual([
      { added: [], removed: ['device-auth-session'], changed: [] },
      { added: ['read:user user:email repo workflow', 'read:user user:email', 'user:email'], removed: [], changed: [] },
    ]);
    expect(await provider.getSessions(['gist'])).toEqual([session('gist-session', 'pat', GIST_SCOPES)]);
  });

  test('joins a Device Authentication token removal that is already running', async () => {
    secrets.set(SESSIONS_KEY, JSON.stringify([session('device-auth-session', 'device-auth-token', STANDARD_SCOPES)]));
    secrets.set(DEVICE_AUTH_SESSION_IDS_KEY, JSON.stringify(['device-auth-session']));
    tokenScopes = { 'device-auth-token': STANDARD_SCOPES, 'pat': STANDARD_SCOPES };
    currentToken = 'device-auth-token';
    isDeviceAuthToken = true;
    removeDeviceAuthToken.mockImplementation(async () => {
      currentToken = 'pat';
      isDeviceAuthToken = false;
    });

    const provider = createProvider();
    await Promise.all([provider.removeDeviceAuthToken(), provider.removeDeviceAuthToken()]);
    expect(removeDeviceAuthToken).toHaveBeenCalledTimes(1);

    // A removal requested after the previous one completed runs again
    await provider.removeDeviceAuthToken();
    expect(removeDeviceAuthToken).toHaveBeenCalledTimes(2);
  });
});
