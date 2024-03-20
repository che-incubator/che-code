/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { AbstractText } from 'vs/editor/common/core/textEdit';
import { TextLength } from 'vs/editor/common/core/textLength';
import { ITextModel } from 'vs/editor/common/model';

export class TextModelText extends AbstractText {
	constructor(private readonly _textModel: ITextModel) {
		super();
	}

	getValueOfRange(range: Range): string {
		return this._textModel.getValueInRange(range);
	}

	get length(): TextLength {
		const lastLineNumber = this._textModel.getLineCount();
		const lastLineLen = this._textModel.getLineLength(lastLineNumber);
		return new TextLength(lastLineNumber - 1, lastLineLen);
	}
}
