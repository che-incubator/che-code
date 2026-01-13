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


import { localize } from '../../../../nls.js';
import { ConfigurationScope } from '../../../configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { ILogService } from '../../../log/common/log.js';

export const BlockDefaultExtensionsInstallationConfigKey = 'extensions.blockDefaultExtensionsInstallation';
export const BlockCliExtensionsInstallationConfigKey = 'extensions.blockCliExtensionsInstallation';
export const BlockInstallFromVSIXCommandExtensionsInstallationConfigKey = 'extensions.blockInstallFromVSIXCommandExtensionsInstallation';

export function getCheConfigurationProperties(): Record<string, any> {
	return {
		[BlockDefaultExtensionsInstallationConfigKey]: {
			type: 'boolean',
			markdownDescription: localize('extensions.blockDefaultExtensionsInstallation', "When enabled, blocks installation of default extensions (from DEFAULT_EXTENSIONS env var)"),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			policy: {
				name: 'BlockDefaultExtensionsInstallation',
				minimumVersion: '1.104.3',
				description: localize('extensions.blockDefaultExtensionsInstallation.policy', "When enabled, blocks installation of default extensions (from DEFAULT_EXTENSIONS env var)"),
			},
		},
		[BlockCliExtensionsInstallationConfigKey]: {
			type: 'boolean',
			markdownDescription: localize('extensions.blockCliExtensionsInstallation', "When enabled, blocks installation of extensions via CLI."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			policy: {
				name: 'BlockCliExtensionsInstallation',
				minimumVersion: '1.104.3',
				description: localize('extensions.blockCliExtensionsInstallation.policy', "When enabled, blocks installation of extensions via CLI."),
			},
		},
		[BlockInstallFromVSIXCommandExtensionsInstallationConfigKey]: {
			type: 'boolean',
			markdownDescription: localize('extensions.blockInstallFromVSIXCommandExtensionsInstallation', "When enabled, blocks installation of extensions via the workbench.extensions.command.installFromVSIX command."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			policy: {
				name: 'BlockInstallFromVSIXCommandExtensionsInstallation',
				minimumVersion: '1.104.3',
				description: localize('extensions.blockInstallFromVSIXCommandExtensionsInstallation.policy', "When enabled, blocks installation of extensions via the workbench.extensions.command.installFromVSIX command."),
			},
		}
	};
}


/**
 * Throws when installing from VSIX via command is blocked by admin policy.
 */
export function assertInstallFromVSIXCommandAllowed(
	configurationService: IConfigurationService,
	logService: ILogService
): void {
	const blockInstallFromVSIXCommand = configurationService.getValue<boolean>(BlockInstallFromVSIXCommandExtensionsInstallationConfigKey);
	logService.info('ExtensionsWorkbenchService: BlockInstallFromVSIXCommandExtensionsInstallation ', blockInstallFromVSIXCommand);
	if (blockInstallFromVSIXCommand) {
		logService.info('ExtensionsWorkbenchService: Installation from VSIX files has been blocked by an administrator.');
		throw new Error(localize('installFromVSIX command blocked', "Installation from VSIX files has been blocked by an administrator."));
	}
}

