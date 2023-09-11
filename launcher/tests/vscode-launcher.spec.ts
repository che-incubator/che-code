/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { env } from "process";

import * as fs from "../src/fs-extra";
import * as child_process from "child_process";

import { VSCodeLauncher } from "../src/vscode-launcher";

describe("Test VS Code launcher:", () => {
  beforeEach(() => {
    delete env.VSCODE_NODEJS_RUNTIME_DIR;
    delete env.PROJECTS_ROOT;
    delete env.PROJECT_SOURCE;
    delete env.VSCODE_DEFAULT_WORKSPACE;
    delete env.NODE_EXTRA_CA_CERTS;
  });

  test("should fail if env.VSCODE_NODEJS_RUNTIME_DIR is not set", async () => {
    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

    const launcher = new VSCodeLauncher();

    try {
      await launcher.launch();
    } catch (error) {
      expect(error.message).toBe(
        "Failed to launch VS Code. VSCODE_NODEJS_RUNTIME_DIR environment variable is not set."
      );
    }

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test("should fail if env.PROJECTS_ROOT is not set", async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = "/tmp/vscode-nodejs-runtime";

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

    const launcher = new VSCodeLauncher();

    try {
      await launcher.launch();
    } catch (error) {
      expect(error.message).toBe(
        "Failed to launch VS Code. PROJECTS_ROOT environment variable is not set."
      );
    }

    expect(pathExistsMock).toBeCalledTimes(0);
  });

  test("should check env.VSCODE_DEFAULT_WORKSPACE and launch VS Code", async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = "/tmp/vscode-nodejs-runtime";
    env.PROJECTS_ROOT = "/tmp/projects";
    env.VSCODE_DEFAULT_WORKSPACE = "/tmp/.code-workspace";

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    pathExistsMock.mockImplementation(async (path) => {
      return "/tmp/.code-workspace" === path;
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

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
    await launcher.launch();

    expect(pathExistsMock).toBeCalledTimes(2);
    expect(pathExistsMock).toBeCalledWith("/tmp/.code-workspace");
    expect(pathExistsMock).toBeCalledWith(
      "/tmp/node-extra-certificates/ca.crt"
    );

    expect(spawnMock).toBeCalledWith("/tmp/vscode-nodejs-runtime/node", [
      "out/server-main.js",
      "--host",
      "127.0.0.1",
      "--port",
      "3100",
      "--without-connection-token",
      "--default-workspace",
      "/tmp/.code-workspace",
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).not.toBeDefined();

    expect(mainTreadEventEmitter).toBeCalledWith("close", expect.any(Function));
    expect(stdoutEventEmitter).toBeCalledWith("data", expect.any(Function));
    expect(stderrEventEmitter).toBeCalledWith("data", expect.any(Function));
  });

  test("should launch VS Code with /projects/.code-workspace workspace file and Node extra certificate", async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = "/tmp/vscode-nodejs-runtime";
    env.PROJECTS_ROOT = "/tmp/projects";

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    pathExistsMock.mockImplementation(async (path) => {
      console.log(`> is path exist ${path}`);
      return (
        "/tmp/projects/.code-workspace" === path ||
        "/tmp/node-extra-certificates/ca.crt" === path
      );
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

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

    expect(pathExistsMock).toBeCalledTimes(2);
    expect(pathExistsMock).toBeCalledWith("/tmp/projects/.code-workspace");
    expect(pathExistsMock).toBeCalledWith(
      "/tmp/node-extra-certificates/ca.crt"
    );

    expect(spawnMock).toBeCalledWith("/tmp/vscode-nodejs-runtime/node", [
      "out/server-main.js",
      "--host",
      "127.0.0.1",
      "--port",
      "3100",
      "--without-connection-token",
      "--default-workspace",
      "/tmp/projects/.code-workspace",
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).toBe("/tmp/node-extra-certificates/ca.crt");
  });

  test("should launch VS Code, use env.PROJECT_SOURCE as default folder and not use Node extra certificate", async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = "/tmp/vscode-nodejs-runtime";

    env.PROJECTS_ROOT = "/tmp/projects";
    env.PROJECT_SOURCE = "/tmp/projects/sample-project";

    const pathExistsMock = jest.fn();
    Object.assign(fs, {
      pathExists: pathExistsMock,
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

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

    expect(pathExistsMock).toBeCalledTimes(2);
    expect(pathExistsMock).toBeCalledWith("/tmp/projects/.code-workspace");
    expect(pathExistsMock).toBeCalledWith(
      "/tmp/node-extra-certificates/ca.crt"
    );

    expect(spawnMock).toBeCalledWith("/tmp/vscode-nodejs-runtime/node", [
      "out/server-main.js",
      "--host",
      "127.0.0.1",
      "--port",
      "3100",
      "--without-connection-token",
      "--default-folder",
      "/tmp/projects/sample-project",
    ]);

    expect(env.NODE_EXTRA_CA_CERTS).not.toBeDefined();
  });

  test("should fail when trying to use env.PROJECT_SOURCE but the variable is not set", async () => {
    env.VSCODE_NODEJS_RUNTIME_DIR = "/tmp/vscode-nodejs-runtime";
    env.PROJECTS_ROOT = "/tmp/projects";

    Object.assign(fs, {
      pathExists: jest.fn(),
    });

    const spawnMock = jest.fn();
    Object.assign(child_process, {
      spawn: spawnMock,
    });

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
      expect(error.message).toBe(
        "Failed to launch VS Code. PROJECT_SOURCE environment variable is not set."
      );
      expect(spawnMock).not.toBeCalled();
    }
  });
});
