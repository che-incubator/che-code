/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolResult } from 'vscode';
import { AbstractRequestLogger, ILoggedRequestInfo, LoggedRequest } from '../../../platform/requestLogger/node/requestLogger';
import { Event } from '../../../util/vs/base/common/event';

export class NullRequestLogger extends AbstractRequestLogger {
	public override addPromptTrace(): void {
	}
	public addEntry(entry: LoggedRequest): void {
	}
	public override getRequests(): ILoggedRequestInfo[] {
		return [];
	}
	public override logToolCall(name: string | undefined, args: unknown, response: LanguageModelToolResult): void {
	}
	override onDidChangeRequests: Event<void> = Event.None;
}
