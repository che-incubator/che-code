/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray, distinct } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { ProviderResult } from 'vs/editor/common/languages';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatContributionService, IRawChatCommandContribution, RawChatParticipantLocation } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChatProgressResponseContent, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatFollowup, IChatProgress, IChatResponseErrorDetails } from 'vs/workbench/contrib/chat/common/chatService';

//#region agent service, commands etc

export interface IChatAgentHistoryEntry {
	request: IChatAgentRequest;
	response: ReadonlyArray<IChatProgressResponseContent>;
	result: IChatAgentResult;
}

export enum ChatAgentLocation {
	Panel = 1,
	Terminal = 2,
	Notebook = 3,
	// Editor = 4
}

export namespace ChatAgentLocation {
	export function fromRaw(value: RawChatParticipantLocation | string): ChatAgentLocation {
		switch (value) {
			case 'panel': return ChatAgentLocation.Panel;
			case 'terminal': return ChatAgentLocation.Terminal;
			case 'notebook': return ChatAgentLocation.Notebook;
		}
		return ChatAgentLocation.Panel;
	}
}

export interface IChatAgentData {
	id: string;
	extensionId: ExtensionIdentifier;
	/** The agent invoked when no agent is specified */
	isDefault?: boolean;
	metadata: IChatAgentMetadata;
	slashCommands: IChatAgentCommand[];
	defaultImplicitVariables?: string[];
	locations: ChatAgentLocation[];
}

export interface IChatAgentImplementation {
	invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	provideFollowups?(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	provideWelcomeMessage?(token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined>;
	provideSampleQuestions?(token: CancellationToken): ProviderResult<IChatFollowup[] | undefined>;
}

export type IChatAgent = IChatAgentData & IChatAgentImplementation;

export interface IChatAgentCommand extends IRawChatCommandContribution {
	followupPlaceholder?: string;
}

export interface IChatRequesterInformation {
	name: string;

	/**
	 * A full URI for the icon of the requester.
	 */
	icon?: URI;
}

export interface IChatAgentMetadata {
	description?: string;
	helpTextPrefix?: string | IMarkdownString;
	helpTextVariablesPrefix?: string | IMarkdownString;
	helpTextPostfix?: string | IMarkdownString;
	isSecondary?: boolean; // Invoked by ctrl/cmd+enter
	fullName?: string;
	icon?: URI;
	iconDark?: URI;
	themeIcon?: ThemeIcon;
	sampleRequest?: string;
	supportIssueReporting?: boolean;
	followupPlaceholder?: string;
	isSticky?: boolean;
	requester?: IChatRequesterInformation;
}


export interface IChatAgentRequest {
	sessionId: string;
	requestId: string;
	agentId: string;
	command?: string;
	message: string;
	variables: IChatRequestVariableData;
	location: ChatAgentLocation;
}

export interface IChatAgentResult {
	errorDetails?: IChatResponseErrorDetails;
	timings?: {
		firstProgress?: number;
		totalElapsed: number;
	};
	/** Extra properties that the agent can use to identify a result */
	readonly metadata?: { readonly [key: string]: any };
}

export const IChatAgentService = createDecorator<IChatAgentService>('chatAgentService');

export interface IChatAgentService {
	_serviceBrand: undefined;
	/**
	 * undefined when an agent was removed IChatAgent
	 */
	readonly onDidChangeAgents: Event<IChatAgent | undefined>;
	registerAgent(name: string, agent: IChatAgentImplementation): IDisposable;
	registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation): IDisposable;
	invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult>;
	getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]>;
	getAgents(): IChatAgentData[];
	getRegisteredAgents(): Array<IChatAgentData>;
	getActivatedAgents(): Array<IChatAgent>;
	getAgent(id: string): IChatAgentData | undefined;
	getDefaultAgent(): IChatAgent | undefined;
	getSecondaryAgent(): IChatAgentData | undefined;
	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void;
}

export class ChatAgentService extends Disposable implements IChatAgentService {

	public static readonly AGENT_LEADER = '@';

	declare _serviceBrand: undefined;

	private readonly _agents = new Map<string, { data: IChatAgentData; impl?: IChatAgentImplementation }>();

	private readonly _onDidChangeAgents = this._register(new Emitter<IChatAgent | undefined>());
	readonly onDidChangeAgents: Event<IChatAgent | undefined> = this._onDidChangeAgents.event;

	constructor(
		@IChatContributionService private chatContributionService: IChatContributionService,
		@IContextKeyService private contextKeyService: IContextKeyService,
	) {
		super();
	}

	override dispose(): void {
		super.dispose();
		this._agents.clear();
	}

	registerAgent(name: string, agentImpl: IChatAgentImplementation): IDisposable {
		if (this._agents.has(name)) {
			// TODO not keyed by name, dupes allowed between extensions
			throw new Error(`Already registered an agent with id ${name}`);
		}

		const data = this.getAgent(name);
		if (!data) {
			throw new Error(`Unknown agent: ${name}`);
		}

		const agent = { data: data, impl: agentImpl };
		this._agents.set(name, agent);
		this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));

		return toDisposable(() => {
			if (this._agents.delete(name)) {
				this._onDidChangeAgents.fire(undefined);
			}
		});
	}

	registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation): IDisposable {
		const agent = { data, impl: agentImpl };
		this._agents.set(data.id, agent);
		this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));

		return toDisposable(() => {
			if (this._agents.delete(data.id)) {
				this._onDidChangeAgents.fire(undefined);
			}
		});
	}

	updateAgent(id: string, updateMetadata: IChatAgentMetadata): void {
		const agent = this._agents.get(id);
		if (!agent?.impl) {
			throw new Error(`No activated agent with id ${id} registered`);
		}
		agent.data.metadata = { ...agent.data.metadata, ...updateMetadata };
		this._onDidChangeAgents.fire(new MergedChatAgent(agent.data, agent.impl));
	}

	getDefaultAgent(): IChatAgent | undefined {
		return this.getActivatedAgents().find(a => !!a.isDefault);
	}

	getSecondaryAgent(): IChatAgentData | undefined {
		// TODO also static
		return Iterable.find(this._agents.values(), a => !!a.data.metadata.isSecondary)?.data;
	}

	getRegisteredAgents(): Array<IChatAgentData> {
		const that = this;
		return this.chatContributionService.registeredParticipants.map(p => (
			{
				extensionId: p.extensionId,
				id: p.name,
				metadata: this._agents.has(p.name) ? this._agents.get(p.name)!.data.metadata : { description: p.description },
				isDefault: p.isDefault,
				defaultImplicitVariables: p.defaultImplicitVariables,
				locations: isNonEmptyArray(p.locations) ? p.locations.map(ChatAgentLocation.fromRaw) : [ChatAgentLocation.Panel],
				get slashCommands() {
					const commands = p.commands ?? [];
					return commands.filter(c => !c.when || that.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(c.when)));
				}
			} satisfies IChatAgentData));
	}

	/**
	 * Returns all agent datas that exist- static registered and dynamic ones.
	 */
	getAgents(): IChatAgentData[] {
		const registeredAgents = this.getRegisteredAgents();
		const dynamicAgents = Array.from(this._agents.values()).map(a => a.data);
		const all = [
			...registeredAgents,
			...dynamicAgents
		];

		return distinct(all, a => a.id);
	}

	getActivatedAgents(): IChatAgent[] {
		return Array.from(this._agents.values())
			.filter(a => !!a.impl)
			.map(a => new MergedChatAgent(a.data, a.impl!));
	}

	getAgent(id: string): IChatAgentData | undefined {
		return this.getAgents().find(a => a.id === id);
	}

	async invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		const data = this._agents.get(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id ${id}`);
		}

		return await data.impl.invoke(request, progress, history, token);
	}

	async getFollowups(id: string, request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		const data = this._agents.get(id);
		if (!data?.impl) {
			throw new Error(`No activated agent with id ${id}`);
		}

		if (!data.impl?.provideFollowups) {
			return [];
		}

		return data.impl.provideFollowups(request, result, history, token);
	}
}

export class MergedChatAgent implements IChatAgent {
	constructor(
		private readonly data: IChatAgentData,
		private readonly impl: IChatAgentImplementation
	) { }

	get id(): string { return this.data.id; }
	get extensionId(): ExtensionIdentifier { return this.data.extensionId; }
	get isDefault(): boolean | undefined { return this.data.isDefault; }
	get metadata(): IChatAgentMetadata { return this.data.metadata; }
	get slashCommands(): IChatAgentCommand[] { return this.data.slashCommands; }
	get defaultImplicitVariables(): string[] | undefined { return this.data.defaultImplicitVariables; }
	get locations(): ChatAgentLocation[] { return this.data.locations; }

	async invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> {
		return this.impl.invoke(request, progress, history, token);
	}

	async provideFollowups(request: IChatAgentRequest, result: IChatAgentResult, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatFollowup[]> {
		if (this.impl.provideFollowups) {
			return this.impl.provideFollowups(request, result, history, token);
		}

		return [];
	}

	provideWelcomeMessage(token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined> {
		if (this.impl.provideWelcomeMessage) {
			return this.impl.provideWelcomeMessage(token);
		}

		return undefined;
	}

	provideSampleQuestions(token: CancellationToken): ProviderResult<IChatFollowup[] | undefined> {
		if (this.impl.provideSampleQuestions) {
			return this.impl.provideSampleQuestions(token);
		}

		return undefined;
	}
}
