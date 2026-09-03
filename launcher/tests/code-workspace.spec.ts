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
import { CodeWorkspace, Workspace } from '../src/code-workspace';
import { Project } from '../src/flattened-devfile';

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

const WORKSPACE_WITH_CLONE_PATH = `{
\t"folders": [
\t\t{
\t\t\t"name": "web-nodejs-sample",
\t\t\t"path": "/tmp/projects/custom/clone/path/web-nodejs-sample"
\t\t}
\t]
}`;

const WORKSPACE_WITH_TWO_PROJECTS = `{
\t"folders": [
\t\t{
\t\t\t"name": "che-code",
\t\t\t"path": "/tmp/projects/che-code"
\t\t},
\t\t{
\t\t\t"name": "che-dashboard",
\t\t\t"path": "/tmp/projects/che-dashboard"
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

    pathExistsMock.mockImplementation((path) => {
      return (
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-nodejs-sample' === path
      );
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
      return (
        '/tmp/projects/.code-workspace' === path ||
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-java-spring-petclinic' === path ||
        '/tmp/projects/web-nodejs-sample' === path ||
        '/tmp/projects/che-dashboard' === path
      );
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
      return (
        '/tmp/projects/.code-workspace' === path ||
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-nodejs-sample' === path
      );
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
      return (
        '/tmp/custom.code-workspace-file' === path ||
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-nodejs-sample' === path ||
        '/tmp/projects/web-java-spring-petclinic' === path ||
        '/tmp/projects/che-dashboard' === path
      );
    });

    isFileMock.mockImplementation((path) => {
      return '/tmp/custom.code-workspace-file' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(6);
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
      return '/tmp/projects/web-nodejs-sample/.code-workspace' === path || '/tmp/projects/web-nodejs-sample' === path;
    });

    isFileMock.mockImplementation(async (path) => {
      return '/tmp/projects/web-nodejs-sample/.code-workspace' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    const workspaceFile = await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(2);
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

    pathExistsMock.mockImplementation(async (path) => {
      return (
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-nodejs-sample' === path ||
        '/tmp/projects/dependent-project' === path
      );
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
      return (
        env.VSCODE_DEFAULT_WORKSPACE === path ||
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-devfile-registry' === path ||
        '/tmp/projects/web-nodejs-sample' === path
      );
    });

    isFileMock.mockImplementation(async (path) => {
      return env.VSCODE_DEFAULT_WORKSPACE === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read flattened.devworkspace.yaml
    expect(readFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE);
    expect(readFileMock).toBeCalledWith(env.DEVWORKSPACE_FLATTENED_DEVFILE);

    // should update existing workspace file
    expect(writeFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE, WORKSPACE_JSON);
  });

  test('should use clonePath instead of project name when generating the folder path', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.with-clone-path.yaml');

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

    pathExistsMock.mockImplementation((path) => {
      return '/tmp/projects/custom/clone/path/web-nodejs-sample' === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledWith('/tmp/projects/custom/clone/path/web-nodejs-sample');
    expect(writeFileMock).toBeCalledWith('/tmp/projects/.code-workspace', WORKSPACE_WITH_CLONE_PATH);
  });

  test('should find existing workspace file in clonePath directory', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';
    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(__dirname, '_data', 'flattened.devworkspace.with-clone-path.yaml');

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

    readFileMock.mockImplementation(async (p) => {
      if (p === env.DEVWORKSPACE_FLATTENED_DEVFILE) {
        return originalReadFile(p);
      }
      return WORKSPACE_WITH_CLONE_PATH;
    });

    // Return true for the clonePath-based workspace file AND the clonePath directory
    pathExistsMock.mockImplementation((p) => {
      return (
        '/tmp/projects/custom/clone/path/web-nodejs-sample/.code-workspace' === p ||
        '/tmp/projects/custom/clone/path/web-nodejs-sample' === p
      );
    });

    isFileMock.mockImplementation(async (p) => {
      return '/tmp/projects/custom/clone/path/web-nodejs-sample/.code-workspace' === p;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledWith('/tmp/projects/custom/clone/path/web-nodejs-sample/.code-workspace');
    expect(writeFileMock).not.toBeCalled(); // existing workspace found, no need to write
  });

  test('should not add project to the .code-workspace file if project directory does not exist', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      '_data',
      'flattened.devworkspace.with-five-projects.yaml'
    );
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
      return (
        env.VSCODE_DEFAULT_WORKSPACE === path ||
        '/tmp/projects/che-code' === path ||
        '/tmp/projects/che-dashboard' === path
      );
    });

    isFileMock.mockImplementation(async (path) => {
      return env.VSCODE_DEFAULT_WORKSPACE === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    // should read flattened.devworkspace.yaml
    expect(readFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE);
    expect(readFileMock).toBeCalledWith(env.DEVWORKSPACE_FLATTENED_DEVFILE);

    // should update existing workspace file
    expect(writeFileMock).toBeCalledWith(env.VSCODE_DEFAULT_WORKSPACE, WORKSPACE_WITH_TWO_PROJECTS);
  });
});

describe('Test CodeWorkspace#synchronizeProjects with clonePath:', () => {
  beforeEach(() => {
    delete env.PROJECTS_ROOT;

    Object.assign(fs, {
      pathExists: jest.fn(),
    });
  });

  test('should use clonePath instead of project name to build the folder path', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn().mockResolvedValue(true);
    Object.assign(fs, { pathExists: pathExistsMock });

    const workspace: Workspace = { folders: [] };
    const projects: Project[] = [
      {
        name: 'web-nodejs-sample',
        clonePath: 'custom/clone/path/web-nodejs-sample',
        git: { remotes: { url: 'https://github.com/che-samples/web-nodejs-sample' } },
      },
    ];

    const codeWorkspace = new CodeWorkspace();
    const synchronized = await codeWorkspace.synchronizeProjects(workspace, projects);

    expect(synchronized).toBe(true);
    expect(pathExistsMock).toBeCalledWith('/tmp/projects/custom/clone/path/web-nodejs-sample');
    expect(workspace.folders).toEqual([
      { name: 'web-nodejs-sample', path: '/tmp/projects/custom/clone/path/web-nodejs-sample' },
    ]);
  });

  test('should fall back to project name when clonePath is not set', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn().mockResolvedValue(true);
    Object.assign(fs, { pathExists: pathExistsMock });

    const workspace: Workspace = { folders: [] };
    const projects: Project[] = [
      {
        name: 'web-nodejs-sample',
        git: { remotes: { url: 'https://github.com/che-samples/web-nodejs-sample' } },
      },
    ];

    const codeWorkspace = new CodeWorkspace();
    const synchronized = await codeWorkspace.synchronizeProjects(workspace, projects);

    expect(synchronized).toBe(true);
    expect(pathExistsMock).toBeCalledWith('/tmp/projects/web-nodejs-sample');
    expect(workspace.folders).toEqual([{ name: 'web-nodejs-sample', path: '/tmp/projects/web-nodejs-sample' }]);
  });

  test('should not add a folder if the clonePath directory does not exist', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn().mockResolvedValue(false);
    Object.assign(fs, { pathExists: pathExistsMock });

    const workspace: Workspace = { folders: [] };
    const projects: Project[] = [
      {
        name: 'web-nodejs-sample',
        clonePath: 'custom/clone/path/web-nodejs-sample',
        git: { remotes: { url: 'https://github.com/che-samples/web-nodejs-sample' } },
      },
    ];

    const codeWorkspace = new CodeWorkspace();
    const synchronized = await codeWorkspace.synchronizeProjects(workspace, projects);

    expect(synchronized).toBe(false);
    expect(workspace.folders).toEqual([]);
  });

  test('should not duplicate a folder when a project with the same name already exists, regardless of clonePath', async () => {
    env.PROJECTS_ROOT = '/tmp/projects';

    const pathExistsMock = jest.fn().mockResolvedValue(true);
    Object.assign(fs, { pathExists: pathExistsMock });

    const workspace: Workspace = {
      folders: [{ name: 'web-nodejs-sample', path: '/tmp/projects/web-nodejs-sample' }],
    };
    const projects: Project[] = [
      {
        name: 'web-nodejs-sample',
        clonePath: 'custom/clone/path/web-nodejs-sample',
        git: { remotes: { url: 'https://github.com/che-samples/web-nodejs-sample' } },
      },
    ];

    const codeWorkspace = new CodeWorkspace();
    const synchronized = await codeWorkspace.synchronizeProjects(workspace, projects);

    expect(synchronized).toBe(false);
    expect(workspace.folders).toEqual([{ name: 'web-nodejs-sample', path: '/tmp/projects/web-nodejs-sample' }]);
  });
});
