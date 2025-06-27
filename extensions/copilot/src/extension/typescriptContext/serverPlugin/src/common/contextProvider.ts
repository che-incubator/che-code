/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { Host } from './host';
import { CachedItem, CacheScopeKind, CodeSnippet, ComputationState, ContextKind, EmitMode, ErrorData, MetaData, Timings, Trait, TraitKind, type CachedContextItem, type CacheInfo, type CacheScope, type CompletionContextKind, type ComputationStateKey, type ContextItem, type ContextItemKey, type FilePath, type Range, type RelatedFile, type SnippetKind, type SpeculativeKind } from './protocol';
import tss, { ImportedByState, Sessions, Symbols, Types } from './typescripts';
import { LRUCache } from './utils';


export class RecoverableError extends Error {

	public static readonly SourceFileNotFound: number = 1;
	public static readonly NodeNotFound: number = 2;
	public static readonly NodeKindMismatch: number = 3;
	public static readonly SymbolNotFound: number = 4;
	public static readonly NoDeclaration: number = 5;
	public static readonly NoProgram: number = 6;
	public static readonly NoSourceFile: number = 7;

	public readonly code: number;

	constructor(message: string, code: number) {
		super(message);
		this.code = code;
	}
}

export abstract class ProgramContext {

	/**
	 * The symbol is skipped if it has no declarations or if one declaration
	 * comes from a default or external library.
	 */
	protected getSymbolInfo(symbol: tt.Symbol): { skip: true } | { skip: false; primary: tt.SourceFile } {
		const declarations = symbol.declarations;
		if (declarations === undefined || declarations.length === 0) {
			return { skip: true };
		}
		let primary: tt.SourceFile | undefined;
		let skipCount = 0;
		const program = this.getProgram();
		for (const declaration of declarations) {
			const sourceFile = declaration.getSourceFile();
			if (primary === undefined) {
				primary = sourceFile;
			}
			if (program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile)) {
				skipCount++;
			}
		}
		return skipCount > 0 ? { skip: true } : { skip: false, primary: primary! };
	}

	protected skipDeclaration(declaration: tt.Declaration, sourceFile: tt.SourceFile = declaration.getSourceFile()): boolean {
		const program = this.getProgram();
		return program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile) || sourceFile.isDeclarationFile;
	}

	protected abstract getProgram(): tt.Program;

}

export class RequestContext {

	private readonly symbols: Map<tt.Program, Symbols>;
	private readonly seenSymbols: SeenSymbols;

	public readonly neighborFiles: tt.server.NormalizedPath[];
	public readonly knownContextItems: Map<ContextItemKey, CachedContextItem>;

	constructor(session: ComputeContextSession, neighborFiles: tt.server.NormalizedPath[], knownContextItems: Map<ContextItemKey, CachedContextItem>) {
		this.symbols = new Map();
		this.neighborFiles = neighborFiles;
		this.knownContextItems = knownContextItems;
		const clientEmittedSymbols: string[] = [];
		for (const item of knownContextItems.values()) {
			if (item.emitMode === EmitMode.ClientBased) {
				clientEmittedSymbols.push(item.key);
			}
		}
		this.seenSymbols = new SeenSymbols(session, clientEmittedSymbols);
	}

	public getSymbols(program: tt.Program): Symbols {
		let result = this.symbols.get(program);
		if (result === undefined) {
			result = new Symbols(program);
			this.symbols.set(program, result);
		}
		return result;
	}

	public getSeenSymbols(): SeenSymbols {
		return this.seenSymbols;
	}

	public getPreferredNeighborFiles(program: tt.Program): tt.SourceFile[] {
		const result: tt.SourceFile[] = [];
		for (const file of this.neighborFiles) {
			const sourceFile = program.getSourceFile(file);
			if (sourceFile !== undefined) {
				result.push(sourceFile);
			}
		}
		return result;
	}

	public isCachedOnClient(key: ContextItemKey): boolean {
		return this.knownContextItems.has(key);
	}

	public getCachedContextItem(key: ContextItemKey): CachedContextItem | undefined {
		return this.knownContextItems.get(key);
	}
}

export abstract class Search<R> extends ProgramContext {

	protected readonly program: tt.Program;
	protected readonly symbols: Symbols;

	constructor(program: tt.Program, symbols: Symbols = new Symbols(program)) {
		super();
		if (program !== symbols.getProgram()) {
			throw new Error('Program and symbols program must match');
		}
		this.program = program;
		this.symbols = symbols;
	}

	public getSymbols(): Symbols {
		return this.symbols;
	}

	protected override getProgram(): tt.Program {
		return this.program;
	}

	public getHeritageSymbol(node: tt.Node): tt.Symbol | undefined {
		let result = this.symbols.getSymbolAtLocation(node);
		if (result === undefined) {
			return undefined;
		}
		if (Symbols.isAlias(result)) {
			result = this.symbols.getAliasedSymbol(result);
		}
		let counter = 0;
		while (Symbols.isTypeAlias(result) && counter < 10) {
			const declarations = result!.declarations;
			if (declarations !== undefined) {
				const start: tt.Symbol = result!;
				for (const declaration of declarations) {
					if (ts.isTypeAliasDeclaration(declaration)) {
						const type = declaration.type;
						if (ts.isTypeReferenceNode(type)) {
							result = this.symbols.getLeafSymbolAtLocation(type.typeName);
						}
					}
				}
				if (start === result) {
					break;
				}
			}
			counter++;
		}
		return result;
	}

	public static getNodeInProgram<T extends tt.Node>(program: tt.Program, node: T): T {
		function sameChain(node: tt.Node | undefined, other: tt.Node | undefined): boolean {
			if (node === undefined || other === undefined) {
				return node === other;
			}
			while (node !== undefined && other !== undefined) {
				if (node.kind !== other.kind || node.pos !== other.pos || node.end !== other.end) {
					return false;
				}
				node = node.parent;
				other = other.parent;
			}
			return node === undefined && other === undefined;
		}
		const fileName = node.getSourceFile().fileName;
		const other = program.getSourceFile(fileName);
		if (other === undefined) {
			throw new RecoverableError(`No source file found for ${fileName}`, RecoverableError.SourceFileNotFound);
		}
		const candidate = tss.getTokenAtPosition(other, node.pos);
		let otherNode = candidate;
		if (otherNode === undefined) {
			throw new RecoverableError(`No node found for ${fileName}:${node.pos}`, RecoverableError.NodeNotFound);
		}

		while (otherNode !== undefined) {
			if (node.pos === otherNode.pos && node.end === otherNode.end && node.kind === otherNode.kind && sameChain(node.parent, otherNode.parent)) {
				return otherNode as T;
			}
			otherNode = otherNode.parent;
		}

		throw new RecoverableError(`Found node ${candidate.kind} for node ${node.kind} in file ${fileName}:${node.pos}`, RecoverableError.NodeKindMismatch);
	}

	public abstract with(program: tt.Program): Search<R>;
	public abstract score(program: tt.Program, context: RequestContext): number;
	public abstract run(context: RequestContext, token: tt.CancellationToken): R | undefined;

}

export interface Logger {
	info(s: string): void;
	msg(s: string, type?: tt.server.Msg): void;
	startGroup(): void;
	endGroup(): void;
}

export class NullLogger implements Logger {
	public info(): void {
	}
	public msg(): void {
	}
	public startGroup(): void {
	}
	public endGroup(): void {
	}
}

export type CodeCacheItem = {
	value: string[];
	uri: string;
	additionalUris?: Set<string>;
};

export abstract class ComputeContextSession implements tss.StateProvider {

	public readonly host: Host;

	private readonly codeCache: LRUCache<string, CodeCacheItem>;
	private readonly importedByState: Map<string, ImportedByState>;
	private readonly supportsCaching: boolean;

	protected constructor(host: Host, supportsCaching: boolean) {
		this.host = host;
		this.codeCache = new LRUCache(100);
		this.importedByState = new Map();
		this.supportsCaching = supportsCaching;
	}

	public getImportedByState(key: string): ImportedByState {
		let state = this.importedByState.get(key);
		if (state === undefined) {
			state = new ImportedByState(key);
			this.importedByState.set(key, state);
		}
		return state;
	}

	public run<R>(search: Search<R>, context: RequestContext, token: tt.CancellationToken): [tt.Program | undefined, R | undefined] {
		const programsToSearch = this.getPossiblePrograms(search, context);
		for (const program of programsToSearch) {
			const programSearch = search.with(program);
			const result = programSearch.run(context, token);
			if (result !== undefined) {
				return [program, result];
			}
		}
		return [undefined, undefined];
	}

	private getPossiblePrograms<R>(search: Search<R>, context: RequestContext): tt.Program[] {
		const candidates: [number, tt.Program][] = [];
		for (const languageService of this.getLanguageServices()) {
			const program = languageService.getProgram();
			if (program === undefined) {
				continue;
			}
			const score = search.score(program, context);
			if (score > 0) {
				candidates.push([score, program]);
			}
		}
		return candidates.sort((a, b) => b[0] - a[0]).map(c => c[1]);
	}

	public getCachedCode(key: string): CodeCacheItem | undefined;
	public getCachedCode(symbol: tt.Symbol): CodeCacheItem | undefined;
	public getCachedCode(symbolOrKey: tt.Symbol | string, symbol?: tt.Symbol): CodeCacheItem | undefined {
		if (!this.supportsCaching) {
			return undefined;
		}
		if (typeof symbolOrKey === 'string') {
			return this.codeCache.get(symbolOrKey);
		} else {
			const key = Symbols.createVersionedKey(symbol!, this, this.host);
			return key === undefined ? undefined : this.codeCache.get(key);
		}
	}

	public cacheCode(key: string, code: CodeCacheItem): void;
	public cacheCode(symbol: tt.Symbol, code: CodeCacheItem): void;
	public cacheCode(symbolOrKey: tt.Symbol | string, code: CodeCacheItem): void {
		if (!this.supportsCaching) {
			return;
		}
		if (typeof symbolOrKey === 'string') {
			this.codeCache.set(symbolOrKey as string, code);
		} else {
			const key = Symbols.createVersionedKey(symbolOrKey, this, this.host);
			if (key !== undefined) {
				this.codeCache.set(key, code!);
			}
		}
	}

	public addComputationStateItems(result: ContextResult, computeContext: ProviderComputeContext): void {
		const range = computeContext.getImportsByCacheRange();
		if (range === undefined) {
			for (const state of this.importedByState.values()) {
				state.markAsOutdated();
			}
			return;
		}
		result.addComputationState('importedByState', { kind: CacheScopeKind.Range, range });
	}

	public applyComputationStates(states: readonly ComputationState[]): void {
		let hasImportedByState = false;
		for (const item of states) {
			if (item.kind !== ContextKind.ComputationState) {
				continue;
			}
			if (item.key === 'importedByState') {
				hasImportedByState = true;
			}
		}
		if (!hasImportedByState) {
			for (const state of this.importedByState.values()) {
				state.markAsOutdated();
			}
		}
	}

	public enableBlueprintSearch(): boolean {
		return false;
	}

	public abstract readonly logger: Logger;
	public abstract getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService>;
	public abstract logError(error: Error, cmd: string): void;
	public abstract getScriptVersion(sourceFile: tt.SourceFile): string | undefined;
}

export class LanguageServerSession extends ComputeContextSession {
	private readonly session: tt.server.Session;

	public readonly logger: Logger;

	constructor(session: tt.server.Session, host: Host) {
		super(host, true);
		this.session = session;
		const projectService = Sessions.getProjectService(this.session);
		this.logger = projectService?.logger ?? new NullLogger();
	}

	public logError(error: Error, cmd: string): void {
		this.session.logError(error, cmd);
	}

	public getFileAndProject(args: tt.server.protocol.FileRequestArgs): Sessions.FileAndProject | undefined {
		return Sessions.getFileAndProject(this.session, args);
	}

	public getPositionInFile(args: tt.server.protocol.Location & { position?: number }, file: tt.server.NormalizedPath): number | undefined {
		return Sessions.getPositionInFile(this.session, args, file);
	}

	public *getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService> {
		const projectService = Sessions.getProjectService(this.session);
		if (projectService === undefined) {
			return;
		}
		if (sourceFile === undefined) {
			for (const project of projectService.configuredProjects.values()) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
			for (const project of projectService.inferredProjects) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
			for (const project of projectService.externalProjects) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
		} else {
			const file = ts.server.toNormalizedPath(sourceFile.fileName);
			const scriptInfo = projectService.getScriptInfoForNormalizedPath(file)!;
			yield* scriptInfo ? scriptInfo.containingProjects.map(p => p.getLanguageService()) : [];
		}
	}

	public override getScriptVersion(sourceFile: tt.SourceFile): string | undefined {
		const file = ts.server.toNormalizedPath(sourceFile.fileName);
		const projectService = Sessions.getProjectService(this.session);
		if (projectService === undefined) {
			return undefined;
		}
		const scriptInfo = projectService.getScriptInfoForNormalizedPath(file);
		return scriptInfo?.getLatestVersion();
	}
}

export class SingleLanguageServiceSession extends ComputeContextSession {

	private readonly languageService: tt.LanguageService;

	public readonly logger: Logger;

	constructor(languageService: tt.LanguageService, host: Host) {
		super(host, false);
		this.languageService = languageService;
		this.logger = new NullLogger();
	}

	public logError(_error: Error, _cmd: string): void {
		// Null logger;
	}

	public *getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService> {
		const ls: tt.LanguageService | undefined = this.languageService;
		if (ls === undefined) {
			return;
		}
		if (sourceFile === undefined) {
			yield ls;
		} else {
			const file = ts.server.toNormalizedPath(sourceFile.fileName);
			const scriptInfo = ls.getProgram()?.getSourceFile(file);
			if (scriptInfo === undefined) {
				return;
			}
			yield ls;
		}
	}

	public override run<R>(search: Search<R>, context: RequestContext, token: tt.CancellationToken): [tt.Program | undefined, R | undefined] {
		const program = this.languageService.getProgram();
		if (program === undefined) {
			return [undefined, undefined];
		}
		if (search.score(program, context) === 0) {
			return [undefined, undefined];
		}
		const programSearch = search.with(program);
		const result = programSearch.run(context, token);
		if (result !== undefined) {
			return [program, result];
		} else {
			return [undefined, undefined];
		}
	}

	public override getScriptVersion(_sourceFile: tt.SourceFile): string | undefined {
		return undefined;
	}
}

export interface SnippetProvider {
	isEmpty(): boolean;
	snippet(snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache?: CacheInfo | undefined): CodeSnippet;
}

export class ContextResult {

	public readonly tokenBudget: TokenBudget;
	private readonly _metaItems: (MetaData | ErrorData | Timings)[] = [];
	private readonly _items: (CachedItem | ComputationState | RelatedFile | Trait | CodeSnippet)[];
	private readonly _cachedItems: Set<string>;

	constructor(tokenBudget: TokenBudget) {
		this.tokenBudget = tokenBudget;
		this._metaItems = [];
		this._items = [];
		this._cachedItems = new Set();
	}

	public get items(): ContextItem[] {
		return (this._metaItems as ContextItem[]).concat(this._items);
	}

	public addMetaData(completionKind: CompletionContextKind, path?: number[]): void {
		this._metaItems.push(MetaData.create(completionKind, path));
	}

	public addErrorData(error: RecoverableError): void {
		this._metaItems.push(ErrorData.create(error.code, error.message));
	}

	public addTimings(totalTime: number, computeTime: number): void {
		this._metaItems.push(Timings.create(totalTime, computeTime));
	}

	public addCachedContextItem(item: CachedContextItem): void;
	public addCachedContextItem(item: CachedContextItem, ifRoom: false): void;
	public addCachedContextItem(item: CachedContextItem, ifRoom: true): boolean;
	public addCachedContextItem(item: CachedContextItem, ifRoom: boolean = false): boolean {
		if (this._cachedItems.has(item.key)) {
			return true;
		}
		const size = item.sizeInChars;
		if (ifRoom && size !== undefined && !this.tokenBudget.hasRoom(size)) {
			return false;
		}
		this._items.push(CachedItem.create(item.key, item.emitMode));
		this._cachedItems.add(item.key);
		if (size !== undefined) {
			this.tokenBudget.spent(size);
		}
		return true;
	}

	public addComputationState(key: ComputationStateKey, scope: CacheScope): void {
		this._items.push(ComputationState.create(key, scope));
	}

	public addTrait(traitKind: TraitKind, priority: number, name: string, value: string, document?: FilePath | undefined): void {
		const trait = Trait.create(traitKind, priority, name, value, document);
		this._items.push(trait);
		this.tokenBudget.spent(Trait.sizeInChars(trait));
	}

	public addSnippet(code: SnippetProvider, snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache?: CacheInfo): void;
	public addSnippet(code: SnippetProvider, snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache: CacheInfo | undefined, ifRoom: false): void;
	public addSnippet(code: SnippetProvider, snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache: CacheInfo | undefined, ifRoom: true): boolean;
	public addSnippet(code: SnippetProvider, snippetKind: SnippetKind, priority: number, speculativeKind: SpeculativeKind, cache?: CacheInfo, ifRoom: boolean = false): boolean {
		if (code.isEmpty()) {
			return true;
		}
		const snippet: CodeSnippet = code.snippet(snippetKind, priority, speculativeKind, cache);
		const size = CodeSnippet.sizeInChars(snippet);
		if (ifRoom && !this.tokenBudget.hasRoom(size)) {
			return false;
		}
		this.tokenBudget.spent(size);
		this._items.push(snippet);
		return true;
	}
}

export enum ComputeCost {
	Low = 1,
	Medium = 2,
	High = 3
}

export class SeenSymbols {

	private readonly session: ComputeContextSession;
	private readonly symbols: Set<tt.Symbol> = new Set();
	private readonly keys: Set<string> = new Set();

	constructor(session: ComputeContextSession, clientEmittedSymbols?: string[]) {
		this.session = session;
		this.symbols = new Set();
		this.keys = clientEmittedSymbols ? new Set(clientEmittedSymbols) : new Set();
	}

	public add(symbol: tt.Symbol): void {
		this.symbols.add(symbol);
		const key = Symbols.createKey(symbol, this.session.host);
		if (key !== undefined) {
			this.keys.add(key);
		}
	}

	public has(symbol: tt.Symbol): boolean {
		if (this.symbols.has(symbol)) {
			return true;
		}
		const key = Symbols.createKey(symbol, this.session.host);
		if (key === undefined) {
			return false;
		}
		if (this.keys.has(key)) {
			this.symbols.add(symbol);
			return true;
		} else {
			return false;
		}
	}

	public manages(symbol: tt.Symbol): boolean {
		if (this.has(symbol)) {
			return true;
		}
		this.add(symbol);
		return false;
	}
}

export type SymbolEmitData = {
	symbol: tt.Symbol;
	name?: string;
}

export namespace CacheScopes {
	export function fromDeclaration(declaration: tt.FunctionLikeDeclarationBase): CacheScope | undefined {
		const body = declaration.body;
		if (body === undefined || !ts.isBlock(body)) {
			return undefined;
		}
		return create(body, declaration.getSourceFile());
	}

	export function create(node: tt.Node, sourceFile?: tt.SourceFile | undefined): CacheScope;
	export function create(node: tt.NodeArray<tt.Node>, sourceFile: tt.SourceFile | undefined): CacheScope;
	export function create(node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheScope {
		let startOffset: number;
		let endOffset: number;
		if (isNodeArray(node)) {
			startOffset = node.pos;
			endOffset = node.end;
		} else {
			startOffset = node.getStart(sourceFile);
			endOffset = node.getEnd();
			if (sourceFile === undefined) {
				sourceFile = node.getSourceFile();
			}
		}
		const start = ts.getLineAndCharacterOfPosition(sourceFile!, startOffset);
		const end = ts.getLineAndCharacterOfPosition(sourceFile!, endOffset);
		return {
			kind: CacheScopeKind.Range,
			range: {
				start,
				end,
			}
		};
	}

	function isNodeArray(node: tt.Node | tt.NodeArray<tt.Node>): node is tt.NodeArray<tt.Node> {
		return Array.isArray(node);
	}
}

export abstract class ContextComputeRunnable {

	protected readonly session: ComputeContextSession;
	protected readonly languageService: tt.LanguageService;
	private readonly program: tt.Program | undefined;
	protected readonly context: RequestContext;
	protected readonly symbols: Symbols;
	public readonly priority: number;
	public readonly cost: ComputeCost;

	constructor(session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, priority: number, cost: ComputeCost) {
		this.session = session;
		this.languageService = languageService;
		this.program = languageService.getProgram();
		this.context = context;
		this.symbols = context.getSymbols(this.getProgram());
		this.priority = priority;
		this.cost = cost;
	}

	public abstract compute(result: ContextResult, token: tt.CancellationToken): void;

	protected getProgram(): tt.Program {
		if (this.program === undefined) {
			throw new RecoverableError('No program available', RecoverableError.NoProgram);
		}
		return this.program;
	}

	protected getSeenSymbols(): SeenSymbols {
		return this.context.getSeenSymbols();
	}

	protected createCacheScope(node: tt.Node, sourceFile?: tt.SourceFile | undefined): CacheScope;
	protected createCacheScope(node: tt.NodeArray<tt.Node>, sourceFile: tt.SourceFile | undefined): CacheScope;
	protected createCacheScope(node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheScope {
		return CacheScopes.create(node as any, sourceFile);
	}

	protected createCacheInfo(symbol: tt.Symbol, emitMode: EmitMode, node: tt.Node, sourceFile?: tt.SourceFile | undefined): CacheInfo | undefined;
	protected createCacheInfo(symbol: tt.Symbol, emitMode: EmitMode, node: tt.NodeArray<tt.Node>, sourceFile: tt.SourceFile | undefined): CacheInfo | undefined;
	protected createCacheInfo(symbol: tt.Symbol, emitMode: EmitMode, node: tt.Node | tt.NodeArray<tt.Node>, sourceFile?: tt.SourceFile | undefined): CacheInfo | undefined {
		if (symbol === undefined) {
			return undefined;
		}
		const key = Symbols.createKey(symbol, this.session.host);
		if (key === undefined) {
			return undefined;
		}
		const scope = CacheScopes.create(node as any, sourceFile);
		return {
			key: key,
			emitMode,
			scope
		};
	}

	protected createCacheInfoFromScope(symbol: tt.Symbol, emitMode: EmitMode, scope: CacheScope): CacheInfo | undefined {
		if (symbol === undefined) {
			return undefined;
		}
		const key = Symbols.createKey(symbol, this.session.host);
		if (key === undefined) {
			return undefined;
		}
		return {
			key: key,
			emitMode,
			scope: Object.assign({}, scope)
		};
	}

	protected handleSymbolIfCachedOrSeen(result: ContextResult, symbol: tt.Symbol, emitMode: EmitMode, cacheScope: CacheScope | undefined): [boolean, CacheInfo | undefined] {
		if (cacheScope === undefined) {
			return [false, undefined];
		}
		const cacheInfo = cacheScope !== undefined ? this.createCacheInfoFromScope(symbol, emitMode, cacheScope) : undefined;
		const cachedContextItem = cacheInfo !== undefined ? this.context.getCachedContextItem(cacheInfo.key) : undefined;
		const seen = this.getSeenSymbols();
		if (cachedContextItem === undefined) {
			if (seen.has(symbol)) {
				return [true, undefined];
			} else {
				return [false, cacheInfo];
			}
		}
		result.addCachedContextItem(cachedContextItem);
		seen.add(symbol);
		return [true, cacheInfo];
	}

	protected isNodeArray(node: tt.Node | tt.NodeArray<tt.Node>): node is tt.NodeArray<tt.Node> {
		return Array.isArray(node);
	}

	protected skipSourceFile(sourceFile: tt.SourceFile): boolean {
		const program = this.getProgram();
		return program.isSourceFileDefaultLibrary(sourceFile) || program.isSourceFileFromExternalLibrary(sourceFile);
	}

	protected getSymbolsToEmitForTypeNode(node: tt.TypeNode): SymbolEmitData[] {
		const result: SymbolEmitData[] = [];
		this.doGetSymbolsToEmitForTypeNode(result, node);
		return result;
	}

	private doGetSymbolsToEmitForTypeNode(result: SymbolEmitData[], node: tt.TypeNode): void {
		if (ts.isTypeReferenceNode(node)) {
			const symbol = this.symbols.getLeafSymbolAtLocation(node.typeName);
			if (symbol !== undefined) {
				result.push({ symbol, name: node.typeName.getText() });
			}
		} else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
			for (const type of node.types) {
				this.doGetSymbolsToEmitForTypeNode(result, type);
			}
		}
	}

	protected getSymbolsToEmitForType(type: tt.Type): SymbolEmitData[] {
		const result: SymbolEmitData[] = [];
		this.doGetSymbolsToEmitForType(result, type);
		return result;
	}

	private doGetSymbolsToEmitForType(result: SymbolEmitData[], type: tt.Type): void {
		const symbol = type.getSymbol();
		if (symbol !== undefined) {
			result.push({ symbol, name: symbol.getName() });
		} else if (Types.isIntersection(type) || Types.isUnion(type)) {
			for (const item of type.types) {
				this.doGetSymbolsToEmitForType(result, item);
			}
		}
	}
}

export class ContextComputeRunnableCollector {

	public readonly primary: ContextComputeRunnable[];
	public readonly secondary: ContextComputeRunnable[];
	public readonly tertiary: ContextComputeRunnable[];

	constructor() {
		this.primary = [];
		this.secondary = [];
		this.tertiary = [];
	}

	public addPrimary(runnable: ContextComputeRunnable): void {
		this.primary.push(runnable);
	}

	public addSecondary(runnable: ContextComputeRunnable): void {
		this.secondary.push(runnable);
	}

	public addTertiary(runnable: ContextComputeRunnable): void {
		this.tertiary.push(runnable);
	}

	public getPrimaryRunnables(): ContextComputeRunnable[] {
		return this.primary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}

	public getSecondaryRunnables(): ContextComputeRunnable[] {
		return this.secondary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}

	public getTertiaryRunnables(): ContextComputeRunnable[] {
		return this.tertiary.sort((a, b) => {
			const result = a.cost - b.cost;
			if (result !== 0) {
				return result;
			}
			return b.priority - a.priority;
		});
	}
}

export abstract class ContextProvider {

	public readonly contextKind: CompletionContextKind;
	public readonly symbolsToQuery?: tt.SymbolFlags | undefined;

	constructor(contextKind: CompletionContextKind, symbolsToQuery?: tt.SymbolFlags | undefined) {
		this.contextKind = contextKind;
		this.symbolsToQuery = symbolsToQuery;
	}

	public isCallableProvider?: boolean;
	public getCallableCacheScope?(): CacheScope | undefined;
	public getImportsByCacheRange?(): Range | undefined;
	public abstract provide(result: ContextComputeRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void;

	protected _getImportsByCacheRange(node: tt.Node): Range {
		const sourceFile = node.getSourceFile();
		const startOffset = node.getStart(sourceFile);
		const start = ts.getLineAndCharacterOfPosition(sourceFile, startOffset);
		const end = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd());
		return {
			start,
			end,
		};
	}
}

export interface ProviderComputeContext {
	getCompletionKind(): CompletionContextKind;
	getSymbolsToQuery(): tt.SymbolFlags;
	getImportsByCacheRange(): Range | undefined;
	isFirstCallableProvider(contextProvider: ContextProvider): boolean;
	getCallableCacheScope(): CacheScope | undefined;
}
export type ContextProviderFactory = (node: tt.Node, tokenInfo: tss.TokenInfo, context: ProviderComputeContext) => ContextProvider | undefined;

export class TokenBudgetExhaustedError extends Error {
	constructor() {
		super('Budget exhausted');
	}
}

export class TokenBudget {

	private charBudget: number;
	private lowWaterMark: number;
	private itemRejected: boolean;

	constructor(budget: number, lowWaterMark: number = 64) {
		// This is an approximation that we can have 4 characters
		// per token on average.
		this.charBudget = budget * 4;
		this.lowWaterMark = lowWaterMark * 4;
		this.itemRejected = false;
	}

	public spent(chars: number): void {
		this.charBudget -= chars;
	}

	public hasRoom(chars: number): boolean {
		const result = this.charBudget - this.lowWaterMark >= chars;
		if (!result) {
			this.itemRejected = true;
		}
		return result;
	}

	public isExhausted(): boolean {
		return this.charBudget <= 0;
	}

	public wasItemRejected(): boolean {
		return this.itemRejected;
	}

	public throwIfExhausted(): void {
		if (this.charBudget <= 0) {
			throw new TokenBudgetExhaustedError();
		}
	}

	public spentAndThrowIfExhausted(chars: number): void {
		this.spent(chars);
		this.throwIfExhausted();
	}
}