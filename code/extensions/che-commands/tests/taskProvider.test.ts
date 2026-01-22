/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
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
		const composite = (tasks || []).find((t) => t.name === "all")!;
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
			(t) => t.name === "p"
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
