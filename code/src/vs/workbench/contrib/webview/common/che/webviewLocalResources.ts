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

import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

/**
 * Returns base URI of the main frame or webworker.
 * 
 * Possible values:
 *  https://devspaces.apps.sandbox-m3.1530.p1.openshiftapps.com/workspacea98cfe74063046a6/tools/3100/
 *  https://devspaces.apps.sandbox-m3.1530.p1.openshiftapps.com/workspacea98cfe74063046a6/tools/3100/oss-dev/static/out/vs/base/worker/workerMain.js
 *  
 */
function getBaseURI(): string {
    try {
        if (self && self.location) {
            return self.location.toString();
        }
    } catch (err) {
        console.error(err.message);
    }

    // fallback to localhost
    return 'https://localhost/';
}

export const alternativeWebviewResourcesBaseURI = getBaseURI();

// MUST not have '/' at the end
export const alternativeWebviewExternalEndpoint = `${alternativeWebviewResourcesBaseURI}oss-dev/static/out/vs/workbench/contrib/webview/browser/pre`;

export function redirectToLocalWorkspace(resource: URI, remoteInfo: { authority: string | undefined; path?: string; }): URI | undefined {

    // Checks if a resource from some built-in extension is requested
    // file:///checode/checode-linux-libc/extensions/markdown-language-features/media/pre.js
    if (resource.toString().startsWith('file:///checode/checode-linux-libc/')) {

        const rpath = resource.toString().replace('file:///checode/checode-linux-libc/', `${remoteInfo.path}oss-dev/static/`);
        return URI.from({
            scheme: Schemas.https,
            authority: remoteInfo.authority,
            path: rpath,
            fragment: resource.fragment,
            query: resource.query
        });
    }

    // Checks if it is requested a resource from the current project
    // file:///projects/web-nodejs-sample/images/default.png
    if (resource.toString().startsWith('file:///projects/')) {

        const rpath = resource.toString().replace('file:///', `${remoteInfo.path}oss-dev/static/`);
        return URI.from({
            scheme: Schemas.https,
            authority: remoteInfo.authority,
            path: rpath,
            fragment: resource.fragment,
            query: resource.query
        });
    }

    // Checks if a resource from an installed extension is requested
    // file:///checode/remote/extensions/atlassian.atlascode-3.0.2-universal
    if (resource.toString().startsWith('file:///checode/remote/extensions/')) {
        const rpath = resource.toString().replace('file:///checode/remote/extensions/', `${remoteInfo.path}oss-dev/static/remote-extensions/`);
        return URI.from({
            scheme: Schemas.https,
            authority: remoteInfo.authority,
            path: rpath,
            fragment: resource.fragment,
            query: resource.query
        });
    }

    return undefined;
}
