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
		vscode.window.createOutputChannel("devfile-task-tests"),
		new MockCheAPI(devfile),
		terminal ?? new MockTerminalAPI(),
	);
}

async function provide(devfile: any, term?: MockTerminalAPI) {
	return createProvider(devfile, term).provideTasks();
}

async function runTask(task: vscode.Task) {
	const pty = await (task.execution as any).callback();

	if (pty && typeof pty.open === "function") {
		await pty.open();
	}

	return pty;
}

async function runByName(tasks: vscode.Task[], name: string) {
	const task = tasks.find((t) => t.name === name)!;
	return runTask(task);
}


async function runFirst(tasks: vscode.Task[]) {
	return runTask(tasks[0]);
}

describe("Exec command normalization", () => {
	test.each([
		["npm run build &&", "npm run build"],
		["mvn clean &&", "mvn clean"],
	])("removes dangling trailing operators — %s", async (input, expected) => {
		const term = new MockTerminalAPI();
		const tasks = await provide(
			{ commands: [{ id: "build", exec: { commandLine: input } }] },
			term,
		);
		await runFirst(tasks!);
		expect(term.calls[0].command).toBe(expected);
	});

	test("joins fragmented command arrays safely", async () => {
		const term = new MockTerminalAPI();
		const tasks = await provide(
			{
				commands: [
					{
						id: "compile",
						exec: { commandLine: ["mvn clean &&", "", "mvn install &&"] },
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("mvn clean && mvn install");
	});

	test("drops operator-only array fragments", async () => {
		const term = new MockTerminalAPI();
		const tasks = await provide(
			{
				commands: [
					{
						id: "compile",
						exec: { commandLine: ["mvn clean &&", "||", "mvn install &&"] },
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("mvn clean && mvn install");
	});

	test.each(["echo A; echo B", "ps aux | grep node", "run \\\n next"])(
		"preserves valid shell constructs — %s",
		async (cmd) => {
			const term = new MockTerminalAPI();
			const tasks = await provide(
				{ commands: [{ id: "shell", exec: { commandLine: cmd } }] },
				term,
			);
			await runFirst(tasks!);
			expect(term.calls[0].command).toContain(cmd.split(" ")[0]);
		},
	);
});

describe("Exec task runtime behavior", () => {
	test("prepends validated environment exports", async () => {
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
		expect(term.calls[0].command).toContain(`export FOO="bar\\"baz";`);
	});

	test("ignores invalid environment variable entries", async () => {
		const term = new MockTerminalAPI();
		const tasks = await provide(
			{
				commands: [
					{
						id: "env",
						exec: { commandLine: "echo hi", env: [{ name: "" }, {} as any] },
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("echo hi");
	});
});

describe("Composite execution behavior", () => {
	test("runs sequential steps across components", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "c1", commandLine: "echo 1" } },
					{ id: "b", exec: { component: "c2", commandLine: "echo 2" } },
					{ id: "combo", composite: { commands: ["a", "b"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "combo");
		expect(term.calls.map((c) => c.component)).toEqual(["c1", "c2"]);
	});

	test("flattens same-component sequential composites", async () => {
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
		expect(term.calls[0].command).toBe("A && B");
	});

	test("flattens same-component parallel composites", async () => {
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
		expect(term.calls[0].command).toMatch(/(A.*&.*B|B.*&.*A).*wait\s*$/);
	});
});

describe("Task naming and resolution contract", () => {
	test("prefers exec label over id", async () => {
		const tasks = await provide({
			commands: [
				{ id: "x", exec: { label: "Nice Name", commandLine: "echo" } },
			],
		});
		expect(tasks![0].name).toBe("Nice Name");
	});

	test("resolveTask returns same task instance", async () => {
		const provider = createProvider({ commands: [] });

		const fakeExec: any = {
			callback: async () => ({ open() {}, close() {}, onDidWrite() {} }),
		};

		const task = new vscode.Task(
			{ type: "devfile" },
			vscode.TaskScope.Workspace,
			"sample",
			"devfile",
			fakeExec,
		);

		expect(await provider.resolveTask(task)).toBe(task);
	});
});

describe("Cross-component composite command execution", () => {
	const devfile = {
		commands: [
			{
				id: "signal-backend",
				exec: {
					component: "backend",
					commandLine: "python demo.py component_signal --component backend",
				},
			},
			{
				id: "signal-frontend",
				exec: {
					component: "frontend",
					commandLine: "python demo.py component_signal --component frontend",
				},
			},
			{
				id: "component-seq-demo",
				composite: {
					commands: ["signal-backend", "signal-frontend"],
					parallel: false,
				},
			},
			{
				id: "component-parallel-demo",
				composite: {
					commands: ["signal-backend", "signal-frontend"],
					parallel: true,
				},
			},
		],
	};

	test("executes sequential composite across components in declared order", async () => {
		const term = new MockTerminalAPI({ debug: false });
		const tasks = await provide(devfile, term);

		expect(tasks!.map(t => t.name).sort()).toEqual([
			"component-parallel-demo",
			"component-seq-demo",
			"signal-backend",
			"signal-frontend",
		]);

		const task = tasks!.find(t => t.name === "component-seq-demo")!;
		const pty = await runTask(task);

		expect(term.calls).toHaveLength(2);

		expect(term.calls[0].component).toBe("backend");
		expect(term.calls[1].component).toBe("frontend");

		expect(term.calls[0].command).toContain("--component backend");
		expect(term.calls[1].command).toContain("--component frontend");

		expect(pty).toBeDefined();
		expect(term.calls.at(-1)!.component).toBe("frontend");
	});

	test("executes parallel composite across components", async () => {
		const term = new MockTerminalAPI({ debug: false });
		const tasks = await provide(devfile, term);

		const task = tasks!.find(t => t.name === "component-parallel-demo")!;
		const pty = await runTask(task);

		expect(term.calls).toHaveLength(2);

		expect(term.calls.map(c => c.component).sort()).toEqual([
			"backend",
			"frontend",
		]);

		expect(pty).toBeDefined();
	});
});

describe("Additional coverage", () => {
	test("includes commands explicitly imported with parent scope", async () => {
		const tasks = await provide({
			commands: [
				{
					id: "parent-cmd",
					exec: { commandLine: "echo ok" },
					attributes: { "controller.devfile.io/imported-by": "parent" },
				},
			],
		});

		expect(tasks).toHaveLength(1);
		expect(tasks![0].name).toBe("parent-cmd");
	});

	test("filters internal ssh agent helper commands by id pattern", async () => {
		const tasks = await provide({
			commands: [
				{
					id: "init-ssh-agent-command-42",
					exec: { commandLine: "echo should-not-run" },
				},
			],
		});

		expect(tasks).toHaveLength(0);
	});

	test("sanitizeCommand leaves already clean commands unchanged", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [{ id: "clean", exec: { commandLine: "npm run build" } }],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("npm run build");
	});

	test("normalizes mixed noisy command array with blanks and operators", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{
						id: "noisy",
						exec: {
							commandLine: ["cmd &&", "", "||", "next &&", "   "],
						},
					},
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toBe("cmd && next");
	});

	test("composite resolves empty when referenced command has no exec or composite", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "noop" },
					{ id: "combo", composite: { commands: ["noop"] } },
				],
			},
			term,
		);

		await runFirst(tasks!);
		expect(term.calls[0].command).toContain("resolved empty");
	});

	test("composite step env variables are applied during flatten execution", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{
						id: "a",
						exec: {
							component: "c",
							commandLine: "echo A",
							env: [{ name: "X", value: "1" }],
						},
					},
					{
						id: "b",
						exec: {
							component: "c",
							commandLine: "echo B",
						},
					},
					{
						id: "combo",
						composite: { commands: ["a", "b"] },
					},
				],
			},
			term,
		);

		await runByName(tasks!, "combo");

		expect(term.calls[0].command).toContain('export X="1"');
	});

	test("nested composite with parallel mode flattens correctly in same component", async () => {
		const term = new MockTerminalAPI();

		const tasks = await provide(
			{
				commands: [
					{ id: "a", exec: { component: "py", commandLine: "A &&" } },
					{ id: "b", exec: { component: "py", commandLine: "B" } },
					{ id: "inner", composite: { commands: ["a", "b"], parallel: true } },
					{ id: "outer", composite: { commands: ["inner"] } },
				],
			},
			term,
		);

		await runByName(tasks!, "outer");

		expect(term.calls[0].command).toContain("&");
	});
});
