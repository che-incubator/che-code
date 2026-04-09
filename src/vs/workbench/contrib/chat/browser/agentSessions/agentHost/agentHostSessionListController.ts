/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionStatus, StateComponents, type ISessionFileDiff, type ISessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ChatSessionStatus, IChatSessionFileChange2, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentHostIcon } from '../agentSessions.js';

function mapDiffsToChanges(diffs: readonly ISessionFileDiff[] | readonly { readonly uri: string; readonly added?: number; readonly removed?: number }[] | undefined, connectionAuthority: string): readonly IChatSessionFileChange2[] | undefined {
	if (!diffs || diffs.length === 0) {
		return undefined;
	}
	return diffs.map(d => ({
		uri: toAgentHostUri(URI.parse(d.uri), connectionAuthority),
		insertions: d.added ?? 0,
		deletions: d.removed ?? 0,
	}));
}

function mapSessionStatus(status: SessionStatus | undefined): ChatSessionStatus {
	if (status === SessionStatus.InputNeeded) {
		return ChatSessionStatus.NeedsInput;
	}
	if (status !== undefined && (status & SessionStatus.InProgress)) {
		return ChatSessionStatus.InProgress;
	}
	if (status === SessionStatus.Error) {
		return ChatSessionStatus.Failed;
	}
	return ChatSessionStatus.Completed;
}

/**
 * Provides session list items for the chat sessions sidebar by querying
 * active sessions from an agent host connection. Listens to protocol
 * notifications for incremental updates.
 *
 * Works with both local and remote agent host connections via the
 * {@link IAgentConnection} interface.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private _items: IChatSessionItem[] = [];
	/** Last-seen summary per session (by identity) to avoid redundant updates. */
	private readonly _lastSummary = new Map<string, ISessionSummary>();

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _connection: IAgentConnection,
		private readonly _description: string | undefined,
		private readonly _connectionAuthority: string,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		// React to protocol notifications for session list changes
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded' && n.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.summary.resource);
				const workingDir = typeof n.summary.workingDirectory === 'string' ? URI.parse(n.summary.workingDirectory) : undefined;
				const item = this._makeItem(rawId, {
					title: n.summary.title,
					status: n.summary.status,
					workingDirectory: workingDir,
					createdAt: n.summary.createdAt,
					modifiedAt: n.summary.modifiedAt,
					diffs: n.summary.diffs,
				});
				this._items.push(item);
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			} else if (n.type === 'notify/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
				const removedId = AgentSession.id(n.session);
				const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
				if (idx >= 0) {
					const [removed] = this._items.splice(idx, 1);
					this._lastSummary.delete(removedId);
					this._onDidChangeChatSessionItems.fire({ removed: [removed.resource] });
				}
			}
		}));

		// Update items from live session state when actions arrive
		this._register(this._connection.onDidAction(e => {
			if (!isSessionAction(e.action)) {
				return;
			}
			if (AgentSession.provider(e.action.session) !== this._provider) {
				return;
			}


			// Peek at the subscription — if nothing is subscribed, skip
			const state = this._connection.getSubscriptionUnmanaged(StateComponents.Session, URI.parse(e.action.session))?.value;
			if (!state || state instanceof Error) {
				return;
			}

			const rawId = AgentSession.id(e.action.session);

			// Object identity check — the reducer produces new summary
			// objects only when fields change.
			if (this._lastSummary.get(rawId) === state.summary) {
				return;
			}
			this._lastSummary.set(rawId, state.summary);

			const item = this._makeItemFromSummary(rawId, state.summary, state.summary.diffs);
			const idx = this._items.findIndex(i => i.resource.path === `/${rawId}`);
			if (idx >= 0) {
				this._items[idx] = item;
			} else {
				this._items.unshift(item);
			}
			this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
		}));
	}

	get items(): readonly IChatSessionItem[] {
		return this._items;
	}

	async refresh(_token: CancellationToken): Promise<void> {
		try {
			const sessions = await this._connection.listSessions();
			const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
			this._items = filtered.map(s => this._makeItem(AgentSession.id(s.session), {
				title: s.summary,
				status: s.status,
				workingDirectory: s.workingDirectory,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
				diffs: s.diffs,
			}));
		} catch {
			this._items = [];
		}
		this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
	}

	private _makeItemFromSummary(rawId: string, summary: ISessionSummary, diffs: ISessionFileDiff[] | undefined): IChatSessionItem {
		const workingDir = typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : summary.workingDirectory;
		return this._makeItem(rawId, {
			title: summary.title,
			status: summary.status,
			workingDirectory: workingDir,
			createdAt: summary.createdAt,
			modifiedAt: summary.modifiedAt,
			diffs,
		});
	}

	private _makeItem(rawId: string, opts: {
		title?: string;
		status?: SessionStatus;
		workingDirectory?: URI;
		createdAt: number;
		modifiedAt: number;
		diffs?: readonly ISessionFileDiff[] | readonly { readonly uri: string; readonly added?: number; readonly removed?: number }[];
	}): IChatSessionItem {
		return {
			resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
			label: opts.title ?? `Session ${rawId.substring(0, 8)}`,
			description: this._description,
			iconPath: getAgentHostIcon(this._productService),
			status: mapSessionStatus(opts.status),
			metadata: this._buildMetadata(opts.workingDirectory),
			timing: {
				created: opts.createdAt,
				lastRequestStarted: opts.modifiedAt,
				lastRequestEnded: opts.modifiedAt,
			},
			changes: mapDiffsToChanges(opts.diffs, this._connectionAuthority),
		};
	}

	private _buildMetadata(workingDirectory?: URI): { readonly [key: string]: unknown } | undefined {
		if (!this._description) {
			return undefined;
		}
		const result: { [key: string]: unknown } = { remoteAgentHost: this._description };
		if (workingDirectory) {
			result.workingDirectoryPath = workingDirectory.fsPath;
		}
		return result;
	}
}
