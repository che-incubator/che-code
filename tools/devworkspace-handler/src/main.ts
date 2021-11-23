/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from 'fs-extra';
import { Generate } from './generate';

import { InversifyBinding } from './inversify/inversify-binding';

export class Main {
  protected async doStart(): Promise<void> {
    let devfilePath: string | undefined;
    let outputFile: string | undefined;
    let editorPath: string | undefined;
    const args = process.argv.slice(2);
    args.forEach(arg => {
      if (arg.startsWith('--devfile-path:')) {
        devfilePath = arg.substring('--devfile-path:'.length);
      }
      if (arg.startsWith('--editor-path:')) {
        editorPath = arg.substring('--editor-path:'.length);
      }
      if (arg.startsWith('--output-file:')) {
        outputFile = arg.substring('--output-file:'.length);
      }
    });
    if (!editorPath) {
      throw new Error('missing --editor-path: parameter');
    }
    if (!devfilePath) {
      throw new Error('missing --devfile-path: parameter');
    }
    if (!outputFile) {
      throw new Error('missing --output-file: parameter');
    }

    const inversifyBinbding = new InversifyBinding();
    const container = await inversifyBinbding.initBindings({
      insertDevWorkspaceTemplatesAsPlugin: true,
    });
    container.bind(Generate).toSelf().inSingletonScope();

    const devfileContent = await fs.readFile(devfilePath);
    const editorContent = await fs.readFile(editorPath);

    const generate = container.get(Generate);
    return generate.generate(devfileContent, editorContent, outputFile);
  }

  async start(): Promise<boolean> {
    try {
      await this.doStart();
      return true;
    } catch (error) {
      console.error('stack=' + error.stack);
      console.error('Unable to start', error);
      return false;
    }
  }
}
