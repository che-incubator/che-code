/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { expect, suite, test } from 'vitest';
import { runNextEditProviderTest } from './utils';

suite('NextEditProvider', () => {
	test('1', async () => {
		const result = await runNextEditProviderTest({
			"recentWorkspaceEdits": [{
				"path": "d:\\dev\\playground\\inline-edits-playground\\pointExample.ts",
				"initialText": "\nclass Point {\n    constructor(\n        private readonly x: number,\n        private readonly y: number,\n    ) {}\n    \n    getDistance() {\n        return Math.sqrt(this.x ** 2 + this.y ** 2);\n    }\n}\n",
				"edit": [
					[
						12,
						12,
						"3D"
					]
				]
			}],
			/*TODo
			"statelessInitialText": "\nclass Point {\n    constructor(\n        private readonly x: number,\n        private readonly y: number,\n    ) {}\n    \n    getDistance() {\n        return Math.sqrt(this.x ** 2 + this.y ** 2);\n    }\n}\n",
			"statelessEdit": [
				[
					2,
					3,
					[
						"class Point3D {"
					]
				]
			],*/
			"statelessNextEdit": [
				[
					6,
					6,
					[
						"        private readonly z: number,"
					]
				],
				[
					8,
					11,
					[
						"    getDistance() {",
						"        return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);",
						"    }"
					]
				]
			]
		});

		expect(result.nextEdit).toMatchInlineSnapshot(`
			[
			  [
			    106,
			    106,
			    "        private readonly z: number,
			",
			  ],
			]
		`);
	});
});
