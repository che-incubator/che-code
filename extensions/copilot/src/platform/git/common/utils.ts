/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Remote } from '../vscode/git';

interface GitConfigSection {
	name: string;
	subSectionName?: string;
	properties: { [key: string]: string };
}

class GitConfigParser {
	private static readonly _lineSeparator = /\r?\n/;

	private static readonly _propertyRegex = /^\s*(\w+)\s*=\s*"?([^"]+)"?$/;
	private static readonly _sectionRegex = /^\s*\[\s*([^\]]+?)\s*(\"[^"]+\")*\]\s*$/;

	static parse(raw: string): GitConfigSection[] {
		const config: { sections: GitConfigSection[] } = { sections: [] };
		let section: GitConfigSection = { name: 'DEFAULT', properties: {} };

		const addSection = (section?: GitConfigSection) => {
			if (!section) { return; }
			config.sections.push(section);
		};

		for (const line of raw.split(GitConfigParser._lineSeparator)) {
			// Section
			const sectionMatch = line.match(GitConfigParser._sectionRegex);
			if (sectionMatch?.length === 3) {
				addSection(section);
				section = { name: sectionMatch[1], subSectionName: sectionMatch[2]?.replaceAll('"', ''), properties: {} };

				continue;
			}

			// Property
			const propertyMatch = line.match(GitConfigParser._propertyRegex);
			if (propertyMatch?.length === 3 && !Object.keys(section.properties).includes(propertyMatch[1])) {
				section.properties[propertyMatch[1]] = propertyMatch[2];
			}
		}

		addSection(section);

		return config.sections;
	}
}

export function parseGitRemotes(raw: string): Remote[] {
	const remotes: Remote[] = [];

	for (const remoteSection of GitConfigParser.parse(raw).filter(s => s.name === 'remote')) {
		if (remoteSection.subSectionName) {
			remotes.push({
				name: remoteSection.subSectionName,
				fetchUrl: remoteSection.properties['url'],
				pushUrl: remoteSection.properties['pushurl'] ?? remoteSection.properties['url'],
				isReadOnly: false
			});
		}
	}

	return remotes;
}
