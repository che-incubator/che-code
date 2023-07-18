/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, h } from 'vs/base/browser/dom';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';
import { findLast } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { IObservable, autorun, derived, keepAlive, observableValue } from 'vs/base/common/observable';
import { autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { derivedWithStore } from 'vs/base/common/observableImpl/derived';
import 'vs/css!./style';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor, IDiffEditor, IDiffEditorConstructionOptions, IMouseTargetViewZone } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry, IDiffEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDiffCodeEditorWidgetOptions } from 'vs/editor/browser/widget/diffEditorWidget';
import { DiffEditorDecorations } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorDecorations';
import { DiffEditorSash } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorSash';
import { DiffReview2 } from 'vs/editor/browser/widget/diffEditorWidget2/diffReview';
import { ViewZoneManager } from 'vs/editor/browser/widget/diffEditorWidget2/lineAlignment';
import { MovedBlocksLinesPart } from 'vs/editor/browser/widget/diffEditorWidget2/movedBlocksLines';
import { OverviewRulerPart } from 'vs/editor/browser/widget/diffEditorWidget2/overviewRulerPart';
import { UnchangedRangesFeature } from 'vs/editor/browser/widget/diffEditorWidget2/unchangedRanges';
import { ObservableElementSizeObserver, applyStyle, readHotReloadableExport } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { WorkerBasedDocumentDiffProvider } from 'vs/editor/browser/widget/workerBasedDocumentDiffProvider';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { IDiffComputationResult, ILineChange } from 'vs/editor/common/diff/smartLinesDiffComputer';
import { EditorType, IDiffEditorModel, IDiffEditorViewModel, IDiffEditorViewState } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { DelegatingEditor } from './delegatingEditorImpl';
import { DiffEditorEditors } from './diffEditorEditors';
import { DiffEditorOptions } from './diffEditorOptions';
import { DiffEditorViewModel, DiffMapping, DiffState } from './diffEditorViewModel';

export class DiffEditorWidget2 extends DelegatingEditor implements IDiffEditor {
	private readonly elements = h('div.monaco-diff-editor.side-by-side', { style: { position: 'relative', height: '100%' } }, [
		h('div.noModificationsOverlay@overlay', { style: { position: 'absolute', height: '100%', visibility: 'hidden', } }, [$('span', {}, 'No Changes')]),
		h('div.editor.original@original', { style: { position: 'absolute', height: '100%' } }),
		h('div.editor.modified@modified', { style: { position: 'absolute', height: '100%' } }),
	]);
	private readonly _diffModel = this._register(disposableObservableValue<DiffEditorViewModel | undefined>('diffModel', undefined));
	public readonly onDidChangeModel = Event.fromObservableLight(this._diffModel);

	public get onDidContentSizeChange() { return this._editors.onDidContentSizeChange; }

	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
	private readonly _instantiationService = this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	);
	private readonly _rootSizeObserver: ObservableElementSizeObserver;

	private readonly _sash: IObservable<DiffEditorSash | undefined>;
	private readonly _boundarySashes = observableValue<IBoundarySashes | undefined>('boundarySashes', undefined);

	private unchangedRangesFeature!: UnchangedRangesFeature;

	private readonly _reviewPane: DiffReview2;
	private readonly _options: DiffEditorOptions;
	private readonly _editors: DiffEditorEditors;

	constructor(
		private readonly _domElement: HTMLElement,
		options: Readonly<IDiffEditorConstructionOptions>,
		codeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super();
		codeEditorService.willCreateDiffEditor();

		this._contextKeyService.createKey('isInDiffEditor', true);
		this._contextKeyService.createKey('diffEditorVersion', 2);

		this._options = new DiffEditorOptions(options);

		this._contextKeyService.createKey(EditorContextKeys.isEmbeddedDiffEditor.key, false);
		const isEmbeddedDiffEditorKey = EditorContextKeys.isEmbeddedDiffEditor.bindTo(this._contextKeyService);
		this._register(autorun('update isEmbeddedDiffEditorKey', reader => {
			isEmbeddedDiffEditorKey.set(this._options.isInEmbeddedEditor.read(reader));
		}));

		this._domElement.appendChild(this.elements.root);

		this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
		this._rootSizeObserver.setAutomaticLayout(options.automaticLayout ?? false);

		const reviewPaneObservable = observableValue<undefined | DiffReview2>('reviewPane', undefined);
		this._editors = this._register(this._instantiationService.createInstance(
			DiffEditorEditors,
			this.elements.original,
			this.elements.modified,
			this._options,
			codeEditorWidgetOptions,
			(i, c, o, o2) => this._createInnerEditor(i, c, o, o2),
			reviewPaneObservable.map((r, reader) => r?.isVisible.read(reader) ?? false),
		));

		this._sash = derivedWithStore('sash', (reader, store) => {
			const showSash = this._options.renderSideBySide.read(reader);
			this.elements.root.classList.toggle('side-by-side', showSash);
			if (!showSash) { return undefined; }
			const result = store.add(new DiffEditorSash(
				this._options,
				this.elements.root,
				{
					height: this._rootSizeObserver.height,
					width: this._rootSizeObserver.width.map((w, reader) => w - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)),
				}
			));
			store.add(autorun('setBoundarySashes', reader => {
				const boundarySashes = this._boundarySashes.read(reader);
				if (boundarySashes) {
					result.setBoundarySashes(boundarySashes);
				}
			}));
			return result;
		});
		this._register(keepAlive(this._sash, true));

		this._register(autorunWithStore2('UnchangedRangesFeature', (reader, store) => {
			this.unchangedRangesFeature = store.add(new (readHotReloadableExport(UnchangedRangesFeature, reader))(this._editors, this._diffModel, this._options));
		}));

		this._register(autorunWithStore2('DiffEditorDecorations', (reader, store) => {
			store.add(new (readHotReloadableExport(DiffEditorDecorations, reader))(this._editors, this._diffModel, this._options));
		}));
		this._register(autorunWithStore2('ViewZoneManager', (reader, store) => {
			store.add(this._instantiationService.createInstance(
				readHotReloadableExport(ViewZoneManager, reader),
				this._editors,
				this._diffModel,
				this._options,
				this,
				() => this.unchangedRangesFeature.isUpdatingViewZones,
			));
		}));

		this._register(autorunWithStore2('OverviewRulerPart', (reader, store) => {
			store.add(this._instantiationService.createInstance(readHotReloadableExport(OverviewRulerPart, reader), this._editors,
				this.elements.root,
				this._diffModel,
				this._rootSizeObserver.width,
				this._rootSizeObserver.height,
				this._layoutInfo.map(i => i.modifiedEditor),
				this._options,
			));
		}));

		this._reviewPane = this._register(this._instantiationService.createInstance(DiffReview2, this));
		this.elements.root.appendChild(this._reviewPane.domNode.domNode);
		this.elements.root.appendChild(this._reviewPane.actionBarContainer.domNode);
		reviewPaneObservable.set(this._reviewPane, undefined);

		this._createDiffEditorContributions();

		codeEditorService.addDiffEditor(this);

		this._register(keepAlive(this._layoutInfo, true));

		this._register(new MovedBlocksLinesPart(
			this.elements.root,
			this._diffModel,
			this._layoutInfo.map(i => i.originalEditor),
			this._layoutInfo.map(i => i.modifiedEditor),
			this._editors,
		));

		this._register(applyStyle(this.elements.overlay, {
			width: this._layoutInfo.map((i, r) => i.originalEditor.width + (this._options.renderSideBySide.read(r) ? 0 : i.modifiedEditor.width)),
			visibility: derived('visibility', reader =>
				(this._options.collapseUnchangedRegions.read(reader) && this._diffModel.read(reader)?.diff.read(reader)?.mappings.length === 0)
					? 'visible' : 'hidden'
			),
		}));

		this._register(this._editors.original.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			if (!m) { return; }
			const movedText = m.diff.get()!.movedTexts.find(m => m.lineRangeMapping.originalRange.contains(e.position.lineNumber));
			m.syncedMovedTexts.set(movedText, undefined);
		}));
		this._register(this._editors.modified.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			if (!m) { return; }
			const movedText = m.diff.get()!.movedTexts.find(m => m.lineRangeMapping.modifiedRange.contains(e.position.lineNumber));
			m.syncedMovedTexts.set(movedText, undefined);
		}));

		// Revert change when an arrow is clicked.
		this._register(this._editors.modified.onMouseDown(event => {
			if (!event.event.rightButton && event.target.position && event.target.element?.className.includes('arrow-revert-change')) {
				const lineNumber = event.target.position.lineNumber;
				const viewZone = event.target as IMouseTargetViewZone | undefined;

				const model = this._diffModel.get();
				if (!model) { return; }
				const diffs = model.diff.get()?.mappings;
				if (!diffs) { return; }
				const diff = diffs.find(d =>
					viewZone?.detail.afterLineNumber === d.lineRangeMapping.modifiedRange.startLineNumber - 1 ||
					d.lineRangeMapping.modifiedRange.startLineNumber === lineNumber
				);
				if (!diff) { return; }
				this.revert(diff.lineRangeMapping);

				event.event.stopPropagation();
			}
		}));
	}

	public getContentHeight() {
		return this._editors.modified.getContentHeight();
	}

	protected _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorConstructionOptions>, editorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
		return editor;
	}

	private readonly _layoutInfo = derived('modifiedEditorLayoutInfo', (reader) => {
		const width = this._rootSizeObserver.width.read(reader);
		const height = this._rootSizeObserver.height.read(reader);
		const sashLeft = this._sash.read(reader)?.sashLeft.read(reader);

		const originalWidth = sashLeft ?? Math.max(5, this._editors.original.getLayoutInfo().decorationsLeft);

		this.elements.original.style.width = originalWidth + 'px';
		this.elements.original.style.left = '0px';

		this.elements.modified.style.width = (width - originalWidth) + 'px';
		this.elements.modified.style.left = originalWidth + 'px';

		this._editors.original.layout({ width: originalWidth, height: height });
		this._editors.modified.layout({
			width: width - originalWidth -
				(this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0),
			height
		});
		this._reviewPane.layout(0, width, height);

		return {
			modifiedEditor: this._editors.modified.getLayoutInfo(),
			originalEditor: this._editors.original.getLayoutInfo(),
		};
	});

	private _createDiffEditorContributions() {
		const contributions: IDiffEditorContributionDescription[] = EditorExtensionsRegistry.getDiffEditorContributions();
		for (const desc of contributions) {
			try {
				this._register(this._instantiationService.createInstance(desc.ctor, this));
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}

	protected override get _targetEditor(): CodeEditorWidget { return this._editors.modified; }

	override getEditorType(): string { return EditorType.IDiffEditor; }

	override onVisible(): void {
		// TODO: Only compute diffs when diff editor is visible
		this._editors.original.onVisible();
		this._editors.modified.onVisible();
	}

	override onHide(): void {
		this._editors.original.onHide();
		this._editors.modified.onHide();
	}

	override layout(dimension?: IDimension | undefined): void { this._rootSizeObserver.observe(dimension); }

	override hasTextFocus(): boolean { return this._editors.original.hasTextFocus() || this._editors.modified.hasTextFocus(); }

	public override saveViewState(): IDiffEditorViewState {
		const originalViewState = this._editors.original.saveViewState();
		const modifiedViewState = this._editors.modified.saveViewState();
		return {
			original: originalViewState,
			modified: modifiedViewState,
			modelState: this._diffModel.get()?.serializeState(),
		};
	}

	public override restoreViewState(s: IDiffEditorViewState): void {
		if (s && s.original && s.modified) {
			const diffEditorState = s as IDiffEditorViewState;
			this._editors.original.restoreViewState(diffEditorState.original);
			this._editors.modified.restoreViewState(diffEditorState.modified);
			if (diffEditorState.modelState) {
				this._diffModel.get()?.restoreSerializedState(diffEditorState.modelState as any);
			}
		}
	}

	public createViewModel(model: IDiffEditorModel): IDiffEditorViewModel {
		return new DiffEditorViewModel(
			model,
			this._options,
			// TODO@hediet make diffAlgorithm observable
			this._instantiationService.createInstance(WorkerBasedDocumentDiffProvider, { diffAlgorithm: this._options.diffAlgorithm.get() })
		);
	}

	override getModel(): IDiffEditorModel | null { return this._diffModel.get()?.model ?? null; }

	override setModel(model: IDiffEditorModel | null | IDiffEditorViewModel): void {
		if (!model && this._diffModel.get()) {
			// Transitioning from a model to no-model
			this._reviewPane.hide();
		}

		const vm = model ? ('model' in model) ? model : this.createViewModel(model) : undefined;
		this._editors.original.setModel(vm ? vm.model.original : null);
		this._editors.modified.setModel(vm ? vm.model.modified : null);
		transaction(tx => {
			this._diffModel.set(vm as (DiffEditorViewModel | undefined), tx);
		});
	}

	/**
	 * @param changedOptions Only has values for top-level options that have actually changed.
	 */
	override updateOptions(changedOptions: IDiffEditorOptions): void {
		this._options.updateOptions(changedOptions);
	}

	getContainerDomNode(): HTMLElement { return this._domElement; }
	getOriginalEditor(): ICodeEditor { return this._editors.original; }
	getModifiedEditor(): ICodeEditor { return this._editors.modified; }

	setBoundarySashes(sashes: IBoundarySashes): void {
		this._boundarySashes.set(sashes, undefined);
	}

	private readonly _diffValue = this._diffModel.map((m, r) => m?.diff.read(r));
	readonly onDidUpdateDiff: Event<void> = Event.fromObservableLight(this._diffValue);

	get ignoreTrimWhitespace(): boolean { return this._options.ignoreTrimWhitespace.get(); }

	get maxComputationTime(): number { return this._options.maxComputationTimeMs.get(); }

	get renderSideBySide(): boolean { return this._options.renderSideBySide.get(); }

	/**
	 * @deprecated Use `this.getDiffComputationResult().changes2` instead.
	 */
	getLineChanges(): ILineChange[] | null {
		const diffState = this._diffModel.get()?.diff.get();
		if (!diffState) { return null; }
		return toLineChanges(diffState);
	}

	getDiffComputationResult(): IDiffComputationResult | null {
		const diffState = this._diffModel.get()?.diff.get();
		if (!diffState) { return null; }

		return {
			changes: this.getLineChanges()!,
			changes2: diffState.mappings.map(m => m.lineRangeMapping),
			identical: diffState.identical,
			quitEarly: diffState.quitEarly,
		};
	}

	revert(diff: LineRangeMapping): void {
		const model = this._diffModel.get()?.model;
		if (!model) { return; }

		const changes: IIdentifiedSingleEditOperation[] = diff.innerChanges
			? diff.innerChanges.map<IIdentifiedSingleEditOperation>(c => ({
				range: c.modifiedRange,
				text: model.original.getValueInRange(c.originalRange)
			}))
			: [
				{
					range: diff.modifiedRange.toExclusiveRange(),
					text: model.original.getValueInRange(diff.originalRange.toExclusiveRange())
				}
			];

		this._editors.modified.executeEdits('diffEditor', changes);
	}

	private _goTo(diff: DiffMapping): void {
		this._editors.modified.setPosition(new Position(diff.lineRangeMapping.modifiedRange.startLineNumber, 1));
		this._editors.modified.revealRangeInCenter(diff.lineRangeMapping.modifiedRange.toExclusiveRange());
	}

	goToDiff(target: 'previous' | 'next'): void {
		const diffs = this._diffModel.get()?.diff.get()?.mappings;
		if (!diffs || diffs.length === 0) {
			return;
		}

		const curLineNumber = this._editors.modified.getPosition()!.lineNumber;

		let diff: DiffMapping | undefined;
		if (target === 'next') {
			diff = diffs.find(d => d.lineRangeMapping.modifiedRange.startLineNumber > curLineNumber) ?? diffs[0];
		} else {
			diff = findLast(diffs, d => d.lineRangeMapping.modifiedRange.startLineNumber < curLineNumber) ?? diffs[diffs.length - 1];
		}
		this._goTo(diff);
	}

	revealFirstDiff(): void {
		const diffModel = this._diffModel.get();
		if (!diffModel) {
			return;
		}
		// wait for the diff computation to finish
		this.waitForDiff().then(() => {
			const diffs = diffModel.diff.get()?.mappings;
			if (!diffs || diffs.length === 0) {
				return;
			}
			this._goTo(diffs[0]);
		});
	}

	diffReviewNext(): void { this._reviewPane.next(); }

	diffReviewPrev(): void { this._reviewPane.prev(); }

	async waitForDiff(): Promise<void> {
		const diffModel = this._diffModel.get();
		if (!diffModel) { return; }
		await diffModel.waitForDiff();
	}
}

function toLineChanges(state: DiffState): ILineChange[] {
	return state.mappings.map(x => {
		const m = x.lineRangeMapping;
		let originalStartLineNumber: number;
		let originalEndLineNumber: number;
		let modifiedStartLineNumber: number;
		let modifiedEndLineNumber: number;
		let innerChanges = m.innerChanges;

		if (m.originalRange.isEmpty) {
			// Insertion
			originalStartLineNumber = m.originalRange.startLineNumber - 1;
			originalEndLineNumber = 0;
			innerChanges = undefined;
		} else {
			originalStartLineNumber = m.originalRange.startLineNumber;
			originalEndLineNumber = m.originalRange.endLineNumberExclusive - 1;
		}

		if (m.modifiedRange.isEmpty) {
			// Deletion
			modifiedStartLineNumber = m.modifiedRange.startLineNumber - 1;
			modifiedEndLineNumber = 0;
			innerChanges = undefined;
		} else {
			modifiedStartLineNumber = m.modifiedRange.startLineNumber;
			modifiedEndLineNumber = m.modifiedRange.endLineNumberExclusive - 1;
		}

		return {
			originalStartLineNumber,
			originalEndLineNumber,
			modifiedStartLineNumber,
			modifiedEndLineNumber,
			charChanges: innerChanges?.map(m => ({
				originalStartLineNumber: m.originalRange.startLineNumber,
				originalStartColumn: m.originalRange.startColumn,
				originalEndLineNumber: m.originalRange.endLineNumber,
				originalEndColumn: m.originalRange.endColumn,
				modifiedStartLineNumber: m.modifiedRange.startLineNumber,
				modifiedStartColumn: m.modifiedRange.startColumn,
				modifiedEndLineNumber: m.modifiedRange.endLineNumber,
				modifiedEndColumn: m.modifiedRange.endColumn,
			}))
		};
	});
}
