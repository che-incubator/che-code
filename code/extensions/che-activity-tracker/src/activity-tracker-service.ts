/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
import * as vscode from "vscode";

export type WorkspaceService = { updateWorkspaceActivity: () => any };

/**
 * Receives activity updates and sends reset inactivity requests to the che-machine-exec /activity/tick endpoint.
 * To avoid duplicate requests may send requests periodically. This means
 * that, in the worst case, it might keep user's workspace alive for a longer period of time.
 */
export class ActivityTrackerService {
	// Time before sending next request. If multiple requests are received during this period,
	// only one request will be sent. A second request will be sent after this period ends.
	private static REQUEST_PERIOD_MS = 1 * 60 * 1000;
	// Time before resending request to che-machine-exec if a network error occurs.
	private static RETRY_REQUEST_PERIOD_MS = 5 * 1000;
	// Number of retries before give up if a network error occurs.
	private static RETRY_COUNT = 5;

	// Indicates state of the timer. If true timer is running.
	private isTimerRunning: boolean;
	// Flag which is used to check if new requests were received during timer awaiting.
	private isNewRequest: boolean;
	// Flag used to keep track whether the ping error warning was already displayed or not.
	private errorDisplayed: boolean;
	private workspaceService: WorkspaceService;
	private channel: vscode.OutputChannel;

	constructor(workspaceService: WorkspaceService, channel: vscode.OutputChannel) {
		this.isTimerRunning = false;
		this.isNewRequest = false;
		this.errorDisplayed = false;
		this.workspaceService = workspaceService;
		this.channel = channel;
	}

	/**
	 * Invoked each time when a client sends an activity request.
	 */
	async resetTimeout(): Promise<void> {
		if (this.isTimerRunning) {
			this.isNewRequest = true;
			return;
		}
		await this.sendRequestAndSetTimer();
	}

	private async sendRequestAndSetTimer(): Promise<void> {
		this.sendRequest(ActivityTrackerService.RETRY_COUNT);
		this.isNewRequest = false;

		setTimeout(
			() => this.checkNewRequestsTimerCallback(),
			ActivityTrackerService.REQUEST_PERIOD_MS
		);
		this.isTimerRunning = true;
	}

	private checkNewRequestsTimerCallback(): void {
		this.isTimerRunning = false;

		if (this.isNewRequest) {
			this.sendRequestAndSetTimer();
		}
	}

	private async sendRequest(
		attemptsLeft: number = ActivityTrackerService.RETRY_COUNT
	): Promise<void> {
		try {
			await this.workspaceService.updateWorkspaceActivity();
		} catch (error) {
			if (attemptsLeft > 0) {
				await new Promise((resolve) => setTimeout(resolve, ActivityTrackerService.RETRY_REQUEST_PERIOD_MS));
				await this.sendRequest(--attemptsLeft);
			} else {
				this.channel.appendLine('Activity tracker: Failed to ping che-machine-exec: ' + error.message);
				if (!this.errorDisplayed) {
					this.errorDisplayed = true;
					await this.showErrorMessage();
					this.errorDisplayed = false;
				}
			}
		}
	}

	private async showErrorMessage(): Promise<void> {
		const viewText = 'View Logs';
		const response = await vscode.window.showErrorMessage(
			this.getErrorMessage(),
			viewText
		);

		if (response === viewText) {
			this.channel.show();
		}
	}

	private getErrorMessage(): string {

		let message = 'Failed to communicate with idling service.';

		const idletimeout = process.env.SECONDS_OF_DW_INACTIVITY_BEFORE_IDLING;
		if (idletimeout) {
			const timeoutInSeconds = parseInt(idletimeout);
			if (!isNaN(timeoutInSeconds)) {
				message += ` This development environment may automatically terminate in ${this.getTimeString(timeoutInSeconds)}.`;
			}
		} else {
			message += ' This development environment may automatically terminate soon.';
		}

		message += ' For environments with the ephemeral storage type, you may lose any unsaved work. Please contact an administrator.'
		return message;
	}

	private getTimeString(_seconds: number): string {
		const hours = Math.floor(_seconds / 3600);
		const minutes = Math.floor((_seconds % 3600) / 60);
		const seconds = _seconds % 60;

		let output = '';

		if (hours > 0) {
			output += `${hours} hour`;
			if (hours > 1) {
				output += 's';
			}
		}

		if (minutes > 0) {
			output += ` ${minutes} minute`;
			if (minutes > 1) {
				output += 's';
			}
		}

		if (seconds > 0) {
			output += ` ${seconds} second`;
			if (seconds > 1) {
				output += 's';
			}
		}
		return output
	}
}
