/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { TypeOfExpressionComputeRunnable, TypeOfImportsComputeRunnable, TypeOfLocalsComputeRunnable, TypesOfNeighborFilesComputeRunnable } from './baseContextProviders';
import { ContextProvider, type ComputeContextSession, type ContextComputeRunnableCollector, type ProviderComputeContext, type RequestContext } from './contextProvider';
import { CompletionContextKind } from './protocol';
import tss from './typescripts';

export class ModuleContextProvider extends ContextProvider {

	protected readonly declaration: tt.ModuleDeclaration;
	private readonly tokenInfo: tss.TokenInfo;
	private readonly computeInfo: ProviderComputeContext;

	public override readonly isCallableProvider: boolean;

	constructor(declaration: tt.ModuleDeclaration, tokenInfo: tss.TokenInfo, computeInfo: ProviderComputeContext) {
		super(CompletionContextKind.SourceFile, ts.SymbolFlags.Function);
		this.declaration = declaration;
		this.tokenInfo = tokenInfo;
		this.computeInfo = computeInfo;
		this.isCallableProvider = true;
	}

	public provide(result: ContextComputeRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		token.throwIfCancellationRequested();
		if (!this.computeInfo.isFirstCallableProvider(this)) {
			return;
		}
		const excludes = new Set<tt.Symbol>();
		result.addPrimary(new TypeOfLocalsComputeRunnable(session, languageService, context, this.tokenInfo, excludes, undefined));
		const runnable = TypeOfExpressionComputeRunnable.create(session, languageService, context, this.tokenInfo, token);
		if (runnable !== undefined) {
			result.addPrimary(runnable);
		}
		result.addSecondary(new TypeOfImportsComputeRunnable(session, languageService, context, this.tokenInfo, excludes, undefined));
		result.addTertiary(new TypesOfNeighborFilesComputeRunnable(session, languageService, context, this.tokenInfo, undefined));
	}
}