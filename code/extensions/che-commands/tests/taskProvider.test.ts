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

function provider(devfile: any, terminal?: MockTerminalAPI) {
	return new DevfileTaskProvider(
		vscode.window.createOutputChannel("test"),
		new MockCheAPI(devfile),
		terminal ?? new MockTerminalAPI(),
	);
}

async function runFirst(devfile: any, terminal: MockTerminalAPI) {
	const tasks = await provider(devfile, terminal).provideTasks();
	await (tasks![0].execution as any).callback();
}

describe("Exec normalization — structural cleanup", () => {
	test("removes trailing &&", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [{ id: "a", exec: { commandLine: "npm build &&" } }],
			},
			term,
		);

		expect(term.calls[0].command).toBe("npm build");
	});

	test("joins multiline array with implicit &&", async () => {
		const term = new MockTerminalAPI();

		await runFirst(
			{
				commands: [
					{
						id: "a",
						exec: { commandLine: ["npm install", "npm test"] },
					},
				],
			},
			term,
		);

		expect(term.calls[0].command).toBe("npm install && npm test");
	});
});

describe("Shell pattern preservation — no unsafe && injection", () => {
	test("preserves semicolon chains", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [{ id: "a", exec: { commandLine: "echo a; echo b" } }],
			},
			term,
		);

		expect(term.calls[0].command).toContain(";");
	});

	test("preserves OR operator", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [{ id: "a", exec: { commandLine: "make || echo fail" } }],
			},
			term,
		);

		expect(term.calls[0].command).toContain("||");
	});

	test("preserves pipe operator", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [{ id: "a", exec: { commandLine: "ps | grep node" } }],
			},
			term,
		);

		expect(term.calls[0].command).toContain("|");
	});

	test("preserves heredoc", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [
					{
						id: "a",
						exec: { commandLine: "cat <<EOF\nhi\nEOF" },
					},
				],
			},
			term,
		);

		expect(term.calls[0].command).toContain("<<EOF");
	});

	test("preserves line continuation backslash", async () => {
		const term = new MockTerminalAPI();
		await runFirst(
			{
				commands: [
					{
						id: "a",
						exec: { commandLine: "docker run \\\n alpine" },
					},
				],
			},
			term,
		);

		expect(term.calls[0].command).toContain("\\");
	});
});

describe("Environment and working directory handling", () => {
	test("exports exec env vars with escaping", async () => {
		const term = new MockTerminalAPI();

		await runFirst(
			{
				commands: [
					{
						id: "a",
						exec: {
							commandLine: "echo hi",
							env: [{ name: "A", value: 'x"y' }],
						},
					},
				],
			},
			term,
		);

		expect(term.calls[0].command).toContain(`export A="x\\"y"`);
	});

	test("expands workingDir variables", async () => {
		process.env.MY_DIR = "/tmp/demo";
		const term = new MockTerminalAPI();

		await runFirst(
			{
				commands: [
					{
						id: "a",
						exec: {
							commandLine: "echo hi",
							workingDir: "${MY_DIR}",
						},
					},
				],
			},
			term,
		);

		expect(term.calls[0].cwd).toBe("/tmp/demo");
	});
});

describe("Command filtering rules", () => {
	test("filters imported child commands", async () => {
		const tasks = await provider({
			commands: [
				{
					id: "x",
					exec: { commandLine: "echo" },
					attributes: { "controller.devfile.io/imported-by": "child" },
				},
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});
});

describe("Composite — sequential execution", () => {
	test("joins with &&", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A" } },
					{ id: "b", exec: { commandLine: "echo B" } },
					{ id: "c", composite: { commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "c")!;
		await (task.execution as any).callback();

		expect(term.calls[0].command).toBe("echo A && echo B");
	});
});

describe("Composite — parallel execution", () => {
	test("uses & and wait", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A" } },
					{ id: "b", exec: { commandLine: "echo B" } },
					{ id: "p", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "p")!;
		await (task.execution as any).callback();

		expect(term.calls[0].command).toBe("echo A & echo B ; wait");
	});
});

describe("Composite execution model — multi vs single component (sequential + parallel)", () => {
	test("multi-component sequential executes each command in its own component", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { component: "ubi8", commandLine: "echo 8" } },
					{ id: "b", exec: { component: "ubi9", commandLine: "echo 9" } },
					{ id: "c", composite: { parallel: false, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "c")!;
		await (task.execution as any).callback();

		// two real executions + completion echo
		expect(term.calls.length).toBe(3);

		expect(term.calls[0]).toMatchObject({
			component: "ubi8",
			command: expect.stringContaining("echo 8"),
		});

		expect(term.calls[1]).toMatchObject({
			component: "ubi9",
			command: expect.stringContaining("echo 9"),
		});
	});

	test("multi-component parallel executes each command in its own component", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { component: "ubi8", commandLine: "echo 8" } },
					{ id: "b", exec: { component: "ubi9", commandLine: "echo 9" } },
					{ id: "c", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "c")!;
		await (task.execution as any).callback();

		// two real executions + completion echo
		expect(term.calls.length).toBe(3);

		const comps = term.calls
			.slice(0, 2)
			.map((c) => c.component)
			.sort();
		expect(comps).toEqual(["ubi8", "ubi9"]);
	});

	test("same-component sequential composite is flattened with &&", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "c", composite: { parallel: false, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "c")!;
		await (task.execution as any).callback();

		expect(term.calls.length).toBe(1);
		expect(term.calls[0].component).toBe("py");
		expect(term.calls[0].command).toBe("A && B");
	});

	test("same-component parallel composite is flattened with & and wait", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "c", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		const task = tasks!.find((t) => t.name === "c")!;
		await (task.execution as any).callback();

		expect(term.calls.length).toBe(1);
		expect(term.calls[0].component).toBe("py");
		expect(term.calls[0].command).toContain("A & B");
		expect(term.calls[0].command).toContain("wait");
	});
});

describe("Composite validation safety", () => {
	test("rejects cyclic composites", async () => {
		const tasks = await provider({
			commands: [
				{ id: "a", composite: { commands: ["b"] } },
				{ id: "b", composite: { commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});

	test("supports nested composite resolution", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "A" } },
					{ id: "b", composite: { commands: ["a"] } },
					{ id: "c", composite: { commands: ["b"] } },
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "c")!.execution as any).callback();

		expect(term.calls[0].command).toBe("A");
	});
});

describe("Task naming precedence", () => {
	test("exec label overrides id", async () => {
		const tasks = await provider({
			commands: [
				{ id: "a", exec: { label: "Nice Name", commandLine: "echo" } },
			],
		}).provideTasks();

		expect(tasks![0].name).toBe("Nice Name");
	});

	test("composite label overrides id", async () => {
		const tasks = await provider({
			commands: [
				{ id: "a", exec: { commandLine: "echo" } },
				{ id: "b", composite: { label: "Composite Nice", commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks!.some((t) => t.name === "Composite Nice")).toBe(true);
	});
});
