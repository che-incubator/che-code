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

import { GithubService, GithubUser } from '../api/github-service';
import { inject, injectable } from 'inversify';
import { AxiosInstance } from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';

const GITHUB_GET_AUTHENTICATED_USER = 'https://api.github.com/user';

@injectable()
export class GithubServiceImpl implements GithubService {
    private readonly token: string | undefined;

    constructor(@inject(Symbol.for('AxiosInstance')) private readonly axiosInstance: AxiosInstance) {
        const credentialsPath = path.resolve('/.git-credentials', 'credentials');
        if (fs.existsSync(credentialsPath)) {
            const content = fs.readFileSync(credentialsPath).toString();

            // Since this service is specific for github.com, we need to find only one corresponding token
            const regex = /(http|https):\/\/oauth2:(\d|\S+)@github.com$/mg;
            const found = content.match(regex);
            if (found) {
                // take the first token
                const t = found[0];
                this.token = t.substring(t.lastIndexOf(':') + 1, t.indexOf('@'));
            }
        }
    }

    private ensureTokenExists(): void {
        if (!this.token) {
            throw new Error('GitHub authentication token is not setup');
        }
    }

    async getToken(): Promise<string> {
        this.ensureTokenExists();
        return this.token!;
    }

    async getUser(): Promise<GithubUser> {
        this.ensureTokenExists();
        const result = await this.axiosInstance.get<GithubUser>(GITHUB_GET_AUTHENTICATED_USER, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return result.data;
    }

    async getTokenScopes(token: string): Promise<string[]> {
        this.ensureTokenExists();
        const result = await this.axiosInstance.get<GithubUser>(GITHUB_GET_AUTHENTICATED_USER, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return result.headers['x-oauth-scopes'].split(', ');
    }
}
