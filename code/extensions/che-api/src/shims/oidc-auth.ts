/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

/*
 * This file was generated using AI assistance (Cursor AI)
 * and reviewed by the maintainers.
 */

import { base64url } from 'rfc4648';

interface OidcTokenGrantResponse {
	id_token: string;
	refresh_token: string;
	expiresIn: () => number;
}

interface OidcModule {
	discovery: (...args: unknown[]) => Promise<unknown>;
	refreshTokenGrant: (config: unknown, token: string) => Promise<OidcTokenGrantResponse>;
}

interface IUser {
	authProvider?: {
		name: string;
		config?: Record<string, string>;
	};
}

interface IOidcClient {
	refresh(token: string): Promise<{ id_token: string; refresh_token: string; expires_at: number }>;
}

interface IHttpRequestOptions {
	headers: Record<string, string>;
}

interface IJWT {
	payload: {
		exp: number;
	};
}

function loadOidcModule(): OidcModule {
	// `openid-client` is intentionally loaded lazily. The module reads `navigator`
	// at import time, which triggers migration warnings in the extension host.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require('openid-client') as OidcModule;
}

class OidcClient implements IOidcClient {
	constructor(private readonly config: unknown) { }

	async refresh(token: string): Promise<{ id_token: string; refresh_token: string; expires_at: number }> {
		const newToken = await loadOidcModule().refreshTokenGrant(this.config, token);
		return {
			id_token: newToken.id_token,
			refresh_token: newToken.refresh_token,
			expires_at: newToken.expiresIn(),
		};
	}
}

export class OpenIDConnectAuth {
	// public for testing purposes.
	public currentTokenExpiration = 0;

	public static decodeJWT(token: string): IJWT | null {
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}

		try {
			const payload = JSON.parse(new TextDecoder().decode(base64url.parse(parts[1], { loose: true }))) as IJWT['payload'];
			return { payload };
		} catch {
			return null;
		}
	}

	public static expirationFromToken(token: string): number {
		const jwt = OpenIDConnectAuth.decodeJWT(token);
		if (!jwt) {
			return 0;
		}
		return jwt.payload.exp;
	}

	public isAuthProvider(user: IUser): boolean {
		if (!user.authProvider) {
			return false;
		}
		return user.authProvider.name === 'oidc';
	}

	public async applyAuthentication(user: IUser, opts: IHttpRequestOptions, overrideClient?: IOidcClient): Promise<void> {
		const token = await this.getToken(user, overrideClient);
		if (token) {
			opts.headers['Authorization'] = `Bearer ${token}`;
		}
	}

	private async getToken(user: IUser, overrideClient?: IOidcClient): Promise<string | null> {
		const config = user.authProvider?.config;
		if (!config) {
			return null;
		}

		if (!config['client-secret']) {
			config['client-secret'] = '';
		}

		if (!config['id-token']) {
			return null;
		}

		return this.refresh(user, overrideClient);
	}

	private async refresh(user: IUser, overrideClient?: IOidcClient): Promise<string | null> {
		const config = user.authProvider?.config;
		if (!config?.['id-token']) {
			return null;
		}

		if (this.currentTokenExpiration === 0) {
			this.currentTokenExpiration = OpenIDConnectAuth.expirationFromToken(config['id-token']);
		}

		if (Date.now() / 1000 > this.currentTokenExpiration) {
			if (!config['client-id'] || !config['refresh-token'] || !config['idp-issuer-url']) {
				return null;
			}

			const client = overrideClient ?? await this.getClient(user);
			const newToken = await client.refresh(config['refresh-token']);
			config['id-token'] = newToken.id_token;
			config['refresh-token'] = newToken.refresh_token;
			this.currentTokenExpiration = newToken.expires_at;
		}

		return config['id-token'];
	}

	private async getClient(user: IUser): Promise<IOidcClient> {
		const config = user.authProvider?.config;
		if (!config?.['idp-issuer-url'] || !config['client-id']) {
			throw new Error('OIDC configuration is missing required fields');
		}

		const configuration = await loadOidcModule().discovery(config['idp-issuer-url'], config['client-id']);
		return new OidcClient(configuration);
	}
}
