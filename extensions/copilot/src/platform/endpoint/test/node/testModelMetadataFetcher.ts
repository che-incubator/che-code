/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable import/no-restricted-paths */
import { CacheableRequest, SQLiteCache } from '../../../../../test/base/cache';
import { TestingCacheSalts } from '../../../../../test/base/salts';
import { SequencerByKey } from '../../../../util/vs/base/common/async';
import { IChatModelInformation } from '../../common/endpointProvider';
import { ModelMetadataFetcher } from '../../node/modelMetadataFetcher';

type ModelMetadataType = 'prod' | 'modelLab';

class ModelMetadataRequest implements CacheableRequest {
	constructor(readonly hash: string) { }
}

export class TestModelMetadataFetcher extends ModelMetadataFetcher {

	private static Queues = new SequencerByKey<ModelMetadataType>();

	get isModelLab(): boolean { return this._isModelLab; }

	private readonly cache = new SQLiteCache<ModelMetadataRequest, IChatModelInformation[]>('modelMetadata', TestingCacheSalts.modelMetadata);

	override async getAllChatModels(): Promise<IChatModelInformation[]> {
		const type = this._isModelLab ? 'modelLab' : 'prod';
		const req = new ModelMetadataRequest(type);

		return await TestModelMetadataFetcher.Queues.queue(type, async () => {
			const result = await this.cache.get(req);
			if (result) {
				return result;
			}

			// If the cache doesn't have the result, we need to fetch it
			const modelInfo = await super.getAllChatModels();
			await this.cache.set(req, modelInfo);
			return modelInfo;
		});
	}
}