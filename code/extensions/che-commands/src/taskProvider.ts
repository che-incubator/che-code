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
import { DevfileVariableResolver } from './devfileVariableResolver';
import { DevfileVariableContextBuilder } from './DevfileVariableContextBuilder';
import { EnvUtils } from './envUtils';

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
		const devfile: V1alpha2DevWorkspaceSpecTemplate = await this.cheAPI.getDevfileService().get();

		const devfileCommands = await this.fetchDevfileCommands(devfile);

		const resolver = new DevfileVariableResolver();

		const compositeBuilder = new CompositeTaskBuilder(
			this.channel,
			this.terminalExtAPI,
			devfile,
			resolver,
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

					const component =
						devfile.components?.find(
							(c: any) =>
								c.name === command.exec?.component,
						);

					const context =
						DevfileVariableContextBuilder.build(
							devfile,
							command,
							component,
						);

					const resolvedExec =
						resolver.resolveObject(
							command.exec,
							context,
						);

					return this.createCheTask(
						resolvedExec.label || command.id,
						resolvedExec.commandLine,
						resolvedExec.workingDir ??
							context.PROJECT_SOURCE ??
							'${PROJECT_SOURCE}',
						resolvedExec.component,
						resolvedExec.env,
					);
				}

				return undefined;
			})
			.filter((t): t is vscode.Task => !!t);

		return cheTasks;
	}

	private async fetchDevfileCommands(devfile: V1alpha2DevWorkspaceSpecTemplate): Promise<V1alpha2DevWorkspaceSpecTemplateCommands[]> {
		if (devfile.commands && devfile.commands.length) {
			this.channel.appendLine(`Detected ${devfile.commands.length} Command(s) in the flattened Devfile.`);
			return devfile.commands;
		}
		return [];
	}

	private createCheTask(
		name: string,
		command: string,
		workdir: string,
		component: string,
		env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>,
	): vscode.Task {

		const kind: DevfileTaskDefinition = {
			type: 'devfile',
			command,
			workdir,
			component
		};

		const execution =
			new vscode.CustomExecution(
				async (): Promise<vscode.Pseudoterminal> => {

					return this.terminalExtAPI.getMachineExecPTY(
						component,
						EnvUtils.buildExportStatements(env) + command,
						workdir,
					);
				},
			);

		return new vscode.Task(
			kind,
			vscode.TaskScope.Workspace,
			name,
			'devfile',
			execution,
			[],
		);
	}
}
