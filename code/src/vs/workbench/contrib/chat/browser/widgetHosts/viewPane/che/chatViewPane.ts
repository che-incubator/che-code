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
import { ChatEntitlementContextKeys } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { chatViewsWelcomeRegistry } from '../../../viewsWelcome/chatViewsWelcome.js';

const GITHUB_LOGIN_FAILED_CONTEXT_KEY = 'github.copilot.interactiveSession.gitHubLoginFailed';

/**
 * Whether the Copilot "Sign In" welcome view should be shown because the GitHub token cannot be exchanged for a Copilot token.
 * Copilot cannot serve any request then, so the current chat is replaced until sign-in (it stays in history).
 * Only when the GitHub login failed welcome descriptor actually matches (e.g. not when BYOK models are available).
 */
export function shouldShowGitHubLoginFailedWelcome(contextKeyService: IContextKeyService): boolean {
	if (!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY)) {
		return false;
	}
	return chatViewsWelcomeRegistry.get().some(descriptor =>
		descriptor.when.keys().includes(GITHUB_LOGIN_FAILED_CONTEXT_KEY) && contextKeyService.contextMatchesRules(descriptor.when));
}

/**
 * Fires when {@link shouldShowGitHubLoginFailedWelcome} may change: the GitHub login state changes
 * (e.g. Device Authentication completed or token removed) or BYOK models come and go.
 */
export function onDidChangeGitHubLoginFailedWelcome(contextKeyService: IContextKeyService): Event<void> {
	const contextKeys = new Set([GITHUB_LOGIN_FAILED_CONTEXT_KEY, ChatEntitlementContextKeys.hasByokModels.key]);
	return Event.signal(Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(contextKeys)));
}
