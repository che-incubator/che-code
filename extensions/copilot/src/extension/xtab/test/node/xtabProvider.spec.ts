/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { XtabProvider } from '../../node/xtabProvider';

suite('remove backticks', () => {
	test('remove backticks', () => {
		const code = `\`\`\`python\nfoo bar\njar\n\`\`\``;

		expect(JSON.stringify(XtabProvider.getBacktickSection(code))).toMatchInlineSnapshot(`""foo bar\\njar""`);
	});

	test('remove backticks - preserve carriage returns', () => {
		const code = `\`\`\`python\r\nfoo bar\r\njar\r\n\`\`\``;

		expect(JSON.stringify(XtabProvider.getBacktickSection(code))).toMatchInlineSnapshot(`""foo bar\\r\\njar""`);
	});
});
