/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/*
 * This file was generated using AI assistance (Cursor AI)
 * and reviewed by the maintainers.
 */
import * as path from 'node:path';
import esbuild from 'esbuild';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

const oidcAuthPlugin: esbuild.Plugin = {
	name: 'replace-oidc-auth',
	setup(build) {
		build.onResolve({ filter: /\/oidc_auth(\.js)?$/ }, () => ({
			path: path.resolve(import.meta.dirname, 'src', 'shims', 'oidc-auth.ts'),
		}));
	},
};

run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		external: ['vscode', 'bufferutil', 'utf-8-validate'],
		plugins: [oidcAuthPlugin],
	},
}, process.argv);
