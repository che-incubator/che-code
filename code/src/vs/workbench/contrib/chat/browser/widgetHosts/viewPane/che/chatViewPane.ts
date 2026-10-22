/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { Event } from '../../../../../../../base/common/event.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { GITHUB_LOGIN_FAILED_WELCOME_CONTEXT_KEYS, hasGitHubLoginFailedWelcome } from '../../../viewsWelcome/che/chatViewsWelcome.js';

/**
 * Whether the Copilot "Sign In" welcome view should be shown because the GitHub token cannot be exchanged for a Copilot token.
 * Copilot cannot serve any request then, so the current chat is replaced until sign-in (it stays in history).
 * Only when the GitHub login failed welcome descriptor actually matches (e.g. not when BYOK models are available).
 */
export function shouldShowGitHubLoginFailedWelcome(contextKeyService: IContextKeyService): boolean {
	return hasGitHubLoginFailedWelcome(contextKeyService);
}

/**
 * Creates a function that hides the chat controls (title and chat widget) while the welcome view is showing:
 * the chat widget hides only its list and input, and the CSS rules that hid the controls do not match
 * the current DOM structure. It relayouts when the welcome view is hidden again, because a layout while
 * it was showing measured the hidden title as 0 high.
 */
export function createChatControlsVisibilityUpdater(chatControlsContainer: HTMLElement, setWidgetVisible: (visible: boolean) => void, relayout: () => void): (isWelcomeShowing: boolean) => void {
	let wasWelcomeShowing = false;
	return isWelcomeShowing => {
		chatControlsContainer.style.display = isWelcomeShowing ? 'none' : '';
		setWidgetVisible(!isWelcomeShowing);
		if (wasWelcomeShowing && !isWelcomeShowing) {
			relayout();
		}
		wasWelcomeShowing = isWelcomeShowing;
	};
}

/**
 * Fires when {@link shouldShowGitHubLoginFailedWelcome} may change: the GitHub login state changes
 * (e.g. Device Authentication completed or token removed) or BYOK models come and go.
 */
export function onDidChangeGitHubLoginFailedWelcome(contextKeyService: IContextKeyService): Event<void> {
	return Event.signal(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(GITHUB_LOGIN_FAILED_WELCOME_CONTEXT_KEYS)));
}
