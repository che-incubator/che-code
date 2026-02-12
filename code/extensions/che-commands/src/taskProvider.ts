/**********************************************************************
 * Copyright (c) 2022-2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { V1alpha2DevWorkspaceSpecTemplate, V1alpha2DevWorkspaceSpecTemplateCommands, V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv } from '@devfile/api';
import * as vscode from 'vscode';
import { CompositeTaskBuilder } from './compositeTaskBuilder';

interface DevfileTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
	component?: string;
}

export class DevfileTaskProvider implements vscode.TaskProvider {

	constructor(private channel: vscode.OutputChannel, private cheAPI: any, private terminalExtAPI: any) {
	}

	provideTasks(): vscode.ProviderResult<vscode.Task[]> {
		return this.computeTasks();
	}

	resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
		return task;
	}

	private async computeTasks(): Promise<vscode.Task[]> {
		const devfileCommands = await this.fetchDevfileCommands();

		const compositeBuilder = new CompositeTaskBuilder(
			this.channel,
			this.terminalExtAPI,
		);

		const cheTasks: vscode.Task[] = devfileCommands!
			.filter(command => {
				const importedByAttribute = (command.attributes as any)?.['controller.devfile.io/imported-by'];
				return !command.attributes || importedByAttribute === undefined || importedByAttribute === 'parent';
			})
			.filter(command => !/^init-ssh-agent-command-\d+$/.test(command.id))
			.map((command) => {
				if (command.composite?.commands?.length) {
					return compositeBuilder.build(command, devfileCommands);
				}

				if (command.exec?.commandLine) {
					return this.createCheTask(command.exec?.label || command.id, command.exec?.commandLine!, command.exec?.workingDir || '${PROJECT_SOURCE}', command.exec?.component!, command.exec?.env)
				}

				return undefined;
			})
			.filter((t): t is vscode.Task => !!t);

		return cheTasks;
	}

	private async fetchDevfileCommands(): Promise<V1alpha2DevWorkspaceSpecTemplateCommands[]> {
		const devfileService = this.cheAPI.getDevfileService();
		const devfile: V1alpha2DevWorkspaceSpecTemplate = await devfileService.get();
		if (devfile.commands && devfile.commands.length) {
			this.channel.appendLine(`Detected ${devfile.commands.length} Command(s) in the flattened Devfile.`);
			return devfile.commands;
		}
		return [];
	}

	private createCheTask(name: string, command: string, workdir: string, component: string, env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>): vscode.Task {
		function expandEnvVariables(line: string): string {
			const regex = /\${[a-zA-Z_][a-zA-Z0-9_]*}/g;
			const envArray = line.match(regex);
			if (envArray && envArray.length) {
				for (const envName of envArray) {
					const envValue = process.env[envName.slice(2, -1)];
					if (envValue) {
						line = line.replace(envName, envValue);
					}
				}
			}
			return line;
		}

		const kind: DevfileTaskDefinition = {
			type: 'devfile',
			command,
			workdir,
			component
		};

		const execution = new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
			let initialVariables = '';
			if (env) {
				for (const e of env) {
					let value = e.value.replace(/"/g, '\\"');
					initialVariables += `export ${e.name}="${value}"; `;
				}
			}

			return this.terminalExtAPI.getMachineExecPTY(component, initialVariables + command, expandEnvVariables(workdir));
		});
		const task = new vscode.Task(kind, vscode.TaskScope.Workspace, name, 'devfile', execution, []);
		return task;
	}
}
