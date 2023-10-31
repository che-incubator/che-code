/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgent2 {
		/**
		 * When true, this agent is invoked by default when no other agent is being invoked
		 */
		isDefault?: boolean;
	}
}
