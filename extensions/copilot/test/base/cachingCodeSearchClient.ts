/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import type { CancellationToken } from 'vscode';
import { ICodeOrDocsSearchBaseScopingQuery, ICodeOrDocsSearchItem, ICodeOrDocsSearchMultiRepoScopingQuery, ICodeOrDocsSearchOptions, ICodeOrDocsSearchResult, ICodeOrDocsSearchSingleRepoScopingQuery, IDocsSearchClient } from '../../src/platform/remoteSearch/common/codeOrDocsSearchClient';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { CODE_SEARCH_CACHE_SALT } from '../cacheSalt';
import { SQLiteCache } from './cache';
import { computeSHA256 } from './hash';

class CacheableCodeOrDocSearchRequest {

	readonly hash: string;
	readonly obj: unknown;

	constructor(
		readonly query: string,
		readonly scopingQuery: ICodeOrDocsSearchBaseScopingQuery,
		readonly requestOptions: ICodeOrDocsSearchOptions,
	) {
		this.obj = { query, scopingQuery, requestOptions };
		this.hash = computeSHA256(CODE_SEARCH_CACHE_SALT + JSON.stringify(this.obj));
	}

	toJSON() {
		return this.obj;
	}
}

interface ICodeOrDocSearchCache {
	get(req: CacheableCodeOrDocSearchRequest): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult | undefined>;
	set(req: CacheableCodeOrDocSearchRequest, cachedResponse: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult): Promise<void>;
}

export class CodeOrDocSearchCache implements ICodeOrDocSearchCache {

	constructor(private readonly cachePath: string) {
		if (!fs.existsSync(this.cachePath)) {
			fs.mkdirSync(this.cachePath, { recursive: true });
		}
	}

	private _getCachePath(req: CacheableCodeOrDocSearchRequest): string {
		return path.join(this.cachePath, `${req.hash}.json`);
	}

	private async _getCacheEntry(cachePath: string): Promise<ICacheEntry | undefined> {
		try {
			const cacheContents = await fs.promises.readFile(cachePath, { encoding: 'utf-8' });
			return <ICacheEntry>JSON.parse(cacheContents);
		} catch (err) {
			return undefined;
		}
	}

	async get(req: CacheableCodeOrDocSearchRequest): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult | undefined> {
		const cachePath = this._getCachePath(req);
		const cacheEntry = await this._getCacheEntry(cachePath);
		return cacheEntry?.result;
	}

	async set(req: CacheableCodeOrDocSearchRequest, cachedResponse: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult): Promise<void> {
		const cachePath = this._getCachePath(req);
		const cacheEntry = (await this._getCacheEntry(cachePath)) ?? { query: req.query, scopingQuery: req.scopingQuery, requestOptions: req.requestOptions, result: cachedResponse };

		const cacheDir = path.dirname(cachePath);
		try {
			await fs.promises.stat(cacheDir);
		} catch (err) {
			await fs.promises.mkdir(cacheDir, { recursive: true });
		}
		await fs.promises.writeFile(cachePath, JSON.stringify(cacheEntry, null, '\t'));
	}
}

export class CodeOrDocSearchSQLiteCache extends SQLiteCache<CacheableCodeOrDocSearchRequest, ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult> implements ICodeOrDocSearchCache {

	constructor(salt: string) {
		super('docs-search', salt);
	}
}

interface ICacheEntry {
	query: string;
	scopingQuery: ICodeOrDocsSearchBaseScopingQuery;
	requestOptions: ICodeOrDocsSearchOptions;
	result: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult;
}


export class CachingCodeOrDocSearchClient implements IDocsSearchClient {
	declare readonly _serviceBrand: undefined;
	private readonly searchClient: IDocsSearchClient;

	constructor(
		searchClientDesc: SyncDescriptor<IDocsSearchClient>,
		private readonly cache: ICodeOrDocSearchCache,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.searchClient = instantiationService.createInstance(searchClientDesc);
	}

	search(query: string, scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchItem[]>;
	search(query: string, scopingQuery: ICodeOrDocsSearchMultiRepoScopingQuery, options?: ICodeOrDocsSearchOptions, cancellationToken?: CancellationToken | undefined): Promise<ICodeOrDocsSearchResult>;
	async search(query: string,
		scopingQuery: ICodeOrDocsSearchSingleRepoScopingQuery | ICodeOrDocsSearchMultiRepoScopingQuery,
		options: ICodeOrDocsSearchOptions = {},
		cancellationToken?: CancellationToken
	): Promise<ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult> {
		options.limit ??= 6;
		options.similarity ??= 0.766;

		const req = new CacheableCodeOrDocSearchRequest(query, scopingQuery, options);
		const cacheValue = await this.cache.get(req);
		if (cacheValue) {
			return cacheValue;
		}

		let result: ICodeOrDocsSearchItem[] | ICodeOrDocsSearchResult;
		if (Array.isArray(scopingQuery.repo)) {
			result = await this.searchClient.search(
				query,
				scopingQuery as ICodeOrDocsSearchMultiRepoScopingQuery,
				options,
				cancellationToken
			);
		} else {
			result = await this.searchClient.search(
				query,
				scopingQuery as ICodeOrDocsSearchSingleRepoScopingQuery,
				options,
				cancellationToken
			);
		}
		await this.cache.set(req, result);
		return result;
	}
}
