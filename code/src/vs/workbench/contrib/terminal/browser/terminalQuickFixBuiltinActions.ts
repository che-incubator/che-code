/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TerminalQuickFixMatchResult, ITerminalQuickFixOptions, ITerminalInstance, TerminalQuickFixAction } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
export const AnyCommandLineRegex = /.+/;
export const GitSimilarOutputRegex = /(?:(most similar (command|commands) (is|are)))((\n\s*[^\s]+)+)/m;
export const FreePortOutputRegex = /address already in use \d+\.\d+\.\d+\.\d+:(\d{4,5})|Unable to bind [^ ]*:(\d{4,5})|can't listen on port (\d{4,5})|listen EADDRINUSE [^ ]*:(\d{4,5})/;
export const GitPushOutputRegex = /git push --set-upstream origin ([^\s]+)/;
// The previous line starts with "Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s*"
// it's safe to assume it's a github pull request if the URL includes `/pull/`
export const GitCreatePrOutputRegex = /remote:\s*(https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;

export function gitSimilarCommand(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitSimilarOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 10
		},
		exitStatus: false,
		getQuickFixes: (matchResult: TerminalQuickFixMatchResult, command: ITerminalCommand) => {
			if (!matchResult?.outputMatch) {
				return;
			}
			// const fixedCommand = matchResult?.outputMatch?.[1];
			// if (!fixedCommand) {
			// 	return;
			// }
			const actions: TerminalQuickFixAction[] = [];
			const results = matchResult.outputMatch[0].split('\n').map(r => r.trim());
			for (let i = 1; i < results.length; i++) {
				const fixedCommand = results[i];
				if (fixedCommand) {
					actions.push({
						type: 'command',
						command: `git ${fixedCommand}`,
						addNewLine: true
					});
				}
			}
			return actions;
		}
	};
}
export function gitTwoDashes(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitTwoDashesRegex,
			anchor: 'bottom',
			offset: 0,
			length: 2
		},
		exitStatus: false,
		getQuickFixes: (matchResult: TerminalQuickFixMatchResult, command: ITerminalCommand) => {
			const problemArg = matchResult?.outputMatch?.[1];
			if (!problemArg) {
				return;
			}
			return {
				type: 'command',
				command: command.command.replace(` -${problemArg}`, ` --${problemArg}`),
				addNewLine: true
			};
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: AnyCommandLineRegex,
		outputMatcher: {
			lineMatcher: FreePortOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 30
		},
		exitStatus: false,
		getQuickFixes: (matchResult: TerminalQuickFixMatchResult, command: ITerminalCommand) => {
			const port = matchResult?.outputMatch?.[1];
			if (!port) {
				return;
			}
			const label = localize("terminal.freePort", "Free port {0}", port);
			return {
				class: undefined,
				tooltip: label,
				id: 'terminal.freePort',
				label,
				enabled: true,
				run: async () => terminalInstance?.freePortKillProcess?.(port)
			};
		}
	};
}
export function gitPushSetUpstream(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitPushOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
		},
		exitStatus: false,
		getQuickFixes: (matchResult: TerminalQuickFixMatchResult, command: ITerminalCommand) => {
			const branch = matchResult?.outputMatch?.[1];
			if (!branch) {
				return;
			}
			return {
				type: 'command',
				command: `git push --set-upstream origin ${branch}`,
				addNewLine: true
			};
		}
	};
}

export function gitCreatePr(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitCreatePrOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
		},
		exitStatus: true,
		getQuickFixes: (matchResult: TerminalQuickFixMatchResult, command?: ITerminalCommand) => {
			if (!command) {
				return;
			}
			const link = matchResult?.outputMatch?.[1];
			if (!link) {
				return;
			}
			return {
				type: 'opener',
				uri: URI.parse(link)
			};
		}
	};
}
