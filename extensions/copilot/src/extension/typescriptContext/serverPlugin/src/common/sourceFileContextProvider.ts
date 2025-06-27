/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { TypeOfExpressionComputeRunnable, TypeOfImportsComputeRunnable, TypeOfLocalsComputeRunnable, TypesOfNeighborFilesComputeRunnable } from './baseContextProviders';
import { CodeSnippetBuilder } from './code';
import { ComputeCost, ContextComputeRunnable, ContextProvider, type ComputeContextSession, type ContextComputeRunnableCollector, type ContextResult, type ProviderComputeContext, type RequestContext } from './contextProvider';
import { CompletionContextKind, EmitMode, Priorities, SnippetKind, SpeculativeKind, type CacheScope } from './protocol';
import tss, { Symbols, type TokenInfo } from './typescripts';


export type SymbolsInScope = {
	functions: {
		real: tt.Symbol[];
		aliased: { alias: tt.Symbol; real: tt.Symbol }[];
	};
	modules: { alias: tt.Symbol; real: tt.Symbol }[];
};

export class GlobalSymbolsInScopeRunnable extends ContextComputeRunnable {

	private readonly tokenInfo: TokenInfo;
	private readonly symbolsToQuery: tt.SymbolFlags;
	private readonly cacheScope: CacheScope | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: TokenInfo, symbolsToQuery: tt.SymbolFlags, cacheScope?: CacheScope) {
		super(session, languageService, context, Priorities.ImportedFunctions, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.symbolsToQuery = symbolsToQuery;
		this.cacheScope = cacheScope;
	}

	public override compute(result: ContextResult, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		const program = this.getProgram();
		const symbols = this.symbols;
		const seen = this.getSeenSymbols();
		const sourceFile = this.tokenInfo.token.getSourceFile();

		const inScope = this.getModulesAndFunctionsInScope(program, symbols.getTypeChecker(), sourceFile);
		token.throwIfCancellationRequested();

		// Add functions in scope
		for (const func of inScope.functions.real) {
			token.throwIfCancellationRequested();
			const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, func, EmitMode.ClientBasedOnTimeout, this.cacheScope);
			if (handled) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
			snippetBuilder.addFunctionSymbol(func);
			result.addSnippet(snippetBuilder, SnippetKind.GeneralScope, this.priority, SpeculativeKind.emit, cacheInfo);
			seen.add(func);
		}

		if (result.tokenBudget.isExhausted()) {
			return;
		}

		// Add aliased functions in scope
		for (const { alias, real } of inScope.functions.aliased) {
			token.throwIfCancellationRequested();

			const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, real, EmitMode.ClientBasedOnTimeout, this.cacheScope);
			if (handled || seen.has(alias)) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
			snippetBuilder.addFunctionSymbol(real, alias.getName());
			if (!result.addSnippet(snippetBuilder, SnippetKind.GeneralScope, this.priority, SpeculativeKind.emit, cacheInfo, true)) {
				break;
			}
			seen.add(alias);
			seen.add(real);
		}

		if (result.tokenBudget.isExhausted()) {
			return;
		}


		// Add modules in scope
		for (const { alias, real } of inScope.modules) {
			token.throwIfCancellationRequested();

			const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, real, EmitMode.ClientBasedOnTimeout, this.cacheScope);
			if (handled || seen.has(alias)) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
			snippetBuilder.addModuleSymbol(real, alias.getName());
			if (!result.addSnippet(snippetBuilder, SnippetKind.GeneralScope, this.priority, SpeculativeKind.emit, cacheInfo, true)) {
				break;
			}
			seen.add(alias);
			seen.add(real);
		}
	}

	protected getModulesAndFunctionsInScope(program: tt.Program, typeChecker: tt.TypeChecker, sourceFile: tt.SourceFile): SymbolsInScope {
		const result: SymbolsInScope = {
			functions: {
				real: [],
				aliased: []
			},
			modules: []
		};

		const location = this.tokenInfo.previous ?? this.tokenInfo.token;
		const symbols = typeChecker.getSymbolsInScope(location, this.symbolsToQuery | ts.SymbolFlags.Alias);
		for (const symbol of symbols) {
			const declarations = symbol.declarations;
			if (declarations === undefined) {
				continue;
			}
			for (const declaration of declarations) {
				const declarationSourceFile = declaration.getSourceFile();
				if (program.isSourceFileDefaultLibrary(declarationSourceFile) || program.isSourceFileFromExternalLibrary(declarationSourceFile)) {
					continue;
				}
				if (Symbols.isFunction(symbol) && this.includeFunctions() && declarationSourceFile !== sourceFile) {
					result.functions.real.push(symbol);
					break;
				} else if (Symbols.isAlias(symbol)) {
					const aliased = typeChecker.getAliasedSymbol(symbol);
					if (Symbols.isFunction(aliased) && this.includeFunctions()) {
						result.functions.aliased.push({ alias: symbol, real: aliased });
						break;
					} else if (aliased.flags === ts.SymbolFlags.ValueModule && this.includeValueModules()) {
						// Only include pure value modules. Classes, interfaces, ... are also value modules.
						result.modules.push({ alias: symbol, real: aliased });
						break;
					}
				}
			}
		}
		return result;
	}

	private includeFunctions(): boolean {
		return (this.symbolsToQuery & ts.SymbolFlags.Function) !== 0;
	}

	private includeValueModules(): boolean {
		return (this.symbolsToQuery & ts.SymbolFlags.ValueModule) !== 0;
	}
}

export class SourceFileContextProvider extends ContextProvider {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;

	constructor(tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super(CompletionContextKind.SourceFile, ts.SymbolFlags.Function);
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
		this.isCallableProvider = true;
	}

	public provide(result: ContextComputeRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		const symbolsToQuery = this.computeInfo.getSymbolsToQuery();
		const cacheScope = this.computeInfo.getCallableCacheScope();
		if (symbolsToQuery !== undefined && symbolsToQuery !== ts.SymbolFlags.None) {
			result.addSecondary(new GlobalSymbolsInScopeRunnable(session, languageService, context, this.tokenInfo, symbolsToQuery, cacheScope));
		}
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		result.addPrimary(new TypeOfLocalsComputeRunnable(session, languageService, context, this.tokenInfo, new Set(), undefined));
		const runnable = TypeOfExpressionComputeRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new TypeOfImportsComputeRunnable(session, languageService, context, this.tokenInfo, new Set(), undefined));
		result.addTertiary(new TypesOfNeighborFilesComputeRunnable(session, languageService, context, this.tokenInfo, undefined));
	}
}