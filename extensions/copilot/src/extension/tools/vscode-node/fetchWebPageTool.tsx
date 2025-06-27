/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, Chunk, PromptElement, PromptSizing, TextChunk, useKeepWith } from '@vscode/prompt-tsx';
import { CancellationToken, LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, LanguageModelToolResult, lm, PreparedToolInvocation, ProviderResult } from 'vscode';
import { FileChunkAndScore } from '../../../platform/chunking/common/chunk';
import { ILogService } from '../../../platform/log/common/logService';
import { UrlChunkEmbeddingsIndex } from '../../../platform/urlChunkSearch/node/urlChunkEmbeddingsIndex';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

interface IFetchWebPageParams {
	urls: string[];
	query?: string;
}

/**
 * The internal tool that we wrap.
 */
const internalToolName = 'vscode_fetchWebPage_internal';

interface WebPageChunkResult {
	uri: URI;
	chunks: FileChunkAndScore[];
	sumScore: number;
}

/**
 * A thin wrapper tool to provide indexing & prompt-tsx priority on top of the internal tool.
 */
class FetchWebPageTool implements ICopilotTool<IFetchWebPageParams> {

	private readonly _index: Lazy<UrlChunkEmbeddingsIndex>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) {
		this._index = new Lazy(() => _instantiationService.createInstance(UrlChunkEmbeddingsIndex));
	}

	public static readonly toolName = ToolName.FetchWebPage;

	prepareInvocation(_options: LanguageModelToolInvocationPrepareOptions<IFetchWebPageParams>, _token: CancellationToken): ProviderResult<PreparedToolInvocation> {
		// The Core version of this tool handles the confirmation message & other messages
		this._logService.logger.trace('FetchWebPageTool: prepareInvocation');
		return {
			presentation: 'hidden'
		};
	}

	async invoke(options: LanguageModelToolInvocationOptions<IFetchWebPageParams>, token: CancellationToken): Promise<LanguageModelToolResult> {
		this._logService.logger.trace('FetchWebPageTool: invoke');
		const tool = lm.tools.find(t => t.name === internalToolName);
		if (!tool) {
			throw new Error('Tool not found');
		}
		const { urls } = options.input;
		const { content } = await lm.invokeTool(internalToolName, options, token) as { content: LanguageModelTextPart[] };
		if (urls.length !== content.length) {
			this._logService.logger.error(`Expected ${urls.length} responses but got ${content.length}`);
			return new LanguageModelToolResult([
				new LanguageModelTextPart('Error: I did not receive the expected number of responses from the tool.')
			]);
		}

		const invalidUrls: string[] = [];
		const valid: Array<{ readonly uri: URI; readonly content: string }> = [];
		for (let i = 0; i < urls.length; i++) {
			try {
				valid.push({ uri: URI.parse(urls[i]), content: content[i].value });
			} catch (error) {
				this._logService.logger.error(`Invalid URL at index ${i}: ${urls[i]}`, error);
				invalidUrls.push(urls[i]);
			}
		}

		const filesAndTheirChunks = await this._index.value.findInUrls(
			valid,
			options.input.query ?? '',
			token
		);

		const webPageResults = new Array<WebPageChunkResult>();
		for (let i = 0; i < valid.length; i++) {
			const file = valid[i];
			const chunks = filesAndTheirChunks[i];
			const sumScore = chunks.reduce((acc, chunk) => acc + (chunk.distance?.value ?? 0), 0);
			webPageResults.push({ uri: file.uri, chunks, sumScore });
		}
		// Sort by sumScore descending
		webPageResults.sort((a, b) => b.sumScore - a.sumScore);

		const element = await renderPromptElementJSON(
			this._instantiationService,
			WebPageResults,
			{ webPageResults, invalidUrls },
			options.tokenizationOptions,
			token
		);

		return new LanguageModelToolResult([new LanguageModelPromptTsxPart(element)]);
	}
}

ToolRegistry.registerTool(FetchWebPageTool);

interface WebPageResultsProps extends BasePromptElementProps {
	webPageResults: WebPageChunkResult[];
	invalidUrls: string[];
}

class WebPageResults extends PromptElement<WebPageResultsProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return <>
			{
				this.props.webPageResults.map<WebPageContentChunks>(result => <WebPageContentChunks uri={result.uri} chunks={result.chunks} passPriority />)
			}
			{
				this.props.invalidUrls.map(url => <TextChunk>Invalid URL so no data was provided: {url}</TextChunk>)
			}
		</>;
	}
}

interface WebPageContentChunksProps extends BasePromptElementProps {
	uri: URI;
	chunks: FileChunkAndScore[];
}

class WebPageContentChunks extends PromptElement<WebPageContentChunksProps, void> {
	private static readonly PRIORITY_BASE = 1000;
	private static readonly DEFAULT_SCORE = 0;

	render(_state: void, _sizing: PromptSizing) {

		// First, create a sorted array of scores to determine ranks
		const scores = this.props.chunks.map(chunk => chunk.distance?.value ?? WebPageContentChunks.DEFAULT_SCORE);
		scores.sort((a, b) => b - a);

		// Create map of score to rank
		const scoreToRank = new Map<number, number>();
		scores.forEach((score, index) => {
			if (!scoreToRank.has(score)) {
				scoreToRank.set(score, index);
			}
		});

		// Assign rank-based priorities without changing chunk order
		const chunksWithRankPriorities = this.props.chunks.map(chunk => {
			const score = chunk.distance?.value ?? WebPageContentChunks.DEFAULT_SCORE;
			const rank = scoreToRank.get(score) ?? WebPageContentChunks.PRIORITY_BASE;
			return {
				...chunk,
				rankPriority: WebPageContentChunks.PRIORITY_BASE - rank // Higher rank (lower index) gets higher priority
			};
		});

		const KeepWith = useKeepWith();
		return <Chunk passPriority>
			<KeepWith>
				<TextChunk>Here is some relevant context from the web page {this.props.uri.toString()}:</TextChunk>
			</KeepWith>
			<KeepWith passPriority>
				{
					chunksWithRankPriorities.map(c => <TextChunk priority={c.rankPriority}>{c.chunk.text}</TextChunk>)
				}
			</KeepWith>
		</Chunk>;
	}
}
