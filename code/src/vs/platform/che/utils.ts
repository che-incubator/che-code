/**********************************************************************
 * Copyright (c) 2024-2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { delimiter } from '../../base/common/path.js';

/**
 * Merges the provided values. The first parameter is taken as the basis.
 * Items from the second parameter are appended to the main value, duplicates are filtered out.
 * For example:
 * - the first parameter is: "/checode/checode-linux-libc/ubi9/bin/remote-cli:/usr/local/bin:/usr/bin" 
 * - the second parameter is: "/go/bin:/usr/bin"
 * - the function returns: "/checode/checode-linux-libc/ubi9/bin/remote-cli:/usr/local/bin:/usr/bin:/go/bin",
 * - note: "/usr/bin" is filtered out to avoud duplicates in the returned value 
 * 
 * @param currentPath current value of the PATH env variable
 * @param processEnvPath value of the process.env.PATH env variable 
 * @returns
 * - merged value for the given parameters 
 * - currentPath if processEnvPath is not provided (undefined or empty string) 
 */
export function getResolvedPathEnvVar(currentPath: string, processEnvPath?: string): string {
	if (processEnvPath) {
		const currentPathArray: string[] = currentPath.split(delimiter);
		const processEnvPathArray: string[] = processEnvPath.split(delimiter);
		const processPathUniqueItems = processEnvPathArray.filter(path => !currentPathArray.includes(path));
		return processPathUniqueItems.length > 0 ? currentPath + delimiter + processPathUniqueItems.join(delimiter) : currentPath;
	}
	return currentPath;
}

/*
 * The following logic was generated using AI assistance (Cursor AI)
 * and reviewed by the maintainers.
 */
export type LdSanitizeScope = 'all' | 'none' | 'shellEnv' | 'terminal';

const allLdLibPrefixes = new Set<string>([
	'/checode/checode-linux-libc/ubi8/ld_libs',
	'/checode/checode-linux-libc/ubi9/ld_libs/core',
	'/checode/checode-linux-libc/ubi9/ld_libs/openssl'
]);

export function getLdSanitizeScope(): LdSanitizeScope {
	const scope = process.env['LD_SANITIZE_SCOPE'];
	if (scope === 'all' || scope === 'none' || scope === 'shellEnv' || scope === 'terminal') {
		return scope;
	}
	return 'terminal';
}

export function shouldStripLdLibraryPathForShellEnv(): boolean {
	const scope = getLdSanitizeScope();
	return scope === 'all' || scope === 'shellEnv';
}

export function shouldStripLdLibraryPathForTerminal(): boolean {
	const scope = getLdSanitizeScope();
	return scope === 'all' || scope === 'terminal';
}

export function stripLdLibraryPath(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const filtered = value
		.split(':')
		.map(entry => entry.trim())
		.filter(entry => entry.length > 0 && !allLdLibPrefixes.has(entry));

	return filtered.length > 0 ? filtered.join(':') : undefined;
}

export function sanitizeLdLibraryPathInEnvironment(
	environment: NodeJS.ProcessEnv,
	logger?: (message: string) => void,
	source = 'unknown'
): void {
	const before = environment['LD_LIBRARY_PATH'];
	const sanitizedLdLibraryPath = stripLdLibraryPath(environment['LD_LIBRARY_PATH']);
	if (sanitizedLdLibraryPath) {
		environment['LD_LIBRARY_PATH'] = sanitizedLdLibraryPath;
	} else {
		delete environment['LD_LIBRARY_PATH'];
	}
	logger?.(`[che-code][ld-sanitize][${source}] scope=${getLdSanitizeScope()} before=${before ?? '<unset>'} after=${environment['LD_LIBRARY_PATH'] ?? '<unset>'}`);
}
