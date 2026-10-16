/**********************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as nodeFs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as fs from '../src/fs-extra';

const PRISTINE = 'id={{ID}} url={{URL}}';

describe('Test reading patchable files:', () => {
  let file: string;

  beforeEach(() => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'launcher-'));
    file = path.join(dir, 'workbench.js');
    nodeFs.writeFileSync(file, PRISTINE);
  });

  // Each start runs in a new process: give it a fresh copy of the module
  async function newStart(): Promise<typeof fs> {
    let module: typeof fs | undefined;
    await jest.isolateModulesAsync(async () => {
      module = await import('../src/fs-extra');
    });
    return module!;
  }

  async function patch(module: typeof fs, mask: string, value: string): Promise<void> {
    const content = await module.readPatchable(file);
    await module.writeFile(file, content.replace(mask, value));
  }

  test('should keep a pristine copy on the first read', async () => {
    const module = await newStart();

    expect(await module.readPatchable(file)).toBe(PRISTINE);
    expect(nodeFs.readFileSync(`${file}.orig`, 'utf8')).toBe(PRISTINE);
  });

  test('should apply every patcher of the same start', async () => {
    const module = await newStart();
    await patch(module, '{{ID}}', 'ws-1');
    await patch(module, '{{URL}}', 'https://open-vsx.org');

    expect(nodeFs.readFileSync(file, 'utf8')).toBe('id=ws-1 url=https://open-vsx.org');
  });

  test('should patch from the pristine copy on the next start', async () => {
    const first = await newStart();
    await patch(first, '{{ID}}', 'ws-1');
    await patch(first, '{{URL}}', 'https://open-vsx.org');

    const second = await newStart();
    await patch(second, '{{ID}}', 'ws-2');
    await patch(second, '{{URL}}', 'https://registry.example.com');

    expect(nodeFs.readFileSync(file, 'utf8')).toBe('id=ws-2 url=https://registry.example.com');
  });

  test('should ignore a copy left by an interrupted start', async () => {
    nodeFs.writeFileSync(`${file}.orig.tmp`, 'id=trunc');
    const module = await newStart();

    expect(await module.readPatchable(file)).toBe(PRISTINE);
    expect(nodeFs.readFileSync(`${file}.orig`, 'utf8')).toBe(PRISTINE);
  });
});

describe('Test that patchers read through readPatchable:', () => {
  const SRC = path.resolve(__dirname, '..', 'src');
  const sources = nodeFs
    .readdirSync(SRC)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, content: nodeFs.readFileSync(path.join(SRC, name), 'utf8') }));

  test('should only import fs in the helpers', () => {
    const importers = sources.filter((s) => /from 'fs(\/promises)?'/.test(s.content)).map((s) => s.name);

    expect(importers.sort()).toEqual(['fs-extra.ts', 'post-patch-compression.ts']);
  });

  // Reads of files outside the assembly. A file the launcher patches must be read with readPatchable,
  // otherwise its masks are gone from the second start on and the new values are silently ignored.
  test('should only use readFile for files that are not patched', () => {
    const reads = Object.fromEntries(
      sources.map((s) => [s.name, (s.content.match(/fs\.readFile\(/g) || []).length]).filter(([, count]) => count)
    );

    expect(reads).toEqual({
      'code-workspace.ts': 1, // workspace file
      'editor-configurations.ts': 2, // remote settings, workspace file
      'flattened-devfile.ts': 1, // devfile
      'local-storage-key-provider.ts': 1, // public key
      'node-extra-certificate.ts': 3, // certificates
    });
  });
});
