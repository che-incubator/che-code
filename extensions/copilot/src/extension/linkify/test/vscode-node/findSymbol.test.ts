/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { findBestSymbolByPath } from '../../vscode-node/findSymbol';

suite('Find symbol', () => {
	function docSymbol(name: string, ...children: vscode.DocumentSymbol[]): vscode.DocumentSymbol {
		return {
			name,
			children,
			detail: '',
			range: new vscode.Range(0, 0, 0, 0),
			selectionRange: new vscode.Range(0, 0, 0, 0),
			kind: vscode.SymbolKind.Variable,
		};
	}

	function symbolInfo(name: string): vscode.SymbolInformation {
		return {
			name,
			containerName: '',
			kind: vscode.SymbolKind.Variable,
			location: {
				uri: vscode.Uri.file('fake'),
				range: new vscode.Range(0, 0, 0, 0),
			}
		};
	}

	test('Should find exact match', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([symbolInfo('a')], 'a')?.name, 'a');
	});

	test('Should find nested', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('x', docSymbol('a'))], 'a')?.name, 'a');
	});

	test('Should find child match', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a', docSymbol('b'))], 'a.b')?.name, 'b');
	});

	test('Should find child match skipping level', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a', docSymbol('x', docSymbol('b')))], 'a.b')?.name, 'b');
	});

	test(`Should find match even when children don't match`, () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a.b')?.name, 'a');
	});

	test(`Should find longest match`, () => {
		assert.strictEqual(findBestSymbolByPath([
			docSymbol('a',
				docSymbol('x')),
			docSymbol('x',
				docSymbol('a',
					docSymbol('b',
						docSymbol('z'))))
		], 'a.b')?.name, 'b');
	});

	test('Should ignore function call notation', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a()')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(1, 2, 3)')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(b, c)')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a(b: string)')?.name, 'a');
	});

	test('Should ignore generic notation', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a<T>')?.name, 'a');
		assert.strictEqual(findBestSymbolByPath([docSymbol('a')], 'a<T>.b')?.name, 'a');
	});

	test('Should match on symbols with $', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('$a')], '$a')?.name, '$a');
	});

	test('Should match on symbols with _', () => {
		assert.strictEqual(findBestSymbolByPath([docSymbol('_a_')], '_a_')?.name, '_a_');
	});
});
