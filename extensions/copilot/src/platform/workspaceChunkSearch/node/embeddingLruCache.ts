/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LRUCache } from 'lru-cache';
import { createSha256Hash } from '../../../util/common/crypto';
import { ThrottledDelayer } from '../../../util/vs/base/common/async';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { Embedding } from '../../embeddings/common/embeddingsComputer';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';

export type EmbeddingLruCacheOptions<K, V, FC = unknown> = LRUCache.Options<K, V, FC> & {
	readonly autoWriteDelay?: number;
};

interface LruPersistedData {
	readonly version: string;
	readonly data: Array<[string, LRUCache.Entry<Embedding>]>;
}

/**
 * Basic wrapper around the `lru-cache` package that manages saving the cache to disk.
 *
 * TODO: see if we can store embeddings more space efficiently (e.g. as binary data). Unfortunately trying to use a Float32 array
 * that is base64 encoded seems to change the values slightly.
 */
export class EmbeddingLruCache extends Disposable {

	private _delayer: ThrottledDelayer<void> | undefined;
	private readonly _cache: LRUCache<string, Embedding>;

	constructor(
		private readonly path: URI | undefined,
		private readonly version: string,
		private readonly options: EmbeddingLruCacheOptions<string, Embedding>,
		@IFileSystemService private readonly fileSystem: IFileSystemService
	) {
		super();

		this._cache = new LRUCache<string, Embedding>(this.options);

		this._delayer = typeof options.autoWriteDelay === 'number'
			? this._register(new ThrottledDelayer<void>(options.autoWriteDelay))
			: undefined;
	}

	public override dispose(): void {
		super.dispose();

		this._delayer = undefined;
	}

	/**
	 * Load the cache from disk if it exists.
	 */
	async initialize(): Promise<void> {
		if (!this.path) {
			return;
		}

		let fileData: Uint8Array | undefined;
		try {
			fileData = await this.fileSystem.readFile(this.path);
		} catch {
			// Expected, file doesn't exist
			return;
		}

		try {
			const data = new TextDecoder().decode(fileData);
			const json: LruPersistedData = JSON.parse(data);

			if (json.version === this.version) {
				this._cache.load(json.data);
			}
		} catch (e) {
			console.error(`Failed to load LRU cache at ${this.path}`, e);
		}
	}

	public async get(text: string): Promise<Embedding | undefined> {
		return this._cache.get(await this.toKey(text));
	}

	public async set(text: string, embedding: Embedding): Promise<void> {
		this._cache.set(await this.toKey(text), embedding);

		this._delayer?.trigger(() => this.save()).catch(e => {
			if (!(e instanceof CancellationError)) {
				throw e;
			}
		});
	}

	async save(): Promise<void> {
		if (!this.path) {
			return;
		}

		const data = JSON.stringify({
			version: this.version,
			data: this._cache.dump(),
		} satisfies LruPersistedData);

		await this.fileSystem.writeFile(this.path, new TextEncoder().encode(data));
	}

	private toKey(text: string): Promise<string> {
		// Reduce storage size by storing keys as hashes
		return createSha256Hash(text);
	}
}
