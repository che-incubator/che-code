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

import { ILogService } from '../../../platform/log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../../platform/policy/common/policy.js';
import { PolicyChannelClient } from '../../../platform/policy/common/policyIpc.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';

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
