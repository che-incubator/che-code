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

import * as path from 'path';
import { env } from 'process';
import { CodeWorkspace } from '../src/code-workspace';

const WORKSPACE_JSON = `{
\t"folders": [
\t\t{
\t\t\t"name": "che-code",
\t\t\t"path": "/tmp/projects/che-code"
\t\t},
\t\t{
\t\t\t"name": "che-devfile-registry",
\t\t\t"path": "/tmp/projects/che-devfile-registry"
\t\t},
\t\t{
\t\t\t"name": "web-nodejs-sample",
\t\t\t"path": "/tmp/projects/web-nodejs-sample"
\t\t}
\t]
}`;

const WORKSPACE_WITH_ONE_PROJECT = `{
\t"folders": [
\t\t{
\t\t\t"name": "web-nodejs-sample",
\t\t\t"path": "/tmp/projects/web-nodejs-sample"
\t\t}
\t]
}`;

const WORKSPACE_WITH_FIVE_PROJECTS = `{
\t"folders": [
\t\t{
\t\t\t"name": "che-code",
\t\t\t"path": "/tmp/projects/che-code"
\t\t},
\t\t{
\t\t\t"name": "che-devfile-registry",
\t\t\t"path": "/tmp/projects/che-devfile-registry"
\t\t},
\t\t{
\t\t\t"name": "web-nodejs-sample",
\t\t\t"path": "/tmp/projects/web-nodejs-sample"
\t\t},
\t\t{
\t\t\t"name": "web-java-spring-petclinic",
\t\t\t"path": "/tmp/projects/web-java-spring-petclinic"
\t\t},
\t\t{
\t\t\t"name": "che-dashboard",
\t\t\t"path": "/tmp/projects/che-dashboard"
\t\t}
\t]
}`;

const WORKSPACE_WITH_DEPENDENT_PROJECTS = `{
\t"folders": [
\t\t{
\t\t\t"name": "che-code",
\t\t\t"path": "/tmp/projects/che-code"
\t\t},
\t\t{
\t\t\t"name": "che-devfile-registry",
\t\t\t"path": "/tmp/projects/che-devfile-registry"
\t\t},
\t\t{
\t\t\t"name": "web-nodejs-sample",
\t\t\t"path": "/tmp/projects/web-nodejs-sample"
\t\t},
\t\t{
\t\t\t"name": "dependent-project",
\t\t\t"path": "/tmp/projects/dependent-project"
\t\t}
\t]
}`;

describe('Test generating VS Code Workspace file:', () => {

  const originalReadFile = fs.readFile;

  beforeEach(() => {
    delete env.PROJECTS_ROOT;
    delete env.DEVWORKSPACE_FLATTENED_DEVFILE;
    delete env.VSCODE_DEFAULT_WORKSPACE;

    Object.assign(fs, {
      pathExists: jest.fn(),
      isFile: jest.fn(),
      writeFile: jest.fn(),
      readFile: jest.fn(),
    });
  });

  test('should return if env.PROJECTS_ROOT is not set', async () => {
    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test('should create default .code-workspace file', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.yaml');

    const pathExistsMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      return undefined;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read only flattened.devworkspace.yaml
    expect(readFileMock).toBeCalledTimes(1);

    expect(writeFileMock).toBeCalledWith('/tmp/projects/.code-workspace', WORKSPACE_JSON);
  });

  test('should update default .code-workspace file', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      '_data',
      'flattened.devworkspace.with-five-projects.yaml'
    );

    const pathExistsMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();
    const isFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
      isFile: isFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      if (path === '/tmp/projects/.code-workspace') {
        return WORKSPACE_JSON;
      }

      return undefined;
    });

    pathExistsMock.mockImplementation((path) => {
      return '/tmp/projects/.code-workspace' === path;
    });

    isFileMock.mockImplementation((path) => {
      return '/tmp/projects/.code-workspace' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read flattened.devworkspace.yaml and workspace file
    expect(readFileMock).toBeCalledTimes(2);

    expect(writeFileMock).toBeCalledWith('/tmp/projects/.code-workspace', WORKSPACE_WITH_FIVE_PROJECTS);
  });

  test('should not update default .code-workspace file', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.yaml');

    const pathExistsMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();
    const isFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
      isFile: isFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      if (path === '/tmp/projects/.code-workspace') {
        return WORKSPACE_JSON;
      }

      return undefined;
    });

    pathExistsMock.mockImplementation((path) => {
      return '/tmp/projects/.code-workspace' === path;
    });

    isFileMock.mockImplementation((path) => {
      return '/tmp/projects/.code-workspace' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read flattened.devworkspace.yaml and workspace file
    expect(readFileMock).toBeCalledTimes(2);

    // should not update workspace file due to missing changes
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('should update extsting workspace file defined by env.VSCODE_DEFAULT_WORKSPACE', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';
    env.VSCODE_DEFAULT_WORKSPACE = '/tmp/custom.code-workspace-file';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      '_data',
      'flattened.devworkspace.with-five-projects.yaml'
    );

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === '/tmp/custom.code-workspace-file') {
        return WORKSPACE_JSON;
      }

      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      return undefined;
    });

    pathExistsMock.mockImplementation((path) => {
      return '/tmp/custom.code-workspace-file' === path;
    });

    isFileMock.mockImplementation((path) => {
      return '/tmp/custom.code-workspace-file' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(isFileMock).toBeCalledTimes(1);

    expect(pathExistsMock).toBeCalledWith('/tmp/custom.code-workspace-file');
    expect(isFileMock).toBeCalledWith('/tmp/custom.code-workspace-file');

    expect(writeFileMock).toBeCalledWith('/tmp/custom.code-workspace-file', WORKSPACE_WITH_FIVE_PROJECTS);
  });

  test('should return if env.VSCODE_DEFAULT_WORKSPACE points on a wrong location', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';
    env.VSCODE_DEFAULT_WORKSPACE = '/tmp/test.code-workspace';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.yaml');

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      return undefined;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(1);

    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('if workspace contains only one project, should find and use predefined workspace file', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.with-one-project.yaml');

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      if ('/tmp/projects/web-nodejs-sample/.code-workspace' === path) {
        return WORKSPACE_WITH_ONE_PROJECT;
      }

      return undefined;
    });

    pathExistsMock.mockImplementation(async (path) => {
      return '/tmp/projects/web-nodejs-sample/.code-workspace' === path;
    });

    isFileMock.mockImplementation(async (path) => {
      return '/tmp/projects/web-nodejs-sample/.code-workspace' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    const workspaceFile = await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(isFileMock).toBeCalledTimes(1);
    expect(readFileMock).toBeCalledTimes(2);
    expect(writeFileMock).not.toHaveBeenCalled();

    expect(workspaceFile).toEqual('/tmp/projects/web-nodejs-sample/.code-workspace');
  });

  test('should create .code-workspace file including dependentProjects', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'dependentProjects.devworkspace.yaml');

    const pathExistsMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(path);
      }

      return undefined;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read only dependentProjects.devworkspace.yaml
    expect(readFileMock).toBeCalledTimes(1);
    expect(readFileMock).toBeCalledWith(env.DEVWORKSPACE_FLATTENED_DEVFILE);

    expect(writeFileMock).toBeCalledWith('/tmp/projects/.code-workspace', WORKSPACE_WITH_DEPENDENT_PROJECTS);
  });

  test('should parse .code-workspace file if the file has extra characters', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.yaml');
    env.VSCODE_DEFAULT_WORKSPACE = path.join(__dirname, '_data', 'test.code-workspace');

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();
    const writeFileMock = jest.fn();
    const readFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
      writeFile: writeFileMock,
      readFile: readFileMock,
    });

    readFileMock.mockImplementation(async (path) => {
      if (path === env.DEVWORKSPACE_FLATTENED_DEVFILE || path === env.VSCODE_DEFAULT_WORKSPACE) {
        return originalReadFile(path);
      }

      return undefined;
    });

    pathExistsMock.mockImplementation(async (path) => {
      return env.VSCODE_DEFAULT_WORKSPACE === path;
    });

    isFileMock.mockImplementation(async (path) => {
      return env.VSCODE_DEFAULT_WORKSPACE === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read flattened.devworkspace.yaml
    expect(readFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE);
    expect(readFileMock).toBeCalledWith(env.DEVWORKSPACE_FLATTENED_DEVFILE);

    // shpuld update existing workspace file
    expect(writeFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE, WORKSPACE_JSON);
  });
});
