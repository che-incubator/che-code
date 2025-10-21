/**********************************************************************
 * Copyright (c) 2022-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

//@ts-check

'use strict';

import withDefaults from '../shared.webpack.config.mjs';

export default withDefaults({
	context: import.meta.dirname,
	resolve: {
		mainFields: ['module', 'main']
	},
	externals: {
		'bufferutil': 'commonjs bufferutil', // ignored
		'utf-8-validate': 'commonjs utf-8-validate', // ignored
	},
	entry: {
		extension: './src/extension.ts',
	}
});
