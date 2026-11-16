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

import { activate } from '../src/extension';
import { GITHUB_AUTHORIZATION_SERVER, GithubService } from '../src/github';

// ErrorHandler and K8sHelper pull in @kubernetes/client-node and are not needed to register
// the providers; the inversify @injectable annotation is kept so container.toSelf() still works.
jest.mock('../src/error-handler', () => {
  const { injectable } = jest.requireActual('inversify') as typeof import('inversify');
  return { ErrorHandler: injectable()(class ErrorHandler { }) };
});

jest.mock('../src/k8s-helper', () => {
  const { injectable } = jest.requireActual('inversify') as typeof import('inversify');
  return { K8sHelper: injectable()(class K8sHelper { }) };
});

const ACCOUNT = { label: 'user', id: '1' };

describe('extension activation', () => {
  beforeEach(() => {
    // hydrateFromK8sToken() races `whenReady` with a 5s timeout; keep the timer from holding the test run
    jest.useFakeTimers();
    (vscode.authentication.registerAuthenticationProvider as jest.Mock).mockClear();
    (vscode.extensions.getExtension as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('registers the github provider with the GitHub authorization server', async () => {
    const githubService: GithubService = {
      whenReady: Promise.resolve(),
      getToken: async () => 'pat',
      persistDeviceAuthToken: async () => { },
      removeDeviceAuthToken: async () => { },
      getUser: async () => ({ login: ACCOUNT.label, id: Number(ACCOUNT.id), name: '', email: '' }),
      getTokenScopes: async () => [],
      isDeviceAuthToken: async () => false,
    };
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
      activate: async () => undefined,
      exports: {
        getDevfileService: () => ({}),
        getGithubService: () => githubService,
      },
    });

    const secrets = new Map<string, string>();
    const context = {
      secrets: {
        get: async (key: string) => secrets.get(key),
        store: async (key: string, value: string) => { secrets.set(key, value); },
      },
      subscriptions: [] as { dispose(): unknown }[],
    };

    await activate(context as unknown as vscode.ExtensionContext);

    expect(vscode.authentication.registerAuthenticationProvider).toHaveBeenCalledWith(
      'github',
      'GitHub',
      expect.anything(),
      { supportedAuthorizationServers: [GITHUB_AUTHORIZATION_SERVER] },
    );
  });
});
