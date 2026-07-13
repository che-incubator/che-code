/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { Schemas } from '../../../../base/common/network.js';
import { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService, UserDataProfilesObject } from '../../common/userDataProfile.js';
import { BrowserUserDataProfilesService } from '../userDataProfile.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../workbench/services/environment/browser/environmentService.js';

/**
 * Extends BrowserUserDataProfilesService to redirect keybindingsResource
 * from IndexedDB (vscode-userdata scheme) to the server filesystem
 * (vscodeRemote scheme) when cheKeybindingsPath is configured.
 */
export class CheUserDataProfilesService extends BrowserUserDataProfilesService implements IUserDataProfilesService {

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, uriIdentityService, logService);
	}

	protected override get profilesObject(): UserDataProfilesObject {
		const result = super.profilesObject;
		const cheKeybindingsPath = (this.environmentService as IBrowserWorkbenchEnvironmentService).options?.cheKeybindingsPath;
		if (cheKeybindingsPath && result.profiles.length > 0 && result.profiles[0].isDefault) {
			(result.profiles[0] as Mutable<IUserDataProfile>).keybindingsResource = URI.file(cheKeybindingsPath).with({ scheme: Schemas.vscodeRemote });
		}
		return result;
	}

}
