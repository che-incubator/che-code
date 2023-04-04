/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { InteractiveEditorController, Recording } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorWidget';
import { CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST, CTX_INTERACTIVE_EDITOR_HAS_PROVIDER, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST, CTX_INTERACTIVE_EDITOR_EMPTY, CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION, CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE, MENU_INTERACTIVE_EDITOR_WIDGET_UNDO, MENU_INTERACTIVE_EDITOR_WIDGET_STATUS, CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK, CTX_INTERACTIVE_EDITOR_INLNE_DIFF, CTX_INTERACTIVE_EDITOR_HAS_RESPONSE } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { localize } from 'vs/nls';
import { IAction2Options } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledTextResourceEditorInput } from 'vs/workbench/common/editor';

export class StartSessionAction extends EditorAction2 {

	constructor() {
		super({
			id: 'interactiveEditor.start',
			title: { value: localize('run', 'Start Session'), original: 'Start Session' },
			category: AbstractInteractiveEditorAction.category,
			f1: true,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_HAS_PROVIDER, EditorContextKeys.writable),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyI,
				secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)],
			}
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		InteractiveEditorController.get(editor)?.run();
	}
}

abstract class AbstractInteractiveEditorAction extends EditorAction2 {

	static readonly category = { value: localize('cat', 'Interactive Editor'), original: 'Interactive Editor' };

	constructor(desc: IAction2Options) {
		super({
			...desc,
			category: AbstractInteractiveEditorAction.category,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_HAS_PROVIDER, desc.precondition)
		});
	}

	override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			editor = editor.getParentEditor();
		}
		const ctrl = InteractiveEditorController.get(editor);
		if (!ctrl) {
			return;
		}
		this.runInteractiveEditorCommand(accessor, ctrl, editor, ..._args);
	}

	abstract runInteractiveEditorCommand(accessor: ServicesAccessor, ctrl: InteractiveEditorController, editor: ICodeEditor, ...args: any[]): void;
}


export class MakeRequestAction extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.accept',
			title: localize('accept', 'Make Request'),
			icon: Codicon.send,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_EMPTY.negate()),
			keybinding: {
				when: CTX_INTERACTIVE_EDITOR_FOCUSED,
				weight: KeybindingWeight.EditorCore + 7,
				primary: KeyCode.Enter
			},
			menu: {
				id: MENU_INTERACTIVE_EDITOR_WIDGET,
				group: 'main',
				order: 1,
				when: CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST.isEqualTo(false)
			}
		});
	}

	runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.accept();
	}
}

export class StopRequestAction extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.stop',
			title: localize('stop', 'Stop Request'),
			icon: Codicon.debugStop,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_EMPTY.negate(), CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST),
			menu: {
				id: MENU_INTERACTIVE_EDITOR_WIDGET,
				group: 'main',
				order: 1,
				when: CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST
			},
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape
			}
		});
	}

	runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.cancelCurrentRequest();
	}
}

export class CancelSessionAction extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.cancel',
			title: localize('cancel', 'Cancel'),
			precondition: CTX_INTERACTIVE_EDITOR_VISIBLE,
			keybinding: {
				weight: KeybindingWeight.EditorContrib - 1,
				primary: KeyCode.Escape
			}
		});
	}

	runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.cancelSession();
	}
}

export class ArrowOutUpAction extends AbstractInteractiveEditorAction {
	constructor() {
		super({
			id: 'interactiveEditor.arrowOutUp',
			title: localize('arrowUp', 'Cursor Up'),
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST),
			keybinding: {
				weight: KeybindingWeight.EditorCore,
				primary: KeyCode.UpArrow
			}
		});
	}

	runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(true);
	}
}

export class ArrowOutDownAction extends AbstractInteractiveEditorAction {
	constructor() {
		super({
			id: 'interactiveEditor.arrowOutDown',
			title: localize('arrowDown', 'Cursor Down'),
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST),
			keybinding: {
				weight: KeybindingWeight.EditorCore,
				primary: KeyCode.DownArrow
			}
		});
	}

	runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.arrowOut(false);
	}
}

export class FocusInteractiveEditor extends EditorAction2 {

	constructor() {
		super({
			id: 'interactiveEditor.focus',
			title: localize('focus', 'Focus'),
			category: AbstractInteractiveEditorAction.category,
			precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_FOCUSED.negate()),
			keybinding: [{
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION.isEqualTo('above'),
				primary: KeyCode.DownArrow,
			}, {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				when: CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION.isEqualTo('below'),
				primary: KeyCode.UpArrow,
			}]
		});
	}

	override runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, ..._args: any[]) {
		InteractiveEditorController.get(editor)?.focus();
	}
}

export class PreviousFromHistory extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.previousFromHistory',
			title: localize('previousFromHistory', 'Previous From History'),
			precondition: CTX_INTERACTIVE_EDITOR_FOCUSED,
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.populateHistory(true);
	}
}

export class NextFromHistory extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.nextFromHistory',
			title: localize('nextFromHistory', 'Next From History'),
			precondition: CTX_INTERACTIVE_EDITOR_FOCUSED,
			keybinding: {
				weight: KeybindingWeight.EditorCore + 10, // win against core_command
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): void {
		ctrl.populateHistory(false);
	}
}


export class UndoToClipboard extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.undoToClipboard',
			title: localize('undo.clipboard', 'Undo to Clipboard'),
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple')),
			keybinding: {
				weight: KeybindingWeight.EditorContrib + 10,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyZ },
			},
			menu: {
				when: CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple'),
				id: MENU_INTERACTIVE_EDITOR_WIDGET_UNDO,
				group: '1_undo',
				order: 1
			}
		});
	}

	override runInteractiveEditorCommand(accessor: ServicesAccessor, ctrl: InteractiveEditorController): void {
		const clipboardService = accessor.get(IClipboardService);
		const lastText = ctrl.undoLast();
		if (lastText !== undefined) {
			clipboardService.writeText(lastText);
		}
	}
}

export class UndoToNewFile extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.undoToFile',
			title: localize('undo.newfile', 'Undo to New File'),
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple')),
			menu: {
				when: CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple'),
				id: MENU_INTERACTIVE_EDITOR_WIDGET_UNDO,
				group: '1_undo',
				order: 2
			}
		});
	}

	override runInteractiveEditorCommand(accessor: ServicesAccessor, ctrl: InteractiveEditorController, editor: ICodeEditor, ..._args: any[]): void {
		const editorService = accessor.get(IEditorService);
		const lastText = ctrl.undoLast();
		if (lastText !== undefined) {
			const input: IUntitledTextResourceEditorInput = { forceUntitled: true, resource: undefined, contents: lastText, languageId: editor.getModel()?.getLanguageId() };
			editorService.openEditor(input, SIDE_GROUP);
		}
	}
}

export class UndoCommand extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.undo',
			title: localize('undo', 'Undo'),
			icon: Codicon.commentDiscussion,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple')),
			menu: {
				when: CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE.isEqualTo('simple'),
				id: MENU_INTERACTIVE_EDITOR_WIDGET_UNDO,
				group: '1_undo',
				order: 3
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController): void {
		ctrl.undoLast();
	}
}

export class FeebackHelpfulCommand extends AbstractInteractiveEditorAction {
	constructor() {
		super({
			id: 'interactiveEditor.feedbackHelpful',
			title: localize('feedback.helpful', 'Helpful'),
			icon: Codicon.thumbsup,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_HAS_RESPONSE),
			toggled: CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK.isEqualTo('helpful'),
			menu: {
				id: MENU_INTERACTIVE_EDITOR_WIDGET_STATUS,
				group: '1_feedback',
				order: 1
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController): void {
		ctrl.feedbackLast(true);
	}
}

export class FeebackUnhelpfulCommand extends AbstractInteractiveEditorAction {
	constructor() {
		super({
			id: 'interactiveEditor.feedbackunhelpful',
			title: localize('feedback.unhelpful', 'Unhelpful'),
			icon: Codicon.thumbsdown,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE, CTX_INTERACTIVE_EDITOR_HAS_RESPONSE),
			toggled: CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK.isEqualTo('unhelpful'),
			menu: {
				id: MENU_INTERACTIVE_EDITOR_WIDGET_STATUS,
				group: '1_feedback',
				order: 2
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController): void {
		ctrl.feedbackLast(false);
	}
}

export class ToggleInlineDiff extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.toggleInlineDiff',
			title: localize('toggleInlineDiff', 'Toggle Inline Diff'),
			icon: Codicon.diff,
			precondition: ContextKeyExpr.and(CTX_INTERACTIVE_EDITOR_VISIBLE),
			toggled: CTX_INTERACTIVE_EDITOR_INLNE_DIFF,
			menu: {
				id: MENU_INTERACTIVE_EDITOR_WIDGET_STATUS,
				order: 1
			}
		});
	}

	override runInteractiveEditorCommand(_accessor: ServicesAccessor, ctrl: InteractiveEditorController): void {
		ctrl.toggleInlineDiff();
	}
}

export class CopyRecordings extends AbstractInteractiveEditorAction {

	constructor() {
		super({
			id: 'interactiveEditor.copyRecordings',
			f1: true,
			title: {
				value: localize('copyRecordings', '(Developer) Write Exchange to Clipboard'), original: '(Developer) Write Exchange to Clipboard'
			}
		});
	}

	override async runInteractiveEditorCommand(accessor: ServicesAccessor, ctrl: InteractiveEditorController, _editor: ICodeEditor, ..._args: any[]): Promise<void> {

		const clipboardService = accessor.get(IClipboardService);
		const quickPickService = accessor.get(IQuickInputService);

		const picks: (IQuickPickItem & { rec: Recording })[] = ctrl.recordings().map(rec => {
			return {
				rec,
				label: localize('label', "{0} messages, started {1}", rec.exchanges.length, rec.when.toLocaleTimeString()),
				tooltip: rec.exchanges.map(ex => ex.req.prompt).join('\n'),
			};
		});

		if (picks.length === 0) {
			return;
		}

		let pick: typeof picks[number] | undefined;
		if (picks.length === 1) {
			pick = picks[0];
		} else {
			pick = await quickPickService.pick(picks, { canPickMany: false });
		}
		if (pick) {
			clipboardService.writeText(JSON.stringify(pick.rec, undefined, 2));
		}
	}
}
