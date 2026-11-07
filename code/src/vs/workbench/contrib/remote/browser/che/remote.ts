/**********************************************************************
 * Copyright (c) 2023 - 2026 Red Hat, Inc.
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
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';

const CANCEL_LABEL = nls.localize('cancel', "Cancel");
const RELOAD_WINDOW_LABEL = nls.localize('reloadWindow', "Reload Window");
const RESTART_WORKSPACE_LABEL = nls.localize('disconnectionHandler.button.restart', 'Restart your workspace');
const RETURN_TO_DASHBOARD_LABEL = nls.localize('disconnectionHandler.button.returnToDashboard', 'Return to dashboard');

const WORKSPACE_STATE = nls.localize('disconnectionHandler.message.workspaceState', 'Getting workspace state...');
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

class DevWorkspacePollingTimeoutError extends Error {
	constructor(public readonly lastWorkspace?: DevWorkspaceLike,public readonly lastObservedPhase?: string) {
		super("Timed out waiting for DevWorkspace state.");
		this.name = "DevWorkspacePollingTimeoutError";
	}
}

/**
 * Time for the Che disconnection handler to detect (and handle) if a dev workspace was stopped and figure out the reason the workspace was stopped 
 * The default behaviour should be applied if the Che handler can not detect the state of the workspace during this time.
 */
const DISCONNECTION_HANDLING_TIME = 30 * 1000; // 30 seconds
const WORKSPACE_POLL_INTERVAL = 2 * 1000; // 2 seconds

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
		private progressService: IProgressService
	) {
		this.devWorkspaceAssistant = new DevWorkspaceAssistant(requestService, environmentVariableService, progressService);
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

	/**
	 * Wait until the workspace reaches a stable phase.
	 *
	 * Starting, Failing, Stopping and Terminating are transitional phases.
	 * Temporary API errors are retried because the API may be unavailable
	 * while the workspace pod is being restarted.
	 */
	private async getDevWorkspaceUntilStable(): Promise<DevWorkspaceLike> {
		const deadline = Date.now() + DISCONNECTION_HANDLING_TIME;
		let lastWorkspace: DevWorkspaceLike | undefined;
    	let lastObservedPhase: string | undefined;

  		return this.progressService.withProgress(
        {
            location: ProgressLocation.Notification,
            title: WORKSPACE_STATE
        },
        async () => {
			while (Date.now() < deadline) {
				try {
					const devWorkspace = await this.devWorkspaceAssistant.getDevWorkspace();
					const phase = devWorkspace?.status?.phase;

					if (phase) {
						lastWorkspace = devWorkspace;
						lastObservedPhase = phase;

						if (phase === DevWorkspaceStatus.FAILED) {
                            return devWorkspace;
                        }

						if (
							phase &&
							phase !== DevWorkspaceStatus.STARTING &&
							phase !== DevWorkspaceStatus.FAILING &&
							phase !== DevWorkspaceStatus.STOPPING &&
							phase !== DevWorkspaceStatus.TERMINATING
						) {
							return devWorkspace;
						}
					}
				} catch (error) {
					// ignore errors and retry
				}

				const remainingTime = deadline - Date.now();
				if (remainingTime > 0) {
					await new Promise(resolve =>
						setTimeout(resolve, Math.min(WORKSPACE_POLL_INTERVAL, remainingTime))
					);
				}
			}
			throw new DevWorkspacePollingTimeoutError(lastWorkspace, lastObservedPhase);
		});
	}

	private async handle(type: PersistentConnectionEventType): Promise<void> {
		if (this.status !== DisconnectionHandlerStatus.AVAILABLE) {
			return;
		}

		if (this.devWorkspaceAssistant.pendingAction === 'stopping') {
			this.status = DisconnectionHandlerStatus.AVAILABLE;
			return;
		}

		// the Che handler is waiting for the dev workspace to start - so, the default behaviour should NOT be applied
		this.status = DisconnectionHandlerStatus.IN_PROGRESS;

		let devWorkspace: DevWorkspaceLike;
		try {
			devWorkspace = await this.getDevWorkspaceUntilStable();
		} catch (error) {
	        const currentPendingAction = this.devWorkspaceAssistant.pendingAction as 'idle' | 'restartPending' | 'stopping';

			if (currentPendingAction === 'stopping') {
				this.status = DisconnectionHandlerStatus.AVAILABLE;
				return;
			}

			if (currentPendingAction === 'restartPending') {

				const pollingError = error instanceof DevWorkspacePollingTimeoutError ? error : undefined;

				if (pollingError?.lastObservedPhase === DevWorkspaceStatus.FAILED || pollingError?.lastObservedPhase === DevWorkspaceStatus.FAILING) {

					this.status = DisconnectionHandlerStatus.AVAILABLE;
					if (pollingError.lastWorkspace) {
                		await this.onDisconnectionStoppedWorkspace(pollingError.lastWorkspace);
            		}
            		return;
				}
				
				if (pollingError && !pollingError?.lastObservedPhase) {
            		this.status = DisconnectionHandlerStatus.AVAILABLE;
            		this.devWorkspaceAssistant.startWorkspace();
            		return;
        		}

			}

			this.status = DisconnectionHandlerStatus.FAILED;
			return;
		}

		if (!devWorkspace || !devWorkspace.status) {
			this.status = DisconnectionHandlerStatus.FAILED;
			return;
		}

		const workspacePhase = devWorkspace.status.phase;
	    const currentPendingAction = this.devWorkspaceAssistant.pendingAction as 'idle' | 'restartPending' | 'stopping';

		if (currentPendingAction === 'stopping') {
       	 	this.status = DisconnectionHandlerStatus.AVAILABLE;
        	return;
    	}

		// Handle a pending restart only after the workspace reaches a stable phase.
		if (currentPendingAction === 'restartPending') {
			// Never automatically restart a workspace that has failed.
			if (workspacePhase === DevWorkspaceStatus.FAILED || workspacePhase === DevWorkspaceStatus.FAILING) {
				this.status = DisconnectionHandlerStatus.AVAILABLE;
				// Show the workspace-specific recovery dialog.
				await this.onDisconnectionStoppedWorkspace(devWorkspace);
				return;
			}

			this.status = DisconnectionHandlerStatus.AVAILABLE;
			this.devWorkspaceAssistant.startWorkspace();
			return;
		}

		if (workspacePhase === DevWorkspaceStatus.STARTING || workspacePhase === DevWorkspaceStatus.RUNNING) {
			return this.onDisconnectionRunningWorkspace(type);
		}
		return this.onDisconnectionStoppedWorkspace(devWorkspace);
	}

	handleStateChange(millisSinceLastIncomingData: number, type: PersistentConnectionEventType): boolean {
		const restartPending = this.devWorkspaceAssistant.pendingAction === 'restartPending';

		// Intercept permanent failure while a restart is pending,
		// even if the normal disconnection handling time has elapsed.
		if (restartPending && type === PersistentConnectionEventType.ReconnectionPermanentFailure && this.status !== DisconnectionHandlerStatus.FAILED) {
			if (this.status === DisconnectionHandlerStatus.AVAILABLE) {
				void this.handle(type).catch(() => {
    				this.status = DisconnectionHandlerStatus.FAILED;
				});
			}
			return true;
		}

		if (this.canHandle(millisSinceLastIncomingData)) {
			void this.handle(type).catch(() => {
    			this.status = DisconnectionHandlerStatus.FAILED;
			});
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
		if ((workspacePhase === DevWorkspaceStatus.FAILED  || workspacePhase === DevWorkspaceStatus.FAILING) && statusMessage) {
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
