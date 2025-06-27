/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { createRequestHMAC } from '../../../util/common/crypto';
import { Limiter } from '../../../util/vs/base/common/async';
import { env } from '../../../util/vs/base/common/process';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEndpointProvider } from '../../endpoint/common/endpointProvider';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IEmbeddingEndpoint, postRequest } from '../../networking/common/networking';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { Embedding, EmbeddingType, EmbeddingTypeInfo, EmbeddingVector, Embeddings, IEmbeddingsComputer, getWellKnownEmbeddingTypeInfo } from './embeddingsComputer';

interface RemoteEmbeddingResults {
	readonly type: 'success';
	readonly embeddings: EmbeddingVector[];
}
interface RemoteEmbeddingError {
	readonly type: 'failed';
	readonly reason: string;
}

export class RemoteEmbeddingsComputer implements IEmbeddingsComputer {

	declare readonly _serviceBrand: undefined;


	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IDomainService private readonly _domainService: IDomainService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IEnvService private readonly _envService: IEnvService,
		@IFetcherService private readonly _fetcherService: IFetcherService
	) { }

	public async computeEmbeddings(
		type: EmbeddingType,
		inputs: readonly string[],
		options?: { parallelism?: number },
		cancellationToken?: CancellationToken,
	): Promise<Embeddings | undefined> {
		const typeInfo = getWellKnownEmbeddingTypeInfo(type);
		if (!typeInfo) {
			throw new Error(`Unknown embedding type: ${type.id}`);
		}

		const endpoint = await this._endpointProvider.getEmbeddingsEndpoint(typeInfo.family);

		const batchSize = endpoint.maxBatchSize;
		// Open AI seems to allow 1 less than max tokens for the model requests. So if the max tokens is 8192, we can only send 8191 tokens.
		const maxTokens = endpoint.modelMaxPromptTokens - 1;
		return this.fetchResponseWithBatches(typeInfo, endpoint, inputs, cancellationToken, maxTokens, batchSize, options?.parallelism);
	}

	/**
	 * A recursive helper that drives the public `fetchResponse` function. This allows accepting a batch and supports backing off the endpoint.
	 * @param inputs The inputs to get embeddings for
	 * @param cancellationToken A cancellation token to allow cancelling the requests
	 * @param batchSize The batch size to calculate
	 * @returns The embeddings
	 */
	private async fetchResponseWithBatches(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingEndpoint,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined,
		maxTokens: number,
		batchSize: number,
		parallelism = 1,
	): Promise<Embeddings | undefined> {
		// First we loop through all inputs and count their token length, if one exceeds max tokens then we fail
		for (const input of inputs) {
			const inputTokenLength = await endpoint.acquireTokenizer().tokenLength(input);
			if (inputTokenLength > maxTokens) {
				return undefined;
			}
		}

		let embeddings: EmbeddingVector[] = [];
		const promises: Promise<RemoteEmbeddingResults | undefined>[] = [];
		const limiter = new Limiter<RemoteEmbeddingResults | undefined>(parallelism);
		try {
			for (let i = 0; i < inputs.length; i += batchSize) {
				const currentBatch = inputs.slice(i, i + batchSize);
				promises.push(limiter.queue(async () => {
					if (cancellationToken?.isCancellationRequested) {
						return;
					}

					const r = await this.rawEmbeddingsFetchWithTelemetry(type, endpoint, generateUuid(), currentBatch, cancellationToken);
					if (r.type === 'failed') {
						throw new Error('Embeddings request failed ' + r.reason);
					}
					return r;
				}));
			}

			embeddings = (await Promise.all(promises)).flatMap(response => response?.embeddings ?? []);
		} catch (e) {
			return undefined;
		} finally {
			limiter.dispose();
		}

		if (cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		// If there are no embeddings, return undefined
		if (embeddings.length === 0) {
			return undefined;
		}
		return { type: EmbeddingType.text3small_512, values: embeddings.map((value): Embedding => ({ type: EmbeddingType.text3small_512, value })) };
	}

	private async rawEmbeddingsFetchWithTelemetry(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingEndpoint,
		requestId: string,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined
	) {
		const startTime = Date.now();
		const rawRequest = await this.rawEmbeddingsFetch(type, endpoint, requestId, inputs, cancellationToken);
		if (rawRequest.type === 'failed') {
			/* __GDPR__
				"embedding.error" : {
					"owner": "digitarald",
					"comment": "Tracks errors for embedding requests",
					"type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Error type" },
					"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Detailed error reason" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryErrorEvent('embedding.error', {
				type: rawRequest.type,
				reason: rawRequest.reason
			});
			return rawRequest;
		}

		/* __GDPR__
			"embedding.success" : {
				"owner": "digitarald",
				"comment": "Performance data for embedding requests",
				"inputTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The number of tokens in the input." },
				"batchSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The number of inputs sent over." },
				"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "How long it took to complete the request." }
			}
		*/

		const tokenizer = endpoint.acquireTokenizer();
		const tokenCounts = await Promise.all(inputs.map(input => tokenizer.tokenLength(input)));
		const inputTokenCount = tokenCounts.reduce((acc, count) => acc + count, 0);

		this._telemetryService.sendMSFTTelemetryEvent('embedding.success', {}, {
			batchSize: inputs.length,
			inputTokenCount,
			timeToComplete: Date.now() - startTime
		});
		return rawRequest;
	}

	/**
	 * The function which actually makes the request to the API and handles failures.
	 * This is separated out from fetchResponse as fetchResponse does some manipulation to the input and handles errors differently
	 */
	public async rawEmbeddingsFetch(
		type: EmbeddingTypeInfo,
		endpoint: IEmbeddingEndpoint,
		requestId: string,
		inputs: readonly string[],
		cancellationToken: CancellationToken | undefined
	): Promise<RemoteEmbeddingResults | RemoteEmbeddingError> {
		try {
			const token = await this._authService.getCopilotToken();

			const body = { input: inputs, model: type.model, dimensions: type.dimensions };
			endpoint.interceptBody?.(body);
			const response = await postRequest(
				this._fetcherService,
				this._envService,
				this._telemetryService,
				this._domainService,
				this._capiClientService,
				endpoint,
				token.token,
				await createRequestHMAC(env.HMAC_SECRET), // TODO@bpasero we need web support for these environmental things
				'copilot-panel',
				requestId,
				body,
				undefined,
				cancellationToken
			);
			const jsonResponse = response.status === 200 ? await response.json() : await response.text();
			type EmbeddingResponse = {
				object: string;
				index: number;
				embedding: number[];
			};
			if (response.status === 200 && jsonResponse.data) {
				return { type: 'success', embeddings: jsonResponse.data.map((d: EmbeddingResponse) => d.embedding) };
			} else {
				return { type: 'failed', reason: jsonResponse.error };
			}
		} catch (e) {
			let errorMessage = (e as Error)?.message ?? 'Unknown error';
			// Timeouts = JSON parse errors because the response is incomplete
			if (errorMessage.match(/Unexpected.*JSON/i)) {
				errorMessage = 'timeout';
			}
			return { type: 'failed', reason: errorMessage };
		}
	}
}
