/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { WorkspacePrompt } from '../../prompts/node/panel/workspace/workspacePrompt';


export const workspaceIntentId = 'workspace';

class WorkspaceIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
	) {
		super(intent, location, endpoint);
	}

	createRenderer(promptContext: IBuildPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		const editor = this.tabsAndEditorsService.activeTextEditor;
		return PromptRenderer.create(this.instantiationService, endpoint, WorkspacePrompt, {
			promptContext,
			document: editor ? TextDocumentSnapshot.create(editor?.document) : undefined,
			selection: editor?.selection,
			endpoint
		});
	}
}

export class WorkspaceIntent implements IIntent {

	static readonly ID = workspaceIntentId;

	readonly id = WorkspaceIntent.ID;

	readonly description = l10n.t('Ask a question about the files in your current workspace');

	readonly locations = [ChatLocation.Panel, ChatLocation.Other];

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: false,
		defaultEnablement: true,
	};

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		return this.instantiationService.createInstance(WorkspaceIntentInvocation, this, location, endpoint);
	}
}
