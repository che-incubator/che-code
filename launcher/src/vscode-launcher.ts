/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { userInfo } from 'os';
import { env } from 'process';
import * as fs from './fs-extra.js';

import * as child_process from 'child_process';

import { NODE_EXTRA_CERTIFICATE } from './node-extra-certificate.js';

export class VSCodeLauncher {
  async launch(workspaceFile?: string): Promise<void> {
    console.log('# Launching VS Code...');

    if (!env.VSCODE_NODEJS_RUNTIME_DIR) {
      throw new Error('Failed to launch VS Code. VSCODE_NODEJS_RUNTIME_DIR environment variable is not set.');
    }

    if (!env.PROJECTS_ROOT) {
      throw new Error('Failed to launch VS Code. PROJECTS_ROOT environment variable is not set.');
    }

    const node = `${env.VSCODE_NODEJS_RUNTIME_DIR}/node`;

    const host = env.CODE_HOST || '127.0.0.1';

    const params = ['out/server-main.js', '--host', host, '--port', '3100', '--without-connection-token'];

    if (env.VSCODE_LOG_LEVEL) {
      params.push('--log', env.VSCODE_LOG_LEVEL);
    }

    if (workspaceFile) {
      params.push('--default-workspace', workspaceFile);
    } else {
      if (!env.PROJECT_SOURCE) {
        throw new Error('Failed to launch VS Code. PROJECT_SOURCE environment variable is not set.');
      }

      params.push('--default-folder', env.PROJECT_SOURCE);
    }

    if (!env.NODE_EXTRA_CA_CERTS && (await fs.pathExists(NODE_EXTRA_CERTIFICATE))) {
      env.NODE_EXTRA_CA_CERTS = NODE_EXTRA_CERTIFICATE;
    }

    if (!env.SHELL && userInfo().shell === '/sbin/nologin') {
      // The SHELL env var is not set. In this case, Code will attempt to read the appropriate shell from /etc/passwd,
      // which can cause issues when cri-o injects /sbin/nologin when starting containers. Instead, we'll check if bash
      // is installed, and use that.
      const shell = this.detectShell();
      console.log(`  > SHELL environment variable is not set. Setting it to ${shell}`);
      env.SHELL = shell;
    }

    if (env.HOSTNAME) {
      // The HOSTNAME env var is used to store name of the current pod.
      // But sometime it gets overwritten or even initialized to an empty value by the VS Code itself.
      // To get the pod name when needed, we have to copy its value to another env var.
      env.DEVWORKSPACE_POD_NAME = env.HOSTNAME;
      console.log(`  > Setting DEVWORKSPACE_POD_NAME environment variable to ${env.DEVWORKSPACE_POD_NAME}`);
    } else {
      console.log(
        `  > HOSTNAME environment variable is not set. Getting the information about the current pod may not be possible.`
      );
    }

    console.log(`  > Running: ${node}`);
    console.log(`  > Params: ${params}`);

    const run = child_process.spawn(node, params);

    run.stdout.on('data', (data: string) => {
      console.log(`${data}`);
    });

    run.stderr.on('data', (data: string) => {
      console.error(`${data}`);
    });

    run.on('close', (code: string) => {
      console.log(`VS Code process exited with code ${code}`);
    });
  }

  detectShell(): string {
    try {
      // Check if bash is installed
      child_process.execSync('command -v /bin/bash', {
        timeout: 500,
      });
      return '/bin/bash';
    } catch (error) {
      // bash not installed, fallback blindly to sh since it's at least better than /sbin/nologin
      return '/bin/sh';
    }
  }
}
