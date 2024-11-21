/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import * as http from 'http';

export async function handlePostRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    if (req.method === 'POST' || req.method === 'PUT') {
        console.log(`>>> POST ${req.url}`);

        let _resolve: () => void;
        const finish = new Promise<void>((resolve) => {
            _resolve = resolve;
        });

        let body = '';
        req.on('data', (chunk) => {
            console.log('on:data');
            body += chunk;
        });

        req.on('end', () => {
            console.log('on:end. BODY:', body);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            _resolve();
        });

        await finish;
        console.log('>>> finished');

        return true;
    }

    return false;
}
