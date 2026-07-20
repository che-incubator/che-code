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

import { VSBuffer } from '../../../base/common/buffer.js';
import * as json from '../../../base/common/json.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../../platform/policy/common/policy.js';
import { PolicyChannelClient } from '../../../platform/policy/common/policyIpc.js';
import { IUserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';
import { IUserDataInitializer } from '../../services/userData/browser/userDataInit.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';

const CONFIGMAP_SOURCE_MARKER = 'configmap';

interface KeybindingEntry {
    key: string;
    command: string;
    when?: string;
    args?: unknown;
    _source?: string;
}

/**
 * Merges keybindings from ConfigMap into IndexedDB on every workspace start.
 *
 * Strategy: admin keybindings (from ConfigMap) are appended at the end of the
 * array so they take priority over user keybindings (VS Code processes
 * keybindings top-to-bottom, later entries win). Admin entries are tagged with
 * `"_source": "configmap"` so they can be identified and replaced on the next
 * start when the ConfigMap content changes.
 */
export class CheKeybindingsInitializer implements IUserDataInitializer {

    constructor(
        private readonly initialKeybindings: string,
        private readonly fileService: IFileService,
        private readonly userDataProfilesService: IUserDataProfilesService,
        private readonly logService: ILogService,
    ) { }

    async requiresInitialization(): Promise<boolean> {
        return true;
    }

    async whenInitializationFinished(): Promise<void> { }

    async initializeRequiredResources(): Promise<void> {
        const resource = this.userDataProfilesService.defaultProfile.keybindingsResource;

        let configmapEntries: KeybindingEntry[];
        try {
            const parsed = json.parse(this.initialKeybindings);
            if (!Array.isArray(parsed)) {
                this.logService.warn('[Che] ConfigMap keybindings.json is not a JSON array, skipping.');
                return;
            }
            configmapEntries = parsed;
        } catch (e) {
            this.logService.warn('[Che] ConfigMap keybindings.json is not valid JSON, skipping.', e);
            return;
        }

        const markedEntries: KeybindingEntry[] = configmapEntries.map(entry => ({ ...entry, _source: CONFIGMAP_SOURCE_MARKER }));

        let userEntries: KeybindingEntry[] = [];
        if (await this.fileService.exists(resource)) {
            try {
                const content = (await this.fileService.readFile(resource)).value.toString();
                const existing = json.parse(content);
                if (Array.isArray(existing)) {
                    userEntries = existing.filter((e: KeybindingEntry) => e._source !== CONFIGMAP_SOURCE_MARKER);
                }
            } catch (e) {
                this.logService.warn('[Che] Failed to parse existing keybindings. Aborting to prevent data loss.', e);
                return;
            }
        }

        const merged = [...userEntries, ...markedEntries];
        this.logService.info(`[Che] Merging keybindings: ${userEntries.length} user + ${markedEntries.length} admin (ConfigMap).`);
        await this.fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify(merged, null, '\t')));
    }

    async initializeInstalledExtensions(_instantiationService: IInstantiationService): Promise<void> { }
    async initializeOtherResources(_instantiationService: IInstantiationService): Promise<void> { }
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
