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
	label?: string;
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
		if (!this.validate(command, all)) {
			this.channel.appendLine(
				`Skipping composite ${command.id}: invalid graph`,
			);
			return undefined;
		}

		const execs = this.flatten(command, all);
		if (!execs.length) {
			return this.echoTask(`Composite ${command.id} resolved empty`);
		}

		const parallel = !!command.composite.parallel;

		const components = new Set(execs.map((e) => e.component ?? "__default__"));
		if (components.size === 1) {
			return this.buildSameComponentTask(command, execs, parallel);
		}

		if (parallel) {
			return this.buildParallelCrossComponent(command, execs);
		}

		return this.buildSeqCrossComponent(command, execs);
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
					label: cmd.exec.label,
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
			[],
		);
	}

	private buildSeqCrossComponent(command: any, execs: ResolvedExec[]) {
		let activePtys = new Set<vscode.Pseudoterminal>();
		let isCancelled = false;

		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			const aggregator: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					const run = async (e: ResolvedExec): Promise<number> => {
						if (isCancelled) return 130;
						const pty = await this.terminalExtAPI.getMachineExecPTY(
							e.component,
							e.command,
							e.workdir,
						);

						activePtys.add(pty);

						const result = await new Promise<number>((resolve) => {
							pty.onDidWrite?.((data: string) => {
								if (!data) return;
								writeEmitter.fire(data);
							});

							pty.onDidClose?.((exitCode?: number) => {
								activePtys.delete(pty);
								const code = exitCode ?? 1;
								resolve(code);
							});

							if (typeof pty.open === "function") {
								pty.open();
							}
						});
						return result;
					};

					for (const e of execs) {
						if (isCancelled) break;
						const exitCode: number = await run(e);
						if(exitCode !== 0) {
							isCancelled = true;
							closeEmitter.fire(exitCode);
							return;
						}
					}
					closeEmitter.fire(0);
				},

				close: () => {
					isCancelled = true;

					for (const p of activePtys) {
						try {
							p.handleInput?.("\x03");
							p.close?.();
						} catch {}
					}

					activePtys.clear();
					closeEmitter.fire(130);
				},

				handleInput: (data: string) => {
					if (data === "\x03") {
						isCancelled = true;

						for (const p of activePtys) {
							p.handleInput?.("\x03");
							p.close?.();
						}

						activePtys.clear();
						closeEmitter.fire(130);
					}
				},
			};

			return aggregator;
		});

		const first = execs[0];

		return new vscode.Task(
			{
				type: "devfile",
				command: command.id,
				workdir: first.workdir,
				component: first.component,
			},
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			execution,
			[],
		);
	}

	private buildParallelCrossComponent(
		command: any,
		execs: ResolvedExec[],
	): vscode.Task {
		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			const pty: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,

				onDidClose: closeEmitter.event,

				open: () => {
					execs.forEach((e, index) => {
						const childTask = this.buildExecTask(e, index === 0);

						vscode.tasks.executeTask(childTask);
					});
					closeEmitter.fire(0);
				},

				close: () => {
					closeEmitter.fire(0);
				},

				handleInput: () => {},
			};

			return pty;
		});

		const first = execs[0];

		const task = new vscode.Task(
			{
				type: "devfile",
				command: command.id,
				workdir: first.workdir,
				component: first.component,
			},
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			execution,
			[],
		);

		task.presentationOptions = {
			reveal: vscode.TaskRevealKind?.Never ?? 0,
			panel: vscode.TaskPanelKind?.New ?? 3,
			close: true,
			clear: true,
			focus: false,
			showReuseMessage: false,
		};

		return task;
	}

	private buildExecTask(e: ResolvedExec, focus: boolean): vscode.Task {
		const task = new vscode.Task(
			{
				type: "devfile",
				command: e.command,
				workdir: e.workdir,
				component: e.component,
			},
			vscode.TaskScope.Workspace,
			e.label || e.component || e.command,
			"devfile",
			new vscode.CustomExecution(() =>
				this.terminalExtAPI.getMachineExecPTY(
					e.component,
					e.command,
					e.workdir,
				),
			),
			[],
		);

		task.presentationOptions = {
			reveal: focus
				? (vscode.TaskRevealKind.Always ?? 1)
				: (vscode.TaskRevealKind.Silent ?? 2),
			panel: vscode.TaskPanelKind.Dedicated ?? 1,
			clear: false,
		};

		return task;
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
