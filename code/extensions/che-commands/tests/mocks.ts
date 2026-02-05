/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

type MockTerminalOptions = {
  debug?: boolean;
};


export class MockTerminalAPI {
	private debug: boolean;

	public calls: Array<{
		component?: string;
		command: string;
		cwd: string;
		output: string;
	}> = [];

	constructor(opts?: MockTerminalOptions) {
		this.debug = !!opts?.debug;
	}

	async getMachineExecPTY(
		component: string | undefined,
		command: string,
		cwd: string,
	) {
		// simulate output from echo commands
		const output = this.simulateOutput(command);

		const record = { component, command, cwd, output };
		this.calls.push(record);

		// ✅ print during test run
		if (this.debug) {
			console.log("\n[PTY]");
			console.log(" component:", component ?? "default");
			console.log(" cwd:", cwd);
			console.log(" command:", command);
			if (output) {
				console.log(" output:", output);
			}
		}
		return {
			open: () => {},
			close: () => {},
			onDidWrite: () => {},
			onDidClose: () => {},
			handleInput: () => {},
		};
	}

	private simulateOutput(command: string): string {
		// simple echo simulation
		const m = command.match(/echo\s+(.+)/);
		if (!m) return "";

		return m[1].replace(/^"|"$/g, "");
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
