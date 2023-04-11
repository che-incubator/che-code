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

/**
 * To switch to load the webview resources from local workspace
 *   - replace 'load-webview-resources-from-vscode-cdn' on 'load-webview-resources-from-local-workspace' in all javascript files
 *   - replace 'alternative-webview-resources-base-uri' on che-code endpoint value, taken from workspace flattened devfile
 */
let webviewResourcesConfiguredTo = 'load-webview-resources-from-vscode-cdn';

export const alternativeWebviewResourcesBaseURI = 'alternative-webview-resources-base-uri';

// MUST not have '/' at the end
export const alternativeWebviewExternalEndpoint = `${alternativeWebviewResourcesBaseURI}oss-dev/static/out/vs/workbench/contrib/webview/browser/pre/`;

export function loadWebviewResourcesFromLocalWorkspace(): boolean {
    return webviewResourcesConfiguredTo === 'load-webview-resources-from-local-workspace';
}

export function redirectToLocalWorkspace(resource: URI, remoteInfo: { authority: string | undefined; }): URI | undefined {
    if (loadWebviewResourcesFromLocalWorkspace()) {
        const href = resource.toString();

        // Checks if a resource from some built-in extension is requested
        // file:///checode/checode-linux-libc/extensions/markdown-language-features/media/pre.js
        if (href.startsWith('file:///checode/checode-linux-libc/')) {
            return URI.parse(href.replace('file:///checode/checode-linux-libc/', `${alternativeWebviewResourcesBaseURI}oss-dev/static/`));
        }

        // Checks if it is requested a resource from the current project
        // file:///projects/web-nodejs-sample/images/default.png
        if (href.startsWith('file:///projects/')) {
            return URI.parse(href.replace('file:///', `${alternativeWebviewResourcesBaseURI}oss-dev/static/`));
        }

        // Checks if a resource from an installed extension is requested
        // file:///checode/remote/extensions/atlassian.atlascode-3.0.2-universal
        if (href.startsWith('file:///checode/remote/extensions/')) {
            return URI.parse(href.replace('file:///checode/remote/extensions/', `${alternativeWebviewResourcesBaseURI}oss-dev/static/remote-extensions/`));
        }
    }

    return undefined;
}
