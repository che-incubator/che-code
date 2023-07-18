/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv } from "@devfile/api";

/*
 * This function is used to resolve env variables in command line.
 * It should support both syntaxes: ${VAR} and $VAR
 * The function returns the original command line if:
 * - envVariables is undefined or empty
 * - there are no env variables in the command line
 * - there are env variables in the command line but they are not defined in the envVariables array
 */
export function resolveEnvVariablesForCommand(commandLine: string, envVariables?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>): string {
	if (!envVariables || envVariables.length === 0) {
		return commandLine;
	}

	// it should support both syntaxes: ${VAR} and $VAR
	const regex = /\$\{?([a-zA-Z_][a-zA-Z0-9_]*)\}?/g;;
	let match = regex.exec(commandLine);
	while (match) {
		const envVariableName = match[1];
		const envVariableValue = envVariables.find(env => env.name === envVariableName)?.value;
		if (envVariableValue) {
			commandLine = commandLine.replace(match[0], envVariableValue);
		}
		match = regex.exec(commandLine);
	}
	return commandLine;
}
