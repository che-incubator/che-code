/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';

export async function activate(_context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Che Project');
  // check if there are projects already defined
  // if true, exit
  const projects = vscode.workspace.workspaceFolders;
  if (projects) {
    output.appendLine('Found existing projects in the workspace, skipping the sequence');
    return;
  }

  // open the project if found one
  const workspacePath = await getCheWorkspacePath(output);
  if (workspacePath) {
    output.appendLine(`Opening the folder... ${workspacePath.toString()}`);
    await vscode.commands.executeCommand('vscode.openFolder', workspacePath, { forceReuseWindow: true });
  } else {
    output.appendLine('no workspace found');
  }

}

/**
 * Check if PROJECTS_ROOT is defined.
 * If there is no folders inside, return PROJECTS_ROOT directory
 * If there is a file named eclipse-che.code-workspace inside PROJECTS_ROOT, return it
 * if there is only one folder: if there is one code-workspace file inside, return it else return this unique folder
 * if there are more than one folder, create a eclipse-che.code-workspace file and return that folder
*/
export async function getCheWorkspacePath(output: vscode.OutputChannel): Promise<vscode.Uri | undefined> {
  if (process.env.PROJECTS_ROOT) {
      const projectsRoot = process.env.PROJECTS_ROOT;
      const projectsRootUri = vscode.Uri.file(projectsRoot);

      // list everything from that directory
      const children = await vscode.workspace.fs.readDirectory(projectsRootUri);

      // do we have a eclipse-che.code-workspace file there ?
      const cheCodeWorkspace = children.filter(child => child[1] === vscode.FileType.Directory).find(child => child[0] === 'eclipse-che.code-workspace');
      if (cheCodeWorkspace) {
          output.appendLine('Found a eclipse-che.code-workspace file in the projects root, using it');
          return vscode.Uri.joinPath(projectsRootUri, cheCodeWorkspace[0]);
      }

      // no, so grab all folders inside PROJECTS_ROOT and add them to a file
      const folders = children.filter(child => child[1] === vscode.FileType.Directory);

      // no folder in PROJECTS_ROOT, open the default folder
      if (folders.length === 0) {
          output.appendLine(`No folder found in the projects root, opening the default projects root folder ${projectsRoot}`);
          return projectsRootUri;
      } else if (folders.length === 1) {
          // check if we have a workspace in that folder.
          // if yes, use it
          const folderPath = vscode.Uri.joinPath(projectsRootUri, folders[0][0]);
          const projectsFiles = await vscode.workspace.fs.readDirectory(folderPath);
          const anyCodeWorkspaces = projectsFiles.filter(child => child[1] === vscode.FileType.File).filter(file => file[0].endsWith('.code-workspace'));
          if (anyCodeWorkspaces.length === 1) {
            output.appendLine('Found a single folder with a single code-workspace file in it, using it');
            const anyCodeWorkspace = anyCodeWorkspaces[0][0];
            output.appendLine(`anyCodeWorkspace = ${anyCodeWorkspace.toString()}`);
              // use that file
              const workspacePath = vscode.Uri.joinPath(folderPath, anyCodeWorkspace);
              output.appendLine(`workspacePath = ${workspacePath.toString()}`);
              return workspacePath;
          }
          output.appendLine('Found a single folder with no code-workspace file in it, using folder as it is');
          const workspacePath = vscode.Uri.joinPath(projectsRootUri, folders[0][0]);
          output.appendLine(`folder is ${folders[0][0]}, workspacePath = ${workspacePath.toString()}`);
          return workspacePath;
      } else {
          const eclipseCheCodeWorkspace = {
              folders: folders.map(folder => { return { path: folder[0] } })
          };
          output.appendLine('Found multiple folders, creating a eclipse-che.code-workspace file in the projects root');
          const eclipseCheCodeWorkspacePath = vscode.Uri.joinPath(projectsRootUri, 'eclipse-che.code-workspace');
          await vscode.workspace.fs.writeFile(eclipseCheCodeWorkspacePath, Buffer.from(JSON.stringify(eclipseCheCodeWorkspace, undefined, 2), 'utf-8'));
          return eclipseCheCodeWorkspacePath;
      }
  }
  // return empty if not found
  return undefined;

}


export function deactivate(): void {
  
}
