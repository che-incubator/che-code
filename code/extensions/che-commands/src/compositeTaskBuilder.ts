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

	private buildSeqCrossComponent(command: any, execs: ResolvedExec[]) {
		this.channel.appendLine(
			`[Composite Seq:${command.id}] cross-component → components: ${this.getComponentList(execs)}
			commands: ${execs.map((e) => e.command).join(", ")}`,
		);

		let activePtys = new Set<vscode.Pseudoterminal>();
		let isCancelled = false;

		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			const aggregator: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					const run = async (e: ResolvedExec) => {
						if (isCancelled) return;
						const tag = `${command.id}:${e.component ?? "default"}`;

						this.channel.appendLine(
							`[Composite Seq RUN] ${tag} -> command: ${e.command}`,
						);

						const pty = await this.terminalExtAPI.getMachineExecPTY(
							e.component,
							e.command,
							e.workdir,
						);

						activePtys.add(pty);

						await new Promise<void>((resolve) => {
							pty.onDidWrite?.((data: string) => {
								if (!data) return;
								const tagged = `[${tag}] ${data}`;
								writeEmitter.fire(data);
								this.channel.append(tagged);
							});

							pty.onDidClose?.(() => {
								this.channel.appendLine(`[Composite Seq DONE] ${tag}`);
								activePtys.delete(pty);
								resolve();
							});

							if (typeof pty.open === "function") {
								pty.open();
							}
						});
					};

					for (const e of execs) {
						if (isCancelled) break;
						await run(e);
					}

					closeEmitter.fire(0);
				},

				close: () => {
					this.channel.appendLine("[Composite Seq] Terminal closed by user");

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
						this.channel.appendLine(
							"[Composite] Ctrl+C received — terminating",
						);

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
				command: `[composite:${command.id}:"sequential"]`,
				workdir: first.workdir,
				component: first.component,
			},
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			execution,
		);
	}

	private buildParallelCrossComponent(
		command: any,
		execs: ResolvedExec[],
	): vscode.Task {
		this.channel.appendLine(
			`[Composite Parallel:${command.id}] cross-component → components: ${this.getComponentList(execs)}
			commands: ${execs.map((e) => e.command).join(", ")}`,
		);

		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			const running = new Set<vscode.TaskExecution>();
			let exitCode = 0;
			let cancelled = false;

			const cleanup = () => {
				endListener.dispose();
				running.clear();
			};

			const terminateAll = () => {
				cancelled = true;

				for (const exec of running) {
					try {
						exec.terminate();
					} catch {}
				}

				cleanup();
				closeEmitter.fire(130);
			};

			const endListener = vscode.tasks.onDidEndTaskProcess((e) => {
				if (!running.has(e.execution)) return;

				running.delete(e.execution);

				if (e.exitCode && e.exitCode !== 0) {
					exitCode = e.exitCode;
				}

				if (!cancelled && running.size === 0) {
					cleanup();
					closeEmitter.fire(exitCode);
				}
			});

			const pty: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					for (const e of execs) {
						const childTask = this.buildStreamingExecTask(
							command.id,
							e,
							writeEmitter,
						);

						const exec = await vscode.tasks.executeTask(childTask);

						running.add(exec);
						this.channel.appendLine(
							`[Composite Parallel:${command.id}] Started task for component: ${e.component ?? "default"}`,
						);
					}
				},

				close: () => {
					this.channel.appendLine(
						`[Composite Parallel:${command.id}] terminal closed`,
					);
					terminateAll();
				},

				handleInput: (data: string) => {
					if (data === "\x03") {
						this.channel.appendLine(
							`[Composite Parallel:${command.id}] Ctrl+C received`,
						);
						terminateAll();
					}
				},
			};

			return pty;
		});

		return new vscode.Task(
			{
				type: "devfile",
				command: `[composite:${command.id}:parallel]`,
			},
			vscode.TaskScope.Workspace,
			command.composite.label || command.id,
			"devfile",
			execution,
		);
	}

	private buildStreamingExecTask(
		compositeId: string,
		e: ResolvedExec,
		parentEmitter: vscode.EventEmitter<string>,
	): vscode.Task {
		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			let child: vscode.Pseudoterminal | null = null;
			let cancelled = false;

			const terminateChild = () => {
				cancelled = true;

				if (child) {
					try {
						child.handleInput?.("\x03");
						child.close?.();
					} catch {}
				}

				closeEmitter.fire(130);
			};

			const pty: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					const created = await this.terminalExtAPI.getMachineExecPTY(
						e.component,
						e.command,
						e.workdir,
					);

					child = created;

					created.onDidWrite?.((data: string) => {
						if (!data) return;

						const tagged = `[${e.component ?? "default"}] ${data}`;

						parentEmitter.fire(data);
						writeEmitter.fire(tagged);
					});

					created.onDidClose?.((code?: number) => {
						if (!cancelled) {
							closeEmitter.fire(code ?? 0);
						}
					});

					created.open?.();
				},

				close: terminateChild,

				handleInput: (data: string) => {
					if (data === "\x03") {
						terminateChild();
					}
				},
			};

			return pty;
		});

		const task = new vscode.Task(
			{
				type: "devfile",
				command: e.command,
				workdir: e.workdir,
				component: e.component,
			},
			vscode.TaskScope.Workspace,
			`${compositeId}:${e.component}`,
			"devfile",
			execution,
		);

		task.presentationOptions = {
			reveal: vscode.TaskRevealKind?.Never ?? 0,
			panel: vscode.TaskPanelKind?.Dedicated ?? 1,
			clear: false,
		};

		return task;
	}

	private getComponentList(execs: ResolvedExec[]): string {
		return [...new Set(execs.map((e) => e.component ?? "default"))].join(", ");
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
