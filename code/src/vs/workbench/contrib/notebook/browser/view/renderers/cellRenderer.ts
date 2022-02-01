/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PixelRatio } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Codicon, CSSIcon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { combinedDisposable, Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as modes from 'vs/editor/common/languages';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { tokenizeLineToHTML } from 'vs/editor/common/languages/textToHtmlTokenizer';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CodeCellLayoutInfo, EXPAND_CELL_OUTPUT_COMMAND_ID, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContextKeyManager } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellContextKeys';
import { CellDecorations } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDecorations';
import { CellDragAndDropController } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellDnd';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { CellExecutionPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellExecution';
import { CellFocusIndicator } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellFocusIndicator';
import { CellProgressBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellProgressBar';
import { CellEditorStatusBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellStatusPart';
import { BetweenCellToolbar, CellTitleToolbarPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellToolbars';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCell';
import { RunToolbar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCellRunToolbar';
import { FoldedCellHint } from 'vs/workbench/contrib/notebook/browser/view/cellParts/foldedCellHint';
import { StatefulMarkdownCell } from 'vs/workbench/contrib/notebook/browser/view/cellParts/markdownCell';
import { BaseCellRenderTemplate, CodeCellRenderTemplate, MarkdownCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const $ = DOM.$;

export class NotebookCellListDelegate extends Disposable implements IListVirtualDelegate<CellViewModel> {
	private readonly lineHeight: number;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.lineHeight = BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.value).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this.lineHeight);
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return element.hasDynamicHeight();
	}

	getDynamicHeight(element: CellViewModel): number | null {
		return element.getDynamicHeight();
	}

	getTemplateId(element: CellViewModel): string {
		if (element.cellKind === CellKind.Markup) {
			return MarkupCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

abstract class AbstractCellRenderer {
	protected readonly editorOptions: CellEditorOptions;

	constructor(
		protected readonly instantiationService: IInstantiationService,
		protected readonly notebookEditor: INotebookEditorDelegate,
		protected readonly contextMenuService: IContextMenuService,
		protected readonly menuService: IMenuService,
		configurationService: IConfigurationService,
		protected readonly keybindingService: IKeybindingService,
		protected readonly notificationService: INotificationService,
		protected readonly contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		language: string,
		protected dndController: CellDragAndDropController | undefined
	) {
		this.editorOptions = new CellEditorOptions(notebookEditor, notebookEditor.notebookOptions, configurationService, language);
	}

	dispose() {
		this.editorOptions.dispose();
		this.dndController = undefined;
	}

	protected commonRenderTemplate(templateData: BaseCellRenderTemplate): void {
		templateData.templateDisposables.add(DOM.addDisposableListener(templateData.container, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell) {
				this.notebookEditor.focusElement(templateData.currentRenderedCell);
			}
		}, true));
	}

	protected commonRenderElement(element: ICellViewModel, templateData: BaseCellRenderTemplate): void {
		this.dndController?.renderElement(element, templateData);
		templateData.elementDisposables.add(new CellDecorations(templateData.rootContainer, templateData.decorationContainer, element));
		templateData.elementDisposables.add(templateData.instantiationService.createInstance(CellContextKeyManager, this.notebookEditor, element));
	}
}

export class MarkupCellRenderer extends AbstractCellRenderer implements IListRenderer<MarkupCellViewModel, MarkdownCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';

	constructor(
		notebookEditor: INotebookEditorDelegate,
		dndController: CellDragAndDropController,
		private renderedEditors: Map<ICellViewModel, ICodeEditor>,
		contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'markdown', dndController);
	}

	get templateId() {
		return MarkupCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): MarkdownCellRenderTemplate {
		rootContainer.classList.add('markdown-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const templateDisposables = new DisposableStore();
		const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));

		const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
		const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));
		const foldingIndicator = DOM.append(focusIndicatorLeft.domNode, DOM.$('.notebook-folding-indicator'));
		const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));

		const codeInnerContent = DOM.append(container, $('.cell.code'));
		const editorPart = DOM.append(codeInnerContent, $('.cell-editor-part'));
		const cellInputCollapsedContainer = DOM.append(codeInnerContent, $('.input-collapse-container'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		editorPart.style.display = 'none';

		const innerContent = DOM.append(container, $('.cell.markdown'));
		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));

		const scopedInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		const rootClassDelegate = {
			toggle: (className: string, force?: boolean) => container.classList.toggle(className, force)
		};
		const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
			CellTitleToolbarPart,
			titleToolbarContainer,
			rootClassDelegate,
			this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
			this.notebookEditor));
		const betweenCellToolbar = templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellContainer));
		const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));
		const statusBar = templateDisposables.add(this.instantiationService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart));
		const foldedCellHint = templateDisposables.add(scopedInstaService.createInstance(FoldedCellHint, this.notebookEditor, DOM.append(container, $('.notebook-folded-hint'))));

		const templateData: MarkdownCellRenderTemplate = {
			rootContainer,
			cellInputCollapsedContainer,
			instantiationService: scopedInstaService,
			container,
			decorationContainer,
			cellContainer: innerContent,
			editorPart,
			editorContainer,
			focusIndicator: new CellFocusIndicator(this.notebookEditor, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom),
			foldingIndicator,
			templateDisposables,
			elementDisposables: new DisposableStore(),
			betweenCellToolbar,
			titleToolbar,
			statusBar,
			foldedCellHint,
			toJSON: () => { return {}; }
		};

		this.commonRenderTemplate(templateData);

		return templateData;
	}

	renderElement(element: MarkupCellViewModel, index: number, templateData: MarkdownCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		this.commonRenderElement(element, templateData);

		templateData.currentRenderedCell = element;
		templateData.currentEditor = undefined;
		templateData.editorPart.style.display = 'none';
		templateData.cellContainer.innerText = '';

		if (height === undefined) {
			return;
		}

		templateData.elementDisposables.add(templateData.instantiationService.createInstance(StatefulMarkdownCell, this.notebookEditor, element, templateData, [
			templateData.betweenCellToolbar,
			templateData.titleToolbar,
			templateData.statusBar,
			templateData.focusIndicator,
			templateData.foldedCellHint
		], this.renderedEditors));
	}

	disposeTemplate(templateData: MarkdownCellRenderTemplate): void {
		templateData.templateDisposables.clear();
	}

	disposeElement(_element: ICellViewModel, _index: number, templateData: MarkdownCellRenderTemplate): void {
		templateData.elementDisposables.clear();
	}
}

class EditorTextRenderer {

	private static _ttPolicy = window.trustedTypes?.createPolicy('cellRendererEditorText', {
		createHTML(input) { return input; }
	});

	getRichText(editor: ICodeEditor, modelRange: Range): HTMLElement | null {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		const colorMap = this.getDefaultColorMap();
		const fontInfo = editor.getOptions().get(EditorOption.fontInfo);
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';

		const style = ``
			+ `color: ${colorMap[modes.ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[modes.ColorId.DefaultBackground]};`
			+ `font-family: var(${fontFamilyVar});`
			+ `font-weight: var(${fontWeightVar});`
			+ `font-size: var(${fontSizeVar});`
			+ `line-height: ${fontInfo.lineHeight}px;`
			+ `white-space: pre;`;

		const element = DOM.$('div', { style });

		const fontSize = fontInfo.fontSize;
		const fontWeight = fontInfo.fontWeight;
		element.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		element.style.setProperty(fontSizeVar, `${fontSize}px`);
		element.style.setProperty(fontWeightVar, fontWeight);

		const linesHtml = this.getRichTextLinesAsHtml(model, modelRange, colorMap);
		element.innerHTML = linesHtml as string;
		return element;
	}

	private getRichTextLinesAsHtml(model: ITextModel, modelRange: Range, colorMap: string[]): string | TrustedHTML {
		const startLineNumber = modelRange.startLineNumber;
		const startColumn = modelRange.startColumn;
		const endLineNumber = modelRange.endLineNumber;
		const endColumn = modelRange.endColumn;

		const tabSize = model.getOptions().tabSize;

		let result = '';

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineTokens = model.getLineTokens(lineNumber);
			const lineContent = lineTokens.getLineContent();
			const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
			const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);

			if (lineContent === '') {
				result += '<br>';
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
			}
		}

		return EditorTextRenderer._ttPolicy?.createHTML(result) ?? result;
	}

	private getDefaultColorMap(): string[] {
		const colorMap = modes.TokenizationRegistry.getColorMap();
		const result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}
}

class CodeCellDragImageRenderer {
	getDragImage(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement {
		let dragImage = this.getDragImageImpl(templateData, editor, type);
		if (!dragImage) {
			// TODO@roblourens I don't think this can happen
			dragImage = document.createElement('div');
			dragImage.textContent = '1 cell';
		}

		return dragImage;
	}

	private getDragImageImpl(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement | null {
		const dragImageContainer = templateData.container.cloneNode(true) as HTMLElement;
		dragImageContainer.classList.forEach(c => dragImageContainer.classList.remove(c));
		dragImageContainer.classList.add('cell-drag-image', 'monaco-list-row', 'focused', `${type}-cell-row`);

		const editorContainer: HTMLElement | null = dragImageContainer.querySelector('.cell-editor-container');
		if (!editorContainer) {
			return null;
		}

		const richEditorText = new EditorTextRenderer().getRichText(editor, new Range(1, 1, 1, 1000));
		if (!richEditorText) {
			return null;
		}
		DOM.reset(editorContainer, richEditorText);

		return dragImageContainer;
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CodeCellViewModel, CodeCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';

	constructor(
		notebookEditor: INotebookEditorDelegate,
		private renderedEditors: Map<ICellViewModel, ICodeEditor>,
		dndController: CellDragAndDropController,
		contextKeyServiceProvider: (container: HTMLElement) => IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, menuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, PLAINTEXT_LANGUAGE_ID, dndController);
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(rootContainer: HTMLElement): CodeCellRenderTemplate {
		rootContainer.classList.add('code-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const templateDisposables = new DisposableStore();
		const contextKeyService = templateDisposables.add(this.contextKeyServiceProvider(container));
		const decorationContainer = DOM.append(rootContainer, $('.cell-decoration'));
		const focusIndicatorTop = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-top')));
		const titleToolbarContainer = DOM.append(container, $('.cell-title-toolbar'));
		const focusIndicatorLeft = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left')));

		const cellContainer = DOM.append(container, $('.cell.code'));
		const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
		const cellInputCollapsedContainer = DOM.append(cellContainer, $('.input-collapse-container'));

		const runToolbar = templateDisposables.add(this.instantiationService.createInstance(RunToolbar, this.notebookEditor, contextKeyService, container, runButtonContainer));
		const executionOrderLabel = DOM.append(cellContainer, $('div.execution-count-label'));
		executionOrderLabel.title = localize('cellExecutionOrderCountLabel', 'Execution Order');

		const editorPart = DOM.append(cellContainer, $('.cell-editor-part'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));

		// create a special context key service that set the inCompositeEditor-contextkey
		const editorContextKeyService = templateDisposables.add(this.contextKeyServiceProvider(editorPart));
		const editorInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);

		const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions.getDefaultValue(),
			dimension: {
				width: 0,
				height: 0
			},
			// overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
		}, {
			contributions: this.notebookEditor.creationOptions.cellEditorContributions
		});

		templateDisposables.add(editor);

		const progressBar = templateDisposables.add(this.instantiationService.createInstance(CellProgressBar, editorPart, cellInputCollapsedContainer));

		const statusBar = templateDisposables.add(this.instantiationService.createInstance(CellEditorStatusBar, this.notebookEditor, container, editorPart));

		const outputContainer = new FastDomNode(DOM.append(container, $('.output')));
		const cellOutputCollapsedContainer = DOM.append(outputContainer.domNode, $('.output-collapse-container'));
		const outputShowMoreContainer = new FastDomNode(DOM.append(container, $('.output-show-more-container')));

		const focusIndicatorRight = new FastDomNode(DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-right')));

		const focusSinkElement = DOM.append(container, $('.cell-editor-focus-sink'));
		focusSinkElement.setAttribute('tabindex', '0');
		const bottomCellToolbarContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));
		const focusIndicatorBottom = new FastDomNode(DOM.append(container, $('.cell-focus-indicator.cell-focus-indicator-bottom')));

		const scopedInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]));
		const rootClassDelegate = {
			toggle: (className: string, force?: boolean) => container.classList.toggle(className, force)
		};
		const titleToolbar = templateDisposables.add(scopedInstaService.createInstance(
			CellTitleToolbarPart,
			titleToolbarContainer,
			rootClassDelegate,
			this.notebookEditor.creationOptions.menuIds.cellTitleToolbar,
			this.notebookEditor));
		const betweenCellToolbar = templateDisposables.add(scopedInstaService.createInstance(BetweenCellToolbar, this.notebookEditor, titleToolbarContainer, bottomCellToolbarContainer));

		const templateData: CodeCellRenderTemplate = {
			rootContainer,
			editorPart,
			cellInputCollapsedContainer,
			cellOutputCollapsedContainer,
			instantiationService: scopedInstaService,
			container,
			decorationContainer,
			cellContainer,
			progressBar,
			statusBar,
			focusIndicator: new CellFocusIndicator(this.notebookEditor, focusIndicatorTop, focusIndicatorLeft, focusIndicatorRight, focusIndicatorBottom),
			cellExecution: new CellExecutionPart(this.notebookEditor, executionOrderLabel),
			titleToolbar,
			betweenCellToolbar,
			focusSinkElement,
			runToolbar,
			outputContainer,
			outputShowMoreContainer,
			editor,
			templateDisposables,
			elementDisposables: new DisposableStore(),
			toJSON: () => { return {}; }
		};

		this.setupOutputCollapsedPart(templateData);

		this.dndController?.registerDragHandle(templateData, rootContainer, focusIndicatorLeft.domNode, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, 'code'));

		templateDisposables.add(this.addCollapseClickCollapseHandler(templateData));
		templateDisposables.add(DOM.addDisposableListener(focusSinkElement, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell && (templateData.currentRenderedCell as CodeCellViewModel).outputsViewModels.length) {
				this.notebookEditor.focusNotebookCell(templateData.currentRenderedCell, 'output');
			}
		}));

		templateData.cellExecution.setup(templateData);
		this.commonRenderTemplate(templateData);

		return templateData;
	}

	private setupOutputCollapsedPart(templateData: CodeCellRenderTemplate) {
		const cellOutputCollapseContainer = templateData.cellOutputCollapsedContainer;
		const placeholder = DOM.append(cellOutputCollapseContainer, $('span.expandOutputPlaceholder')) as HTMLElement;
		placeholder.textContent = localize('cellOutputsCollapsedMsg', "Outputs are collapsed");
		const expandIcon = DOM.append(cellOutputCollapseContainer, $('span.expandOutputIcon'));
		expandIcon.classList.add(...CSSIcon.asClassNameArray(Codicon.more));

		const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_OUTPUT_COMMAND_ID);
		if (keybinding) {
			placeholder.title = localize('cellExpandOutputButtonLabelWithDoubleClick', "Double click to expand cell output ({0})", keybinding.getLabel());
			cellOutputCollapseContainer.title = localize('cellExpandOutputButtonLabel', "Expand Cell Output (${0})", keybinding.getLabel());
		}

		DOM.hide(cellOutputCollapseContainer);

		const expand = () => {
			if (!templateData.currentRenderedCell) {
				return;
			}

			const textModel = this.notebookEditor.textModel!;
			const index = textModel.cells.indexOf(templateData.currentRenderedCell.model);

			if (index < 0) {
				return;
			}

			templateData.currentRenderedCell.isOutputCollapsed = !templateData.currentRenderedCell.isOutputCollapsed;
		};

		templateData.templateDisposables.add(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => {
			expand();
		}));

		templateData.templateDisposables.add(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => {
			expand();
		}));
	}

	private addCollapseClickCollapseHandler(templateData: CodeCellRenderTemplate): IDisposable {
		const dragHandleListener = DOM.addDisposableListener(templateData.focusIndicator.left.domNode, DOM.EventType.DBLCLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell || !this.notebookEditor.hasModel()) {
				return;
			}

			const clickedOnInput = e.offsetY < (cell.layoutInfo as CodeCellLayoutInfo).outputContainerOffset;
			if (clickedOnInput) {
				cell.isInputCollapsed = !cell.isInputCollapsed;
			} else {
				cell.isOutputCollapsed = !cell.isOutputCollapsed;
			}
		});

		const collapsedPartListener = DOM.addDisposableListener(templateData.cellInputCollapsedContainer, DOM.EventType.DBLCLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell || !this.notebookEditor.hasModel()) {
				return;
			}

			if (cell.isInputCollapsed) {
				cell.isInputCollapsed = false;
			} else {
				cell.isOutputCollapsed = false;
			}
		});

		const clickHandler = DOM.addDisposableListener(templateData.cellInputCollapsedContainer, DOM.EventType.CLICK, e => {
			const cell = templateData.currentRenderedCell;
			if (!cell || !this.notebookEditor.hasModel()) {
				return;
			}

			const element = e.target as HTMLElement;

			if (element && element.classList && element.classList.contains('expandInputIcon')) {
				// clicked on the expand icon
				cell.isInputCollapsed = false;
			}
		});

		return combinedDisposable(dragHandleListener, collapsedPartListener, clickHandler);
	}

	renderElement(element: CodeCellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		if (!this.notebookEditor.hasModel()) {
			throw new Error('The notebook editor is not attached with view model yet.');
		}

		this.commonRenderElement(element, templateData);

		templateData.currentRenderedCell = element;

		if (height === undefined) {
			return;
		}

		templateData.outputContainer.domNode.innerText = '';
		templateData.outputContainer.domNode.appendChild(templateData.cellOutputCollapsedContainer);

		const elementDisposables = templateData.elementDisposables;

		const codeCellView = elementDisposables.add(templateData.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData, [
			templateData.focusIndicator,
			templateData.betweenCellToolbar,
			templateData.statusBar,
			templateData.progressBar,
			templateData.titleToolbar,
			templateData.runToolbar,
			templateData.cellExecution
		]));

		this.renderedEditors.set(element, templateData.editor);

		this.updateFocusIndicatorsForTitleMenuAndSubscribe(element, templateData, codeCellView);
	}

	updateFocusIndicatorsForTitleMenuAndSubscribe(element: CodeCellViewModel, templateData: CodeCellRenderTemplate, codeCellView: CodeCell) {
		// todo@rebornix, consolidate duplicated requests in next frame
		templateData.elementDisposables.add(DOM.scheduleAtNextAnimationFrame(() => {
			this.updateFocusIndicatorsForTitleMenu(templateData);
		}));

		templateData.elementDisposables.add(element.onDidChangeLayout(() => {
			templateData.elementDisposables.add(DOM.scheduleAtNextAnimationFrame(() => {
				this.updateFocusIndicatorsForTitleMenu(templateData);
			}));
		}));

		templateData.elementDisposables.add(templateData.titleToolbar.onDidUpdateActions(() => {
			this.updateFocusIndicatorsForTitleMenu(templateData);
		}));
	}

	private updateFocusIndicatorsForTitleMenu(templateData: CodeCellRenderTemplate): void {
		const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
		if (templateData.titleToolbar.hasActions) {
			templateData.focusIndicator.left.domNode.style.transform = `translateY(${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px)`;
			templateData.focusIndicator.right.domNode.style.transform = `translateY(${layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin}px)`;
		} else {
			templateData.focusIndicator.left.domNode.style.transform = `translateY(${layoutInfo.cellTopMargin}px)`;
			templateData.focusIndicator.right.domNode.style.transform = `translateY(${layoutInfo.cellTopMargin}px)`;
		}
	}

	disposeTemplate(templateData: CodeCellRenderTemplate): void {
		templateData.templateDisposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		this.renderedEditors.delete(element);
	}
}
