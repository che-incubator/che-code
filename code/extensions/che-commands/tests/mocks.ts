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

export class MockTerminalAPI {
	public calls: Array<{ component?: string; command: string; cwd: string }> =
		[];
	public output: string[] = [];

	async getMachineExecPTY(
		component: string | undefined,
		command: string,
		cwd: string,
	) {
		this.calls.push({ component, command, cwd });

		// simulate VS Code task console banner
		this.output.push(`Executing task: devfile: ${component ?? "workspace"}`);

		const echoes = command.match(/echo\s+(.+)/g) || [];
		for (const e of echoes) {
			this.output.push(e.replace(/^echo\s+/, ""));
		}

		this.output.push("Terminal will be reused by tasks...");

		return {
			open: () => {},
			close: () => {},
			onDidWrite: () => {},
			onDidClose: () => {},
			handleInput: () => {},
		};
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
