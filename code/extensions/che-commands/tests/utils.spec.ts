/* eslint-disable header/header */
/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { resolveEnvVariablesForCommand } from '../src/utils';

const USER_NAME = 'UserName';
const testVariables = [
	{ name: 'USER', value: USER_NAME },
	{ name: 'PROJECT_DIR', value: '/projects' }
];

describe('Resolving Env variables for command line', () => {
	test('should return the original command if there are no env variables in the command line', () => {
		const testCommand = 'cd /projects && echo "the command line has no env variables"';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe(testCommand);
	});

	test('should return the original command if envVariables parameter is undefined', () => {
		const testCommand = 'echo "${USER}"';
		const result = resolveEnvVariablesForCommand(testCommand);

		expect(result).toBe(testCommand);
	});

	test('should return the original command if envVariables parameter is empty array', () => {
		const testCommand = 'echo "${USER}"';
		const result = resolveEnvVariablesForCommand(testCommand, []);

		expect(result).toBe(testCommand);
	});

	test('should return the original command if the corresponding Env Variable is not found', () => {
		const testCommand = 'echo "${UNKNOWN_VAR}"';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe(testCommand);
	});

	test('should check ${USER} format', () => {
		const testCommand = 'echo "${USER}"';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe(`echo "${USER_NAME}"`);
	});

	test('should check $USER format', () => {
		const testCommand = 'echo "$USER"';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe(`echo "${USER_NAME}"`);
	});

	test('should check mixed format', () => {
		const testCommand = 'cd $PROJECT_DIR && echo "${USER}" && echo $USER';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe(`cd /projects && echo "${USER_NAME}" && echo ${USER_NAME}`);
	});

	test('should check mixed format with unknown variable', () => {
		const testCommand = 'cd $PROJECT_DIR && echo "${USER}" && echo ${UNKNOWN_VAR} && echo $USER && echo $ANOTHER_UNKNOWN_VAR';
		const result = resolveEnvVariablesForCommand(testCommand, testVariables);

		expect(result).toBe('cd /projects && echo "UserName" && echo ${UNKNOWN_VAR} && echo UserName && echo $ANOTHER_UNKNOWN_VAR');
	});
});
