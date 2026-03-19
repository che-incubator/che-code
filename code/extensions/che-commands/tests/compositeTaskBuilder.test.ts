/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { DevfileTaskProvider } from "../src/taskProvider";
import { MockCheAPI, MockTerminalAPI } from "./mocks";
import * as vscode from "vscode";

beforeAll(() => {
	(vscode as any).TaskRevealKind = {
		Always: 1,
		Silent: 2,
		Never: 0,
	};

	(vscode as any).TaskPanelKind = {
		Dedicated: 1,
		Shared: 2,
		New: 3,
	};
});

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

describe("Composite — same component execution", () => {
	test("sequential same-component commands execute individually in order", async () => {
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

		expect(term.calls).toHaveLength(2);
		expect(term.calls.map((c) => c.component)).toEqual(["py", "py"]);
		expect(term.calls.map((c) => c.command)).toEqual(["A", "B"]);
	});

	test("parallel same-component commands execute independently", async () => {
		let executedTasks: vscode.Task[] = [];

		(vscode as any).tasks = {
			executeTask: async (task: vscode.Task) => {
				executedTasks.push(task);
				return { terminate() {} };
			},
		};

		const tasks = await provide({
			commands: [
				{ id: "a", exec: { component: "py", commandLine: "A" } },
				{ id: "b", exec: { component: "py", commandLine: "B" } },
				{ id: "combo", composite: { parallel: true, commands: ["a", "b"] } },
			],
		});

		await runByName(tasks!, "combo");

		expect(executedTasks).toHaveLength(2);

		const cmds = executedTasks.map((t) => (t.definition as any).command).sort();

		expect(cmds).toEqual(["A", "B"]);
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
		let executedTasks: vscode.Task[] = [];

		(vscode as any).tasks = {
			executeTask: async (task: vscode.Task) => {
				executedTasks.push(task);
				return { terminate() {} };
			},
		};

		const tasks = await provide(devfile);

		await runByName(tasks!, "par");

		expect(executedTasks).toHaveLength(2);

		const comps = executedTasks
			.map((t) => (t.definition as any).component)
			.sort();

		expect(comps).toEqual(["backend", "frontend"]);
	});
});

describe("Composite — sequential failure behavior", () => {
	test("stops when first command fails", async () => {
		const term = new MockTerminalAPI();

		term.exitCodes = {
			backend: 1,
			frontend: 0,
		};

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
					composite: { commands: ["backend", "frontend"] },
				},
			],
		};

		const tasks = await provide(devfile, term);

		await runByName(tasks!, "seq");

		expect(term.calls).toHaveLength(1);
		expect(term.calls[0].component).toBe("backend");
	});

	test("continues when commands succeed", async () => {
		const term = new MockTerminalAPI();

		term.exitCodes = {
			backend: 0,
			frontend: 0,
		};

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
					composite: { commands: ["backend", "frontend"] },
				},
			],
		};

		const tasks = await provide(devfile, term);

		await runByName(tasks!, "seq");

		expect(term.calls).toHaveLength(2);
		expect(term.calls.map((c) => c.component)).toEqual(["backend", "frontend"]);
	});
});

describe("Composite — nested graphs", () => {
	test("nested composites execute in correct order", async () => {
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

		expect(term.calls.map((c) => c.command)).toEqual(["A", "B", "C"]);
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

	test("invalid composites are not exposed as runnable tasks", async () => {
		const tasks = await provide({
			commands: [
				{ id: "inner", composite: { commands: [] } },
				{ id: "outer", composite: { commands: ["inner"] } },
			],
		});

		expect(tasks!.some((t) => t.name === "outer")).toBe(false);
	});
});

describe("Composite — shell command integrity", () => {
	test("preserves complex shell commands", async () => {
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

	test("supports complex chained shell commands", async () => {
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

		expect(term.calls[1].command).toContain("pgrep");
		expect(term.calls[1].command).toContain("&&");
	});
});

describe("Composite — task naming", () => {
	test("label overrides id", async () => {
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
