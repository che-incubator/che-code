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

describe("Regression: eclipse-che/che#23709 (broken && handling)", () => {
	test("removes trailing && from exec command", async () => {
		const devfile = {
			commands: [{ id: "build", exec: { commandLine: "npm run build &&" } }],
		};

		const terminal = new MockTerminalAPI();
		const provider = new DevfileTaskProvider(
			vscode.window.createOutputChannel("test"),
			new MockCheAPI(devfile),
			terminal
		);

		const tasks = await provider.provideTasks();
		const exec = tasks![0].execution as any;
		await exec.callback();

		expect(terminal.lastCommand).toBe("npm run build");
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
			terminal
		);

		const exec = ((await provider.provideTasks()) || [])[0]!.execution as any;
		await exec.callback();

		expect(terminal.lastCommand).toBe("mvn clean && mvn install");
	});
});

describe("Regression: che-incubator/che-code PR #601 (command normalization & composites)", () => {
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
			terminal
		);

		const tasks = await provider.provideTasks();
		const composite = (tasks || []).find((t: { name: string }) => t.name === "all")!;
		const exec = composite.execution as any;
		await exec.callback();

		expect(terminal.lastCommand).toBe("echo A && echo B");
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
			terminal
		);

		const exec = ((await provider.provideTasks()) || []).find(
			(t: { name: string }) => t.name === "p"
		)!.execution as any;

		await exec.callback();

		expect(terminal.lastCommand).toBe("echo A & echo B ; wait");
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
			terminal
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

		expect(terminal.lastCommand).toBe(
			"dlv \\ --listen=127.0.0.1:1234 \\ --only-same-user=false \\ debug main.go",
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

		expect(terminal.lastCommand).toBe("echo start; echo middle; echo end");
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

		expect(terminal.lastCommand).toBe('make build || echo "build failed"');
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

		expect(terminal.lastCommand).toBe("ps aux | grep node | wc -l");
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

		expect(terminal.lastCommand).toBe("cat <<EOF > file.txt hello world EOF");
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

		expect(terminal.lastCommand).toBe(
			"docker run \\ -v /tmp:/app \\ node:18 npm test",
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

		expect(terminal.lastCommand).toBe("echo hello | grep h; echo done");
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

		expect(terminal.lastCommand).toBe("npm run build");
	});
});
