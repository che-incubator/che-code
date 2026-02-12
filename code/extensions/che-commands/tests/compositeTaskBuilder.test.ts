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

import { DevfileTaskProvider } from "../src/taskProvider";
import { MockCheAPI, MockTerminalAPI } from "./mocks";
import * as vscode from "vscode";

function createProvider(devfile: any, term?: MockTerminalAPI) {
	return new DevfileTaskProvider(
		vscode.window.createOutputChannel("composite-tests"),
		new MockCheAPI(devfile),
		term ?? new MockTerminalAPI(),
	);
}

async function provide(devfile: any, term?: MockTerminalAPI) {
	return createProvider(devfile, term).provideTasks();
}

async function runByName(tasks: vscode.Task[], name: string) {
	const task = tasks.find((t) => t.name === name);
	expect(task).toBeDefined();
	const pty = await (task!.execution as any).callback();
	if (pty?.open) {
		await pty.open();
	}
	return pty;
}

describe("Composite — same component flattening", () => {
	test("sequential same-component commands are flattened with &&", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A &&" } },
					{ id: "b", exec: { component: "py", commandLine: "B &&" } },
					{ id: "combo", composite: { commands: ["a", "b"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "combo");

		expect(term.calls).toHaveLength(1);
		expect(term.calls[0].component).toBe("py");
		expect(term.calls[0].command).toBe("A && B");
	});

	test("parallel same-component commands run in background with wait", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "combo", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "combo");

		const cmd = term.calls[0].command;

		expect(cmd).toContain("A");
		expect(cmd).toContain("B");
		expect(cmd).toContain("&");
		expect(cmd).toContain("wait");
	});
});

describe("Composite — cross component execution", () => {
	const devfile = {
		commands: [
			{
				id: "backend",
				exec: { component: "backend", commandLine: "echo backend" },
			},
			{
				id: "frontend",
				exec: { component: "frontend", commandLine: "echo frontend" },
			},
			{
				id: "seq",
				composite: { commands: ["backend", "frontend"], parallel: false },
			},
			{
				id: "par",
				composite: { commands: ["backend", "frontend"], parallel: true },
			},
		],
	};

	test("sequential composite preserves component order", async () => {
		const term = new MockTerminalAPI();
		const tasks = await provide(devfile, term);

		await runByName(tasks!, "seq");

		expect(term.calls.map((c) => c.component)).toEqual(["backend", "frontend"]);
	});

	test("parallel composite executes all components", async () => {
		const term = new MockTerminalAPI();
		const tasks = await provide(devfile, term);

		await runByName(tasks!, "par");

		expect(term.calls).toHaveLength(2);

		const comps = term.calls.map((c) => c.component).sort();
		expect(comps).toEqual(["backend", "frontend"]);
	});
});

describe("Composite — nested graphs", () => {
	test("nested composites flatten correctly", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A &&" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "inner", composite: { commands: ["a", "b"] } },
					{ id: "c", exec: { component: "py", commandLine: "C &&" } },
					{ id: "outer", composite: { commands: ["inner", "c"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "outer");

		expect(term.calls[0].command).toBe("A && B && C");
	});
});

describe("Composite — validation and safety", () => {
	test("cyclic composite graph is rejected", async () => {
		const tasks = await provide({
			commands: [
				{ id: "a", composite: { commands: ["b"] } },
				{ id: "b", composite: { commands: ["a"] } },
			],
		});

		expect(tasks).toHaveLength(0);
	});

	test("missing referenced command is rejected", async () => {
		const tasks = await provide({
			commands: [{ id: "x", composite: { commands: ["missing"] } }],
		});

		expect(tasks).toHaveLength(0);
	});

	test("composite with non-exec children is not exposed as runnable task", async () => {
		const tasks = await provide({
			commands: [
				{ id: "inner", composite: { commands: [] } },
				{ id: "outer", composite: { commands: ["inner"] } },
			],
		});

		// provider should not create tasks for invalid composites
		expect(tasks!.some((t) => t.name === "outer")).toBe(false);
	});
});

describe("Composite — shell command integrity", () => {
	test("composite preserves complex shell commands per step", async () => {
		const term = new MockTerminalAPI();

		const complex = `VAR=$(pgrep node) && echo $VAR && kill $VAR &>/dev/null`;

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "c1", commandLine: complex } },
					{ id: "combo", composite: { commands: ["a"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "combo");

		expect(term.calls[0].command).toContain("pgrep");
		expect(term.calls[0].command).toContain("&>/dev/null");
	});

	test("composite supports complex shell stop command", async () => {
		const term = new MockTerminalAPI();

		const devfile = {
			commands: [
				{ id: "build", exec: { component: "c", commandLine: "echo build" } },
				{
					id: "stop",
					exec: {
						component: "c",
						commandLine: `node_server_pids=$(pgrep x | tr "\\n" " ") && echo Done`,
					},
				},
				{ id: "combo", composite: { commands: ["build", "stop"] } },
			],
		};

		const tasks = await provide(devfile, term);
		await runByName(tasks!, "combo");

		expect(term.calls[0].command).toContain("pgrep");
		expect(term.calls[0].command).toContain("&&");
	});
});

describe("Composite — task naming", () => {
	test("composite label overrides id", async () => {
		const tasks = await provide({
			commands: [
				{ id: "a", exec: { commandLine: "echo" } },
				{
					id: "combo",
					composite: { label: "Nice Composite", commands: ["a"] },
				},
			],
		});

		expect(tasks!.some((t) => t.name === "Nice Composite")).toBe(true);
	});
});
