/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { implies, ContextKeyExpression, ContextKeyExprType, IContext, IContextKeyService, expressionsAreEqualWithConstantSubstitution } from 'vs/platform/contextkey/common/contextkey';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';

export interface IResolveResult {
	/** Whether the resolved keybinding is entering a multi chord */
	enterMultiChord: boolean;
	/** Whether the resolved keybinding is leaving (and executing) a multi chord keybinding */
	leaveMultiChord: boolean;
	commandId: string | null;
	commandArgs: any;
	bubble: boolean;
}

export class KeybindingResolver {
	private readonly _log: (str: string) => void;
	private readonly _defaultKeybindings: ResolvedKeybindingItem[];
	private readonly _keybindings: ResolvedKeybindingItem[];
	private readonly _defaultBoundCommands: Map</* commandId */ string, boolean>;
	private readonly _map: Map</* 1st chord's keypress */ string, ResolvedKeybindingItem[]>;
	private readonly _lookupMap: Map</* commandId */ string, ResolvedKeybindingItem[]>;

	constructor(
		/** built-in and extension-provided keybindings */
		defaultKeybindings: ResolvedKeybindingItem[],
		/** user's keybindings */
		overrides: ResolvedKeybindingItem[],
		log: (str: string) => void
	) {
		this._log = log;
		this._defaultKeybindings = defaultKeybindings;

		this._defaultBoundCommands = new Map<string, boolean>();
		for (const defaultKeybinding of defaultKeybindings) {
			const command = defaultKeybinding.command;
			if (command && command.charAt(0) !== '-') {
				this._defaultBoundCommands.set(command, true);
			}
		}

		this._map = new Map<string, ResolvedKeybindingItem[]>();
		this._lookupMap = new Map<string, ResolvedKeybindingItem[]>();

		this._keybindings = KeybindingResolver.handleRemovals(([] as ResolvedKeybindingItem[]).concat(defaultKeybindings).concat(overrides));
		for (let i = 0, len = this._keybindings.length; i < len; i++) {
			const k = this._keybindings[i];
			if (k.chords.length === 0) {
				// unbound
				continue;
			}

			// substitute with constants that are registered after startup - https://github.com/microsoft/vscode/issues/174218#issuecomment-1437972127
			const when = k.when?.substituteConstants();

			if (when && when.type === ContextKeyExprType.False) {
				// when condition is false
				continue;
			}

			this._addKeyPress(k.chords[0], k);
		}
	}

	private static _isTargetedForRemoval(defaultKb: ResolvedKeybindingItem, keypress: string[] | null, when: ContextKeyExpression | undefined): boolean {
		if (keypress) {
			for (let i = 0; i < keypress.length; i++) {
				if (keypress[i] !== defaultKb.chords[i]) {
					return false;
				}
			}
		}

		// `true` means always, as does `undefined`
		// so we will treat `true` === `undefined`
		if (when && when.type !== ContextKeyExprType.True) {
			if (!defaultKb.when) {
				return false;
			}
			if (!expressionsAreEqualWithConstantSubstitution(when, defaultKb.when)) {
				return false;
			}
		}
		return true;

	}

	/**
	 * Looks for rules containing "-commandId" and removes them.
	 */
	public static handleRemovals(rules: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {
		// Do a first pass and construct a hash-map for removals
		const removals = new Map</* commandId */ string, ResolvedKeybindingItem[]>();
		for (let i = 0, len = rules.length; i < len; i++) {
			const rule = rules[i];
			if (rule.command && rule.command.charAt(0) === '-') {
				const command = rule.command.substring(1);
				if (!removals.has(command)) {
					removals.set(command, [rule]);
				} else {
					removals.get(command)!.push(rule);
				}
			}
		}

		if (removals.size === 0) {
			// There are no removals
			return rules;
		}

		// Do a second pass and keep only non-removed keybindings
		const result: ResolvedKeybindingItem[] = [];
		for (let i = 0, len = rules.length; i < len; i++) {
			const rule = rules[i];

			if (!rule.command || rule.command.length === 0) {
				result.push(rule);
				continue;
			}
			if (rule.command.charAt(0) === '-') {
				continue;
			}
			const commandRemovals = removals.get(rule.command);
			if (!commandRemovals || !rule.isDefault) {
				result.push(rule);
				continue;
			}
			let isRemoved = false;
			for (const commandRemoval of commandRemovals) {
				const when = commandRemoval.when;
				if (this._isTargetedForRemoval(rule, commandRemoval.chords, when)) {
					isRemoved = true;
					break;
				}
			}
			if (!isRemoved) {
				result.push(rule);
				continue;
			}
		}
		return result;
	}

	private _addKeyPress(keypress: string, item: ResolvedKeybindingItem): void {

		const conflicts = this._map.get(keypress);

		if (typeof conflicts === 'undefined') {
			// There is no conflict so far
			this._map.set(keypress, [item]);
			this._addToLookupMap(item);
			return;
		}

		for (let i = conflicts.length - 1; i >= 0; i--) {
			const conflict = conflicts[i];

			if (conflict.command === item.command) {
				continue;
			}

			// Test if the shorter keybinding is a prefix of the longer one.
			// If the shorter keybinding is a prefix, it effectively will shadow the longer one and is considered a conflict.
			let isShorterKbPrefix = true;
			for (let i = 1; i < conflict.chords.length && i < item.chords.length; i++) {
				if (conflict.chords[i] !== item.chords[i]) {
					// The ith step does not conflict
					isShorterKbPrefix = false;
					break;
				}
			}
			if (!isShorterKbPrefix) {
				continue;
			}

			if (KeybindingResolver.whenIsEntirelyIncluded(conflict.when, item.when)) {
				// `item` completely overwrites `conflict`
				// Remove conflict from the lookupMap
				this._removeFromLookupMap(conflict);
			}
		}

		conflicts.push(item);
		this._addToLookupMap(item);
	}

	private _addToLookupMap(item: ResolvedKeybindingItem): void {
		if (!item.command) {
			return;
		}

		let arr = this._lookupMap.get(item.command);
		if (typeof arr === 'undefined') {
			arr = [item];
			this._lookupMap.set(item.command, arr);
		} else {
			arr.push(item);
		}
	}

	private _removeFromLookupMap(item: ResolvedKeybindingItem): void {
		if (!item.command) {
			return;
		}
		const arr = this._lookupMap.get(item.command);
		if (typeof arr === 'undefined') {
			return;
		}
		for (let i = 0, len = arr.length; i < len; i++) {
			if (arr[i] === item) {
				arr.splice(i, 1);
				return;
			}
		}
	}

	/**
	 * Returns true if it is provable `a` implies `b`.
	 */
	public static whenIsEntirelyIncluded(a: ContextKeyExpression | null | undefined, b: ContextKeyExpression | null | undefined): boolean {
		if (!b || b.type === ContextKeyExprType.True) {
			return true;
		}
		if (!a || a.type === ContextKeyExprType.True) {
			return false;
		}

		return implies(a, b);
	}

	public getDefaultBoundCommands(): Map<string, boolean> {
		return this._defaultBoundCommands;
	}

	public getDefaultKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._defaultKeybindings;
	}

	public getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._keybindings;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybindingItem[] {
		const items = this._lookupMap.get(commandId);
		if (typeof items === 'undefined' || items.length === 0) {
			return [];
		}

		// Reverse to get the most specific item first
		const result: ResolvedKeybindingItem[] = [];
		let resultLen = 0;
		for (let i = items.length - 1; i >= 0; i--) {
			result[resultLen++] = items[i];
		}
		return result;
	}

	public lookupPrimaryKeybinding(commandId: string, context: IContextKeyService): ResolvedKeybindingItem | null {
		const items = this._lookupMap.get(commandId);
		if (typeof items === 'undefined' || items.length === 0) {
			return null;
		}
		if (items.length === 1) {
			return items[0];
		}

		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (context.contextMatchesRules(item.when)) {
				return item;
			}
		}

		return items[items.length - 1];
	}

	public resolve(context: IContext, currentChord: string[] | null, keypress: string): IResolveResult | null {
		this._log(`| Resolving ${keypress}${currentChord ? ` chorded from ${currentChord}` : ``}`);
		let lookupMap: ResolvedKeybindingItem[] | null = null;

		if (currentChord !== null) {
			// Fetch all chord bindings for `currentChord`
			const candidates = this._map.get(currentChord[0]);
			if (typeof candidates === 'undefined') {
				// No chords starting with `currentChord`
				this._log(`\\ No keybinding entries.`);
				return null;
			}

			lookupMap = [];
			for (let i = 0, len = candidates.length; i < len; i++) {
				const candidate = candidates[i];
				if (candidate.chords.length <= currentChord.length) {
					continue;
				}

				let prefixMatches = true;
				for (let i = 1; i < currentChord.length; i++) {
					if (candidate.chords[i] !== currentChord[i]) {
						prefixMatches = false;
						break;
					}
				}
				if (prefixMatches && candidate.chords[currentChord.length] === keypress) {
					lookupMap.push(candidate);
				}
			}
		} else {
			const candidates = this._map.get(keypress);
			if (typeof candidates === 'undefined') {
				// No bindings with `keypress`
				this._log(`\\ No keybinding entries.`);
				return null;
			}

			lookupMap = candidates;
		}

		const result = this._findCommand(context, lookupMap);
		if (!result) {
			this._log(`\\ From ${lookupMap.length} keybinding entries, no when clauses matched the context.`);
			return null;
		}

		if (currentChord === null && result.chords.length > 1 && result.chords[1] !== null) {
			this._log(`\\ From ${lookupMap.length} keybinding entries, matched chord, when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
			return {
				enterMultiChord: true,
				leaveMultiChord: false,
				commandId: null,
				commandArgs: null,
				bubble: false
			};
		} else if (currentChord !== null && currentChord.length + 1 < result.chords.length) {
			this._log(`\\ From ${lookupMap.length} keybinding entries, continued chord, when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
			return {
				enterMultiChord: false,
				leaveMultiChord: false,
				commandId: null,
				commandArgs: null,
				bubble: false
			};
		}

		this._log(`\\ From ${lookupMap.length} keybinding entries, matched ${result.command}, when: ${printWhenExplanation(result.when)}, source: ${printSourceExplanation(result)}.`);
		return {
			enterMultiChord: false,
			leaveMultiChord: result.chords.length > 1,
			commandId: result.command,
			commandArgs: result.commandArgs,
			bubble: result.bubble
		};
	}

	private _findCommand(context: IContext, matches: ResolvedKeybindingItem[]): ResolvedKeybindingItem | null {
		for (let i = matches.length - 1; i >= 0; i--) {
			const k = matches[i];

			if (!KeybindingResolver._contextMatchesRules(context, k.when)) {
				continue;
			}

			return k;
		}

		return null;
	}

	private static _contextMatchesRules(context: IContext, rules: ContextKeyExpression | null | undefined): boolean {
		if (!rules) {
			return true;
		}
		return rules.evaluate(context);
	}
}

function printWhenExplanation(when: ContextKeyExpression | undefined): string {
	if (!when) {
		return `no when condition`;
	}
	return `${when.serialize()}`;
}

function printSourceExplanation(kb: ResolvedKeybindingItem): string {
	return (
		kb.extensionId
			? (kb.isBuiltinExtension ? `built-in extension ${kb.extensionId}` : `user extension ${kb.extensionId}`)
			: (kb.isDefault ? `built-in` : `user`)
	);
}
