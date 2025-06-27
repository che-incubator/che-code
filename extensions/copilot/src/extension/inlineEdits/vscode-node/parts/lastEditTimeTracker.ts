/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { mapObservableArrayCached, observableValue, runOnChange } from '../../../../util/vs/base/common/observable';


export class LastEditTimeTracker extends Disposable {

	private readonly _lastEditTime = observableValue<number | undefined>(this, undefined);

	get hadEditsRecently() {
		const lastEditTime = this._lastEditTime.get();
		return lastEditTime !== undefined && (Date.now() - lastEditTime < 30 * 1000 /* 30 seconds */);
	}

	constructor(
		workspace: ObservableWorkspace,
	) {
		super();

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {
			store.add(runOnChange(doc.value, (_curState, _oldState, deltas) => {
				if (deltas.length > 0 && deltas.some(edit => edit.replacements.length > 0)) {
					this._lastEditTime.set(Date.now(), undefined);
				}
			}));
		}).recomputeInitiallyAndOnChange(this._store);
	}
}
