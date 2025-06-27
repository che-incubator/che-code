/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { INotificationService, ProgressLocation } from '../../../platform/notification/common/notificationService';
import { IReviewService } from '../../../platform/review/common/reviewService';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../vscodeTypes';
import { ReviewerComments, ReviewerCommentsProvider } from '../../githubPullRequest';
import { doReview } from './doReview';

export class GitHubPullRequestReviewerCommentsProvider implements ReviewerCommentsProvider {
	constructor(
		@IScopeSelector private readonly scopeSelector: IScopeSelector,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IReviewService private readonly reviewService: IReviewService,
		@IAuthenticationService private readonly authService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@IGitExtensionService private readonly gitExtensionService: IGitExtensionService,
		@IDomainService private readonly domainService: IDomainService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@IEnvService private readonly envService: IEnvService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IInteractionService private readonly interactionService: IInteractionService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async provideReviewerComments(context: { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] }, token: CancellationToken): Promise<ReviewerComments> {
		this.interactionService.startInteraction();
		const reviewResult = await doReview(
			this.scopeSelector,
			this.instantiationService,
			this.reviewService,
			this.authService,
			this.logService,
			this.gitExtensionService,
			this.capiClientService,
			this.domainService,
			this.fetcherService,
			this.envService,
			this.ignoreService,
			this.tabsAndEditorsService,
			this.workspaceService,
			this.commandService,
			this.notificationService,
			context,
			ProgressLocation.Notification,
			token
		);
		const files: Uri[] = [];
		if (reviewResult?.type === 'success') {
			for (const comment of reviewResult.comments) {
				files.push(comment.uri);
			}
		}
		const succeeded = reviewResult?.type === 'success';
		return { files, succeeded };
	}

}