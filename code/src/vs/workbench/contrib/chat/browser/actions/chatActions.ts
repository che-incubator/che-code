/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNowByDay } from '../../../../../base/common/date.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction2, ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext, IsWindowsContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { ToggleTitleBarConfigAction } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { extractAgentAndCommand } from '../../common/chatParserTypes.js';
import { IChatDetail, IChatService } from '../../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM } from '../../common/chatViewModel.js';
import { IChatWidgetHistoryService } from '../../common/chatWidgetHistoryService.js';
import { CHAT_VIEW_ID, IChatWidget, IChatWidgetService, showChatView } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatViewPane } from '../chatViewPane.js';
import { convertBufferToScreenshotVariable } from '../contrib/screenshot.js';
import { clearChatEditor } from './chatClear.js';
import product from '../../../../../platform/product/common/product.js';
import { URI } from '../../../../../base/common/uri.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

export const CHAT_CATEGORY = localize2('chat.category', 'Chat');
export const CHAT_OPEN_ACTION_ID = 'workbench.action.chat.open';

export interface IChatViewOpenOptions {
	/**
	 * The query for quick chat.
	 */
	query: string;
	/**
	 * Whether the query is partial and will await more input from the user.
	 */
	isPartialQuery?: boolean;
	/**
	 * Any previous chat requests and responses that should be shown in the chat view.
	 */
	previousRequests?: IChatViewOpenRequestEntry[];

	/**
	 * Whether a screenshot of the focused window should be taken and attached
	 */
	attachScreenshot?: boolean;
}

export interface IChatViewOpenRequestEntry {
	request: string;
	response: string;
}

const defaultChat = {
	extensionId: product.defaultChatAgent?.extensionId ?? '',
	name: product.defaultChatAgent?.name ?? '',
	icon: Codicon[product.defaultChatAgent?.icon as keyof typeof Codicon ?? 'commentDiscussion'],
	documentationUrl: product.defaultChatAgent?.documentationUrl ?? '',
	gettingStartedCommand: product.defaultChatAgent?.gettingStartedCommand ?? '',
};

class OpenChatGlobalAction extends Action2 {

	static readonly TITLE = localize2('openChat', "Open Chat");

	constructor() {
		super({
			id: CHAT_OPEN_ACTION_ID,
			title: OpenChatGlobalAction.TITLE,
			icon: defaultChat.icon,
			f1: true,
			precondition: ChatContextKeys.panelParticipantRegistered,
			category: CHAT_CATEGORY,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
				}
			},
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_chat',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor, opts?: string | IChatViewOpenOptions): Promise<void> {
		opts = typeof opts === 'string' ? { query: opts } : opts;

		const chatService = accessor.get(IChatService);
		const viewsService = accessor.get(IViewsService);
		const hostService = accessor.get(IHostService);
		const chatWidget = await showChatView(viewsService);
		if (!chatWidget) {
			return;
		}
		if (opts?.previousRequests?.length && chatWidget.viewModel) {
			for (const { request, response } of opts.previousRequests) {
				chatService.addCompleteRequest(chatWidget.viewModel.sessionId, request, undefined, 0, { message: response });
			}
		}
		if (opts?.attachScreenshot) {
			const screenshot = await hostService.getScreenshot();
			if (screenshot) {
				chatWidget.attachmentModel.addContext(convertBufferToScreenshotVariable(screenshot));
			}
		}
		if (opts?.query) {
			if (opts.isPartialQuery) {
				chatWidget.setInput(opts.query);
			} else {
				chatWidget.acceptInput(opts.query);
			}
		}

		chatWidget.focusInput();
	}
}

class ChatHistoryAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.chat.history`,
			title: localize2('chat.history.label', "Show Chats..."),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', CHAT_VIEW_ID),
				group: 'navigation',
				order: 2
			},
			category: CHAT_CATEGORY,
			icon: Codicon.history,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	async run(accessor: ServicesAccessor) {
		const chatService = accessor.get(IChatService);
		const quickInputService = accessor.get(IQuickInputService);
		const viewsService = accessor.get(IViewsService);
		const editorService = accessor.get(IEditorService);

		const showPicker = () => {
			const openInEditorButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.file),
				tooltip: localize('interactiveSession.history.editor', "Open in Editor"),
			};
			const deleteButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.x),
				tooltip: localize('interactiveSession.history.delete', "Delete"),
			};
			const renameButton: IQuickInputButton = {
				iconClass: ThemeIcon.asClassName(Codicon.pencil),
				tooltip: localize('chat.history.rename', "Rename"),
			};

			interface IChatPickerItem extends IQuickPickItem {
				chat: IChatDetail;
			}

			const getPicks = () => {
				const items = chatService.getHistory();
				items.sort((a, b) => (b.lastMessageDate ?? 0) - (a.lastMessageDate ?? 0));

				let lastDate: string | undefined = undefined;
				const picks = items.flatMap((i): [IQuickPickSeparator | undefined, IChatPickerItem] => {
					const timeAgoStr = fromNowByDay(i.lastMessageDate, true, true);
					const separator: IQuickPickSeparator | undefined = timeAgoStr !== lastDate ? {
						type: 'separator', label: timeAgoStr,
					} : undefined;
					lastDate = timeAgoStr;
					return [
						separator,
						{
							label: i.title,
							description: i.isActive ? `(${localize('currentChatLabel', 'current')})` : '',
							chat: i,
							buttons: i.isActive ? [renameButton] : [
								renameButton,
								openInEditorButton,
								deleteButton,
							]
						}
					];
				});

				return coalesce(picks);
			};

			const store = new DisposableStore();
			const picker = store.add(quickInputService.createQuickPick<IChatPickerItem>({ useSeparators: true }));
			picker.placeholder = localize('interactiveSession.history.pick', "Switch to chat");
			const picks = getPicks();
			picker.items = picks;
			store.add(picker.onDidTriggerItemButton(async context => {
				if (context.button === openInEditorButton) {
					const options: IChatEditorOptions = { target: { sessionId: context.item.chat.sessionId }, pinned: true };
					editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options }, ACTIVE_GROUP);
					picker.hide();
				} else if (context.button === deleteButton) {
					chatService.removeHistoryEntry(context.item.chat.sessionId);
					picker.items = getPicks();
				} else if (context.button === renameButton) {
					const title = await quickInputService.input({ title: localize('newChatTitle', "New chat title"), value: context.item.chat.title });
					if (title) {
						chatService.setChatSessionTitle(context.item.chat.sessionId, title);
					}

					// The quick input hides the picker, it gets disposed, so we kick it off from scratch
					showPicker();
				}
			}));
			store.add(picker.onDidAccept(async () => {
				try {
					const item = picker.selectedItems[0];
					const sessionId = item.chat.sessionId;
					const view = await viewsService.openView(CHAT_VIEW_ID) as ChatViewPane;
					view.loadSession(sessionId);
				} finally {
					picker.hide();
				}
			}));
			store.add(picker.onDidHide(() => store.dispose()));

			picker.show();
		};
		showPicker();
	}
}

class OpenChatEditorAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.openChat`,
			title: localize2('interactiveSession.open', "Open Editor"),
			f1: true,
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled
		});
	}

	async run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: { pinned: true } satisfies IChatEditorOptions });
	}
}


class ChatAddAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.addParticipant',
			title: localize2('chatWith', "Chat with Extension"),
			icon: Codicon.mention,
			f1: false,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatInput,
				when: ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
				group: 'navigation',
				order: 1
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const widgetService = accessor.get(IChatWidgetService);
		const context: { widget?: IChatWidget } | undefined = args[0];
		const widget = context?.widget ?? widgetService.lastFocusedWidget;
		if (!widget) {
			return;
		}

		const hasAgentOrCommand = extractAgentAndCommand(widget.parsedInput);
		if (hasAgentOrCommand?.agentPart || hasAgentOrCommand?.commandPart) {
			return;
		}

		const suggestCtrl = SuggestController.get(widget.inputEditor);
		if (suggestCtrl) {
			const curText = widget.inputEditor.getValue();
			const newValue = curText ? `@ ${curText}` : '@';
			if (!curText.startsWith('@')) {
				widget.inputEditor.setValue(newValue);
			}

			widget.inputEditor.setPosition(new Position(1, 2));
			suggestCtrl.triggerSuggest(undefined, true);
		}
	}
}

export function registerChatActions() {
	registerAction2(OpenChatGlobalAction);
	registerAction2(ChatHistoryAction);
	registerAction2(OpenChatEditorAction);
	registerAction2(ChatAddAction);

	registerAction2(class ClearChatInputHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.clearInputHistory',
				title: localize2('interactiveSession.clearHistory.label', "Clear Input History"),
				precondition: ChatContextKeys.enabled,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const historyService = accessor.get(IChatWidgetHistoryService);
			historyService.clearHistory();
		}
	});

	registerAction2(class ClearChatHistoryAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.clearHistory',
				title: localize2('chat.clear.label', "Clear All Workspace Chats"),
				precondition: ChatContextKeys.enabled,
				category: CHAT_CATEGORY,
				f1: true,
			});
		}
		async run(accessor: ServicesAccessor, ...args: any[]) {
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const viewsService = accessor.get(IViewsService);

			const chatService = accessor.get(IChatService);
			chatService.clearAllHistoryEntries();

			const chatView = viewsService.getViewWithId(CHAT_VIEW_ID) as ChatViewPane | undefined;
			if (chatView) {
				chatView.widget.clear();
			}

			// Clear all chat editors. Have to go this route because the chat editor may be in the background and
			// not have a ChatEditorInput.
			editorGroupsService.groups.forEach(group => {
				group.editors.forEach(editor => {
					if (editor instanceof ChatEditorInput) {
						clearChatEditor(accessor, editor);
					}
				});
			});
		}
	});

	registerAction2(class FocusChatAction extends EditorAction2 {
		constructor() {
			super({
				id: 'chat.action.focus',
				title: localize2('actions.interactiveSession.focus', 'Focus Chat List'),
				precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
				category: CHAT_CATEGORY,
				keybinding: [
					// On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
					{
						when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					// On win/linux, ctrl+up can always focus the chat list
					{
						when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.EditorContrib,
					},
					{
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
						primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
					}
				]
			});
		}

		runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
			const editorUri = editor.getModel()?.uri;
			if (editorUri) {
				const widgetService = accessor.get(IChatWidgetService);
				widgetService.getWidgetByInputUri(editorUri)?.focusLastMessage();
			}
		}
	});

	registerAction2(class FocusChatInputAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.focusInput',
				title: localize2('interactiveSession.focusInput.label', "Focus Chat Input"),
				f1: false,
				keybinding: [
					{
						primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat.negate()),
					},
					{
						when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat),
						primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
						weight: KeybindingWeight.WorkbenchContrib,
					}
				]
			});
		}
		run(accessor: ServicesAccessor, ...args: any[]) {
			const widgetService = accessor.get(IChatWidgetService);
			widgetService.lastFocusedWidget?.focusInput();
		}
	});

	registerAction2(InstallChatWithPromptAction);
	registerAction2(InstallChatWithoutPromptAction);
	registerAction2(LearnMoreChatAction);
}

export function stringifyItem(item: IChatRequestViewModel | IChatResponseViewModel, includeName = true): string {
	if (isRequestVM(item)) {
		return (includeName ? `${item.username}: ` : '') + item.messageText;
	} else {
		return (includeName ? `${item.username}: ` : '') + item.response.toString();
	}
}


// --- command center chat

MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.ChatCommandCenter,
	title: localize('title4', "Chat"),
	icon: defaultChat.icon,
	when: ContextKeyExpr.and(
		ContextKeyExpr.has('config.chat.commandCenter.enabled'),
		ContextKeyExpr.or(ChatContextKeys.panelParticipantRegistered, ChatContextKeys.installEntitled)
	),
	order: 10001,
});

registerAction2(class ToggleChatControl extends ToggleTitleBarConfigAction {
	constructor() {
		super(
			'chat.commandCenter.enabled',
			localize('toggle.chatControl', 'Chat Controls'),
			localize('toggle.chatControlsDescription', "Toggle visibility of the Chat Controls in title bar"), 3, false,
			ContextKeyExpr.and(
				ContextKeyExpr.has('config.window.commandCenter'),
				ContextKeyExpr.or(ChatContextKeys.panelParticipantRegistered, ChatContextKeys.installEntitled)
			)
		);
	}
});

export class ChatCommandCenterRendering implements IWorkbenchContribution {

	static readonly ID = 'chat.commandCenterRendering';

	private readonly _store = new DisposableStore();

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IChatAgentService agentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {

		this._store.add(actionViewItemService.register(MenuId.CommandCenter, MenuId.ChatCommandCenter, (action, options) => {

			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({
				id: 'chat.commandCenter.more',
				label: localize('more', "More..."),
				run() { }
			});

			const chatExtensionInstalled = agentService.getAgents().some(agent => agent.isDefault);

			const primaryAction = instantiationService.createInstance(MenuItemAction, {
				id: chatExtensionInstalled ? CHAT_OPEN_ACTION_ID : InstallChatWithPromptAction.ID,
				title: chatExtensionInstalled ? OpenChatGlobalAction.TITLE : InstallChatWithPromptAction.TITLE,
				icon: defaultChat.icon,
			}, undefined, undefined, undefined, undefined);

			return instantiationService.createInstance(
				DropdownWithPrimaryActionViewItem,
				primaryAction, dropdownAction, action.actions,
				'',
				{
					...options,
					skipTelemetry: true, // already handled by the workbench action bar
				}
			);

		}, agentService.onDidChangeAgents));
	}

	dispose() {
		this._store.dispose();
	}
}

abstract class BaseInstallChatAction extends Action2 {

	protected abstract getJustification(productService: IProductService): string | undefined;

	override async run(accessor: ServicesAccessor): Promise<void> {
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const productService = accessor.get(IProductService);
		const telemetryService = accessor.get(ITelemetryService);

		type InstallChatClassification = {
			owner: 'bpasero';
			comment: 'Provides insight into chat installation.';
			installResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was installed successfully, cancelled or failed to install.' };
			hasJustification: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of window error to understand the nature of the error better.' };
		};
		type InstallChatEvent = {
			hasJustification: boolean;
			installResult: 'installed' | 'cancelled' | 'failed';
		};

		const justification = this.getJustification(productService);

		let installResult: 'installed' | 'cancelled' | 'failed';
		try {
			await extensionsWorkbenchService.install(defaultChat.extensionId, {
				justification,
				enable: true,
				installPreReleaseVersion: productService.quality !== 'stable'
			}, ProgressLocation.Notification);

			installResult = 'installed';
		} catch (error) {
			installResult = isCancellationError(error) ? 'cancelled' : 'failed';
		}

		telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', {
			installResult,
			hasJustification: !!justification
		});
	}
}

class InstallChatWithPromptAction extends BaseInstallChatAction {

	static readonly ID = 'workbench.action.chat.installWithPrompt';
	static readonly TITLE = localize2('installChat', "Install {0}", defaultChat.name);

	constructor() {
		super({
			id: InstallChatWithPromptAction.ID,
			title: InstallChatWithPromptAction.TITLE,
			icon: defaultChat.icon,
			category: CHAT_CATEGORY
		});
	}

	protected getJustification(productService: IProductService): string {
		return localize('installChatGlobalAction.justification', "AI features in {0} require this extension. Your account already has access to {1}.", productService.nameShort, defaultChat.name);
	}
}

class InstallChatWithoutPromptAction extends BaseInstallChatAction {

	static readonly ID = 'workbench.action.chat.installWithoutPrompt';
	static readonly TITLE = localize2('installChat', "Install {0}", defaultChat.name);

	constructor() {
		super({
			id: InstallChatWithoutPromptAction.ID,
			title: InstallChatWithoutPromptAction.TITLE,
			category: CHAT_CATEGORY,
			menu: {
				id: MenuId.ChatCommandCenter,
				group: 'a_atfirst',
				order: 1,
				when: ChatContextKeys.panelParticipantRegistered.negate()
			}
		});
	}

	protected getJustification(): string | undefined {
		return undefined;
	}
}

class LearnMoreChatAction extends Action2 {

	static readonly ID = 'workbench.action.chat.learnMore';
	static readonly TITLE = localize2('learnMore', "Learn More");

	constructor() {
		super({
			id: LearnMoreChatAction.ID,
			title: LearnMoreChatAction.TITLE,
			category: CHAT_CATEGORY,
			menu: [{
				id: MenuId.ChatCommandCenter,
				group: 'a_atfirst',
				order: 2,
				when: ChatContextKeys.panelParticipantRegistered.negate()
			}, {
				id: MenuId.ChatCommandCenter,
				group: 'z_atlast',
				order: 1,
				when: ChatContextKeys.panelParticipantRegistered
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		if (defaultChat.documentationUrl) {
			openerService.open(URI.parse(defaultChat.documentationUrl));
		}
	}
}
