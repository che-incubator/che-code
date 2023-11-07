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

import { Container } from 'inversify';
import * as vscode from 'vscode';
import { DeviceAuthentication } from './device-authentication';
import { ErrorHandler } from './error-handler';
import { ExtensionContext } from './extension-context';
import { GitHubAuthProvider } from './github';
import { K8sHelper } from './k8s-helper';
import { Logger } from './logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const extensionApi = vscode.extensions.getExtension('eclipse-che.api');
    if (!extensionApi) {
        throw new Error("Extension 'eclipse-che.api' is not installed");
    }
    await extensionApi.activate();
    const cheApi: any = extensionApi?.exports;
    const container = new Container();

    const extensionContext = new ExtensionContext(context);
    container.bind(ExtensionContext).toConstantValue(extensionContext);

    container.bind(Symbol.for('DevfileServiceInstance')).toConstantValue(cheApi.getDevfileService());
    container.bind(K8sHelper).toSelf().inSingletonScope();

    const githubService = cheApi.getGithubService();
    container.bind(Symbol.for('GithubServiceInstance')).toConstantValue(githubService);

    container.bind(ErrorHandler).toSelf().inSingletonScope();
    container.bind(Logger).toSelf().inSingletonScope();

    container.bind(GitHubAuthProvider).toSelf().inSingletonScope();
    const authenticationProvider = container.get(GitHubAuthProvider);
    vscode.authentication.registerAuthenticationProvider('github', 'GitHub', authenticationProvider);

    container.bind(DeviceAuthentication).toSelf().inSingletonScope();
    container.get(DeviceAuthentication);
}

export function deactivate(): void {
}
