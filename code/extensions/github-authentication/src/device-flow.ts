/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';
import { Log } from './common/logger';
import { ExtensionHost, GitHubTarget, getFlows } from './flows';
import { AuthProviderType, UriEventHandler } from './github';
import { crypto } from './node/crypto';

interface FlowTriggerOptions {
	scopes: string;
	baseUri: vscode.Uri;
	logger: Log;
	redirectUri: vscode.Uri;
	nonce: string;
	callbackUri: vscode.Uri;
	uriHandler: UriEventHandler;
	enterpriseUri?: vscode.Uri;
}

interface Flow {
	label: string;
	trigger(options: FlowTriggerOptions): Promise<string>;
}

let logger: Log;
let deviceCodeFlow: Flow | undefined;
let flowOptions: FlowTriggerOptions;

export async function initialize(context: vscode.ExtensionContext): Promise<void> {
	logger = new Log(AuthProviderType.github);
	deviceCodeFlow = await getDeviceCodeFlow();

	if (deviceCodeFlow) {
		vscode.commands.executeCommand('setContext', 'github-authentication.device-code-flow.enabled', true);
		logger.info('Device Code flow is enabled');
		
		context.subscriptions.push(
			vscode.commands.registerCommand('github-authentication.device-code-flow', (scopes: string) => {
				return getToken(scopes);
			}),
		);
	} else {
		logger.info('Device Code flow is not available');
	}
}

async function getFlowTriggerOptions(scopes?: string): Promise<FlowTriggerOptions> {
	if (flowOptions) {
		return scopes ? { ...flowOptions, scopes } : flowOptions;
	}

	const nonce: string = crypto.getRandomValues(new Uint32Array(2)).reduce((prev, curr) => prev += curr.toString(16), '');
	const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.github-authentication/did-authenticate?nonce=${encodeURIComponent(nonce)}`));

	flowOptions = {
		logger,
		nonce,
		callbackUri,
		scopes: scopes ? scopes : 'user:email',
		uriHandler: new UriEventHandler(),
		baseUri: vscode.Uri.parse('https://github.com/'),
		redirectUri: vscode.Uri.parse('https://vscode.dev/redirect'),
	}
	return flowOptions;
}

async function getDeviceCodeFlow(): Promise<Flow | undefined> {
	const flows = getFlows({ target: GitHubTarget.DotCom, extensionHost: ExtensionHost.Remote, isSupportedClient: true });
	const filteredFlows = flows.filter(flow => {
		const deviceCodeLabel = vscode.l10n.t('device code');
		return flow.label === deviceCodeLabel;
	});

	return filteredFlows.length > 0 ? filteredFlows[0] : undefined;
}

export async function getToken(scopes: string): Promise<string> {
	if (!deviceCodeFlow) {
		throw new Error('Device Code Flow is not available');
	}

	const flowOptions = await getFlowTriggerOptions(scopes);
	logger.info(`using ${deviceCodeFlow.label} flow  with ${flowOptions.scopes} scopes to get token...`);

	const token = await deviceCodeFlow.trigger(flowOptions);

	logger.info(`the token was provided successfully!`);
	return token;
}


