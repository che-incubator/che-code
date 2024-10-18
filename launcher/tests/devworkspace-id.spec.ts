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
import { env } from 'process';

import { DevWorkspaceId } from '../src/devworkspace-id';

const ORIGIN_WORKBENCH = `
some code, some code, a mask to be replaced https://{{che-cluster}}.{{host}}/{{namespace}}/{{workspace-name}}/{{port}}/, some code
`;

const NEW_WORKBENCH = `
some code, some code, a mask to be replaced test-workspace-1234567890, some code
`;

describe('Test setting DevWorkspace ID to VS Code', () => {
  beforeEach(() => {
    delete env.DEVWORKSPACE_ID;
  });

  test('should return if env.DEVWORKSPACE_ID is not set', async () => {
    const readFileMock = jest.fn();
    Object.assign(fs, {
      readFile: readFileMock,
    });

    const devWorkspaceId = new DevWorkspaceId();
    await devWorkspaceId.configure();

    expect(readFileMock).toBeCalledTimes(0);
  });

  test('should apply env.DEVWORKSPACE_ID', async () => {
    env.DEVWORKSPACE_ID = 'test-workspace-1234567890';

    const readFileMock = jest.fn();
    const writeFileMock = jest.fn();

    Object.assign(fs, {
      readFile: readFileMock,
      writeFile: writeFileMock,
    });

    readFileMock.mockImplementation(() => ORIGIN_WORKBENCH);

    const devWorkspaceId = new DevWorkspaceId();
    await devWorkspaceId.configure();

    expect(readFileMock).toBeCalledTimes(1);
    expect(writeFileMock).toBeCalledWith('out/vs/code/browser/workbench/workbench.js', NEW_WORKBENCH);
  });
});
