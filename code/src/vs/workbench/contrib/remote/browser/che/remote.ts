/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import Severity from '../../../../../base/common/severity.js';
import * as nls from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IPromptButton } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, IPromptChoice } from '../../../../../platform/notification/common/notification.js';
import { PersistentConnectionEventType } from '../../../../../platform/remote/common/remoteAgentConnection.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { ReloadWindowAction } from '../../../../browser/actions/windowActions.js';
import { DevWorkspaceAssistant, DevWorkspaceLike, DevWorkspaceStatus } from './devWorkspaceAssistant.js';
import { IEnvironmentVariableService } from '../../../terminal/common/environmentVariable.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';

const CANCEL_LABEL = nls.localize('cancel', "Cancel");
const RELOAD_WINDOW_LABEL = nls.localize('reloadWindow', "Reload Window");
const RESTART_WORKSPACE_LABEL = nls.localize('disconnectionHandler.button.restart', 'Restart your workspace');
const RETURN_TO_DASHBOARD_LABEL = nls.localize('disconnectionHandler.button.returnToDashboard', 'Return to dashboard');

const WORKSPACE_STOPPED = nls.localize('disconnectionHandler.message.workspaceStopped', 'Your workspace is not running.');
const WORKSPACE_FAILED = nls.localize('disconnectionHandler.message.workspaceFailed', 'The workspace has failed with the following error');
const WORKSPACE_STOPPED_BY_INACTIVITY = nls.localize('disconnectionHandler.message.workspaceStoppedByInactivity', 'Your workspace has stopped due to inactivity.');
const WORKSPACE_STOPPED_BY_TIMEOUT = nls.localize('disconnectionHandler.message.workspaceStoppedByTimeout', 'Your workspace has stopped because it has reached the run timeout.');
const CAN_NOT_RECONNECT = nls.localize('disconnectionHandler.message.canNotReconnect', 'Cannot reconnect. Please reload the window.');

export enum DisconnectionHandlerStatus {
	AVAILABLE = 'Available',
	IN_PROGRESS = 'InProgress',
	USER_ACTION_WAITING = 'waiting for the user action',
	FAILED = 'Failed'
}

/**
 * Time for the Che disconnection handler to detect (and handle) if a dev workspace was stopped and figure out the reason the workspace was stopped 
 * The default behaviour should be applied if the Che handler can not detect the state of the workspace during this time.
 */
const DISCONNECTION_HANDLING_TIME = 30 * 1000; // 30 seconds

export class CheDisconnectionHandler {
	private devWorkspaceAssistant: DevWorkspaceAssistant;
	private status: DisconnectionHandlerStatus = DisconnectionHandlerStatus.AVAILABLE;

	private reloadWindowHandler = () => {
		this.commandService.executeCommand(ReloadWindowAction.ID);
	}

	private startWorkspaceHandler = () => {
		this.devWorkspaceAssistant.startWorkspace();
	}

	private goToDashboardHandler = () => {
		this.devWorkspaceAssistant.goToDashboard();
	}

	constructor(
		private commandService: ICommandService,
		private dialogService: IDialogService,
		private notificationService: INotificationService,
		requestService: IRequestService,
		environmentVariableService: IEnvironmentVariableService,
		progressService: IProgressService
	) {
		this.devWorkspaceAssistant = new DevWorkspaceAssistant(commandService, requestService, environmentVariableService, progressService);
	}

	private canHandle(millisSinceLastIncomingData: number): boolean {
		// the Che handler is waiting for the user action - so, the default behaviour should NOT be applied
		if (this.status === DisconnectionHandlerStatus.USER_ACTION_WAITING) {
			return true;
		}

		// the handler can not get the dev workspace state
		if (this.status === DisconnectionHandlerStatus.FAILED) {
			return false;
		}

		// the default behaviour should be applied if the Che handler can not detect the state of the workspace during this time
		if (millisSinceLastIncomingData > DISCONNECTION_HANDLING_TIME) {
			return false;
		}
		return true;
	}

	private async handle(type: PersistentConnectionEventType): Promise<void> {
		if (this.status !== DisconnectionHandlerStatus.AVAILABLE) {
			return;
		}

		this.status = DisconnectionHandlerStatus.IN_PROGRESS;
		let devWorkspace;
		try {
			devWorkspace = await this.devWorkspaceAssistant.getDevWorkspace();
		} catch (error) {
			this.status = DisconnectionHandlerStatus.FAILED;
		}

		if (!devWorkspace || !devWorkspace.status) {
			return;
		}

		const workspacePhase = devWorkspace.status.phase;
		if (workspacePhase === DevWorkspaceStatus.STARTING || workspacePhase === DevWorkspaceStatus.RUNNING) {
			return this.onDisconnectionRunningWorkspace(type);
		}

		return this.onDisconnectionStoppedWorkspace(devWorkspace);
	}

	handleStateChange(millisSinceLastIncomingData: number, type: PersistentConnectionEventType): boolean {
		if (this.canHandle(millisSinceLastIncomingData)) {
			this.handle(type);
			return true;
		}

		return false;
	}

	// handle disconnection when dev workspace is not stopped
	protected async onDisconnectionRunningWorkspace(type: PersistentConnectionEventType): Promise<void> {
		if (type !== PersistentConnectionEventType.ReconnectionPermanentFailure) {
			// continue to track state of the dev workspace to detect if the workspace is stopped
			this.status = DisconnectionHandlerStatus.AVAILABLE;
			return;
		}

		this.status = DisconnectionHandlerStatus.USER_ACTION_WAITING;

		const reloadWindowButton: IPromptButton<void> = {
			label: RELOAD_WINDOW_LABEL,
			run: this.reloadWindowHandler
		}

		const cancelButton: IPromptButton<void> = {
			label: CANCEL_LABEL,
			run: () => {
				const reloadWindowChoice: IPromptChoice = {
					label: RELOAD_WINDOW_LABEL,
					isSecondary: false,
					run: this.reloadWindowHandler
				};
				const cancelChoice: IPromptChoice = {
					label: CANCEL_LABEL,
					isSecondary: false,
					run: () => { }
				};
				this.notificationService.prompt(Severity.Error, CAN_NOT_RECONNECT, [reloadWindowChoice, cancelChoice], { sticky: true });
			}
		}

		await this.dialogService.prompt({
			type: Severity.Error,
			message: CAN_NOT_RECONNECT,
			buttons: [reloadWindowButton],
			cancelButton
		});
	}

	// handle disconnection when dev workspace is stopped
	protected async onDisconnectionStoppedWorkspace(devWorkspace: DevWorkspaceLike): Promise<void> {
		// the dev workspace is not running, so it should be restarted
		this.status = DisconnectionHandlerStatus.USER_ACTION_WAITING;

		const workspaceAnnotations = devWorkspace.metadata?.annotations;
		if (workspaceAnnotations) {
			if (workspaceAnnotations[DevWorkspaceAssistant.STOPPED_BY_ANNOTATION] === DevWorkspaceAssistant.INACTIVITY_REASON) {
				return this.displayDialog(WORKSPACE_STOPPED_BY_INACTIVITY, Severity.Warning);
			}

			if (workspaceAnnotations[DevWorkspaceAssistant.STOPPED_BY_ANNOTATION] === DevWorkspaceAssistant.RUN_TIMEOUT_REASON) {
				return this.displayDialog(WORKSPACE_STOPPED_BY_TIMEOUT, Severity.Warning);
			}
		}

		const workspacePhase = devWorkspace.status.phase;
		const statusMessage = devWorkspace.status?.message;
		if (workspacePhase === DevWorkspaceStatus.FAILED && statusMessage) {
			return this.displayDialog(`${WORKSPACE_FAILED}: ${statusMessage}`, Severity.Error);
		}

		return this.displayDialog(WORKSPACE_STOPPED, Severity.Warning);
	}

	protected async displayDialog(message: string, severity: Severity): Promise<void> {
		const restartWorkspaceButton: IPromptButton<void> = {
			label: RESTART_WORKSPACE_LABEL,
			run: this.startWorkspaceHandler
		}

		const goToDashboardButton: IPromptButton<void> = {
			label: RETURN_TO_DASHBOARD_LABEL,
			run: this.goToDashboardHandler
		}

		const cancelButton: IPromptButton<void> = {
			label: CANCEL_LABEL,
			run: () => {
				this.displayNotification(severity, message);
			}
		}

		await this.dialogService.prompt({
			type: severity,
			message,
			buttons: [restartWorkspaceButton, goToDashboardButton],
			cancelButton
		});
	}

	protected displayNotification(severity: Severity, message: string): void {
		const restartWorkspaceChoice: IPromptChoice = {
			label: RESTART_WORKSPACE_LABEL,
			isSecondary: false,
			run: this.startWorkspaceHandler
		};
		const goToDashboardChoice: IPromptChoice = {
			label: RETURN_TO_DASHBOARD_LABEL,
			isSecondary: false,
			run: this.goToDashboardHandler
		};
		this.notificationService.prompt(severity, message, [restartWorkspaceChoice, goToDashboardChoice], { sticky: true });
	}
}
