/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from "../src/fs-extra";

import * as path from "path";
import { env } from "process";
import { CodeWorkspace } from "../src/code-workspace";

const TEST_JSON = `{
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

describe("Test generating VS Code Workspace file:", () => {
  beforeEach(() => {
    Object.assign(fs, {
      pathExists: jest.fn(),
      writeFile: jest.fn(),
      isFile: jest.fn(),
    });
  });

  test("should return if env.PROJECTS_ROOT is not set", async () => {
    delete env.PROJECTS_ROOT;

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test("should skip step if env.VSCODE_DEFAULT_WORKSPACE is defined and points to a real file", async () => {
    env.PROJECTS_ROOT = "/tmp/projects";
    env.VSCODE_DEFAULT_WORKSPACE = "/tmp/test.code-workspace";

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
    });

    pathExistsMock.mockImplementation((path) => {
      return "/tmp/test.code-workspace" === path;
    });

    isFileMock.mockImplementation((path) => {
      return "/tmp/test.code-workspace" === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalledTimes(1);
    expect(isFileMock).toBeCalledTimes(1);
    expect(pathExistsMock).toBeCalledWith("/tmp/test.code-workspace");
    expect(isFileMock).toBeCalledWith("/tmp/test.code-workspace");
  });

  test("should create .code-workspace file", async () => {
    env.PROJECTS_ROOT = "/tmp/projects";

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      "_data",
      "flattened.devworkspace.yaml"
    );

    const pathExistsMock = jest.fn();
    const writeFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      writeFile: writeFileMock,
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalled();
    expect(writeFileMock).toBeCalledWith(
      "/tmp/projects/.code-workspace",
      TEST_JSON
    );
  });

  test("should continue creating of .code-workspace file if env.VSCODE_DEFAULT_WORKSPACE points on a wrong location", async () => {
    env.PROJECTS_ROOT = "/tmp/projects";
    env.VSCODE_DEFAULT_WORKSPACE = "/tmp/test.code-workspace";

    env.DEVWORKSPACE_FLATTENED_DEVFILE = path.join(
      __dirname,
      "_data",
      "flattened.devworkspace.yaml"
    );

    const pathExistsMock = jest.fn();
    const isFileMock = jest.fn();
    const writeFileMock = jest.fn();

    Object.assign(fs, {
      pathExists: pathExistsMock,
      isFile: isFileMock,
      writeFile: writeFileMock,
    });

    // "/tmp/test.code-workspace" exists but not a file
    pathExistsMock.mockImplementation((path) => {
      return "/tmp/test.code-workspace" === path;
    });

    const codeWorkspace = new CodeWorkspace();
    await codeWorkspace.generate();

    expect(pathExistsMock).toBeCalled();
    expect(writeFileMock).toBeCalledWith(
      "/tmp/projects/.code-workspace",
      TEST_JSON
    );
  });
});
