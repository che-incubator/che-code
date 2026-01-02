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

import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { ILogService } from '../../../log/common/log.js';
import {
	BlockCliExtensionsInstallationConfigKey,
	BlockDefaultExtensionsInstallationConfigKey,
	InstallOptions,
} from '../../common/extensionManagement.js';

/**
 * Throws when VSIX installation should be blocked by admin policy.
 *
 * - When installing default extensions respects `BlockDefaultExtensionsInstallationConfigKey`.
 * - When installing via CLI respects `BlockCliExtensionsInstallationConfigKey`.
 */
export function assertVSIXInstallAllowed(
	configurationService: IConfigurationService,
	logService: ILogService,
	options: InstallOptions = {}
): void {
	const isDefaultExtension = options.isDefault === true;
	if (isDefaultExtension) {
		const blockDefaultExtensions = configurationService.getValue<boolean>(BlockDefaultExtensionsInstallationConfigKey);
		logService.info('ExtensionManagementService: BlockDefaultExtensionsInstallation ', blockDefaultExtensions);
		if (blockDefaultExtensions) {
			logService.info('ExtensionManagementService: Default extension installation has been blocked by an administrator.');
			throw new Error(nls.localize('Default extensions blocked', "Default extension installation has been blocked by an administrator."));
		}
	} else {
		const blockCliExtensions = configurationService.getValue<boolean>(BlockCliExtensionsInstallationConfigKey);
		logService.info('ExtensionManagementService: BlockCliExtensionsInstallation ', blockCliExtensions);
		if (blockCliExtensions) {
			logService.info('ExtensionManagementService: Installation of extensions via CLI has been blocked by an administrator.');
			throw new Error(nls.localize('CLI extensions blocked', "Installation of extensions via CLI has been blocked by an administrator."));
		}
	}
}

