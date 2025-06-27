/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { CodeSnippetBuilder } from './code';
import { CacheScopes, ComputeCost, ContextComputeRunnable, ContextProvider, type ComputeContextSession, type ContextComputeRunnableCollector, type ContextResult, type ProviderComputeContext, type RequestContext, type SeenSymbols, type SymbolEmitData } from './contextProvider';
import { EmitMode, Priorities, SnippetKind, SpeculativeKind, Trait, TraitKind, type CacheScope, type CompletionContextKind, type ContextItemKey, type FilePath } from './protocol';
import tss, { Symbols } from './typescripts';

export class CompilerOptionsContextRunnable extends ContextComputeRunnable {

	// Traits to collect from the compiler options in the format of [trait kind, trait description, priority, context key, CompilerOptions.enumType (if applicable)]
	public static traitsToCollect: [TraitKind, string, number, ContextItemKey, any][] = [
		[TraitKind.Module, 'The TypeScript module system used in this project is ', Priorities.Traits, Trait.makeContextItemKey(TraitKind.Module), ts.ModuleKind],
		[TraitKind.ModuleResolution, 'The TypeScript module resolution strategy used in this project is ', Priorities.Traits, Trait.makeContextItemKey(TraitKind.ModuleResolution), ts.ModuleResolutionKind],
		[TraitKind.Target, 'The target version of JavaScript for this project is ', Priorities.Traits, Trait.makeContextItemKey(TraitKind.Target), ts.ScriptTarget],
		[TraitKind.Lib, 'Library files that should be included in TypeScript compilation are ', Priorities.Traits, Trait.makeContextItemKey(TraitKind.Lib), undefined],
	];

	private readonly document: FilePath;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, document: FilePath) {
		super(session, languageService, context, Priorities.Traits, ComputeCost.Low);
		this.document = document;
	}

	public override compute(result: ContextResult, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		const compilerOptions = this.getProgram().getCompilerOptions();
		const context = this.context;
		const cachedContextItem = context.getCachedContextItem(Trait.makeContextItemKey(TraitKind.Version));
		if (cachedContextItem !== undefined) {
			result.addCachedContextItem(cachedContextItem);
		} else {
			result.addTrait(TraitKind.Version, Priorities.Traits, 'The TypeScript version used in this project is ', ts.version, this.document);
		}
		for (const [traitKind, trait, priority, key, enumType,] of CompilerOptionsContextRunnable.traitsToCollect) {
			const cachedContextItem = context.getCachedContextItem(key);
			if (cachedContextItem !== undefined) {
				result.addCachedContextItem(cachedContextItem);
			} else {
				let traitValue = compilerOptions[traitKind as keyof tt.CompilerOptions];
				if (traitValue) {
					if (typeof traitValue === "number") {
						const enumName = CompilerOptionsContextRunnable.getEnumName(enumType, traitValue);
						if (enumName) {
							traitValue = enumName;
						}
					}
					result.addTrait(traitKind, priority, trait, traitValue.toString(), this.document);
				}
			}
		}
	}

	private static getEnumName(enumObj: any, value: any): string | undefined {
		return Object.keys(enumObj).find(key => enumObj[key] === value);
	}
}

export abstract class FunctionLikeContextComputeRunnable<T extends tt.FunctionLikeDeclarationBase = tt.FunctionLikeDeclarationBase> extends ContextComputeRunnable {

	protected readonly declaration: T;
	protected readonly sourceFile: tt.SourceFile;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: T, priority: number, cost: ComputeCost) {
		super(session, languageService, context, priority, cost);
		this.declaration = declaration;
		this.sourceFile = declaration.getSourceFile();
	}


	protected getCacheScope(): CacheScope | undefined {
		const body = this.declaration.body;
		if (body === undefined || !ts.isBlock(body)) {
			return undefined;
		}
		return super.createCacheScope(body, this.sourceFile);
	}
}

export class SignatureContextRunnable extends FunctionLikeContextComputeRunnable {

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, declaration: tt.FunctionLikeDeclarationBase, priority: number = Priorities.Locals) {
		super(session, languageService, context, declaration, priority, ComputeCost.Low);
	}

	public override compute(result: ContextResult, token: tt.CancellationToken): void {
		const cacheScope = this.getCacheScope();
		const seen = this.getSeenSymbols();
		const parameters = this.declaration.parameters;
		for (let i = 0; i < parameters.length; i++) {
			token.throwIfCancellationRequested();
			const parameter = this.declaration.parameters[i];
			const type = parameter.type;
			if (type === undefined) {
				continue;
			}
			this.processType(result, type, seen, cacheScope);
		}
		const returnType = this.declaration.type;
		if (returnType !== undefined) {
			token.throwIfCancellationRequested();
			this.processType(result, returnType, seen, cacheScope);
		}
	}

	private processType(result: ContextResult, type: tt.TypeNode, seen: SeenSymbols, cacheScope?: CacheScope | undefined): void {
		const symbolsToEmit = this.getSymbolsToEmitForTypeNode(type);
		if (symbolsToEmit.length === 0) {
			return;
		}
		for (const symbolEmitData of symbolsToEmit) {
			const symbol = symbolEmitData.symbol;
			const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, symbol, EmitMode.ClientBased, cacheScope);
			if (handled) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, this.sourceFile, seen);
			snippetBuilder.addTypeSymbol(symbol, symbolEmitData.name);
			result.addSnippet(snippetBuilder, SnippetKind.Signature, this.priority, SpeculativeKind.emit, cacheInfo);
			seen.add(symbol);
		}
	}
}

export class TypeOfLocalsComputeRunnable extends ContextComputeRunnable {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<tt.Symbol>;
	private readonly cacheScope: CacheScope | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<tt.Symbol>, cacheScope: CacheScope | undefined, priority: number = Priorities.Locals) {
		super(session, languageService, context, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		this.cacheScope = cacheScope;
	}

	public override compute(result: ContextResult, cancellationToken: tt.CancellationToken): void {
		cancellationToken.throwIfCancellationRequested();
		const token = this.tokenInfo.previous ?? this.tokenInfo.token ?? this.tokenInfo.touching;
		const symbols = this.symbols;
		const typeChecker = symbols.getTypeChecker();
		const inScope = typeChecker.getSymbolsInScope(token, ts.SymbolFlags.BlockScopedVariable);
		if (inScope.length === 0) {
			return;
		}
		const sourceFile = token.getSourceFile();
		const seen = this.getSeenSymbols();
		// The symbols are block scope variables. We try to find the type of the variable
		// to include it in the context.
		for (const symbol of inScope) {
			cancellationToken.throwIfCancellationRequested();
			if (seen.has(symbol) || this.excludes.has(symbol)) {
				continue;
			}
			const symbolSourceFile = Symbols.getPrimarySourceFile(symbol);
			// If the symbol is not defined in the current source file we skip it. It would otherwise
			// pollute with too many types from the global scope from other files.
			if (symbolSourceFile !== sourceFile || this.skipSourceFile(symbolSourceFile)) {
				continue;
			}
			const declaration: tt.VariableDeclaration | undefined = Symbols.getDeclaration(symbol, ts.SyntaxKind.VariableDeclaration);
			if (declaration === undefined) {
				continue;
			}
			let symbolsToEmit: SymbolEmitData[] | undefined = undefined;
			if (declaration.type !== undefined) {
				symbolsToEmit = this.getSymbolsToEmitForTypeNode(declaration.type);
			} else {
				const type = typeChecker.getTypeAtLocation(declaration.type ?? declaration);
				if (type !== undefined) {
					symbolsToEmit = this.getSymbolsToEmitForType(type);
				}
			}
			if (symbolsToEmit === undefined || symbolsToEmit.length === 0) {
				continue;
			}
			for (const symbolEmitData of symbolsToEmit) {
				cancellationToken.throwIfCancellationRequested();
				const symbol = symbolEmitData.symbol;
				const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, symbol, EmitMode.ClientBasedOnTimeout, this.cacheScope);
				if (handled) {
					continue;
				}
				const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
				snippetBuilder.addTypeSymbol(symbol, symbolEmitData.name);
				result.addSnippet(snippetBuilder, SnippetKind.Completion, this.priority, SpeculativeKind.emit, cacheInfo);
				seen.add(symbol);
			}
			seen.add(symbol);
		}
	}
}

export class TypesOfNeighborFilesComputeRunnable extends ContextComputeRunnable {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly cacheScope: CacheScope | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, cacheScope: CacheScope | undefined, priority: number = Priorities.NeighborFiles) {
		super(session, languageService, context, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.cacheScope = cacheScope;
	}
	public override compute(result: ContextResult, cancellationToken: tt.CancellationToken): void {
		if (result.tokenBudget.isExhausted()) {
			return;
		}
		cancellationToken.throwIfCancellationRequested();
		const symbols = this.symbols;
		const seen = this.getSeenSymbols();
		const token = this.tokenInfo.previous ?? this.tokenInfo.token ?? this.tokenInfo.touching;
		const sourceFile = token.getSourceFile();
		for (const neighborFile of this.context.neighborFiles) {
			cancellationToken.throwIfCancellationRequested();
			if (result.tokenBudget.isExhausted()) {
				return;
			}
			const neighborSourceFile = this.getProgram().getSourceFile(neighborFile);
			if (neighborSourceFile === undefined || this.skipSourceFile(neighborSourceFile)) {
				continue;
			}
			const sourceFileSymbol = symbols.getSymbolAtLocation(neighborSourceFile);
			// The neighbor file might have been seen when importing a value module
			if (sourceFileSymbol === undefined || seen.has(sourceFileSymbol)) {
				continue;
			}
			if (sourceFileSymbol.exports !== undefined) {
				for (const member of sourceFileSymbol.exports) {
					cancellationToken.throwIfCancellationRequested();
					const memberSymbol = member[1];
					if ((memberSymbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum | ts.SymbolFlags.Function)) === 0) {
						continue;
					}
					const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, memberSymbol, EmitMode.ClientBasedOnTimeout, this.cacheScope);
					if (handled) {
						continue;
					}

					const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
					snippetBuilder.addTypeSymbol(memberSymbol, member[0] as string);
					seen.add(memberSymbol);
					if (!result.addSnippet(snippetBuilder, SnippetKind.NeighborFile, Priorities.NeighborFiles, SpeculativeKind.emit, cacheInfo, true)) {
						return;
					}
				}
			}
		}
	}
}

export class TypeOfImportsComputeRunnable extends ContextComputeRunnable {

	private readonly tokenInfo: tss.TokenInfo;
	private readonly excludes: Set<tt.Symbol>;
	private readonly cacheScope: CacheScope | undefined;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, excludes: Set<tt.Symbol>, cacheScope: CacheScope | undefined, priority: number = Priorities.ImportedTypes) {
		super(session, languageService, context, priority, ComputeCost.Medium);
		this.tokenInfo = tokenInfo;
		this.excludes = excludes;
		this.cacheScope = cacheScope;
	}

	public override compute(result: ContextResult, cancellationToken: tt.CancellationToken): void {
		cancellationToken.throwIfCancellationRequested();
		if (result.tokenBudget.isExhausted()) {
			return;
		}

		const token = this.tokenInfo.previous ?? this.tokenInfo.token ?? this.tokenInfo.touching;
		const symbols = this.symbols;
		const typeChecker = symbols.getTypeChecker();

		// Find all symbols in scope the represent a type and the type comes from a source file
		// that should be considered for context.
		const typesInScope = typeChecker.getSymbolsInScope(token, ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum | ts.SymbolFlags.Alias);
		if (typesInScope.length === 0) {
			return;
		}
		const sourceFile = token.getSourceFile();
		const seen = this.getSeenSymbols();
		for (const symbol of typesInScope) {
			cancellationToken.throwIfCancellationRequested();
			if (this.excludes.has(symbol)) {
				continue;
			}
			const symbolSourceFile = Symbols.getPrimarySourceFile(symbol);
			if (symbolSourceFile === undefined || this.skipSourceFile(symbolSourceFile)) {
				continue;
			}
			let contextSymbol: tt.Symbol | undefined = symbol;
			const name = symbol.name;
			if (Symbols.isAlias(symbol)) {
				const leaf = this.symbols.getLeafAliasedSymbol(symbol);
				if (leaf !== undefined && (leaf.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum)) !== 0) {
					contextSymbol = leaf;
				} else {
					contextSymbol = undefined;
				}
			}
			if (contextSymbol === undefined || this.excludes.has(contextSymbol)) {
				continue;
			}
			if (contextSymbol !== symbol) {
				const symbolSourceFile = Symbols.getPrimarySourceFile(contextSymbol);
				if (symbolSourceFile === undefined || this.skipSourceFile(symbolSourceFile) || symbolSourceFile === sourceFile) {
					continue;
				}
			} else if (symbolSourceFile === sourceFile) {
				continue;
			}
			const [handled, cacheInfo] = this.handleSymbolIfCachedOrSeen(result, contextSymbol, EmitMode.ClientBasedOnTimeout, this.cacheScope);
			if (handled) {
				continue;
			}

			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
			snippetBuilder.addTypeSymbol(contextSymbol, name);
			const full = !result.addSnippet(snippetBuilder, SnippetKind.GeneralScope, this.priority, SpeculativeKind.emit, cacheInfo, true);
			seen.add(contextSymbol);
			if (full) {
				break;
			}
		}
	}
}

export class TypeOfExpressionComputeRunnable extends ContextComputeRunnable {

	private readonly expression: tt.Expression;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, expression: tt.Expression, priority: number = Priorities.Locals) {
		super(session, languageService, context, priority, ComputeCost.Low);
		this.expression = expression;
	}

	public static create(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, tokenInfo: tss.TokenInfo, _token: tt.CancellationToken): TypeOfExpressionComputeRunnable | undefined {
		const previous = tokenInfo.previous;
		if (previous === undefined || previous.parent === undefined) {
			return;
		}
		if ((ts.isIdentifier(previous) || previous.kind === ts.SyntaxKind.DotToken) && ts.isPropertyAccessExpression(previous.parent)) {
			const identifier = this.getRightMostIdentifier(previous.parent.expression, 0);
			if (identifier !== undefined) {
				return new TypeOfExpressionComputeRunnable(session, languageService, context, identifier);
			}
		}
		return undefined;
	}


	private static getRightMostIdentifier(node: tt.Node, count: number): tt.Identifier | undefined {
		if (count === 32) {
			return undefined;
		}
		switch (node.kind) {
			case ts.SyntaxKind.Identifier:
				return node as tt.Identifier;
			case ts.SyntaxKind.PropertyAccessExpression:
				return this.getRightMostIdentifier((node as tt.PropertyAccessExpression).name, count + 1);
			case ts.SyntaxKind.ElementAccessExpression:
				return this.getRightMostIdentifier((node as tt.ElementAccessExpression).argumentExpression, count + 1);
			case ts.SyntaxKind.CallExpression:
				return this.getRightMostIdentifier((node as tt.CallExpression).expression, count + 1);
			default:
				return undefined;
		}
	}

	public override compute(result: ContextResult, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		const expSymbol = this.symbols.getLeafSymbolAtLocation(this.expression);
		if (expSymbol === undefined) {
			return;
		}
		const typeChecker = this.symbols.getTypeChecker();
		const seen = this.getSeenSymbols();
		if (seen.has(expSymbol)) {
			return;
		}
		const type = typeChecker.getTypeOfSymbolAtLocation(expSymbol, this.expression);
		const signatures = type.getConstructSignatures().concat(type.getCallSignatures());
		const sourceFile = this.expression.getSourceFile();
		for (const signature of signatures) {
			token.throwIfCancellationRequested();
			const returnType = signature.getReturnType();
			const returnTypeSymbol = returnType.aliasSymbol ?? returnType.getSymbol();
			if (returnTypeSymbol === undefined || seen.has(returnTypeSymbol)) {
				continue;
			}
			const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
			snippetBuilder.addTypeSymbol(returnTypeSymbol, returnTypeSymbol.name);
			result.addSnippet(snippetBuilder, SnippetKind.Completion, this.priority, SpeculativeKind.ignore);
		}
		const typeSymbol = type.getSymbol();
		if (typeSymbol === undefined || seen.has(typeSymbol)) {
			return;
		}
		const snippetBuilder = new CodeSnippetBuilder(this.session, this.symbols, sourceFile, seen);
		snippetBuilder.addTypeSymbol(typeSymbol, typeSymbol.name);
		result.addSnippet(snippetBuilder, SnippetKind.Completion, this.priority, SpeculativeKind.ignore);
		seen.add(typeSymbol);
	}
}

export abstract class FunctionLikeContextProvider extends ContextProvider {

	protected readonly functionLikeDeclaration: tt.FunctionLikeDeclarationBase;
	protected readonly tokenInfo: tss.TokenInfo;
	protected readonly computeContext: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;
	private readonly cacheScope: CacheScope | undefined;

	constructor(contextKind: CompletionContextKind, symbolsToQuery: tt.SymbolFlags | undefined, declaration: tt.FunctionLikeDeclarationBase, tokenInfo: tss.TokenInfo, computeContext: ProviderComputeContext) {
		super(contextKind, symbolsToQuery);
		this.functionLikeDeclaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeContext = computeContext;
		this.isCallableProvider = true;
		this.cacheScope = CacheScopes.fromDeclaration(declaration);
	}

	public override getCallableCacheScope(): CacheScope | undefined {
		return this.cacheScope;
	}

	public override provide(result: ContextComputeRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		result.addPrimary(new SignatureContextRunnable(session, languageService, context, this.functionLikeDeclaration),);

		// If we already have a callable provider then we don't need to compute anything
		// around the cursor location.
		if (!this.computeContext.isFirstCallableProvider(this)) {
			return;
		}

		const excludes = this.getTypeExcludes(languageService, context);
		result.addPrimary(new TypeOfLocalsComputeRunnable(session, languageService, context, this.tokenInfo, excludes, CacheScopes.fromDeclaration(this.functionLikeDeclaration)));
		const runnable = TypeOfExpressionComputeRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new TypeOfImportsComputeRunnable(session, languageService, context, this.tokenInfo, excludes, this.cacheScope));
		result.addTertiary(new TypesOfNeighborFilesComputeRunnable(session, languageService, context, this.tokenInfo, this.cacheScope));
	}

	protected abstract getTypeExcludes(languageService: tt.LanguageService, context: RequestContext): Set<tt.Symbol>;
}