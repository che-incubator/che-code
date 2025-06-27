/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-var */

export { };

declare global {

	type TextDecoder = { decode: (input: Uint8Array) => string };
	type TextEncoder = { encode: (input: string) => Uint8Array };
}
