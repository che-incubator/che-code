/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { SnippetController2 } from '../../../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { localize } from '../../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { PromptsType } from '../../../../../../../platform/prompts/common/prompts.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../../../../platform/userDataSync/common/userDataSync.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { CONFIGURE_SYNC_COMMAND_ID } from '../../../../../../services/userDataSync/common/userDataSync.js';
import { ISnippetsService } from '../../../../../snippets/browser/snippets.js';
import { ChatContextKeys } from '../../../../common/chatContextKeys.js';
import { getLanguageIdForPromptsType } from '../../../../common/promptSyntax/constants.js';
import { CHAT_CATEGORY } from '../../../actions/chatActions.js';
import { askForPromptFileName } from './dialogs/askForPromptName.js';
import { askForPromptSourceFolder } from './dialogs/askForPromptSourceFolder.js';
import { createPromptFile } from './utils/createPromptFile.js';

class AbstractNewPromptOrInstructionsFileAction extends Action2 {

	constructor(id: string, title: string, private readonly type: PromptsType) {
		super({
			id,
			title,
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib
			},
			menu: {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
			}
		});
	}

	public override async run(accessor: ServicesAccessor) {
		const logService = accessor.get(ILogService);
		const openerService = accessor.get(IOpenerService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
		const snippetService = accessor.get(ISnippetsService);
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const instaService = accessor.get(IInstantiationService);

		const selectedFolder = await instaService.invokeFunction(askForPromptSourceFolder, this.type);
		if (!selectedFolder) {
			return;
		}

		const fileName = await instaService.invokeFunction(askForPromptFileName, this.type, selectedFolder.uri);
		if (!fileName) {
			return;
		}

		const promptUri = await createPromptFile(fileService, {
			fileName,
			folder: selectedFolder.uri,
			content: ''
		});

		await openerService.open(promptUri);

		const editor = getCodeEditor(editorService.activeTextEditorControl);
		if (editor && editor.hasModel() && isEqual(editor.getModel().uri, promptUri)) {
			const languageId = getLanguageIdForPromptsType(this.type);

			const snippets = await snippetService.getSnippets(languageId, { fileTemplateSnippets: true, noRecencySort: true, includeNoPrefixSnippets: true });
			if (snippets.length > 0) {
				SnippetController2.get(editor)?.apply([{
					range: editor.getModel().getFullModelRange(),
					template: snippets[0].body
				}]);
			}
		}

		if (selectedFolder.storage !== 'user') {
			return;
		}

		// due to PII concerns, synchronization of the 'user' reusable prompts
		// is disabled by default, but we want to make that fact clear to the user
		// hence after a 'user' prompt is create, we check if the synchronization
		// was explicitly configured before, and if it wasn't, we show a suggestion
		// to enable the synchronization logic in the Settings Sync configuration

		const isConfigured = userDataSyncEnablementService
			.isResourceEnablementConfigured(SyncResource.Prompts);
		const isSettingsSyncEnabled = userDataSyncEnablementService.isEnabled();

		// if prompts synchronization has already been configured before or
		// if settings sync service is currently disabled, nothing to do
		if ((isConfigured === true) || (isSettingsSyncEnabled === false)) {
			return;
		}

		// show suggestion to enable synchronization of the user prompts and instructions to the user
		notificationService.prompt(
			Severity.Info,
			localize(
				'workbench.command.prompts.create.user.enable-sync-notification',
				"Do you want to backup and sync your user prompt, instruction and mode files with Setting Sync?'",
			),
			[
				{
					label: localize('enable.capitalized', "Enable"),
					run: () => {
						commandService.executeCommand(CONFIGURE_SYNC_COMMAND_ID)
							.catch((error) => {
								logService.error(`Failed to run '${CONFIGURE_SYNC_COMMAND_ID}' command: ${error}.`);
							});
					},
				},
				{
					label: localize('learnMore.capitalized', "Learn More"),
					run: () => {
						openerService.open(URI.parse('https://aka.ms/vscode-settings-sync-help'));
					},
				},
			],
			{
				neverShowAgain: {
					id: 'workbench.command.prompts.create.user.enable-sync-notification',
					scope: NeverShowAgainScope.PROFILE,
				},
			},
		);
	}
}


export const NEW_PROMPT_COMMAND_ID = 'workbench.command.new.prompt';
export const NEW_INSTRUCTIONS_COMMAND_ID = 'workbench.command.new.instructions';
export const NEW_MODE_COMMAND_ID = 'workbench.command.new.mode';

class NewPromptFileAction extends AbstractNewPromptOrInstructionsFileAction {
	constructor() {
		super(NEW_PROMPT_COMMAND_ID, localize('commands.new.prompt.local.title', "New Prompt File..."), PromptsType.prompt);
	}
}

class NewInstructionsFileAction extends AbstractNewPromptOrInstructionsFileAction {
	constructor() {
		super(NEW_INSTRUCTIONS_COMMAND_ID, localize('commands.new.instructions.local.title', "New Instructions File..."), PromptsType.instructions);
	}
}

class NewModeFileAction extends AbstractNewPromptOrInstructionsFileAction {
	constructor() {
		super(NEW_MODE_COMMAND_ID, localize('commands.new.mode.local.title', "New Mode File..."), PromptsType.mode);
	}
}

registerAction2(NewPromptFileAction);
registerAction2(NewInstructionsFileAction);
registerAction2(NewModeFileAction);
