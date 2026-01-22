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

export class MockTerminalAPI {
	lastCommand?: string;
	lastCwd?: string;
	lastComponent?: string;

	getMachineExecPTY(component: any, command: string, cwd: string) {
		this.lastComponent = component;
		this.lastCommand = command;
		this.lastCwd = cwd;
		return {};
	}
}

class MockDevfileService {
	constructor(private devfile: any) {}
	async get() {
		return this.devfile;
	}
}

export class MockCheAPI {
	constructor(private devfile: any) {}
	getDevfileService() {
		return new MockDevfileService(this.devfile);
	}
}
