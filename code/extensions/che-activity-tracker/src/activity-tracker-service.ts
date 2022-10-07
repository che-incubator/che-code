/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

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

	private workspaceService: WorkspaceService;

	constructor(workspaceService: WorkspaceService) {
		this.isTimerRunning = false;
		this.isNewRequest = false;
		this.workspaceService = workspaceService;
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

	private sendRequest(
		attemptsLeft: number = ActivityTrackerService.RETRY_COUNT,
	): void {
		try {
			this.workspaceService.updateWorkspaceActivity();
		} catch (error) {
			if (attemptsLeft > 0) {
			  setTimeout(this.sendRequest, ActivityTrackerService.RETRY_REQUEST_PERIOD_MS, --attemptsLeft);
			} else {
			  console.error('Activity tracker: Failed to ping che-machine-exec: ', error.message);
			}
		}
	}
}
