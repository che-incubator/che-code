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

// Mock @kubernetes/client-node to avoid ESM issues in Jest
jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn(),
  CoreV1Api: jest.fn(),
  AppsV1Api: jest.fn(),
  RbacAuthorizationV1Api: jest.fn(),
  CustomObjectsApi: jest.fn(),
}));

import 'reflect-metadata';

import * as vscode from 'vscode';

import { Container } from 'inversify';
import { InversifyBinding } from '../src/inversify-binding';
import { K8sHelper } from '../src/k8s-helper';
import { ResourceMonitor } from '../src/resource-monitor';

const createStatusBar = jest.fn();
const statusBarItem: vscode.StatusBarItem = {
  id: '',
  name: '',
  backgroundColor: undefined,
  accessibilityInformation: undefined,
  alignment: 1,
  color: '',
  text: '',
  tooltip: '',
  command: '',
  priority: 0,
  dispose: jest.fn(),
  hide: jest.fn(),
  show: jest.fn(),
};

describe('Test InversifyBinding', () => {
  test('bindings', async () => {
    vscode.window.createStatusBarItem = createStatusBar;
    createStatusBar.mockReturnValue(statusBarItem);
    const inversifyBinding = new InversifyBinding();
    const container: Container = await inversifyBinding.initBindings();

    expect(inversifyBinding).toBeDefined();

    expect(container.get(ResourceMonitor)).toBeDefined();
    expect(container.get(K8sHelper)).toBeDefined();
  });
});
