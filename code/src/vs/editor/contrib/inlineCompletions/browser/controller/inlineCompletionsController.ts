/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../../../../base/browser/domObservable.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { timeout } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { createHotClass, readHotReloadableExport } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITransaction, autorun, constObservable, derived, derivedDisposable, derivedObservableWithCache, mapObservableArrayCached, observableFromEvent, observableSignal, runOnChange, runOnChangeWithStore, transaction, waitForState } from '../../../../../base/common/observable.js';
import { isUndefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { hotClassGetOriginalInstance } from '../../../../../platform/observable/common/wrapInHotClass.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { CursorChangeReason } from '../../../../common/cursorEvents.js';
import { ILanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { InlineCompletionsHintsWidget, InlineSuggestionHintsContentWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { TextModelChangeRecorder } from '../model/changeRecorder.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { SuggestWidgetAdaptor } from '../model/suggestWidgetAdaptor.js';
import { convertItemsToStableObservables, ObservableContextKeyService } from '../utils.js';
import { GhostTextView } from '../view/ghostText/ghostTextView.js';
import { InlineEditsViewAndDiffProducer } from '../view/inlineEdits/inlineEditsViewAndDiffProducer.js';
import { inlineSuggestCommitId } from './commandIds.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';

export class InlineCompletionsController extends Disposable {
	public static hot = createHotClass(InlineCompletionsController);

	static ID = 'editor.contrib.inlineCompletionsController';

	public static get(editor: ICodeEditor): InlineCompletionsController | null {
		return hotClassGetOriginalInstance(editor.getContribution<InlineCompletionsController>(InlineCompletionsController.ID));
	}

	private readonly _editorObs = observableCodeEditor(this.editor);
	private readonly _positions = derived(this, reader => this._editorObs.selections.read(reader)?.map(s => s.getEndPosition()) ?? [new Position(1, 1)]);

	private readonly _suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(
		this.editor,
		() => {
			this._editorObs.forceUpdate();
			return this.model.get()?.selectedInlineCompletion.get()?.toSingleTextEdit(undefined);
		},
		(item) => this._editorObs.forceUpdate(_tx => {
			/** @description InlineCompletionsController.handleSuggestAccepted */
			this.model.get()?.handleSuggestAccepted(item);
		})
	));

	private readonly _suggestWidgetSelectedItem = observableFromEvent(this, cb => this._suggestWidgetAdaptor.onDidSelectedItemChange(() => {
		this._editorObs.forceUpdate(_tx => cb(undefined));
	}), () => this._suggestWidgetAdaptor.selectedItem);


	private readonly _enabledInConfig = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
	private readonly _isScreenReaderEnabled = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
	private readonly _editorDictationInProgress = observableFromEvent(this,
		this._contextKeyService.onDidChangeContext,
		() => this._contextKeyService.getContext(this.editor.getDomNode()).getValue('editorDictation.inProgress') === true
	);
	private readonly _enabled = derived(this, reader => this._enabledInConfig.read(reader) && (!this._isScreenReaderEnabled.read(reader) || !this._editorDictationInProgress.read(reader)));

	private readonly _debounceValue = this._debounceService.for(
		this._languageFeaturesService.inlineCompletionsProvider,
		'InlineCompletionsDebounce',
		{ min: 50, max: 50 }
	);

	private readonly _cursorIsInIndentation = derived(this, reader => {
		const cursorPos = this._editorObs.cursorPosition.read(reader);
		if (cursorPos === null) { return false; }
		const model = this._editorObs.model.read(reader);
		if (!model) { return false; }
		this._editorObs.versionId.read(reader);
		const indentMaxColumn = model.getLineIndentColumn(cursorPos.lineNumber);
		return cursorPos.column <= indentMaxColumn;
	});

	private readonly optionPreview = this._editorObs.getOption(EditorOption.suggest).map(v => v.preview);
	private readonly optionPreviewMode = this._editorObs.getOption(EditorOption.suggest).map(v => v.previewMode);
	private readonly optionMode = this._editorObs.getOption(EditorOption.inlineSuggest).map(v => v.mode);
	private readonly optionInlineEditsEnabled = this._editorObs.getOption(EditorOption.inlineSuggest).map(v => !!v.edits.experimental?.enabled);

	public readonly model = derivedDisposable<InlineCompletionsModel | undefined>(this, reader => {
		if (this._editorObs.isReadonly.read(reader)) { return undefined; }
		const textModel = this._editorObs.model.read(reader);
		if (!textModel) { return undefined; }

		const model: InlineCompletionsModel = this._instantiationService.createInstance(
			InlineCompletionsModel,
			textModel,
			this._suggestWidgetSelectedItem,
			this._editorObs.versionId,
			this._positions,
			this._debounceValue,
			this.optionPreview,
			this.optionPreviewMode,
			this.optionMode,
			this._enabled,
			this.optionInlineEditsEnabled,
			this.editor,
		);
		return model;
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this.model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});
	private readonly _stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);

	private readonly _ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) =>
		derivedDisposable((reader) =>
			this._instantiationService.createInstance(readHotReloadableExport(GhostTextView, reader), this.editor, {
				ghostText: ghostText,
				minReservedLineCount: constObservable(0),
				targetTextModel: this.model.map(v => v?.textModel),
			})
		).recomputeInitiallyAndOnChange(store)
	).recomputeInitiallyAndOnChange(this._store);

	private readonly _inlineEdit = derived(this, reader => {
		const s = this.model.read(reader)?.state.read(reader);
		if (s?.kind === 'inlineEdit') {
			return s.inlineEdit;
		}
		return undefined;
	});
	private readonly _everHadInlineEdit = derivedObservableWithCache<boolean>(this, (reader, last) => last || !!this._inlineEdit.read(reader));
	protected readonly _inlineEditWidget = derivedDisposable(reader => {
		if (!this._everHadInlineEdit.read(reader)) { return undefined; }
		return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer.hot.read(reader), this.editor, this._inlineEdit, this.model);
	})
		.recomputeInitiallyAndOnChange(this._store);

	private readonly _playAccessibilitySignal = observableSignal(this);

	private readonly _fontFamily = this._editorObs.getOption(EditorOption.inlineSuggest).map(val => val.fontFamily);
	private readonly _hideInlineEditOnSelectionChange = this._editorObs.getOption(EditorOption.inlineSuggest).map(val => true);

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeatureDebounceService private readonly _debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(new InlineCompletionContextKeys(this._contextKeyService, this.model));

		this._register(runOnChange(this._editorObs.onDidType, (_value, _changes) => {
			if (this._enabled.get()) {
				this.model.get()?.trigger();
			}
		}));

		this._register(this._commandService.onDidExecuteCommand((e) => {
			// These commands don't trigger onDidType.
			const commands = new Set([
				CoreEditingCommands.Tab.id,
				CoreEditingCommands.DeleteLeft.id,
				CoreEditingCommands.DeleteRight.id,
				inlineSuggestCommitId,
				'acceptSelectedSuggestion',
			]);
			if (commands.has(e.commandId) && editor.hasTextFocus() && this._enabled.get()) {
				this._editorObs.forceUpdate(tx => {
					/** @description onDidExecuteCommand */
					this.model.get()?.trigger(tx);
				});
			}
		}));

		this._register(runOnChange(this._editorObs.selections, (_value, _, changes) => {
			if (changes.some(e => e.reason === CursorChangeReason.Explicit || e.source === 'api')) {
				if (!this._hideInlineEditOnSelectionChange.get() && this.model.get()?.state.get()?.kind === 'inlineEdit') {
					return;
				}
				const m = this.model.get();
				if (!m) { return; }
				if (m.inlineCompletionState.get()?.primaryGhostText) {
					this.model.get()?.stop();
				} else if (m.state.get()?.inlineCompletion) {
					this.model.get()?.collapseInlineEdit();
				}
			}
		}));

		this._register(this.editor.onDidBlurEditorWidget(() => {
			// This is a hidden setting very useful for debugging
			if (this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown')
				|| this._configurationService.getValue('editor.inlineSuggest.keepOnBlur')
				|| editor.getOption(EditorOption.inlineSuggest).keepOnBlur
				|| InlineSuggestionHintsContentWidget.dropDownVisible) {
				return;
			}

			if (this.model.get()?.inlineEditAvailable.get()) {
				// dont hide inline edits on blur
				return;
			}

			transaction(tx => {
				/** @description InlineCompletionsController.onDidBlurEditorWidget */
				this.model.get()?.stop('automatic', tx);
			});
		}));

		this._register(autorun(reader => {
			/** @description InlineCompletionsController.forceRenderingAbove */
			const state = this.model.read(reader)?.inlineCompletionState.read(reader);
			if (state?.suggestItem) {
				if (state.primaryGhostText.lineCount >= 2) {
					this._suggestWidgetAdaptor.forceRenderingAbove();
				}
			} else {
				this._suggestWidgetAdaptor.stopForceRenderingAbove();
			}
		}));
		this._register(toDisposable(() => {
			this._suggestWidgetAdaptor.stopForceRenderingAbove();
		}));

		const currentInlineCompletionBySemanticId = derivedObservableWithCache<string | undefined>(this, (reader, last) => {
			const model = this.model.read(reader);
			const state = model?.inlineCompletionState.read(reader);
			if (this._suggestWidgetSelectedItem.get()) {
				return last;
			}
			return state?.inlineCompletion?.semanticId;
		});
		this._register(runOnChangeWithStore(derived(reader => {
			this._playAccessibilitySignal.read(reader);
			currentInlineCompletionBySemanticId.read(reader);
			return {};
		}), async (_value, _, _deltas, store) => {
			/** @description InlineCompletionsController.playAccessibilitySignalAndReadSuggestion */
			const model = this.model.get();
			const state = model?.inlineCompletionState.get();
			if (!state || !model) { return; }
			const lineText = model.textModel.getLineContent(state.primaryGhostText.lineNumber);

			await timeout(50, cancelOnDispose(store));
			await waitForState(this._suggestWidgetSelectedItem, isUndefined, () => false, cancelOnDispose(store));

			await this._accessibilitySignalService.playSignal(AccessibilitySignal.inlineSuggestion);
			if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
				this._provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
			}
		}));

		this._register(new InlineCompletionsHintsWidget(this.editor, this.model, this._instantiationService));

		this._register(createStyleSheetFromObservable(derived(reader => {
			const fontFamily = this._fontFamily.read(reader);
			if (fontFamily === '' || fontFamily === 'default') { return ''; }
			return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
		})));

		// TODO@hediet
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.verbosity.inlineCompletions')) {
				this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
			}
		}));
		this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });

		const contextKeySvcObs = new ObservableContextKeyService(this._contextKeyService);

		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorInIndentation, this._cursorIsInIndentation));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.hasSelection, reader => !this._editorObs.cursorSelection.read(reader)?.isEmpty()));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorAtInlineEdit, this.model.map((m, reader) => {
			const s = m?.state?.read(reader);
			return s?.kind === 'inlineEdit' && s.cursorAtInlineEdit;
		})));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldAcceptInlineEdit, this.model.map((m, r) => !!m?.tabShouldAcceptInlineEdit.read(r))));
		this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldJumpToInlineEdit, this.model.map((m, r) => !!m?.tabShouldJumpToInlineEdit.read(r))));

		this._register(this._instantiationService.createInstance(TextModelChangeRecorder, this.editor));
	}

	public playAccessibilitySignal(tx: ITransaction) {
		this._playAccessibilitySignal.trigger(tx);
	}

	private _provideScreenReaderUpdate(content: string): void {
		const accessibleViewShowing = this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown');
		const accessibleViewKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView');
		let hint: string | undefined;
		if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(EditorOption.inlineCompletionsAccessibilityVerbose)) {
			hint = localize('showAccessibleViewHint', "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
		}
		alert(hint ? content + ', ' + hint : content);
	}

	public shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.primaryGhostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._ghostTextWidgets.get()[0]?.get().ownsViewZone(viewZoneId) ?? false;
	}

	public reject() {
		transaction(tx => {
			this.model.get()?.stop('explicitCancel', tx);
		});
	}

	public jump(): void {
		const m = this.model.get();
		m?.jump();
	}
}
