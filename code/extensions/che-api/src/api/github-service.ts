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

export interface GithubUser {
    login: string;
    id: number;
    name: string;
    email: string;
}

export const GithubService = Symbol('GithubService');

export interface GithubService {
    getToken(): Promise<string>;

    /**
     * Persists the given token to the corresponding secret, the in-memory value will be updated as well.
     * A new secret will be created if there is no secret yet.
     * Note: The existing token will be owerriten by the given one.   
     */
    persistDeviceAuthToken(token: string): Promise<void>;

    /* Removes Device Authentication secret, extracts a token from another source (.git-credentials/credentials file or git-credentials secret) */
    removeDeviceAuthToken(): Promise<void>;

    getUser(): Promise<GithubUser>;
    getTokenScopes(token: string): Promise<string[]>;
}
