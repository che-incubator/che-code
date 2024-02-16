/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IOffsetRange } from 'vs/editor/common/core/offsetRange';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatDynamicVariableModel } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { IChatModel, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest, ChatRequestVariablePart, ChatRequestDynamicVariablePart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatVariablesService, IChatRequestVariableValue, IChatVariableData, IChatVariableResolver, IDynamicVariable, IChatVariableResolverProgress } from 'vs/workbench/contrib/chat/common/chatVariables';

interface IChatData {
	data: IChatVariableData;
	resolver: IChatVariableResolver;
}

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, IChatData>();

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService
	) {
	}

	async resolveVariables(prompt: IParsedChatRequest, model: IChatModel, progress: (part: IChatVariableResolverProgress) => void, token: CancellationToken): Promise<IChatRequestVariableData> {
		let resolvedVariables: { name: string; range: IOffsetRange; values: IChatRequestVariableValue[] }[] = [];
		const jobs: Promise<any>[] = [];

		prompt.parts
			.forEach((part, i) => {
				if (part instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(part.variableName.toLowerCase());
					if (data) {
						jobs.push(data.resolver(prompt.text, part.variableArg, model, progress, token).then(values => {
							if (values?.length) {
								resolvedVariables[i] = { name: part.variableName, range: part.range, values };
							}
						}).catch(onUnexpectedExternalError));
					}
				} else if (part instanceof ChatRequestDynamicVariablePart) {
					resolvedVariables[i] = { name: part.referenceText, range: part.range, values: part.data };
				}
			});

		await Promise.allSettled(jobs);

		resolvedVariables = coalesce(resolvedVariables);

		// "reverse", high index first so that replacement is simple
		resolvedVariables.sort((a, b) => b.range.start - a.range.start);

		return {
			variables: resolvedVariables,
		};
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => !data.hidden);
	}

	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		return model.variables;
	}

	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		const key = data.name.toLowerCase();
		if (this._resolver.has(key)) {
			throw new Error(`A chat variable with the name '${data.name}' already exists.`);
		}
		this._resolver.set(key, { data, resolver });
		return toDisposable(() => {
			this._resolver.delete(key);
		});
	}
}
