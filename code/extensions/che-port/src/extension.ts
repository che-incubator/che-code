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

import 'reflect-metadata';
import * as vscode from 'vscode';

import { PortsPlugin } from './ports-plugin';

let portsPlugin: PortsPlugin | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // if not in a che context, do nothing
  if (!process.env.DEVWORKSPACE_ID) {
    return;
  }

  portsPlugin = new PortsPlugin(context);
  return portsPlugin.start();
}

export function deactivate(): void {
  if (portsPlugin) {
    portsPlugin.stop();
  }
}
