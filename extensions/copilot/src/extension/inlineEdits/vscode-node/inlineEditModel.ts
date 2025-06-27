/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocumentChangeReason, window } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { IStatelessNextEditProvider } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { NesHistoryContextProvider } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITracer, createTracer } from '../../../util/common/tracing';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { observableSignal } from '../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { createNextEditProvider } from '../node/createNextEditProvider';
import { DebugRecorder } from '../node/debugRecorder';
import { NextEditProvider } from '../node/nextEditProvider';
import { DiagnosticsNextEditProvider } from './features/diagnosticsInlineEditProvider';
import { VSCodeWorkspace } from './parts/vscodeWorkspace';

const TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT = 10000; // 10 seconds
const TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN = 5000; // milliseconds
const TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN = 5000; // 5s

export class InlineEditModel extends Disposable {
	public readonly debugRecorder = this._register(new DebugRecorder(this.workspace));
	public readonly nextEditProvider: NextEditProvider;

	private readonly _predictor: IStatelessNextEditProvider;

	public readonly inlineEditsInlineCompletionsEnabled = this._configurationService.getConfigObservable(ConfigKey.Internal.InlineEditsInlineCompletionsEnabled);

	private readonly _tracer: ITracer;

	public readonly onChange = observableSignal(this);

	constructor(
		private readonly _predictorId: string | undefined,
		public readonly workspace: VSCodeWorkspace,
		historyContextProvider: NesHistoryContextProvider,
		public readonly diagnosticsBasedProvider: DiagnosticsNextEditProvider | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _expService: IExperimentationService
	) {
		super();

		this._tracer = createTracer(['NES', 'Model'], (s) => this._logService.logger.trace(s));

		this._predictor = createNextEditProvider(this._predictorId, this._instantiationService);
		const xtabDiffNEntries = this._configurationService.getExperimentBasedConfig(ConfigKey.Internal.InlineEditsXtabDiffNEntries, this._expService);
		this.nextEditProvider = this._instantiationService.createInstance(NextEditProvider, this.workspace, this._predictor, historyContextProvider, new NesXtabHistoryTracker(this.workspace, xtabDiffNEntries), this.debugRecorder);
		if (this._predictor.dependsOnSelection) {
			const documentsToLastChangeEvents = new Map<DocumentId, { lastEditedTimestamp: number; lineNumberTriggers: Map<number /* lineNumber */, number /* timestamp */> }>();
			this._store.add(this._register(vscode.workspace.onDidChangeTextDocument(e => {
				if (e.document.uri.scheme === 'output') {
					// ignore
					return;
				}
				const tracer = this._tracer.sub('onDidChangeTextDocument');
				if (e.reason === TextDocumentChangeReason.Undo || e.reason === TextDocumentChangeReason.Redo) {
					// ignore
					tracer.returns('undo/redo');
					return;
				}
				const doc = this.workspace.getDocumentByTextDocument(e.document);
				if (!doc) {
					// an ignored document
					tracer.returns('ignored document');
					return;
				}
				documentsToLastChangeEvents.set(doc.id, { lastEditedTimestamp: Date.now(), lineNumberTriggers: new Map() });
				tracer.returns('setting last edited timestamp');
			})));
			this._store.add(this._register(window.onDidChangeTextEditorSelection((e) => {
				if (e.textEditor.document.uri.scheme === 'output') {
					// ignore
					return;
				}
				const tracer = this._tracer.sub('onDidChangeTextEditorSelection');
				if (e.selections.length !== 1) {
					// ignore
					tracer.returns('multiple selections');
					return;
				}
				if (!e.selections[0].isEmpty) {
					// ignore
					tracer.returns('not empty selection');
					return;
				}
				const doc = this.workspace.getDocumentByTextDocument(e.textEditor.document);
				if (!doc) {
					return;
				}
				if (Date.now() - this.nextEditProvider.lastRejectionTime < TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN) {
					// the cursor has moved within 5s of the last rejection, don't auto-trigger until another doc modification
					documentsToLastChangeEvents.delete(doc.id);
					tracer.returns('rejection cooldown');
				}

				const mostRecentChange = documentsToLastChangeEvents.get(doc.id);
				if (!mostRecentChange) {
					// an ignored document
					tracer.returns('ignored document');
					return;
				}
				const now = Date.now();
				const hasRecentEdit = (now - mostRecentChange.lastEditedTimestamp) < TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT;
				if (!hasRecentEdit) {
					tracer.returns('no recent edit');
					return;
				}

				const hasRecentTrigger = (Date.now() - this.nextEditProvider.lastTriggerTime) < TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT;
				if (!hasRecentTrigger) {
					// the provider was not triggered recently, so we might be observing a cursor change event following
					// a document edit caused outside of regular typing, otherwise the UI would have invoked us recently
					tracer.returns('no recent trigger');
					return;
				}

				const selectionLine = e.selections[0].active.line;
				const lastTriggerTimestampForLine = mostRecentChange.lineNumberTriggers.get(selectionLine);
				if (lastTriggerTimestampForLine !== undefined && lastTriggerTimestampForLine + TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN > now) {
					tracer.returns('same line cooldown');
					return;
				}

				// TODO: Do not trigger if there is an existing valid request now running, ie don't use just last-trigger timestamp
				// cleanup old triggers if too many
				if (mostRecentChange.lineNumberTriggers.size > 100) {
					for (const [lineNumber, timestamp] of mostRecentChange.lineNumberTriggers.entries()) {
						if (now - timestamp > TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT) {
							mostRecentChange.lineNumberTriggers.delete(lineNumber);
						}
					}
				}

				mostRecentChange.lineNumberTriggers.set(selectionLine, now);
				tracer.returns('triggering inline edit');
				this.onChange.trigger(undefined);
			})));
		}
	}
}
