/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingVector } from '../../src/platform/embeddings/common/embeddingsComputer';
import { SQLiteCache } from './cache';
import { CacheableEmbeddingRequest, IEmbeddingsCache } from './cachingEmbeddingsFetcher';

export const usedEmbeddingsCaches = new Set<string>();

export class EmbeddingsCache implements IEmbeddingsCache {

	constructor(private readonly cachePath: string) {
		if (!fs.existsSync(this.cachePath)) {
			fs.mkdirSync(this.cachePath, { recursive: true });
		}
	}

	private _getCachePath(req: CacheableEmbeddingRequest): string {
		return path.join(this.cachePath, `${req.hash}.json`);
	}

	private async _getCacheEntry(cachePath: string): Promise<ICacheEntry | undefined> {
		usedEmbeddingsCaches.add(cachePath);
		try {
			const cacheContents = await fs.promises.readFile(cachePath, { encoding: 'utf-8' });
			return <ICacheEntry>JSON.parse(cacheContents);
		} catch (err) {
			return undefined;
		}
	}

	async get(req: CacheableEmbeddingRequest): Promise<EmbeddingVector | undefined> {
		const cachePath = this._getCachePath(req);
		const cacheEntry = await this._getCacheEntry(cachePath);
		return cacheEntry?.embedding;
	}

	async set(req: CacheableEmbeddingRequest, embeddingValue: EmbeddingVector): Promise<void> {
		const cachePath = this._getCachePath(req);
		const cacheEntry = (await this._getCacheEntry(cachePath)) ?? { query: req.query, model: req.model, embedding: embeddingValue };

		const cacheDir = path.dirname(cachePath);
		try {
			await fs.promises.stat(cacheDir);
		} catch (err) {
			await fs.promises.mkdir(cacheDir, { recursive: true });
		}
		await fs.promises.writeFile(cachePath, JSON.stringify(cacheEntry, null, '\t'));
	}
}

interface ICacheEntry {
	query: string;
	embedding: EmbeddingVector;
}

export class EmbeddingsSQLiteCache extends SQLiteCache<CacheableEmbeddingRequest, EmbeddingVector> implements IEmbeddingsCache {
	constructor(salt: string) {
		super('embeddings', salt);
	}
}