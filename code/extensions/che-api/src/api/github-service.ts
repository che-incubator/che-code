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
    getUser(): Promise<GithubUser>;
    getTokenScopes(token: string): Promise<string[]>;
}
