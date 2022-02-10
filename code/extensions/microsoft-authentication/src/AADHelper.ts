/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as randomBytes from 'randombytes';
import * as querystring from 'querystring';
import { Buffer } from 'buffer';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { v4 as uuid } from 'uuid';
import fetch, { Response } from 'node-fetch';
import { createServer, startServer } from './authServer';
import { Keychain } from './keychain';
import Logger from './logger';
import { toBase64UrlEncoding } from './utils';
import { sha256 } from './env/node/sha256';
import { BetterTokenStorage, IDidChangeInOtherWindowEvent } from './betterSecretStorage';

const localize = nls.loadMessageBundle();

const redirectUrl = 'https://vscode-redirect.azurewebsites.net/';
const loginEndpointUrl = 'https://login.microsoftonline.com/';
const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';

interface IToken {
	accessToken?: string; // When unable to refresh due to network problems, the access token becomes undefined
	idToken?: string; // depending on the scopes can be either supplied or empty

	expiresIn?: number; // How long access token is valid, in seconds
	expiresAt?: number; // UNIX epoch time at which token will expire
	refreshToken: string;

	account: {
		label: string;
		id: string;
	};
	scope: string;
	sessionId: string; // The account id + the scope
}

interface ITokenClaims {
	tid: string;
	email?: string;
	unique_name?: string;
	exp?: number;
	preferred_username?: string;
	oid?: string;
	altsecid?: string;
	ipd?: string;
	scp: string;
}

interface IStoredSession {
	id: string;
	refreshToken: string;
	scope: string; // Scopes are alphabetized and joined with a space
	account: {
		label?: string;
		displayName?: string;
		id: string;
	};
}

export interface ITokenResponse {
	access_token: string;
	expires_in: number;
	ext_expires_in: number;
	refresh_token: string;
	scope: string;
	token_type: string;
	id_token?: string;
}

export interface IMicrosoftTokens {
	accessToken: string;
	idToken?: string;
}

interface IScopeData {
	scopes: string[];
	scopeStr: string;
	scopesToSend: string;
	clientId: string;
	tenant: string;
}

function parseQuery(uri: vscode.Uri) {
	return uri.query.split('&').reduce((prev: any, current) => {
		const queryString = current.split('=');
		prev[queryString[0]] = queryString[1];
		return prev;
	}, {});
}

export const onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

export const REFRESH_NETWORK_FAILURE = 'Network failure';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}
}

export class AzureActiveDirectoryService {
	// For details on why this is set to 2/3... see https://github.com/microsoft/vscode/issues/133201#issuecomment-966668197
	private static REFRESH_TIMEOUT_MODIFIER = 1000 * 2 / 3;
	private static POLLING_CONSTANT = 1000 * 60 * 30;
	private _tokens: IToken[] = [];
	private _refreshTimeouts: Map<string, NodeJS.Timeout> = new Map<string, NodeJS.Timeout>();
	private _refreshingPromise: Promise<any> | undefined;
	private _uriHandler: UriEventHandler;

	// Used to keep track of current requests when not using the local server approach.
	private _pendingStates = new Map<string, string[]>();
	private _codeExchangePromises = new Map<string, Promise<vscode.AuthenticationSession>>();
	private _codeVerfifiers = new Map<string, string>();

	private readonly _tokenStorage: BetterTokenStorage<IStoredSession>;

	constructor(private _context: vscode.ExtensionContext) {
		this._tokenStorage = new BetterTokenStorage('microsoft.login.keylist', _context);
		this._uriHandler = new UriEventHandler();
		_context.subscriptions.push(vscode.window.registerUriHandler(this._uriHandler));
		_context.subscriptions.push(this._tokenStorage.onDidChangeInOtherWindow((e) => this.checkForUpdates(e)));
	}

	public async initialize(): Promise<void> {
		Logger.info('Reading sessions from secret storage...');
		let sessions = await this._tokenStorage.getAll();
		Logger.info(`Got ${sessions.length} stored sessions`);

		if (!sessions.length) {
			sessions = await this.migrate();
		}

		const refreshes = sessions.map(async session => {
			Logger.trace(`Read the following stored session with scopes: ${session.scope}`);
			const scopes = session.scope.split(' ');
			const scopeData: IScopeData = {
				scopes,
				scopeStr: session.scope,
				// filter our special scopes
				scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
				clientId: this.getClientId(scopes),
				tenant: this.getTenantId(scopes),
			};
			try {
				await this.refreshToken(session.refreshToken, scopeData, session.id);
			} catch (e) {
				// If we aren't connected to the internet, then wait and try to refresh again later.
				if (e.message === REFRESH_NETWORK_FAILURE) {
					this._tokens.push({
						accessToken: undefined,
						refreshToken: session.refreshToken,
						account: {
							label: session.account.label ?? session.account.displayName!,
							id: session.account.id
						},
						scope: session.scope,
						sessionId: session.id
					});
				} else {
					Logger.error(e);
					await this.removeSession(session.id);
				}
			}
		});

		const result = await Promise.allSettled(refreshes);
		for (const res of result) {
			if (res.status === 'rejected') {
				Logger.error(`Failed to initialize stored data: ${res.reason}`);
				this.clearSessions();
			}
		}
	}

	//#region session operations

	async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
		Logger.info(`Getting sessions for ${scopes?.join(',') ?? 'all scopes'}...`);
		if (this._refreshingPromise) {
			Logger.info('Refreshing in progress. Waiting for completion before continuing.');
			try {
				await this._refreshingPromise;
			} catch (e) {
				// this will get logged in the refresh function.
			}
		}
		if (!scopes) {
			const sessions = this._tokens.map(token => this.convertToSessionSync(token));
			Logger.info(`Got ${sessions.length} sessions for all scopes...`);
			return sessions;
		}

		const orderedScopes = scopes.sort().join(' ');
		const matchingTokens = this._tokens.filter(token => token.scope === orderedScopes);
		Logger.info(`Got ${matchingTokens.length} sessions for ${scopes?.join(',')}...`);
		return Promise.all(matchingTokens.map(token => this.convertToSession(token)));
	}

	public createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
		const scopeData: IScopeData = {
			scopes,
			scopeStr: scopes.join(' '),
			// filter our special scopes
			scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
			clientId: this.getClientId(scopes),
			tenant: this.getTenantId(scopes),
		};

		Logger.info(`Logging in for the following scopes: ${scopeData.scopeStr}`);
		if (!scopeData.scopes.includes('offline_access')) {
			Logger.info('Warning: The \'offline_access\' scope was not included, so the generated token will not be able to be refreshed.');
		}

		const runsRemote = vscode.env.remoteName !== undefined;
		const runsServerless = vscode.env.remoteName === undefined && vscode.env.uiKind === vscode.UIKind.Web;
		if (runsRemote || runsServerless) {
			return this.createSessionWithoutLocalServer(scopeData);
		}

		try {
			return this.createSessionWithLocalServer(scopeData);
		} catch (e) {
			Logger.error(`Error creating session for scopes: ${scopeData.scopeStr} Error: ${e}`);

			// If the error was about starting the server, try directly hitting the login endpoint instead
			if (e.message === 'Error listening to server' || e.message === 'Closed' || e.message === 'Timeout waiting for port') {
				return this.createSessionWithoutLocalServer(scopeData);
			}

			throw e;
		}
	}

	private async createSessionWithLocalServer(scopeData: IScopeData) {
		const nonce = randomBytes(16).toString('base64');
		const { server, redirectPromise, codePromise } = createServer(nonce);

		let token: IToken | undefined;
		try {
			const port = await startServer(server);
			vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}/signin?nonce=${encodeURIComponent(nonce)}`));

			const redirectReq = await redirectPromise;
			if ('err' in redirectReq) {
				const { err, res } = redirectReq;
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unknown error')}` });
				res.end();
				throw err;
			}

			const host = redirectReq.req.headers.host || '';
			const updatedPortStr = (/^[^:]+:(\d+)$/.exec(Array.isArray(host) ? host[0] : host) || [])[1];
			const updatedPort = updatedPortStr ? parseInt(updatedPortStr, 10) : port;

			const state = `${updatedPort},${encodeURIComponent(nonce)}`;

			const codeVerifier = toBase64UrlEncoding(randomBytes(32).toString('base64'));
			const codeChallenge = toBase64UrlEncoding(await sha256(codeVerifier));

			const loginUrl = `${loginEndpointUrl}${scopeData.tenant}/oauth2/v2.0/authorize?response_type=code&response_mode=query&client_id=${encodeURIComponent(scopeData.clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${state}&scope=${encodeURIComponent(scopeData.scopesToSend)}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`;

			redirectReq.res.writeHead(302, { Location: loginUrl });
			redirectReq.res.end();

			const codeRes = await codePromise;
			const res = codeRes.res;

			try {
				if ('err' in codeRes) {
					throw codeRes.err;
				}
				token = await this.exchangeCodeForToken(codeRes.code, codeVerifier, scopeData);
				if (token.expiresIn) {
					this.setSessionTimeout(token.sessionId, token.refreshToken, scopeData, token.expiresIn * AzureActiveDirectoryService.REFRESH_TIMEOUT_MODIFIER);
				}
				await this.setToken(token, scopeData);
				Logger.info(`Login successful for scopes: ${scopeData.scopeStr}`);
				res.writeHead(302, { Location: '/' });
				const session = await this.convertToSession(token);
				return session;
			} catch (err) {
				res.writeHead(302, { Location: `/?error=${encodeURIComponent(err && err.message || 'Unknown error')}` });
				throw err;
			} finally {
				res.end();
			}
		} finally {
			setTimeout(() => {
				server.close();
			}, 5000);
		}
	}

	private async createSessionWithoutLocalServer(scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.microsoft-authentication`));
		const nonce = randomBytes(16).toString('base64');
		const port = (callbackUri.authority.match(/:([0-9]*)$/) || [])[1] || (callbackUri.scheme === 'https' ? 443 : 80);
		const callbackEnvironment = AzureActiveDirectoryService.getCallbackEnvironment(callbackUri);
		const state = `${callbackEnvironment},${port},${encodeURIComponent(nonce)},${encodeURIComponent(callbackUri.query)}`;
		const signInUrl = `${loginEndpointUrl}${scopeData.tenant}/oauth2/v2.0/authorize`;
		let uri = vscode.Uri.parse(signInUrl);
		const codeVerifier = toBase64UrlEncoding(randomBytes(32).toString('base64'));
		const codeChallenge = toBase64UrlEncoding(await sha256(codeVerifier));
		uri = uri.with({
			query: `response_type=code&client_id=${encodeURIComponent(scopeData.clientId)}&response_mode=query&redirect_uri=${redirectUrl}&state=${state}&scope=${scopeData.scopesToSend}&prompt=select_account&code_challenge_method=S256&code_challenge=${codeChallenge}`
		});
		vscode.env.openExternal(uri);

		const timeoutPromise = new Promise((_: (value: vscode.AuthenticationSession) => void, reject) => {
			const wait = setTimeout(() => {
				clearTimeout(wait);
				reject('Login timed out.');
			}, 1000 * 60 * 5);
		});

		const existingStates = this._pendingStates.get(scopeData.scopeStr) || [];
		this._pendingStates.set(scopeData.scopeStr, [...existingStates, state]);

		// Register a single listener for the URI callback, in case the user starts the login process multiple times
		// before completing it.
		let existingPromise = this._codeExchangePromises.get(scopeData.scopeStr);
		if (!existingPromise) {
			existingPromise = this.handleCodeResponse(scopeData);
			this._codeExchangePromises.set(scopeData.scopeStr, existingPromise);
		}

		this._codeVerfifiers.set(state, codeVerifier);

		return Promise.race([existingPromise, timeoutPromise])
			.finally(() => {
				this._pendingStates.delete(scopeData.scopeStr);
				this._codeExchangePromises.delete(scopeData.scopeStr);
				this._codeVerfifiers.delete(state);
			});
	}

	public async removeSession(sessionId: string, writeToDisk: boolean = true): Promise<vscode.AuthenticationSession | undefined> {
		Logger.info(`Logging out of session '${sessionId}'`);
		const tokenIndex = this._tokens.findIndex(token => token.sessionId === sessionId);
		if (tokenIndex === -1) {
			Logger.info(`Session not found '${sessionId}'`);
			return undefined;
		}

		const token = this._tokens[tokenIndex];
		this._tokens.splice(tokenIndex, 1);
		this.removeSessionTimeout(sessionId);

		if (writeToDisk) {
			await this._tokenStorage.delete(sessionId);
		}

		const session = this.convertToSessionSync(token);
		Logger.info(`Sending change event for session that was removed with scopes: ${token.scope}`);
		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		Logger.info(`Logged out of session '${sessionId}' with scopes: ${token.scope}`);
		return session;
	}

	public async clearSessions() {
		Logger.info('Logging out of all sessions');
		this._tokens = [];
		await this._tokenStorage.deleteAll();

		this._refreshTimeouts.forEach(timeout => {
			clearTimeout(timeout);
		});

		this._refreshTimeouts.clear();
	}

	//#endregion

	//#region timeout

	private setSessionTimeout(sessionId: string, refreshToken: string, scopeData: IScopeData, timeout: number) {
		this.removeSessionTimeout(sessionId);
		this._refreshTimeouts.set(sessionId, setTimeout(async () => {
			try {
				const refreshedToken = await this.refreshToken(refreshToken, scopeData, sessionId);
				Logger.info('Triggering change session event...');
				onDidChangeSessions.fire({ added: [], removed: [], changed: [this.convertToSessionSync(refreshedToken)] });
			} catch (e) {
				if (e.message !== REFRESH_NETWORK_FAILURE) {
					await this.removeSession(sessionId);
				}
			}
		}, timeout));
	}

	private removeSessionTimeout(sessionId: string): void {
		const timeout = this._refreshTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this._refreshTimeouts.delete(sessionId);
		}
	}

	//#endregion

	//#region convert operations

	private convertToTokenSync(json: ITokenResponse, scopeData: IScopeData, existingId?: string): IToken {
		let claims = undefined;

		try {
			claims = JSON.parse(Buffer.from(json.access_token.split('.')[1], 'base64').toString());
		} catch (e) {
			if (json.id_token) {
				Logger.info('Attempting to parse id_token instead since access_token was not parsable');
				claims = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64').toString());
			} else {
				throw e;
			}
		}

		return {
			expiresIn: json.expires_in,
			expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
			accessToken: json.access_token,
			idToken: json.id_token,
			refreshToken: json.refresh_token,
			scope: scopeData.scopeStr,
			sessionId: existingId || `${claims.tid}/${(claims.oid || (claims.altsecid || '' + claims.ipd || ''))}/${uuid()}`,
			account: {
				label: claims.email || claims.unique_name || claims.preferred_username || 'user@example.com',
				id: `${claims.tid}/${(claims.oid || (claims.altsecid || '' + claims.ipd || ''))}`
			}
		};
	}

	/**
	 * Return a session object without checking for expiry and potentially refreshing.
	 * @param token The token information.
	 */
	private convertToSessionSync(token: IToken): vscode.AuthenticationSession {
		return {
			id: token.sessionId,
			accessToken: token.accessToken!,
			idToken: token.idToken,
			account: token.account,
			scopes: token.scope.split(' ')
		};
	}

	private async convertToSession(token: IToken): Promise<vscode.AuthenticationSession> {
		if (token.accessToken && (!token.expiresAt || token.expiresAt > Date.now())) {
			token.expiresAt
				? Logger.info(`Token available from cache (for scopes ${token.scope}), expires in ${token.expiresAt - Date.now()} milliseconds`)
				: Logger.info('Token available from cache (for scopes ${token.scope})');
			return {
				id: token.sessionId,
				accessToken: token.accessToken,
				idToken: token.idToken,
				account: token.account,
				scopes: token.scope.split(' ')
			};
		}

		try {
			Logger.info(`Token expired or unavailable (for scopes ${token.scope}), trying refresh`);
			const scopes = token.scope.split(' ');
			const scopeData: IScopeData = {
				scopes,
				scopeStr: token.scope,
				// filter our special scopes
				scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
				clientId: this.getClientId(scopes),
				tenant: this.getTenantId(scopes),
			};
			const refreshedToken = await this.refreshToken(token.refreshToken, scopeData, token.sessionId);
			if (refreshedToken.accessToken) {
				return {
					id: token.sessionId,
					accessToken: refreshedToken.accessToken,
					idToken: refreshedToken.idToken,
					account: token.account,
					scopes: token.scope.split(' ')
				};
			} else {
				throw new Error();
			}
		} catch (e) {
			throw new Error('Unavailable due to network problems');
		}
	}

	//#endregion

	//#region refresh logic

	private async refreshToken(refreshToken: string, scopeData: IScopeData, sessionId: string): Promise<IToken> {
		this._refreshingPromise = this.doRefreshToken(refreshToken, scopeData, sessionId);
		try {
			const result = await this._refreshingPromise;
			return result;
		} finally {
			this._refreshingPromise = undefined;
		}
	}

	private async doRefreshToken(refreshToken: string, scopeData: IScopeData, sessionId: string): Promise<IToken> {
		Logger.info(`Refreshing token for scopes: ${scopeData.scopeStr}`);
		const postData = querystring.stringify({
			refresh_token: refreshToken,
			client_id: scopeData.clientId,
			grant_type: 'refresh_token',
			scope: scopeData.scopesToSend
		});

		const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
		const endpointUrl = proxyEndpoints?.microsoft || loginEndpointUrl;
		const endpoint = `${endpointUrl}${scopeData.tenant}/oauth2/v2.0/token`;

		try {
			const json = await this.fetchTokenResponse(endpoint, postData, scopeData);
			const token = this.convertToTokenSync(json, scopeData, sessionId);
			if (token.expiresIn) {
				this.setSessionTimeout(token.sessionId, token.refreshToken, scopeData, token.expiresIn * AzureActiveDirectoryService.REFRESH_TIMEOUT_MODIFIER);
			}
			await this.setToken(token, scopeData);
			Logger.info(`Token refresh success for scopes: ${token.scope}`);
			return token;
		} catch (e) {
			if (e.message === REFRESH_NETWORK_FAILURE) {
				// We were unable to refresh because of a network failure (i.e. the user lost internet access).
				// so set up a timeout to try again later.
				this.setSessionTimeout(sessionId, refreshToken, scopeData, AzureActiveDirectoryService.POLLING_CONSTANT);
				throw e;
			}
			vscode.window.showErrorMessage(localize('signOut', "You have been signed out because reading stored authentication information failed."));
			Logger.error(`Refreshing token failed (for scopes: ${scopeData.scopeStr}): ${e.message}`);
			throw new Error('Refreshing token failed');
		}
	}

	//#endregion

	//#region scope parsers

	private getClientId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_CLIENT_ID:')) {
				return current.split('VSCODE_CLIENT_ID:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_CLIENT_ID;
	}

	private getTenantId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_TENANT:')) {
				return current.split('VSCODE_TENANT:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_TENANT;
	}

	//#endregion

	//#region oauth flow

	private async handleCodeResponse(scopeData: IScopeData): Promise<vscode.AuthenticationSession> {
		let uriEventListener: vscode.Disposable;
		return new Promise((resolve: (value: vscode.AuthenticationSession) => void, reject) => {
			uriEventListener = this._uriHandler.event(async (uri: vscode.Uri) => {
				try {
					const query = parseQuery(uri);
					const code = query.code;
					const acceptedStates = this._pendingStates.get(scopeData.scopeStr) || [];
					// Workaround double encoding issues of state in web
					if (!acceptedStates.includes(query.state) && !acceptedStates.includes(decodeURIComponent(query.state))) {
						throw new Error('State does not match.');
					}

					const verifier = this._codeVerfifiers.get(query.state) ?? this._codeVerfifiers.get(decodeURIComponent(query.state));
					if (!verifier) {
						throw new Error('No available code verifier');
					}

					const token = await this.exchangeCodeForToken(code, verifier, scopeData);
					if (token.expiresIn) {
						this.setSessionTimeout(token.sessionId, token.refreshToken, scopeData, token.expiresIn * AzureActiveDirectoryService.REFRESH_TIMEOUT_MODIFIER);
					}
					await this.setToken(token, scopeData);

					const session = await this.convertToSession(token);
					resolve(session);
				} catch (err) {
					reject(err);
				}
			});
		}).then(result => {
			uriEventListener.dispose();
			return result;
		}).catch(err => {
			uriEventListener.dispose();
			throw err;
		});
	}

	private async exchangeCodeForToken(code: string, codeVerifier: string, scopeData: IScopeData): Promise<IToken> {
		Logger.info(`Exchanging login code for token for scopes: ${scopeData.scopeStr}`);
		try {
			const postData = querystring.stringify({
				grant_type: 'authorization_code',
				code: code,
				client_id: scopeData.clientId,
				scope: scopeData.scopesToSend,
				code_verifier: codeVerifier,
				redirect_uri: redirectUrl
			});

			const proxyEndpoints: { [providerId: string]: string } | undefined = await vscode.commands.executeCommand('workbench.getCodeExchangeProxyEndpoints');
			const endpointUrl = proxyEndpoints?.microsoft || loginEndpointUrl;
			const endpoint = `${endpointUrl}${scopeData.tenant}/oauth2/v2.0/token`;

			const json = await this.fetchTokenResponse(endpoint, postData, scopeData);
			Logger.info(`Exchanging login code for token (for scopes: ${scopeData.scopeStr}) succeeded!`);
			return this.convertToTokenSync(json, scopeData);
		} catch (e) {
			Logger.error(`Error exchanging code for token (for scopes ${scopeData.scopeStr}): ${e}`);
			throw e;
		}
	}

	private async fetchTokenResponse(endpoint: string, postData: string, scopeData: IScopeData): Promise<ITokenResponse> {
		let attempts = 0;
		while (attempts <= 3) {
			attempts++;
			let result: Response | undefined;
			let errorMessage: string | undefined;
			try {
				result = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Content-Length': postData.length.toString()
					},
					body: postData
				});
			} catch (e) {
				errorMessage = e.message ?? e;
			}

			if (!result || result.status > 499) {
				if (attempts > 3) {
					Logger.error(`Fetching token failed for scopes (${scopeData.scopeStr}): ${result ? await result.text() : errorMessage}`);
					break;
				}
				// Exponential backoff
				await new Promise(resolve => setTimeout(resolve, 5 * attempts * attempts * 1000));
				continue;
			} else if (!result.ok) {
				// For 4XX errors, the user may actually have an expired token or have changed
				// their password recently which is throwing a 4XX. For this, we throw an error
				// so that the user can be prompted to sign in again.
				throw new Error(await result.text());
			}

			return await result.json() as ITokenResponse;
		}

		throw new Error(REFRESH_NETWORK_FAILURE);
	}

	//#endregion

	//#region storage operations

	private async setToken(token: IToken, scopeData: IScopeData): Promise<void> {
		Logger.info(`Setting token for scopes: ${scopeData.scopeStr}`);

		const existingTokenIndex = this._tokens.findIndex(t => t.sessionId === token.sessionId);
		if (existingTokenIndex > -1) {
			this._tokens.splice(existingTokenIndex, 1, token);
		} else {
			this._tokens.push(token);
		}

		await this._tokenStorage.store(token.sessionId, {
			id: token.sessionId,
			refreshToken: token.refreshToken,
			scope: token.scope,
			account: token.account
		});
	}

	private async checkForUpdates(e: IDidChangeInOtherWindowEvent<IStoredSession>): Promise<void> {
		const added: vscode.AuthenticationSession[] = [];
		const removed: vscode.AuthenticationSession[] = [];
		for (const key of e.added) {
			const session = await this._tokenStorage.get(key);
			if (!session) {
				Logger.error('session not found that was apparently just added');
				return;
			}
			const matchesExisting = this._tokens.some(token => token.scope === session.scope && token.sessionId === session.id);
			if (!matchesExisting && session.refreshToken) {
				try {
					const scopes = session.scope.split(' ');
					const scopeData: IScopeData = {
						scopes,
						scopeStr: session.scope,
						// filter our special scopes
						scopesToSend: scopes.filter(s => !s.startsWith('VSCODE_')).join(' '),
						clientId: this.getClientId(scopes),
						tenant: this.getTenantId(scopes),
					};
					Logger.info(`Session added in another window with scopes: ${session.scope}`);
					const token = await this.refreshToken(session.refreshToken, scopeData, session.id);
					Logger.info(`Sending change event for session that was added with scopes: ${scopeData.scopeStr}`);
					onDidChangeSessions.fire({ added: [this.convertToSessionSync(token)], removed: [], changed: [] });
					return;
				} catch (e) {
					// Network failures will automatically retry on next poll.
					if (e.message !== REFRESH_NETWORK_FAILURE) {
						await this.removeSession(session.id);
					}
					return;
				}
			}
		}

		for (const { value } of e.removed) {
			Logger.info(`Session removed in another window with scopes: ${value.scope}`);
			const session = await this.removeSession(value.id, false);
			if (session) {
				removed.push(session);
			}
		}
	}

	private async migrate() {
		Logger.info('Attempting to migrate stored sessions.');
		// const migrated = this._context.globalState.get<{ migrated: boolean }>('microsoft-better-storage-layout-migrated');
		// if (migrated?.migrated) {
		// 	return [];
		// }
		await this._context.globalState.update('microsoft-better-storage-layout-migrated', { migrated: true });
		const keychain = new Keychain(this._context);
		const storedData = await keychain.getToken();
		if (!storedData) {
			Logger.info('No stored sessions found.');
			return [];
		}

		try {
			const sessions = JSON.parse(storedData) as IStoredSession[];
			Logger.info(`Migrated ${sessions.length} stored sessions.`);
			return sessions;
		} catch (e) {
			Logger.info('Failed to parse stored sessions. Migrating no sessions.');
			return [];
		} finally {
			// await keychain.deleteToken();
		}
	}

	//#endregion

	//#region static methods

	private static getCallbackEnvironment(callbackUri: vscode.Uri): string {
		if (callbackUri.scheme !== 'https' && callbackUri.scheme !== 'http') {
			return callbackUri.scheme;
		}

		switch (callbackUri.authority) {
			case 'online.visualstudio.com':
				return 'vso';
			case 'online-ppe.core.vsengsaas.visualstudio.com':
				return 'vsoppe';
			case 'online.dev.core.vsengsaas.visualstudio.com':
				return 'vsodev';
			default:
				return callbackUri.authority;
		}
	}

	//#endregion
}
