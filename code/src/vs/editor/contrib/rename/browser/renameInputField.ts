/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getClientArea, getDomNodePagePosition, getTotalHeight } from 'vs/base/browser/dom';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import * as arrays from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import 'vs/css!./renameInputField';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { NewSymbolName, NewSymbolNameTag } from 'vs/editor/common/languages';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultListStyles } from 'vs/platform/theme/browser/defaultStyles';
import {
	editorWidgetBackground,
	inputBackground,
	inputBorder,
	inputForeground,
	widgetBorder,
	widgetShadow
} from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';

/** for debugging */
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;


export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false, localize('renameInputVisible', "Whether the rename input widget is visible"));
export const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey<boolean>('renameInputFocused', false, localize('renameInputFocused', "Whether the rename input widget is focused"));

export interface RenameInputFieldResult {
	newName: string;
	wantsPreview?: boolean;
}

export class RenameInputField implements IContentWidget {

	private _position?: Position;
	private _domNode?: HTMLElement;
	private _input?: HTMLInputElement;
	private _candidatesView?: CandidatesView;
	private _label?: HTMLDivElement;
	private _visible?: boolean;
	private _nPxAvailableAbove?: number;
	private _nPxAvailableBelow?: number;
	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	readonly allowEditorOverflow: boolean = true;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _acceptKeybindings: [string, string],
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
		this._focusedContextKey = CONTEXT_RENAME_INPUT_FOCUSED.bindTo(contextKeyService);

		this._editor.addContentWidget(this);

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
	}

	dispose(): void {
		this._disposables.dispose();
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return '__renameInputWidget';
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.className = 'monaco-editor rename-box';

			this._input = document.createElement('input');
			this._input.className = 'rename-input';
			this._input.type = 'text';
			this._input.setAttribute('aria-label', localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));
			// TODO@ulugbekna: is using addDisposableListener's right way to do it?
			this._disposables.add(addDisposableListener(this._input, 'focus', () => { this._focusedContextKey.set(true); }));
			this._disposables.add(addDisposableListener(this._input, 'blur', () => { this._focusedContextKey.reset(); }));
			this._domNode.appendChild(this._input);

			this._candidatesView = new CandidatesView(this._domNode, { fontInfo: this._editor.getOption(EditorOption.fontInfo) });

			this._label = document.createElement('div');
			this._label.className = 'rename-label';
			this._domNode.appendChild(this._label);

			this._updateFont();
			this._updateStyles(this._themeService.getColorTheme());
		}
		return this._domNode;
	}

	private _updateStyles(theme: IColorTheme): void {
		if (!this._input || !this._domNode) {
			return;
		}

		const widgetShadowColor = theme.getColor(widgetShadow);
		const widgetBorderColor = theme.getColor(widgetBorder);
		this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? '');
		this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : '';
		this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : '';
		this._domNode.style.color = String(theme.getColor(inputForeground) ?? '');

		this._input.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		// this._input.style.color = String(theme.getColor(inputForeground) ?? '');
		const border = theme.getColor(inputBorder);
		this._input.style.borderWidth = border ? '1px' : '0px';
		this._input.style.borderStyle = border ? 'solid' : 'none';
		this._input.style.borderColor = border?.toString() ?? 'none';
	}

	private _updateFont(): void {
		if (!this._input || !this._label || !this._candidatesView) {
			return;
		}

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._input.style.fontFamily = fontInfo.fontFamily;
		this._input.style.fontWeight = fontInfo.fontWeight;
		this._input.style.fontSize = `${fontInfo.fontSize}px`;

		this._candidatesView.updateFont(fontInfo);

		this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
	}

	private _computeLabelFontSize(editorFontSize: number) {
		return editorFontSize * 0.8;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._visible) {
			return null;
		}

		if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
			!this._editor.getDomNode() // @ulugbekna: can happen during tests based on suggestWidget's similar predicate check
		) {
			return null;
		}

		const bodyBox = getClientArea(this.getDomNode().ownerDocument.body);
		const editorBox = getDomNodePagePosition(this._editor.getDomNode());
		const cursorBox = this._editor.getScrolledVisiblePosition(this._position!);

		this._nPxAvailableAbove = cursorBox.top + editorBox.top;
		this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { totalHeight: candidateViewHeight } = CandidateView.getLayoutInfo({ lineHeight });

		const positionPreference = this._nPxAvailableBelow > candidateViewHeight * 6 /* approximate # of candidates to fit in (inclusive of rename input box & rename label) */
			? [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
			: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];

		return {
			position: this._position!,
			preference: positionPreference,
		};
	}

	beforeRender(): IDimension | null {
		const [accept, preview] = this._acceptKeybindings;
		this._label!.innerText = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());

		this._domNode!.style.minWidth = `250px`; // to prevent from widening when candidates come in
		this._domNode!.style.maxWidth = `400px`; // TODO@ulugbekna: what if we have a very long name?

		return null;
	}

	afterRender(position: ContentWidgetPositionPreference | null): void {
		if (position === null) {
			// cancel rename when input widget isn't rendered anymore
			this.cancelInput(true);
			return;
		}

		if (!this._editor.hasModel() || // shouldn't happen
			!this._editor.getDomNode() // can happen during tests based on suggestWidget's similar predicate check
		) {
			return;
		}

		assertType(this._candidatesView);
		assertType(this._nPxAvailableAbove !== undefined);
		assertType(this._nPxAvailableBelow !== undefined);

		const inputBoxHeight = getTotalHeight(this._input!);

		const labelHeight = getTotalHeight(this._label!);

		let totalHeightAvailable: number;
		if (position === ContentWidgetPositionPreference.BELOW) {
			totalHeightAvailable = this._nPxAvailableBelow;
		} else {
			totalHeightAvailable = this._nPxAvailableAbove;
		}

		this._candidatesView!.layout({ height: totalHeightAvailable - labelHeight - inputBoxHeight });
	}


	private _currentAcceptInput?: (wantsPreview: boolean) => void;
	private _currentCancelInput?: (focusEditor: boolean) => void;

	acceptInput(wantsPreview: boolean): void {
		this._currentAcceptInput?.(wantsPreview);
	}

	cancelInput(focusEditor: boolean): void {
		this._currentCancelInput?.(focusEditor);
	}

	focusNextRenameSuggestion() {
		this._candidatesView?.focusNext();
	}

	focusPreviousRenameSuggestion() {
		if (!this._candidatesView?.focusPrevious()) {
			this._input!.focus();
		}
	}

	getInput(where: IRange, value: string, selectionStart: number, selectionEnd: number, supportPreview: boolean, candidates: Promise<NewSymbolName[]>, token: CancellationToken): Promise<RenameInputFieldResult | boolean> {

		this._domNode!.classList.toggle('preview', supportPreview);

		this._position = new Position(where.startLineNumber, where.startColumn);
		this._input!.value = value;
		this._input!.setAttribute('selectionStart', selectionStart.toString());
		this._input!.setAttribute('selectionEnd', selectionEnd.toString());
		this._input!.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20); // determines width

		const disposeOnDone = new DisposableStore();

		candidates.then(candidates => this._showRenameCandidates(candidates, value, token));

		return new Promise<RenameInputFieldResult | boolean>(resolve => {

			this._currentCancelInput = (focusEditor) => {
				this._currentAcceptInput = undefined;
				this._currentCancelInput = undefined;
				this._candidatesView?.clearCandidates();
				resolve(focusEditor);
				return true;
			};

			this._currentAcceptInput = (wantsPreview) => {
				assertType(this._input !== undefined);
				assertType(this._candidatesView !== undefined);

				const candidateName = this._candidatesView.focusedCandidate;
				if ((candidateName === undefined && this._input.value === value) || this._input.value.trim().length === 0) {
					this.cancelInput(true);
					return;
				}

				this._currentAcceptInput = undefined;
				this._currentCancelInput = undefined;
				this._candidatesView.clearCandidates();

				resolve({
					newName: candidateName ?? this._input.value,
					wantsPreview: supportPreview && wantsPreview
				});
			};

			disposeOnDone.add(token.onCancellationRequested(() => this.cancelInput(true)));
			if (!_sticky) {
				disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus())));
			}

			this._show();

		}).finally(() => {
			disposeOnDone.dispose();
			this._hide();
		});
	}

	private _show(): void {
		this._editor.revealLineInCenterIfOutsideViewport(this._position!.lineNumber, ScrollType.Smooth);
		this._visible = true;
		this._visibleContextKey.set(true);
		this._editor.layoutContentWidget(this);

		setTimeout(() => {
			this._input!.focus();
			this._input!.setSelectionRange(
				parseInt(this._input!.getAttribute('selectionStart')!),
				parseInt(this._input!.getAttribute('selectionEnd')!));
		}, 100);
	}

	private _showRenameCandidates(candidates: NewSymbolName[], currentName: string, token: CancellationToken): void {
		if (token.isCancellationRequested) {
			return;
		}

		// deduplicate and filter out the current value
		candidates = arrays.distinct(candidates, candidate => candidate.newSymbolName);
		candidates = candidates.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._input?.value && newSymbolName !== currentName);

		if (candidates.length < 1) {
			return;
		}

		// show the candidates
		this._candidatesView!.setCandidates(candidates);

		// ask editor to re-layout given that the widget is now of a different size after rendering rename candidates
		this._editor.layoutContentWidget(this);
	}

	private _hide(): void {
		this._visible = false;
		this._visibleContextKey.reset();
		this._editor.layoutContentWidget(this);
	}
}

export class CandidatesView {

	private readonly _listWidget: List<NewSymbolName>;
	private readonly _listContainer: HTMLDivElement;

	private _lineHeight: number;
	private _availableHeight: number;

	constructor(parent: HTMLElement, opts: { fontInfo: FontInfo }) {

		this._availableHeight = 0;

		this._lineHeight = opts.fontInfo.lineHeight;

		this._listContainer = document.createElement('div');
		this._listContainer.style.fontFamily = opts.fontInfo.fontFamily;
		this._listContainer.style.fontWeight = opts.fontInfo.fontWeight;
		this._listContainer.style.fontSize = `${opts.fontInfo.fontSize}px`;
		parent.appendChild(this._listContainer);

		const that = this;

		const virtualDelegate = new class implements IListVirtualDelegate<NewSymbolName> {
			getTemplateId(element: NewSymbolName): string {
				return 'candidate';
			}

			getHeight(element: NewSymbolName): number {
				return that.candidateViewHeight;
			}
		};

		const renderer = new class implements IListRenderer<NewSymbolName, CandidateView> {
			readonly templateId = 'candidate';

			renderTemplate(container: HTMLElement): CandidateView {
				return new CandidateView(container, { lineHeight: that._lineHeight });
			}

			renderElement(candidate: NewSymbolName, index: number, templateData: CandidateView): void {
				templateData.model = candidate;
			}

			disposeTemplate(templateData: CandidateView): void {
				templateData.dispose();
			}
		};

		this._listWidget = new List(
			'NewSymbolNameCandidates',
			this._listContainer,
			virtualDelegate,
			[renderer],
			{
				keyboardSupport: false, // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
				mouseSupport: true,
				multipleSelectionSupport: false,
			}
		);

		this._listWidget.style(defaultListStyles);
	}

	public get candidateViewHeight(): number {
		const { totalHeight } = CandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
		return totalHeight;
	}

	// height - max height allowed by parent element
	public layout({ height }: { height: number }): void {
		this._availableHeight = height;
		if (this._listWidget.length > 0) { // candidates have been set
			this._listWidget.layout(this._pickListHeight(this._listWidget.length));
		}
	}

	private _pickListHeight(nCandidates: number) {
		const heightToFitAllCandidates = this.candidateViewHeight * nCandidates;
		const height = Math.min(heightToFitAllCandidates, this._availableHeight, this.candidateViewHeight * 7 /* max # of candidates we want to show at once */);
		return height;
	}

	public setCandidates(candidates: NewSymbolName[]): void {
		const height = this._pickListHeight(candidates.length);

		this._listWidget.splice(0, 0, candidates);

		this._listWidget.layout(height);

		this._listContainer.style.height = `${height}px`;
	}

	public clearCandidates(): void {
		this._listContainer.style.height = '0px';
		this._listWidget.splice(0, this._listWidget.length, []);
	}

	public get focusedCandidate(): string | undefined {
		return this._listWidget.isDOMFocused() ? this._listWidget.getFocusedElements()[0].newSymbolName : undefined;
	}

	public updateFont(fontInfo: FontInfo): void {
		this._listContainer.style.fontFamily = fontInfo.fontFamily;
		this._listContainer.style.fontWeight = fontInfo.fontWeight;
		this._listContainer.style.fontSize = `${fontInfo.fontSize}px`;

		this._lineHeight = fontInfo.lineHeight;

		this._listWidget.rerender();
	}

	public focusNext() {
		if (this._listWidget.isDOMFocused()) {
			this._listWidget.focusNext();
		} else {
			this._listWidget.domFocus();
			this._listWidget.focusFirst();
		}
		this._listWidget.reveal(this._listWidget.getFocus()[0]);
	}

	/**
	 * @returns true if focus is moved to previous element
	 */
	public focusPrevious() {
		this._listWidget.domFocus();
		const focusedIx = this._listWidget.getFocus()[0];
		if (focusedIx !== 0) {
			this._listWidget.focusPrevious();
			this._listWidget.reveal(this._listWidget.getFocus()[0]);
		}
		return focusedIx > 0;
	}
}

export class CandidateView { // TODO@ulugbekna: remove export

	// TODO@ulugbekna: accessibility

	private static _PADDING: number = 2;

	public readonly domNode: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _label: HTMLElement;

	constructor(parent: HTMLElement, { lineHeight }: { lineHeight: number }) {

		this.domNode = document.createElement('div');
		this.domNode.style.display = `flex`;
		this.domNode.style.alignItems = `center`;
		this.domNode.style.height = `${lineHeight}px`;
		this.domNode.style.padding = `${CandidateView._PADDING}px`;

		this._icon = document.createElement('div');
		this._icon.style.display = `flex`;
		this._icon.style.alignItems = `center`;
		this._icon.style.width = this._icon.style.height = `${lineHeight * 0.8}px`;
		this.domNode.appendChild(this._icon);

		this._label = document.createElement('div');
		this._icon.style.display = `flex`;
		this._icon.style.alignItems = `center`;
		this._label.style.marginLeft = '5px';
		this.domNode.appendChild(this._label);

		parent.appendChild(this.domNode);
	}

	public set model(value: NewSymbolName) {

		// @ulugbekna: a hack to always include sparkle for now
		const alwaysIncludeSparkle = true;

		// update icon
		if (alwaysIncludeSparkle || value.tags?.includes(NewSymbolNameTag.AIGenerated)) {
			if (this._icon.children.length === 0) {
				this._icon.appendChild(renderIcon(Codicon.sparkle));
			}
		} else {
			if (this._icon.children.length === 1) {
				this._icon.removeChild(this._icon.children[0]);
			}
		}

		this._label.innerText = value.newSymbolName;
	}

	public static getLayoutInfo({ lineHeight }: { lineHeight: number }): { totalHeight: number } {
		const totalHeight = lineHeight + CandidateView._PADDING * 2 /* top & bottom padding */;
		return { totalHeight };
	}

	public dispose() {
	}
}
