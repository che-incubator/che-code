/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { BasePromptElementProps, PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITerminalService } from '../../../../platform/terminal/common/terminalService';
import { ToolName } from '../../../tools/common/toolNames';

interface TerminalCwdPromptProps extends BasePromptElementProps {
	readonly sessionId?: string;
}

export class TerminalCwdPrompt extends PromptElement<TerminalCwdPromptProps> {
	constructor(
		props: TerminalCwdPromptProps,
		@ITerminalService protected readonly terminalService: ITerminalService,
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	public override async render(_state: void, _sizing: PromptSizing) {
		const terminalCwd = await this.terminalService.getCwdForSession(this.props.sessionId);
		if (!terminalCwd) {
			return (<></>);
		}
		return (
			<>{`For an isBackground=false terminal, the ${ToolName.RunInTerminal} tool will run the command in this working directory: ${this.promptPathRepresentationService.getFilePath(terminalCwd)}.`}</>
		);
	}
}
