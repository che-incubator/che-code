/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

export enum TaskScope {
	Workspace = 1,
}

export class CustomExecution {
	callback: () => Promise<any>;
	constructor(cb: () => Promise<any>) {
		this.callback = cb;
	}
}

export class Task {
	constructor(
		public definition: any,
		public scope: any,
		public name: string,
		public source: string,
		public execution: any,
		public problemMatchers: any[]
	) {}
}

export const window = {
	createOutputChannel: jest.fn(() => ({
		appendLine: jest.fn(),
	})),
};
