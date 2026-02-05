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

describe("Exec normalization — commandLine cleanup and joining", () => {
	test("trims trailing && from single-line exec commands", async () => {
		const terminal = new MockTerminalAPI();
		const tasks = await createProvider(
			{
				commands: [{ id: "build", exec: { commandLine: "npm run build &&" } }],
			},
			terminal,
		).provideTasks();

		await (tasks![0].execution as any).callback();
		expect(terminal.calls[0].command).toBe("npm run build");
	});

	test("joins multiline YAML array commands safely", async () => {
		const terminal = new MockTerminalAPI();

		const provider = createProvider(
			{
				commands: [
					{
						id: "compile",
						exec: {
							commandLine: ["mvn clean &&", "", "mvn install &&"],
						},
					},
				],
			},
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].command).toBe("mvn clean && mvn install");
	});
});

describe("Composite resolution — sequential and parallel composition", () => {
	test("sequential composite joins subcommands with &&", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A &&" } },
					{ id: "b", exec: { commandLine: "echo B &&" } },
					{ id: "all", composite: { commands: ["a", "b"] } },
				],
			},
			terminal,
		);

		const task = (await provider.provideTasks())!.find(
			(t) => t.name === "all",
		)!;
		await (task.execution as any).callback();

		expect(terminal.calls[0].command).toBe("echo A && echo B");
	});

	test("parallel composite uses background operator and wait", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A" } },
					{ id: "b", exec: { commandLine: "echo B" } },
					{ id: "p", composite: { parallel: true, commands: ["a", "b"] } },
				],
			},
			terminal,
		);

		const task = (await provider.provideTasks())!.find((t) => t.name === "p")!;
		await (task.execution as any).callback();

		expect(terminal.calls[0].command).toBe("echo A & echo B ; wait");
	});

	test("rejects cyclic composite graphs", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", composite: { commands: ["b"] } },
				{ id: "b", composite: { commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});
});

describe("Shell syntax detection — avoids unsafe && injection", () => {
	test("preserves line continuation scripts", async () => {
		const terminal = new MockTerminalAPI();

		const provider = createProvider(
			{
				commands: [
					{
						id: "debug",
						exec: {
							commandLine: `dlv \\
--listen=127.0.0.1:1234`,
						},
					},
				],
			},
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].command).toContain("\\");
	});

	test("preserves semicolon chaining", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{ commands: [{ id: "x", exec: { commandLine: "echo a; echo b" } }] },
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].command).toContain(";");
	});

	test("preserves pipe operators", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{ commands: [{ id: "x", exec: { commandLine: "ps | grep" } }] },
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].command).toContain("|");
	});
});

describe("Provider filtering and environment handling", () => {
	test("filters imported child commands", async () => {
		const tasks = await createProvider({
			commands: [
				{
					id: "child",
					exec: { commandLine: "echo hi" },
					attributes: { "controller.devfile.io/imported-by": "child" },
				},
			],
		}).provideTasks();

		expect(tasks).toHaveLength(0);
	});

	test("returns empty task list when no commands defined", async () => {
		expect(await createProvider({ commands: [] }).provideTasks()).toEqual([]);
	});

	test("injects exec env variables with escaping", async () => {
		const terminal = new MockTerminalAPI();

		const provider = createProvider(
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
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].command).toContain(`export A="x\\"y"`);
	});

	test("expands workingDir environment variables", async () => {
		process.env.TEST_DIR = "/tmp/demo";

		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{
				commands: [
					{
						id: "wd",
						exec: { commandLine: "echo hi", workingDir: "${TEST_DIR}" },
					},
				],
			},
			terminal,
		);

		await ((await provider.provideTasks())![0].execution as any).callback();
		expect(terminal.calls[0].cwd).toBe("/tmp/demo");
	});
});

describe("Composite aggregation model — multi vs single component", () => {
	test("aggregates multi-component composites into one shell command", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{
				commands: [
					{ id: "a", exec: { component: "builder", commandLine: "echo A" } },
					{ id: "b", exec: { component: "runtime", commandLine: "echo B" } },
					{ id: "combo", composite: { commands: ["a", "b"] } },
				],
			},
			terminal,
		);

		const task = (await provider.provideTasks())!.find(
			(t) => t.name === "combo",
		)!;
		await (task.execution as any).callback();

		expect(terminal.calls.length).toBe(1);
		expect(terminal.calls[0].command).toContain("echo A");
		expect(terminal.calls[0].command).toContain("echo B");
	});

	test("flattens same-component composites", async () => {
		const terminal = new MockTerminalAPI();
		const provider = createProvider(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "echo A" } },
					{ id: "b", exec: { component: "py", commandLine: "echo B" } },
					{ id: "flat", composite: { commands: ["a", "b"] } },
				],
			},
			terminal,
		);

		const task = (await provider.provideTasks())!.find(
			(t) => t.name === "flat",
		)!;
		await (task.execution as any).callback();

		expect(terminal.calls[0].component).toBe("py");
		expect(terminal.calls[0].command).toBe("echo A && echo B");
	});

	test("parallel composite explicitly contains background join and wait", async () => {
		const terminal = new MockTerminalAPI();

		const provider = createProvider(
			{
				commands: [
					{ id: "a", exec: { commandLine: "echo A" } },
					{ id: "b", exec: { commandLine: "echo B" } },
					{
						id: "combo",
						composite: { parallel: true, commands: ["a", "b"] },
					},
				],
			},
			terminal,
		);

		const task = (await provider.provideTasks())!.find(
			(t) => t.name === "combo",
		)!;
		await (task.execution as any).callback();

		const cmd = terminal.calls[0].command;

		expect(cmd).toMatch(/echo A\s*&\s*echo B/);
		expect(cmd).toMatch(/wait$/);
	});
});

describe("Task naming — label precedence rules", () => {
	test("exec label overrides id", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", exec: { label: "Name Id A", commandLine: "echo" } },
			],
		}).provideTasks();

		expect(tasks![0].name).toBe("Name Id A");
	});

	test("composite label overrides id", async () => {
		const tasks = await createProvider({
			commands: [
				{ id: "a", exec: { commandLine: "echo" } },
				{ id: "b", composite: { label: "CompositeLabel", commands: ["a"] } },
			],
		}).provideTasks();

		expect(tasks!.some((t) => t.name === "CompositeLabel")).toBe(true);
	});
});
