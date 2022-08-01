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

@injectable()
export class GithubServiceImpl implements GithubService {
    private readonly token: string | undefined;

    constructor(@inject(Symbol.for('AxiosInstance')) private readonly axiosInstance: AxiosInstance) {
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
}
