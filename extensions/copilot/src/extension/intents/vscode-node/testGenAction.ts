/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IParserService } from '../../../platform/parser/node/parserService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { isTestFile, suggestUntitledTestFileLocation, TestFileFinder } from '../../prompt/node/testFiles';
import { ITestGenInfoStorage } from '../node/testIntent/testInfoStorage';


export class GenerateTests {

	constructor(
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IParserService private readonly parserService: IParserService,
		@ITestGenInfoStorage private readonly testGenInfoStorage: ITestGenInfoStorage,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) {
	}

	public async runCommand(context?: { document: vscode.TextDocument; selection: vscode.Range }) {

		let srcFile: TextDocumentSnapshot;
		let selection: vscode.Range;

		if (context) {
			srcFile = TextDocumentSnapshot.create(context.document);
			selection = context.selection;
		} else {
			const initialActiveEditor = vscode.window.activeTextEditor;

			if (initialActiveEditor === undefined) {
				return;
			}

			srcFile = TextDocumentSnapshot.create(initialActiveEditor.document);

			selection = initialActiveEditor.selection;
		}

		if (isTestFile(srcFile.uri)) {
			return vscode.commands.executeCommand(
				'vscode.editorChat.start',
				{
					message: `/${Intent.Tests} `,
					autoSend: true,
					initialRange: selection
				});
		} else {

			// identify the range for the symbol to test

			const testableNode = await this.identifyTestableNode(srcFile, selection);

			this.updateTestGenInfo(srcFile, testableNode, selection);

			// identify the file to write tests at -- either existing one or a new untitled one

			const testFile = await this.findOrCreateTestFile(srcFile);

			const testDoc = await vscode.workspace.openTextDocument(testFile);

			// identify where in the test file to insert the tests at

			const insertTestsAt: vscode.Range = await this.determineTestInsertPosition(testDoc);

			const testEditor = await vscode.window.showTextDocument(testDoc, this.getTabGroupByUri(testFile));

			testEditor.selection = new vscode.Selection(insertTestsAt.start, insertTestsAt.end);
			testEditor.revealRange(insertTestsAt, vscode.TextEditorRevealType.InCenter);

			const isDocEmpty = insertTestsAt.end.line === 0 && insertTestsAt.end.character === 0;

			if (!isDocEmpty) {
				await testEditor.edit(editBuilder => {
					editBuilder.insert(insertTestsAt.start, '\n\n');
				});
			}

			return vscode.commands.executeCommand(
				'vscode.editorChat.start',
				{
					message: `/${Intent.Tests}`,
					autoSend: true,
				});
		}
	}

	private async determineTestInsertPosition(testDoc: vscode.TextDocument) {
		const testFileAST = this.parserService.getTreeSitterAST(testDoc);

		const lastTest = testFileAST ? await testFileAST.findLastTest() : null;

		let insertTestsAt: vscode.Range;
		if (lastTest === null) {
			const lastLine = testDoc.lineAt(testDoc.lineCount - 1);
			insertTestsAt = new vscode.Range(lastLine.range.end, lastLine.range.end);
		} else {
			const lastTestEndPos = testDoc.positionAt(lastTest.endIndex);
			const endOfLastLine = testDoc.lineAt(lastTestEndPos).range.end;
			insertTestsAt = new vscode.Range(endOfLastLine, endOfLastLine);
		}
		return insertTestsAt;
	}

	private updateTestGenInfo(srcFile: TextDocumentSnapshot, testableNode: { identifier: string; range: vscode.Range } | null, selection: vscode.Range) {
		this.testGenInfoStorage.sourceFileToTest = {
			uri: srcFile.uri,
			target: testableNode?.range ?? selection,
			identifier: testableNode?.identifier,
		};
	}

	private async identifyTestableNode(srcFile: TextDocumentSnapshot, selection: vscode.Range): Promise<{ identifier: string; range: vscode.Range } | null> {

		const srcFileAST = this.parserService.getTreeSitterAST(srcFile);

		if (!srcFileAST) {
			return null;
		}

		const testableNode = await srcFileAST.getTestableNode({
			startIndex: srcFile.offsetAt(selection.start),
			endIndex: srcFile.offsetAt(selection.end),
		});

		if (!testableNode) {
			return null;
		}

		const { startIndex, endIndex } = testableNode.node;
		const testedSymbolRange = new vscode.Range(srcFile.positionAt(startIndex), srcFile.positionAt(endIndex));

		return {
			identifier: testableNode.identifier.name,
			range: testedSymbolRange
		};
	}

	private async findOrCreateTestFile(srcFile: TextDocumentSnapshot) {
		const finder = this.instaService.createInstance(TestFileFinder);

		let testFile = await finder.findTestFileForSourceFile(srcFile, CancellationToken.None);

		if (testFile !== undefined && await this.ignoreService.isCopilotIgnored(testFile)) {
			testFile = undefined;
		}

		if (testFile === undefined) {
			testFile = suggestUntitledTestFileLocation(srcFile);
		}
		return testFile;
	}

	private getTabGroupByUri(uri: vscode.Uri) {
		for (const tab of this.tabsAndEditorsService.tabs) {
			if (tab.uri?.toString() === uri.toString()) {
				return tab.tab.group.viewColumn;
			}
		}

		const currentTab = this.tabsAndEditorsService.activeTextEditor?.viewColumn;

		if (currentTab === undefined) {
			return vscode.ViewColumn.Two;
		} else {
			return currentTab > vscode.ViewColumn.One ? currentTab - 1 : vscode.ViewColumn.Beside;
		}
	}
}
