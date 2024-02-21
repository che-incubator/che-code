/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { findFirstMaxBy } from 'vs/base/common/arraysFind';
import { Disposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, autorun, autorunWithStore, derived, derivedObservableWithCache, derivedWithStore, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { ITransaction, disposableObservableValue, globalTransaction, transaction } from 'vs/base/common/observableInternal/base';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./style';
import { ObservableElementSizeObserver } from 'vs/editor/browser/widget/diffEditor/utils';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DiffEditorItemTemplate, TemplateData } from './diffEditorItemTemplate';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from './multiDiffEditorViewModel';
import { ObjectPool } from './objectPool';
import { ContextKeyValue, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffEditor } from 'vs/editor/common/editorCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Range } from 'vs/editor/common/core/range';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';

export class MultiDiffEditorWidgetImpl extends Disposable {
	private readonly _elements = h('div.monaco-component.multiDiffEditor', [
		h('div@content', {
			style: {
				overflow: 'hidden',
			}
		}),
		h('div.monaco-editor@overflowWidgetsDomNode', {
		}),
	]);

	private readonly _sizeObserver = this._register(new ObservableElementSizeObserver(this._element, undefined));

	private readonly _objectPool = this._register(new ObjectPool<TemplateData, DiffEditorItemTemplate>((data) => {
		const template = this._instantiationService.createInstance(
			DiffEditorItemTemplate,
			this._elements.content,
			this._elements.overflowWidgetsDomNode,
			this._workbenchUIElementFactory
		);
		template.setData(data);
		return template;
	}));

	private readonly _scrollable = this._register(new Scrollable({
		forceIntegerValues: false,
		scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
		smoothScrollDuration: 100,
	}));

	private readonly _scrollableElement = this._register(new SmoothScrollableElement(this._elements.root, {
		vertical: ScrollbarVisibility.Auto,
		horizontal: ScrollbarVisibility.Auto,
		useShadows: false,
	}, this._scrollable));

	public readonly scrollTop = observableFromEvent(this._scrollableElement.onScroll, () => /** @description scrollTop */ this._scrollableElement.getScrollPosition().scrollTop);
	public readonly scrollLeft = observableFromEvent(this._scrollableElement.onScroll, () => /** @description scrollLeft */ this._scrollableElement.getScrollPosition().scrollLeft);

	private readonly _viewItems = derivedWithStore<readonly VirtualizedViewItem[]>(this,
		(reader, store) => {
			const vm = this._viewModel.read(reader);
			if (!vm) {
				return [];
			}
			const items = vm.items.read(reader);
			return items.map(d => {
				const item = store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft));
				const data = this._lastDocStates?.[item.getKey()];
				if (data) {
					transaction(tx => {
						item.setViewState(data, tx);
					});
				}
				return item;
			});
		}
	);

	private readonly _spaceBetweenPx = 0;

	private readonly _totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader) + this._spaceBetweenPx, 0));
	public readonly activeDiffItem = derived(this, reader => this._viewItems.read(reader).find(i => i.template.read(reader)?.isFocused.read(reader)));
	public readonly lastActiveDiffItem = derivedObservableWithCache<VirtualizedViewItem | undefined>((reader, lastValue) => this.activeDiffItem.read(reader) ?? lastValue);
	public readonly activeControl = derived(this, reader => this.lastActiveDiffItem.read(reader)?.template.read(reader)?.editor);

	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
	private readonly _instantiationService = this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	);

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _viewModel: IObservable<MultiDiffEditorViewModel | undefined>,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);

		this._register(autorunWithStore((reader, store) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel && viewModel.contextKeys) {
				for (const [key, value] of Object.entries(viewModel.contextKeys)) {
					const contextKey = this._contextKeyService.createKey<ContextKeyValue>(key, undefined);
					contextKey.set(value);
					store.add(toDisposable(() => contextKey.reset()));
				}
			}
		}));

		const ctxAllCollapsed = this._parentContextKeyService.createKey<boolean>(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
		this._register(autorun((reader) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel) {
				const allCollapsed = viewModel.items.read(reader).every(item => item.collapsed.read(reader));
				ctxAllCollapsed.set(allCollapsed);
			}
		}));

		this._register(autorun((reader) => {
			const lastActiveDiffItem = this.lastActiveDiffItem.read(reader);
			transaction(tx => {
				this._viewModel.read(reader)?.activeDiffItem.set(lastActiveDiffItem?.viewModel, tx);
			});
		}));

		this._register(autorun((reader) => {
			/** @description Update widget dimension */
			const dimension = this._dimension.read(reader);
			this._sizeObserver.observe(dimension);
		}));

		this._elements.content.style.position = 'relative';

		this._register(autorun((reader) => {
			/** @description Update scroll dimensions */
			const height = this._sizeObserver.height.read(reader);
			this._elements.root.style.height = `${height}px`;
			const totalHeight = this._totalHeight.read(reader);
			this._elements.content.style.height = `${totalHeight}px`;

			const width = this._sizeObserver.width.read(reader);

			let scrollWidth = width;
			const viewItems = this._viewItems.read(reader);
			const max = findFirstMaxBy(viewItems, i => i.maxScroll.read(reader).maxScroll);
			if (max) {
				const maxScroll = max.maxScroll.read(reader);
				scrollWidth = width + maxScroll.maxScroll;
			}

			this._scrollableElement.setScrollDimensions({
				width: width,
				height: height,
				scrollHeight: totalHeight,
				scrollWidth,
			});
		}));

		_element.replaceChildren(this._scrollableElement.getDomNode());
		this._register(toDisposable(() => {
			_element.replaceChildren();
		}));

		this._register(this._register(autorun(reader => {
			/** @description Render all */
			globalTransaction(tx => {
				this.render(reader);
			});
		})));
	}

	public setScrollState(scrollState: { top?: number; left?: number }): void {
		this._scrollableElement.setScrollPosition({ scrollLeft: scrollState.left, scrollTop: scrollState.top });
	}

	// todo@aiday-mar need to reveal the range instead of just the start line number
	public reveal(resource: IMultiDiffResource, range: Range): void {
		const viewItems = this._viewItems.get();
		let searchCallback: (item: VirtualizedViewItem) => boolean;
		if ('original' in resource) {
			searchCallback = (item) => item.viewModel.originalUri?.toString() === resource.original.toString();
		} else {
			searchCallback = (item) => item.viewModel.modifiedUri?.toString() === resource.modified.toString();
		}
		const index = viewItems.findIndex(searchCallback);
		let scrollTop = (range.startLineNumber - 1) * this._configurationService.getValue<number>('editor.lineHeight');
		for (let i = 0; i < index; i++) {
			scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx;
		}
		this._scrollableElement.setScrollPosition({ scrollTop });
	}

	public getViewState(): IMultiDiffEditorViewState {
		return {
			scrollState: {
				top: this.scrollTop.get(),
				left: this.scrollLeft.get(),
			},
			docStates: Object.fromEntries(this._viewItems.get().map(i => [i.getKey(), i.getViewState()])),
		};
	}

	/** This accounts for documents that are not loaded yet. */
	private _lastDocStates: IMultiDiffEditorViewState['docStates'] = {};

	public setViewState(viewState: IMultiDiffEditorViewState): void {
		this.setScrollState(viewState.scrollState);

		this._lastDocStates = viewState.docStates;

		transaction(tx => {
			/** setViewState */
			if (viewState.docStates) {
				for (const i of this._viewItems.get()) {
					const state = viewState.docStates[i.getKey()];
					if (state) {
						i.setViewState(state, tx);
					}
				}
			}
		});
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		const item = this._viewItems.get().find(v =>
			v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
			|| v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
		);
		const editor = item?.template.get()?.editor;
		if (!editor) {
			return undefined;
		}
		if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
			return { diffEditor: editor, editor: editor.getModifiedEditor() };
		} else {
			return { diffEditor: editor, editor: editor.getOriginalEditor() };
		}
	}

	private render(reader: IReader | undefined) {
		const scrollTop = this.scrollTop.read(reader);
		let contentScrollOffsetToScrollOffset = 0;
		let itemHeightSumBefore = 0;
		let itemContentHeightSumBefore = 0;
		const viewPortHeight = this._sizeObserver.height.read(reader);
		const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);

		const width = this._sizeObserver.width.read(reader);

		for (const v of this._viewItems.read(reader)) {
			const itemContentHeight = v.contentHeight.read(reader);
			const itemHeight = Math.min(itemContentHeight, viewPortHeight);
			const itemRange = OffsetRange.ofStartAndLength(itemHeightSumBefore, itemHeight);
			const itemContentRange = OffsetRange.ofStartAndLength(itemContentHeightSumBefore, itemContentHeight);

			if (itemContentRange.isBefore(contentViewPort)) {
				contentScrollOffsetToScrollOffset -= itemContentHeight - itemHeight;
				v.hide();
			} else if (itemContentRange.isAfter(contentViewPort)) {
				v.hide();
			} else {
				const scroll = Math.max(0, Math.min(contentViewPort.start - itemContentRange.start, itemContentHeight - itemHeight));
				contentScrollOffsetToScrollOffset -= scroll;
				const viewPort = OffsetRange.ofStartAndLength(scrollTop + contentScrollOffsetToScrollOffset, viewPortHeight);
				v.render(itemRange, scroll, width, viewPort);
			}

			itemHeightSumBefore += itemHeight + this._spaceBetweenPx;
			itemContentHeightSumBefore += itemContentHeight + this._spaceBetweenPx;
		}

		this._elements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
	}
}

export interface IMultiDiffEditorViewState {
	scrollState: { top: number; left: number };
	docStates?: Record<string, IMultiDiffDocState>;
}

interface IMultiDiffDocState {
	collapsed: boolean;
	selections?: ISelection[];
}

export interface IMultiDiffEditorOptions extends ITextEditorOptions {
	viewState?: IMultiDiffEditorOptionsViewState;
}

export interface IMultiDiffEditorOptionsViewState {
	revealData?: {
		resource: IMultiDiffResource;
		range: Range;
	};
}

export type IMultiDiffResource = { original: URI } | { modified: URI };

class VirtualizedViewItem extends Disposable {
	private readonly _templateRef = this._register(disposableObservableValue<IReference<DiffEditorItemTemplate> | undefined>(this, undefined));

	public readonly contentHeight = derived(this, reader =>
		this._templateRef.read(reader)?.object.contentHeight?.read(reader) ?? this.viewModel.lastTemplateData.read(reader).contentHeight
	);

	public readonly maxScroll = derived(this, reader => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? { maxScroll: 0, scrollWidth: 0 });

	public readonly template = derived(this, reader => this._templateRef.read(reader)?.object);
	private _isHidden = observableValue(this, false);

	constructor(
		public readonly viewModel: DocumentDiffItemViewModel,
		private readonly _objectPool: ObjectPool<TemplateData, DiffEditorItemTemplate>,
		private readonly _scrollLeft: IObservable<number>,
	) {
		super();

		this._register(autorun((reader) => {
			const scrollLeft = this._scrollLeft.read(reader);
			this._templateRef.read(reader)?.object.setScrollLeft(scrollLeft);
		}));

		this._register(autorun(reader => {
			const ref = this._templateRef.read(reader);
			if (!ref) { return; }
			const isHidden = this._isHidden.read(reader);
			if (!isHidden) { return; }

			const isFocused = ref.object.isFocused.read(reader);
			if (isFocused) { return; }

			this._clear();
		}));
	}

	override dispose(): void {
		this._clear();
		super.dispose();
	}

	public override toString(): string {
		return `VirtualViewItem(${this.viewModel.entry.value!.modified?.uri.toString()})`;
	}

	public getKey(): string {
		return this.viewModel.getKey();
	}

	public getViewState(): IMultiDiffDocState {
		transaction(tx => {
			this._updateTemplateData(tx);
		});
		return {
			collapsed: this.viewModel.collapsed.get(),
			selections: this.viewModel.lastTemplateData.get().selections,
		};
	}

	public setViewState(viewState: IMultiDiffDocState, tx: ITransaction): void {
		this.viewModel.collapsed.set(viewState.collapsed, tx);

		this._updateTemplateData(tx);
		const data = this.viewModel.lastTemplateData.get();
		const selections = viewState.selections?.map(Selection.liftSelection);
		this.viewModel.lastTemplateData.set({
			...data,
			selections,
		}, tx);
		const ref = this._templateRef.get();
		if (ref) {
			if (selections) {
				ref.object.editor.setSelections(selections);
			}
		}
	}

	private _updateTemplateData(tx: ITransaction): void {
		const ref = this._templateRef.get();
		if (!ref) { return; }
		this.viewModel.lastTemplateData.set({
			contentHeight: ref.object.contentHeight.get(),
			selections: ref.object.editor.getSelections() ?? undefined,
		}, tx);
	}

	private _clear(): void {
		const ref = this._templateRef.get();
		if (!ref) { return; }
		transaction(tx => {
			this._updateTemplateData(tx);
			ref.object.hide();
			this._templateRef.set(undefined, tx);
		});
	}

	public hide(): void {
		this._isHidden.set(true, undefined);
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number, viewPort: OffsetRange): void {
		this._isHidden.set(false, undefined);

		let ref = this._templateRef.get();
		if (!ref) {
			ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel));
			this._templateRef.set(ref, undefined);

			const selections = this.viewModel.lastTemplateData.get().selections;
			if (selections) {
				ref.object.editor.setSelections(selections);
			}
		}
		ref.object.render(verticalSpace, width, offset, viewPort);
	}
}
