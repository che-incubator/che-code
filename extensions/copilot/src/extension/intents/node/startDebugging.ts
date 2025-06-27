/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { isPreRelease } from '../../../platform/env/common/packagejson';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { parseLaunchConfigFromResponse } from '../../onboardDebug/node/parseLaunchConfigFromResponse';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { StartDebuggingPrompt, StartDebuggingType } from '../../prompts/node/panel/startDebugging';


export const startDebuggingIntentPromptSnippet = 'Attach to node app at port 5870 with outFiles';

export class StartDebuggingIntent implements IIntent {
	static readonly ID = Intent.StartDebugging;
	readonly id = StartDebuggingIntent.ID;
	readonly locations = [ChatLocation.Panel];
	readonly description = l10n.t('Start Debugging');

	// todo@meganrogge: remove this when it's ready to use.
	readonly isListedCapability = false;

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: true,
		defaultEnablement: isPreRelease,
	};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsService private readonly extensionsService: IExtensionsService
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		return {
			intent: this,
			location,
			endpoint,
			processResponse: async (context, responseStream, progress, token): Promise<void> => {
				let response = '';
				progress.progress(l10n.t('Solving for launch configuration...'));
				for await (const { delta } of responseStream) {
					if (token.isCancellationRequested) {
						return;
					}
					response += delta.text;
				}


				const config = parseLaunchConfigFromResponse(response, this.extensionsService);
				if (!config) {
					progress.markdown(response);
					return;
				}
				const hasConfigNoQuery = response.match('HAS_CONFIG_NO_QUERY');
				const hasMatch = response.match('HAS_MATCH');
				const generatedConfig = response.match('GENERATED_CONFIG');

				response = response.replaceAll(/"type": "python",/g, '"type": "debugpy",');
				response = response.replace(/HAS_CONFIG_NO_QUERY/g, '');
				response = response.replace(/HAS_MATCH/g, '');
				response = response.replace(/GENERATED_CONFIG/g, '');

				progress.markdown(response);

				if (hasConfigNoQuery) {
					progress.markdown('\n' + l10n.t('Generate a new launch configuration by providing more specifics in your query.') + '\n');
					progress.button({
						title: l10n.t('Select and Start Debugging'),
						command: 'workbench.action.debug.selectandstart'
					});
				} else if (hasMatch) {
					progress.markdown('\n' + l10n.t('Generate a new launch configuration by providing more specifics in your query.') + '\n');
					progress.button({
						title: l10n.t('Start Debugging Existing'),
						command: 'github.copilot.startDebugging',
						arguments: [config, progress]
					});
				} else if (generatedConfig) {
					const hasTask = config.tasks?.length;
					progress.button({
						title: hasTask ? l10n.t('Run Task and Start Debugging') : l10n.t('Start Debugging'),
						command: 'github.copilot.startDebugging',
						arguments: [config, progress]
					});
					progress.button({
						title: hasTask ? l10n.t('Save Task and Configuration') : l10n.t('Save Configuration'),
						command: 'github.copilot.createLaunchJsonFileWithContents',
						arguments: [config]
					});
				}
				progress.markdown('\n' + l10n.t('Debugging can be started in the [Debug View]({0}) or by using the [Start Debugging Command]({1}).', 'command:workbench.view.debug', 'command:workbench.action.debug.run'));
			},
			buildPrompt: async (context: IBuildPromptContext, progress, token) => {
				const renderer = PromptRenderer.create(this.instantiationService, endpoint, StartDebuggingPrompt, {
					input: { type: StartDebuggingType.UserQuery, userQuery: context.query },
					history: context.history
				});

				const result = await renderer.render(progress, token);
				return result;
			}
		};
	}
}
