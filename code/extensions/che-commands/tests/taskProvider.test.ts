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

describe("Trailing with '&'", () => {
	test("removes trailing && from exec command", async () => {
		const devfile = {
			commands: [{ id: "build", exec: { commandLine: "npm run build &&" } }],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		const exec = tasks![0].execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe("npm run build");
	});

	test("normalizes multiline YAML command with &&", async () => {
		const devfile = {
			commands: [
				{
					id: "compile",
					exec: {
						commandLine: ["mvn clean &&", "", "mvn install &&"],
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe("mvn clean && mvn install");
	});
});

describe("Command normalization & composites)", () => {
	test("composite joins subcommands without broken &&", async () => {
		const devfile = {
			commands: [
				{ id: "a", exec: { commandLine: "echo A &&" } },
				{ id: "b", exec: { commandLine: "echo B &&" } },
				{ id: "all", composite: { commands: ["a", "b"] } },
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		const composite = (tasks || []).find(
			(t: { name: string }) => t.name === "all",
		)!;
		const exec = composite.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe("echo A && echo B");
	});

	test("parallel composite uses & and wait", async () => {
		const devfile = {
			commands: [
				{ id: "a", exec: { commandLine: "echo A" } },
				{ id: "b", exec: { commandLine: "echo B" } },
				{
					id: "p",
					composite: { parallel: true, commands: ["a", "b"] },
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || []).find(
			(t: { name: string }) => t.name === "p",
		)!.execution as any;

		await exec.callback();

		expect(terminal.calls[0].command).toBe("echo A & echo B ; wait");
	});

	test("cyclic composite is rejected", async () => {
		const devfile = {
			commands: [
				{ id: "a", composite: { commands: ["b"] } },
				{ id: "b", composite: { commands: ["a"] } },
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		expect((tasks || []).length).toBe(0);
	});
});

describe("Advanced shell normalization rules", () => {
	test("does not break shell line-continuation (\\) commands", async () => {
		const devfile = {
			commands: [
				{
					id: "debug",
					exec: {
						commandLine: `
dlv \\
  --listen=127.0.0.1:1234 \\
  --only-same-user=false \\
  debug main.go
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(
			`dlv \\
--listen=127.0.0.1:1234 \\
--only-same-user=false \\
debug main.go`,
		);
	});

	test("does not inject && when semicolon chaining is used", async () => {
		const devfile = {
			commands: [
				{
					id: "semicolon",
					exec: {
						commandLine: `
echo start;
echo middle;
echo end
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(`echo start;
echo middle;
echo end`);
	});

	test("does not inject && when || operator is used", async () => {
		const devfile = {
			commands: [
				{
					id: "or-operator",
					exec: {
						commandLine: `
make build || echo "build failed"
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe('make build || echo "build failed"');
	});

	test("does not inject && when pipes are used", async () => {
		const devfile = {
			commands: [
				{
					id: "pipe",
					exec: {
						commandLine: `
ps aux | grep node | wc -l
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe("ps aux | grep node | wc -l");
	});

	test("does not break here-doc commands", async () => {
		const devfile = {
			commands: [
				{
					id: "heredoc",
					exec: {
						commandLine: `
cat <<EOF > file.txt
hello
world
EOF
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(
			`cat <<EOF > file.txt
hello
world
EOF`,
		);
	});

	test("does not break docker multiline commands", async () => {
		const devfile = {
			commands: [
				{
					id: "docker",
					exec: {
						commandLine: `
docker run \\
  -v /tmp:/app \\
  node:18 npm test
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(
			`docker run \\
-v /tmp:/app \\
node:18 npm test`,
		);
	});

	test("mixed advanced syntax still avoids && injection", async () => {
		const devfile = {
			commands: [
				{
					id: "mixed",
					exec: {
						commandLine: `
echo hello | grep h;
echo done
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(
			`echo hello | grep h;
echo done`,
		);
	});

	test("single line command remains unchanged", async () => {
		const devfile = {
			commands: [
				{
					id: "single",
					exec: {
						commandLine: "npm run build",
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe("npm run build");
	});

	test("simple multiline commands get && injected", async () => {
		const devfile = {
			commands: [
				{
					id: "simple-chain",
					exec: {
						commandLine: `
npm install
npm test
npm build
`,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.calls[0].command).toBe(
			"npm install && npm test && npm build",
		);
	});
});

describe("Check exec has its own component", () => {
	test("composite sequential runs each exec in its own component", async () => {
		const devfile = {
			commands: [
				{
					id: "a",
					exec: {
						component: "builder",
						commandLine: "echo A",
					},
				},
				{
					id: "b",
					exec: {
						component: "runtime",
						commandLine: "echo B",
					},
				},
				{
					id: "seq",
					composite: {
						commands: ["a", "b"],
						parallel: false,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		const composite = tasks!.find((t) => t.name === "seq")!;
		const exec = composite.execution as any;

		await exec.callback();

		// Two real execs + 1 dummy PTY completion message
		expect(terminal.calls.length).toBe(3);

		expect(terminal.calls[0]).toEqual({
			component: "builder",
			command: "echo A",
			cwd: expect.any(String),
		});

		expect(terminal.calls[1]).toEqual({
			component: "runtime",
			command: "echo B",
			cwd: expect.any(String),
		});
	});

	test("composite parallel runs each exec in its own component", async () => {
		const devfile = {
			commands: [
				{
					id: "a",
					exec: {
						component: "builder",
						commandLine: "echo A",
					},
				},
				{
					id: "b",
					exec: {
						component: "runtime",
						commandLine: "echo B",
					},
				},
				{
					id: "par",
					composite: {
						commands: ["a", "b"],
						parallel: true,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		const composite = tasks!.find((t) => t.name === "par")!;
		const exec = composite.execution as any;

		await exec.callback();

		// Two real execs + 1 dummy PTY completion message
		expect(terminal.calls.length).toBe(3);

		const components = terminal.calls
			.slice(0, 2)
			.map((c) => c.component)
			.sort();

		expect(components).toEqual(["builder", "runtime"]);
	});

	test("composite with same component is flattened into one execution", async () => {
		const devfile = {
			commands: [
				{
					id: "a",
					exec: {
						component: "python",
						commandLine: "echo A",
					},
				},
				{
					id: "b",
					exec: {
						component: "python",
						commandLine: "echo B",
					},
				},
				{
					id: "flat",
					composite: {
						commands: ["a", "b"],
						parallel: false,
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();
		const composite = tasks!.find((t) => t.name === "flat")!;
		const exec = composite.execution as any;

		await exec.callback();

		// Only ONE real execution
		expect(terminal.calls.length).toBe(1);
		expect(terminal.calls[0].component).toBe("python");
		expect(terminal.calls[0].command).toBe("echo A && echo B");
	});
});

describe("ubi8-ubi9 composite", () => {
	function baseCommands() {
		return [
			{
				id: "ubi8-tools-version",
				exec: {
					label: "ubi8 version",
					component: "ubi8",
					commandLine: "echo ubi8",
				},
			},
			{
				id: "ubi9-tools-version",
				exec: {
					label: "ubi9 version",
					component: "ubi9",
					commandLine: "echo ubi9",
				},
			},
		];
	}

	test("sequential composite executes both components", async () => {
		const devfile = {
			commands: [
				...baseCommands(),
				{
					id: "parallel-ubi8-ubi9",
					composite: {
						label: "Parallel: Check echo ubi8-ubi9",
						parallel: false,
						commands: ["ubi8-tools-version", "ubi9-tools-version"],
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();

		// label should be used instead of id
		const task = tasks!.find(
			(t) => t.name === "Parallel: Check echo ubi8-ubi9",
		)!;

		await (task.execution as any).callback();

		// ubi8 + ubi9 + completion echo
		expect(terminal.calls.length).toBe(3);

		expect(terminal.calls[0].component).toBe("ubi8");
		expect(terminal.calls[1].component).toBe("ubi9");
	});

	test("parallel composite executes both components", async () => {
		const devfile = {
			commands: [
				...baseCommands(),
				{
					id: "parallel-ubi8-ubi9",
					composite: {
						label: "Parallel: Check echo ubi8-ubi9",
						parallel: true,
						commands: ["ubi8-tools-version", "ubi9-tools-version"],
					},
				},
			],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal,
		);

		const tasks = await provider.provideTasks();

		const task = tasks!.find(
			(t) => t.name === "Parallel: Check echo ubi8-ubi9",
		)!;

		await (task.execution as any).callback();

		// multi-component parallel → still 2 exec + completion
		expect(terminal.calls.length).toBe(3);

		const components = terminal.calls
			.slice(0, 2)
			.map((c) => c.component)
			.sort();

		expect(components).toEqual(["ubi8", "ubi9"]);
	});

	test("composite label is used as task name", async () => {
		const devfile = {
			commands: [
				...baseCommands(),
				{
					id: "parallel-ubi8-ubi9",
					composite: {
						label: "Parallel: Check echo ubi8-ubi9",
						commands: ["ubi8-tools-version", "ubi9-tools-version"],
					},
				},
			],
		};

		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			new MockTerminalAPI(),
		);

		const tasks = await provider.provideTasks();

		expect(
			tasks!.some((t) => t.name === "Parallel: Check echo ubi8-ubi9"),
		).toBe(true);
	});
});
