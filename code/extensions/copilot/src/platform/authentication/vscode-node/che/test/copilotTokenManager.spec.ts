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

import { describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../testing/common/testLogService';
import { createTestExtendedTokenInfo, TokenInfoOrError } from '../../../common/copilotToken';
import { handleCheTokenExchangeResult } from '../copilotTokenManager';

describe('Che: Copilot token exchange result', () => {
	const notAuthorized: TokenInfoOrError = { kind: 'failure', reason: 'NotAuthorized' };
	const forbidden: TokenInfoOrError = { kind: 'failure', reason: 'ParseFailed', message: 'Response is not valid: "403 Forbidden"', status: 403 };
	const gitHubLoginFailed: TokenInfoOrError = { kind: 'failure', reason: 'GitHubLoginFailed' };

	function handle(tokenResults: TokenInfoOrError[], isDeviceAuthSession: (sessionId: string) => Promise<boolean | undefined>): Promise<TokenInfoOrError[]> {
		return Promise.all(tokenResults.map(tokenResult => handleCheTokenExchangeResult(tokenResult, 'session-id', new TestLogService(), isDeviceAuthSession)));
	}

	it('maps a failed exchange of a workspace token (PAT) to GitHubLoginFailed', async () => {
		expect(await handle([notAuthorized, forbidden], async () => false)).toEqual([gitHubLoginFailed, gitHubLoginFailed]);
	});

	it('maps a failed exchange to GitHubLoginFailed when the token type is unknown (outside of Che)', async () => {
		expect(await handle([notAuthorized, forbidden], async () => undefined)).toEqual([gitHubLoginFailed, gitHubLoginFailed]);
	});

	it('keeps a failed exchange of a Device Authentication token as a temporary failure', async () => {
		expect(await handle([notAuthorized, forbidden], async () => true)).toEqual([notAuthorized, forbidden]);
	});

	it('keeps other results without checking the token type', async () => {
		const isDeviceAuthSession = vi.fn(async () => false);
		const tokenResults: TokenInfoOrError[] = [
			{ kind: 'success', ...createTestExtendedTokenInfo() },
			{ kind: 'failure', reason: 'NotAuthorized', notification_id: 'no_copilot_access' },
			{ kind: 'failure', reason: 'ParseFailed', message: 'Unexpected token', status: 502 },
			{ kind: 'failure', reason: 'RequestFailed', message: 'Network request failed' },
		];

		expect(await handle(tokenResults, isDeviceAuthSession)).toEqual(tokenResults);
		expect(isDeviceAuthSession).not.toHaveBeenCalled();
	});
});
