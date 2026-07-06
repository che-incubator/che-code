/**********************************************************************
 * Copyright (c) 2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import * as fs from 'fs';
import { URI } from '../../../base/common/uri.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { LogService } from '../../../platform/log/common/logService.js';
import { FilePolicyService } from '../../../platform/policy/common/filePolicyService.js';
import { IPolicyService, NullPolicyService } from '../../../platform/policy/common/policy.js';
import { ServerEnvironmentService } from '../serverEnvironmentService.js';

const POLICY_FILE_PATH = '/checode-config/policy.json';

export function getPolicyFile(): URI | undefined {
	if (fs.existsSync(POLICY_FILE_PATH)) {
		return URI.file(POLICY_FILE_PATH);
	}
	return undefined;
}

export function getPolicyService(environmentService: ServerEnvironmentService, fileService: FileService, logService: LogService, disposables: DisposableStore): IPolicyService {
	if (environmentService.policyFile) {
		logService.info(`Using policy file: ${environmentService.policyFile.fsPath}`);
		return disposables.add(new FilePolicyService(environmentService.policyFile, fileService, logService));
	} else {
		logService.info('Policy file not found');
		return new NullPolicyService();
	}
}
