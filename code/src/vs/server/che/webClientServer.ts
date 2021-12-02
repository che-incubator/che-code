/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import * as http from 'http';
import * as url from 'url';
import { IDirent, Promises } from 'vs/base/node/pfs';
import { sanitizeFilePath } from 'vs/base/common/extpath';
import { join } from 'vs/base/common/path';


/**
 * CHECODE: check if PROJECTS_ROOT is defined.
 * If there is no folders inside, return PROJECTS_ROOT directory
 * If there is a file named eclipse-che.code-workspace inside PROJECTS_ROOT, return it
 * if there is only one folder: if there is one code-workspace file inside, return it else return this unique folder
 * if there are more than one folder, create a eclipse-che.code-workspace file and return that folder
*/
export async function getCheWorkspace(): Promise<{ workspacePath?: string, isFolder?: boolean }> {
    if (process.env.PROJECTS_ROOT) {
        const projectsRoot = process.env.PROJECTS_ROOT;

        // list everything from that directory
        const children: IDirent[] = await Promises.readdir(process.env.PROJECTS_ROOT, { withFileTypes: true });

        // do we have a eclipse-che.code-workspace file there ?
        const cheCodeWorkspace = children.filter(child => child.isFile()).find(file => file.name === 'eclipse-che.code-workspace');
        if (cheCodeWorkspace) {
            const workspacePath = sanitizeFilePath(cheCodeWorkspace.name, projectsRoot);
            return { workspacePath }
        }

        // no, so grab all folders inside PROJECTS_ROOT and add them to a file
        const folders = children.filter(child => child.isDirectory());

        // no folder in PROJECTS_ROOT, open the default folder
        if (folders.length === 0) {
            const workspacePath = projectsRoot;
            return { workspacePath, isFolder: true };
        } else if (folders.length === 1) {
            // check if we have a workspace in that folder.
            // if yes, use it
            const folderPath = join(projectsRoot, folders[0].name);
            const projectsFiles: IDirent[] = await Promises.readdir(folderPath, { withFileTypes: true });
            const anyCodeWorkspaces = projectsFiles.filter(child => child.isFile()).filter(file => file.name.endsWith('.code-workspace'));
            if (anyCodeWorkspaces.length === 1) {
                // use that file
                const workspacePath = sanitizeFilePath(anyCodeWorkspaces[0].name, folderPath);
                return { workspacePath };
            }
            const workspacePath = sanitizeFilePath(folders[0].name, projectsRoot);
            return { workspacePath, isFolder: true }
        } else {
            const eclipseCheCodeWorkspace = {
                folders: folders.map(folder => { return { path: folder.name } })
            };
            const eclipseCheCodeWorkspacePath = join(projectsRoot, 'eclipse-che.code-workspace');
            await Promises.writeFile(eclipseCheCodeWorkspacePath, JSON.stringify(eclipseCheCodeWorkspace, undefined, 2));
            return { workspacePath: eclipseCheCodeWorkspacePath };
        }
    }
    // return empty if not found
    return {};

}


export function getCheRedirectLocation(req: http.IncomingMessage, newQuery: any): string {
    let newLocation;
    // Grab headers
    const xForwardedProto = req.headers['x-forwarded-proto'];
    const xForwardedHost = req.headers['x-forwarded-host'];
    const xForwardedPort = req.headers['x-forwarded-port'];
    const xForwardedPrefix = req.headers['x-forwarded-prefix'];

    if (xForwardedProto && typeof xForwardedProto === 'string' && xForwardedHost && typeof xForwardedHost === 'string') {
        // use protocol
        newLocation = `${xForwardedProto}://`;

        // add host
        newLocation = newLocation.concat(xForwardedHost);

        // add port only if it's not the default one
        if (xForwardedPort && typeof xForwardedPort === 'number' && xForwardedPort !== 443) {
            newLocation = newLocation.concat(`:${xForwardedPort}`);
        }

        // add all prefixes
        if (xForwardedPrefix && typeof xForwardedPrefix === 'string') {
            const items = xForwardedPrefix.split(',').map(item => item.trim());
            newLocation = newLocation.concat(...items);
        }

        // add missing / if any
        if (!newLocation.endsWith('/')) {
            newLocation = `${newLocation}/`;
        }

        // add query
        const urlSearchParams = new URLSearchParams(newQuery);
        const queryAppendix = urlSearchParams.toString();
        if (queryAppendix.length > 0) {
            newLocation = `${newLocation}?${queryAppendix}`;
        }
    } else {
        newLocation = url.format({ pathname: '/', query: newQuery })
    }
    return newLocation;
}