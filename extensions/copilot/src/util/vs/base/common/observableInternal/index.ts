//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a facade for the observable implementation. Only import from here!

export { type IObservable, type IObservableWithChange, type IObserver, type IReader, type ISettable, type ISettableObservable, type ITransaction } from './base';
export { recordChanges, type IChangeContext, type IChangeTracker } from './changeTracker';
export { type DebugOwner } from './debugName';
export { derivedConstOnceDefined, latestChangedValue } from './experimental/utils';
export { constObservable } from './observables/constObservable';
export { derived, derivedDisposable, derivedHandleChanges, derivedOpts, derivedWithSetter, derivedWithStore } from './observables/derived';
export { type IDerivedReader } from './observables/derivedImpl';
export { observableFromEvent, observableFromEventOpts } from './observables/observableFromEvent';
export { observableSignal, type IObservableSignal } from './observables/observableSignal';
export { observableSignalFromEvent } from './observables/observableSignalFromEvent';
export { disposableObservableValue, observableValue } from './observables/observableValue';
export { observableValueOpts } from './observables/observableValueOpts';
export { autorun, autorunDelta, autorunHandleChanges, autorunIterableDelta, autorunOpts, autorunWithStore, autorunWithStoreHandleChanges } from './reactions/autorun';
export { asyncTransaction, globalTransaction, subtransaction, transaction, TransactionImpl } from './transaction';
export { ObservableLazy, ObservableLazyPromise, ObservablePromise, PromiseResult } from './utils/promise';
export { RemoveUndefined, runOnChange, runOnChangeWithCancellationToken, runOnChangeWithStore } from './utils/runOnChange';
export {
	debouncedObservable, debouncedObservableDeprecated, derivedObservableWithCache,
	derivedObservableWithWritableCache, keepObserved, mapObservableArrayCached, observableFromPromise,
	recomputeInitiallyAndOnChange,
	signalFromObservable, wasEventTriggeredRecently
} from './utils/utils';
export { derivedWithCancellationToken, waitForState } from './utils/utilsCancellation';
export { observableFromValueWithChangeEvent, ValueWithChangeEventFromObservable } from './utils/valueWithChangeEvent';

export { ObservableMap } from './map';
export { ObservableSet } from './set';

import { env } from '../process';
import { ConsoleObservableLogger, logObservableToConsole } from './logging/consoleObservableLogger';
import { DevToolsLogger } from './logging/debugger/devToolsLogger';
import { addLogger, setLogObservableFn } from './logging/logging';


setLogObservableFn(logObservableToConsole);

// Remove "//" in the next line to enable logging
const enableLogging = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

if (enableLogging) {
	addLogger(new ConsoleObservableLogger());
}

if (env && env['VSCODE_DEV_DEBUG']) {
	// To debug observables you also need the extension "ms-vscode.debug-value-editor"
	addLogger(DevToolsLogger.getInstance());
}
