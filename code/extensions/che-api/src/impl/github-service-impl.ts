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

import * as k8s from '@kubernetes/client-node';
import { AxiosInstance } from 'axios';
import * as fs from 'fs-extra';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import { GithubService, GithubUser } from '../api/github-service';
import { Logger } from '../logger';
import { K8SServiceImpl } from './k8s-service-impl';
import { base64Encode, createLabelsSelector, randomString } from './utils';

const GIT_CREDENTIAL_LABEL = {
    'controller.devfile.io/git-credential': 'true'
};
const SCM_URL_ATTRIBUTE = 'che.eclipse.org/scm-url';
const GITHUB_URL = 'https://github.com';
const GIT_CREDENTIALS_LABEL_SELECTOR: string = createLabelsSelector(GIT_CREDENTIAL_LABEL);

@injectable()
export class GithubServiceImpl implements GithubService {
    private token: string | undefined;

    constructor(
        @inject(Logger) private logger: Logger,
        @inject(K8SServiceImpl) private readonly k8sService: K8SServiceImpl,
        @inject(Symbol.for('AxiosInstance')) private readonly axiosInstance: AxiosInstance
    ) {
        const credentialsPath = path.resolve('/.git-credentials', 'credentials');
        if (fs.existsSync(credentialsPath)) {
            const token = fs.readFileSync(credentialsPath).toString();
            this.token = token.substring(token.lastIndexOf(':') + 1, token.indexOf('@'));
        }
    }

    private checkToken(): void {
        if (!this.token) {
            throw new Error('GitHub authentication token is not setup');
        }
    }

    async getToken(): Promise<string> {
        this.checkToken();
        return this.token!;
    }

    async getUser(): Promise<GithubUser> {
        this.checkToken();
        const result = await this.axiosInstance.get<GithubUser>('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return result.data;
    }

    async getTokenScopes(token: string): Promise<string[]> {
        this.checkToken();
        const result = await this.axiosInstance.get<GithubUser>('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}` },
        });
        return result.headers['x-oauth-scopes'].split(', ');
    }

    async updateCachedToken(token: string): Promise<void> {
        this.token = token;
    }

    async persistToken(token: string): Promise<void> {
        this.updateCachedToken(token);
        this.logger.info(`Github Service: adding token to the git-credentials secret...`);

        const gitCredentialSecret = await this.getGithubSecret();
        if (!gitCredentialSecret) {
            this.logger.info(`Github Service: git-credentials secret not found, creating a new secret...`);

            const namespace = this.k8sService.getDevWorkspaceNamespace();
            const newSecret = this.toSecret(namespace, token);
            this.k8sService.createNamespacedSecret(newSecret);

            this.logger.info(`Github Service: git-credentials secret was created successfully!`);
            return;
        }

        this.logger.info(`Github Service: updating exsting git-credentials secret...`);

        const data = {
            credentials: base64Encode(`https://oauth2:${token}@github.com`)
        };

        const updatedSecret = { ...gitCredentialSecret, data };
        const name = gitCredentialSecret.metadata?.name || `git-credentials-secret-${randomString(5).toLowerCase()}`;
        this.k8sService.replaceNamespacedSecret(name, updatedSecret);

        this.logger.info(`Github Service: git-credentials secret was updated successfully!`);
    }

    async githubTokenSecretExists(): Promise<boolean> {
        const gitCredentialSecret = await this.getGithubSecret();
        return !!gitCredentialSecret;
    }

    private async getGithubSecret(): Promise<k8s.V1Secret | undefined> {
        this.logger.info(`Github Service: looking for the corresponding git-credentials secret...`);

        const gitCredentialSecrets = await this.k8sService.getSecret(GIT_CREDENTIALS_LABEL_SELECTOR);
        this.logger.info(`Github Service: found ${gitCredentialSecrets.length} secrets`);

        if (gitCredentialSecrets.length === 0) {
            return undefined
        }

        if (gitCredentialSecrets.length === 1) {
            return gitCredentialSecrets[0];
        }
        return gitCredentialSecrets.find(secret => secret.metadata?.annotations?.[SCM_URL_ATTRIBUTE] === GITHUB_URL) || gitCredentialSecrets[0];
    }

    private toSecret(namespace: string, token: string): k8s.V1Secret {
        return {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
                name: `git-credentials-secret-${randomString(5).toLowerCase()}`,
                namespace,
                labels: {
                    'controller.devfile.io/git-credential': 'true',
                    'controller.devfile.io/watch-secret': 'true',
                },
                annotations: {
                    'che.eclipse.org/scm-url': 'https://github.com'
                }
            },
            type: 'Opaque',
            data: {
                credentials: base64Encode(`https://oauth2:${token}@github.com`)
            },
        };
    }
}
