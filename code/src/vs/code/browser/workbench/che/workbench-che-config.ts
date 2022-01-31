
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
import { IInitialColorTheme, IWindowIndicator, IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.main';

export function getCheConfig(): IWorkbenchConstructionOptions {

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

    return { windowIndicator, configurationDefaults, initialColorTheme };
}
