/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { terminalTabFocusContextKey } from 'vs/platform/terminal/common/terminal';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction, revealActiveTerminal } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { AccessibilityHelpWidget } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibilityHelp';
import { AccessibleBufferWidget } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibleBuffer';
import { Terminal } from 'xterm';

const category = terminalStrings.actionCategory;

class AccessibleBufferContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID: 'terminal.accessible-buffer';
	static get(instance: ITerminalInstance): AccessibleBufferContribution | null {
		return instance.getContribution<AccessibleBufferContribution>(AccessibleBufferContribution.ID);
	}
	private _accessibleBufferWidget: AccessibleBufferWidget | undefined;

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}
	layout(xterm: IXtermTerminal & { raw: Terminal }): void {
		if (!this._accessibleBufferWidget) {
			this._accessibleBufferWidget = this.add(this._instantiationService.createInstance(AccessibleBufferWidget, this._instance, xterm));
		}
	}
	async show(): Promise<void> {
		await this._accessibleBufferWidget?.show();
	}

	async createCommandQuickPick(): Promise<IQuickPick<IQuickPickItem> | undefined> {
		return this._accessibleBufferWidget?.createQuickPick();
	}
}
registerTerminalContribution(AccessibleBufferContribution.ID, AccessibleBufferContribution);

registerTerminalAction({
	id: TerminalCommandId.ShowTerminalAccessibilityHelp,
	title: { value: localize('workbench.action.terminal.showAccessibilityHelp', "Show Terminal Accessibility Help"), original: 'Show Terminal Accessibility Help' },
	keybinding: {
		primary: KeyMod.Alt | KeyCode.F1,
		weight: KeybindingWeight.WorkbenchContrib,
		linux: {
			primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F1,
			secondary: [KeyMod.Alt | KeyCode.F1]
		},
		when: TerminalContextKeys.focus
	},
	run: async (c, accessor: ServicesAccessor) => {
		const instantiationService = accessor.get(IInstantiationService);
		const instance = await c.service.getActiveOrCreateInstance();
		await revealActiveTerminal(instance, c);
		const widget = instantiationService.createInstance(AccessibilityHelpWidget, instance);
		instance.registerChildElement({
			element: widget.element
		});
		widget.show();
	}
});

registerTerminalAction({
	id: TerminalCommandId.FocusAccessibleBuffer,
	title: { value: localize('workbench.action.terminal.focusAccessibleBuffer', 'Focus Accessible Buffer'), original: 'Focus Accessible Buffer' },
	f1: true,
	category,
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	keybinding: [
		{
			primary: KeyMod.Shift | KeyCode.Tab,
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, terminalTabFocusContextKey, TerminalContextKeys.accessibleBufferFocus.negate())
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await revealActiveTerminal(instance, c);
		if (!instance) {
			return;
		}
		await AccessibleBufferContribution.get(instance)?.show();
	}
});

registerTerminalAction({
	id: TerminalCommandId.NavigateAccessibleBuffer,
	title: { value: localize('workbench.action.terminal.navigateAccessibleBuffer', 'Navigate Accessible Buffer'), original: 'Navigate Accessible Buffer' },
	f1: true,
	category,
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	keybinding: [
		{
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
			weight: KeybindingWeight.WorkbenchContrib + 2,
			when: TerminalContextKeys.accessibleBufferFocus
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await revealActiveTerminal(instance, c);
		if (!instance) {
			return;
		}
		const quickPick = await AccessibleBufferContribution.get(instance)?.createCommandQuickPick();
		quickPick?.show();
	}
});
