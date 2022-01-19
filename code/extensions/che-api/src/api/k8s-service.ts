/* eslint-disable header/header */
/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

export interface K8SRawResponse {
	statusCode: number;
	data: string;
	error: string;
}

export const K8SService = Symbol('K8SService');

export interface K8SService {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendRawQuery(requestURL: string, opts: any): Promise<K8SRawResponse>;
}
