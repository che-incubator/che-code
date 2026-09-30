/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL-2.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { extractLocalHostUriMetaDataForPortMapping, ITunnelService, RemoteTunnel } from '../../../../platform/tunnel/common/tunnel.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';

/**
 * Contribution that enables localhost port forwarding in browser context.
 * This bridges asExternalUri() calls to the TunnelService, allowing extensions
 * like GitLab Duo to have their localhost webviews forwarded to public URLs.
 */
export class CheTunnelResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.cheTunnelResolver';

	private readonly activeTunnels = new Map<string, RemoteTunnel>();

	constructor(
		@IOpenerService openerService: IOpenerService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@ILogService private readonly logService: ILogService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
	) {
		super();

		// Only activate in Che/DevWorkspace environment
		if (!this.isDevWorkspaceEnvironment()) {
			return;
		}

		// Don't override if embedder already provided resolveExternalUri
		if (environmentService.options?.resolveExternalUri) {
			this.logService.debug('[CheTunnelResolver] Embedder resolveExternalUri already provided, skipping');
			return;
		}

		this.logService.info('[CheTunnelResolver] Registering external URI resolver for localhost port forwarding');

		this._register(openerService.registerExternalUriResolver({
			resolveExternalUri: async (resource, options) => {
				return this.resolveExternalUri(resource, options);
			}
		}));
	}

	private isDevWorkspaceEnvironment(): boolean {
		// Check for DevWorkspace environment indicators
		// The actual env vars are on the server, but we can check the window location
		// or rely on che-specific configuration
		return typeof window !== 'undefined' &&
			(window.location.hostname.includes('che') ||
			 window.location.hostname.includes('devspaces') ||
			 window.location.hostname.includes('codeready') ||
			 document.querySelector('meta[name="che-workspace"]') !== null ||
			 // Check if che-port extension is likely available
			 this.tunnelService.hasTunnelProvider);
	}

	private async resolveExternalUri(resource: URI, _options?: { readonly allowTunneling?: boolean }): Promise<{ resolved: URI; dispose(): void } | undefined> {
		const portMapping = extractLocalHostUriMetaDataForPortMapping(resource);

		if (!portMapping) {
			// Not a localhost URI, don't handle
			return undefined;
		}

		this.logService.info(`[CheTunnelResolver] Resolving localhost URI: ${resource.toString()}`);

		// Check if we have a tunnel provider
		if (!this.tunnelService.hasTunnelProvider) {
			this.logService.warn('[CheTunnelResolver] No tunnel provider available');
			return undefined;
		}

		const tunnelKey = `${portMapping.address}:${portMapping.port}`;

		// Check for existing tunnel
		const existingTunnel = this.activeTunnels.get(tunnelKey);
		if (existingTunnel) {
			this.logService.debug(`[CheTunnelResolver] Reusing existing tunnel for ${tunnelKey}`);
			const resolved = this.buildResolvedUri(resource, existingTunnel);
			return {
				resolved,
				dispose: () => { /* Keep tunnel alive for reuse */ }
			};
		}

		try {
			// Open a new tunnel
			this.logService.info(`[CheTunnelResolver] Opening tunnel for ${portMapping.address}:${portMapping.port}`);

			const tunnel = await this.tunnelService.openTunnel(
				undefined, // addressProvider
				portMapping.address,
				portMapping.port,
				undefined, // localHost
				undefined, // localPort
				false, // elevateIfNeeded
				'public', // privacy
				'http' // protocol
			);

			if (!tunnel) {
				this.logService.warn(`[CheTunnelResolver] Failed to open tunnel for ${tunnelKey}`);
				return undefined;
			}

			if (typeof tunnel === 'string') {
				// Error message
				this.logService.error(`[CheTunnelResolver] Tunnel error: ${tunnel}`);
				return undefined;
			}

			this.logService.info(`[CheTunnelResolver] Tunnel opened: ${tunnelKey} -> ${tunnel.localAddress}`);

			// Store for reuse
			this.activeTunnels.set(tunnelKey, tunnel);

			const resolved = this.buildResolvedUri(resource, tunnel);

			return {
				resolved,
				dispose: () => {
					// Don't dispose immediately - keep tunnel for potential reuse
					// The tunnel will be disposed when the contribution is disposed
				}
			};
		} catch (error) {
			this.logService.error(`[CheTunnelResolver] Error opening tunnel: ${error}`);
			return undefined;
		}
	}

	private buildResolvedUri(original: URI, tunnel: RemoteTunnel): URI {
		const localAddress = tunnel.localAddress;

		// localAddress can be a full URL like "https://code-redirect-1.workspace.example.com"
		// or just "host:port"
		if (localAddress.startsWith('http://') || localAddress.startsWith('https://')) {
			const tunnelUri = URI.parse(localAddress);
			// Preserve original path and query
			return tunnelUri.with({
				path: original.path,
				query: original.query,
				fragment: original.fragment
			});
		}

		// If it's just host:port, construct the URI
		return original.with({ authority: localAddress });
	}

	override dispose(): void {
		// Clean up all tunnels
		for (const [key, tunnel] of this.activeTunnels) {
			this.logService.debug(`[CheTunnelResolver] Disposing tunnel: ${key}`);
			tunnel.dispose();
		}
		this.activeTunnels.clear();
		super.dispose();
	}
}
