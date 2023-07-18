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
import { AuthenticationSession } from 'vscode';
import { Container } from 'inversify';
import { K8sHelper } from './k8s-helper';
import { ErrorHandler } from './error-handler';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const extensionApi = vscode.extensions.getExtension('eclipse-che.api');
    if (!extensionApi) {
        throw new Error("Extension 'eclipse-che.api' is not installed");
    }
    await extensionApi.activate();
    const cheApi: any = extensionApi?.exports;
    const container = new Container();

    container.bind(Symbol.for('DevfileServiceInstance')).toConstantValue(cheApi.getDevfileService());
    container.bind(K8sHelper).toSelf().inSingletonScope();
    container.bind(ErrorHandler).toSelf().inSingletonScope();

    const errorHandler = container.get(ErrorHandler);
    const githubService = cheApi.getGithubService();

    const sessions: vscode.AuthenticationSession[] = context.workspaceState.get('sessions') || [];
    const onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    vscode.authentication.registerAuthenticationProvider('github', 'GitHub', {
        onDidChangeSessions: onDidChangeSessions.event,
        getSessions: async sessionScopes => {
            const filteredSessions: AuthenticationSession[] = [];
            for (const session of sessions) {
                try {
                    const tokenScopes: string[] = await githubService.getTokenScopes(session.accessToken);
                    if (sessionScopes && sessionScopes.every(sessionScope => tokenScopes.some(
                        tokenScope =>
                            sessionScope === tokenScope
                            // compare partial scope with a full group scope e.g. "read:user" with "user".
                            || sessionScope.includes(tokenScope + ':')
                            || sessionScope.includes(':' + tokenScope)))) {
                        filteredSessions.push(session);
                    }
                } catch (e) {
                    console.warn(e.message);
                }
            }
            return filteredSessions;
        },
        createSession: async (scopes: string[]) => {
            let token = '';
            try {
                token = await githubService.getToken();
            } catch (error) {
                errorHandler.onUnauthorizedError();
                throw new Error(error.message);
            }

            let githubUser;
            try {
                githubUser = await githubService.getUser();
            } catch (error) {
                if (error && error.response && error.response.status === 401) {
                    errorHandler.onUnauthorizedError();
                }
                throw new Error(error.message);
            }

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
