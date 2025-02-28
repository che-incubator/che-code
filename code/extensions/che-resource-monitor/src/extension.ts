/**********************************************************************
 * Copyright (c) 2022-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

if (Reflect.metadata === undefined) {
  // tslint:disable-next-line:no-require-imports no-var-requires
  require('reflect-metadata');
}

import * as vscode from 'vscode';

import { InversifyBinding } from './inversify-binding';
import { ResourceMonitor } from './resource-monitor';

let resourceMonitorPLugin: ResourceMonitor;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const inversifyBinding = new InversifyBinding();
  const container = await inversifyBinding.initBindings();

  const workspaceService = await getWorkspaceService();
  const namespace = await workspaceService.getNamespace();
  const podName = await workspaceService.getPodName();

  resourceMonitorPLugin = container.get(ResourceMonitor);
  resourceMonitorPLugin.start(context, namespace, podName);
}

export async function getWorkspaceService(): Promise<any> {
  const extensionApi = vscode.extensions.getExtension('eclipse-che.api');
  if (!extensionApi) {
    throw new Error("Extension 'eclipse-che.api' is not installed");
  }

  await extensionApi.activate();
  const cheApi: any = extensionApi?.exports;
  return cheApi.getWorkspaceService();
}
