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

import { commands } from 'vscode';
import { ILogService } from '../../../log/common/logService';
import { TokenInfoOrError } from '../../common/copilotToken';

/**
 * Asks the Che GitHub authentication provider whether the session uses a Device Authentication token.
 * Returns `undefined` outside of Che or when it can not be determined.
 */
async function isCheDeviceAuthSession(sessionId: string): Promise<boolean | undefined> {
	try {
		return await commands.executeCommand<boolean | undefined>('github-authentication.device-code-flow.is-device-auth-session', sessionId);
	} catch {
		return undefined;
	}
}

/**
 * Maps a failed exchange of a workspace token (PAT) for a Copilot token to `GitHubLoginFailed`,
 * so that the Sign In welcome view is shown and Sign In starts Device Authentication.
 *
 * A Device Authentication token can be exchanged for a Copilot token, so its failure is temporary:
 * the original result is kept, so the chat stays and the offline check retries instead of asking to sign in again.
 */
export async function handleCheTokenExchangeResult(
	tokenResult: TokenInfoOrError,
	sessionId: string,
	logService: ILogService,
	isDeviceAuthSession: (sessionId: string) => Promise<boolean | undefined> = isCheDeviceAuthSession,
): Promise<TokenInfoOrError> {
	if (tokenResult.kind !== 'failure') {
		return tokenResult;
	}

	const isNotAuthorized = tokenResult.reason === 'NotAuthorized' && !tokenResult.notification_id;
	const isForbidden = tokenResult.reason === 'ParseFailed' && tokenResult.status === 403;
	if (!isNotAuthorized && !isForbidden) {
		return tokenResult;
	}

	if (await isDeviceAuthSession(sessionId)) {
		logService.info(`Copilot token exchange failed for Device Authentication token (reason: ${tokenResult.reason}), treating as a temporary failure`);
		return tokenResult;
	}

	if (isForbidden) {
		logService.info('Copilot token exchange returned 403 block, triggering sign-in flow');
	} else {
		logService.info('Copilot token exchange failed (workspace token cannot be exchanged for Copilot token), triggering sign-in flow');
	}
	return { kind: 'failure', reason: 'GitHubLoginFailed' };
}
