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

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const webpack = require('webpack');

module.exports = withDefaults({
	context: __dirname,
	resolve: {
		mainFields: ['module', 'main']
	},
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'bufferutil': 'commonjs bufferutil', // ignored
		'utf-8-validate': 'commonjs utf-8-validate', // ignored
	},
	plugins: [
		new webpack.ContextReplacementPlugin(/keyv/), // needs to exclude the package to ignore warnings https://github.com/jaredwray/keyv/issues/45
	],
});
