/**********************************************************************
 * Copyright (c) 2022-2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';

import { PortsPlugin } from './ports-plugin';
import { CheTunnelProvider } from './tunnel-provider';

let portsPlugin: PortsPlugin | undefined;
let tunnelProvider: CheTunnelProvider | undefined;
let tunnelProviderDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // if not in a che context, do nothing
  if (!process.env.DEVWORKSPACE_ID) {
    return;
  }

  portsPlugin = new PortsPlugin(context);
  await portsPlugin.start();

  // Register tunnel provider for localhost port forwarding
  // This enables extensions like GitLab Duo that use webviews with localhost servers
  tunnelProvider = new CheTunnelProvider(portsPlugin);

  try {
    tunnelProviderDisposable = await vscode.workspace.registerTunnelProvider(tunnelProvider, {
      tunnelFeatures: {
        elevation: false,
        privacyOptions: [
          { id: 'public', label: 'Public', themeIcon: 'globe' }
        ],
        protocol: true
      }
    });
    context.subscriptions.push(tunnelProviderDisposable);
    console.log('[che-port] Tunnel provider registered successfully');
  } catch (error) {
    console.error('[che-port] Failed to register tunnel provider:', error);
  }
}

export function deactivate(): void {
  if (tunnelProvider) {
    tunnelProvider.dispose();
    tunnelProvider = undefined;
  }
  if (tunnelProviderDisposable) {
    tunnelProviderDisposable.dispose();
    tunnelProviderDisposable = undefined;
  }
  if (portsPlugin) {
    portsPlugin.stop();
    portsPlugin = undefined;
  }
}
