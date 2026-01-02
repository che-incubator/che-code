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
	BlockDefaultExtensionsInstallationConfigKey,
	InstallOptions,
} from '../../common/extensionManagement.js';

/**
 * Throws when VSIX installation should be blocked by admin policy.
 *
 * - When installing default extensions respects `BlockDefaultExtensionsInstallationConfigKey`
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
	}
}

