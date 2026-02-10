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

type WriteListener = (data: string) => void;
type CloseListener = (code?: number) => void;

class MockPty {
	private writeListeners: WriteListener[] = [];
	private closeListeners: CloseListener[] = [];

	constructor(private output: string) {}

	onDidWrite(listener: WriteListener) {
		this.writeListeners.push(listener);
	}

	onDidClose(listener: CloseListener) {
		this.closeListeners.push(listener);
	}

	open() {
		if (this.output) {
			for (const l of this.writeListeners) {
				l(this.output + "\r\n");
			}
		}
	}

	close() {
		for (const l of this.closeListeners) {
			l(0);
		}
	}

	handleInput() {}
}

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
		const output = this.simulateOutput(component, command);

		const record = { component, command, cwd, output };
		this.calls.push(record);

		if (this.debug) {
			console.log("\n[PTY]");
			console.log(" component:", component ?? "default");
			console.log(" cwd:", cwd);
			console.log(" command:", command);
			if (output) console.log(" output:", output);
		}

		return new MockPty(output);
	}

	private simulateOutput(
		component: string | undefined,
		command: string,
	): string {
		const m = command.match(/echo\s+(.+)/);
		if (m) return m[1].replace(/^"|"$/g, "");

		// devfile platform example simulation
		if (command.includes("PLATFORM_ID")) {
			if (component === "ubi8-tools" || component === "backend") {
				return "platform:el8";
			}
			if (component === "ubi9-tools" || component === "frontend") {
				return "platform:el9";
			}
		}

		return "";
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
