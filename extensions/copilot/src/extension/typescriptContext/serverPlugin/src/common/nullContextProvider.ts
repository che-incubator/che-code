/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';

import { ContextProvider, type ComputeContextSession, type ContextComputeRunnableCollector, type RequestContext } from './contextProvider';
import { CompletionContextKind } from './protocol';

export class NullContextProvider extends ContextProvider {

	constructor() {
		super(CompletionContextKind.None);
	}

	public provide(_result: ContextComputeRunnableCollector, _session: ComputeContextSession, _languageService: tt.LanguageService, _context: RequestContext, _token: tt.CancellationToken): void {
	}
}