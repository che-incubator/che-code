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
} from '@devfile/api';
import * as vscode from 'vscode';

interface DevfileTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
	component?: string;
}

type ResolvedExec = {
	commandLine: string;
	workingDir: string;
	component?: string;
	env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>;
};

export class DevfileTaskProvider implements vscode.TaskProvider {
	constructor(
		private channel: vscode.OutputChannel,
		private cheAPI: any,
		private terminalExtAPI: any
	) { }

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
					'controller.devfile.io/imported-by'
				];
				return (
					!command.attributes ||
					importedByAttribute === undefined ||
					importedByAttribute === 'parent'
				);
			})
			.filter((command) => !/^init-ssh-agent-command-\d+$/.test(command.id))
			.map((command) => {
				return this.createCheTask(command, devfileCommands);
			})
			.filter((createdTask): createdTask is vscode.Task => !!createdTask);
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

	private expandEnvVariables(line: string | undefined): string {
		if (!line) return '';
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

	private normalizeExec(execBlock: any): ResolvedExec | null {
		if (!execBlock) return null;
		const rawCommandLine = execBlock.commandLine;
		if (rawCommandLine === undefined || rawCommandLine === null) return null;

		let lines: string[] = [];

		if (Array.isArray(rawCommandLine)) {
			lines = rawCommandLine.map((v) => (v ?? '').toString());
		} else {
			lines = rawCommandLine.toString().split(/\r?\n/);
		}

		lines = lines
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
			.map((l) => l.replace(/(?:\s*&&\s*)+$/, '').trim()); // remove trailing &&

		if (lines.length === 0) return null;

		const commandLine = lines.join(' && ');

		const workingDir = (execBlock.workingDir ?? '${PROJECT_SOURCE}').toString();
		const component = execBlock.component ? execBlock.component.toString() : undefined;
		const env = Array.isArray(execBlock.env) ? execBlock.env : undefined;

		return { commandLine, workingDir, component, env };
	}

	private buildInitialVariables(
		env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>
	): string {
		if (!env || !Array.isArray(env) || env.length === 0) return '';
		let initial = '';
		for (const e of env) {
			if (!e || !e.name) continue;
			const rawVal = (e.value ?? '').toString();
			const escaped = rawVal.replace(/"/g, '\\"');
			initial += `export ${e.name}="${escaped}"; `;
		}
		return initial;
	}

	private createMessageTask(message: string, label: string): vscode.Task {
		const kind: DevfileTaskDefinition = {
			type: 'devfile',
			command: '',
			workdir: '${PROJECT_SOURCE}',
		};

		const escapedMessage = message.replace(/"/g, '\\"');

		const execution = new vscode.CustomExecution(
			async (): Promise<vscode.Pseudoterminal> => {
				const resolvedWorkdir = this.expandEnvVariables('${PROJECT_SOURCE}');
				return this.terminalExtAPI.getMachineExecPTY(
					undefined,
					`echo "${escapedMessage}"`,
					resolvedWorkdir
				);
			}
		);

		return new vscode.Task(
			kind,
			vscode.TaskScope.Workspace,
			label,
			'devfile',
			execution,
			[]
		);
	}

	private validateCompositeStrict(
		command: any,
		allCommands: V1alpha2DevWorkspaceSpecTemplateCommands[],
		visited: Set<string> = new Set()
	): boolean {
		if (
			!command ||
			!command.composite ||
			!Array.isArray(command.composite.commands)
		) {
			return true;
		}

		const id: string | undefined = command.id;
		if (id) {
			if (visited.has(id)) {
				this.channel.appendLine(
					`Skipping composite ${id} because of cyclic reference in composite commands`
				);
				return false;
			}
			visited.add(id);
		}

		for (const entry of command.composite.commands) {
			if (!entry) continue;

			if (typeof entry === 'string') {
				const sub = allCommands.find((c) => c && c.id === entry);
				if (!sub) {
					this.channel.appendLine(
						`Composite ${id ?? '<inline>'} references missing command id '${entry}'`
					);
					return false;
				}

				if (
					sub.composite &&
					Array.isArray(sub.composite.commands) &&
					!this.validateCompositeStrict(sub, allCommands, visited)
				) {
					return false;
				}
			} else if (
				typeof entry === 'object' &&
				entry.composite &&
				Array.isArray(entry.composite.commands)
			) {
				// Inline nested composite
				if (!this.validateCompositeStrict(entry, allCommands, visited)) {
					return false;
				}
			}
		}

		if (id) {
			visited.delete(id);
		}
		return true;
	}

	private resolveExecsFromComposite(
		command: any,
		allCommands: V1alpha2DevWorkspaceSpecTemplateCommands[]
	): ResolvedExec[] {
		const results: ResolvedExec[] = [];
		if (
			!command ||
			!command.composite ||
			!Array.isArray(command.composite.commands)
		) {
			return results;
		}

		const walk = (cmd: any) => {
			if (!cmd) return;

			if (cmd.exec) {
				const norm = this.normalizeExec(cmd.exec);
				if (norm) {
					results.push(norm);
				}
			}

			if (cmd.composite && Array.isArray(cmd.composite.commands)) {
				for (const entry of cmd.composite.commands) {
					if (!entry) continue;
					let sub: any | undefined;

					if (typeof entry === 'string') {
						sub = allCommands.find((c) => c && c.id === entry);
					} else if (typeof entry === 'object') {
						sub = entry;
					}

					if (sub) {
						walk(sub);
					}
				}
			}
		};

		walk(command);
		return results;
	}

	private createCheTask(
		command: any,
		allCommands: V1alpha2DevWorkspaceSpecTemplateCommands[]
	): vscode.Task | undefined {
		try {
			// EXEC command
			if (command && command.exec) {
				const execInfo = this.normalizeExec(command.exec);
				if (execInfo) {
					const initialVariables = this.buildInitialVariables(command.exec.env);
					const cmd = execInfo.commandLine;
					const kind: DevfileTaskDefinition = {
						type: 'devfile',
						command: cmd,
						workdir: execInfo.workingDir,
						component: execInfo.component,
					};

					const execution = new vscode.CustomExecution(
						async (): Promise<vscode.Pseudoterminal> => {
							const resolvedWorkdir = this.expandEnvVariables(execInfo.workingDir);
							return this.terminalExtAPI.getMachineExecPTY(
								execInfo.component,
								initialVariables + cmd,
								resolvedWorkdir
							);
						}
					);
					const label =
						(command.exec && command.exec.label) || command.id;
					return new vscode.Task(
						kind,
						vscode.TaskScope.Workspace,
						label,
						'devfile',
						execution,
						[]
					);
				}
			}

			// Composite command support
			if (
				command &&
				command.composite &&
				Array.isArray(command.composite.commands) &&
				command.composite.commands.length > 0
			) {
				if (!this.validateCompositeStrict(command, allCommands)) {
					this.channel.appendLine(
						`Skipping composite ${command.id} because it references missing commands (possibly nested).`
					);
					return undefined;
				}

				const resolvedExecs = this.resolveExecsFromComposite(command, allCommands);

				if (resolvedExecs.length === 0) {
					return this.createMessageTask(
						`Composite ${command.id} resolved to empty commands`,
						command.id
					);
				}

				const parallel = !!(
					command.composite && command.composite.parallel
				);
				const joiner = parallel ? ' & ' : ' && ';

				const partsInfo: Array<{
					envPrefix: string;
					wd: string;
					cmdLine: string;
				}> = [];
				for (const e of resolvedExecs) {
					if (!e || !e.commandLine || !e.commandLine.trim()) continue;
					const envPrefix = this.buildInitialVariables(e.env);
					let cmdLine = (e.commandLine ?? '').toString().trim();
					cmdLine = cmdLine.replace(/(?:\s*&&\s*)+$/, '').trim();
					const wd = e.workingDir ?? '${PROJECT_SOURCE}';
					partsInfo.push({ envPrefix, wd, cmdLine });
				}

				if (partsInfo.length === 0) {
					return this.createMessageTask(
						`Composite ${command.id} resolved to empty commands`,
						command.id
					);
				}

				const sameWorkdir = partsInfo.every(
					(p) => p.wd === partsInfo[0].wd
				);
				const anyEnv = partsInfo.some(
					(p) => p.envPrefix && p.envPrefix.trim() !== ''
				);

				let compositeCommandLine: string;
				if (!anyEnv && sameWorkdir) {
					compositeCommandLine = partsInfo
						.map((p) =>
							p.cmdLine.replace(/(?:\s*&&\s*)+$/, '').trim()
						)
						.filter(Boolean)
						.join(joiner);
				} else {
					const parts: string[] = partsInfo.map((p) => {
  					const resolved = this.expandEnvVariables(p.wd);
  					let cdExpr: string;
  					if (/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(resolved)) {
					// If there are still unexpanded variables, use double quotes to allow shell expansion
    					cdExpr = `cd ${p.wd}`;
  					} else {
    					// escape any single quotes in the resolved path for safe single-quoting
    					const safe = resolved.replace(/'/g, `'\"'\"'`);
    					cdExpr = `cd '${safe}'`;
  					}
  					const envPrefix = p.envPrefix ?? '';
  					const cmd = p.cmdLine;
  					return `(${envPrefix}${cdExpr} && ${cmd})`;
				});
					compositeCommandLine = parts.join(joiner);
				}
				
				if (parallel) {
  					// Append `; wait` so the shell waits for background jobs to finish
  					compositeCommandLine = `${compositeCommandLine} ; wait`;
				}

				const primary = resolvedExecs[0];
				const kindWorkdir = primary.workingDir ?? '${PROJECT_SOURCE}';
				const targetComponent = primary.component;

				const kind: DevfileTaskDefinition = {
					type: 'devfile',
					command: compositeCommandLine,
					workdir: kindWorkdir,
					component: targetComponent,
				};

				const execution = new vscode.CustomExecution(
					async (): Promise<vscode.Pseudoterminal> => {
						const resolvedWorkdir = this.expandEnvVariables(kindWorkdir);
						return this.terminalExtAPI.getMachineExecPTY(
							targetComponent,
							compositeCommandLine,
							resolvedWorkdir
						);
					}
				);

				const label =
					(command.composite && command.composite.label) ||
					command.id ||
					'composite-task';

				this.channel.appendLine(
					`createCheTask (composite) for ${command.id}: label='${label}', compositePreview='${String(
						compositeCommandLine
					).slice(0, 1000)}', workdir='${kindWorkdir}'`
				);

				return new vscode.Task(
					kind,
					vscode.TaskScope.Workspace,
					label,
					'devfile',
					execution,
					[]
				);
			}

			// Fallback for unsupported command types
			return this.createMessageTask(
				`Unsupported command type for ${command?.id ?? '<unknown>'}`,
				command?.id ?? 'unsupported'
			);
		} catch (err: any) {
			this.channel.appendLine(
				`Error creating task for command ${command?.id ?? '<unknown>'
				}: ${err?.message ?? String(err)}`
			);
			return undefined;
		}
	}
}
