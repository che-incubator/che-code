/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as http from 'http';
import { resolve as resolveUrl, URL } from 'url';
import { CancellationToken, Disposable } from 'vscode';

/**
 * Attempts to retrieve the debugger websocket URL for a process listening
 * at the given address, retrying until available.
 * @param browserURL -- Address like `http://localhost:1234`
 * @param cancellationToken -- Optional cancellation for this operation
 */
export async function retryGetWSEndpoint(
  browserURL: string,
  cancellationToken: CancellationToken,
): Promise<string> {
  try {
    return await getWSEndpoint(browserURL, cancellationToken);
  } catch (e) {
    if (cancellationToken.isCancellationRequested) {
      throw new Error(`Could not connect to debug target at ${browserURL}: ${e}`);
    }

    await new Promise(r => setTimeout(r, 200));
    return retryGetWSEndpoint(browserURL, cancellationToken);
  }
}

/**
 * Returns the debugger websocket URL a process listening at the given address.
 * @param browserURL -- Address like `http://localhost:1234`
 * @param cancellationToken -- Optional cancellation for this operation
 */
export async function getWSEndpoint(
  browserURL: string,
  cancellationToken: CancellationToken,
): Promise<string> {
  const jsonVersion = await fetchJson<{ webSocketDebuggerUrl?: string }>(
    resolveUrl(browserURL, '/json/version'),
    cancellationToken,
  );

  if (jsonVersion?.webSocketDebuggerUrl) {
    return fixRemoteUrl(browserURL, jsonVersion.webSocketDebuggerUrl);
  }

  // Chrome its top-level debugg on /json/version, while Node does not.
  // Request both and return whichever one got us a string.
  const jsonList = await fetchJson<{ webSocketDebuggerUrl: string }[]>(
    resolveUrl(browserURL, '/json/list'),
    cancellationToken,
  );

  if (jsonList?.length) {
    return fixRemoteUrl(browserURL, jsonList[0].webSocketDebuggerUrl);
  }

  throw new Error('Could not find any debuggable target');
}

async function fetchJson<T>(url: string, cancellationToken: CancellationToken): Promise<T> {
  return JSON.parse(await fetchHttp(url, cancellationToken));
}

function fetchHttp(url: string, cancellationToken: CancellationToken) {
  const disposables: Disposable[] = [];

  return new Promise<string>((fulfill, reject) => {
    const request = http.request(
      url,
      {
        headers: {
          host: 'localhost',
        },
      },
      response => {
        disposables.push(cancellationToken.onCancellationRequested(() => response.destroy()));

        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (data += chunk));
        response.on('end', () => fulfill(data));
        response.on('error', reject);
      },
    );

    disposables.push(
      cancellationToken.onCancellationRequested(() => {
        request.destroy();
        reject(new Error(`Cancelled GET ${url}`));
      }),
    );

    request.on('error', reject);
    request.end();
  }).finally(() => disposables.forEach(d => d.dispose()));
}

function fixRemoteUrl(rawBrowserUrl: string, rawWebSocketUrl: string) {
  const browserUrl = new URL(rawBrowserUrl);
  const websocketUrl = new URL(rawWebSocketUrl);
  websocketUrl.host = browserUrl.host;
  return websocketUrl.toString();
}
