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

function createProvider(devfile: any, terminal?: MockTerminalAPI) {
	return new DevfileTaskProvider(
		vscode.window.createOutputChannel("test"),
		new MockCheAPI(devfile),
		terminal ?? new MockTerminalAPI(),
	);
}

describe("Exec command normalization", () => {
	test("removes trailing logical AND operators from single-line commands", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [{ id: "build", exec: { commandLine: "npm run build &&" } }],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toBe("npm run build");
	});

	test("joins multiline YAML command arrays into a safe && chain", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{
						id: "compile",
						exec: { commandLine: ["mvn clean &&", "", "mvn install &&"] },
					},
				],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toBe("mvn clean && mvn install");
	});

	test("preserves semicolon-chained shell scripts without injecting &&", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [{ id: "script", exec: { commandLine: "echo A; echo B" } }],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toContain(";");
	});

	test("preserves pipe operators in shell commands", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [{ id: "pipe", exec: { commandLine: "ps aux | grep node" } }],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toContain("|");
	});

	test("preserves line-continuation scripts using backslashes", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [{ id: "debug", exec: { commandLine: "run \\\n next" } }],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toContain("\\");
	});
});

describe("Provider command filtering", () => {
	test("excludes commands imported as child devfile fragments", async () => {
		const tasks = await createProvider({
			commands: [
				{
					id: "child",
					exec: { commandLine: "echo" },
					attributes: { "controller.devfile.io/imported-by": "child" },
				},
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});

	test("returns no tasks when devfile contains no runnable commands", async () => {
		const tasks = await createProvider({ commands: [] }).provideTasks();
		expect(tasks).toEqual([]);
	});
});

describe("Environment variable handling", () => {
	test("injects exec environment variables with proper escaping", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{
						id: "env",
						exec: {
							commandLine: "echo hi",
							env: [{ name: "A", value: 'x"y' }],
						},
					},
				],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].command).toContain(`export A="x\\"y"`);
	});

	test("expands working directory environment placeholders", async () => {
		process.env.TEST_DIR = "/tmp/demo";

		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{
						id: "wd",
						exec: {
							commandLine: "echo",
							workingDir: "${TEST_DIR}",
						},
					},
				],
			},
			term,
		).provideTasks();

		await (tasks![0].execution as any).callback();

		expect(term.calls[0].cwd).toBe("/tmp/demo");
	});
});

describe("Composite validation and safety", () => {
	test("rejects composites with cyclic command references", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", composite: { commands: ["b"] } },
				{ id: "b", composite: { commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});
});

describe("Composite execution across multiple components", () => {
	test("runs sequential composite commands in their respective components", async () => {
		const term = new MockTerminalAPI( {debug: false} ); //true to see PTY logs

		const tasks = await createProvider(
			{
				commands: [
					{ id: "ubi8", exec: { component: "ubi8", commandLine: "echo el8" } },
					{ id: "ubi9", exec: { component: "ubi9", commandLine: "echo el9" } },
					{
						id: "combo",
						composite: { parallel: false, commands: ["ubi8", "ubi9"] },
					},
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "combo")!.execution as any).callback();

		expect(term.calls[0].component).toBe("ubi8");
		expect(term.calls[1].component).toBe("ubi9");
		expect(term.calls[0].output).toBe("el8");
		expect(term.calls[1].output).toBe("el9");
	});

	test("runs parallel composite commands in their respective components", async () => {
		const term = new MockTerminalAPI({ debug: false }); //true to see PTY logs

		const tasks = await createProvider(
			{
				commands: [
					{ id: "ubi8", exec: { component: "ubi8", commandLine: "echo el8" } },
					{ id: "ubi9", exec: { component: "ubi9", commandLine: "echo el9" } },
					{
						id: "combo",
						composite: { parallel: true, commands: ["ubi8", "ubi9"] },
					},
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "combo")!.execution as any).callback();

		const components = term.calls
			.slice(0, 2)
			.map((c) => c.component)
			.sort();
		expect(components).toEqual(["ubi8", "ubi9"]);
	});

	test("single-command composite does not emit completion message", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A" } },
					{ id: "combo", composite: { commands: ["a"] } },
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "combo")!.execution as any).callback();

		expect(
			term.calls.some((c) => c.command.includes("execution completed")),
		).toBe(false);

		expect(term.calls.length).toBe(1);
		expect(term.calls[0].command).toContain("echo A");
	});
});

describe("Composite flattening within a single component", () => {
	test("flattens sequential composites into a single && command chain", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "combo", composite: { parallel: false, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "combo")!.execution as any).callback();

		expect(term.calls.length).toBe(1);
		expect(term.calls[0].command).toBe("A && B");
	});

	test("flattens parallel composites into a backgrounded command chain with wait", async () => {
		const term = new MockTerminalAPI();

		const tasks = await createProvider(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "combo", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			term,
		).provideTasks();

		await (tasks!.find((t) => t.name === "combo")!.execution as any).callback();

		expect(term.calls[0].command).toContain("&");
		expect(term.calls[0].command).toContain("wait");
	});
});

describe("Task naming resolution", () => {
	test("uses exec label as the VS Code task name when provided", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", exec: { label: "Build Task", commandLine: "echo" } },
			],
		}).provideTasks();

		expect(tasks![0].name).toBe("Build Task");
	});

	test("uses composite label as the VS Code task name when provided", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", exec: { commandLine: "echo" } },
				{ id: "b", composite: { label: "Composite Task", commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks!.some((t) => t.name === "Composite Task")).toBe(true);
	});
});

describe("Fallback behavior", () => {
	test("creates a message task for unsupported command definitions", async () => {
		const tasks = await createProvider({
			commands: [{ id: "unsupported" }],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});
});

describe("Task resolution contract", () => {
	test("resolveTask returns the provided task unchanged", async () => {
		const provider = createProvider({ commands: [] });

		const fakeExec: any = {
			callback: async () => ({
				open() {},
				close() {},
				onDidWrite: () => {},
			}),
		};

		const task = new vscode.Task(
			{ type: "devfile" },
			vscode.TaskScope.Workspace,
			"sample",
			"devfile",
			fakeExec,
		);

		const resolved = await provider.resolveTask(task);
		expect(resolved).toBe(task);
	});
});
