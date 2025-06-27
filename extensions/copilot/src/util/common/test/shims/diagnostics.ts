/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Position } from './position';
import { Range } from './range';

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0,
}

export class Diagnostic {
	constructor(
		public readonly range: Range,
		public readonly message: string,
		public readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
		public readonly relatedInformation?: DiagnosticRelatedInformation[]
	) {
		if (!Range.isRange(range)) {
			throw new TypeError('range must be set');
		}
		if (!message) {
			throw new TypeError('message must be set');
		}
	}
}

export class Location {
	public readonly range: Range;
	constructor(
		public readonly uri: vscode.Uri,
		rangeOrPosition: Range | Position
	) {
		if (rangeOrPosition instanceof Range) {
			this.range = rangeOrPosition;
		} else {
			this.range = new Range(rangeOrPosition, rangeOrPosition);
		}
	}
}

export class DiagnosticRelatedInformation {
	constructor(
		public readonly location: Location,
		public readonly message: string
	) { }
}

