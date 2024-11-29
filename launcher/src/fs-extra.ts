/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/**
 * This is a wrapper to comfortable using `fs` package like `fs-extra`.
 * Why do we need to add the wrapper:
 *   - it allows to get rid of using `fs-extra` package
 *   - it allows to use common `node_modules` directory for launcher and VS Code
 *   - it simplifies writing tests and allows to easily mock this module
 */

import * as fs from 'fs';

export async function readFile(file: string): Promise<string> {
  return fs.readFileSync(file, 'utf8');
}

export async function writeFile(file: string, content: string): Promise<void> {
  fs.writeFileSync(file, content, 'utf8');
}

export async function pathExists(path: string): Promise<boolean> {
  return fs.existsSync(path);
}

export async function readdir(path: string): Promise<string[]> {
  return fs.readdirSync(path);
}

export async function isFile(path: string): Promise<boolean> {
  return fs.statSync(path).isFile();
}

export async function mkdir(path: string): Promise<void> {
  fs.mkdirSync(path, {
    recursive: true,
  });
}

export async function fileExists(file: string | undefined): Promise<boolean> {
  if (file && (await pathExists(file)) && (await isFile(file))) {
    return true;
  }

  return false;
}
