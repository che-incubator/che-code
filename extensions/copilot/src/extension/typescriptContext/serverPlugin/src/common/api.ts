/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { CompilerOptionsContextRunnable } from './baseContextProviders';
import { ClassContextProvider } from './classContextProvider';
import { ContextComputeRunnableCollector, ContextProvider, RecoverableError, RequestContext, type ComputeContextSession, type ContextComputeRunnable, type ContextProviderFactory, type ContextResult, type ProviderComputeContext } from './contextProvider';
import { FunctionContextProvider } from './functionContextProvider';
import { ConstructorContextProvider, MethodContextProvider } from './methodContextProvider';
import { ModuleContextProvider } from './moduleContextProvider';
import { CompletionContextKind, type CachedContextItem, type CacheScope, type ContextItemKey, type FilePath, type Range } from './protocol';
import { SourceFileContextProvider } from './sourceFileContextProvider';
import tss from './typescripts';

class ProviderComputeContextImpl implements ProviderComputeContext {

	private firstCallableProvider: ContextProvider | undefined;
	private completionKind: CompletionContextKind | undefined;
	private symbolsToQuery: tt.SymbolFlags;
	private importsByCacheRange: Range | undefined;
	private callableProviderCacheScope: CacheScope | undefined;

	constructor() {
		this.completionKind = undefined;
		this.symbolsToQuery = ts.SymbolFlags.None;
		this.firstCallableProvider = undefined;
	}

	public update(contextProvider: ContextProvider): ContextProvider {
		if (this.completionKind === undefined) {
			this.completionKind = contextProvider.contextKind;
		}
		if (contextProvider.symbolsToQuery !== undefined && contextProvider.symbolsToQuery !== ts.SymbolFlags.None) {
			this.symbolsToQuery |= contextProvider.symbolsToQuery;
		}
		if (this.importsByCacheRange === undefined && typeof contextProvider.getImportsByCacheRange === 'function') {
			this.importsByCacheRange = contextProvider.getImportsByCacheRange();
		}
		if (this.firstCallableProvider === undefined && contextProvider.isCallableProvider !== undefined && contextProvider.isCallableProvider === true) {
			this.firstCallableProvider = contextProvider;
			if (typeof contextProvider.getCallableCacheScope === 'function') {
				this.callableProviderCacheScope = contextProvider.getCallableCacheScope();
			}
		}
		return contextProvider;
	}

	public getImportsByCacheRange(): Range | undefined {
		return this.importsByCacheRange;
	}

	public getCompletionKind(): CompletionContextKind {
		return this.completionKind ?? CompletionContextKind.None;
	}

	public getSymbolsToQuery(): tt.SymbolFlags {
		return this.symbolsToQuery;
	}

	public isFirstCallableProvider(contextProvider: ContextProvider): boolean {
		return this.firstCallableProvider === contextProvider;
	}

	public getCallableCacheScope(): CacheScope | undefined {
		return this.callableProviderCacheScope;
	}
}

class ContextProviders {

	private static readonly Factories = new Map<tt.SyntaxKind, ContextProviderFactory>([
		[ts.SyntaxKind.SourceFile, (_node, tokenInfo, computeContext) => new SourceFileContextProvider(tokenInfo, computeContext)],
		[ts.SyntaxKind.FunctionDeclaration, (node, tokenInfo, computeContext) => new FunctionContextProvider(node as tt.FunctionDeclaration, tokenInfo, computeContext)],
		[ts.SyntaxKind.ArrowFunction, (node, tokenInfo, computeContext) => new FunctionContextProvider(node as tt.ArrowFunction, tokenInfo, computeContext)],
		[ts.SyntaxKind.FunctionExpression, (node, tokenInfo, computeContext) => new FunctionContextProvider(node as tt.FunctionExpression, tokenInfo, computeContext)],
		[ts.SyntaxKind.ClassDeclaration, ClassContextProvider.create as unknown as ContextProviderFactory],
		[ts.SyntaxKind.Constructor, (node, tokenInfo, computeContext) => new ConstructorContextProvider(node as tt.ConstructorDeclaration, tokenInfo, computeContext)],
		[ts.SyntaxKind.MethodDeclaration, (node, tokenInfo, computeContext) => new MethodContextProvider(node as tt.MethodDeclaration, tokenInfo, computeContext)],
		[ts.SyntaxKind.ModuleDeclaration, (node, tokenInfo, computeContext) => new ModuleContextProvider(node as tt.ModuleDeclaration, tokenInfo, computeContext)],
	]);

	private readonly document: FilePath;
	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContextImpl;
	private readonly neighborFiles: readonly string[] | undefined;
	private readonly knownContextItems: Map<ContextItemKey, CachedContextItem>;


	constructor(document: FilePath, tokenInfo: tss.TokenInfo, neighborFiles: readonly string[] | undefined, knownContextItems: readonly CachedContextItem[]) {
		this.document = document;
		this.tokenInfo = tokenInfo;
		this.computeInfo = new ProviderComputeContextImpl();
		this.neighborFiles = neighborFiles;
		this.knownContextItems = new Map<ContextItemKey, CachedContextItem>(knownContextItems.map(item => [item.key, item]));
	}

	public execute(result: ContextResult, session: ComputeContextSession, languageService: tt.LanguageService, token: tt.CancellationToken): void {
		const normalizedPaths: tt.server.NormalizedPath[] = [];
		if (this.neighborFiles !== undefined) {
			for (const file of this.neighborFiles) {
				normalizedPaths.push(ts.server.toNormalizedPath(file));
			}
		}
		const requestContext = new RequestContext(session, normalizedPaths, this.knownContextItems);
		const collector = this.getContextComputeRunnables(session, languageService, requestContext, token);
		const completionContextKind: CompletionContextKind = this.computeInfo.getCompletionKind();
		result.addMetaData(completionContextKind, tss.StableSyntaxKinds.getPath(this.tokenInfo.touching ?? this.tokenInfo.token));
		this.executeRunnables(collector.getPrimaryRunnables(), result, token);
		this.executeRunnables(collector.getSecondaryRunnables(), result, token);
		this.executeRunnables(collector.getTertiaryRunnables(), result, token);
		session.addComputationStateItems(result, this.computeInfo);
	}

	private executeRunnables(runnables: ContextComputeRunnable[], result: ContextResult, token: tt.CancellationToken): void {
		for (const runnable of runnables) {
			token.throwIfCancellationRequested();
			try {
				runnable.compute(result, token);
			} catch (error) {
				if (error instanceof RecoverableError) {
					result.addErrorData(error);
				} else {
					throw error;
				}
			}
		}
	}

	private getContextComputeRunnables(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): ContextComputeRunnableCollector {
		const result: ContextComputeRunnableCollector = new ContextComputeRunnableCollector();
		result.addPrimary(new CompilerOptionsContextRunnable(session, languageService, context, this.document));
		const providers = this.computeProviders();
		for (const provider of providers) {
			provider.provide(result, session, languageService, context, token);
		}
		return result;
	}

	private computeProviders(): ContextProvider[] {
		const result: ContextProvider[] = [];

		let token = this.tokenInfo.touching;
		if (token === undefined) {
			if (this.tokenInfo.token === undefined || this.tokenInfo.token.kind === ts.SyntaxKind.EndOfFileToken) {
				token = this.tokenInfo.previous;
			} else {
				token = this.tokenInfo.token;
			}
		}
		if (token === undefined || token.kind === ts.SyntaxKind.EndOfFileToken) {
			return result;
		}
		let current = token;
		while (current !== undefined) {
			const factory = ContextProviders.Factories.get(current.kind);
			if (factory !== undefined) {
				const provider = factory(current, this.tokenInfo, this.computeInfo);
				if (provider !== undefined) {
					result.push(this.computeInfo.update(provider));
				}
			}
			current = current.parent;
		}

		return result;
	}
}

export function computeContext(result: ContextResult, session: ComputeContextSession, languageService: tt.LanguageService, document: FilePath, position: number, neighborFiles: readonly string[] | undefined, knownContextItems: readonly CachedContextItem[], token: tt.CancellationToken): void {
	const program = languageService.getProgram();
	if (program === undefined) {
		return;
	}
	const sourceFile = program.getSourceFile(document);
	if (sourceFile === undefined) {
		return;
	}

	const tokenInfo = tss.getRelevantTokens(sourceFile, position);
	const providers = new ContextProviders(document, tokenInfo, neighborFiles, knownContextItems);
	providers.execute(result, session, languageService, token);
}