/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from '../src/fs-extra';
import { LocalstorageKeyProvider } from '../src/local-storage-key-provider';

const ORIGIN_WORKBENCH_FILE = `
some code, some code, a mask to be replaced {{LOCAL-STORAGE}}/{{SECURE-KEY}}, some code
`;

const NEW_WORKBENCH_FILE = `
some code, some code, a mask to be replaced 1234567890ABCDEFGHIJKLMNOPQRSTUV, some code
`;

describe('Test setting of Local Storage public key to VS Code', () => {
  beforeEach(() => {
    Object.assign(fs, {
      pathExists: jest.fn(),
      isFile: jest.fn(),
      readdir: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
    });
  });

  test('should return if env.DEVWORKSPACE_ID is not set', async () => {
    const pathExistsMock = jest.fn();
    const readdirMock = jest.fn();
    const isFileMock = jest.fn();
    const readFileMock = jest.fn();
    const writeFileMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
      readdir: readdirMock,
      isFile: isFileMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
    });

    pathExistsMock.mockImplementation(async (path: string) => {
      console.log(`> is path exist ${path}`);

      return '/etc/ssh' === path || '/etc/ssh/first-key.pub' === path;
    });

    readdirMock.mockImplementation(async (path: string) => {
      return ['first-key', 'second-key', 'first-key.pub', 'second-key.pub'];
    });

    isFileMock.mockImplementation(async (path: string) => {
      console.log(`> is file ${path}`);

      return '/etc/ssh/first-key' === path || '/etc/ssh/first-key.pub' === path;
    });

    readFileMock.mockImplementation(async (file: string) => {
      switch (file) {
        case '/etc/ssh/first-key.pub':
          return 'ssh-rsa 1111222233334444555566667777888899990000AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLLMMMMNNNNOOOOPPPPQQQQRRRRSSSSTTTTUUUUVVVVWWWWXXXXYYYYZZZZ';
        case 'out/vs/code/browser/workbench/workbench.js':
          return ORIGIN_WORKBENCH_FILE;
      }
    });

    const localStorageKeyProvider = new LocalstorageKeyProvider();
    await localStorageKeyProvider.configure();

    expect(pathExistsMock).toBeCalled();
    expect(writeFileMock).toBeCalledWith('out/vs/code/browser/workbench/workbench.js', NEW_WORKBENCH_FILE);
  });
});
