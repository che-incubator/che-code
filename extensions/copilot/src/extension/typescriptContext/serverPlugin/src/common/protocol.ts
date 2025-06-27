/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

export type DocumentUri = string;
export type FilePath = string;

export enum CacheScopeKind {
	File = 'file',
	Range = 'range'
}

export type FileCacheScope = {
	kind: CacheScopeKind.File;
}

export type Position = {
	line: number;
	character: number;
}

export type Range = {
	start: Position;
	end: Position;
}

export type RangeCacheScope = {
	kind: CacheScopeKind.Range;
	range: Range;
}

export type CacheScope = FileCacheScope | RangeCacheScope;

export type ContextItemKey = string;
export type ComputationStateKey = string;
export enum EmitMode {
	ClientBased = 'clientBased',
	ClientBasedOnTimeout = 'clientBasedOnTimeout'
	// ServerBased = 'serverBased'
}
export type CacheInfo = {
	key: ContextItemKey;
	emitMode: EmitMode;
	scope: CacheScope;
}
export namespace CacheInfo {
	export type has = { cache: CacheInfo };
	export function has(item: any): item is has {
		return item.cache !== undefined;
	}
}
export type BaseCacheInfo = Omit<CacheInfo, 'key'> & {
	startOffset: number;
	endOffset: number;
};
export namespace BaseCacheInfo {
	export function create(emitMode: EmitMode, startOffset: number, endOffset: number, scope: CacheScope): BaseCacheInfo {
		return Object.freeze({ emitMode, scope, startOffset, endOffset });
	}
}
export type CachedContextItem = {
	key: ContextItemKey;
	emitMode: EmitMode;
	sizeInChars?: number;
}
export namespace CachedContextItem {
	export function create(key: ContextItemKey, emitMode: EmitMode, sizeInChars?: number): CachedContextItem {
		return { key, emitMode, sizeInChars };
	}
}

/**
 * Different supported context item kinds.
 */
export enum ContextKind {
	MetaData = 'metaData',
	ErrorData = 'errorData',
	Timings = 'timings',
	CachedItem = 'cachedItem',
	ComputationState = 'computationState',
	RelatedFile = 'relatedFile',
	Snippet = 'snippet',
	Trait = 'trait',
}

export enum CompletionContextKind {
	Unknown = 'unknown',

	None = 'none',

	SourceFile = 'sourceFile',

	Class = 'class',
	WholeClass = 'wholeClass',

	Constructor = 'constructor',
	WholeConstructor = 'wholeConstructor',

	Method = 'method',
	WholeMethod = 'wholeMethod',

	Function = 'function',
	WholeFunction = 'wholeFunction'
}

/**
 * Meta data information about the completion context
 * request.
 */
export type MetaData = {
	kind: ContextKind.MetaData;
	completionContext: CompletionContextKind;
	path?: number[];
};
export namespace MetaData {
	export function create(completionContext: CompletionContextKind, path?: number[]): MetaData {
		return { kind: ContextKind.MetaData, completionContext: completionContext, path: path };
	}
}

export type ErrorData = {
	kind: ContextKind.ErrorData;
	code: number;
	message: string;
};
export namespace ErrorData {
	export function create(code: number, message: string): ErrorData {
		return { kind: ContextKind.ErrorData, code, message };
	}
}

export type Timings = {
	kind: ContextKind.Timings;
	totalTime: number;
	computeTime: number;
}
export namespace Timings {
	export function create(totalTime: number, computeTime: number): Timings {
		return { kind: ContextKind.Timings, totalTime, computeTime };
	}
}

export type CachedItem = {
	kind: ContextKind.CachedItem;
	key: ContextItemKey;
	emitMode: EmitMode;
};
export namespace CachedItem {
	export function create(key: ContextItemKey, emitMode: EmitMode): CachedItem {
		return { kind: ContextKind.CachedItem, key, emitMode };
	}
}

export type ComputationState = {
	kind: ContextKind.ComputationState;
	key: ComputationStateKey;
	scope: CacheScope;
};
export namespace ComputationState {
	export function create(key: ComputationStateKey, scope: CacheScope): ComputationState {
		return { kind: ContextKind.ComputationState, key, scope };
	}
}

export enum Priorities {
	Locals = 1,
	Inherited = 0.9,
	Properties = 0.8,
	Blueprints = 0.7,
	ImportedFunctions = 0.6,
	NeighborFiles = 0.55,
	Traits = 0.5,
	ImportedTypes = 0.4,
}

/**
 * A related file context.
 */
export type RelatedFile = {
	kind: ContextKind.RelatedFile;
	priority: number;
	uri: FilePath;
	range?: Range;
};

export enum SpeculativeKind {
	emit = 'emit',
	ignore = 'ignore'
}

export enum TraitKind {
	Unknown = 'unknown',
	Module = 'module',
	ModuleResolution = 'moduleResolution',
	Lib = 'lib',
	Target = 'target',
	Version = 'version'
}

/**
 * A trait context.
 */
export type Trait = {
	kind: ContextKind.Trait;
	/**
	 * The kind of trait.
	 */
	traitKind: TraitKind;
	/**
	 * The priority of the trait.
	 */
	priority: number;
	/**
	 * The trait name.
	 */
	name: string;
	/**
	 * The trait value.
	 */
	value: string;
	/**
	 * Whether the snippet can be used in a speculative request with the same
	 * document and position.
	 */
	speculativeKind: SpeculativeKind;
	/**
	 * The trait cache information if available.
	 */
	cache?: CacheInfo;
};
export namespace Trait {
	export function create(traitKind: TraitKind, priority: number, name: string, value: string, document?: FilePath | undefined): Trait {
		if (document === undefined) {
			return { kind: ContextKind.Trait, traitKind, priority, name, value, speculativeKind: SpeculativeKind.emit };
		} else {
			const cacheInfo: CacheInfo = {
				key: makeContextItemKey(traitKind),
				emitMode: EmitMode.ClientBased,
				scope: { kind: CacheScopeKind.File }
			};
			return { kind: ContextKind.Trait, traitKind, priority, name, value, speculativeKind: SpeculativeKind.emit, cache: cacheInfo };
		}
	}
	export function sizeInChars(trait: Trait): number {
		return trait.name.length + trait.value.length;
	}
	export function makeContextItemKey(traitKind: TraitKind): string {
		return JSON.stringify({ k: ContextKind.Trait, tk: traitKind }, undefined, 0);
	}
}

export enum SnippetKind {
	Unknown = 'unknown',
	Blueprint = 'blueprint',
	Signature = 'signature',
	SuperClass = 'superClass',
	GeneralScope = 'generalScope',
	Completion = 'completion',
	NeighborFile = 'neighborFile'
}

/**
 * A snippet context.
 */
export type CodeSnippet = {
	kind: ContextKind.Snippet;
	/**
	 * The kind of snippet.
	 */
	snippetKind: SnippetKind;
	/**
	 * The priority of the snippet.
	 */
	priority: number;
	/**
	 * The primary URI
	 */
	uri: FilePath;
	/**
	 * Additional URIs
	 */
	additionalUris?: FilePath[];
	/**
	 * The snippet value.
	 */
	value: string;
	/**
	 * Whether the snippet can be used in a speculative request with the same
	 * document and position.
	 */
	speculativeKind: SpeculativeKind;
	/**
	 * The snippet cache information if available.
	 */
	cache?: CacheInfo;
};
export namespace CodeSnippet {
	export function create(uri: FilePath, additionalUris: FilePath[] | undefined, value: string, snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache?: CacheInfo | undefined): CodeSnippet {
		return { kind: ContextKind.Snippet, snippetKind, uri, additionalUris, value, priority: priority, speculativeKind, cache };
	}
	export function sizeInChars(snippet: CodeSnippet): number {
		let result: number = snippet.value.length;
		// +3 for "// " at the beginning of the line.
		result += snippet.uri.length + 3;
		if (snippet.additionalUris !== undefined) {
			for (const uri of snippet.additionalUris) {
				result += uri.length + 3;
			}
		}
		return result;
	}
}

export type ContextItem = MetaData | ErrorData | Timings | CachedItem | ComputationState | RelatedFile | Trait | CodeSnippet;

export interface ComputeContextRequestArgs extends tt.server.protocol.FileLocationRequestArgs {
	startTime: number;
	timeBudget?: number;
	tokenBudget?: number;
	neighborFiles?: FilePath[];
	knownContextItems?: CachedContextItem[];
	computationStates?: ComputationState[];
}

export interface ComputeContextRequest extends tt.server.protocol.Request {
	arguments?: ComputeContextRequestArgs;
}

export enum ErrorCode {
	noArguments = 'noArguments',
	noProject = 'noProject',
	noProgram = 'noProgram',
	invalidArguments = 'invalidArguments',
	invalidPosition = 'invalidPosition',
	exception = 'exception',
}

export type ComputeContextResponse = (tt.server.protocol.Response & {
	body: ComputeContextResponse.OK | ComputeContextResponse.Failed;
}) | { type: 'cancelled' };

export namespace ComputeContextResponse {

	export type OK = {
		items: ContextItem[];
		timedOut: boolean;
		tokenBudgetExhausted: boolean;
	};

	export type Failed = {
		error: ErrorCode;
		message: string;
		stack?: string;
	};

	export function isCancelled(response: ComputeContextResponse): boolean {
		return (response.type === 'cancelled');
	}

	export function isOk(response: ComputeContextResponse): response is tt.server.protocol.Response & { body: OK } {
		return response.type === 'response' && (response.body as any).items !== undefined;
	}
	export function isError(response: ComputeContextResponse): response is tt.server.protocol.Response & { body: Failed } {
		return response.type === 'response' && (response.body as any).error !== undefined;
	}
}

export interface PingResponse extends tt.server.protocol.Response {
	body: PingResponse.OK | PingResponse.Error;
}

export namespace PingResponse {
	export type OK = {
		kind: 'ok';
		session: boolean;
		supported: boolean;
		version?: string;
	};
	export type Error = {
		kind: 'error';
		message: string;
		stack?: string;
	};
}