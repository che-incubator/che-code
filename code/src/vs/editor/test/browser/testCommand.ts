/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IRange } from 'vs/editor/common/core/range';
import { Selection, ISelection } from 'vs/editor/common/core/selection';
import { ICommand, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { instantiateTestCodeEditor, createCodeEditorServices } from 'vs/editor/test/browser/testCodeEditor';
import { instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';

export function testCommand(
	lines: string[],
	languageId: string | null,
	selection: Selection,
	commandFactory: (selection: Selection) => ICommand,
	expectedLines: string[],
	expectedSelection: Selection,
	forceTokenization?: boolean,
	prepare?: (accessor: ServicesAccessor, disposables: DisposableStore) => void
): void {
	const disposables = new DisposableStore();
	const instantiationService = createCodeEditorServices(disposables);
	if (prepare) {
		instantiationService.invokeFunction(prepare, disposables);
	}
	const model = instantiateTextModel(instantiationService, lines.join('\n'), languageId);
	const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
	const viewModel = editor.getViewModel()!;

	if (forceTokenization) {
		model.forceTokenization(model.getLineCount());
	}

	viewModel.setSelections('tests', [selection]);

	viewModel.executeCommand(commandFactory(viewModel.getSelection()), 'tests');

	assert.deepStrictEqual(model.getLinesContent(), expectedLines);

	const actualSelection = viewModel.getSelection();
	assert.deepStrictEqual(actualSelection.toString(), expectedSelection.toString());

	disposables.dispose();
}

/**
 * Extract edit operations if command `command` were to execute on model `model`
 */
export function getEditOperation(model: ITextModel, command: ICommand): ISingleEditOperation[] {
	let operations: ISingleEditOperation[] = [];
	let editOperationBuilder: IEditOperationBuilder = {
		addEditOperation: (range: IRange, text: string, forceMoveMarkers: boolean = false) => {
			operations.push({
				range: range,
				text: text,
				forceMoveMarkers: forceMoveMarkers
			});
		},

		addTrackedEditOperation: (range: IRange, text: string, forceMoveMarkers: boolean = false) => {
			operations.push({
				range: range,
				text: text,
				forceMoveMarkers: forceMoveMarkers
			});
		},


		trackSelection: (selection: ISelection) => {
			return '';
		}
	};
	command.getEditOperations(model, editOperationBuilder);
	return operations;
}
