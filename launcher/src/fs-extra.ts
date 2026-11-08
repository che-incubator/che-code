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

// Files that got a .orig, relative to the assembly: the volume drops it with the assembly on a new version
const PATCHED_FILES = '.patched-files';

const restored = new Set<string>();

// Copy then rename: a start killed mid-copy must not leave a truncated file behind
function copyAtomic(from: string, to: string): void {
  fs.copyFileSync(from, `${to}.tmp`);
  fs.renameSync(`${to}.tmp`, to);
}

function restore(file: string): void {
  const orig = `${file}.orig`;
  if (fs.existsSync(orig)) {
    copyAtomic(orig, file);
  } else {
    copyAtomic(file, orig);
  }
  restored.add(file);
}

/**
 * Restores every file patched by a previous start, before any patcher runs.
 * A patcher disabled on this start does not read its files: without this, they would keep the previous values.
 */
export async function restorePatchables(): Promise<void> {
  if (fs.existsSync(PATCHED_FILES)) {
    new Set(fs.readFileSync(PATCHED_FILES, 'utf8').split('\n').filter(Boolean)).forEach(restore);
  }
}

/**
 * Reads a file of the assembly that the launcher patches in place.
 * The assembly persists between starts, so the first read in this process restores the file
 * from `<file>.orig` (created on first use): every start patches the content of the image.
 * Later reads in the same process return the file with the previous patchers' changes.
 */
export async function readPatchable(file: string): Promise<string> {
  if (!restored.has(file)) {
    restore(file);
    fs.appendFileSync(PATCHED_FILES, `${file}\n`);
  }
  return readFile(file);
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
