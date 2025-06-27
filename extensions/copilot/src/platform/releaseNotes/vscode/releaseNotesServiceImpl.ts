/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sanitizeVSCodeVersion } from '../../../util/common/vscodeVersion';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IReleaseNotesService } from '../common/releaseNotesService';

export class ReleaseNotesService implements IReleaseNotesService {
	declare _serviceBrand: undefined;
	static readonly BASE_URL = 'https://code.visualstudio.com/raw';

	constructor(@IEnvService private readonly envService: IEnvService,
		@IFetcherService private readonly fetcherService: IFetcherService
	) { }

	async fetchLatestReleaseNotes(): Promise<string | undefined> {
		const url = this.getUrl();
		if (!url) {
			return;
		}
		const releaseNotes = await this.fetcherService.fetch(url, {
			method: 'GET',
		});
		const releaseNotesText = await releaseNotes.text();
		return releaseNotesText;
	}


	private getUrl(): string | undefined {
		const vscodeVer = sanitizeVSCodeVersion(this.envService.getEditorInfo().version);
		const match = /^(\d+\.\d+)$/.exec(vscodeVer);
		if (!match) {
			return;
		}

		const versionLabel = match[1].replace(/\./g, '_');
		return `${ReleaseNotesService.BASE_URL}/v${versionLabel}.md`;
	}
}