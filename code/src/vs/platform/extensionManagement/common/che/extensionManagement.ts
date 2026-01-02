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

export type BlockInstallConfigKeys = {
	BlockDefaultExtensionsInstallationConfigKey: string;
};

export function getCheConfigurationProperties(keys: BlockInstallConfigKeys): Record<string, any> {
	return {
		[keys.BlockDefaultExtensionsInstallationConfigKey]: {
			type: 'boolean',
			markdownDescription: localize('extensions.blockDefaultExtensionsInstallation', "When enabled, blocks installation of default extensions (from DEFAULT_EXTENSIONS env var)"),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			policy: {
				name: 'BlockDefaultExtensionsInstallation',
				minimumVersion: '1.104.3',
				description: localize('extensions.blockDefaultExtensionsInstallation.policy', "When enabled, blocks installation of default extensions (from DEFAULT_EXTENSIONS env var)"),
			},
		}
	};
}
