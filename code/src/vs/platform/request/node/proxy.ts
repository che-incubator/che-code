/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseUrl, Url } from 'url';
import { isBoolean } from '../../../base/common/types.js';

export type Agent = any;

function getSystemProxyURI(requestURL: Url, env: typeof process.env): string | null {
	if (requestURL.protocol === 'http:') {
		return env.HTTP_PROXY || env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null;
	}

	return null;
}

/** Respects the NO_PROXY environment variable. */
function getCheSystemProxyURI(requestURL: Url, env: typeof process.env): string | null {
	const noProxy = (env.NO_PROXY || env.no_proxy || '').trim().toLowerCase();
	if (noProxy === '*') {
		return null;
	}

	const filters = noProxy
		.split(',')
		.map(s => s.trim().split(':', 2))
		.map(([name, port]) => ({ name, port }))
		.filter(filter => !!filter.name)
		.map(({ name, port }) => {
			const domain = name[0] === '.' ? name : `.${name}`;
			return { domain, port };
		});
	const hostname = requestURL.hostname?.toLowerCase();
	const port = requestURL.port || (requestURL.protocol === 'https:' ? '443' : '80');
	if (hostname && filters.some(({ domain, port: filterPort }) => `.${hostname}`.endsWith(domain) && (!filterPort || port === filterPort))) {
		return null;
	}

	return getSystemProxyURI(requestURL, env);
}

export interface IOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

export async function getProxyAgent(rawRequestURL: string, env: typeof process.env, options: IOptions = {}): Promise<Agent> {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || getCheSystemProxyURI(requestURL, env);

	if (!proxyURL) {
		return null;
	}

	const proxyEndpoint = parseUrl(proxyURL);

	if (!/^https?:$/.test(proxyEndpoint.protocol || '')) {
		return null;
	}

	const opts = {
		host: proxyEndpoint.hostname || '',
		port: (proxyEndpoint.port ? +proxyEndpoint.port : 0) || (proxyEndpoint.protocol === 'https' ? 443 : 80),
		auth: proxyEndpoint.auth,
		rejectUnauthorized: isBoolean(options.strictSSL) ? options.strictSSL : true,
	};

	if (requestURL.protocol === 'http:') {
		const { default: mod } = await import('http-proxy-agent');
		return new mod.HttpProxyAgent(proxyURL, opts);
	} else {
		const { default: mod } = await import('https-proxy-agent');
		return new mod.HttpsProxyAgent(proxyURL, opts);
	}
}
