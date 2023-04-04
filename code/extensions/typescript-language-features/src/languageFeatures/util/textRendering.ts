/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../../tsServer/protocol/protocol';

export interface IFilePathToResourceConverter {
	/**
	 * Convert a typescript filepath to a VS Code resource.
	 */
	toResource(filepath: string): vscode.Uri;
}

function replaceLinks(text: string): string {
	return text
		// Http(s) links
		.replace(/\{@(link|linkplain|linkcode) (https?:\/\/[^ |}]+?)(?:[| ]([^{}\n]+?))?\}/gi, (_, tag: string, link: string, text?: string) => {
			switch (tag) {
				case 'linkcode':
					return `[\`${text ? text.trim() : link}\`](${link})`;

				default:
					return `[${text ? text.trim() : link}](${link})`;
			}
		});
}

function processInlineTags(text: string): string {
	return replaceLinks(text);
}

function getTagBodyText(
	tag: Proto.JSDocTagInfo,
	filePathConverter: IFilePathToResourceConverter,
): string | undefined {
	if (!tag.text) {
		return undefined;
	}

	// Convert to markdown code block if it does not already contain one
	function makeCodeblock(text: string): string {
		if (/^\s*[~`]{3}/m.test(text)) {
			return text;
		}
		return '```\n' + text + '\n```';
	}

	const text = convertLinkTags(tag.text, filePathConverter);
	switch (tag.name) {
		case 'example': {
			// check for caption tags, fix for #79704
			const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
			if (captionTagMatches && captionTagMatches.index === 0) {
				return captionTagMatches[1] + '\n' + makeCodeblock(text.substr(captionTagMatches[0].length));
			} else {
				return makeCodeblock(text);
			}
		}
		case 'author': {
			// fix obsucated email address, #80898
			const emailMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);

			if (emailMatch === null) {
				return text;
			} else {
				return `${emailMatch[1]} ${emailMatch[2]}`;
			}
		}
		case 'default':
			return makeCodeblock(text);
	}

	return processInlineTags(text);
}

function getTagDocumentation(
	tag: Proto.JSDocTagInfo,
	filePathConverter: IFilePathToResourceConverter,
): string | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'param':
		case 'template': {
			const body = getTagBody(tag, filePathConverter);
			if (body?.length === 3) {
				const param = body[1];
				const doc = body[2];
				const label = `*@${tag.name}* \`${param}\``;
				if (!doc) {
					return label;
				}
				return label + (doc.match(/\r\n|\n/g) ? '  \n' + processInlineTags(doc) : ` \u2014 ${processInlineTags(doc)}`);
			}
			break;
		}

		case 'return':
		case 'returns': {
			// For return(s), we require a non-empty body
			if (!tag.text?.length) {
				return undefined;
			}

			break;
		}
	}


	// Generic tag
	const label = `*@${tag.name}*`;
	const text = getTagBodyText(tag, filePathConverter);
	if (!text) {
		return label;
	}
	return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` \u2014 ${text}`);
}

function getTagBody(tag: Proto.JSDocTagInfo, filePathConverter: IFilePathToResourceConverter): Array<string> | undefined {
	if (tag.name === 'template') {
		const parts = tag.text;
		if (parts && typeof (parts) !== 'string') {
			const params = parts.filter(p => p.kind === 'typeParameterName').map(p => p.text).join(', ');
			const docs = parts.filter(p => p.kind === 'text').map(p => convertLinkTags(p.text.replace(/^\s*-?\s*/, ''), filePathConverter)).join(' ');
			return params ? ['', params, docs] : undefined;
		}
	}
	return (convertLinkTags(tag.text, filePathConverter)).split(/^(\S+)\s*-?\s*/);
}

export function asPlainTextWithLinks(
	parts: readonly Proto.SymbolDisplayPart[] | string,
	filePathConverter: IFilePathToResourceConverter,
): string {
	return processInlineTags(convertLinkTags(parts, filePathConverter));
}

/**
 * Convert `@link` inline tags to markdown links
 */
function convertLinkTags(
	parts: readonly Proto.SymbolDisplayPart[] | string | undefined,
	filePathConverter: IFilePathToResourceConverter,
): string {
	if (!parts) {
		return '';
	}

	if (typeof parts === 'string') {
		return parts;
	}

	const out: string[] = [];

	let currentLink: { name?: string; target?: Proto.FileSpan; text?: string; readonly linkcode: boolean } | undefined;
	for (const part of parts) {
		switch (part.kind) {
			case 'link':
				if (currentLink) {
					if (currentLink.target) {
						const link = filePathConverter.toResource(currentLink.target.file)
							.with({
								fragment: `L${currentLink.target.start.line},${currentLink.target.start.offset}`
							});

						const linkText = currentLink.text ? currentLink.text : escapeMarkdownSyntaxTokensForCode(currentLink.name ?? '');
						out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${link.toString()})`);
					} else {
						const text = currentLink.text ?? currentLink.name;
						if (text) {
							if (/^https?:/.test(text)) {
								const parts = text.split(' ');
								if (parts.length === 1) {
									out.push(parts[0]);
								} else if (parts.length > 1) {
									const linkText = escapeMarkdownSyntaxTokensForCode(parts.slice(1).join(' '));
									out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${parts[0]})`);
								}
							} else {
								out.push(escapeMarkdownSyntaxTokensForCode(text));
							}
						}
					}
					currentLink = undefined;
				} else {
					currentLink = {
						linkcode: part.text === '{@linkcode '
					};
				}
				break;

			case 'linkName':
				if (currentLink) {
					currentLink.name = part.text;
					currentLink.target = (part as Proto.JSDocLinkDisplayPart).target;
				}
				break;

			case 'linkText':
				if (currentLink) {
					currentLink.text = part.text;
				}
				break;

			default:
				out.push(part.text);
				break;
		}
	}
	return processInlineTags(out.join(''));
}

function escapeMarkdownSyntaxTokensForCode(text: string): string {
	return text.replace(/`/g, '\\$&');
}

export function tagsToMarkdown(
	tags: readonly Proto.JSDocTagInfo[],
	filePathConverter: IFilePathToResourceConverter,
): string {
	return tags.map(tag => getTagDocumentation(tag, filePathConverter)).join('  \n\n');
}

export function documentationToMarkdown(
	documentation: readonly Proto.SymbolDisplayPart[] | string,
	tags: readonly Proto.JSDocTagInfo[],
	filePathConverter: IFilePathToResourceConverter,
	baseUri: vscode.Uri | undefined,
): vscode.MarkdownString {
	const out = new vscode.MarkdownString();
	appendDocumentationAsMarkdown(out, documentation, tags, filePathConverter);
	out.baseUri = baseUri;
	return out;
}

export function appendDocumentationAsMarkdown(
	out: vscode.MarkdownString,
	documentation: readonly Proto.SymbolDisplayPart[] | string | undefined,
	tags: readonly Proto.JSDocTagInfo[] | undefined,
	converter: IFilePathToResourceConverter,
): vscode.MarkdownString {
	if (documentation) {
		out.appendMarkdown(asPlainTextWithLinks(documentation, converter));
	}

	if (tags) {
		const tagsPreview = tagsToMarkdown(tags, converter);
		if (tagsPreview) {
			out.appendMarkdown('\n\n' + tagsPreview);
		}
	}
	return out;
}
