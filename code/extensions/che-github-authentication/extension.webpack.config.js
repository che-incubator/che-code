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
import webpack from 'webpack';
import { merge } from 'webpack-merge';

const config = withDefaults({
    context: import.meta.dirname,
    resolve: {
        mainFields: ['module', 'main'],
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

export default merge(config, {
    module: {
        rules: [
            {
                test: /\.m?js$/,
                resolve: {
                    fullySpecified: false, // This avoids the issue with the devfile/api extension requirement
                },
            }
        ]
    }
});
