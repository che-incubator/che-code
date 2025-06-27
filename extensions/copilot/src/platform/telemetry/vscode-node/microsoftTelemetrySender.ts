/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryReporter } from '@vscode/extension-telemetry';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { BaseMsftTelemetrySender } from '../common/msftTelemetrySender';

export class MicrosoftTelemetrySender extends BaseMsftTelemetrySender {
	constructor(
		internalAIKey: string,
		internalLargeEventAIKey: string,
		externalAIKey: string,
		tokenStore: ICopilotTokenStore,
	) {
		const telemetryReporterFactory = (internal: boolean, largeEventReporter: boolean) => {
			if (internal && !largeEventReporter) {
				return new TelemetryReporter(internalAIKey);
			} else if (internal && largeEventReporter) {
				return new TelemetryReporter(internalLargeEventAIKey);
			} else {
				return new TelemetryReporter(externalAIKey);
			}
		};
		super(tokenStore, telemetryReporterFactory);
	}
}
