/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { parseFeedbackResponse } from '../feedbackGenerator';

suite('Review Tests', function () {

	test('Correctly parses reply', function () {
		const fileContents = `1. Line 33 in \`requestLoggerImpl.ts\`, readability, low severity: The lambda function used in \`onDidChange\` could be extracted into a named function for better readability and reusability.
   \`\`\`typescript
   this._register(workspace.registerTextDocumentContentProvider(ChatRequestScheme.chatRequestScheme, {
       onDidChange: Event.map(this.onDidChangeRequests, this._mapToLatestUri),
       provideTextDocumentContent: (uri) => {
           const uriData = ChatRequestScheme.parseUri(uri.toString());
           if (!uriData) { return \`Invalid URI: \${uri}\`; }

           const entry = uriData.kind === 'latest' ? this._entries[this._entries.length - 1] : this._entries.find(e => e.id === uriData.id);
           if (!entry) { return \`Request not found\`; }

           if (entry.kind === LoggedInfoKind.Element) { return entry.html; }

           return this._renderEntryToMarkdown(entry.id, entry.entry);
       }
   }));

   private _mapToLatestUri = () => Uri.parse(ChatRequestScheme.buildUri({ kind: 'latest' }));
   \`\`\``;
		const matches = parseFeedbackResponse(fileContents);
		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].from, 32);
		assert.strictEqual(matches[0].content.indexOf('```'), -1);
	});
});
