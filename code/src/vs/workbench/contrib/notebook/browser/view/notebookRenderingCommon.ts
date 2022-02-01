/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IListContextMenuEvent, IListEvent, IListMouseEvent } from 'vs/base/browser/ui/list/list';
import { IListOptions, IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICellOutputViewModel, ICellViewModel, IGenericCellViewModel, INotebookCellOutputLayoutInfo, INotebookEditorCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellExecutionPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellExecution';
import { CellFocusIndicator } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellFocusIndicator';
import { CellProgressBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellProgressBar';
import { CellEditorStatusBar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellStatusPart';
import { BetweenCellToolbar, CellTitleToolbarPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellToolbars';
import { RunToolbar } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCellRunToolbar';
import { FoldedCellHint } from 'vs/workbench/contrib/notebook/browser/view/cellParts/foldedCellHint';
import { CellViewModel, NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

export interface INotebookCellList {
	isDisposed: boolean;
	viewModel: NotebookViewModel | null;
	webviewElement: FastDomNode<HTMLElement> | null;
	readonly contextKeyService: IContextKeyService;
	element(index: number): ICellViewModel | undefined;
	elementAt(position: number): ICellViewModel | undefined;
	elementHeight(element: ICellViewModel): number;
	onWillScroll: Event<ScrollEvent>;
	onDidScroll: Event<ScrollEvent>;
	onDidChangeFocus: Event<IListEvent<ICellViewModel>>;
	onDidChangeContentHeight: Event<number>;
	onDidChangeVisibleRanges: Event<void>;
	visibleRanges: ICellRange[];
	scrollTop: number;
	scrollHeight: number;
	scrollLeft: number;
	length: number;
	rowsContainer: HTMLElement;
	readonly onDidRemoveOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidHideOutputs: Event<readonly ICellOutputViewModel[]>;
	readonly onDidRemoveCellsFromView: Event<readonly ICellViewModel[]>;
	readonly onMouseUp: Event<IListMouseEvent<CellViewModel>>;
	readonly onMouseDown: Event<IListMouseEvent<CellViewModel>>;
	readonly onContextMenu: Event<IListContextMenuEvent<CellViewModel>>;
	detachViewModel(): void;
	attachViewModel(viewModel: NotebookViewModel): void;
	attachWebview(element: HTMLElement): void;
	clear(): void;
	getViewIndex(cell: ICellViewModel): number | undefined;
	getViewIndex2(modelIndex: number): number | undefined;
	getModelIndex(cell: CellViewModel): number | undefined;
	getModelIndex2(viewIndex: number): number | undefined;
	getVisibleRangesPlusViewportBelow(): ICellRange[];
	focusElement(element: ICellViewModel): void;
	selectElements(elements: ICellViewModel[]): void;
	getFocusedElements(): ICellViewModel[];
	getSelectedElements(): ICellViewModel[];
	revealElementsInView(range: ICellRange): void;
	isScrolledToBottom(): boolean;
	scrollToBottom(): void;
	revealElementInView(element: ICellViewModel): void;
	revealElementInViewAtTop(element: ICellViewModel): void;
	revealElementInCenterIfOutsideViewport(element: ICellViewModel): void;
	revealElementInCenter(element: ICellViewModel): void;
	revealElementInCenterIfOutsideViewportAsync(element: ICellViewModel): Promise<void>;
	revealElementLineInViewAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementLineInCenterAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementLineInCenterIfOutsideViewportAsync(element: ICellViewModel, line: number): Promise<void>;
	revealElementRangeInViewAsync(element: ICellViewModel, range: Range): Promise<void>;
	revealElementRangeInCenterAsync(element: ICellViewModel, range: Range): Promise<void>;
	revealElementRangeInCenterIfOutsideViewportAsync(element: ICellViewModel, range: Range): Promise<void>;
	revealElementOffsetInCenterAsync(element: ICellViewModel, offset: number): Promise<void>;
	setHiddenAreas(_ranges: ICellRange[], triggerViewUpdate: boolean): boolean;
	domElementOfElement(element: ICellViewModel): HTMLElement | null;
	focusView(): void;
	getAbsoluteTopOfElement(element: ICellViewModel): number;
	triggerScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent): void;
	updateElementHeight2(element: ICellViewModel, size: number): void;
	domFocus(): void;
	focusContainer(): void;
	setCellSelection(element: ICellViewModel, range: Range): void;
	style(styles: IListStyles): void;
	getRenderHeight(): number;
	updateOptions(options: IListOptions<ICellViewModel>): void;
	layout(height?: number, width?: number): void;
	dispose(): void;
}

export interface BaseCellRenderTemplate {
	rootContainer: HTMLElement;
	editorPart: HTMLElement;
	cellInputCollapsedContainer: HTMLElement;
	instantiationService: IInstantiationService;
	container: HTMLElement;
	cellContainer: HTMLElement;
	decorationContainer: HTMLElement;
	betweenCellToolbar: BetweenCellToolbar;
	titleToolbar: CellTitleToolbarPart;
	focusIndicator: CellFocusIndicator;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentRenderedCell?: ICellViewModel;
	statusBar: CellEditorStatusBar;
	toJSON: () => object;
}

export interface MarkdownCellRenderTemplate extends BaseCellRenderTemplate {
	editorContainer: HTMLElement;
	foldingIndicator: HTMLElement;
	foldedCellHint: FoldedCellHint;
	currentEditor?: ICodeEditor;
}

export interface CodeCellRenderTemplate extends BaseCellRenderTemplate {
	runToolbar: RunToolbar;
	outputContainer: FastDomNode<HTMLElement>;
	cellOutputCollapsedContainer: HTMLElement;
	outputShowMoreContainer: FastDomNode<HTMLElement>;
	focusSinkElement: HTMLElement;
	editor: ICodeEditor;
	progressBar: CellProgressBar;
	cellExecution: CellExecutionPart;
}

export function isCodeCellRenderTemplate(templateData: BaseCellRenderTemplate): templateData is CodeCellRenderTemplate {
	return !!(templateData as CodeCellRenderTemplate).runToolbar;
}

/**
 * Notebook Editor Delegate for output rendering
 */
export interface INotebookDelegateForOutput {
	readonly creationOptions: INotebookEditorCreationOptions;
	getCellOutputLayoutInfo(cell: IGenericCellViewModel): INotebookCellOutputLayoutInfo;
}
