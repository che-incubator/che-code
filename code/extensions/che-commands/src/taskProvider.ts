/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { V1alpha2DevWorkspaceSpecTemplate, V1alpha2DevWorkspaceSpecTemplateCommands } from '@devfile/api';
import * as vscode from 'vscode';

interface CheTaskDefinition extends vscode.TaskDefinition {
	command: string;
	workdir?: string;
}

export class CheTaskProvider implements vscode.TaskProvider {

	constructor(private channel: vscode.OutputChannel) { }

	provideTasks(): vscode.ProviderResult<vscode.Task[]> {
		return this.computeTasks();
	}

	resolveTask(task: vscode.Task): vscode.ProviderResult<vscode.Task> {
		return task;
	}

	private async computeTasks(): Promise<vscode.Task[]> {
		const devfileCommands = await this.fetchDevfileCommands();

		const cheTasks: vscode.Task[] = devfileCommands!
			.filter(command => command.exec?.commandLine)
			.map(command => this.createCheTask(command.id, command.exec?.commandLine!, command.exec?.workingDir!));
		return cheTasks;
	}

	private async fetchDevfileCommands(): Promise<V1alpha2DevWorkspaceSpecTemplateCommands[]> {
		const che_api = vscode.extensions.getExtension('eclipse-che.api');
		if (!che_api) {
			this.channel.appendLine('eclipse-che.api extension is not found.');
			return [];
		}

		const devfileService = che_api.exports.getDevfileService();
		const devfile: V1alpha2DevWorkspaceSpecTemplate = await devfileService.get();
		if (devfile.commands && devfile.commands.length) {
			this.channel.appendLine(`Detected ${devfile.commands.length} Command(s) in the flattened Devfile.`);
			return devfile.commands;
		}
		return [];
	}

	private createCheTask(name: string, command: string, workdir: string): vscode.Task {
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

		const kind: CheTaskDefinition = {
			type: 'che',
			command,
			workdir
		};

		const execution = new vscode.ShellExecution(command, { cwd: expandEnvVariables(workdir) });
		const task = new vscode.Task(kind, vscode.TaskScope.Workspace, name, 'eclipse-che.commands', execution, undefined);
		return task;
	}
}
