/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { ISessionDatabase } from '../common/sessionDataService.js';
import type { IDiffComputeService } from '../common/diffComputeService.js';
import { FileEditKind, type ISessionFileDiff } from '../common/state/sessionState.js';

/**
 * Represents a file's identity across renames, tracking its first and last
 * snapshots in the session for diff computation.
 */
interface IFileIdentity {
	/** The last known URI for this file. */
	terminalPath: string;
	/** Tool call ID of the first edit (for fetching "before" content). */
	firstToolCallId: string;
	/** File path used in the first edit's database record. */
	firstFilePath: string;
	/** The kind of the first edit (Create means no "before" content). */
	firstKind: FileEditKind;
	/** Tool call ID of the last edit (for fetching "after" content). */
	lastToolCallId: string;
	/** File path used in the last edit's database record. */
	lastFilePath: string;
	/** The kind of the last edit (Delete means no "after" content). */
	lastKind: FileEditKind;
}

/**
 * Computes aggregated diff statistics for a session by comparing each file's
 * first snapshot to its last snapshot, tracking renames across the chain.
 *
 * Returns an {@link ISessionFileDiff} array with the "last known URI" for each
 * file and the total lines added/removed across the session.
 */
export async function computeSessionDiffs(
	db: ISessionDatabase,
	diffService: IDiffComputeService,
): Promise<ISessionFileDiff[]> {
	const edits = await db.getAllFileEdits();
	if (edits.length === 0) {
		return [];
	}

	// Build file identity graph. We need to:
	// 1. Track renames: when a file is renamed A→B, its identity follows to B
	// 2. Find the first "before" snapshot and last "after" snapshot per identity

	// Maps a file path to its canonical identity key (follows rename chains)
	const pathToIdentityKey = new Map<string, string>();
	// Maps identity keys to their accumulated data
	const identities = new Map<string, IFileIdentity>();

	for (const edit of edits) {
		let identityKey: string;

		if (edit.kind === FileEditKind.Rename && edit.originalPath) {
			// Rename: follow the chain from originalPath to find the identity
			identityKey = pathToIdentityKey.get(edit.originalPath) ?? edit.originalPath;
			// Update the mapping: the new path now points to the same identity
			pathToIdentityKey.set(edit.filePath, identityKey);
			// Remove old path mapping (the file no longer exists at that path)
			pathToIdentityKey.delete(edit.originalPath);
		} else {
			// Regular edit, create, or delete: look up or create identity
			identityKey = pathToIdentityKey.get(edit.filePath) ?? edit.filePath;
			pathToIdentityKey.set(edit.filePath, identityKey);
		}

		const existing = identities.get(identityKey);
		if (!existing) {
			// First time seeing this file identity
			identities.set(identityKey, {
				terminalPath: edit.filePath,
				firstToolCallId: edit.toolCallId,
				firstFilePath: edit.kind === FileEditKind.Rename && edit.originalPath ? edit.originalPath : edit.filePath,
				firstKind: edit.kind,
				lastToolCallId: edit.toolCallId,
				lastFilePath: edit.filePath,
				lastKind: edit.kind,
			});
		} else {
			// Update last snapshot info and terminal path
			existing.terminalPath = edit.filePath;
			existing.lastToolCallId = edit.toolCallId;
			existing.lastFilePath = edit.filePath;
			existing.lastKind = edit.kind;
		}
	}

	// Compute diffs for each file identity
	const results: ISessionFileDiff[] = [];
	const diffPromises: Promise<void>[] = [];

	for (const identity of identities.values()) {
		diffPromises.push((async () => {
			// Determine "before" text
			let beforeText: string;
			if (identity.firstKind === FileEditKind.Create) {
				beforeText = '';
			} else {
				const content = await db.readFileEditContent(identity.firstToolCallId, identity.firstFilePath);
				beforeText = content?.beforeContent ? new TextDecoder().decode(content.beforeContent) : '';
			}

			// Determine "after" text
			let afterText: string;
			if (identity.lastKind === FileEditKind.Delete) {
				afterText = '';
			} else {
				const content = await db.readFileEditContent(identity.lastToolCallId, identity.lastFilePath);
				afterText = content?.afterContent ? new TextDecoder().decode(content.afterContent) : '';
			}

			// Skip files with no net change
			if (beforeText === afterText) {
				return;
			}

			const counts = await diffService.computeDiffCounts(beforeText, afterText);
			results.push({
				uri: URI.file(identity.terminalPath).toString(),
				added: counts.added,
				removed: counts.removed,
			});
		})());
	}

	await Promise.allSettled(diffPromises);
	return results;
}
