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

export const WorkspaceService = Symbol('WorkspaceService');
export interface WorkspaceService {
    getNamespace(): Promise<string>;
    getWorkspaceId(): Promise<string>;
    stop(): Promise<void>;
}
