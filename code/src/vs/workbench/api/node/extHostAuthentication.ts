/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import type * as vscode from 'vscode';
import * as http from 'http';
import { randomBytes } from 'crypto';
import { URL } from 'url';
import { ExtHostAuthentication, DynamicAuthProvider, IExtHostAuthentication } from '../common/extHostAuthentication.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { IExtHostInitDataService } from '../common/extHostInitDataService.js';
import { IExtHostWindow } from '../common/extHostWindow.js';
import { IExtHostUrlsService } from '../common/extHostUrls.js';
import { ILogger, ILoggerService } from '../../../platform/log/common/log.js';
import { MainThreadAuthenticationShape } from '../common/extHost.protocol.js';
import { IAuthorizationServerMetadata, IAuthorizationProtectedResourceMetadata, IAuthorizationTokenResponse, DEFAULT_AUTH_FLOW_PORT, IAuthorizationDeviceResponse, isAuthorizationDeviceResponse, isAuthorizationTokenResponse, IAuthorizationDeviceTokenErrorResponse } from '../../../base/common/oauth.js';
import { Emitter } from '../../../base/common/event.js';
import { DeferredPromise, raceCancellationError } from '../../../base/common/async.js';
import { IExtHostProgress } from '../common/extHostProgress.js';
import { IProgressStep } from '../../../platform/progress/common/progress.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';

interface IOAuthResult {
	code: string;
	state: string;
}

interface ILoopbackServer {
	/**
	 * The state parameter used in the OAuth flow.
	 */
	readonly state: string;

	/**
	 * Starts the server.
	 * @throws If the server fails to start.
	 * @throws If the server is already started.
	 */
	start(): Promise<void>;

	/**
	 * Stops the server.
	 * @throws If the server is not started.
	 * @throws If the server fails to stop.
	 */
	stop(): Promise<void>;

	/**
	 * Returns a promise that resolves to the result of the OAuth flow.
	 */
	waitForOAuthResponse(): Promise<IOAuthResult>;
}

class LoopbackAuthServer implements ILoopbackServer {
	private readonly _server: http.Server;
	private readonly _resultPromise: Promise<IOAuthResult>;

	private _state = randomBytes(16).toString('base64');
	private _port: number | undefined;

	constructor(private readonly _logger: ILogger, private readonly _appUri: URI) {
		const deferredPromise = new DeferredPromise<IOAuthResult>();
		this._resultPromise = deferredPromise.p;

		this._server = http.createServer((req, res) => {
			const reqUrl = new URL(req.url!, `http://${req.headers.host}`);
			switch (reqUrl.pathname) {
				case '/': {
					const code = reqUrl.searchParams.get('code') ?? undefined;
					const state = reqUrl.searchParams.get('state') ?? undefined;
					const error = reqUrl.searchParams.get('error') ?? undefined;
					if (error) {
						res.writeHead(302, { location: `/?error=${reqUrl.searchParams.get('error_description')}` });
						res.end();
						deferredPromise.error(new Error(error));
						break;
					}
					if (!code || !state) {
						res.writeHead(400);
						res.end();
						break;
					}
					if (this.state !== state) {
						res.writeHead(302, { location: `/?error=${encodeURIComponent('State does not match.')}` });
						res.end();
						deferredPromise.error(new Error('State does not match.'));
						break;
					}
					deferredPromise.complete({ code, state });
					res.writeHead(302, { location: '/success' });
					res.end();
					break;
				}
				// Serve the static files
				case '/success':
					this._sendSuccessPage(res);
					break;
				default:
					res.writeHead(404);
					res.end();
					break;
			}
		});
	}

	get state(): string { return this._state; }
	get redirectUri(): string {
		if (this._port === undefined) {
			throw new Error('Server is not started yet');
		}
		return `http://127.0.0.1:${this._port}/`;
	}

	private _sendSuccessPage(res: http.ServerResponse): void {
		const html = getHtml(this._appUri);
		res.writeHead(200, {
			'Content-Type': 'text/html',
			'Content-Length': Buffer.byteLength(html, 'utf8')
		});
		res.end(html);
	}

	start(): Promise<void> {
		const deferredPromise = new DeferredPromise<void>();
		if (this._server.listening) {
			throw new Error('Server is already started');
		}
		const portTimeout = setTimeout(() => {
			deferredPromise.error(new Error('Timeout waiting for port'));
		}, 5000);
		this._server.on('listening', () => {
			const address = this._server.address();
			if (typeof address === 'string') {
				this._port = parseInt(address);
			} else if (address instanceof Object) {
				this._port = address.port;
			} else {
				throw new Error('Unable to determine port');
			}

			clearTimeout(portTimeout);
			deferredPromise.complete();
		});
		this._server.on('error', err => {
			if ('code' in err && err.code === 'EADDRINUSE') {
				this._logger.error('Address in use, retrying with a different port...');
				setTimeout(() => {
					this._server.close();
					// Best effort to use a specific port, but fallback to a random one if it is in use
					this._server.listen(0, '127.0.0.1');
				}, 1000);
				return;
			}
			clearTimeout(portTimeout);
			deferredPromise.error(new Error(`Error listening to server: ${err}`));
		});
		this._server.on('close', () => {
			deferredPromise.error(new Error('Closed'));
		});
		// Best effort to use a specific port, but fallback to a random one if it is in use
		this._server.listen(DEFAULT_AUTH_FLOW_PORT, '127.0.0.1');
		return deferredPromise.p;
	}

	stop(): Promise<void> {
		const deferredPromise = new DeferredPromise<void>();
		if (!this._server.listening) {
			deferredPromise.complete();
			return deferredPromise.p;
		}
		this._server.close((err) => {
			if (err) {
				deferredPromise.error(err);
			} else {
				deferredPromise.complete();
			}
		});
		// If the server is not closed within 5 seconds, reject the promise
		setTimeout(() => {
			if (!deferredPromise.isResolved) {
				deferredPromise.error(new Error('Timeout waiting for server to close'));
			}
		}, 5000);
		return deferredPromise.p;
	}

	waitForOAuthResponse(): Promise<IOAuthResult> {
		return this._resultPromise;
	}
}

export class NodeDynamicAuthProvider extends DynamicAuthProvider {

	constructor(
		extHostWindow: IExtHostWindow,
		extHostUrls: IExtHostUrlsService,
		initData: IExtHostInitDataService,
		extHostProgress: IExtHostProgress,
		loggerService: ILoggerService,
		proxy: MainThreadAuthenticationShape,
		authorizationServer: URI,
		serverMetadata: IAuthorizationServerMetadata,
		resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		clientId: string,
		onDidDynamicAuthProviderTokensChange: Emitter<{ authProviderId: string; clientId: string; tokens: any[] }>,
		initialTokens: any[]
	) {
		super(
			extHostWindow,
			extHostUrls,
			initData,
			extHostProgress,
			loggerService,
			proxy,
			authorizationServer,
			serverMetadata,
			resourceMetadata,
			clientId,
			onDidDynamicAuthProviderTokensChange,
			initialTokens
		);

		// Prepend Node-specific flows to the existing flows
		if (!initData.remote.isRemote) {
			// If we are not in a remote environment, we can use the loopback server for authentication
			this._createFlows.unshift({
				label: nls.localize('loopback', "Loopback Server"),
				handler: (scopes, progress, token) => this._createWithLoopbackServer(scopes, progress, token)
			});
		}

		// Add device code flow support (works in all environments)
		this._createFlows.push({
			label: nls.localize('device code', "Device Code"),
			handler: (scopes, progress, token) => this._createWithDeviceCode(scopes, progress, token)
		});
	}

	private async _createWithLoopbackServer(scopes: string[], progress: vscode.Progress<IProgressStep>, token: vscode.CancellationToken): Promise<IAuthorizationTokenResponse> {
		// Generate PKCE code verifier (random string) and code challenge (SHA-256 hash of verifier)
		const codeVerifier = this.generateRandomString(64);
		const codeChallenge = await this.generateCodeChallenge(codeVerifier);

		// Generate a random state value to prevent CSRF
		const nonce = this.generateRandomString(32);
		const callbackUri = URI.parse(`${this._initData.environment.appUriScheme}://dynamicauthprovider/${this.authorizationServer.authority}/redirect?nonce=${nonce}`);
		let appUri: URI;
		try {
			appUri = await this._extHostUrls.createAppUri(callbackUri);
		} catch (error) {
			throw new Error(`Failed to create external URI: ${error}`);
		}

		// Prepare the authorization request URL
		const authorizationUrl = new URL(this._serverMetadata.authorization_endpoint!);
		authorizationUrl.searchParams.append('client_id', this.clientId);
		authorizationUrl.searchParams.append('response_type', 'code');
		authorizationUrl.searchParams.append('code_challenge', codeChallenge);
		authorizationUrl.searchParams.append('code_challenge_method', 'S256');
		const scopeString = scopes.join(' ');
		if (scopeString) {
			authorizationUrl.searchParams.append('scope', scopeString);
		}
		if (this._resourceMetadata?.resource) {
			// If a resource is specified, include it in the request
			authorizationUrl.searchParams.append('resource', this._resourceMetadata.resource);
		}

		// Create and start the loopback server
		const server = new LoopbackAuthServer(this._logger, appUri);
		try {
			await server.start();
		} catch (err) {
			throw new Error(`Failed to start loopback server: ${err}`);
		}

		// Update the authorization URL with the actual redirect URI
		authorizationUrl.searchParams.set('redirect_uri', server.redirectUri);
		authorizationUrl.searchParams.set('state', server.state);

		const promise = server.waitForOAuthResponse();
		// Set up a Uri Handler but it's just to redirect not to handle the code
		void this._proxy.$waitForUriHandler(appUri);

		try {
			// Open the browser for user authorization
			this._logger.info(`Opening authorization URL for scopes: ${scopeString}`);
			this._logger.trace(`Authorization URL: ${authorizationUrl.toString()}`);
			const opened = await this._extHostWindow.openUri(authorizationUrl.toString(), {});
			if (!opened) {
				throw new CancellationError();
			}
			progress.report({
				message: nls.localize('completeAuth', "Complete the authentication in the browser window that has opened."),
			});

			// Wait for the authorization code via the loopback server
			let code: string | undefined;
			try {
				const response = await raceCancellationError(promise, token);
				code = response.code;
			} catch (err) {
				if (isCancellationError(err)) {
					this._logger.info('Authorization code request was cancelled by the user.');
					throw err;
				}
				this._logger.error(`Failed to receive authorization code: ${err}`);
				throw new Error(`Failed to receive authorization code: ${err}`);
			}
			this._logger.info(`Authorization code received for scopes: ${scopeString}`);

			// Exchange the authorization code for tokens
			const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier, server.redirectUri);
			return tokenResponse;
		} finally {
			// Clean up the server
			setTimeout(() => {
				void server.stop();
			}, 5000);
		}
	}

	private async _createWithDeviceCode(scopes: string[], progress: vscode.Progress<IProgressStep>, token: vscode.CancellationToken): Promise<IAuthorizationTokenResponse> {
		if (!this._serverMetadata.token_endpoint) {
			throw new Error('Token endpoint not available in server metadata');
		}
		if (!this._serverMetadata.device_authorization_endpoint) {
			throw new Error('Device authorization endpoint not available in server metadata');
		}

		const deviceAuthUrl = this._serverMetadata.device_authorization_endpoint;
		const scopeString = scopes.join(' ');
		this._logger.info(`Starting device code flow for scopes: ${scopeString}`);

		// Step 1: Request device and user codes
		const deviceCodeRequest = new URLSearchParams();
		deviceCodeRequest.append('client_id', this.clientId);
		if (scopeString) {
			deviceCodeRequest.append('scope', scopeString);
		}
		if (this._resourceMetadata?.resource) {
			// If a resource is specified, include it in the request
			deviceCodeRequest.append('resource', this._resourceMetadata.resource);
		}

		let deviceCodeResponse: Response;
		try {
			deviceCodeResponse = await fetch(deviceAuthUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				},
				body: deviceCodeRequest.toString()
			});
		} catch (error) {
			this._logger.error(`Failed to request device code: ${error}`);
			throw new Error(`Failed to request device code: ${error}`);
		}

		if (!deviceCodeResponse.ok) {
			const text = await deviceCodeResponse.text();
			throw new Error(`Device code request failed: ${deviceCodeResponse.status} ${deviceCodeResponse.statusText} - ${text}`);
		}

		const deviceCodeData: IAuthorizationDeviceResponse = await deviceCodeResponse.json();
		if (!isAuthorizationDeviceResponse(deviceCodeData)) {
			this._logger.error('Invalid device code response received from server');
			throw new Error('Invalid device code response received from server');
		}
		this._logger.info(`Device code received: ${deviceCodeData.user_code}`);

		// Step 2: Show the device code modal
		const userConfirmed = await this._proxy.$showDeviceCodeModal(
			deviceCodeData.user_code,
			deviceCodeData.verification_uri
		);

		if (!userConfirmed) {
			throw new CancellationError();
		}

		// Step 3: Poll for token
		progress.report({
			message: nls.localize('waitingForAuth', "Open [{0}]({0}) in a new tab and paste your one-time code: {1}", deviceCodeData.verification_uri, deviceCodeData.user_code)
		});

		const pollInterval = (deviceCodeData.interval || 5) * 1000; // Convert to milliseconds
		const expiresAt = Date.now() + (deviceCodeData.expires_in * 1000);

		while (Date.now() < expiresAt) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Wait for the specified interval
			await new Promise(resolve => setTimeout(resolve, pollInterval));

			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Poll the token endpoint
			const tokenRequest = new URLSearchParams();
			tokenRequest.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
			tokenRequest.append('device_code', deviceCodeData.device_code);
			tokenRequest.append('client_id', this.clientId);

			try {
				const tokenResponse = await fetch(this._serverMetadata.token_endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Accept': 'application/json'
					},
					body: tokenRequest.toString()
				});

				if (tokenResponse.ok) {
					const tokenData: IAuthorizationTokenResponse = await tokenResponse.json();
					if (!isAuthorizationTokenResponse(tokenData)) {
						this._logger.error('Invalid token response received from server');
						throw new Error('Invalid token response received from server');
					}
					this._logger.info(`Device code flow completed successfully for scopes: ${scopeString}`);
					return tokenData;
				} else {
					let errorData: IAuthorizationDeviceTokenErrorResponse;
					try {
						errorData = await tokenResponse.json();
					} catch (e) {
						this._logger.error(`Failed to parse error response: ${e}`);
						throw new Error(`Token request failed with status ${tokenResponse.status}: ${tokenResponse.statusText}`);
					}

					// Handle known error cases
					if (errorData.error === 'authorization_pending') {
						// User hasn't completed authorization yet, continue polling
						continue;
					} else if (errorData.error === 'slow_down') {
						// Server is asking us to slow down
						await new Promise(resolve => setTimeout(resolve, pollInterval));
						continue;
					} else if (errorData.error === 'expired_token') {
						throw new Error('Device code expired. Please try again.');
					} else if (errorData.error === 'access_denied') {
						throw new CancellationError();
					} else {
						throw new Error(`Token request failed: ${errorData.error_description || errorData.error || 'Unknown error'}`);
					}
				}
			} catch (error) {
				if (isCancellationError(error)) {
					throw error;
				}
				this._logger.error(`Error polling for token: ${error}`);
				// Continue polling on network errors
				continue;
			}
		}

		throw new Error('Device code flow timed out. Please try again.');
	}
}

export class NodeExtHostAuthentication extends ExtHostAuthentication implements IExtHostAuthentication {

	protected override readonly _dynamicAuthProviderCtor = NodeDynamicAuthProvider;

	constructor(
		extHostRpc: IExtHostRpcService,
		initData: IExtHostInitDataService,
		extHostWindow: IExtHostWindow,
		extHostUrls: IExtHostUrlsService,
		extHostProgress: IExtHostProgress,
		extHostLoggerService: ILoggerService,
	) {
		super(extHostRpc, initData, extHostWindow, extHostUrls, extHostProgress, extHostLoggerService);
	}
}

function getHtml(appUri: URI) {
	return `<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8" />
	<title>GitHub Authentication - Sign In</title>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		html {
			height: 100%;
		}

		body {
			box-sizing: border-box;
			min-height: 100%;
			margin: 0;
			padding: 15px 30px;
			display: flex;
			flex-direction: column;
			color: white;
			font-family: "Segoe UI","Helvetica Neue","Helvetica",Arial,sans-serif;
			background-color: #2C2C32;
		}

		.branding {
			background-image: url('data:image/png;base64,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');
			background-size: 24px;
			background-repeat: no-repeat;
			background-position: left center;
			padding-left: 36px;
			font-size: 20px;
			letter-spacing: -0.04rem;
			font-weight: 400;
			color: white;
			text-decoration: none;
		}

		.message-container {
			flex-grow: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 0 30px;
		}

		.message {
			font-weight: 300;
			font-size: 1.4rem;
		}

		body.error .message {
			display: none;
		}

		body.error .error-message {
			display: block;
		}

		.error-message {
			display: none;
			font-weight: 300;
			font-size: 1.3rem;
		}

		.error-text {
			color: red;
			font-size: 1rem;
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Light"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.woff2") format("woff2"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/light/latest.svg#web") format("svg");
			font-weight: 200
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Semilight"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.woff2") format("woff2"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semilight/latest.svg#web") format("svg");
			font-weight: 300
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/normal/latest.svg#web") format("svg");
			font-weight: 400
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Semibold"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/semibold/latest.svg#web") format("svg");
			font-weight: 600
		}

		@font-face {
			font-family: 'Segoe UI';
			src: url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.eot"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.eot?#iefix") format("embedded-opentype");
			src: local("Segoe UI Bold"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.woff2") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.woff") format("woff"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.ttf") format("truetype"),url("https://c.s-microsoft.com/static/fonts/segoe-ui/west-european/bold/latest.svg#web") format("svg");
			font-weight: 700
		}
	</style>
</head>

<body>
	<a class="branding" href="https://code.visualstudio.com/">
		Visual Studio Code
	</a>
	<div class="message-container">
		<div class="message">
			You are signed in now and can close this page.
		</div>
		<div class="error-message">
			An error occurred while signing in:
			<div class="error-text"></div>
		</div>
	</div>
	<script>
		var search = window.location.search;
		var error = (/[?&^]error=([^&]+)/.exec(search) || [])[1];
		if (error) {
			document.querySelector('.error-text')
				.textContent = decodeURIComponent(error);
			document.querySelector('body')
				.classList.add('error');
		} else {
			// Redirect to the app URI after a 1-second delay to allow page to load
			setTimeout(function() {
				window.location.href = '${appUri.toString(true)}';
			}, 1000);
		}
	</script>
</body>
</html>`;
}
