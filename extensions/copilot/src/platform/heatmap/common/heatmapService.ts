/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocument } from 'vscode';
import { createDecorator } from '../../../util/vs/platform/instantiation/common/instantiation';

export class SelectionPoint {

	constructor(
		readonly offset: number,
		readonly timestamp: number
	) { }

	adjust(delta: number) {
		return new SelectionPoint(this.offset + delta, this.timestamp);
	}
}

export const IHeatmapService = createDecorator<IHeatmapService>('heatmapService');

export interface IHeatmapService {
	_serviceBrand: undefined;
	getEntries(): Promise<Map<TextDocument, SelectionPoint[]>>;
}


export const nullHeatmapService: IHeatmapService = {
	_serviceBrand: undefined,
	async getEntries(): Promise<Map<TextDocument, SelectionPoint[]>> {
		return new Map();
	}
};
