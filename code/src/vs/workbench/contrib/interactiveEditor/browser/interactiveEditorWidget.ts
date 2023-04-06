/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./interactiveEditor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { assertType } from 'vs/base/common/types';
import { CTX_INTERACTIVE_EDITOR_FOCUSED, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST, CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST, CTX_INTERACTIVE_EDITOR_EMPTY, CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION, CTX_INTERACTIVE_EDITOR_VISIBLE, MENU_INTERACTIVE_EDITOR_WIDGET, MENU_INTERACTIVE_EDITOR_WIDGET_STATUS } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { ITextModel } from 'vs/editor/common/model';
import { Dimension, addDisposableListener, getTotalHeight, getTotalWidth, h, reset } from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IModelService } from 'vs/editor/common/services/model';
import { URI } from 'vs/base/common/uri';
import { EmbeddedCodeEditorWidget, EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IPosition } from 'vs/editor/common/core/position';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { TextEdit } from 'vs/editor/common/languages';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { ILanguageSelection } from 'vs/editor/common/languages/language';

const _commonEditorOptions: IEditorConstructionOptions = {
	padding: { top: 3, bottom: 2 },
	overviewRulerLanes: 0,
	glyphMargin: false,
	lineNumbers: 'off',
	folding: false,
	selectOnLineNumbers: false,
	hideCursorInOverviewRuler: true,
	selectionHighlight: false,
	scrollbar: {
		useShadows: false,
		vertical: 'hidden',
		horizontal: 'auto',
		alwaysConsumeMouseWheel: false
	},
	lineDecorationsWidth: 0,
	overviewRulerBorder: false,
	scrollBeyondLastLine: false,
	renderLineHighlight: 'none',
	fixedOverflowWidgets: true,
	dragAndDrop: false,
	revealHorizontalRightPadding: 5,
	minimap: { enabled: false },
	guides: { indentation: false },
	rulers: [],
	cursorWidth: 1,
	wrappingStrategy: 'advanced',
	wrappingIndent: 'none',
	renderWhitespace: 'none',
	dropIntoEditor: { enabled: true },

	quickSuggestions: false,
	suggest: {
		showIcons: false,
		showSnippets: false,
		showStatusBar: false,
	}
};

const _inputEditorOptions: IEditorConstructionOptions = {
	..._commonEditorOptions,
	wordWrap: 'on',
	ariaLabel: localize('aria-label', "Interactive Editor Input"),
	fontFamily: DEFAULT_FONT_FAMILY,
	fontSize: 13,
	lineHeight: 20,
};

const _previewEditorEditorOptions: IDiffEditorConstructionOptions = {
	..._commonEditorOptions,
	wordWrap: 'off',
	enableSplitViewResizing: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	ignoreTrimWhitespace: false,
	renderSideBySide: true,
	originalAriaLabel: localize('modified', 'Modified'),
	modifiedAriaLabel: localize('original', 'Original'),
	diffAlgorithm: 'smart',
};

class InteractiveEditorWidget {

	private static _modelPool: number = 1;

	private static _noop = () => { };

	private readonly _elements = h(
		'div.interactive-editor@root',
		[
			h('div.body', [
				h('div.content@content', [
					h('div.input@input', [
						h('div.editor-placeholder@placeholder'),
						h('div.editor-container@editor'),
					]),
					h('div.toolbar@editorToolbar'),
				]),
			]),
			h('div.progress@progress'),
			h('div.preview@preview'),
			h('div.status@status', [
				h('div.actions.hidden@statusToolbar'),
				h('div.label@statusLabel'),
			]),
		]
	);

	private readonly _store = new DisposableStore();
	private readonly _historyStore = new DisposableStore();
	private readonly _previewModel = this._store.add(new MutableDisposable());

	readonly inputEditor: ICodeEditor;
	private readonly _inputModel: ITextModel;
	private readonly _ctxInputEmpty: IContextKey<boolean>;

	private readonly _progressBar: ProgressBar;

	private readonly _previewEditor: EmbeddedDiffEditorWidget;

	private readonly _onDidChangeHeight = new Emitter<void>();
	readonly onDidChangeHeight: Event<void> = Event.filter(this._onDidChangeHeight.event, _ => !this._isLayouting);

	private _lastDim: Dimension | undefined;
	private _isLayouting: boolean = false;

	public acceptInput: () => void = InteractiveEditorWidget._noop;
	private _cancelInput: () => void = InteractiveEditorWidget._noop;

	constructor(
		parentEditor: ICodeEditor,
		@IModelService private readonly _modelService: IModelService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {

		// input editor logic
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				SnippetController2.ID,
				GhostTextController.ID,
				SuggestController.ID
			])
		};

		this.inputEditor = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, _inputEditorOptions, codeEditorWidgetOptions, parentEditor);
		this._store.add(this.inputEditor);

		const uri = URI.from({ scheme: 'vscode', authority: 'interactive-editor', path: `/interactive-editor/model${InteractiveEditorWidget._modelPool++}.txt` });
		this._inputModel = this._modelService.getModel(uri) ?? this._modelService.createModel('', null, uri);
		this.inputEditor.setModel(this._inputModel);

		// show/hide placeholder depending on text model being empty
		// content height

		const currentContentHeight = 0;

		this._ctxInputEmpty = CTX_INTERACTIVE_EDITOR_EMPTY.bindTo(this._contextKeyService);
		const togglePlaceholder = () => {
			const hasText = this._inputModel.getValueLength() > 0;
			this._elements.placeholder.classList.toggle('hidden', hasText);
			this._ctxInputEmpty.set(!hasText);

			const contentHeight = this.inputEditor.getContentHeight();
			if (contentHeight !== currentContentHeight && this._lastDim) {
				this._lastDim = this._lastDim.with(undefined, contentHeight);
				this.inputEditor.layout(this._lastDim);
				this._onDidChangeHeight.fire();
			}
		};
		this._store.add(this._inputModel.onDidChangeContent(togglePlaceholder));
		togglePlaceholder();

		this._store.add(addDisposableListener(this._elements.placeholder, 'click', () => this.inputEditor.focus()));


		const toolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.editorToolbar, MENU_INTERACTIVE_EDITOR_WIDGET, {
			telemetrySource: 'interactiveEditorWidget-toolbar',
			toolbarOptions: { primaryGroup: 'main' }
		});
		this._store.add(toolbar);

		this._progressBar = new ProgressBar(this._elements.progress);
		this._store.add(this._progressBar);

		const statusToolbar = this._instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.statusToolbar, MENU_INTERACTIVE_EDITOR_WIDGET_STATUS, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
			actionViewItemProvider: (action, options) => createActionViewItem(this._instantiationService, action, options)
		});

		this._historyStore.add(statusToolbar);

		// preview editor

		this._previewEditor = _instantiationService.createInstance(EmbeddedDiffEditorWidget, this._elements.preview, _previewEditorEditorOptions, parentEditor);
		this._store.add(this._previewEditor);
	}

	dispose(): void {
		this._store.dispose();
		this._historyStore.dispose();
		this._ctxInputEmpty.reset();
	}

	get domNode(): HTMLElement {
		return this._elements.root;
	}

	layout(dim: Dimension) {
		this._isLayouting = true;
		try {
			const innerEditorWidth = dim.width - (getTotalWidth(this._elements.editorToolbar) + 8 /* L/R-padding */);
			dim = new Dimension(innerEditorWidth, dim.height);
			if (!this._lastDim || !Dimension.equals(this._lastDim, dim)) {
				this._lastDim = dim;
				this.inputEditor.layout(new Dimension(innerEditorWidth, this.inputEditor.getContentHeight()));
				this._elements.placeholder.style.width = `${innerEditorWidth  /* input-padding*/}px`;

				const previewDim = new Dimension(dim.width, Math.min(300, Math.max(0, this._previewEditor.getContentHeight())));
				this._previewEditor.layout(previewDim);
				this._elements.preview.style.height = `${previewDim.height}px`;
			}
		} finally {
			this._isLayouting = false;
		}
	}

	getHeight(): number {
		const base = getTotalHeight(this._elements.progress) + getTotalHeight(this._elements.status);
		const editorHeight = this.inputEditor.getContentHeight() + 12 /* padding and border */;
		const previewHeight = this._previewEditor.getModel() ? 12 + Math.min(300, Math.max(0, this._previewEditor.getContentHeight())) : 0;
		return base + editorHeight + previewHeight + 18 /* padding */ + 8 /*shadow*/;
	}

	updateProgress(show: boolean) {
		if (show) {
			this._progressBar.infinite();
		} else {
			this._progressBar.stop();
		}
	}

	getInput(placeholder: string, value: string, token: CancellationToken): Promise<string | undefined> {

		this._elements.placeholder.innerText = placeholder;
		this._elements.placeholder.style.fontSize = `${this.inputEditor.getOption(EditorOption.fontSize)}px`;
		this._elements.placeholder.style.lineHeight = `${this.inputEditor.getOption(EditorOption.lineHeight)}px`;

		this._inputModel.setValue(value);
		this.inputEditor.setSelection(this._inputModel.getFullModelRange());
		this.inputEditor.updateOptions({ ariaLabel: localize('aria-label.N', "Interactive Editor Input: {0}", placeholder) });

		const disposeOnDone = new DisposableStore();

		disposeOnDone.add(this.inputEditor.onDidLayoutChange(() => this._onDidChangeHeight.fire()));
		disposeOnDone.add(this.inputEditor.onDidContentSizeChange(() => this._onDidChangeHeight.fire()));

		const ctxInnerCursorFirst = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST.bindTo(this._contextKeyService);
		const ctxInnerCursorLast = CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST.bindTo(this._contextKeyService);
		const ctxInputEditorFocused = CTX_INTERACTIVE_EDITOR_FOCUSED.bindTo(this._contextKeyService);

		return new Promise<string | undefined>(resolve => {

			this._cancelInput = () => {
				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve(undefined);
				return true;
			};

			this.acceptInput = () => {
				const newValue = this.inputEditor.getModel()!.getValue();
				if (newValue.trim().length === 0) {
					// empty or whitespace only
					this._cancelInput();
					return;
				}

				this.acceptInput = InteractiveEditorWidget._noop;
				this._cancelInput = InteractiveEditorWidget._noop;
				resolve(newValue);
			};

			disposeOnDone.add(token.onCancellationRequested(() => this._cancelInput()));

			// CONTEXT KEYS

			// (1) inner cursor position (last/first line selected)
			const updateInnerCursorFirstLast = () => {
				if (!this.inputEditor.hasModel()) {
					return;
				}
				const { lineNumber } = this.inputEditor.getPosition();
				ctxInnerCursorFirst.set(lineNumber === 1);
				ctxInnerCursorLast.set(lineNumber === this.inputEditor.getModel().getLineCount());
			};
			disposeOnDone.add(this.inputEditor.onDidChangeCursorPosition(updateInnerCursorFirstLast));
			updateInnerCursorFirstLast();

			// (2) input editor focused or not
			const updateFocused = () => {
				const hasFocus = this.inputEditor.hasWidgetFocus();
				ctxInputEditorFocused.set(hasFocus);
				this._elements.content.classList.toggle('synthetic-focus', hasFocus);
			};
			disposeOnDone.add(this.inputEditor.onDidFocusEditorWidget(updateFocused));
			disposeOnDone.add(this.inputEditor.onDidBlurEditorWidget(updateFocused));
			updateFocused();

			this.focus();

		}).finally(() => {
			disposeOnDone.dispose();

			ctxInnerCursorFirst.reset();
			ctxInnerCursorLast.reset();
			ctxInputEditorFocused.reset();
		});
	}

	populateInputField(value: string) {
		this._inputModel.setValue(value.trim());
		this.inputEditor.setSelection(this._inputModel.getFullModelRange());
	}

	updateToolbar(show: boolean) {
		this._elements.statusToolbar.classList.toggle('hidden', !show);
		this._onDidChangeHeight.fire();
	}

	updateMessage(message: string, classes?: string[], resetAfter?: number) {
		const isTempMessage = typeof resetAfter === 'number';
		if (isTempMessage && !this._elements.statusLabel.dataset['state']) {
			const messageNow = this._elements.statusLabel.innerText;
			const classes = Array.from(this._elements.statusLabel.classList.values());
			setTimeout(() => {
				if (messageNow) {
					this.updateMessage(messageNow, classes);
				} else {
					reset(this._elements.statusLabel);
				}
			}, resetAfter);
		}

		this._elements.status.classList.toggle('hidden', false);

		reset(this._elements.statusLabel, message);
		this._elements.statusLabel.className = `label ${(classes ?? []).join(' ')}`;
		if (isTempMessage) {
			this._elements.statusLabel.dataset['state'] = 'temp';
		} else {
			delete this._elements.statusLabel.dataset['state'];
		}
		this._onDidChangeHeight.fire();
	}

	reset() {
		this._ctxInputEmpty.reset();
		reset(this._elements.statusLabel);
		this._elements.statusToolbar.classList.add('hidden');
		this._previewEditor.setModel(null);
		this._previewModel.clear();
		this._elements.root.classList.remove('preview');
		this._onDidChangeHeight.fire();
	}

	focus() {
		this.inputEditor.focus();
	}

	// --- preview

	preview(actualModel: ITextModel, edits: TextEdit[]) {
		this._elements.root.classList.add('preview');

		const pad = 3;
		const unionRange = (ranges: IRange[]) => ranges.reduce((p, c) => Range.plusRange(p, c));

		const languageSelection: ILanguageSelection = { languageId: actualModel.getLanguageId(), onDidChange: Event.None };
		const baseModel = this._modelService.createModel(actualModel.getValue(), languageSelection, undefined, true);

		const originalRange = unionRange(edits.map(edit => edit.range));
		const originalRangePadded = baseModel.validateRange(new Range(originalRange.startLineNumber - pad, 1, originalRange.endLineNumber + pad, 1));
		const originalValue = baseModel.getValueInRange(originalRangePadded);

		const undos = baseModel.applyEdits(edits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)), true);
		const modifiedRange = unionRange(undos.map(undo => undo.range));
		const modifiedRangePadded = baseModel.validateRange(new Range(modifiedRange.startLineNumber - pad, 1, modifiedRange.endLineNumber + pad, 1));
		const modifiedValue = baseModel.getValueInRange(modifiedRangePadded);


		baseModel.dispose();

		const original = this._modelService.createModel(originalValue, languageSelection, baseModel.uri.with({ scheme: 'vscode', query: 'original' }), true);
		const modified = this._modelService.createModel(modifiedValue, languageSelection, baseModel.uri.with({ scheme: 'vscode', query: 'modified' }), true);

		this._previewModel.value = toDisposable(() => {
			original.dispose();
			modified.dispose();
		});

		this._previewEditor.setModel({ original, modified });
		this._onDidChangeHeight.fire();
	}
}

export class InteractiveEditorZoneWidget extends ZoneWidget {

	readonly widget: InteractiveEditorWidget;

	private readonly _ctxVisible: IContextKey<boolean>;
	private readonly _ctxCursorPosition: IContextKey<'above' | 'below' | ''>;
	private _dimension?: Dimension;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor, { showFrame: false, showArrow: false, isAccessible: true, className: 'interactive-editor-widget', keepEditorSelection: true });

		this._ctxVisible = CTX_INTERACTIVE_EDITOR_VISIBLE.bindTo(contextKeyService);
		this._ctxCursorPosition = CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION.bindTo(contextKeyService);

		this._disposables.add(toDisposable(() => {
			this._ctxVisible.reset();
			this._ctxCursorPosition.reset();
		}));

		this.widget = this._instaService.createInstance(InteractiveEditorWidget, this.editor);
		this._disposables.add(this.widget.onDidChangeHeight(() => this._relayout()));
		this._disposables.add(this.widget);
		this.create();


		// todo@jrieken listen ONLY when showing
		const updateCursorIsAboveContextKey = () => {
			if (!this.position || !this.editor.hasModel()) {
				this._ctxCursorPosition.reset();
			} else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('above');
			} else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
				this._ctxCursorPosition.set('below');
			} else {
				this._ctxCursorPosition.reset();
			}
		};
		this._disposables.add(this.editor.onDidChangeCursorPosition(e => updateCursorIsAboveContextKey()));
		this._disposables.add(this.editor.onDidFocusEditorText(e => updateCursorIsAboveContextKey()));
		updateCursorIsAboveContextKey();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this.widget.domNode);
	}

	protected override _onWidth(widthInPixel: number): void {
		if (this._dimension) {
			this._doLayout(this._dimension.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {

		const info = this.editor.getLayoutInfo();
		const spaceLeft = info.lineNumbersWidth + info.glyphMarginWidth + info.decorationsWidth;
		const spaceRight = info.minimap.minimapWidth + info.verticalScrollbarWidth;

		const width = Math.min(640, info.contentWidth - (info.glyphMarginWidth + info.decorationsWidth));
		this._dimension = new Dimension(width, heightInPixel);
		this.widget.domNode.style.marginLeft = `${spaceLeft}px`;
		this.widget.domNode.style.marginRight = `${spaceRight}px`;
		this.widget.domNode.style.width = `${width}px`;
		this.widget.layout(this._dimension);
	}

	private _computeHeightInLines(): number {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		return this.widget.getHeight() / lineHeight;
	}

	protected override _relayout() {
		super._relayout(this._computeHeightInLines());
	}

	async getInput(where: IPosition, placeholder: string, value: string, token: CancellationToken): Promise<string | undefined> {
		assertType(this.editor.hasModel());
		super.show(where, this._computeHeightInLines());
		this._ctxVisible.set(true);

		const task = this.widget.getInput(placeholder, value, token);
		const result = await task;
		return result;
	}

	updatePosition(where: IPosition) {
		// todo@jrieken
		// UGYLY: we need to restore focus because showing the zone removes and adds it and that
		// means we loose focus for a bit
		const hasFocusNow = this.widget.inputEditor.hasWidgetFocus();
		super.show(where, this._computeHeightInLines());
		if (hasFocusNow) {
			this.widget.inputEditor.focus();
		}
	}

	protected override revealRange(_range: Range, _isLastLine: boolean) {
		// disabled
	}

	override hide(): void {
		this._ctxVisible.reset();
		this._ctxCursorPosition.reset();
		this.widget.reset();
		super.hide();
	}
}
