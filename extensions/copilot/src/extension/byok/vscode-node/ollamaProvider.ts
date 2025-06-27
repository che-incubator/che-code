/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IChatModelInformation } from '../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKAuthType, BYOKModelCapabilities } from '../common/byokProvider';
import { BaseOpenAICompatibleBYOKRegistry } from './baseOpenAICompatibleProvider';

interface OllamaModelInfoAPIResponse {
	template: string;
	capabilities: string[];
	details: { family: string };
	model_info: {
		"general.basename": string;
		"general.architecture": string;
		[other: string]: any;
	};
}

export class OllamaModelRegistry extends BaseOpenAICompatibleBYOKRegistry {

	constructor(
		private readonly _ollamaBaseUrl: string,
		@IFetcherService _fetcherService: IFetcherService,
		@ILogService _logService: ILogService,
		@IInstantiationService _instantiationService: IInstantiationService,
	) {
		super(
			BYOKAuthType.None,
			'Ollama',
			`${_ollamaBaseUrl}/v1`,
			_fetcherService,
			_logService,
			_instantiationService
		);
	}

	override async getAllModels(apiKey: string): Promise<{ id: string; name: string }[]> {
		try {
			const response = await this._fetcherService.fetch(`${this._ollamaBaseUrl}/api/tags`, { method: 'GET' });
			const models = (await response.json()).models;
			return models.map((model: { model: string; name: string }) => ({ id: model.model, name: model.name }));
		} catch (e) {
			throw new Error('Failed to fetch models from Ollama. Please ensure Ollama is running. If ollama is on another host, please configure the `"github.copilot.chat.byok.ollamaEndpoint"` setting.');
		}
	}

	override async getModelInfo(modelId: string, apiKey: string, modelCapabilities?: BYOKModelCapabilities): Promise<IChatModelInformation> {
		if (!modelCapabilities) {
			const modelInfo = await this._getOllamaModelInformation(modelId);
			const contextWindow = modelInfo.model_info[`${modelInfo.model_info['general.architecture']}.context_length`] ?? 4096;
			const outputTokens = contextWindow < 4096 ? Math.floor(contextWindow / 2) : 4096;
			modelCapabilities = {
				name: modelInfo.model_info['general.basename'],
				maxOutputTokens: outputTokens,
				maxInputTokens: contextWindow - outputTokens,
				vision: modelInfo.capabilities.includes("vision"),
				toolCalling: modelInfo.capabilities.includes("tools")
			};
		}
		return super.getModelInfo(modelId, apiKey, modelCapabilities);
	}

	private async _getOllamaModelInformation(modelId: string): Promise<OllamaModelInfoAPIResponse> {
		const response = await this._fetcherService.fetch(`${this._ollamaBaseUrl}/api/show`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ model: modelId })
		});
		return response.json() as unknown as OllamaModelInfoAPIResponse;
	}
}