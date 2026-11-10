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

import workbenchConfig from '../../../src/vs/code/browser/workbench/che/workbench-config.json' with { type: 'json' };

let workbenchConfigReplacement: string | undefined;

/**
 * Replaces the workbench configuration build marker (consumed by
 * workbench-che-config.ts) in the given file contents with the Che
 * workbench configuration, so that esbuild does not strip it as a
 * non-legal comment. Returns the new contents, or `undefined` when
 * the marker is not present.
 */
export function injectWorkbenchConfiguration(contents: string): string | undefined {
	if (!contents.includes('/*BUILD->INSERT_WORKBENCH_CONFIGURATION*/')) {
		return undefined;
	}
	if (workbenchConfigReplacement === undefined) {
		const workbenchConfiguration = JSON.stringify({ ...workbenchConfig });
		// Remove the outer braces since the placeholder is inside an object literal
		workbenchConfigReplacement = workbenchConfiguration.substring(1, workbenchConfiguration.length - 1);
	}
	return contents.replace('/*BUILD->INSERT_WORKBENCH_CONFIGURATION*/', () => workbenchConfigReplacement!);
}
