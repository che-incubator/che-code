/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Diagnostic, Uri } from '../../../../vscodeTypes';
import { ContextItem, ContextKind, SnippetContext, TraitContext } from '../../../languageServer/common/languageContextService';

export type LanguageContextEntry = {
	context: ContextItem;
	timeStamp: number;
	onTimeout: boolean;
}

export type LanguageContextResponse = {
	start: number;
	end: number;
	items: LanguageContextEntry[];
}

type SerializedSnippetContext = {
	kind: ContextKind.Snippet;
	priority: number;
	uri: string;
	additionalUris?: string[];
	value: string;
}

type SerializedTraitContext = {
	kind: ContextKind.Trait;
	priority: number;
	name: string;
	value: string;
}

type SerializedContextItem = SerializedSnippetContext | SerializedTraitContext;

export type SerializedContextResponse = {
	start: number;
	end: number;
	items: {
		context: SerializedContextItem;
		timeStamp: number;
	}[];
}

export function serializeLanguageContext(response: LanguageContextResponse): SerializedContextResponse {
	return {
		start: response.start,
		end: response.end,
		items: response.items.map(item => ({
			context: serializeLanguageContextItem(item.context),
			timeStamp: item.timeStamp,
			onTimeout: item.onTimeout,
		}))
	};
}

function serializeLanguageContextItem(context: ContextItem): SerializedContextItem {
	switch (context.kind) {
		case ContextKind.Snippet:
			return serializeSnippetContext(context);
		case ContextKind.Trait:
			return serializeTraitContext(context);
	}
}

function serializeSnippetContext(context: SnippetContext): SerializedSnippetContext {
	return {
		kind: context.kind,
		priority: context.priority,
		uri: context.uri.toString(),
		additionalUris: context.additionalUris?.map(uri => uri.toString()),
		value: context.value
	};
}

function serializeTraitContext(context: TraitContext): SerializedTraitContext {
	return {
		kind: context.kind,
		priority: context.priority,
		name: context.name,
		value: context.value
	};
}

export type SerializedDiagnostic = {
	uri: string;
	severity: number;
	message: string;
	source: string;
}

function serializeDiagnostic(diagnostic: Diagnostic, resource: Uri): SerializedDiagnostic {
	return {
		uri: resource.toString(),
		severity: diagnostic.severity,
		message: diagnostic.message,
		source: diagnostic.source || ''
	};
}

export function serializeFileDiagnostics(diagnostics: [Uri, Diagnostic[]][]): SerializedDiagnostic[] {
	return diagnostics.flatMap(([resource, diags]) =>
		diags.map(diagnostic => serializeDiagnostic(diagnostic, resource))
	);
}
