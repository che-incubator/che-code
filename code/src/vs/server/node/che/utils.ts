/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { delimiter } from 'vs/base/common/path';

export function getResolvedPathEnvVar(currentPath: string, processEnvPath?: string): string {
    if (processEnvPath) {
        const currentPathArray: string[] = currentPath.split(delimiter);
        const processEnvPathArray: string[] = processEnvPath.split(delimiter);
        const processPathUniqueItems = processEnvPathArray.filter(path => !currentPathArray.includes(path));
        return processPathUniqueItems.length > 0 ? currentPath + delimiter + processPathUniqueItems.join(delimiter) : currentPath;
    }
    return currentPath;
}
