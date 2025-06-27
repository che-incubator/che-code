/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { isInlineSuggestion } from '../../vscode-node/isInlineSuggestion';

suite('isInlineSuggestion', () => {

	async function createMockDocument(lines: string[], languageId: string = 'typescript'): Promise<vscode.TextDocument> {
		return await vscode.workspace.openTextDocument({ language: languageId, content: lines.join('\n') });
	}

	async function getBaseCompletionScenario() {
		const document = await createMockDocument(['This is line 1,', 'This is line,', 'This is line 3,']);
		const replaceRange = new vscode.Range(1, 0, 1, 13);
		const completionInsertionPoint = new vscode.Position(1, 12);
		const replaceText = 'This is line 2,';
		return { document, completionInsertionPoint, replaceRange, replaceText };
	}

	test('isInlineSuggestion line before completion', async () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = await getBaseCompletionScenario();

		const cursorPosition = new vscode.Position(completionInsertionPoint.line - 1, completionInsertionPoint.character);

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});

	test('isInlineSuggestion same line before completion', async () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = await getBaseCompletionScenario();

		const cursorPosition = new vscode.Position(completionInsertionPoint.line, completionInsertionPoint.character - 1);

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), true);
	});

	test('isInlineSuggestion same line at completion', async () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = await getBaseCompletionScenario();

		const cursorPosition = new vscode.Position(completionInsertionPoint.line, completionInsertionPoint.character);

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), true);
	});

	test('isInlineSuggestion same line after completion', async () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = await getBaseCompletionScenario();

		const cursorPosition = new vscode.Position(completionInsertionPoint.line, completionInsertionPoint.character + 1);

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});

	test('isInlineSuggestion line after completion', async () => {
		const { document, completionInsertionPoint, replaceRange, replaceText } = await getBaseCompletionScenario();

		const cursorPosition = new vscode.Position(completionInsertionPoint.line + 1, completionInsertionPoint.character);

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});

	test('isInlineSuggestion multi-line replace range', async () => {
		const document = await createMockDocument(['This is line 1,', 'This is line,', 'This is line,']);
		const replaceRange = new vscode.Range(1, 0, 2, 13);
		const replaceText = 'This is line 2,\nThis is line 3,';

		const cursorPosition = replaceRange.start;

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});

	test('isInlineSuggestion multi-line insertion', async () => {
		const document = await createMockDocument(['This is line 1,', 'This is line,', 'This is line 5,']);
		const replaceRange = new vscode.Range(1, 12, 1, 13);
		const replaceText = ' 2,\nThis is line 3,\nThis is line 4,';

		const cursorPosition = replaceRange.start;

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), true);
	});

	test('isInlineSuggestion multi-line insertion on next line', async () => {
		const document = await createMockDocument(['This is line 1,', 'This is line 2,', 'This is line 5,']);
		const cursorRange = new vscode.Range(1, 15, 1, 15);
		const replaceRange = new vscode.Range(2, 0, 2, 0);
		const replaceText = 'This is line 3,\nThis is line 4,\n';

		const cursorPosition = cursorRange.start;

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), true);
	});

	test('isInlineSuggestion should not use ghost text when inserting on next line when none empty', async () => {
		const document = await createMockDocument(['This is line 1,', 'This is line 2,', 'line 3,']);
		const cursorRange = new vscode.Range(1, 15, 1, 15);
		const replaceRange = new vscode.Range(2, 0, 2, 0);
		const replaceText = 'This is ';

		const cursorPosition = cursorRange.start;

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});

	// Even though this would be a nice way to render the suggestion, ghost text view on the core side
	// is not able to render such suggestions
	test('isInlineSuggestion should not use ghost text when inserting on existing line below', async () => {
		const document = await createMockDocument(['This is line 1,', 'This is line 2,', '', 'This is line 4,']);
		const cursorRange = new vscode.Range(1, 15, 1, 15);
		const replaceRange = new vscode.Range(2, 0, 2, 0);
		const replaceText = 'This is line 3,';

		const cursorPosition = cursorRange.start;

		assert.strictEqual(isInlineSuggestion(cursorPosition, document, replaceRange, replaceText), false);
	});
});
