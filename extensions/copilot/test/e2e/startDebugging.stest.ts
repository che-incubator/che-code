/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { extractCodeBlocks } from '../../src/util/common/markdown';
import { ssuite, stest } from '../base/stest';
import { discoverScenarios } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

const scenarioFolder = path.join(__dirname, '..', 'test/scenarios/test-startDebugging');
ssuite({ title: 'startDebugging', location: 'panel' }, async (inputPath) => {
	const scenarios = discoverScenarios(scenarioFolder);
	for (const scenario of scenarios) {
		const fileName = scenario[0].name;
		const testName = inputPath ? fileName.substring(0, fileName.indexOf('.')) : scenario[0].question.replace('@vscode /startDebugging', '');
		stest({ description: testName }, generateScenarioTestRunner(
			scenario,
			async (accessor, question, answer, rawResponse, turn, scenarioIndex, commands) => {
				if (scenario[0].json.matchAnyConfigOf !== undefined) {
					try {
						const code = extractCodeBlocks(answer)[0]?.code || answer;
						const parsed = JSON.parse(code);
						for (const config of scenario[0].json.matchAnyConfigOf) {
							if (isSubsetOf(config, parsed.configurations[0])) {
								return { success: true, errorMessage: answer };
							}
						}
						return { success: false, errorMessage: 'Expected a subset of the config' };
					} catch {
						return { success: false, errorMessage: 'Did not parsed as JSON' };
					}
				}
				return { success: false, errorMessage: 'No requirements set for test.' };
			}
		));
	}
});

function isSubsetOf(subset: any, superset: any) {
	if (typeof subset !== typeof superset) {
		return false;
	}
	if (typeof subset === 'object') {
		for (const key in subset) {
			if (!isSubsetOf(subset[key], superset[key])) {
				return false;
			}
		}
		return true;
	}
	return subset === superset;
}
