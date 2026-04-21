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

/*
 * This file was generated using AI assistance (Cursor AI)
 * and reviewed by the maintainers.
 */

import { ApiProposalName, allApiProposals } from "../../../../../platform/extensions/common/extensionsApiProposals.js";
import { ILogService } from "../../../../../platform/log/common/log.js";

function normalizeProposedApiName(name: string): ApiProposalName {
    const match = /^(.+?)@\d+$/.exec(name);
    return (match ? match[1] : name) as ApiProposalName;
}

export function normalizeAndFilterProposals(
    logService: ILogService,
    key: string,
    proposals: readonly string[]
): ApiProposalName[] {
    const normalizedProposals: ApiProposalName[] = [];
    for (const name of proposals) {
        const normalizedName = normalizeProposedApiName(name);
        const result = Boolean(allApiProposals[normalizedName]);
        if (!result) {
            logService.error(`Extension '${key}' wants API proposal '${name}' but that proposal DOES NOT EXIST. Likely, the proposal has been finalized (check 'vscode.d.ts') or was abandoned.`);
            continue;
        }
        if (!normalizedProposals.includes(normalizedName)) {
            normalizedProposals.push(normalizedName);
        }
    }
    return normalizedProposals;
}
