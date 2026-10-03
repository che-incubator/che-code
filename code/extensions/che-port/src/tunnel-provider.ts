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

import * as vscode from 'vscode';
import { Endpoint } from './endpoint';
import { PortForwardServer } from './port-forward-server';

/**
 * Represents an active tunnel created by CheTunnelProvider.
 * Implements vscode.Tunnel interface for VS Code's tunnel management.
 */
class CheTunnel implements vscode.Tunnel {
  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  constructor(
    public readonly remoteAddress: { port: number; host: string },
    public readonly localAddress: string,
    public readonly privacy: string,
    public readonly protocol: string,
    private readonly portForwardServer: PortForwardServer,
    private readonly onDispose: () => void
  ) {}

  dispose(): void {
    this.portForwardServer.stop();
    this.onDispose();
    this.onDidDisposeEmitter.fire();
    this.onDidDisposeEmitter.dispose();
  }
}

/**
 * Interface for accessing redirect ports from PortsPlugin.
 */
export interface RedirectPortManager {
  /**
   * Get an available code-redirect endpoint.
   * Returns undefined if no redirect slots are available.
   */
  acquireRedirectEndpoint(): Endpoint | undefined;

  /**
   * Release a previously acquired redirect endpoint.
   */
  releaseRedirectEndpoint(endpoint: Endpoint): void;

  /**
   * Get the output channel for logging.
   */
  getOutputChannel(): vscode.OutputChannel;
}

/**
 * TunnelProvider implementation for Eclipse Che that uses code-redirect endpoints
 * to expose localhost ports to the browser.
 *
 * This enables extensions like GitLab Duo that use localhost servers for webviews
 * to work in browser-based VS Code environments.
 */
export class CheTunnelProvider implements vscode.TunnelProvider {
  private activeTunnels: Map<number, CheTunnel> = new Map();

  constructor(private readonly redirectPortManager: RedirectPortManager) {}

  /**
   * Provides a tunnel for the requested port by:
   * 1. Acquiring an available code-redirect endpoint
   * 2. Starting a TCP proxy from the redirect port to the target localhost port
   * 3. Returning the public URL of the redirect endpoint
   */
  async provideTunnel(
    tunnelOptions: vscode.TunnelOptions,
    _tunnelCreationOptions: vscode.TunnelCreationOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.Tunnel | undefined> {
    const targetPort = tunnelOptions.remoteAddress.port;
    const targetHost = tunnelOptions.remoteAddress.host;
    const outputChannel = this.redirectPortManager.getOutputChannel();

    outputChannel.appendLine(`[TunnelProvider] Tunnel requested for ${targetHost}:${targetPort}`);

    // Check if we already have a tunnel for this port
    if (this.activeTunnels.has(targetPort)) {
      outputChannel.appendLine(`[TunnelProvider] Reusing existing tunnel for port ${targetPort}`);
      return this.activeTunnels.get(targetPort);
    }

    // Acquire a free code-redirect endpoint
    const redirectEndpoint = this.redirectPortManager.acquireRedirectEndpoint();
    if (!redirectEndpoint) {
      outputChannel.appendLine(`[TunnelProvider] No free code-redirect slots available for port ${targetPort}`);
      return undefined;
    }

    outputChannel.appendLine(
      `[TunnelProvider] Using ${redirectEndpoint.name} (port ${redirectEndpoint.targetPort}) for tunnel to ${targetPort}`
    );

    // Start TCP proxy from redirect port to target port
    const portForwardServer = new PortForwardServer(
      redirectEndpoint.targetPort,
      targetHost === '127.0.0.1' || targetHost === '0.0.0.0' ? 'localhost' : targetHost,
      targetPort
    );

    try {
      await portForwardServer.start();
    } catch (error) {
      outputChannel.appendLine(`[TunnelProvider] Failed to start port forward: ${error}`);
      this.redirectPortManager.releaseRedirectEndpoint(redirectEndpoint);
      return undefined;
    }

    // Get the public URL for the redirect endpoint
    const publicUrl = redirectEndpoint.url;
    if (!publicUrl) {
      outputChannel.appendLine(`[TunnelProvider] Redirect endpoint ${redirectEndpoint.name} has no URL`);
      portForwardServer.stop();
      this.redirectPortManager.releaseRedirectEndpoint(redirectEndpoint);
      return undefined;
    }

    outputChannel.appendLine(`[TunnelProvider] Tunnel created: localhost:${targetPort} -> ${publicUrl}`);

    // Create the tunnel object
    const tunnel = new CheTunnel(
      { port: targetPort, host: targetHost },
      publicUrl,
      'public',
      tunnelOptions.protocol || 'http',
      portForwardServer,
      () => {
        this.activeTunnels.delete(targetPort);
        this.redirectPortManager.releaseRedirectEndpoint(redirectEndpoint);
        outputChannel.appendLine(`[TunnelProvider] Tunnel disposed for port ${targetPort}`);
      }
    );

    this.activeTunnels.set(targetPort, tunnel);
    return tunnel;
  }

  /**
   * Dispose all active tunnels.
   */
  dispose(): void {
    for (const tunnel of this.activeTunnels.values()) {
      tunnel.dispose();
    }
    this.activeTunnels.clear();
  }
}
