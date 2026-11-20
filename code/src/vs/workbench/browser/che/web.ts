/**********************************************************************
 * Copyright (c) 2025-2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { raceTimeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../platform/files/common/files.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../../platform/policy/common/policy.js';
import { PolicyChannelClient } from '../../../platform/policy/common/policyIpc.js';
import { computeKeybindingsUpdate, KeybindingsUpdate } from '../../common/che/keybindingsMerge.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';

/**
 * Same limit that web.main.ts applies to user data initialization: startup
 * does not wait longer than this for the merge.
 */
const MERGE_TIMEOUT_MS = 5000;

/**
 * Merges keybindings from a ConfigMap into IndexedDB on workspace start.
 *
 * The merge logic lives in the pure function `computeKeybindingsUpdate`
 * (common/che/keybindingsMerge.js); this class reads the keybindings file of
 * the profile active at startup, writes the computed update back to the same
 * file and logs the outcome.
 *
 * It deliberately is NOT an IUserDataInitializer: the merge runs on every
 * start, while UserDataInitializationService is a first-run gate that, once
 * any initializer reports that it requires initialization, runs every
 * registered initializer's import phases. Running the merge separately (see
 * web.main.ts) keeps a recurring ConfigMap change from triggering first-run
 * imports of other initializers for an already initialized profile.
 *
 * Strategy: admin keybindings (from the ConfigMap) are placed at the start of
 * the array so user keybindings override them (VS Code processes keybindings
 * top-to-bottom, later entries win, and the Keyboard Shortcuts editor appends
 * new user bindings at the end) and tagged with `"_source": "configmap"` so
 * they can be replaced on the next start when the ConfigMap content changes.
 * ConfigMap entries that are not valid keybinding objects are skipped
 * individually. When the desired state matches the current file, nothing is
 * written; when a write is needed, it is done with local text
 * edits that preserve the user's comments, with a stringify fallback that never
 * loses data. When the ConfigMap content is absent, previously injected
 * entries are removed while user entries are preserved. If the ConfigMap file
 * cannot be read, the existing keybindings file cannot be read (any error other
 * than file-not-found), or either content fails to parse, nothing is written,
 * so user data is never lost.
 */
export class CheKeybindingsInitializer {

    constructor(
        private readonly initialKeybindings: string | null | undefined,
        private readonly fileService: IFileService,
        private readonly userDataProfileService: IUserDataProfileService,
        private readonly logService: ILogService,
    ) { }

    /**
     * Runs the merge. Never rejects. Startup stops waiting after
     * MERGE_TIMEOUT_MS; the merge itself may still finish in the background.
     */
    async apply(): Promise<void> {
        const completed = await raceTimeout(this.doApply().then(() => true), MERGE_TIMEOUT_MS);
        if (!completed) {
            this.logService.warn(`[CheKeybindingsInitializer] Merging keybindings takes longer than ${MERGE_TIMEOUT_MS} ms, continuing startup without waiting for it.`);
        }
    }

    private async doApply(): Promise<void> {
        try {
            // Read and write the same resource: the profile active at startup.
            const resource = this.userDataProfileService.currentProfile.keybindingsResource;
            const update = await this.computeUpdate(resource);
            if (update.kind === 'abort') {
                if (update.details !== undefined) {
                    this.logService.warn(`[CheKeybindingsInitializer] ${update.reason}`, update.details);
                } else {
                    this.logService.warn(`[CheKeybindingsInitializer] ${update.reason}`);
                }
                return;
            }
            if (update.invalidConfigmapIndices.length > 0) {
                this.logService.warn(`[CheKeybindingsInitializer] Skipping invalid ConfigMap keybindings entries at indices: ${update.invalidConfigmapIndices.join(', ')}.`);
            }
            if (update.kind === 'write') {
                this.logService.info(`[CheKeybindingsInitializer] Merging keybindings: ${update.userCount} user + ${update.adminCount} admin (ConfigMap).`);
                await this.fileService.writeFile(resource, VSBuffer.fromString(update.content));
            }
        } catch (e) {
            this.logService.warn('[CheKeybindingsInitializer] Unexpected error while merging keybindings.', e);
        }
    }

    private async computeUpdate(resource: URI): Promise<KeybindingsUpdate> {
        let existing: string | undefined;
        try {
            existing = (await this.fileService.readFile(resource)).value.toString();
        } catch (e) {
            // Only a missing file means "no user keybindings yet"; any other failure
            // (including the ones FileService.exists() would swallow) must not be
            // mistaken for an empty file, or the write would drop the user's entries.
            // Same pattern as upstream KeybindingsResource.getKeybindingsContent().
            if (!(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
                return { kind: 'abort', reason: 'Failed to read existing keybindings. Aborting to prevent data loss.', details: e };
            }
        }
        // An absent ConfigMap (undefined) means an empty admin list: previously
        // injected entries are still stripped, so removing keybindings.json from
        // the ConfigMap removes them from user profiles on the next start. An
        // unreadable ConfigMap file (null) aborts the merge without writing.
        return computeKeybindingsUpdate(existing, this.initialKeybindings);
    }
}

// Get policy service from remote agent if available, otherwise use NullPolicyService
export function getPolicyService(remoteAgentService: IRemoteAgentService, logService: ILogService, remoteAuthority?: string): IPolicyService {

    let policyService: IPolicyService;
    if (remoteAuthority) {
        try {
            const connection = remoteAgentService.getConnection();
            if (connection) {
                const policyChannel = connection.getChannel('policy');
                // PolicyChannelClient needs initial policiesData - start with empty object, policies will be loaded when definitions are registered
                policyService = new PolicyChannelClient({}, policyChannel);
                logService.info('Policy channel client was created successfully');
            } else {
                logService.warn('Failed to get remote aget connection, using NullPolicyService');
                policyService = new NullPolicyService();
            }
        } catch (error) {
            console.log('/// web main /// connection - ERROR ');
            logService.warn('Failed to create policy channel client, using NullPolicyService', error);
            policyService = new NullPolicyService();
        }
    } else {
        logService.warn('Failed to create policy channel client(no remote authority), using NullPolicyService');
        policyService = new NullPolicyService();
    }
    return policyService;
}
