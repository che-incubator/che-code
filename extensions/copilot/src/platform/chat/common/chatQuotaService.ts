/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { IHeaders } from '../../networking/common/fetcherService';

/**
 * This is the quota info we get from the `copilot_internal/user` endpoint.
 * It is accessed via the copilot token object
 */
export interface CopilotUserQuotaInfo {
	quota_reset_date?: string;
	quota_snapshots?: {
		chat: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
		completions: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
		premium_interactions: {
			quota_id: string;
			entitlement: number;
			remaining: number;
			unlimited: boolean;
			overage_count: number;
			overage_permitted: boolean;
			percent_remaining: number;
		};
	};
}

export interface IChatQuota {
	quota: number;
	used: number;
	unlimited: boolean;
	overageUsed: number;
	overageEnabled: boolean;
	resetDate: Date;
}

export interface IChatQuotaService {
	readonly _serviceBrand: undefined;
	quotaExhausted: boolean;
	overagesEnabled: boolean;
	processQuotaHeaders(headers: IHeaders): void;
	clearQuota(): void;
}

export const IChatQuotaService = createServiceIdentifier<IChatQuotaService>('IChatQuotaService');
