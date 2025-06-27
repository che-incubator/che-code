/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { FileChunkWithEmbedding, FileChunkWithOptionalEmbedding } from '../../src/platform/chunking/common/chunk';
import { ChunkableContent, ComputeBatchInfo, EmbeddingsComputeQos, IChunkingEndpointClient } from '../../src/platform/chunking/common/chunkingEndpointClient';
import { ChunkingEndpointClientImpl } from '../../src/platform/chunking/common/chunkingEndpointClientImpl';
import { EmbeddingType, EmbeddingVector } from '../../src/platform/embeddings/common/embeddingsComputer';
import { createSha256Hash } from '../../src/util/common/crypto';
import { CallTracker } from '../../src/util/common/telemetryCorrelationId';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { URI } from '../../src/util/vs/base/common/uri';
import { IRange, Range } from '../../src/util/vs/editor/common/core/range';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CHUNKING_ENDPOINT_CACHE_SALT } from '../cacheSalt';
import { SQLiteCache } from './cache';

interface ISerializedFileChunk {
	fileUriString: string;
	range: IRange;
	isFullFile?: boolean;
	text: string;
	rawText?: string;
}

interface ISerializedFileChunkWithEmbedding {
	readonly chunk: ISerializedFileChunk;
	readonly embedding: EmbeddingVector;
	readonly chunkHash: string | undefined;
}

class CacheableChunkingEndpointClientRequest {

	static async create(content: ChunkableContent) {
		const hash = await createSha256Hash(CHUNKING_ENDPOINT_CACHE_SALT + await content.getText());
		return new CacheableChunkingEndpointClientRequest(hash, content);
	}

	private constructor(
		readonly hash: string,
		readonly content: ChunkableContent,
	) { }
}

interface IChunkingEndpointClientCache {
	get(req: CacheableChunkingEndpointClientRequest): Promise<FileChunkWithEmbedding[] | undefined>;
	set(req: CacheableChunkingEndpointClientRequest, cachedResponse: readonly FileChunkWithEmbedding[]): Promise<void>;
}

interface ICacheEntry {
	result: ISerializedFileChunkWithEmbedding[];
}

export class ChunkingEndpointClientCache implements IChunkingEndpointClientCache {

	constructor(
		private readonly cachePath: string,
	) {
		if (!fs.existsSync(this.cachePath)) {
			fs.mkdirSync(this.cachePath, { recursive: true });
		}
	}

	private async _getCachePath(req: CacheableChunkingEndpointClientRequest): Promise<string> {
		return path.join(this.cachePath, `${req.hash}.json.gz`);
	}

	private async _getCacheEntry(cachePath: string): Promise<ICacheEntry | undefined> {
		try {
			const compressedCacheContents = await fs.promises.readFile(cachePath);
			const cacheContents = zlib.gunzipSync(compressedCacheContents).toString('utf-8');
			return <ICacheEntry>JSON.parse(cacheContents);
		} catch (err) {
			return undefined;
		}
	}

	async get(req: CacheableChunkingEndpointClientRequest): Promise<FileChunkWithEmbedding[] | undefined> {
		const cachePath = await this._getCachePath(req);
		const cacheEntry = await this._getCacheEntry(cachePath);

		if (cacheEntry?.result === undefined) {
			return undefined;
		}

		// Deserialize the object from cache
		return cacheEntry.result.map(cachedResponse => {
			const chunk: FileChunkWithEmbedding = {
				chunk: {
					file: URI.parse(cachedResponse.chunk.fileUriString),
					range: new Range(cachedResponse.chunk.range.startLineNumber, cachedResponse.chunk.range.startColumn, cachedResponse.chunk.range.endLineNumber, cachedResponse.chunk.range.endColumn),
					isFullFile: cachedResponse.chunk.isFullFile,
					text: cachedResponse.chunk.text,
					rawText: cachedResponse.chunk.rawText,
				},
				chunkHash: cachedResponse.chunkHash,
				embedding: { value: cachedResponse.embedding, type: EmbeddingType.text3small_512 },
			};

			return chunk;
		});
	}

	async set(req: CacheableChunkingEndpointClientRequest, fileChunks: FileChunkWithEmbedding[]): Promise<void> {
		// Serialize the object to cache
		const cachedResponse: ISerializedFileChunkWithEmbedding[] = fileChunks.map((fileChunkWithEmbedding): ISerializedFileChunkWithEmbedding => {
			const serializedFileChunk: ISerializedFileChunk = {
				fileUriString: fileChunkWithEmbedding.chunk.file.toString(),
				range: fileChunkWithEmbedding.chunk.range.toJSON(),
				isFullFile: fileChunkWithEmbedding.chunk.isFullFile,
				text: fileChunkWithEmbedding.chunk.text,
				rawText: fileChunkWithEmbedding.chunk.rawText,
			};

			return {
				chunk: serializedFileChunk,
				chunkHash: fileChunkWithEmbedding.chunkHash,
				embedding: fileChunkWithEmbedding.embedding.value,
			};
		});

		const cachePath = await this._getCachePath(req);
		const cacheEntry = (await this._getCacheEntry(cachePath)) ?? { result: cachedResponse };

		const cacheDir = path.dirname(cachePath);
		try {
			await fs.promises.stat(cacheDir);
		} catch (err) {
			await fs.promises.mkdir(cacheDir, { recursive: true });
		}

		const compressed = zlib.gzipSync(JSON.stringify(cacheEntry, null, '\t'));
		await fs.promises.writeFile(cachePath, compressed);
	}
}

export class ChunkingEndpointClientSQLiteCache extends SQLiteCache<CacheableChunkingEndpointClientRequest, FileChunkWithEmbedding[]> implements IChunkingEndpointClientCache {

	constructor(salt: string) {
		super('chunks-endpoint', salt);
	}

	override async get(req: CacheableChunkingEndpointClientRequest): Promise<FileChunkWithEmbedding[] | undefined> {
		const result = await super.get(req);

		// Revive objects from cache
		return result?.map(cachedResponse => {
			const chunk: FileChunkWithEmbedding = {
				chunk: {
					file: URI.from(cachedResponse.chunk.file),
					range: new Range(cachedResponse.chunk.range.startLineNumber, cachedResponse.chunk.range.startColumn, cachedResponse.chunk.range.endLineNumber, cachedResponse.chunk.range.endColumn),
					isFullFile: cachedResponse.chunk.isFullFile,
					text: cachedResponse.chunk.text,
					rawText: cachedResponse.chunk.rawText,
				},
				chunkHash: cachedResponse.chunkHash,
				embedding: cachedResponse.embedding,
			};

			return chunk;
		});
	}
}

export class CachingChunkingEndpointClient implements IChunkingEndpointClient {
	declare readonly _serviceBrand: undefined;
	private readonly _chunkingEndpointClient: IChunkingEndpointClient;

	constructor(
		private readonly _cache: IChunkingEndpointClientCache,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._chunkingEndpointClient = instantiationService.createInstance(ChunkingEndpointClientImpl);
	}

	async computeChunksAndEmbeddings(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap</* hash */string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const req = await CacheableChunkingEndpointClientRequest.create(content);
		const cacheValue = await this._cache.get(req);
		if (cacheValue) {
			return cacheValue;
		}

		const result = await this._chunkingEndpointClient.computeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, qos, cache, telemetryInfo, token);
		if (result) {
			await this._cache.set(req, result);
		}

		return result;
	}

	computeChunks(authToken: string, embeddingType: EmbeddingType, content: ChunkableContent, batchInfo: ComputeBatchInfo, qos: EmbeddingsComputeQos, cache: ReadonlyMap<string, FileChunkWithEmbedding> | undefined, telemetryInfo: CallTracker, token: CancellationToken): Promise<readonly FileChunkWithOptionalEmbedding[] | undefined> {
		return this.computeChunksAndEmbeddings(authToken, embeddingType, content, batchInfo, qos, cache, telemetryInfo, token);
	}
}