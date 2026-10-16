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

import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { chatViewsWelcomeRegistry } from '../../viewsWelcome/chatViewsWelcome.js';
import { GITHUB_LOGIN_FAILED_CONTEXT_KEY, hasGitHubLoginFailedWelcome } from '../../viewsWelcome/che/chatViewsWelcome.js';

/**
 * Clears the panel agents when Copilot reports a GitHub login failure (e.g. the workspace PAT
 * cannot be exchanged for a Copilot token), so that the Sign In welcome view is shown.
 */
export function clearPanelAgentsIfGitHubLoginFailed(contextKeyService: IContextKeyService, logService: ILogService, panelAgentDisposables: IDisposable): void {
	if (hasGitHubLoginFailedWelcome(contextKeyService)) {
		logService.error('[chat setup] GitHub login failed detected, clearing panel agent registration to show welcome view.');
		panelAgentDisposables.dispose();
	}
}

/**
 * Re-creates the setup agents when the GitHub login state changes
 * (e.g. after completing Device Authentication or when the token is removed).
 */
export function registerGitHubLoginStateListeners(contextKeyService: IContextKeyService, recreateAgents: () => void): IDisposable {
	const disposables = new DisposableStore();

	const recreateAgentsIfGitHubLoginFailed = () => {
		if (hasGitHubLoginFailedWelcome(contextKeyService)) {
			recreateAgents();
		}
	};

	// Only react to real transitions: Copilot sets the key from `undefined` to `false`
	// on every startup, which must not re-register the setup agents
	const gitHubLoginFailedContextKeys = new Set([GITHUB_LOGIN_FAILED_CONTEXT_KEY]);
	let gitHubLoginFailed = !!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY);
	disposables.add(contextKeyService.onDidChangeContext(e => {
		if (!e.affectsSome(gitHubLoginFailedContextKeys)) {
			return;
		}
		const newGitHubLoginFailed = !!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY);
		if (newGitHubLoginFailed === gitHubLoginFailed) {
			return;
		}
		gitHubLoginFailed = newGitHubLoginFailed;
		if (gitHubLoginFailed) {
			recreateAgentsIfGitHubLoginFailed();
		} else {
			recreateAgents();
		}
	}));

	// Safety net: if gitHubLoginFailed was set before welcome descriptors
	// were registered, retry when the registry changes
	disposables.add(chatViewsWelcomeRegistry.onDidChange(() => recreateAgentsIfGitHubLoginFailed()));

	return disposables;
}
