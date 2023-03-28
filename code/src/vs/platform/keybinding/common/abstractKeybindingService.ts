/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { IntervalTimer, TimeoutTimer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { SingleModifierChord, ResolvedKeybinding, ResolvedChord, Keybinding } from 'vs/base/common/keybindings';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService, IKeyboardEvent, KeybindingsSchemaContribution } from 'vs/platform/keybinding/common/keybinding';
import { IResolveResult, KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IME } from 'vs/base/common/ime';

interface CurrentChord {
	keypress: string;
	label: string | null;
}

const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|editor\.action\.clipboard)/;

export abstract class AbstractKeybindingService extends Disposable implements IKeybindingService {
	public _serviceBrand: undefined;

	protected readonly _onDidUpdateKeybindings: Emitter<void> = this._register(new Emitter<void>());
	get onDidUpdateKeybindings(): Event<void> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	private _currentChord: CurrentChord[] | null;
	private _currentChordChecker: IntervalTimer;
	private _currentChordStatusMessage: IDisposable | null;
	private _ignoreSingleModifiers: KeybindingModifierSet;
	private _currentSingleModifier: SingleModifierChord | null;
	private _currentSingleModifierClearTimeout: TimeoutTimer;

	protected _logging: boolean;

	public get inChordMode(): boolean {
		return !!this._currentChord;
	}

	constructor(
		private _contextKeyService: IContextKeyService,
		protected _commandService: ICommandService,
		protected _telemetryService: ITelemetryService,
		private _notificationService: INotificationService,
		protected _logService: ILogService,
	) {
		super();

		this._currentChord = null;
		this._currentChordChecker = new IntervalTimer();
		this._currentChordStatusMessage = null;
		this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
		this._currentSingleModifier = null;
		this._currentSingleModifierClearTimeout = new TimeoutTimer();
		this._logging = false;
	}

	public override dispose(): void {
		super.dispose();
	}

	protected abstract _getResolver(): KeybindingResolver;
	protected abstract _documentHasFocus(): boolean;
	public abstract resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[];
	public abstract resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;
	public abstract resolveUserBinding(userBinding: string): ResolvedKeybinding[];
	public abstract registerSchemaContribution(contribution: KeybindingsSchemaContribution): void;
	public abstract _dumpDebugInfo(): string;
	public abstract _dumpDebugInfoJSON(): string;

	public getDefaultKeybindingsContent(): string {
		return '';
	}

	public toggleLogging(): boolean {
		this._logging = !this._logging;
		return this._logging;
	}

	protected _log(str: string): void {
		if (this._logging) {
			this._logService.info(`[KeybindingService]: ${str}`);
		}
	}

	public getDefaultKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._getResolver().getDefaultKeybindings();
	}

	public getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._getResolver().getKeybindings();
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybinding[] {
		return arrays.coalesce(
			this._getResolver().lookupKeybindings(commandId).map(item => item.resolvedKeybinding)
		);
	}

	public lookupKeybinding(commandId: string, context?: IContextKeyService): ResolvedKeybinding | undefined {
		const result = this._getResolver().lookupPrimaryKeybinding(commandId, context || this._contextKeyService);
		if (!result) {
			return undefined;
		}
		return result.resolvedKeybinding;
	}

	public dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._dispatch(e, target);
	}

	public softDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult | null {
		this._log(`/ Soft dispatching keyboard event`);
		const keybinding = this.resolveKeyboardEvent(e);
		if (keybinding.hasMultipleChords()) {
			console.warn('Unexpected keyboard event mapped to multiple chords');
			return null;
		}
		const [firstChord,] = keybinding.getDispatchChords();
		if (firstChord === null) {
			// cannot be dispatched, probably only modifier keys
			this._log(`\\ Keyboard event cannot be dispatched`);
			return null;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChord = this._currentChord ? this._currentChord.map((({ keypress }) => keypress)) : null;
		return this._getResolver().resolve(contextValue, currentChord, firstChord);
	}

	private _scheduleLeaveChordMode(): void {
		const chordLastInteractedTime = Date.now();
		this._currentChordChecker.cancelAndSet(() => {

			if (!this._documentHasFocus()) {
				// Focus has been lost => leave chord mode
				this._leaveChordMode();
				return;
			}

			if (Date.now() - chordLastInteractedTime > 5000) {
				// 5 seconds elapsed => leave chord mode
				this._leaveChordMode();
			}

		}, 500);
	}

	private _enterMultiChordMode(firstChord: string, keypressLabel: string | null): void {
		this._currentChord = [{
			keypress: firstChord,
			label: keypressLabel
		}];
		this._currentChordStatusMessage = this._notificationService.status(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
		this._scheduleLeaveChordMode();
		IME.disable();
	}

	private _continueMultiChordMode(nextChord: string, keypressLabel: string | null): void {
		this._currentChord = this._currentChord ? this._currentChord : [];
		this._currentChord.push({
			keypress: nextChord,
			label: keypressLabel
		});
		const fullKeypressLabel = this._currentChord.map(({ label }) => label).join(', ');
		this._currentChordStatusMessage = this._notificationService.status(nls.localize('next.chord', "({0}) was pressed. Waiting for next key of chord...", fullKeypressLabel));
		this._scheduleLeaveChordMode();
	}

	private _leaveChordMode(): void {
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChordChecker.cancel();
		this._currentChord = null;
		IME.enable();
	}

	public dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void {
		this._log(`/ Dispatching keybinding triggered via menu entry accelerator - ${userSettingsLabel}`);
		const keybindings = this.resolveUserBinding(userSettingsLabel);
		if (keybindings.length === 0) {
			this._log(`\\ Could not resolve - ${userSettingsLabel}`);
		} else {
			this._doDispatch(keybindings[0], target, /*isSingleModiferChord*/false);
		}
	}

	protected _dispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._doDispatch(this.resolveKeyboardEvent(e), target, /*isSingleModiferChord*/false);
	}

	protected _singleModifierDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		const keybinding = this.resolveKeyboardEvent(e);
		const [singleModifier,] = keybinding.getSingleModifierDispatchChords();

		if (singleModifier) {

			if (this._ignoreSingleModifiers.has(singleModifier)) {
				this._log(`+ Ignoring single modifier ${singleModifier} due to it being pressed together with other keys.`);
				this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
				this._currentSingleModifierClearTimeout.cancel();
				this._currentSingleModifier = null;
				return false;
			}

			this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;

			if (this._currentSingleModifier === null) {
				// we have a valid `singleModifier`, store it for the next keyup, but clear it in 300ms
				this._log(`+ Storing single modifier for possible chord ${singleModifier}.`);
				this._currentSingleModifier = singleModifier;
				this._currentSingleModifierClearTimeout.cancelAndSet(() => {
					this._log(`+ Clearing single modifier due to 300ms elapsed.`);
					this._currentSingleModifier = null;
				}, 300);
				return false;
			}

			if (singleModifier === this._currentSingleModifier) {
				// bingo!
				this._log(`/ Dispatching single modifier chord ${singleModifier} ${singleModifier}`);
				this._currentSingleModifierClearTimeout.cancel();
				this._currentSingleModifier = null;
				return this._doDispatch(keybinding, target, /*isSingleModiferChord*/true);
			}

			this._log(`+ Clearing single modifier due to modifier mismatch: ${this._currentSingleModifier} ${singleModifier}`);
			this._currentSingleModifierClearTimeout.cancel();
			this._currentSingleModifier = null;
			return false;
		}

		// When pressing a modifier and holding it pressed with any other modifier or key combination,
		// the pressed modifiers should no longer be considered for single modifier dispatch.
		const [firstChord,] = keybinding.getChords();
		this._ignoreSingleModifiers = new KeybindingModifierSet(firstChord);

		if (this._currentSingleModifier !== null) {
			this._log(`+ Clearing single modifier due to other key up.`);
		}
		this._currentSingleModifierClearTimeout.cancel();
		this._currentSingleModifier = null;
		return false;
	}

	private _doDispatch(keybinding: ResolvedKeybinding, target: IContextKeyServiceTarget, isSingleModiferChord = false): boolean {
		let shouldPreventDefault = false;

		if (keybinding.hasMultipleChords()) {
			console.warn('Unexpected keyboard event mapped to multiple chords');
			return false;
		}

		let firstChord: string | null = null; // the first keybinding i.e. Ctrl+K
		let currentChord: string[] | null = null;// the "second" keybinding i.e. Ctrl+K "Ctrl+D"

		if (isSingleModiferChord) {
			// The keybinding is the second keypress of a single modifier chord, e.g. "shift shift".
			// A single modifier can only occur when the same modifier is pressed in short sequence,
			// hence we disregard `_currentChord` and use the same modifier instead.
			const [dispatchKeyname,] = keybinding.getSingleModifierDispatchChords();
			firstChord = dispatchKeyname;
			currentChord = dispatchKeyname ? [dispatchKeyname] : [];
		} else {
			[firstChord,] = keybinding.getDispatchChords();
			currentChord = this._currentChord ? this._currentChord.map(({ keypress }) => keypress) : null;
		}

		if (firstChord === null) {
			this._log(`\\ Keyboard event cannot be dispatched in keydown phase.`);
			// cannot be dispatched, probably only modifier keys
			return shouldPreventDefault;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const keypressLabel = keybinding.getLabel();
		const resolveResult = this._getResolver().resolve(contextValue, currentChord, firstChord);

		this._logService.trace('KeybindingService#dispatch', keypressLabel, resolveResult?.commandId);

		if (resolveResult && resolveResult.enterMultiChord) {
			shouldPreventDefault = true;
			this._enterMultiChordMode(firstChord, keypressLabel);
			this._log(`+ Entering chord mode...`);
			return shouldPreventDefault;
		}

		if (this._currentChord) {
			if (resolveResult && !resolveResult.leaveMultiChord) {
				shouldPreventDefault = true;
				this._continueMultiChordMode(firstChord, keypressLabel);
				this._log(`+ Continuing chord mode...`);
				return shouldPreventDefault;
			} else if (!resolveResult || !resolveResult.commandId) {
				const currentChordLabel = this._currentChord.map(({ label }) => label).join(', ');
				this._log(`+ Leaving chord mode: Nothing bound to "${currentChordLabel}, ${keypressLabel}".`);
				this._notificationService.status(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", currentChordLabel, keypressLabel), { hideAfter: 10 * 1000 /* 10s */ });
				shouldPreventDefault = true;
			}
		}

		this._leaveChordMode();

		if (resolveResult && resolveResult.commandId) {
			if (!resolveResult.bubble) {
				shouldPreventDefault = true;
			}
			this._log(`+ Invoking command ${resolveResult.commandId}.`);
			if (typeof resolveResult.commandArgs === 'undefined') {
				this._commandService.executeCommand(resolveResult.commandId).then(undefined, err => this._notificationService.warn(err));
			} else {
				this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(undefined, err => this._notificationService.warn(err));
			}
			if (!HIGH_FREQ_COMMANDS.test(resolveResult.commandId)) {
				this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: resolveResult.commandId, from: 'keybinding', detail: keybinding.getUserSettingsLabel() ?? undefined });
			}
		}

		return shouldPreventDefault;
	}

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey) {
			// ignore ctrl/cmd-combination but not shift/alt-combinatios
			return false;
		}
		// weak check for certain ranges. this is properly implemented in a subclass
		// with access to the KeyboardMapperFactory.
		if ((event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ)
			|| (event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9)) {
			return true;
		}
		return false;
	}
}

class KeybindingModifierSet {

	public static EMPTY = new KeybindingModifierSet(null);

	private readonly _ctrlKey: boolean;
	private readonly _shiftKey: boolean;
	private readonly _altKey: boolean;
	private readonly _metaKey: boolean;

	constructor(source: ResolvedChord | null) {
		this._ctrlKey = source ? source.ctrlKey : false;
		this._shiftKey = source ? source.shiftKey : false;
		this._altKey = source ? source.altKey : false;
		this._metaKey = source ? source.metaKey : false;
	}

	has(modifier: SingleModifierChord) {
		switch (modifier) {
			case 'ctrl': return this._ctrlKey;
			case 'shift': return this._shiftKey;
			case 'alt': return this._altKey;
			case 'meta': return this._metaKey;
		}
	}
}
