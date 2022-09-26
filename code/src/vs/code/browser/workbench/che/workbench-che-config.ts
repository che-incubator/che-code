
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

import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IInitialColorTheme, IWindowIndicator, IWorkbenchConstructionOptions } from 'vs/workbench/browser/web.api';

/**
 * Built time configuration (do NOT modify the value below)
 * Modify workbench-config.json file to apply a change for the configuration
 */
const workbenchConfiguration = { /*BUILD->INSERT_WORKBENCH_CONFIGURATION*/ } as IWorkbenchConstructionOptions;

const windowIndicator: IWindowIndicator = {
    label: `$(eclipse-che) Eclipse Che`,
    tooltip: 'Eclipse Che'
};

const statusBarColorCustomizations: { [colorId: string]: string } = {
    // use colors from che logo: yellow/#FDB940 and blue/#525C86
    'statusBarItem.remoteBackground': '#FDB940',
    'statusBarItem.remoteForeground': '#525C86',
}

const configurationDefaults: Record<string, any> = {
    'workbench.colorTheme': 'Dark',
    'workbench.colorCustomizations': statusBarColorCustomizations
}

const initialColorTheme: IInitialColorTheme = {
    themeType: ColorScheme.DARK,
    colors: statusBarColorCustomizations
}

// the configuration should be applied if built time configuration is not handled
// the values are the same as in the workbench-config.json file
const defaultWorkbenchConfiguration = {
    windowIndicator,
    configurationDefaults,
    initialColorTheme
};

export function getCheConfig(): IWorkbenchConstructionOptions {
    if (Object.keys(workbenchConfiguration).length === 0) {
        Object.assign(workbenchConfiguration, defaultWorkbenchConfiguration);
    }
    return workbenchConfiguration;
}
