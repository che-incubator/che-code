/**********************************************************************
 * Copyright (c) 2021-2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { promises as fs } from 'fs';
import * as http from 'http';
import * as url from 'url';

const CHE_CONFIG_KEYBINDINGS_PATH = '/checode-config/keybindings.json';

/**
 * Reads keybindings.json content from the ConfigMap mount path.
 * Returns the raw JSON string if the file exists, undefined otherwise.
 */
export async function getCheInitialKeybindings(): Promise<string | undefined> {
    try {
        return await fs.readFile(CHE_CONFIG_KEYBINDINGS_PATH, 'utf-8');
    } catch {
        return undefined;
    }
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
