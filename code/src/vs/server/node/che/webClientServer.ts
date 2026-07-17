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

import { createReadStream } from 'fs';
import { access, constants as fsConstants } from 'fs/promises';
import * as http from 'http';
import * as url from 'url';

const compressibleMimeTypes = new Set([
    'text/html', 'text/javascript', 'text/css', 'text/plain',
    'application/json', 'image/svg+xml',
]);

const disableCompression = process.env['CODE_DISABLE_STATIC_GZIP'] === '1';

/**
 * Attempts to serve a pre-compressed .gz version of the file.
 * Returns true if the compressed file was served, false otherwise.
 * Falls back gracefully: if .gz file doesn't exist or any error occurs, returns false
 * so the caller can serve the original uncompressed file.
 *
 * Set CODE_DISABLE_STATIC_GZIP=1 to bypass and always serve uncompressed files.
 */
export async function tryServeCompressedFile(
    filePath: string,
    contentType: string,
    fileSize: number,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    responseHeaders: Record<string, string>,
): Promise<boolean> {
    if (disableCompression) {
        return false;
    }

    if (!compressibleMimeTypes.has(contentType) || fileSize <= 1024) {
        return false;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (!/\bgzip\b/.test(acceptEncoding)) {
        return false;
    }

    const gzFilePath = filePath + '.gz';
    try {
        await access(gzFilePath, fsConstants.R_OK);
        const gzStream = createReadStream(gzFilePath);
        await new Promise<void>((resolve, reject) => {
            gzStream.on('error', reject);
            gzStream.on('open', () => {
                responseHeaders['Content-Encoding'] = 'gzip';
                responseHeaders['Vary'] = 'Accept-Encoding';
                res.writeHead(200, responseHeaders);
                gzStream.pipe(res);
                res.once('close', () => gzStream.destroy());
                gzStream.on('end', resolve);
                gzStream.removeAllListeners('error');
                gzStream.on('error', () => res.destroy());
            });
        });
        return true;
    } catch {
        return false;
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
