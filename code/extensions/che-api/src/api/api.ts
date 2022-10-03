
/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import { DevfileService } from './devfile-service';
import { WorkspaceService } from './workspace-service';
import { GithubService } from './github-service';
import { TelemetryService } from './telemetry-service';

export interface Api {
    getDevfileService(): DevfileService;
    getWorkspaceService(): WorkspaceService;
    getGithubService(): GithubService;
    getTelemetryService(): TelemetryService;
}
