/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from "./fs-extra";
import { env } from "process";
import { FlattenedDevfile, Project } from "./flattened-devfile";

export interface Workspace {
  folders: Folder[];
  settings?: KeyValue;
}

export interface Folder {
  name: string;
  path: string;
}

export interface KeyValue {
  [key: string]: string;
}

export function workspaceFilePath(): string {
  return `${env.PROJECTS_ROOT}/.code-workspace`;
}

export class CodeWorkspace {
  /*****************************************************************************************************************
   *
   * If does not exist, creates `.code-workspace` file in projects directory.
   *
   *****************************************************************************************************************/
  async generate(): Promise<void> {
    console.log("# Generating Workspace file...");

    if (!env.PROJECTS_ROOT) {
      console.log("  > env.PROJECTS_ROOT is not set, skip this step");
      return;
    }

    // Following flow is common for default workspace location and
    // for custom workspace file defined in env.VSCODE_DEFAULT_WORKSPACE
    const alternativePath = env.VSCODE_DEFAULT_WORKSPACE;

    try {
      // get workspace file
      const workspace = await this.readWorkspaceFile(alternativePath);

      const devfile = await new FlattenedDevfile().getDevfile();

      // synchronize projects
      this.synchronizeProjects(workspace, devfile.projects);

      // synchronize dependent projects
      this.synchronizeProjects(workspace, devfile.dependentProjects);

      // synchronize starter projects
      this.synchronizeProjects(workspace, devfile.starterProjects);

      // write workspace file
      await this.writeWorkspaceFile(workspace, alternativePath);
    } catch (err) {
      console.error(
        `${err.message} Unable to generate che.code-workspace file`
      );
    }
  }

  async fileExists(file: string | undefined): Promise<boolean> {
    if (file && (await fs.pathExists(file)) && (await fs.isFile(file))) {
      return true;
    }

    return false;
  }

  async readWorkspaceFile(alternativePath?: string): Promise<Workspace> {
    if (await this.fileExists(alternativePath)) {
      return JSON.parse(await fs.readFile(alternativePath!));
    } else if (await this.fileExists(workspaceFilePath())) {
      return JSON.parse(await fs.readFile(workspaceFilePath()));
    }

    return {} as Workspace;
  }

  async writeWorkspaceFile(
    workspace: Workspace,
    alternativePath?: string
  ): Promise<void> {
    const json = JSON.stringify(workspace, null, "\t");

    if (await this.fileExists(alternativePath)) {
      console.log(`  > writing ${alternativePath}..`);
      await fs.writeFile(alternativePath!, json);
    } else {
      console.log(`  > writing ${workspaceFilePath()}..`);
      await fs.writeFile(workspaceFilePath(), json);
    }
  }

  async synchronizeProjects(
    workspace: Workspace,
    projects?: Project[]
  ): Promise<void> {
    if (!projects) {
      return;
    }

    if (!workspace.folders) {
      workspace.folders = [];
    }

    projects.forEach(async (project) => {
      if (!workspace.folders.some((folder) => folder.name === project.name)) {
        workspace.folders.push({
          name: project.name,
          path: `${env.PROJECTS_ROOT}/${project.name}`,
        });
      }
    });
  }
}
