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
		vscode.window.createOutputChannel("exec-tests"),
		new MockCheAPI(devfile),
		term ?? new MockTerminalAPI(),
	);
}

async function provide(devfile: any, term?: MockTerminalAPI) {
	return createProvider(devfile, term).provideTasks();
}

async function runFirst(tasks: vscode.Task[]) {
	await (tasks[0].execution as any).callback();
}

describe("Exec task creation and execution — positive scenarios", () => {
	test("creates task for simple exec command", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [{ id: "build", exec: { commandLine: "npm install" } }],
			},
			term,
		);

		expect(tasks).toHaveLength(1);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("npm install");
	});

	test("uses exec label as task name", async () => {
		const tasks = await provide({
			commands: [
				{
					id: "x",
					exec: { label: "Build App", commandLine: "echo ok" },
				},
			],
		});

		expect(tasks![0].name).toBe("Build App");
	});

	test("passes component to terminal execution", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{
						id: "run",
						exec: { component: "backend", commandLine: "echo hi" },
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].component).toBe("backend");
	});

	test("defaults working directory when not provided", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [{ id: "x", exec: { commandLine: "echo hi" } }],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].cwd).toContain("PROJECT_SOURCE");
	});
});

describe("Exec environment variable handling", () => {
	test("injects environment exports before command", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{
						id: "env",
						exec: {
							commandLine: "echo hello",
							env: [{ name: "FOO", value: 'bar"baz' }],
						},
					},
				],
			},
			term,
		);

		await runFirst(tasks!);

		const cmd = term.calls[0].command;
		expect(cmd).toContain(`export FOO="bar\\"baz";`);
		expect(cmd).toContain("echo hello");
	});

	test("handles empty env array safely", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{
						id: "x",
						exec: { commandLine: "echo hi", env: [] },
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("echo hi");
	});
});

describe("Exec working directory expansion", () => {
	test("expands ${VAR} placeholders from process.env", async () => {
		process.env.TEST_DIR = "/tmp/demo";
		const term = new MockTerminalAPI();

		const tasks = await provide(
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
		);

		await runFirst(tasks!);
		expect(term.calls[0].cwd).toBe("/tmp/demo");
	});
});

describe("Exec shell grammar preservation", () => {
	test.each([
		"echo A; echo B",
		"ps aux | grep node",
		"node app.js &",
		`tr "\\n" " "`,
	])("preserves shell operators — %s", async (cmd) => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [{ id: "x", exec: { commandLine: cmd } }],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe(cmd);
	});
});

describe("Exec complex chained shell scenario", () => {
	test("passes stop-application nodemon kill command unchanged", async () => {
		const term = new MockTerminalAPI({ debug: false });

		const complex = `node_server_pids=$(pgrep -fx '.*nodemon (--inspect )?app.js' | tr "\\n" " ") &&
echo "Stopping node server with PIDs: \${node_server_pids}" &&
kill -15 \${node_server_pids} &>/dev/null && echo 'Done.'`;

		const tasks = await provide(
			{
				commands: [
					{
						id: "stop",
						exec: {
							component: "ubi9-tools",
							commandLine: complex,
						},
					},
				],
			},
			term,
		);

		await runFirst(tasks!);

		expect(term.calls).toHaveLength(1);

		const call = term.calls[0];

		expect(call.component).toBe("ubi9-tools");
		expect(call.command).toContain("pgrep -fx");
		expect(call.command).toContain("&>/dev/null");
		expect(call.command).toContain("kill -15");
		expect(call.command).toContain("node_server_pids=$(");
	});
});

describe("Exec command filtering behavior", () => {
	test("does not create task when exec.commandLine missing", async () => {
		const tasks = await provide({
			commands: [{ id: "x" }],
		});

		expect(tasks).toHaveLength(0);
	});

	test("filters imported child commands", async () => {
		const tasks = await provide({
			commands: [
				{
					id: "child",
					exec: { commandLine: "echo" },
					attributes: {
						"controller.devfile.io/imported-by": "child",
					},
				},
			],
		});

		expect(tasks).toHaveLength(0);
	});

	test("filters init ssh agent commands", async () => {
		const tasks = await provide({
			commands: [
				{
					id: "init-ssh-agent-command-1",
					exec: { commandLine: "echo" },
				},
			],
		});

		expect(tasks).toHaveLength(0);
	});
});
