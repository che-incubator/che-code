/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from './fs-extra.js';
import { env } from 'process';
import { FlattenedDevfile, Project } from './flattened-devfile.js';

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

export class CodeWorkspace {
  /*****************************************************************************************************************
   *
   * If does not exist, creates `.code-workspace` file in projects directory.
   *
   *****************************************************************************************************************/
  async generate(): Promise<string | undefined> {
    console.log('# Generating Workspace file...');

    if (!env.PROJECTS_ROOT) {
      console.log('  > env.PROJECTS_ROOT is not set, skip this step');
      return;
    }

    let path: string | undefined;
    let workspace: Workspace | undefined;

    try {
      if (env.VSCODE_DEFAULT_WORKSPACE) {
        console.log(`  > env.VSCODE_DEFAULT_WORKSPACE environment variable is set to ${env.VSCODE_DEFAULT_WORKSPACE}`);
        if (await this.fileExists(env.VSCODE_DEFAULT_WORKSPACE)) {
          console.log(`  > Using workspace file ${env.VSCODE_DEFAULT_WORKSPACE}`);

          path = env.VSCODE_DEFAULT_WORKSPACE;
          workspace = await this.readWorkspaceFile(path);
        } else {
          console.log(`  > ERROR: failure to read workspace file ${env.VSCODE_DEFAULT_WORKSPACE}`);
          return;
        }
      }
    } catch (err) {
      console.error(`Failure to read workspace file. ${err.message}`);
      return;
    }

    try {
      const devfile = await new FlattenedDevfile().getDevfile();
      let saveRequired = false;

      // if there is only one project, try to find the workspace file
      if (!path && devfile.projects && devfile.projects.length === 1) {
        const project = devfile.projects[0];
        const toFind = `${env.PROJECTS_ROOT}/${project.name}/.code-workspace`;

        try {
          if (await this.fileExists(toFind)) {
            console.log(`  > Using workspace file ${toFind}`);

            path = toFind;
            workspace = await this.readWorkspaceFile(path);
          }
        } catch (err) {
          console.error(`Failure to read workspace file. ${err.message}`);
          return;
        }
      }

      if (!path) {
        path = `${env.PROJECTS_ROOT}/.code-workspace`;
        if (await this.fileExists(path)) {
          console.log(`  > Using workspace file ${path}`);
          try {
            workspace = await this.readWorkspaceFile(path);
          } catch (readErr) {
            console.error(`Failure to read workspace file. ${readErr.message}`);
            return;
          }
        } else {
          console.log(`  > Creating new workspace file ${path}`);
          workspace = {} as Workspace;
          saveRequired = true;
        }
      }

      if (await this.synchronizeProjects(workspace!, devfile.projects)) {
        saveRequired = true;
      }

      if (await this.synchronizeProjects(workspace!, devfile.dependentProjects)) {
        saveRequired = true;
      }

      if (await this.synchronizeProjects(workspace!, devfile.starterProjects)) {
        saveRequired = true;
      }

      // write workspace file only if it has been changed
      if (saveRequired) {
        const json = JSON.stringify(workspace, null, '\t');
        await fs.writeFile(path, json);
      }

      return path;
    } catch (err) {
      console.error(`Unable to generate che.code-workspace file. ${err.message}`);
    }
  }

  // reads workspace file from the file system
  // in the read content finds and removes each comma, after which there is no any attribute, object or array
  async readWorkspaceFile(path: string): Promise<Workspace> {
    const content = await fs.readFile(path);
    const regex = /\,(?!\s*?[\{\[\"\'\w])/g;
    const sanitized = content.replace(regex, '');
    return JSON.parse(sanitized);
  }

  async fileExists(file: string | undefined): Promise<boolean> {
    if (file && (await fs.pathExists(file)) && (await fs.isFile(file))) {
      return true;
    }

    return false;
  }

  async synchronizeProjects(workspace: Workspace, projects?: Project[]): Promise<boolean> {
    if (!projects) {
      return false;
    }

    if (!workspace.folders) {
      workspace.folders = [];
    }

    let synchronized = false;

    for (const project of projects) {
      if (await fs.pathExists(`${env.PROJECTS_ROOT}/${project.name}`)) {
        if (!workspace.folders.some((folder) => folder.name === project.name)) {
          workspace.folders.push({
            name: project.name,
            path: `${env.PROJECTS_ROOT}/${project.name}`,
          });

          synchronized = true;
        }
      }
    }

    return synchronized;
  }
}
