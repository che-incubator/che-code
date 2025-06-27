/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CAPIChatMessage, ChatRole } from '../../networking/common/openai';

export function messageToMarkdown(message: CAPIChatMessage): string {
	const capitalizedRole = message.role.charAt(0).toUpperCase() + message.role.slice(1);
	let str = `### ${capitalizedRole}\n~~~md\n`;
	if (message.role === ChatRole.Tool) {
		str += `🛠️ ${message.tool_call_id}`;
		if (message.content) {
			str += '\n';
		}
	}

	if (Array.isArray(message.content)) {
		str += message.content.map(item => {
			if (item.type === 'text') {
				return item.text;
			} else if (item.type === 'image_url') {
				return JSON.stringify(item);
			}
		}).join('\n');
	} else {
		str += message.content;
	}

	if (message.role === ChatRole.Assistant && message.tool_calls?.length) {
		if (message.content) {
			str += '\n';
		}
		str += message.tool_calls.map(c => {
			let argsStr = c.function.arguments;
			try {
				const parsedArgs = JSON.parse(c.function.arguments);
				argsStr = JSON.stringify(parsedArgs, undefined, 2)
					.replace(/(?<!\\)\\n/g, '\n')
					.replace(/(?<!\\)\\t/g, '\t');
			} catch (e) { }
			return `🛠️ ${c.function.name} (${c.id}) ${argsStr}`;
		}).join('\n');
	}

	if (message.copilot_cache_control) {
		str += `\ncopilot_cache_control: ${JSON.stringify(message.copilot_cache_control)}`;
	}

	str += '\n~~~\n';

	return str;
}
