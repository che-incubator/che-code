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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Event } from '../../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { FetchOptions, IAbortController, IFetcherService, PaginationOptions, Response, WebSocketConnection } from '../../../../networking/common/fetcherService';
import { createFakeResponse } from '../../../../test/node/fetcher';
import { createPlatformServices } from '../../../../test/node/services';
import { CopilotTokenManagerFromGitHubToken } from '../../../node/copilotTokenManager';

describe('Che: Copilot token request', () => {
	let disposables: DisposableStore;

	beforeEach(() => {
		disposables = new DisposableStore();
	});

	afterEach(() => {
		disposables.dispose();
	});

	it('keeps the HTTP status of a token response that cannot be parsed', async () => {
		const testingServiceCollection = createPlatformServices();
		testingServiceCollection.define(IFetcherService, new TokenResponseFetcherService(403, '403 Forbidden'));
		const accessor = disposables.add(testingServiceCollection.createTestingAccessor());

		const tokenManager = accessor.get(IInstantiationService).createInstance(CopilotTokenManagerFromGitHubToken, 'valid', 'valid-user');
		expect(await tokenManager.checkCopilotToken()).toEqual({
			kind: 'failure',
			reason: 'ParseFailed',
			message: 'Response is not valid: "403 Forbidden"',
			status: 403,
		});
	});
});

/**
 * Responds to the Copilot token request with the given status and body.
 */
class TokenResponseFetcherService implements IFetcherService {

	declare readonly _serviceBrand: undefined;
	readonly onDidFetch = Event.None;
	readonly onDidCompleteFetch = Event.None;

	constructor(private readonly tokenStatus: number, private readonly tokenResponse: unknown) {
	}

	fetchWithPagination<T>(_baseUrl: string, _options: PaginationOptions<T>): Promise<T[]> {
		throw new Error('Method not implemented.');
	}
	getUserAgentLibrary(): string {
		return 'test';
	}
	async fetch(url: string, _options: FetchOptions): Promise<Response> {
		if (url.endsWith('copilot_internal/v2/token')) {
			return createFakeResponse(this.tokenStatus, this.tokenResponse);
		}
		return createFakeResponse(404, '');
	}
	createWebSocket(_url: string): WebSocketConnection {
		throw new Error('Method not implemented.');
	}
	disconnectAll(): Promise<unknown> {
		throw new Error('Method not implemented.');
	}
	makeAbortController(): IAbortController {
		throw new Error('Method not implemented.');
	}
	isAbortError(_e: unknown): boolean {
		throw new Error('Method not implemented.');
	}
	isInternetDisconnectedError(_e: unknown): boolean {
		throw new Error('Method not implemented.');
	}
	isFetcherError(_err: unknown): boolean {
		throw new Error('Method not implemented.');
	}
	isNetworkProcessCrashedError(_err: unknown): boolean {
		throw new Error('Method not implemented.');
	}
	getUserMessageForFetcherError(_err: unknown): string {
		throw new Error('Method not implemented.');
	}
}
