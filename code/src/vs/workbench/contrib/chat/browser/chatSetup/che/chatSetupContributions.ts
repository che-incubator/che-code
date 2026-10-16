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
import { GITHUB_LOGIN_FAILED_CONTEXT_KEY, GITHUB_LOGIN_FAILED_WELCOME_CONTEXT_KEYS, hasGitHubLoginFailedWelcome } from '../../viewsWelcome/che/chatViewsWelcome.js';

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
 * Re-creates the setup agents when the Sign In welcome view comes or goes (e.g. after completing
 * Device Authentication, when the token is removed or when BYOK models come and go), or when the
 * GitHub login recovers.
 */
export function registerGitHubLoginStateListeners(contextKeyService: IContextKeyService, recreateAgents: () => void): IDisposable {
	const disposables = new DisposableStore();

	// Only react to real changes: Copilot sets the login failed key from `undefined` to `false`
	// on every startup, which must not re-register the setup agents
	let gitHubLoginFailed = !!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY);
	let hasWelcome = hasGitHubLoginFailedWelcome(contextKeyService);
	const update = () => {
		const newGitHubLoginFailed = !!contextKeyService.getContextKeyValue<boolean>(GITHUB_LOGIN_FAILED_CONTEXT_KEY);
		const newHasWelcome = hasGitHubLoginFailedWelcome(contextKeyService);
		// A recovered login also restores panel agents that were cleared while the welcome view was not shown
		const shouldRecreateAgents = newHasWelcome !== hasWelcome || (gitHubLoginFailed && !newGitHubLoginFailed);
		gitHubLoginFailed = newGitHubLoginFailed;
		hasWelcome = newHasWelcome;
		if (shouldRecreateAgents) {
			recreateAgents();
		}
	};

	disposables.add(contextKeyService.onDidChangeContext(e => {
		if (e.affectsSome(GITHUB_LOGIN_FAILED_WELCOME_CONTEXT_KEYS)) {
			update();
		}
	}));

	// Welcome descriptors may be registered after gitHubLoginFailed was set
	disposables.add(chatViewsWelcomeRegistry.onDidChange(() => update()));

	return disposables;
}
