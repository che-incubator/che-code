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
} from "@devfile/api";
import * as vscode from "vscode";

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
			.filter((cmd) => this.isRunnable(cmd))
			.filter((cmd) => this.isRootCommand(cmd))
			.filter((cmd) => !/^init-ssh-agent-command-\d+$/.test(cmd.id))
			.map((cmd) =>
				cmd.composite?.commands?.length
					? this.handleCompositeCommand(cmd, commands)
					: this.createExecTaskV1(cmd),
			)
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

		if (devfile.commands?.length) {
			this.channel.appendLine(
				`Detected ${devfile.commands.length} Command(s) in the flattened Devfile.`,
			);
			return devfile.commands;
		}
		return [];
	}

	/**
	 * Normalizes the command line by joining multiple commands with '&&' and sanitizing each command.
	 * @param cmd The command line to normalize, which can be a string or an array of strings.
	 * @returns A normalized command line string where multiple commands are joined with '&&', and each command is sanitized.
	 */
	private normalizeExecCommandLine(cmd: string | string[]): string {
		const parts = Array.isArray(cmd) ? cmd : [cmd];

		return parts
			.map((s) => this.sanitizeCommand(String(s)))
			.filter(Boolean)
			.filter((s) => !this.isOperatorOnlyFragment(s))
			.join(" && ");
	}

	/**
	 * Creates a VS Code task for a Devfile exec command (Version-1).
	 * @param command The Devfile command to create a task for.
	 * @returns The created VS Code task.
	 */
	private createExecTaskV1(command: any): vscode.Task {
		const label = this.getLabel(command);

		const kind: DevfileTaskDefinition = {
			type: "devfile",
			command: command.exec.commandLine,
			workdir: command.exec.workingDir || "${PROJECT_SOURCE}",
			component: command.exec.component,
		};

		const execution = new vscode.CustomExecution(
			async (): Promise<vscode.Pseudoterminal> => {
				const initialVariables = this.buildEnvPrefix(command.exec.env);

				const normalizedCmd = this.normalizeExecCommandLine(
					command.exec.commandLine,
				);

				const finalCmd = this.sanitizeCommand(initialVariables + normalizedCmd);

				return this.terminalExtAPI.getMachineExecPTY(
					command.exec.component,
					finalCmd,
					this.expandEnvVariables(kind.workdir!),
				);
			},
		);

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
	 * Handles a composite command by creating a VS Code task for it.
	 * @param command The composite command to handle.
	 * @param all The list of all Devfile commands.
	 * @returns The created VS Code task, or undefined if the command is invalid.
	 */
	private handleCompositeCommand(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
	): vscode.Task | undefined {
		const label = this.getLabel(command);

		if (!this.validateComposite(command, all)) {
			this.channel.appendLine(`Skipping composite ${label}: invalid graph`);
			return undefined;
		}

		const execs = this.flattenCompositeExecs(command, all);
		if (!execs.length) {
			return this.createEchoTask(`Composite ${label} resolved empty`, label);
		}

		const parallel = !!command.composite.parallel;

		const components = new Set(execs.map((e) => e.component ?? "__default__"));

		if (components.size === 1) {
			const joiner = parallel ? " & " : " && ";

			let script = execs
				.map((e) =>
					this.sanitizeCommand(this.buildEnvPrefix(e.env) + e.commandLine),
				)
				.join(joiner);

			script = this.sanitizeCommand(script);
			if (parallel) script += " ; wait";

			const primary = execs[0];

			const kind: DevfileTaskDefinition = {
				type: "devfile",
				command: script,
				workdir: primary.workingDir,
				component: primary.component,
			};

			return new vscode.Task(
				kind,
				vscode.TaskScope.Workspace,
				label,
				"devfile",
				this.createPTY(primary.component, script, primary.workingDir),
				[],
			);
		}

		const execution = new vscode.CustomExecution(async () => {
			const writeEmitter = new vscode.EventEmitter<string>();
			const closeEmitter = new vscode.EventEmitter<number>();

			let started = false;

			const aggregator: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				onDidClose: closeEmitter.event,

				open: async () => {
					if (started) return;
					started = true;

					const runExec = async (e: ResolvedExec) => {
						const cmd = this.sanitizeCommand(
							this.buildEnvPrefix(e.env) + e.commandLine,
						);

						this.channel.appendLine(
							`[composite:${label}] → ${e.component ?? "default"} → ${cmd}`,
						);

						const pty = await this.terminalExtAPI.getMachineExecPTY(
							e.component,
							cmd,
							this.expandEnvVariables(e.workingDir),
						);

						pty.onDidWrite?.((data: string) => {
							writeEmitter.fire(data);
						});

						pty.open?.();
					};

					try {
						if (parallel) {
							await Promise.all(execs.map(runExec));
						} else {
							for (const e of execs) {
								await runExec(e);
							}
						}

						closeEmitter.fire(0);
					} catch (err) {
						this.channel.appendLine(
							`Composite ${label} failed: ${String(err)}`,
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

		const kind: DevfileTaskDefinition = {
			type: "devfile",
			command: "[composite]",
			workdir: first.workingDir,
			component: first.component,
		};

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
	 * Validates a composite command by checking for cycles and ensuring all references are resolvable.
	 * @param command The composite command to validate.
	 * @param all The list of all Devfile commands.
	 * @param visited A set of visited command IDs to detect cycles.
	 * @returns True if the composite command is valid (no cycles, all references resolvable), false otherwise.
	 */
	private validateComposite(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
		visited = new Set<string>(),
	): boolean {
		if (!command.composite?.commands) return true;

		if (command.id) {
			if (visited.has(command.id)) return false;
			visited.add(command.id);
		}

		for (const ref of command.composite.commands) {
			const sub = typeof ref === "string" ? all.find((c) => c.id === ref) : ref;

			if (!sub) return false;
			if (!this.validateComposite(sub, all, visited)) return false;
		}

		if (command.id) visited.delete(command.id);
		return true;
	}

	/**
	 * Flattens a composite command into its individual executable commands.
	 * @param command The composite command to flatten.
	 * @param all The list of all Devfile commands.
	 * @param visited A set of visited command IDs to avoid processing the same command multiple times.
	 * @returns An array of resolved executable commands.
	 */
	private flattenCompositeExecs(
		command: any,
		all: V1alpha2DevWorkspaceSpecTemplateCommands[],
		visited = new Set<string>(),
	): ResolvedExec[] {
		const result: ResolvedExec[] = [];

		const walk = (cmd: any) => {
			if (!cmd || visited.has(cmd.id)) return;
			if (cmd.id) visited.add(cmd.id);

			if (cmd.exec?.commandLine) {
				result.push({
					commandLine: cmd.exec.commandLine.toString(),
					workingDir: cmd.exec.workingDir || "${PROJECT_SOURCE}",
					component: cmd.exec.component,
					env: cmd.exec.env,
				});
			}

			for (const ref of cmd.composite?.commands ?? []) {
				const sub =
					typeof ref === "string" ? all.find((c) => c.id === ref) : ref;
				if (sub) walk(sub);
			}
		};

		walk(command);
		return result;
	}

	/**
	 * Retrieves the label for a given command, prioritizing exec label, then composite label,
	 * and finally falling back to the command ID.
	 * @param cmd The command object to retrieve the label from.
	 * @returns The label for the command, based on the defined priority.
	 */
	private getLabel(cmd: any): string {
		// che#23726 — label priority
		return cmd.exec?.label || cmd.composite?.label || cmd.id;
	}

	/**
	 * Sanitizes a command string by removing trailing shell operators and trimming whitespace.
	 * @param cmd The command string to sanitize by removing trailing shell operators and trimming whitespace.
	 * @returns The sanitized command string.
	 */
	private sanitizeCommand(cmd: string): string {
		return cmd.replace(/(?:\s*(?:&&|\|\||[|;&]))+\s*$/, "").trim();
	}

	/**
	 * Checks if a command fragment consists solely of shell operators (&&, ||, &, ;, |) and whitespace.
	 * @param fragment The command fragment to check.
	 * @returns True if the fragment is operator-only, false otherwise.
	 */
	private isOperatorOnlyFragment(fragment: string): boolean {
		return /^(?:&&|\|\||[&;|])+$/.test(fragment.trim());
	}

	/**
	 * Validates if an environment variable entry is valid by checking if it has a non-empty name that matches the allowed pattern.
	 * @param entry The environment variable entry to validate, which should have a 'name' property and an optional 'value' property.
	 * @returns True if the environment variable entry is valid, false otherwise.
	 */
	private isValidEnvEntry(
		entry: any,
	): entry is { name: string; value?: string } {
		return (
			typeof entry?.name === "string" &&
			entry.name.trim().length > 0 &&
			/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name)
		);
	}

	/**
	 * Builds a prefix string for environment variable exports based on the provided environment variable definitions.
	 * @param env The array of environment variable definitions.
	 * @returns The prefix string for environment variable exports.
	 */
	private buildEnvPrefix(
		env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>,
	): string {
		if (!env?.length) return "";
		return env
			.filter((e) => this.isValidEnvEntry(e))
			.map(
				(e) => `export ${e.name}="${(e.value ?? "").replace(/"/g, '\\"')}"; `,
			)
			.join("");
	}

	/**
	 * Expands environment variable placeholders in the input string.
	 * @param line The input string that may contain environment variable placeholders in the format ${VAR_NAME}.
	 * @returns The input string with environment variable placeholders replaced by their values.
	 */
	private expandEnvVariables(line: string): string {
		return line.replace(/\${([A-Za-z0-9_]+)}/g, (_, k) => process.env[k] ?? "");
	}

	/**
	 * Creates a pseudo-terminal (PTY) for the specified command.
	 * @param component The component to execute the command in.
	 * @param cmd The command to execute.
	 * @param wd The working directory for the command.
	 * @returns A CustomExecution instance for the PTY.
	 */
	private createPTY(component: string | undefined, cmd: string, wd: string) {
		return new vscode.CustomExecution(async () =>
			this.terminalExtAPI.getMachineExecPTY(
				component,
				cmd,
				this.expandEnvVariables(wd),
			),
		);
	}

	/**
	 * Creates a simple echo task that outputs a message to the terminal,
	 * used for cases where a composite command resolves to an empty set of executable commands.
	 * @param message The message to output.
	 * @param label The label for the task.
	 * @returns A vscode.Task instance for the echo task.
	 */
	private createEchoTask(message: string, label: string): vscode.Task {
		return new vscode.Task(
			{ type: "devfile", command: "echo", workdir: "${PROJECT_SOURCE}" },
			vscode.TaskScope.Workspace,
			label,
			"devfile",
			this.createPTY(undefined, `echo "${message}"`, "${PROJECT_SOURCE}"),
			[],
		);
	}

	/**
	 * Checks if a command is runnable.
	 * @param cmd The command to check.
	 * @returns True if the command is runnable, false otherwise.
	 */
	private isRunnable(cmd: any): boolean {
		return !!cmd.exec?.commandLine || cmd.composite?.commands?.length;
	}

	/**
	 * Checks if a command is a root command, meaning it is not imported from another Devfile or is imported with "parent" scope.
	 * @param cmd The command to check.
	 * @returns True if the command is a root command, false otherwise.
	 */
	private isRootCommand(cmd: any): boolean {
		const importedBy = (cmd.attributes as any)?.[
			"controller.devfile.io/imported-by"
		];
		return (
			!cmd.attributes || importedBy === undefined || importedBy === "parent"
		);
	}
}
