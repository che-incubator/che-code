/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';

export const enum ChatMessageRole {
	System,
	User,
	Assistant,
}

export interface IChatMessage {
	readonly role: ChatMessageRole;
	readonly content: string;
}

export interface IChatResponseFragment {
	index: number;
	part: string;
}

export interface IChatResponseProviderMetadata {
	readonly extension: ExtensionIdentifier;
	readonly model: string;
	readonly description?: string;
	readonly auth?: {
		readonly providerLabel: string;
		readonly accountLabel?: string;
	};
}

export interface IChatResponseProvider {
	metadata: IChatResponseProviderMetadata;
	provideChatResponse(messages: IChatMessage[], from: ExtensionIdentifier, options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any>;
}

export const IChatProviderService = createDecorator<IChatProviderService>('chatProviderService');

export interface IChatProviderService {

	readonly _serviceBrand: undefined;

	onDidChangeProviders: Event<{ added?: string[]; removed?: string[] }>;

	getProviders(): string[];

	lookupChatResponseProvider(identifier: string): IChatResponseProviderMetadata | undefined;

	registerChatResponseProvider(identifier: string, provider: IChatResponseProvider): IDisposable;

	fetchChatResponse(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any>;
}

export class ChatProviderService implements IChatProviderService {
	readonly _serviceBrand: undefined;

	private readonly _providers: Map<string, IChatResponseProvider> = new Map();

	private readonly _onDidChangeProviders = new Emitter<{ added?: string[]; removed?: string[] }>();
	readonly onDidChangeProviders: Event<{ added?: string[]; removed?: string[] }> = this._onDidChangeProviders.event;

	dispose() {
		this._onDidChangeProviders.dispose();
		this._providers.clear();
	}

	getProviders(): string[] {
		return Array.from(this._providers.keys());
	}

	lookupChatResponseProvider(identifier: string): IChatResponseProviderMetadata | undefined {
		return this._providers.get(identifier)?.metadata;
	}

	registerChatResponseProvider(identifier: string, provider: IChatResponseProvider): IDisposable {
		if (this._providers.has(identifier)) {
			throw new Error(`Chat response provider with identifier ${identifier} is already registered.`);
		}
		this._providers.set(identifier, provider);
		this._onDidChangeProviders.fire({ added: [identifier] });
		return toDisposable(() => {
			if (this._providers.delete(identifier)) {
				this._onDidChangeProviders.fire({ removed: [identifier] });
			}
		});
	}

	fetchChatResponse(identifier: string, from: ExtensionIdentifier, messages: IChatMessage[], options: { [name: string]: any }, progress: IProgress<IChatResponseFragment>, token: CancellationToken): Promise<any> {
		const provider = this._providers.get(identifier);
		if (!provider) {
			throw new Error(`Chat response provider with identifier ${identifier} is not registered.`);
		}
		return provider.provideChatResponse(messages, from, options, progress, token);
	}
}
