/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IDiffComputeService } from '../../common/diffComputeService.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { FileEditKind, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { computeSessionDiffs } from '../../node/sessionDiffAggregator.js';

/**
 * Minimal mock of ISessionDatabase that stores file edits in memory.
 * Only implements the methods needed by computeSessionDiffs.
 */
class MockSessionDatabase {
	private readonly _edits: (IFileEditRecord & IFileEditContent)[] = [];
	getAllFileEditsCalls = 0;
	getFileEditsByTurnCalls = 0;

	addEdit(edit: IFileEditRecord & IFileEditContent): void {
		this._edits.push(edit);
	}

	async getAllFileEdits(): Promise<IFileEditRecord[]> {
		this.getAllFileEditsCalls++;
		return this._edits.map(({ beforeContent: _, afterContent: _2, ...meta }) => meta);
	}

	async getFileEditsByTurn(turnId: string): Promise<IFileEditRecord[]> {
		this.getFileEditsByTurnCalls++;
		return this._edits
			.filter(e => e.turnId === turnId)
			.map(({ beforeContent: _, afterContent: _2, ...meta }) => meta);
	}

	async readFileEditContent(toolCallId: string, filePath: string): Promise<IFileEditContent | undefined> {
		return this._edits.find(e => e.toolCallId === toolCallId && e.filePath === filePath);
	}
}

/**
 * Mock diff service that counts lines naively: each line in modified
 * not in original is "added", each line in original not in modified is
 * "removed". Good enough for testing the aggregation logic.
 */
function createMockDiffService(): IDiffComputeService & { callCount: number } {
	const svc = {
		_serviceBrand: undefined as never,
		callCount: 0,
		async computeDiffCounts(original: string, modified: string) {
			svc.callCount++;
			const origLines = original ? original.split('\n') : [];
			const modLines = modified ? modified.split('\n') : [];
			return {
				added: Math.max(0, modLines.length - origLines.length),
				removed: Math.max(0, origLines.length - modLines.length),
			};
		},
	};
	return svc;
}

function enc(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

suite('computeSessionDiffs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Full-mode tests (no incremental options) ---------------------------

	test('returns empty array for no edits', async () => {
		const db = new MockSessionDatabase();
		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(db as unknown as ISessionDatabase, diffService);
		assert.deepStrictEqual(result, []);
	});

	test('computes diffs for a single edited file', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('line1\nline2'), afterContent: enc('line1\nline2\nline3'),
		});

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(db as unknown as ISessionDatabase, diffService);

		assert.deepStrictEqual(result, [{
			uri: URI.file('/a.txt').toString(),
			added: 1,
			removed: 0,
		}]);
		assert.strictEqual(diffService.callCount, 1);
	});

	test('skips files with no net change', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('same'), afterContent: enc('different'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('different'), afterContent: enc('same'),
		});

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(db as unknown as ISessionDatabase, diffService);

		// Before = tc1.before = 'same', After = tc2.after = 'same' → zero net change
		assert.deepStrictEqual(result, []);
		assert.strictEqual(diffService.callCount, 0, 'no diff computation needed for zero net change');
	});

	test('tracks rename chains correctly', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: enc('hello'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Rename, originalPath: '/a.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('hello'), afterContent: enc('hello world'),
		});

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(db as unknown as ISessionDatabase, diffService);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].uri, URI.file('/b.txt').toString(), 'uses terminal path after rename');
	});

	// ---- Incremental-mode tests ---------------------------------------------

	test('incremental: reuses previousDiffs for untouched files', async () => {
		const db = new MockSessionDatabase();
		// File A edited in turn 1 only
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('a-before'), afterContent: enc('a-after'),
		});
		// File B edited in turn 2
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('b-before'), afterContent: enc('b-after\nnew'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 42, removed: 7 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Sort to ensure stable comparison
		result.sort((a, b) => a.uri.localeCompare(b.uri));

		assert.deepStrictEqual(result, [
			{ uri: URI.file('/a.txt').toString(), added: 42, removed: 7 }, // carried over
			{ uri: URI.file('/b.txt').toString(), added: 1, removed: 0 },  // recomputed
		]);
		// Only file B should have triggered a diff computation
		assert.strictEqual(diffService.callCount, 1, 'only touched file should be diffed');
	});

	test('incremental: recomputes file edited in current turn', async () => {
		const db = new MockSessionDatabase();
		// File A edited in turn 1 and turn 2
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('original'), afterContent: enc('after-turn1'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('after-turn1'), afterContent: enc('after-turn2\nextra'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 100, removed: 100 }, // stale
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Should compare tc1.before='original' vs tc2.after='after-turn2\nextra'
		assert.deepStrictEqual(result, [{
			uri: URI.file('/a.txt').toString(),
			added: 1,
			removed: 0,
		}]);
		assert.strictEqual(diffService.callCount, 1);
	});

	test('incremental: rename in current turn drops old URI from previousDiffs', async () => {
		const db = new MockSessionDatabase();
		// File created in turn 1
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/old.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: enc('content'),
		});
		// Renamed in turn 2
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/new.txt', kind: FileEditKind.Rename,
			originalPath: '/old.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('content'), afterContent: enc('content'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/old.txt').toString(), added: 5, removed: 0 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Create → Rename with same content: before='' (create), after='content' (rename)
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].uri, URI.file('/new.txt').toString(), 'uses new URI after rename');
	});

	test('incremental: file with zero net change in current turn is excluded even if in previousDiffs', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('original'), afterContent: enc('modified'),
		});
		// Turn 2 reverts the change
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('modified'), afterContent: enc('original'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 10, removed: 5 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Net change is zero (reverted), so file should be excluded
		assert.deepStrictEqual(result, []);
	});

	test('incremental: previousDiffs entry for file not in current identities is dropped (slow path)', async () => {
		const db = new MockSessionDatabase();
		// File A was edited in turn 1 and is in previousDiffs
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('before'), afterContent: enc('after'),
		});
		// File A is edited again in turn 2 → triggers slow path (re-edit of existing file)
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('after'), afterContent: enc('latest\nline'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 1, removed: 0 },
			{ uri: URI.file('/orphan.txt').toString(), added: 99, removed: 99 }, // no longer in DB
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Slow path: orphan is dropped because it has no identity in the full graph
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].uri, URI.file('/a.txt').toString());
	});

	test('full mode recomputes all files (no incremental options)', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('a'), afterContent: enc('a\nb'),
		});
		db.addEdit({
			turnId: 't1', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: enc('new'),
		});

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(db as unknown as ISessionDatabase, diffService);

		assert.strictEqual(result.length, 2);
		assert.strictEqual(diffService.callCount, 2, 'both files should be diffed in full mode');
	});

	// ---- Fast-path tests (turn-scoped query optimization) -------------------

	test('incremental fast path: new files only uses getFileEditsByTurn, not getAllFileEdits', async () => {
		const db = new MockSessionDatabase();
		// Turn 1: existing file untouched in turn 2
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/old.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('old-before'), afterContent: enc('old-after'),
		});
		// Turn 2: creates a new file
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/new.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: enc('brand new'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/old.txt').toString(), added: 3, removed: 1 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Fast path: only getFileEditsByTurn called, not getAllFileEdits
		assert.strictEqual(db.getFileEditsByTurnCalls, 1);
		assert.strictEqual(db.getAllFileEditsCalls, 0, 'fast path should not call getAllFileEdits');

		result.sort((a, b) => a.uri.localeCompare(b.uri));
		assert.deepStrictEqual(result, [
			{ uri: URI.file('/new.txt').toString(), added: 1, removed: 0 },
			{ uri: URI.file('/old.txt').toString(), added: 3, removed: 1 }, // carried over
		]);
	});

	test('incremental slow path: re-edit of existing file falls back to getAllFileEdits', async () => {
		const db = new MockSessionDatabase();
		// Turn 1: edit file A
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('original'), afterContent: enc('turn1'),
		});
		// Turn 2: edit file A again
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('turn1'), afterContent: enc('turn2\nextra'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 5, removed: 0 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		// Slow path: falls back to getAllFileEdits because /a.txt is in previousDiffs
		assert.strictEqual(db.getFileEditsByTurnCalls, 1, 'should try turn-scoped query first');
		assert.strictEqual(db.getAllFileEditsCalls, 1, 'should fall back to getAllFileEdits');

		// Cumulative diff: original → turn2\nextra
		assert.deepStrictEqual(result, [{
			uri: URI.file('/a.txt').toString(),
			added: 1,
			removed: 0,
		}]);
	});

	test('incremental slow path: rename in current turn falls back to getAllFileEdits', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			afterContent: enc('content'),
		});
		db.addEdit({
			turnId: 't2', toolCallId: 'tc2', filePath: '/b.txt', kind: FileEditKind.Rename,
			originalPath: '/a.txt',
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('content'), afterContent: enc('content'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 1, removed: 0 },
		];

		const diffService = createMockDiffService();
		await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		assert.strictEqual(db.getAllFileEditsCalls, 1, 'should fall back for renames');
	});

	test('incremental: no edits in turn returns previousDiffs unchanged', async () => {
		const db = new MockSessionDatabase();
		db.addEdit({
			turnId: 't1', toolCallId: 'tc1', filePath: '/a.txt', kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: enc('before'), afterContent: enc('after'),
		});

		const previousDiffs: ISessionFileDiff[] = [
			{ uri: URI.file('/a.txt').toString(), added: 5, removed: 2 },
		];

		const diffService = createMockDiffService();
		const result = await computeSessionDiffs(
			db as unknown as ISessionDatabase,
			diffService,
			{ changedTurnId: 't2', previousDiffs },
		);

		assert.strictEqual(db.getAllFileEditsCalls, 0, 'no computation needed');
		assert.deepStrictEqual(result, previousDiffs);
	});
});
