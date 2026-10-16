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

import { IContextKeyService, IReadableSet } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../../../services/chat/common/chatEntitlementService.js';
import { chatViewsWelcomeRegistry } from '../chatViewsWelcome.js';

export const GITHUB_LOGIN_FAILED_CONTEXT_KEY = 'github.copilot.interactiveSession.gitHubLoginFailed';

/**
 * Context keys {@link hasGitHubLoginFailedWelcome} depends on (besides the welcome descriptors registry):
 * the GitHub login state and the BYOK models, which the welcome view is not shown for.
 */
export const GITHUB_LOGIN_FAILED_WELCOME_CONTEXT_KEYS: IReadableSet<string> = new Set([GITHUB_LOGIN_FAILED_CONTEXT_KEY, ChatEntitlementContextKeys.hasByokModels.key]);

/**
 * Whether Copilot reports a GitHub login failure and its welcome view (offering Sign In) matches.
 * Not the case e.g. when BYOK models are available, even if another welcome view matches.
 */
export function hasGitHubLoginFailedWelcome(contextKeyService: IContextKeyService): boolean {
	if (!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY)) {
		return false;
	}
	return chatViewsWelcomeRegistry.get().some(descriptor =>
		descriptor.when.keys().includes(GITHUB_LOGIN_FAILED_CONTEXT_KEY) && contextKeyService.contextMatchesRules(descriptor.when));
}
