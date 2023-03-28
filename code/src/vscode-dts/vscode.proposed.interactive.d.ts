/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface InteractiveEditorSlashCommand {
		command: string;
		detail?: string;
		refer?: boolean;
		// kind: CompletionItemKind;
	}

	// todo@API make classes
	export interface InteractiveEditorSession {
		placeholder?: string;
		slashCommands?: InteractiveEditorSlashCommand[];
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorRequest {
		session: InteractiveEditorSession;
		prompt: string;

		selection: Selection;
		wholeRange: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorResponse {
		edits: TextEdit[] | WorkspaceEdit;
		placeholder?: string;
		wholeRange?: Range;
	}

	// todo@API make classes
	export interface InteractiveEditorMessageResponse {
		contents: MarkdownString;
		placeholder?: string;
		wholeRange?: Range;
	}

	export enum InteractiveEditorResponseFeedbackKind {
		Unhelpful = 0,
		Helpful = 1,
		Undone = 2
	}

	export interface TextDocumentContext {
		document: TextDocument;
		selection: Selection;
		action?: string;
	}

	export interface InteractiveEditorSessionProvider {
		// Create a session. The lifetime of this session is the duration of the editing session with the input mode widget.
		prepareInteractiveEditorSession(context: TextDocumentContext, token: CancellationToken): ProviderResult<InteractiveEditorSession>;

		provideInteractiveEditorResponse(request: InteractiveEditorRequest, token: CancellationToken): ProviderResult<InteractiveEditorResponse | InteractiveEditorMessageResponse>;

		// eslint-disable-next-line local/vscode-dts-provider-naming
		releaseInteractiveEditorSession?(session: InteractiveEditorSession): any;

		// todo@API use enum instead of boolean
		// eslint-disable-next-line local/vscode-dts-provider-naming
		handleInteractiveEditorResponseFeedback?(session: InteractiveEditorSession, response: InteractiveEditorResponse | InteractiveEditorMessageResponse, kind: InteractiveEditorResponseFeedbackKind): void;
	}


	export interface InteractiveSessionState { }

	export interface InteractiveSessionParticipantInformation {
		name: string;

		/**
		 * A full URI for the icon of the participant.
		 */
		icon?: Uri;
	}

	export interface InteractiveSession {
		requester: InteractiveSessionParticipantInformation;
		responder: InteractiveSessionParticipantInformation;
		inputPlaceholder?: string;

		saveState?(): InteractiveSessionState;
	}

	export interface InteractiveSessionRequestArgs {
		command: string;
		args: any;
	}

	export interface InteractiveRequest {
		session: InteractiveSession;
		message: string | InteractiveSessionReplyFollowup;
	}

	export interface InteractiveResponseErrorDetails {
		message: string;
		responseIsIncomplete?: boolean;
		responseIsFiltered?: boolean;
	}

	export interface InteractiveResponseForProgress {
		errorDetails?: InteractiveResponseErrorDetails;
	}

	export interface InteractiveProgressContent {
		content: string;
	}

	export interface InteractiveProgressId {
		responseId: string;
	}

	export type InteractiveProgress = InteractiveProgressContent | InteractiveProgressId;

	export interface InteractiveResponseCommand {
		commandId: string;
		args?: any[];
		title: string; // supports codicon strings
	}

	export interface InteractiveSessionSlashCommand {
		command: string;
		kind: CompletionItemKind;
		detail?: string;
	}

	export interface InteractiveSessionReplyFollowup {
		message: string;
		tooltip?: string;
		title?: string;

		// Extensions can put any serializable data here, such as an ID/version
		metadata?: any;
	}

	export type InteractiveSessionFollowup = InteractiveSessionReplyFollowup | InteractiveResponseCommand;

	export type InteractiveWelcomeMessageContent = string | InteractiveSessionReplyFollowup[];

	export interface InteractiveSessionProvider {
		provideInitialSuggestions?(token: CancellationToken): ProviderResult<string[]>;
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<InteractiveWelcomeMessageContent[]>;
		provideFollowups?(session: InteractiveSession, token: CancellationToken): ProviderResult<(string | InteractiveSessionFollowup)[]>;
		provideSlashCommands?(session: InteractiveSession, token: CancellationToken): ProviderResult<InteractiveSessionSlashCommand[]>;

		prepareSession(initialState: InteractiveSessionState | undefined, token: CancellationToken): ProviderResult<InteractiveSession>;
		resolveRequest(session: InteractiveSession, context: InteractiveSessionRequestArgs | string, token: CancellationToken): ProviderResult<InteractiveRequest>;
		provideResponseWithProgress(request: InteractiveRequest, progress: Progress<InteractiveProgress>, token: CancellationToken): ProviderResult<InteractiveResponseForProgress>;
	}

	export enum InteractiveSessionVoteDirection {
		Up = 1,
		Down = 2
	}

	export interface InteractiveSessionVoteAction {
		kind: 'vote';
		responseId: string;
		direction: InteractiveSessionVoteDirection;
	}

	export enum InteractiveSessionCopyKind {
		// Keyboard shortcut or context menu
		Action = 1,
		Toolbar = 2
	}

	export interface InteractiveSessionCopyAction {
		kind: 'copy';
		responseId: string;
		codeBlockIndex: number;
		copyType: InteractiveSessionCopyKind;
		copiedCharacters: number;
		totalCharacters: number;
		copiedText: string;
	}

	export interface InteractiveSessionInsertAction {
		kind: 'insert';
		responseId: string;
		codeBlockIndex: number;
	}

	export interface InteractiveSessionCommandAction {
		kind: 'command';
		command: InteractiveResponseCommand;
	}

	export type InteractiveSessionUserAction = InteractiveSessionVoteAction | InteractiveSessionCopyAction | InteractiveSessionInsertAction | InteractiveSessionCommandAction;

	export interface InteractiveSessionUserActionEvent {
		action: InteractiveSessionUserAction;
		providerId: string;
	}

	export interface InteractiveSessionDynamicRequest {
		/**
		 * The message that will be displayed in the UI
		 */
		message: string;

		/**
		 * Any extra metadata/context that will go to the provider.
		 * NOTE not actually used yet.
		 */
		metadata?: any;
	}

	export namespace interactive {
		// current version of the proposal.
		export const _version: 1 | number;

		export function registerInteractiveSessionProvider(id: string, provider: InteractiveSessionProvider): Disposable;
		export function addInteractiveRequest(context: InteractiveSessionRequestArgs): void;

		export function sendInteractiveRequestToProvider(providerId: string, message: InteractiveSessionDynamicRequest): void;

		export function registerInteractiveEditorSessionProvider(provider: InteractiveEditorSessionProvider): Disposable;

		export const onDidPerformUserAction: Event<InteractiveSessionUserActionEvent>;
	}
}
