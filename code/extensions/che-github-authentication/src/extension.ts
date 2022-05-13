/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as vscode from 'vscode';
import { v4 } from 'uuid';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const extensionApi = vscode.extensions.getExtension('eclipse-che.api');
    if (!extensionApi) {
        throw new Error("Extension 'eclipse-che.api' is not installed");
    }
    await extensionApi.activate();
    const cheApi: any = extensionApi?.exports;
    const githubService = cheApi.getGithubService();

    const sessions: vscode.AuthenticationSession[] = context.workspaceState.get('sessions') || [];
    const onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    vscode.authentication.registerAuthenticationProvider('github', 'GitHub', {
        onDidChangeSessions: onDidChangeSessions.event,
        getSessions: async () => sessions,
        createSession: async (scopes: string[]) => {
            let token = '';
            try {
                token = await githubService.getToken();
            } catch (e) {
                if (
                    await vscode.window.showWarningMessage(
                        'Che could not authenticate to your Github account. The setup for Github OAuth provider is not complete.',
                        'Setup instructions'
                    )
                ) {
                    vscode.commands.executeCommand(
                        'vscode.open',
                        'https://www.eclipse.org/che/docs/che-7/administration-guide/configuring-authorization/#configuring-github-oauth_che'
                    );
                }
            }
            const githubUser = await githubService.getUser();
            const session = {
                id: v4(),
                accessToken: token,
                account: { label: githubUser.login, id: githubUser.id.toString() },
                scopes,
            };
            const sessionIndex = sessions.findIndex(s => s.id === session.id);
            if (sessionIndex > -1) {
                sessions.splice(sessionIndex, 1, session);
            } else {
                sessions.push(session);
            }
            context.workspaceState.update('sessions', sessions);
            onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
            return session;
        },
        removeSession: async (id: string) => {
            const session = sessions.find(s => s.id === id);
            if (session) {
                sessions.splice(sessions.findIndex(s => s.id === id), 1);
                context.workspaceState.update('sessions', sessions);
                onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
            }
        },
    });
}

export function deactivate(): void {
}
