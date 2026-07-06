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

import * as path from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { INativeServerExtensionManagementService } from '../../../platform/extensionManagement/node/extensionManagementService.js';
import { IExtensionGalleryService } from '../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from '../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IUserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteExtensionsScannerService } from '../../../platform/remote/common/remoteExtensionsScanner.js';
import { IScannedProfileExtension } from '../../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { getGalleryExtensionId } from '../../../platform/extensionManagement/common/extensionManagementUtil.js';

export class DefaultExtensionsInstaller extends Disposable {

	constructor(
		private readonly extensionManagementService: INativeServerExtensionManagementService,
		private readonly logService: ILogService,
		private readonly fileService: IFileService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly extensionGalleryService: IExtensionGalleryService,
		private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
		private readonly remoteExtensionsScanner: IRemoteExtensionsScannerService,
	) {
		super();
		this.initialize().catch(error => {
			this.logService.error('DefaultExtensionsInstaller: Failed to initialize default extensions installer', error);
		});
	}

	private async waitForGalleryService(): Promise<boolean> {
		if (this.extensionGalleryService.isEnabled()) {
			this.logService.info('DefaultExtensionsInstaller: Gallery service is already enabled');
			return true;
		}

		this.logService.info('DefaultExtensionsInstaller: Waiting for gallery service to be enabled');
		this.logService.info(`DefaultExtensionsInstaller: Current gallery manifest status: ${this.extensionGalleryManifestService.extensionGalleryManifestStatus}`);
		
		// Use the barrier approach as the primary mechanism - it waits until the manifest is actually set
		// The barrier in getExtensionGalleryManifest() will block until the client sets the manifest via IPC
		return Promise.race([
			// Primary: Wait for manifest barrier (waits until client sets it)
			(async () => {
				try {
					this.logService.info('DefaultExtensionsInstaller: Waiting for gallery manifest via barrier (waits for client to set it)');
					const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
					if (manifest && this.extensionGalleryService.isEnabled()) {
						this.logService.info('DefaultExtensionsInstaller: Gallery service is enabled (manifest barrier resolved)');
						return true;
					}
					this.logService.warn('DefaultExtensionsInstaller: Manifest received but gallery service not enabled');
					return false;
				} catch (error) {
					this.logService.warn('DefaultExtensionsInstaller: Error waiting for manifest barrier', error);
					return false;
				}
			})(),
			
			// Secondary: Event-based waiting (fires when status changes)
			new Promise<boolean>((resolve) => {
				const timeout = setTimeout(() => {
					disposable.dispose();
					this.logService.warn('DefaultExtensionsInstaller: Gallery service wait timeout (60s) - proceeding without it');
					resolve(false);
				}, 60000); // 60 second safety timeout

				const disposable = this.extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus((status) => {
					this.logService.info(`DefaultExtensionsInstaller: Gallery manifest status changed to: ${status}`);
					if (status === ExtensionGalleryManifestStatus.Available && this.extensionGalleryService.isEnabled()) {
						clearTimeout(timeout);
						disposable.dispose();
						this.logService.info('DefaultExtensionsInstaller: Gallery service is enabled (via status event)');
						resolve(true);
					}
				});

				// Check immediately in case it's already available
				if (this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available && this.extensionGalleryService.isEnabled()) {
					clearTimeout(timeout);
					disposable.dispose();
					this.logService.info('DefaultExtensionsInstaller: Gallery service is already enabled (checked immediately)');
					resolve(true);
				}
			})
		]);
	}

	private async initialize(): Promise<void> {
		const defaultExtensionsEnv = typeof process !== 'undefined' && process.env ? process.env['DEFAULT_EXTENSIONS'] : undefined;
		if (!defaultExtensionsEnv) {
			this.logService.info('DefaultExtensionsInstaller: DEFAULT_EXTENSIONS not set, skipping installation');
			return;
		}

		const extensionPaths = defaultExtensionsEnv.split(';').map(p => p.trim()).filter(p => p);
		if (extensionPaths.length === 0) {
			this.logService.info('DefaultExtensionsInstaller: No extensions to install');
			return;
		}
		this.logService.info(`DefaultExtensionsInstaller: Found ${extensionPaths.length} default extension(s) in DEFAULT_EXTENSIONS`);

		// Wait for extensions to be ready before installing to avoid race conditions where
		// extensions try to activate before their dependencies are fully installed
		this.logService.info('DefaultExtensionsInstaller: Waiting for extensions to be ready');
		try {
			await this.remoteExtensionsScanner.whenExtensionsReady();
			this.logService.info('DefaultExtensionsInstaller: Extensions are ready');
		} catch (error) {
			this.logService.error('DefaultExtensionsInstaller: Failed to wait for extensions ready', error);
			return;
		}

		// Wait for gallery service to be enabled so dependencies can be installed from the gallery
		// This is critical - without gallery service, dependencies won't be installed
		// The barrier in getExtensionGalleryManifest() will wait until the client sets the manifest via IPC
		const galleryEnabled = await this.waitForGalleryService();
		if (!galleryEnabled) {
			this.logService.warn('DefaultExtensionsInstaller: Gallery service is not enabled - dependencies may not be installed');
		}

		// Read installed extensions from extensions.json to check what's already installed
		const installedExtensions = await this.getInstalledExtensions();
		const installedExtensionIds = new Set<string>(
			installedExtensions.map(ext => ext.identifier.id.toLowerCase())
		);

		// Check which extensions need to be installed by reading their manifests
		const pathsToInstall: string[] = [];
		for (const vsixPath of extensionPaths) {

			try {
				const vsixUri = URI.file(vsixPath);
				const manifest = await this.extensionManagementService.getManifest(vsixUri);
				const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
				
				if (installedExtensionIds.has(extensionId.toLowerCase())) {
					this.logService.debug(`DefaultExtensionsInstaller: Extension ${extensionId} is already installed, skipping ${vsixPath}`);
				} else {
					pathsToInstall.push(vsixPath);
				}
			} catch (error) {
				this.logService.warn(`DefaultExtensionsInstaller: Failed to read manifest from ${vsixPath}, will attempt installation anyway`, error);
				// If we can't read the manifest, try to install anyway (might be a new file)
				pathsToInstall.push(vsixPath);
			}
		}

		if (pathsToInstall.length === 0) {
			this.logService.debug('DefaultExtensionsInstaller: All default extensions already installed');
			return;
		}

		await this.installExtensions(pathsToInstall);
	}

	private async getInstalledExtensions(): Promise<IScannedProfileExtension[]> {
		const storageFile = this.getStorageFile();
		try {
			const content = await this.fileService.readFile(storageFile);
			const extensions = JSON.parse(content.value.toString()) as IScannedProfileExtension[];
			if (Array.isArray(extensions)) {
				return extensions;
			}
			this.logService.warn('DefaultExtensionsInstaller: extensions.json is not an array, treating as empty');
			return [];
		} catch (e) {
			// File doesn't exist or is invalid, start fresh
			this.logService.debug('DefaultExtensionsInstaller: Could not read extensions.json, treating as empty', e);
			return [];
		}
	}

	private async installExtensions(pathsToInstall: string[]): Promise<void> {
		const vsixUris = pathsToInstall.map(p => URI.file(p));
		if (vsixUris.length === 0) {
			this.logService.warn('DefaultExtensionsInstaller: No valid URLs for installation - skipping installation process.');
			return;
		}

		this.logService.info(`DefaultExtensionsInstaller: Installing ${vsixUris.length} extension(s) in parallel`);

		// Install in parallel using Promise.allSettled
		const results = await Promise.allSettled(
			vsixUris.map(async (vsixUri) => {
				this.logService.info(`DefaultExtensionsInstaller: Installing extension from ${vsixUri.fsPath}`);
				await this.extensionManagementService.install(vsixUri, {
					isDefault: true, // Mark as default extension to bypass policy checks
					installGivenVersion: true // this will install dependencies automatically
				});
				this.logService.info(`DefaultExtensionsInstaller: Successfully installed extension from ${vsixUri.fsPath}`);
			})
		);

		let successCount = 0;
		for (const result of results) {
			if (result.status === 'fulfilled') {
				successCount++;
			} else {
				this.logService.error(`DefaultExtensionsInstaller: Failed to install extension`, result.reason);
			}
		}

		if (successCount > 0) {
			this.logService.info(`DefaultExtensionsInstaller: Successfully installed ${successCount} extension(s)`);
		}
	}

	private getStorageFile(): URI {
		return this.userDataProfilesService.defaultProfile.extensionsResource.with({
			path: path.join(path.dirname(this.userDataProfilesService.defaultProfile.extensionsResource.path), 'extensions.json')
		});
	}
}

