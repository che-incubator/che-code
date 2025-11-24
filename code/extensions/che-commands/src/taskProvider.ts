/**********************************************************************
 * Copyright (c) 2022-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import {
	V1alpha2DevWorkspaceSpecTemplate,
	V1alpha2DevWorkspaceSpecTemplateCommands,
	V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv,
} from "@devfile/api";
import * as vscode from "vscode";

interface DevfileTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
	component?: string;
}

export class DevfileTaskProvider implements vscode.TaskProvider {
	constructor(
		private channel: vscode.OutputChannel,
		private cheAPI: any,
		private terminalExtAPI: any
	) {}

	provideTasks(): vscode.ProviderResult<vscode.Task[]> {
		return this.computeTasks();
	}

	resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
		return task;
	}

	private async computeTasks(): Promise<vscode.Task[]> {
		const devfileCommands = await this.fetchDevfileCommands();

		const cheTasks: vscode.Task[] = devfileCommands!
			.filter(
				(command) =>
					command.exec?.commandLine ||
					(command.composite &&
						Array.isArray(command.composite.commands) &&
						command.composite.commands.length > 0)
			)
			.filter((command) => {
				const importedByAttribute = (command.attributes as any)?.[
					"controller.devfile.io/imported-by"
				];
				return (
					!command.attributes ||
					importedByAttribute === undefined ||
					importedByAttribute === "parent"
				);
			})
			.filter((command) => !/^init-ssh-agent-command-\d+$/.test(command.id))
			.map((command) => {
				this.channel.appendLine(`createCheTask called for: ${command.id}`);
				const t = this.createCheTask(command, devfileCommands);
				this.channel.appendLine(
					`createCheTask output for ${command.id}: ${t ? "TASK CREATED" : "undefined"}`
				);
				if (t) {
					const def = t.definition as DevfileTaskDefinition | any;
					const cmd = def?.command ?? "(no-command)";
					const wd = def?.workdir ?? "(no-workdir)";
					const comp = def?.component ?? "(no-component)";
					this.channel.appendLine(
						`  -> label='${t.name}', commandPreview='${String(cmd).slice(0, 200)}', workdir='${wd}', component='${comp}'`
					);
				}
				return t;
			})
			.filter((t): t is vscode.Task => !!t);
		return cheTasks;
	}

	private async fetchDevfileCommands(): Promise<
		V1alpha2DevWorkspaceSpecTemplateCommands[]
	> {
		const devfileService = this.cheAPI.getDevfileService();
		const devfile: V1alpha2DevWorkspaceSpecTemplate = await devfileService.get();
		if (devfile.commands && devfile.commands.length) {
			this.channel.appendLine(
				`Detected ${devfile.commands.length} Command(s) in the flattened Devfile.`
			);
			return devfile.commands;
		}
		return [];
	}

	private createCheTask(
		command: any,
		allCommands: V1alpha2DevWorkspaceSpecTemplateCommands[]
	): vscode.Task | undefined {
		// Expand placeholders like ${VAR} using process.env.
		// This is used only when starting the PTY so the server/container receives the real path.
		function expandEnvVariables(line: string | undefined): string {
			if (!line) return "";
			const regex = /\${[a-zA-Z_][a-zA-Z0-9_]*}/g;
			const envArray = line.match(regex);
			if (envArray && envArray.length) {
				for (const envName of envArray) {
					const key = envName.slice(2, -1);
					const envValue = process.env[key];
					if (envValue !== undefined) {
						line = line.replace(envName, envValue);
					}
				}
			}
			return line;
		}

		// Normalizes commandLine: trim, join newlines with ' && ', remove trailing '&&'s
		const normalizeExec = (execBlock: any) => {
			if (!execBlock) return null;
			const rawCommandLine = execBlock.commandLine;
			if (rawCommandLine === undefined || rawCommandLine === null) return null;

			let commandLine = "";
			if (Array.isArray(rawCommandLine)) {
				commandLine = rawCommandLine.map((s: any) => (s ?? "").toString()).join("\n");
			} else {
				commandLine = rawCommandLine.toString();
			}

			// cleanup: trim whitespace, convert newlines -> ' && ', remove trailing '&&'
			commandLine = commandLine.trim();
			if (commandLine.length === 0) return null;
			commandLine = commandLine.replace(/\r?\n/g, " && ");
			commandLine = commandLine.replace(/(?:\s*&&\s*)+$/, "");
			commandLine = commandLine.trim();
			if (commandLine.length === 0) return null;

			const workingDir = (execBlock.workingDir ?? "${PROJECT_SOURCE}").toString();
			const component = execBlock.component ? execBlock.component.toString() : undefined;
			const env = Array.isArray(execBlock.env) ? execBlock.env : undefined;

			return { commandLine, workingDir, component, env };
		};

		const buildInitialVariables = (
			env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>
		): string => {
			if (!env || !Array.isArray(env) || env.length === 0) return "";
			let initial = "";
			for (const e of env) {
				if (!e || !e.name) continue;
				const rawVal = (e.value ?? "").toString();
				const escaped = rawVal.replace(/"/g, '\\"');
				initial += `export ${e.name}="${escaped}"; `;
			}
			return initial;
		};

		try {
			// EXEC command
			if (command && command.exec) {
				const execInfo = normalizeExec(command.exec);
				if (execInfo) {
					const initialVariables = buildInitialVariables(command.exec.env);
					// use normalized commandLine directly (no trailing &&)
					const cmd = execInfo.commandLine;
					const kind: DevfileTaskDefinition = {
						type: "devfile",
						command: cmd,
						// keep literal devfile value in the task definition & logs
						workdir: execInfo.workingDir,
						component: execInfo.component,
					};

					const execution = new vscode.CustomExecution(
						async (): Promise<vscode.Pseudoterminal> => {
							// PTY should run in the expanded path
							const resolvedWorkdir = expandEnvVariables(execInfo.workingDir);
							return this.terminalExtAPI.getMachineExecPTY(
								execInfo.component,
								initialVariables + cmd,
								resolvedWorkdir
							);
						}
					);
					const label = command.exec && command.exec.label ? command.exec.label : command.id;
					return new vscode.Task(kind, vscode.TaskScope.Workspace, label, "devfile", execution, []);
				}
			}

			// Composite command support
			if (
				command &&
				command.composite &&
				Array.isArray(command.composite.commands) &&
				command.composite.commands.length > 0
			) {
				type ResolvedExec = {
					commandLine: string;
					workingDir: string;
					component?: string;
					env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>;
				};
				const resolvedExecs: ResolvedExec[] = [];

				for (const entry of command.composite.commands) {
					if (!entry) continue;

					let subCommand: any | undefined;

					if (typeof entry === "string") {
						subCommand = allCommands.find((c) => c && c.id === entry);
						if (!subCommand) {
							this.channel.appendLine(
								`Warning: composite ${command.id} references unknown command id '${entry}'`
							);
							continue;
						}
					} else if (typeof entry === "object") {
						subCommand = entry;
					} else {
						this.channel.appendLine(
							`Warning: composite ${command.id} has unsupported entry type; skipping`
						);
						continue;
					}

					if (!subCommand) continue;

					// prefer exec
					if (subCommand.exec) {
						const norm = normalizeExec(subCommand.exec);
						if (norm) {
							resolvedExecs.push({
								commandLine: norm.commandLine,
								workingDir: norm.workingDir,
								component: norm.component,
								env: subCommand.exec.env,
							});
							continue;
						}
					}

					// then composite (nested)
					if (subCommand.composite && Array.isArray(subCommand.composite.commands)) {
						for (const nested of subCommand.composite.commands) {
							if (!nested) continue;
							let nestedCmd: any | undefined;
							if (typeof nested === "string") {
								nestedCmd = allCommands.find((c) => c && c.id === nested);
							} else if (typeof nested === "object") {
								nestedCmd = nested;
							}
							if (nestedCmd?.exec) {
								const nn = normalizeExec(nestedCmd.exec);
								if (nn) {
									resolvedExecs.push({
										commandLine: nn.commandLine,
										workingDir: nn.workingDir,
										component: nn.component,
										env: nestedCmd.exec.env,
									});
								}
							}
						}
						continue;
					}

					this.channel.appendLine(
						`Warning: composite ${command.id} referenced command ${
							typeof entry === "string" ? entry : JSON.stringify(entry)
						} has no exec.commandLine; skipping`
					);
				}

				if (resolvedExecs.length === 0) {
					const kind: DevfileTaskDefinition = {
						type: "devfile",
						command: "",
						workdir: "${PROJECT_SOURCE}",
					};
					const execution = new vscode.CustomExecution(
						async (): Promise<vscode.Pseudoterminal> => {
							return this.terminalExtAPI.getMachineExecPTY(
								undefined,
								`echo "No sub-commands to run for composite ${command.id}"`,
								"${PROJECT_SOURCE}"
							);
						}
					);
					return new vscode.Task(kind, vscode.TaskScope.Workspace, command.id, "devfile", execution, []);
				}

				const parallel = !!(command.composite && command.composite.parallel);
				const joiner = parallel ? " & " : " && ";

				// build structured parts (keep env/workdir/cmdLine separate)
				const partsInfo: Array<{ envPrefix: string; wd: string; cmdLine: string }> = [];
				for (const e of resolvedExecs) {
					if (!e || !e.commandLine || !e.commandLine.trim()) continue;
					const envPrefix = buildInitialVariables(e.env);
					let cmdLine = (e.commandLine ?? "").toString().trim();
					// extra safety: remove trailing && if any
					cmdLine = cmdLine.replace(/(?:\s*&&\s*)+$/, "").trim();
					const wd = e.workingDir ?? "${PROJECT_SOURCE}";
					partsInfo.push({ envPrefix, wd, cmdLine });
				}

				if (partsInfo.length === 0) {
					const kind: DevfileTaskDefinition = {
						type: "devfile",
						command: "",
						workdir: "${PROJECT_SOURCE}",
					};
					const execution = new vscode.CustomExecution(
						async (): Promise<vscode.Pseudoterminal> => {
							return this.terminalExtAPI.getMachineExecPTY(
								undefined,
								`echo "Composite ${command.id} resolved to empty commands"`,
								"${PROJECT_SOURCE}"
							);
						}
					);
					return new vscode.Task(kind, vscode.TaskScope.Workspace, command.id, "devfile", execution, []);
				}

				// Decide whether we can produce a clean plain join:
				// safe when all parts share same workdir and none require envPrefix
				const sameWorkdir = partsInfo.every((p) => p.wd === partsInfo[0].wd);
				const anyEnv = partsInfo.some((p) => p.envPrefix && p.envPrefix.trim() !== "");

				let compositeCommandLine: string;
				if (!anyEnv && sameWorkdir) {
					// plain join of cleaned command lines
					compositeCommandLine = partsInfo
						.map((p) => p.cmdLine.replace(/(?:\s*&&\s*)+$/, "").trim())
						.filter(Boolean)
						.join(" && ");
				} else {
					// build subshell-wrapped parts (safe path)
					const parts: string[] = partsInfo.map((p) => `(${p.envPrefix}cd '${p.wd}' && ${p.cmdLine})`);
					compositeCommandLine = parts.join(joiner);
				}

				// keep the literal devfile workdir in the task definition & logs
				const primary = resolvedExecs[0];
				const kindWorkdir = primary.workingDir ?? "${PROJECT_SOURCE}";
				const targetComponent = primary.component;

				const kind: DevfileTaskDefinition = {
					type: "devfile",
					command: compositeCommandLine,
					workdir: kindWorkdir,
					component: targetComponent,
				};

				const execution = new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
					// PTY receives the expanded workdir
					const resolvedWorkdir = expandEnvVariables(kindWorkdir);
					return this.terminalExtAPI.getMachineExecPTY(targetComponent, compositeCommandLine, resolvedWorkdir);
				});

				const label = command.id ?? (command.composite && command.composite.label) ?? "composite-task";

				// debug: print composite preview
				this.channel.appendLine(
					`createCheTask (composite) for ${command.id}: label='${label}', compositePreview='${String(
						compositeCommandLine
					).slice(0, 1000)}', workdir='${kindWorkdir}'`
				);

				return new vscode.Task(kind, vscode.TaskScope.Workspace, label, "devfile", execution, []);
			}

			// Fallback for unsupported command types
			const kind: DevfileTaskDefinition = {
				type: "devfile",
				command: "",
				workdir: "${PROJECT_SOURCE}",
			};
			const execution = new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
				const resolvedWorkdir = expandEnvVariables("${PROJECT_SOURCE}");
				return this.terminalExtAPI.getMachineExecPTY(
					undefined,
					`echo "Unsupported command type for ${command?.id ?? "<unknown>"}"`,
					resolvedWorkdir
				);
			});
			return new vscode.Task(kind, vscode.TaskScope.Workspace, command?.id ?? "unsupported", "devfile", execution, []);
		} catch (err: any) {
			this.channel.appendLine(
				`Error creating task for command ${command?.id ?? "<unknown>"}: ${err?.message ?? String(err)}`
			);
			return undefined;
		}
	}
}
