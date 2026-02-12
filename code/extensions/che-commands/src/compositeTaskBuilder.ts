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

import * as vscode from "vscode";
import { V1alpha2DevWorkspaceSpecTemplateCommands } from "@devfile/api";

interface DevfileTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
	component?: string;
}

type ResolvedExec = {
	command: string;
	workdir: string;
	component?: string;
	env?: any[];
};

export class CompositeTaskBuilder {
	constructor(
		private channel: vscode.OutputChannel,
		private terminalExtAPI: any,
	) {}

	build(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
	): vscode.Task | undefined {
		this.channel.appendLine(
			`entered composite build ${command.id} with ${command.composite.commands.length} subcommands`,
		);
		if (!this.validate(command, all)) {
			this.channel.appendLine(
				`Skipping composite ${command.id}: invalid graph`,
			);
			return undefined;
		}

		const execs = this.flatten(command, all);
		this.channel.appendLine(
			`[DEBUG flatten] ${command.id} → ${execs.map((e) => e.component).join(", ")}`,
		);
		if (!execs.length) {
			return this.echoTask(`Composite ${command.id} resolved empty`);
		}

		const parallel = !!command.composite.parallel;
		this.channel.appendLine(
			`is parallel: ${parallel}, commands: ${execs.map((e) => e.command).join(", ")}, 
			components: ${execs.map((e) => e.component ?? "default").join(", ")}, size: ${execs.length}`,
		);
		const components = new Set(execs.map((e) => e.component ?? "__default__"));

		if (components.size === 1) {
			return this.buildSameComponentTask(command, execs, parallel);
		}

		return this.buildCrossComponentTask(command, execs, parallel);
	}

	private flatten(command: any, all: any[]): ResolvedExec[] {
		const result: ResolvedExec[] = [];

		const visit = (cmd: any, stack = new Set<string>()) => {
			if (!cmd || stack.has(cmd.id)) return;
			stack.add(cmd.id);

			if (cmd.exec?.commandLine) {
				result.push({
					command: cmd.exec.commandLine,
					workdir: cmd.exec.workingDir || "${PROJECT_SOURCE}",
					component: cmd.exec.component,
					env: cmd.exec.env,
				});
				return;
			}

			for (const ref of cmd.composite?.commands ?? []) {
				const sub =
					typeof ref === "string" ? all.find((c) => c.id === ref) : ref;

				if (sub) visit(sub, new Set(stack));
			}
		};

		visit(command);
		return result;
	}

	private buildSameComponentTask(
		command: any,
		execs: ResolvedExec[],
		parallel: boolean,
	) {
		const joiner = parallel ? " & " : " && ";

		let script = execs.map((e) => this.sanitize(e.command)).join(joiner);

		script = this.sanitize(script);
		if (parallel) script += " ; wait";

		const first = execs[0];

		this.channel.appendLine(
			`[composite:${command.id}] same-component → ${first.component ?? "default"} → ${script}`,
		);

		const kind: DevfileTaskDefinition = {
			type: "devfile",
			command: script,
			workdir: first.workdir,
			component: first.component,
		};

		return new vscode.Task(
			kind,
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			new vscode.CustomExecution(() =>
				this.terminalExtAPI.getMachineExecPTY(
					first.component,
					script,
					first.workdir,
				),
			),
		);
	}

	private buildCrossComponentTask(
		command: any,
		execs: ResolvedExec[],
		parallel: boolean,
	) {
		this.channel.appendLine(
			`[composite:${command.id}] cross-component → components: ${[...new Set(execs.map((e) => e.component ?? "default"))].join(", ")}
			parallel: ${parallel}, commands: ${execs.map((e) => e.command).join(", ")}`,
		);
		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			const aggregator: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					const run = async (e: ResolvedExec, index: number) => {
						this.channel.appendLine(
							`[Composite RUN #${index}] ${command.id} -> component: ${e.component ?? "default"} -> command: ${e.command}`,
						);

						const pty = await this.terminalExtAPI.getMachineExecPTY(
							e.component,
							e.command,
							e.workdir,
						);

						let buffer = "";

						return new Promise<{ index: number; text: string }>((resolve) => {
							pty.onDidWrite?.((data: string) => {
								if (data?.trim()) buffer += data;
							});

							pty.onDidClose?.(() => {
								const text = buffer.trim();

								if (text) {
									this.channel.appendLine(
										`[Composite OUTPUT #${index}] ${command.id} -> ${e.component ?? "default"} -> ${text}`,
									);
								}

								resolve({ index, text });
							});

							if (typeof pty.open === "function") {
								pty.open();
							}
						});
					};

					try {
						if (parallel) {
							const results = await Promise.all(execs.map((exec, i) => run(exec, i)));
							results
								.sort((a, b) => a.index - b.index)
								.forEach((result) => {
									if (result.text) writeEmitter.fire(result.text + "\r\n");
								});
						} else {
							for (let i = 0; i < execs.length; i++) {
								const result = await run(execs[i], i);
								if (result.text) writeEmitter.fire(result.text + "\r\n");
							}
						}

						closeEmitter.fire(0);
					} catch (err) {
						this.channel.appendLine(
							`Composite ${command.id} failed: ${String(err)}`,
						);
						closeEmitter.fire(1);
					}
				},

				close: () => {},
				handleInput: () => {},
			};

			return aggregator;
		});

		const first = execs[0];

		return new vscode.Task(
			{
				type: "devfile",
				command: `[composite:${command.id}:${parallel ? "parallel" : "sequential"}]`,
				workdir: first.workdir,
				component: first.component,
			},
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			execution,
		);
	}

	private sanitize(cmd: string) {
		return cmd.replace(/(?:\s*(?:&&|\|\||[|;&]))+\s*$/, "").trim();
	}

	private validate(cmd: any, all: any[], seen = new Set<string>()): boolean {
		if (!cmd.composite?.commands) return true;
		if (seen.has(cmd.id)) return false;
		seen.add(cmd.id);

		for (const ref of cmd.composite.commands) {
			const sub = typeof ref === "string" ? all.find((c) => c.id === ref) : ref;
			if (!sub || !this.validate(sub, all, seen)) return false;
		}

		seen.delete(cmd.id);
		return true;
	}

	private echoTask(msg: string) {
		return new vscode.Task(
			{ type: "devfile", command: "echo", workdir: "${PROJECT_SOURCE}" },
			vscode.TaskScope.Workspace,
			msg,
			"devfile",
			new vscode.CustomExecution(() =>
				this.terminalExtAPI.getMachineExecPTY(undefined, `echo "${msg}"`, ""),
			),
		);
	}
}
