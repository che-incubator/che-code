/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { FILE_WORKBENCH, FILE_WORKBENCH_WEB_MAIN, FILE_EXTENSION_HOST_PROCESS } from './files.js';

const FILES_TO_COMPRESS = [FILE_WORKBENCH, FILE_WORKBENCH_WEB_MAIN, FILE_EXTENSION_HOST_PROCESS];

export class PostPatchCompression {
  async compress(): Promise<void> {
    console.log('# Compressing patched static assets...');
    const startTotal = Date.now();

    for (const file of FILES_TO_COMPRESS) {
      const start = Date.now();
      const gzFile = file + '.gz';
      await pipeline(createReadStream(file), createGzip({ level: 1 }), createWriteStream(gzFile));
      console.log(`  > ${gzFile} created in ${Date.now() - start}ms`);
    }

    console.log(`  > total compression time: ${Date.now() - startTotal}ms`);
  }
}
