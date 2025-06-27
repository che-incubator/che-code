/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { IGitService } from '../../../../platform/git/common/gitService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { SpyingTelemetryService } from '../../../../platform/telemetry/node/spyingTelemetryService';
import { SimulationWorkspace } from '../../../../platform/test/node/simulationWorkspace';
import { TestingGitService } from '../../../../platform/test/node/simulationWorkspaceServices';
import { VisualizationTestRun } from '../../../inlineChat/node/rendererVisualization';
import { EditSourceTrackingImpl } from '../../common/editSourceTrackingImpl';
import { EditSourceTracker } from '../../common/editTracker';
import { IRecordingInformation } from '../../common/observableWorkspaceRecordingReplayer';
import { loadJSON, relativeFile } from './fileLoading';
import { runRecording } from './runRecording';

// TODO@hediet: add a recording that considers updated source information.
describe.skip('EditSourceTracker[visualizable]', () => {
	test('editSourceTrackerStatsTelemetry', { timeout: 50_000 }, async () => {
		const events = await runRecording(
			await loadJSON<IRecordingInformation>({
				filePath: relativeFile("recordings/EditSourceTracker.test1.recording.w.json"),
			}),
			async ctx => {
				const telem = ctx.testingServiceCollection.set(ITelemetryService, new SpyingTelemetryService());
				ctx.testingServiceCollection.set(IGitService, new TestingGitService(new SimulationWorkspace()));

				const impl = ctx.instantiationService.createInstance(EditSourceTrackingImpl, ctx.workspace, doc => true);
				await ctx.player.finishReplaySimulateTime();
				impl.dispose();

				return telem.getFilteredEvents({ "editSourceTracker.stats": true });
			}
		);

		function sumUpProperties<T extends object, TProps extends Partial<Record<keyof T, true>>>(items: T[], properties: TProps): Pick<T, keyof TProps & keyof T> {
			const result = {} as Pick<T, any>;
			for (const property of Object.keys(properties)) {
				result[property] = items.reduce((sum, item) => sum + (item[property as keyof T] as number), 0);
			}
			return result;
		}

		const data = {
			sums: sumUpProperties(events.map(e => e.measurements), {
				nesModifiedCount: true,
				inlineCompletionsCopilotModifiedCount: true,
				inlineCompletionsNESModifiedCount: true,
				otherAIModifiedCount: true,
				unknownModifiedCount: true,
				userModifiedCount: true,
				ideModifiedCount: true,
				totalModifiedCharacters: true,
				externalModifiedCount: true,
			}),
		};

		expect({ data, events }).toMatchInlineSnapshot(`
			{
			  "data": {
			    "sums": {
			      "externalModifiedCount": 0,
			      "ideModifiedCount": 0,
			      "inlineCompletionsCopilotModifiedCount": 0,
			      "inlineCompletionsNESModifiedCount": 0,
			      "nesModifiedCount": 0,
			      "otherAIModifiedCount": 0,
			      "totalModifiedCharacters": 15162,
			      "unknownModifiedCount": 15162,
			      "userModifiedCount": 0,
			    },
			  },
			  "events": [
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 24,
			        "unknownModifiedCount": 24,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 70,
			        "unknownModifiedCount": 70,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 401,
			        "unknownModifiedCount": 401,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 124,
			        "unknownModifiedCount": 124,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 10,
			        "unknownModifiedCount": 10,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 154,
			        "unknownModifiedCount": 154,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 14,
			        "unknownModifiedCount": 14,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 48,
			        "unknownModifiedCount": 48,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 0,
			        "unknownModifiedCount": 0,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 216,
			        "unknownModifiedCount": 216,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 126,
			        "unknownModifiedCount": 126,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 200,
			        "unknownModifiedCount": 200,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 234,
			        "unknownModifiedCount": 234,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 1390,
			        "unknownModifiedCount": 1390,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 2572,
			        "unknownModifiedCount": 2572,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 330,
			        "unknownModifiedCount": 330,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 326,
			        "unknownModifiedCount": 326,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 1121,
			        "unknownModifiedCount": 1121,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 186,
			        "unknownModifiedCount": 186,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 1130,
			        "unknownModifiedCount": 1130,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 74,
			        "unknownModifiedCount": 74,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 609,
			        "unknownModifiedCount": 609,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 570,
			        "unknownModifiedCount": 570,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 0,
			        "unknownModifiedCount": 0,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 195,
			        "unknownModifiedCount": 195,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 212,
			        "unknownModifiedCount": 212,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "plaintext",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 604,
			        "unknownModifiedCount": 604,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 14,
			        "unknownModifiedCount": 14,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 442,
			        "unknownModifiedCount": 442,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 0,
			        "unknownModifiedCount": 0,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 76,
			        "unknownModifiedCount": 76,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 166,
			        "unknownModifiedCount": 166,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 66,
			        "unknownModifiedCount": 66,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 560,
			        "unknownModifiedCount": 560,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 1482,
			        "unknownModifiedCount": 1482,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 678,
			        "unknownModifiedCount": 678,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 28,
			        "unknownModifiedCount": 28,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			    {
			      "eventName": "editSourceTracker.stats",
			      "eventType": "default",
			      "measurements": {
			        "externalModifiedCount": 0,
			        "ideModifiedCount": 0,
			        "inlineCompletionsCopilotModifiedCount": 0,
			        "inlineCompletionsNESModifiedCount": 0,
			        "isTrackedByGit": 0,
			        "nesModifiedCount": 0,
			        "otherAIModifiedCount": 0,
			        "totalModifiedCharacters": 710,
			        "unknownModifiedCount": 710,
			        "userModifiedCount": 0,
			      },
			      "properties": {
			        "languageId": "typescript",
			        "mode": "5minWindow",
			      },
			    },
			  ],
			}
		`);
	});

	test('test1', async () => {
		const result = await runRecording(
			await loadJSON<IRecordingInformation>({
				filePath: relativeFile("recordings/EditSourceTracker.test1.recording.w.json"),
			}),
			async ctx => {
				ctx.workspace.lastActiveDocument.recomputeInitiallyAndOnChange(ctx.store);

				const editTracker = ctx.instantiationService.createInstance(EditSourceTracker, ctx.workspace);
				ctx.finishReplay();

				const lastDoc = ctx.workspace.lastActiveDocument.get();
				if (!lastDoc) {
					return [];
				}
				if (VisualizationTestRun.instance) {
					const data = await editTracker._getDebugVisualization(lastDoc.id);
					VisualizationTestRun.instance!.addData('trackedEdits', () => {
						return data;
					});
				}

				return await editTracker.getTrackedRanges(lastDoc.id);
			}
		);

		expect(result.map(t => ({ range: t.range.toString(), source: t.source.toString() }))).toMatchInlineSnapshot(`[]`);
	});
});