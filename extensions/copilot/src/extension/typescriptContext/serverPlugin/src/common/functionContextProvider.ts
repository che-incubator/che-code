/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { type ComputeContextSession, type ContextComputeRunnableCollector, type ProviderComputeContext, type RequestContext } from './contextProvider';
import { FunctionLikeContextProvider } from './baseContextProviders';
import { CompletionContextKind } from './protocol';
import type tss from './typescripts';

export class FunctionContextProvider extends FunctionLikeContextProvider {


	protected readonly functionDeclaration: tt.FunctionDeclaration | tt.ArrowFunction | tt.FunctionExpression;

	constructor(functionDeclaration: tt.FunctionDeclaration | tt.ArrowFunction | tt.FunctionExpression, tokenInfo: tss.TokenInfo, computeContext: ProviderComputeContext) {
		super(CompletionContextKind.Function, ts.SymbolFlags.Function | ts.SymbolFlags.ValueModule, functionDeclaration, tokenInfo, computeContext);
		this.functionDeclaration = functionDeclaration;
	}

	public override provide(result: ContextComputeRunnableCollector, session: ComputeContextSession, languageService: tt.LanguageService, context: RequestContext, token: tt.CancellationToken): void {
		super.provide(result, session, languageService, context, token);
	}

	protected override getTypeExcludes(): Set<tt.Symbol> {
		return new Set();
	}
}