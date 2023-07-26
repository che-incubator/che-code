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
import * as fs from "./fs-extra";

import * as child_process from "child_process";

import { NODE_EXTRA_CERTIFICATE } from "./node-extra-certificate";
import { workspaceFilePath } from "./code-workspace";

export const DEFAULT_PROJECTS_DIRECTORY = "/projects";

export class VSCodeLauncher {
  async launch(): Promise<void> {
    console.log("# Launching VS Code...");

    if (!env.VSCODE_NODEJS_RUNTIME_DIR) {
      throw new Error(
        "Failed to launch VS Code. VSCODE_NODEJS_RUNTIME_DIR environment variable is not set."
      );
    }

    if (!env.PROJECTS_ROOT) {
      throw new Error(
        "Failed to launch VS Code. PROJECTS_ROOT environment variable is not set."
      );
    }

    const node = `${env.VSCODE_NODEJS_RUNTIME_DIR}/node`;

    const host = env.CODE_HOST || "127.0.0.1";

    const params = [
      "out/server-main.js",
      "--host",
      host,
      "--port",
      "3100",
      "--without-connection-token",
    ];

    if (
      env.VSCODE_DEFAULT_WORKSPACE &&
      (await fs.pathExists(env.VSCODE_DEFAULT_WORKSPACE))
    ) {
      params.push("--default-workspace", env.VSCODE_DEFAULT_WORKSPACE);
    } else if (await fs.pathExists(workspaceFilePath())) {
      params.push("--default-workspace", workspaceFilePath());
    } else {
      if (!env.PROJECT_SOURCE) {
        throw new Error(
          "Failed to launch VS Code. PROJECT_SOURCE environment variable is not set."
        );
      }

      params.push("--default-folder", env.PROJECT_SOURCE);
    }

    if (await fs.pathExists(NODE_EXTRA_CERTIFICATE)) {
      env.NODE_EXTRA_CA_CERTS = NODE_EXTRA_CERTIFICATE;
    }

    console.log(`> Running: ${node}`);
    console.log(`> Params: ${params}`);

    const run = child_process.spawn(node, params);

    run.stdout.on("data", (data: string) => {
      console.log(`${data}`);
    });

    run.stderr.on("data", (data: string) => {
      console.error(`${data}`);
    });

    run.on("close", (code: string) => {
      console.log(`VS Code process exited with code ${code}`);
    });
  }
}
