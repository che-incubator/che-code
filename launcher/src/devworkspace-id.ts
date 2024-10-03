/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from 'process';
import { FILE_WORKBENCH } from './files.js';
import * as fs from './fs-extra.js';

const DEVWORKSPACE_ID_MASK = 'https://{{che-cluster}}.{{host}}/{{namespace}}/{{workspace-name}}/{{port}}/';

export class DevWorkspaceId {
  async configure(): Promise<void> {
    console.log('# Setting curent DevWorkspace ID to che-code...');

    if (!env.DEVWORKSPACE_ID) {
      console.log('  > env.DEVWORKSPACE_ID is not set, skip this step');
      return;
    }

    console.log(`  > apply DevWorkspace ID [${env.DEVWORKSPACE_ID}]`);

    try {
      await this.update(FILE_WORKBENCH, DEVWORKSPACE_ID_MASK, env.DEVWORKSPACE_ID);
    } catch (err) {
      console.error(`${err.message} Webviews will not work if CDN disabled.`);
    }
  }

  async update(file: string, text: string, newText: string): Promise<void> {
    const content = await fs.readFile(file);
    const newContent = content.replace(text, newText);
    await fs.writeFile(file, newContent);
  }
}
