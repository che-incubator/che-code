/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, describe, expect, test } from 'vitest';
import { CHAT_MODEL } from '../../../../platform/configuration/common/configurationService';
import { JsonSchema } from '../../../../platform/configuration/common/jsonSchema';
import { OpenAiFunctionTool } from '../../../../platform/networking/common/fetch';
import { normalizeToolSchema } from '../../common/toolSchemaNormalizer';

describe('ToolSchemaNormalizer', () => {
	const makeTool = (properties: Record<string, JsonSchema>): OpenAiFunctionTool[] => [{
		type: 'function',
		function: {
			name: 'test',
			description: 'test',
			parameters: {
				type: 'object',
				properties,
			}
		}
	}];

	test('throws an invalid primitive types', () => {
		assert.throws(() => normalizeToolSchema(CHAT_MODEL.GPT41, makeTool({
			foo: {
				type: 'text',
				description: 'foo',
			}
		})), Error, /do not match JSON schema/);
	});

	test('fails on array without item specs', () => {
		assert.throws(() => normalizeToolSchema(CHAT_MODEL.GPT41, makeTool({
			foo: {
				type: 'array',
			}
		})), Error, /array type must have items/);
	});

	test('trims extra properties', () => {
		const schema = normalizeToolSchema(CHAT_MODEL.GPT41, makeTool({
			foo: {
				type: 'array',
				items: { type: 'string' },
				minItems: 2,
				maxItems: 2,
			}
		}));

		expect(schema![0].function.parameters).toMatchInlineSnapshot(`
			{
			  "properties": {
			    "foo": {
			      "items": {
			        "type": "string",
			      },
			      "type": "array",
			    },
			  },
			  "type": "object",
			}
		`);
	});

	test('does not fail on "in true""', () => {
		normalizeToolSchema(CHAT_MODEL.GPT41, makeTool({
			foo: {
				type: 'array',
				items: true
			}
		}));
	});

	test('removes undefined required properties', () => {
		const schema = normalizeToolSchema(CHAT_MODEL.GPT41, makeTool({
			foo1: {
				type: 'object',
			},
			foo2: {
				type: 'object',
				properties: { a: { type: 'string' } },
			},
			foo3: {
				type: 'object',
				properties: { a: { type: 'string' }, b: { type: 'string' } },
				required: ['a', 'b', 'c'],
			}
		}));


		expect(schema![0].function.parameters).toMatchInlineSnapshot(`
			{
			  "properties": {
			    "foo1": {
			      "type": "object",
			    },
			    "foo2": {
			      "properties": {
			        "a": {
			          "type": "string",
			        },
			      },
			      "type": "object",
			    },
			    "foo3": {
			      "properties": {
			        "a": {
			          "type": "string",
			        },
			        "b": {
			          "type": "string",
			        },
			      },
			      "required": [
			        "a",
			        "b",
			      ],
			      "type": "object",
			    },
			  },
			  "type": "object",
			}
		`);
	});


	test('ensures object parameters', () => {
		const n1: any = normalizeToolSchema(CHAT_MODEL.GPT41, [{
			type: 'function',
			function: {
				name: 'noParams',
				description: 'test',
			}
		}, {
			type: 'function',
			function: {
				name: 'wrongType',
				description: 'test',
				parameters: { type: 'string' },
			}
		}, {
			type: 'function',
			function: {
				name: 'missingProps',
				description: 'test',
				parameters: { type: 'object' },
			}
		}]);

		expect(n1).toMatchInlineSnapshot(`
			[
			  {
			    "function": {
			      "description": "test",
			      "name": "noParams",
			    },
			    "type": "function",
			  },
			  {
			    "function": {
			      "description": "test",
			      "name": "wrongType",
			      "parameters": {
			        "properties": {},
			        "type": "object",
			      },
			    },
			    "type": "function",
			  },
			  {
			    "function": {
			      "description": "test",
			      "name": "missingProps",
			      "parameters": {
			        "properties": {},
			        "type": "object",
			      },
			    },
			    "type": "function",
			  },
			]
		`);
	});

	test('normalizes arrays for draft 2020-12', () => {
		const schema = normalizeToolSchema(CHAT_MODEL.CLAUDE_37_SONNET, makeTool({
			foo: {
				type: 'array',
				items: [{ type: 'string' }, { type: 'number' }],
				minItems: 2,
				maxItems: 2,
			},
			bar: {
				type: 'array',
				items: { type: 'string' },
				minItems: 2,
				maxItems: 2,
			}
		}));

		expect(schema![0]).toMatchInlineSnapshot(`
			{
			  "function": {
			    "description": "test",
			    "name": "test",
			    "parameters": {
			      "properties": {
			        "bar": {
			          "items": {
			            "type": "string",
			          },
			          "maxItems": 2,
			          "minItems": 2,
			          "type": "array",
			        },
			        "foo": {
			          "items": {
			            "anyOf": [
			              {
			                "type": "string",
			              },
			              {
			                "type": "number",
			              },
			            ],
			          },
			          "maxItems": 2,
			          "minItems": 2,
			          "type": "array",
			        },
			      },
			      "type": "object",
			    },
			  },
			  "type": "function",
			}
		`);
	});
});
