/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import assert from 'assert';
import { parse, ParseError } from '../../../../base/common/json.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CONFIGMAP_SOURCE_MARKER, computeKeybindingsUpdate } from '../../../common/che/keybindingsMerge.js';

const adminEntries = [
	{ key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine' },
	{ key: 'ctrl+shift+k', command: 'editor.action.deleteLines' },
];
const validConfigmap = JSON.stringify(adminEntries);
const markedAdminEntries = adminEntries.map(entry => ({ ...entry, _source: CONFIGMAP_SOURCE_MARKER }));

function parseWrittenContent(content: string): unknown[] {
	const errors: ParseError[] = [];
	const parsed = parse(content, errors);
	assert.deepStrictEqual(errors, [], 'written content must parse cleanly');
	return parsed;
}

suite('CheKeybindingsMerge', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('no existing file and no ConfigMap content: unchanged', () => {
		const update = computeKeybindingsUpdate(undefined, undefined);
		assert.deepStrictEqual(update, { kind: 'unchanged', invalidConfigmapIndices: [] });
	});

	test('no existing file: ConfigMap entries are written with the source marker', () => {
		const update = computeKeybindingsUpdate(undefined, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.strictEqual(update.userCount, 0);
		assert.strictEqual(update.adminCount, 2);
		assert.deepStrictEqual(parseWrittenContent(update.content), markedAdminEntries);
	});

	test('admin entries first, user entries after, orders kept', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+b', command: 'firstUserCommand' },
			{ key: 'ctrl+u', command: 'secondUserCommand' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.strictEqual(update.userCount, 2);
		assert.strictEqual(update.adminCount, 2);
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'firstUserCommand' },
			{ key: 'ctrl+u', command: 'secondUserCommand' },
		]);
	});

	test('previously injected entries are replaced by fresh ConfigMap entries', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+b', command: 'userCommand' },
			{ key: 'ctrl+old', command: 'oldAdminCommand', _source: CONFIGMAP_SOURCE_MARKER },
		]);
		const configmap = JSON.stringify([{ key: 'ctrl+new', command: 'newAdminCommand' }]);
		const update = computeKeybindingsUpdate(existing, configmap);
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'ctrl+new', command: 'newAdminCommand', _source: CONFIGMAP_SOURCE_MARKER },
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	test('absent ConfigMap content strips previously injected entries', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+b', command: 'userCommand' },
			{ key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine', _source: CONFIGMAP_SOURCE_MARKER },
		]);
		const update = computeKeybindingsUpdate(existing, undefined);
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	test('steady state: existing file already matches the ConfigMap: unchanged', () => {
		const existing = JSON.stringify([
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'unchanged');
	});

	test('steady state with different key order in stored admin entries: unchanged', () => {
		const existing = JSON.stringify([
			{ _source: CONFIGMAP_SOURCE_MARKER, key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine' },
			{ command: 'editor.action.deleteLines', key: 'ctrl+shift+k', _source: CONFIGMAP_SOURCE_MARKER },
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'unchanged');
	});

	test('steady state after a UI addition: unchanged', () => {
		// The Keyboard Shortcuts editor appends new user bindings at the end,
		// i.e. after the admin block: that is already the desired order.
		const existing = JSON.stringify([
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'userCommand' },
			{ key: 'ctrl+u', command: 'userCommandAddedByUi' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'unchanged');
	});

	test('user comments are preserved when a write is needed', () => {
		const existing = [
			'[',
			'	// my personal bindings',
			'	{',
			'		"key": "ctrl+b",',
			'		"command": "userCommand",',
			'	}, // trailing comma',
			']',
		].join('\n');
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.ok(update.content.includes('// my personal bindings'));
		assert.ok(update.content.includes('// trailing comma'));
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	test('user comments survive removal of previously injected entries', () => {
		const existing = [
			'[',
			'	// header comment',
			'	{',
			'		"key": "ctrl+b",',
			'		"command": "userCommand"',
			'	},',
			'	{',
			'		"key": "ctrl+old",',
			'		"command": "oldAdminCommand",',
			'		"_source": "configmap"',
			'	}',
			']',
		].join('\n');
		const configmap = JSON.stringify([{ key: 'ctrl+new', command: 'newAdminCommand' }]);
		const update = computeKeybindingsUpdate(existing, configmap);
		assert.strictEqual(update.kind, 'write');
		assert.ok(update.content.includes('// header comment'));
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'ctrl+new', command: 'newAdminCommand', _source: CONFIGMAP_SOURCE_MARKER },
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	// Exact-text tests for the comment-preserving edits: removal cuts only the
	// injected entry and one adjacent comma, the prepended admin block touches
	// no existing entry. An exact match also proves that the JSON.stringify
	// fallback (which drops comments and re-formats everything) was not taken.
	const oldAdminLine = '	{ "key": "ctrl+old", "command": "oldAdminCommand", "_source": "configmap" }';
	const newAdminConfigmap = JSON.stringify([{ key: 'ctrl+new', command: 'newAdminCommand' }]);
	// The prepended admin block ends with the comma that separates it from the
	// first existing entry.
	const newAdminLines = [
		'	{',
		'		"key": "ctrl+new",',
		'		"command": "newAdminCommand",',
		'		"_source": "configmap"',
		'	},',
	];

	function assertWrittenText(existingLines: string[], configmap: string | undefined, expectedLines: string[], eol = '\n'): void {
		const update = computeKeybindingsUpdate(existingLines.join(eol), configmap);
		assert.deepStrictEqual(update.kind === 'write' ? update.content : update, expectedLines.join(eol));
	}

	test('removal keeps a user comment after the last injected entry', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" },',
			oldAdminLine,
			'	// note at the bottom',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			'	// note at the bottom',
			']',
		]);
	});

	test('removal keeps a comment between a removed entry and the next user entry', () => {
		assertWrittenText([
			'[',
			oldAdminLine + ',',
			'	// before the user entry',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	// before the user entry',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		]);
	});

	test('a comment on the same line as the previous user entry stays with it', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" }, // my note',
			oldAdminLine,
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" } // my note',
			']',
		]);
	});

	test('user entries next to a removed entry stay byte-identical', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+a", "command": "firstUserCommand" },',
			oldAdminLine + ',',
			'	{ "key": "ctrl+b",   "command": "secondUserCommand" }',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+a", "command": "firstUserCommand" },',
			'	{ "key": "ctrl+b",   "command": "secondUserCommand" }',
			']',
		]);
	});

	test('last injected entry with a trailing comma is removed cleanly', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" },',
			oldAdminLine + ',',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" },',
			']',
		]);
	});

	test('several injected entries are inserted as one block, in order', () => {
		const twoAdmins = JSON.stringify([
			{ key: 'ctrl+1', command: 'firstAdminCommand' },
			{ key: 'ctrl+2', command: 'secondAdminCommand' },
		]);
		const twoAdminLines = [
			'	{',
			'		"key": "ctrl+1",',
			'		"command": "firstAdminCommand",',
			'		"_source": "configmap"',
			'	},',
			'	{',
			'		"key": "ctrl+2",',
			'		"command": "secondAdminCommand",',
			'		"_source": "configmap"',
			'	}',
		];
		// Prepended: the block ends with the comma before the first user
		// entry; appended into an empty array, the last entry has no comma.
		const twoAdminLinesWithComma = [...twoAdminLines.slice(0, -1), '	},'];
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" } // my note',
			']',
		], twoAdmins, [
			'[',
			...twoAdminLinesWithComma,
			'	{ "key": "ctrl+b", "command": "userCommand" } // my note',
			']',
		]);
		assertWrittenText(['[]'], twoAdmins, ['[', ...twoAdminLines, ']']);
	});

	test('several injected entries are removed in one pass, comments kept', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+m1", "command": "old1", "_source": "configmap" },',
			'	// keep A',
			'	{ "key": "ctrl+b", "command": "userCommand" }, // my note',
			'	{ "key": "ctrl+m2", "command": "old2", "_source": "configmap" },',
			'	// keep B',
			'	{ "key": "ctrl+m3", "command": "old3", "_source": "configmap" }',
			'	// keep C',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	// keep A',
			'	{ "key": "ctrl+b", "command": "userCommand" } // my note',
			'	// keep B',
			'	// keep C',
			']',
		]);
	});

	test('removing the only entry leaves an empty array', () => {
		assertWrittenText([
			'[',
			oldAdminLine,
			']',
		], undefined, [
			'[',
			']',
		]);
	});

	test('CRLF file: removal and insertion keep CRLF and leave no blank line', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" },',
			oldAdminLine,
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], '\r\n');
	});

	test('a comment on the opening bracket line stays on that line', () => {
		assertWrittenText([
			'[ // my keybindings',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], newAdminConfigmap, [
			'[ // my keybindings',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		]);
	});

	test('a comment line before the first user entry stays above it', () => {
		assertWrittenText([
			'[',
			'	// my keys',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	// my keys',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		]);
	});

	test('a single-line array is opened and the user entries stay byte-identical', () => {
		assertWrittenText([
			'[{"key": "ctrl+b", "command": "userCommand"}, {"key": "ctrl+u", "command": "secondUserCommand"}]',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{"key": "ctrl+b", "command": "userCommand"}, {"key": "ctrl+u", "command": "secondUserCommand"}]',
		]);
	});

	test('CRLF file: an insertion without removals keeps CRLF', () => {
		assertWrittenText([
			'[',
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], newAdminConfigmap, [
			'[',
			...newAdminLines,
			'	{ "key": "ctrl+b", "command": "userCommand" }',
			']',
		], '\r\n');
	});

	test('previously injected entry in the middle moves to the start', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine', _source: CONFIGMAP_SOURCE_MARKER },
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	test('a user binding on the same key as an admin entry comes after it', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+k ctrl+c', command: 'userCommand' },
		]);
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			{ key: 'ctrl+k ctrl+c', command: 'userCommand' },
		]);
	});

	test('truncated ConfigMap content: abort', () => {
		assert.strictEqual(computeKeybindingsUpdate(undefined, '[{"key": "a", ').kind, 'abort');
		assert.strictEqual(computeKeybindingsUpdate(JSON.stringify([{ key: 'ctrl+b', command: 'userCommand' }]), '[{"key": "a", ').kind, 'abort');
	});

	test('ConfigMap content that is not an array: abort', () => {
		assert.strictEqual(computeKeybindingsUpdate(undefined, '{}').kind, 'abort');
	});

	test('truncated existing file: abort (no data loss)', () => {
		assert.strictEqual(computeKeybindingsUpdate('[{"key": "b", ', validConfigmap).kind, 'abort');
	});

	test('existing file that is not an array: abort (no data loss)', () => {
		assert.strictEqual(computeKeybindingsUpdate('{}', validConfigmap).kind, 'abort');
	});

	const unreadableConfigmapAbort = {
		kind: 'abort',
		reason: 'ConfigMap keybindings.json could not be read on the server. Skipping to keep the current keybindings.',
	};

	test('unreadable ConfigMap file: abort, previously injected entries are kept', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+b', command: 'userCommand' },
			...markedAdminEntries,
		]);
		assert.deepStrictEqual(computeKeybindingsUpdate(existing, null), unreadableConfigmapAbort);
	});

	test('unreadable ConfigMap file and no existing file: abort', () => {
		assert.deepStrictEqual(computeKeybindingsUpdate(undefined, null), unreadableConfigmapAbort);
	});

	test('non-object user entries are kept as user entries', () => {
		const update = computeKeybindingsUpdate('[null, 1, "x", {"key":"k","command":"c"}]', validConfigmap);
		assert.strictEqual(update.kind, 'write');
		assert.strictEqual(update.userCount, 4);
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			null,
			1,
			'x',
			{ key: 'k', command: 'c' },
		]);
	});

	test('invalid ConfigMap entries are skipped and their indices reported', () => {
		const update = computeKeybindingsUpdate(undefined, '[null, 1, {"key":"k"}, {"command":"c"}, {"key":"k","command":"c"}]');
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(update.invalidConfigmapIndices, [0, 1, 2, 3]);
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'k', command: 'c', _source: CONFIGMAP_SOURCE_MARKER },
		]);
	});

	test('removal entries may omit the key; other entries may not', () => {
		const update = computeKeybindingsUpdate(undefined, JSON.stringify([
			{ command: '-editor.action.commentLine' },
			{ command: 'editor.action.deleteLines' },
			{ key: null, command: '-editor.action.copyLinesDownAction' },
		]));
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual({ invalid: update.invalidConfigmapIndices, written: parseWrittenContent(update.content) }, {
			invalid: [1, 2],
			written: [{ command: '-editor.action.commentLine', _source: CONFIGMAP_SOURCE_MARKER }],
		});
	});

	test('ConfigMap with only invalid entries strips previously injected entries', () => {
		const existing = JSON.stringify([
			{ key: 'ctrl+b', command: 'userCommand' },
			{ key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine', _source: CONFIGMAP_SOURCE_MARKER },
		]);
		const update = computeKeybindingsUpdate(existing, JSON.stringify([null, 42]));
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(update.invalidConfigmapIndices, [0, 1]);
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});

	test('blank existing content is treated as an empty array', () => {
		for (const existing of ['', '  \n']) {
			const update = computeKeybindingsUpdate(existing, validConfigmap);
			assert.strictEqual(update.kind, 'write');
			assert.deepStrictEqual(parseWrittenContent(update.content), markedAdminEntries);
		}
	});

	test('ConfigMap content with comments and trailing commas is accepted', () => {
		const configmap = [
			'[',
			'	// admin-provided bindings',
			'	{',
			'		"key": "ctrl+k ctrl+c",',
			'		"command": "editor.action.commentLine",',
			'	},',
			']',
		].join('\n');
		const update = computeKeybindingsUpdate(undefined, configmap);
		assert.strictEqual(update.kind, 'write');
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			{ key: 'ctrl+k ctrl+c', command: 'editor.action.commentLine', _source: CONFIGMAP_SOURCE_MARKER },
		]);
	});

	test('CRLF existing file keeps CRLF line endings', () => {
		const existing = '[\r\n\t{\r\n\t\t"key": "ctrl+b",\r\n\t\t"command": "userCommand"\r\n\t}\r\n]';
		const update = computeKeybindingsUpdate(existing, validConfigmap);
		assert.strictEqual(update.kind, 'write');
		// every line break must be CRLF
		const lines = update.content.split('\n');
		for (let i = 0; i < lines.length - 1; i++) {
			assert.ok(lines[i].endsWith('\r'), `line ${i + 1} must end with CR`);
		}
		assert.deepStrictEqual(parseWrittenContent(update.content), [
			...markedAdminEntries,
			{ key: 'ctrl+b', command: 'userCommand' },
		]);
	});
});
