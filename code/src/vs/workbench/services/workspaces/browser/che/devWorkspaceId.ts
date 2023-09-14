/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// NOTE: DO NOT CHANGE. Launcher updates this constant on workspace startup
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
const DEVWORKSPACE = "https://{{che-cluster}}.{{host}}/{{namespace}}/{{workspace-name}}/{{port}}/";

export function getDevWorkspaceId(): string | undefined {
    // checking for "https://" guarantees we apply here the ID set by che-code launcher
    if (DEVWORKSPACE && !DEVWORKSPACE.startsWith("https://")) {
        return DEVWORKSPACE;
    }

    return undefined;
}
