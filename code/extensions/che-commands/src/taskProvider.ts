/**********************************************************************
 * Copyright (c) 2022-2026 Red Hat, Inc.
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
} from '@devfile/api';
import * as vscode from 'vscode';

/**
 * Defines the structure of a Devfile task definition.
 */
interface DevfileTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
	component?: string;
}

/**
 * Defines the structure of a resolved execution command.
 */
type ResolvedExec = {
	commandLine: string;
	workingDir: string;
	component?: string;
	env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>;
};

/**
 * Provides tasks based on Devfile commands.
 */
export class DevfileTaskProvider implements vscode.TaskProvider {
	constructor(
		private readonly channel: vscode.OutputChannel,
		private readonly cheAPI: any,
		private readonly terminalExtAPI: any,
	) {}

	/**
	 * Provides tasks from the Devfile commands.
	 * @returns A list of VS Code tasks generated from Devfile commands.
	 */
	provideTasks(): vscode.ProviderResult<vscode.Task[]> {
		return this.computeTasks();
	}

	/**
	 * Resolves a given task.
	 * @param task The task to resolve.
	 * @returns The resolved task.
	 */
	resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
		return task;
	}

	/**
	 * Computes the tasks from the Devfile commands.
	 * @returns A list of VS Code tasks generated from Devfile commands.
	 */
	private async computeTasks(): Promise<vscode.Task[]> {
		const commands = await this.fetchDevfileCommands();

		return commands
			.filter(this.isRunnableCommand)
			.filter(this.isNotImportedChild)
			.filter((c) => !/^init-ssh-agent-command-\d+$/.test(c.id))
			.map((c) => this.createCheTask(c, commands))
			.filter((t): t is vscode.Task => !!t);
	}

	/**
	 * Fetches the Devfile commands from the Che API.
	 * @returns A promise that resolves to an array of Devfile commands.
	 */
	private async fetchDevfileCommands(): Promise<
		V1alpha2DevWorkspaceSpecTemplateCommands[]
	> {
		const devfileService = this.cheAPI.getDevfileService();
		const devfile: V1alpha2DevWorkspaceSpecTemplate =
			await devfileService.get();

		const cmds = devfile.commands ?? [];
		if (cmds.length) {
			this.channel.appendLine(
				`Detected ${cmds.length} Command(s) in the flattened Devfile.`,
			);
		}
		return cmds;
	}

	/**
	 * Checks if a Devfile command is runnable.
	 * @param command The command to check.
	 * @returns True if the command is runnable, false otherwise.
	 */
	private isRunnableCommand(command: any): boolean {
		return (
			!!command.exec?.commandLine ||
			(command.composite &&
				Array.isArray(command.composite.commands) &&
				command.composite.commands.length > 0)
		);
	}

	/**
	 * Checks if a Devfile command is an imported child.
	 * @param command The command to check.
	 * @returns True if the command is an imported child, false otherwise.
	 */
	private isNotImportedChild(command: any): boolean {
		const importedBy = (command.attributes as any)?.[
			"controller.devfile.io/imported-by"
		];
		return (
			!command.attributes || importedBy === undefined || importedBy === "parent"
		);
	}

	/**
	 * Normalizes the execution block.
	 * @param execBlock The execution block to normalize.
	 * @returns The normalized execution or null if invalid.
	 */
	private normalizeExec(execBlock: any): ResolvedExec | null {
		if (!execBlock?.commandLine) return null;

		let lines: string[] = Array.isArray(execBlock.commandLine)
			? execBlock.commandLine.map(String)
			: execBlock.commandLine.toString().split(/\r?\n/);

		lines = lines
			.map((line) => line.replace(/\\\\\s*$/, " \\"))
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => line.replace(/(?:\s*&&\s*)+$/, "").trim());

		if (!lines.length) return null;

		const isShellScript = lines.some(
			(line) =>
				line.endsWith("\\") ||
				line.endsWith(";") ||
				line.includes("||") ||
				line.includes("|") ||
				line.includes("<<"),
		);

		return {
			commandLine: isShellScript ? lines.join("\n") : lines.join(" && "),
			workingDir: (execBlock.workingDir ?? "${PROJECT_SOURCE}").toString(),
			component: execBlock.component?.toString(),
			env: Array.isArray(execBlock.env) ? execBlock.env : undefined,
		};
	}

	/**
	 * Builds the initial environment variable exports.
	 * @param env The environment variables to build.
	 * @returns A string containing the initial environment variable exports.
	 */
	private buildInitialVariables(
		env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>,
	): string {
		if (!env?.length) return "";
		return env
			.filter((e) => e?.name)
			.map(
				(e) =>
					`export ${e.name}="${(e.value ?? "").toString().replace(/"/g, '\\"')}"; `,
			)
			.join("");
	}

	/**
	 * Validates composite commands strictly to avoid cyclic references.
	 * @param command The command to check.
	 * @param all All available commands.
	 * @param visited A set of visited command IDs.
	 * @returns True if the command is valid, false otherwise.
	 */
	private validateCompositeStrict(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
		visited = new Set<string>(),
	): boolean {
		if (!command?.composite?.commands) return true;

		const label = command.composite?.label || command.id;

		if (command.id) {
			if (visited.has(command.id)) {
				this.channel.appendLine(
					`Skipping composite ${label}: cyclic reference detected`,
				);
				return false;
			}
			visited.add(command.id);
		}

		for (const entry of command.composite.commands) {
			const sub =
				typeof entry === "string" ? all.find((c) => c.id === entry) : entry;

			if (!sub) {
				this.channel.appendLine(
					`Composite ${label} references missing command`,
				);
				return false;
			}

			if (!this.validateCompositeStrict(sub, all, visited)) return false;
		}

		if (command.id) visited.delete(command.id);
		return true;
	}

	/**
	 * Resolves all exec commands from a composite command.
	 * @param command The composite command to resolve.
	 * @param all All available commands.
	 * @returns An array of resolved exec commands.
	 */
	private resolveExecsFromComposite(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
	): ResolvedExec[] {
		const result: ResolvedExec[] = [];

		const walk = (cmd: any) => {
			if (cmd.exec) {
				const norm = this.normalizeExec(cmd.exec);
				if (norm) result.push(norm);
			}
			for (const e of cmd.composite?.commands ?? []) {
				const sub = typeof e === "string" ? all.find((c) => c.id === e) : e;
				if (sub) walk(sub);
			}
		};

		walk(command);
		return result;
	}

	/**
	 * Creates a PTY execution for a task.
	 * @param component The component to execute the command in.
	 * @param command The command to execute.
	 * @param workingDir The working directory for the command.
	 * @returns A CustomExecution instance for the PTY execution.
	 */
	private createPTYExecution(
		component: string | undefined,
		command: string,
		workingDir: string,
	): vscode.CustomExecution {
		return new vscode.CustomExecution(async () => {
			const resolvedWd = this.expandEnvVariables(workingDir);
			return this.terminalExtAPI.getMachineExecPTY(
				component,
				command,
				resolvedWd,
			);
		});
	}

	/**
	 * Creates a VS Code task.
	 * @param kind The kind of the task.
	 * @param label The label of the task.
	 * @param execution The execution of the task.
	 * @returns The created VS Code task.
	 */
	private createTask(
		kind: DevfileTaskDefinition,
		label: string,
		execution: vscode.CustomExecution,
	): vscode.Task {
		return new vscode.Task(
			kind,
			vscode.TaskScope.Workspace,
			label,
			"devfile",
			execution,
			[],
		);
	}

	/**
	 * Creates a message task that echoes a message.
	 * @param message The message to echo.
	 * @param label The label of the task.
	 * @returns The created message task.
	 */
	private createMessageTask(message: string, label: string): vscode.Task {
		return this.createTask(
			{ type: "devfile", command: "", workdir: "${PROJECT_SOURCE}" },
			label,
			this.createPTYExecution(
				undefined,
				`echo "${message.replace(/"/g, '\\"')}"`,
				"${PROJECT_SOURCE}",
			),
		);
	}

	/**
	 * Expands environment variables in a string.
	 * @param line The line to expand.
	 * @returns The expanded line.
	 */
	private expandEnvVariables(line: string): string {
		return line.replace(/\${([A-Z0-9_]+)}/gi, (_, k) => process.env[k] ?? "");
	}

	/**
	 * Creates a Che task from a command.
	 * @param command The command to create the task from.
	 * @param allCommands All available commands.
	 * @returns The created Che task.
	 */
	private createCheTask(
		command: any,
		allCommands: V1alpha2DevWorkspaceSpecTemplateCommands[],
	): vscode.Task | undefined {
		try {

			// ------------------ EXEC ------------------
			if (command.exec) {
				const exec = this.normalizeExec(command.exec);
				if (!exec) return;

				const initialVars = this.buildInitialVariables(command.exec.env);
				const fullCommand = initialVars + exec.commandLine;
				const label = command.exec.label || command.id;

				return this.createTask(
					{
						type: "devfile",
						command: fullCommand,
						workdir: exec.workingDir,
						component: exec.component,
					},
					label,
					this.createPTYExecution(exec.component, fullCommand, exec.workingDir),
				);
			}

			// ------------------ COMPOSITE ------------------
			if (command.composite?.commands?.length) {
				if (!this.validateCompositeStrict(command, allCommands)) {
					return;
				}

				const execs = this.resolveExecsFromComposite(command, allCommands);
				const label = command.composite.label || command.id;

				if (!execs.length) {
					return this.createMessageTask(
						`Composite ${label} resolved to empty`,
						label,
					);
				}

				const components = new Set(execs.map((e) => e.component ?? ""));
				const isMultiComponent = components.size > 1;
				const parallel = !!command.composite.parallel;

				// Multi-component → sequential execution of commands
				if (isMultiComponent) {
					return this.createTask(
						{ type: "devfile", command: "[multi-component composite]" },
						label,
						new vscode.CustomExecution(async () => {
							const runExec = (e: ResolvedExec) =>
								this.terminalExtAPI.getMachineExecPTY(
									e.component,
									this.buildInitialVariables(e.env) + e.commandLine,
									this.expandEnvVariables(e.workingDir),
								);

							if (parallel) {
								this.channel.appendLine(
									`Composite ${label} (${command.id}) running in PARALLEL mode`,
								);
								await Promise.all(execs.map(runExec));
							} else {
								this.channel.appendLine(
									`Composite ${label} (${command.id}) running in SEQUENTIAL mode`,
								);
								for (const e of execs) {
									await runExec(e);
								}
							}

							return this.terminalExtAPI.getMachineExecPTY(
								undefined,
								`echo "Composite ${label} execution completed (${parallel ? "parallel" : "sequential"})"`,
								this.expandEnvVariables("${PROJECT_SOURCE}"),
							);
						}),
					);
				}

				// Single-component → join commands
				const joiner = parallel ? " & " : " && ";
				let compositeCmd = execs.map((e) => e.commandLine).join(joiner);
				if (parallel) compositeCmd += " ; wait";

				const primary = execs[0];

				return this.createTask(
					{
						type: "devfile",
						command: compositeCmd,
						workdir: primary.workingDir,
						component: primary.component,
					},
					label,
					this.createPTYExecution(
						primary.component,
						compositeCmd,
						primary.workingDir,
					),
				);
			}

			// ------------------ UNSUPPORTED ------------------
			return this.createMessageTask(
				`Unsupported command type for ${
					command?.exec?.label || command?.composite?.label || command?.id
				}`,
				command?.exec?.label ||
					command?.composite?.label ||
					command?.id ||
					"unsupported",
			);
		} catch (err: any) {
			this.channel.appendLine(
				`Error creating task for ${
					command?.exec?.label || command?.composite?.label || command?.id
				}: ${err?.message ?? String(err)}`,
			);
			return;
		}
	}
}
