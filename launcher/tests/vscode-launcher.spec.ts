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
import * as os from 'os';

import * as fs from '../src/fs-extra';
import { spawn, execSync } from 'child_process';

import { VSCodeLauncher } from '../src/vscode-launcher';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
  spawn: jest.fn(),
}));

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  userInfo: jest.fn(() => ({ shell: '/sbin/nologin' })),
}));

describe('Test VS Code launcher:', () => {
  beforeEach(() => {
    delete env.VSCODE_NODEJS_RUNTIME_DIR;
    delete env.PROJECTS_ROOT;
    delete env.PROJECT_SOURCE;
    delete env.VSCODE_DEFAULT_WORKSPACE;
    delete env.NODE_EXTRA_CA_CERTS;
    delete env.SHELL;
    delete env.HOSTNAME;
    delete env.DEVWORKSPACE_POD_NAME;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should fail if env.VSCODE_NODEJS_RUNTIME_DIR is not set', async () => {
    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    const launcher = new VSCodeLauncher();

    try {
      await launcher.launch();
    } catch (error) {
      expect(error.message).toBe(
        'Failed to launch VS Code. VSCODE_NODEJS_RUNTIME_DIR environment variable is not set.'
      );
    }

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test('should fail if env.PROJECTS_ROOT is not set', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    const launcher = new VSCodeLauncher();

    try {
      await launcher.launch();
    } catch (error) {
      expect(error.message).toBe('Failed to launch VS Code. PROJECTS_ROOT environment variable is not set.');
    }

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test('should launch VS Code with /projects/.code-workspace workspace file and Node extra certificate', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';
    env.SHELL = '/bin/testshell';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    pathExistsMock.mockImplementation(async (path) => {
      return '/tmp/node-extra-certificates/ca.crt' === path;
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    spawnMock.mockImplementation(() => ({
      on: jest.fn(),
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch('/tmp/projects/.code-workspace');

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(pathExistsMock).toBeCalledWith('/tmp/node-extra-certificates/ca.crt');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-workspace',
      '/tmp/projects/.code-workspace',
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).toBe('/tmp/node-extra-certificates/ca.crt');
  });

  test('should launch VS Code, use env.PROJECT_SOURCE as default folder and not use Node extra certificate', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';

    env.PROJECTS_ROOT = '/tmp/projects';
    env.PROJECT_SOURCE = '/tmp/projects/sample-project';
    env.SHELL = '/bin/testshell';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    spawnMock.mockImplementation(() => ({
      on: jest.fn(),
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch();

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(pathExistsMock).toBeCalledWith('/tmp/node-extra-certificates/ca.crt');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-folder',
      '/tmp/projects/sample-project',
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).not.toBeDefined();
  });

  test('should fail when trying to use env.PROJECT_SOURCE but the variable is not set', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';

    Object.assign(fs, {
      pathExists: jest.fn(),
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    spawnMock.mockImplementation(() => ({
      on: jest.fn(),
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
    }));

    const launcher = new VSCodeLauncher();
    try {
      await launcher.launch();
      fail();
    } catch (error) {
      expect(error.message).toBe('Failed to launch VS Code. PROJECT_SOURCE environment variable is not set.');
      expect(spawnMock).not.toBeCalled();
    }
  });

  test('should use SHELL env var when launching Code if set', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';
    env.SHELL = '/bin/testshell';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    const mainTreadEventEmitter = jest.fn();
    const stdoutEventEmitter = jest.fn();
    const stderrEventEmitter = jest.fn();

    spawnMock.mockImplementation(() => ({
      on: mainTreadEventEmitter,
      stdout: {
        on: stdoutEventEmitter,
      },
      stderr: {
        on: stderrEventEmitter,
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch('/tmp/.code-workspace');

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(pathExistsMock).toBeCalledWith('/tmp/node-extra-certificates/ca.crt');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-workspace',
      '/tmp/.code-workspace',
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).not.toBeDefined();

    expect(mainTreadEventEmitter).toBeCalledWith('close', expect.any(Function));
    expect(stdoutEventEmitter).toBeCalledWith('data', expect.any(Function));
    expect(stderrEventEmitter).toBeCalledWith('data', expect.any(Function));
  });

  test('should set SHELL env var to /bin/bash if unset and bash is installed', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const execSyncMock = jest.fn(() => '');
    const spawnMock = jest.fn();

    (spawn as jest.Mock).mockImplementation(spawnMock);
    (execSync as jest.Mock).mockImplementation(execSyncMock);

    const mainTreadEventEmitter = jest.fn();
    const stdoutEventEmitter = jest.fn();
    const stderrEventEmitter = jest.fn();

    spawnMock.mockImplementation(() => ({
      on: mainTreadEventEmitter,
      stdout: {
        on: stdoutEventEmitter,
      },
      stderr: {
        on: stderrEventEmitter,
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch('/tmp/.code-workspace');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-workspace',
      '/tmp/.code-workspace',
    ]);

    expect(env.SHELL).toEqual('/bin/bash');
  });

  test('should set SHELL env var to /bin/sh if unset and bash is not installed', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const execSyncMock = jest.fn(() => {
      throw Error('test error');
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);
    (execSync as jest.Mock).mockImplementation(execSyncMock);

    const mainTreadEventEmitter = jest.fn();
    const stdoutEventEmitter = jest.fn();
    const stderrEventEmitter = jest.fn();

    spawnMock.mockImplementation(() => ({
      on: mainTreadEventEmitter,
      stdout: {
        on: stdoutEventEmitter,
      },
      stderr: {
        on: stderrEventEmitter,
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch('/tmp/.code-workspace');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-workspace',
      '/tmp/.code-workspace',
    ]);

    expect(env.SHELL).toEqual('/bin/sh');
  });

  test('should not set SHELL env var if unset and /etc/passwd has a shell', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';

    (os.userInfo as jest.Mock).mockImplementationOnce(() => ({
      shell: '/bin/zsh',
    }));

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const execSyncMock = jest.fn(() => {
      throw Error('test error');
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);
    (execSync as jest.Mock).mockImplementation(execSyncMock);

    const mainTreadEventEmitter = jest.fn();
    const stdoutEventEmitter = jest.fn();
    const stderrEventEmitter = jest.fn();

    spawnMock.mockImplementation(() => ({
      on: mainTreadEventEmitter,
      stdout: {
        on: stdoutEventEmitter,
      },
      stderr: {
        on: stderrEventEmitter,
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch('/tmp/.code-workspace');

    expect(spawnMock).toBeCalledWith('/tmp/vscode-nodejs-runtime/node', [
      'out/server-main.js',
      '--host',
      '127.0.0.1',
      '--port',
      '3100',
      '--without-connection-token',
      '--default-workspace',
      '/tmp/.code-workspace',
    ]);

    expect(env.SHELL).toBe(undefined);
  });

  test('should set DEVWORKSPACE_POD_NAME env var if HOSTNAME env var is set', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';
    env.PROJECT_SOURCE = '/tmp/projects/sample-project';
    env.SHELL = '/bin/testshell';

    env.HOSTNAME = 'test-host';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    spawnMock.mockImplementation(() => ({
      on: jest.fn(),
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch();

    expect(env.DEVWORKSPACE_POD_NAME).toBe('test-host');
  });

  test('should not set DEVWORKSPACE_POD_NAME env var if HOSTNAME env var is missing', async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = '/tmp/vscode-nodejs-runtime';
    env.PROJECTS_ROOT = '/tmp/projects';
    env.PROJECT_SOURCE = '/tmp/projects/sample-project';
    env.SHELL = '/bin/testshell';

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    (spawn as jest.Mock).mockImplementation(spawnMock);

    spawnMock.mockImplementation(() => ({
      on: jest.fn(),
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
    }));

    const launcher = new VSCodeLauncher();
    await launcher.launch();

    expect(env.DEVWORKSPACE_POD_NAME).toBe(undefined);
  });
});
