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

import { createScanner, parse, ParseError, parseTree, SyntaxKind } from '../../../base/common/json.js';
import { equals } from '../../../base/common/objects.js';

/**
 * Marker added to (and looked up in) keybinding entries injected from the
 * admin-provided ConfigMap, so they can be identified and replaced on the
 * next start.
 */
export const CONFIGMAP_SOURCE_MARKER = 'configmap';

export interface KeybindingEntry {
	/**
	 * Required, except for a removal entry (`command` starting with `-`): VS Code
	 * accepts a removal without `key`, which removes every keybinding of the
	 * command.
	 */
	key?: string;
	command: string;
	when?: string;
	args?: unknown;
	_source?: string;
}

export type KeybindingsUpdate =
	| {
		readonly kind: 'write';
		readonly content: string;
		readonly userCount: number;
		readonly adminCount: number;
		readonly invalidConfigmapIndices: readonly number[];
	}
	| {
		readonly kind: 'unchanged';
		readonly invalidConfigmapIndices: readonly number[];
	}
	| {
		readonly kind: 'abort';
		readonly reason: string;
		readonly details?: unknown;
	};

/**
 * Computes how the user's keybindings.json must change to reflect the
 * admin-provided ConfigMap keybindings.
 *
 * Admin entries are placed at the start of the array and tagged with the
 * `_source` marker. VS Code resolves keybindings top-to-bottom, later
 * entries win, so the user's own keybindings (existing, or added later
 * through the Keyboard Shortcuts editor, which appends them at the end)
 * override the admin ones, both in the current session and after a restart.
 * Previously injected entries are identified by the marker and replaced by
 * the fresh ones, so ConfigMap changes propagate on restart; when the
 * ConfigMap content is absent, they are stripped while user entries are
 * preserved. Entries of the ConfigMap that are not valid keybinding objects
 * (an object with a string `command` and a string `key`; a removal entry,
 * whose `command` starts with `-`, may omit `key`) are skipped individually;
 * parse errors abort instead.
 *
 * The result is `unchanged` when the desired state already matches the
 * existing file semantically, so the steady state does not rewrite the
 * file. When a write is needed, the new content is produced with
 * text-level JSON edits that preserve the user's comments and formatting,
 * with a `JSON.stringify` fallback that loses comments but never loses
 * data.
 *
 * If the ConfigMap file could not be read on the server, the ConfigMap
 * content or the existing file fails to parse, or the existing file is not
 * a JSON array, the result is `abort` and the caller must not write
 * anything, so user data is never lost.
 *
 * @param existingContent current keybindings.json text, or undefined if the file does not exist
 * @param configmapContent ConfigMap keybindings.json text; undefined if the ConfigMap has no
 * keybindings.json (previously injected entries are removed); null if the file exists but could
 * not be read on the server (the merge is skipped)
 */
export function computeKeybindingsUpdate(existingContent: string | undefined, configmapContent: string | null | undefined): KeybindingsUpdate {
	// An unreadable ConfigMap file must not be mistaken for an absent one:
	// that would strip the previously injected entries and rewrite the file.
	if (configmapContent === null) {
		return { kind: 'abort', reason: 'ConfigMap keybindings.json could not be read on the server. Skipping to keep the current keybindings.' };
	}

	// --- ConfigMap side ------------------------------------------------

	const adminEntries: KeybindingEntry[] = [];
	const invalidConfigmapIndices: number[] = [];
	if (configmapContent !== undefined) {
		const parseErrors: ParseError[] = [];
		const parsed = parse(configmapContent, parseErrors);
		if (parseErrors.length > 0) {
			return { kind: 'abort', reason: 'ConfigMap keybindings.json is not valid JSON, skipping.', details: parseErrors };
		}
		if (!Array.isArray(parsed)) {
			return { kind: 'abort', reason: 'ConfigMap keybindings.json is not a JSON array, skipping.' };
		}
		for (let i = 0; i < parsed.length; i++) {
			const entry = parsed[i];
			if (isConfigmapEntry(entry)) {
				adminEntries.push({ ...entry, _source: CONFIGMAP_SOURCE_MARKER });
			} else {
				invalidConfigmapIndices.push(i);
			}
		}
	}

	// --- Existing side -------------------------------------------------

	let text: string;
	let existingEntries: unknown[];
	if (existingContent === undefined || existingContent.trim().length === 0) {
		// The file does not exist or is blank: start from an empty array.
		text = '[]';
		existingEntries = [];
	} else {
		const parseErrors: ParseError[] = [];
		const parsed = parse(existingContent, parseErrors);
		if (parseErrors.length > 0) {
			return { kind: 'abort', reason: 'Failed to parse existing keybindings. Aborting to prevent data loss.', details: parseErrors };
		}
		if (!Array.isArray(parsed)) {
			return { kind: 'abort', reason: 'Existing keybindings is not a JSON array. Aborting to prevent data loss.' };
		}
		text = existingContent;
		existingEntries = parsed;
	}

	// Split the existing entries into user entries (kept untouched, in
	// order) and previously injected entries (replaced below). Only
	// non-null objects carrying the marker count as injected; anything
	// else is a user entry.
	const userEntries: unknown[] = [];
	const markedIndices: number[] = [];
	for (let i = 0; i < existingEntries.length; i++) {
		const entry = existingEntries[i];
		if (isMarkedEntry(entry)) {
			markedIndices.push(i);
		} else {
			userEntries.push(entry);
		}
	}

	// Admin entries first: VS Code resolves keybindings top-to-bottom, later
	// entries win, so the user's entries (which the Keyboard Shortcuts editor
	// appends at the end) override the admin ones both in the current session
	// and after a restart.
	const desiredEntries: unknown[] = [...adminEntries, ...userEntries];

	// Steady state: the file already matches the desired state
	// semantically, so it must not be rewritten.
	if (equals(existingEntries, desiredEntries)) {
		return { kind: 'unchanged', invalidConfigmapIndices };
	}

	// --- Text-level edits ----------------------------------------------

	const eol = text.includes('\r\n') ? '\r\n' : '\n';

	// Remove the previously injected entries with a single parse. Each removal
	// cuts only the entry and one adjacent comma, so the user's comments
	// around it are kept.
	text = removeArrayElements(text, markedIndices);

	// Insert the fresh admin entries at the start, in order, as one block and
	// without re-formatting the existing entries.
	text = prependArrayElements(text, adminEntries, eol);

	// Safety net: verify that the edited text still parses to the desired
	// state. If not, fall back to a plain stringify: this loses comments
	// and formatting, but never loses data.
	const verificationErrors: ParseError[] = [];
	const verification = parse(text, verificationErrors);
	if (verificationErrors.length > 0 || !equals(verification, desiredEntries)) {
		text = JSON.stringify(desiredEntries, null, '\t');
	}

	return { kind: 'write', content: text, userCount: userEntries.length, adminCount: adminEntries.length, invalidConfigmapIndices };
}

/**
 * Removes the elements at `indices` from the JSON text of a top-level array.
 *
 * The document is parsed once; all cut ranges are computed on that parse and
 * applied from the end of the text to the start, so that each cut leaves the
 * offsets of the remaining (lower) ranges valid. Parsing again per element
 * would be quadratic in the number of elements.
 *
 * Unlike `setProperty(text, [index], undefined)`, which removes the whole
 * range up to the neighbouring element or the closing bracket (and the
 * comments in it), this cuts only each element itself and exactly one
 * adjacent comma:
 * - an element followed by a comma (not the last one, or the last one with
 *   a trailing comma) is cut together with that comma; comments between the
 *   element and its own comma are rare and go with it;
 * - for the run of removed elements at the very end of an array without a
 *   trailing comma, each element is cut alone, and the commas that follow
 *   them and the last *kept* element are cut separately, so that anything
 *   between an element and a comma (comments) stays and no trailing comma is
 *   left behind (this is exactly what removing them one by one, from the last
 *   to the first, would produce).
 *
 * If the text is not a top-level array, it is returned unchanged; indices out
 * of range are ignored. The caller's semantic re-check then detects any
 * mismatch and falls back to a full rewrite.
 */
function removeArrayElements(text: string, indices: readonly number[]): string {
	if (indices.length === 0) {
		return text;
	}
	const root = parseTree(text);
	const elements = root?.type === 'array' ? root.children : undefined;
	if (!elements) {
		return text;
	}
	const removed = new Set(indices.filter(index => index >= 0 && index < elements.length));
	if (removed.size === 0) {
		return text;
	}

	// The run of removed elements at the very end of an array without a
	// trailing comma (`tailStart..lastIndex`): each of them is cut without its
	// comma, and the commas after them and after the last kept element are cut
	// separately, so nothing (e.g. a comment) between an element and its comma
	// is lost there and no trailing comma is left behind.
	const lastIndex = elements.length - 1;
	const last = elements[lastIndex];
	let tailStart = elements.length;
	if (removed.has(lastIndex) && findNextComma(text, last.offset + last.length) === undefined) {
		tailStart = lastIndex;
		while (tailStart > 0 && removed.has(tailStart - 1)) {
			tailStart--;
		}
	}

	interface Cut { readonly start: number; readonly end: number; readonly element: boolean }
	const cuts: Cut[] = [];
	for (const index of removed) {
		const element = elements[index];
		const elementEnd = element.offset + element.length;
		const commaAfter = findNextComma(text, elementEnd);
		if (index >= tailStart || commaAfter === undefined) {
			cuts.push({ start: element.offset, end: elementEnd, element: true });
		} else {
			cuts.push({ start: element.offset, end: commaAfter + 1, element: true });
		}
	}
	for (let index = Math.max(tailStart - 1, 0); index < lastIndex && tailStart <= lastIndex; index++) {
		const element = elements[index];
		const comma = findNextComma(text, element.offset + element.length);
		if (comma !== undefined) {
			cuts.push({ start: comma, end: comma + 1, element: false });
		}
	}

	// From the end to the start: cutElement() only removes text on the lines of
	// its own range (whole lines that start after any lower range, or horizontal
	// whitespace up to a lower range's boundary), so lower offsets stay valid.
	cuts.sort((a, b) => b.start - a.start);
	for (const cut of cuts) {
		text = cut.element
			? cutElement(text, cut.start, cut.end)
			: text.slice(0, cut.start) + text.slice(cut.end);
	}
	return text;
}

/**
 * Serializes `values` as array element text: each element on its own
 * line(s), every line prefixed with `indent`, the elements separated by
 * `',' + eol`. Shared by `appendArrayElements` and `prependArrayElements`.
 */
function serializeArrayElements(values: readonly unknown[], indent: string, eol: string): string {
	return values
		.map(value => indent + JSON.stringify(value, null, '\t').split('\n').join(eol + indent))
		.join(',' + eol);
}

/**
 * Appends `values` as the last elements of the JSON text of a top-level array,
 * in order, with a single edit: the document is parsed once and the new
 * elements are inserted as one block (parsing it again per element would be
 * quadratic in the number of elements).
 *
 * Unlike `setProperty(text, [-1], value)`, which re-formats the previous
 * element, this inserts the new elements on their own lines and touches
 * nothing else:
 * - after the last element (and its trailing comma, if any), at the end of
 *   that line when only whitespace or a line comment follows on it, so a
 *   comment on the same line as the last element stays with that element;
 *   a separating comma is added if the last element has none;
 * - in an empty array, before the closing bracket.
 *
 * The new elements are indented like the last element (one level deeper than
 * the brackets in an empty array). If the text is not a top-level array, it
 * is returned unchanged; the caller's semantic re-check then detects the
 * mismatch and falls back to a full rewrite.
 */
function appendArrayElements(text: string, values: readonly unknown[], eol: string): string {
	if (values.length === 0) {
		return text;
	}
	const root = parseTree(text);
	if (root?.type !== 'array') {
		return text;
	}
	const elements = root.children ?? [];

	if (elements.length === 0) {
		const closeBracket = root.offset + root.length - 1;
		const lineStart = text.lastIndexOf('\n', closeBracket - 1) + 1;
		const bracketLinePrefix = text.slice(lineStart, closeBracket);
		if (/^[ \t]*$/.test(bracketLinePrefix)) {
			// The closing bracket is alone on its line: insert a line above it.
			const indent = bracketLinePrefix + '\t';
			return text.slice(0, lineStart) + serializeArrayElements(values, indent, eol) + eol + text.slice(lineStart);
		}
		// e.g. `[]`: open the array on separate lines.
		const openLineStart = text.lastIndexOf('\n', root.offset - 1) + 1;
		const openIndent = /^[ \t]*/.exec(text.slice(openLineStart, root.offset))![0];
		const indent = openIndent + '\t';
		return text.slice(0, closeBracket) + eol + serializeArrayElements(values, indent, eol) + eol + openIndent + text.slice(closeBracket);
	}

	const last = elements[elements.length - 1];
	const lastEnd = last.offset + last.length;
	const lastLineStart = text.lastIndexOf('\n', last.offset - 1) + 1;
	const lastLinePrefix = text.slice(lastLineStart, last.offset);
	const indent = /^[ \t]*$/.test(lastLinePrefix) ? lastLinePrefix : '\t';

	const comma = findNextComma(text, lastEnd);
	const separatorEnd = comma !== undefined ? comma + 1 : lastEnd;
	const lineBreak = text.indexOf('\n', separatorEnd);
	const restOfLine = text.slice(separatorEnd, lineBreak === -1 ? text.length : lineBreak).replace(/\r$/, '');
	const insertAt = /^[ \t]*(\/\/.*)?$/.test(restOfLine) ? separatorEnd + restOfLine.length : separatorEnd;

	const head = comma !== undefined
		? text.slice(0, insertAt)
		: text.slice(0, lastEnd) + ',' + text.slice(lastEnd, insertAt);
	return head + eol + serializeArrayElements(values, indent, eol) + text.slice(insertAt);
}

/**
 * Inserts `values` as the first elements of the JSON text of a top-level
 * array, in order, with a single edit: the document is parsed once and the
 * new elements are inserted as one block (parsing it again per element would
 * be quadratic in the number of elements).
 *
 * The block is inserted right after the opening bracket, in one of two
 * positions:
 * - when only whitespace or comments follow `[` on its line, at the end of
 *   that line, so a comment on the `[` line (e.g. `[ // my keybindings`)
 *   stays on that line instead of sticking to the new elements. The
 *   insertion offset is the offset of the line-break token returned by the
 *   scanner, not a search for the next line break: a block comment on the
 *   `[` line may itself contain line breaks, and inserting inside it would
 *   corrupt the JSON (the caller's safety net would then re-format the file
 *   and drop every comment);
 * - otherwise (the `[` line also holds an element, e.g. a single-line array
 *   `[{...}, {...}]`), directly after the `[`, and the first existing
 *   element is put on its own line after the block.
 *
 * The new elements are indented like the first existing element when only
 * whitespace precedes it on its line, otherwise one tab (the same rule as
 * `appendArrayElements`). The block always ends with a comma, because at
 * least one existing element follows.
 *
 * An empty array is delegated to `appendArrayElements`, which already
 * handles `[]`, `[\n]` and the bracket-alone line: nothing precedes the
 * block there, so appending yields the same order. Accepted difference: in
 * an array that contains only comments (`[\n// c\n]`) the delegated append
 * places the block after them, while in a non-empty array the block lands
 * before a comment that precedes the first element; both keep the comments.
 *
 * If the text is not a top-level array, it is returned unchanged; the
 * caller's semantic re-check then detects the mismatch and falls back to a
 * full rewrite.
 */
function prependArrayElements(text: string, values: readonly unknown[], eol: string): string {
	if (values.length === 0) {
		return text;
	}
	const root = parseTree(text);
	if (root?.type !== 'array') {
		return text;
	}
	const elements = root.children ?? [];
	if (elements.length === 0) {
		return appendArrayElements(text, values, eol);
	}

	const open = root.offset;
	const first = elements[0];
	const firstLineStart = text.lastIndexOf('\n', first.offset - 1) + 1;
	const firstLinePrefix = text.slice(firstLineStart, first.offset);
	const indent = /^[ \t]*$/.test(firstLinePrefix) ? firstLinePrefix : '\t';
	const block = serializeArrayElements(values, indent, eol);

	// Scan the rest of the `[` line: when it holds only whitespace and
	// comments, insert at its line break (at the token offset, so a block
	// comment containing line breaks is not split); when it holds an element,
	// insert directly after the `[` and start the first existing element on a
	// new line after the block.
	const scanner = createScanner(text, false /* ignoreTrivia */);
	scanner.setPosition(open + 1);
	let insertAt = open + 1;
	let atBracketLineEnd = false;
	while (true) {
		const token = scanner.scan();
		if (token === SyntaxKind.LineBreakTrivia || token === SyntaxKind.EOF) {
			insertAt = token === SyntaxKind.LineBreakTrivia ? scanner.getTokenOffset() : text.length;
			atBracketLineEnd = true;
			break;
		}
		if (token !== SyntaxKind.Trivia && token !== SyntaxKind.LineCommentTrivia && token !== SyntaxKind.BlockCommentTrivia) {
			break;
		}
	}
	const insertion = atBracketLineEnd
		? eol + block + ','
		: eol + block + ',' + eol + indent;
	return text.slice(0, insertAt) + insertion + text.slice(insertAt);
}

/**
 * Returns the offset of the comma that is the next token after `offset`,
 * skipping whitespace, line breaks and comments, or undefined if the next
 * token is not a comma.
 */
function findNextComma(text: string, offset: number): number | undefined {
	const scanner = createScanner(text, true /* ignoreTrivia */);
	scanner.setPosition(offset);
	return scanner.scan() === SyntaxKind.CommaToken ? scanner.getTokenOffset() : undefined;
}

/**
 * Cuts `[start, end)` from the text and tidies up the whitespace of the
 * line(s) the cut range was on. No other lines are touched:
 * - if nothing but whitespace remains on those lines, they are removed
 *   entirely, including the line break;
 * - otherwise the horizontal whitespace that separated the cut range from
 *   its neighbours on the same line is removed with it.
 */
function cutElement(text: string, start: number, end: number): string {
	const lineStart = text.lastIndexOf('\n', start - 1) + 1;
	const prefixBlank = /^[ \t]*$/.test(text.slice(lineStart, start));

	let after = end;
	while (after < text.length && (text[after] === ' ' || text[after] === '\t')) {
		after++;
	}
	const lineBreakLength = text.startsWith('\r\n', after) ? 2 : text[after] === '\n' ? 1 : 0;
	const suffixBlank = lineBreakLength > 0 || after === text.length;

	let before = start;
	while (before > lineStart && (text[before - 1] === ' ' || text[before - 1] === '\t')) {
		before--;
	}

	if (prefixBlank && suffixBlank) {
		// The cut range occupied its line(s) alone: remove them entirely.
		return text.slice(0, lineStart) + text.slice(after + lineBreakLength);
	}
	if (suffixBlank) {
		// Something precedes the cut range on its line: drop the trailing whitespace.
		return text.slice(0, before) + text.slice(after);
	}
	if (prefixBlank || after > end) {
		// Keep the indentation, drop the whitespace before what follows.
		return text.slice(0, start) + text.slice(after);
	}
	return text.slice(0, before) + text.slice(end);
}

function isMarkedEntry(entry: unknown): entry is KeybindingEntry {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		return false;
	}
	return (entry as Record<string, unknown>)._source === CONFIGMAP_SOURCE_MARKER;
}

function isConfigmapEntry(entry: unknown): entry is KeybindingEntry {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		return false;
	}
	const { key, command } = entry as Record<string, unknown>;
	if (typeof command !== 'string') {
		return false;
	}
	if (typeof key === 'string') {
		return true;
	}
	// A removal entry may omit `key` (see KeybindingEntry); any other entry
	// without a string key could never be triggered.
	return key === undefined && command.startsWith('-');
}
