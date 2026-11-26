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
import { parseJSON } from './json-utils.js';
import path from 'path';

export const SKIP_PROJECT_SYNC_SETTING = 'workspace.skipProjectSync';

export interface Workspace {
  folders: Folder[];
  settings?: WorkspaceSettings;
}

export interface Folder {
  name: string;
  path: string;
}

export interface WorkspaceSettings {
  [key: string]: string | boolean | number;
}

export class CodeWorkspace {
  constructor(private readonly configmapData?: Record<string, string>) {}
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

    const projectsRoot = env.PROJECTS_ROOT;

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
        const pathProject = project.clonePath || project.name;
        const toFind = `${env.PROJECTS_ROOT}/${pathProject}/.code-workspace`;

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

      if (this.shouldSkipProjectSync(workspace!)) {
        console.log(`  > ${SKIP_PROJECT_SYNC_SETTING} is true, leaving workspace folders unchanged`);
      } else {
        if (await this.synchronizeProjects(workspace!, devfile.projects)) {
          saveRequired = true;
        }

        if (await this.synchronizeProjects(workspace!, devfile.dependentProjects)) {
          saveRequired = true;
        }

        if (await this.synchronizeProjects(workspace!, devfile.starterProjects)) {
          saveRequired = true;
        }
      }

      const hasDevfileProjects =
        (devfile.projects && devfile.projects.length > 0) ||
        (devfile.dependentProjects && devfile.dependentProjects.length > 0) ||
        (devfile.starterProjects && devfile.starterProjects.length > 0);

      if (
        this.isOpenProjectsRootOnEmpty() &&
        !hasDevfileProjects &&
        (!workspace!.folders || workspace!.folders.length === 0)
      ) {
        console.log(
          `  > workspace.openProjectsRootOnEmpty configuration is enabled and workspace has no folders. Opening ${projectsRoot} folder.`
        );
        workspace!.folders = [{ name: 'projects', path: projectsRoot }];
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

  // Only an explicit boolean true opts out. Missing, false, and string values keep the default sync.
  private shouldSkipProjectSync(workspace: Workspace): boolean {
    return workspace.settings?.[SKIP_PROJECT_SYNC_SETTING] === true;
  }

  async fileExists(file: string | undefined): Promise<boolean> {
    if (file && (await fs.pathExists(file)) && (await fs.isFile(file))) {
      return true;
    }

    return false;
  }

  private isOpenProjectsRootOnEmpty(): boolean {
    if (!this.configmapData?.['configurations.json']) {
      return false;
    }

    try {
      const configurations = parseJSON(this.configmapData['configurations.json'], {
        errorMessage: 'Configmap configurations.json is not valid.',
      });
      return configurations['workspace.openProjectsRootOnEmpty'] === true;
    } catch (error) {
      console.log(`  > Failed to read workspace.openProjectsRootOnEmpty configuration: ${error.message}`);
      return false;
    }
  }

  async synchronizeProjects(workspace: Workspace, projects?: Project[]): Promise<boolean> {
    if (!projects) {
      return false;
    }

    if (!workspace.folders) {
      workspace.folders = [];
    }

    let synchronized = false;

    if (!env.PROJECTS_ROOT) {
      console.log('  > env.PROJECTS_ROOT is not set, skip project assertion');
      return false;
    }

    const basePath = path.resolve(env.PROJECTS_ROOT);

    for (const project of projects) {
      const pathProject = project.clonePath || project.name;
      const fullPath = path.resolve(basePath, pathProject);
      const baseWithSep = basePath.endsWith(path.sep) ? basePath : basePath + path.sep;

      if (fullPath !== basePath && !fullPath.startsWith(baseWithSep)) {
        console.log(`> Skipping project ${project.name}: clonePath escapes projects root`);
        continue;
      }
      if (await fs.pathExists(fullPath)) {
        if (!workspace.folders.some((folder) => folder.name === project.name)) {
          workspace.folders.push({
            name: project.name,
            path: fullPath,
          });

          synchronized = true;
        }
      }
    }

    return synchronized;
  }
}
