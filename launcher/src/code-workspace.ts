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
import { FlattenedDevfile } from "./flattened-devfile";

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
    console.log("# Generaing Workspace file...");

    if (!env.PROJECTS_ROOT) {
      console.log("  > env.PROJECTS_ROOT is not set, skip this step");
      return;
    }

    try {
      // skip if workspace file is already exist
      if (await fs.pathExists(workspaceFilePath())) {
        console.log(
          `  > Workspace file ${workspaceFilePath()} is already exist`
        );
        return;
      }

      // take all the projects from flattened devworkspace file
      const projects = await new FlattenedDevfile().getProjects();
      const folders = projects.map((p) => {
        return {
          name: p.name,
          path: `${env.PROJECTS_ROOT}/${p.name}`,
        };
      });

      const workspace = {
        folders,
      };

      // write .code-workspace file
      const json = JSON.stringify(workspace, null, "\t");
      await fs.writeFile(workspaceFilePath(), json);
    } catch (err) {
      console.error(
        `${err.message} Unable to generate che.code-workspace file`
      );
    }
  }
}
