/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { EventId } from "./constants";

export type TelemetryService = {
    submitTelemetryEvent: (
        id: string,
        ownerId: string,
        ip: string,
        agent: string,
        resolution: string,
        properties: [string, string][]
    ) => Promise<void>;
};

/**
 * Telemetry API to send events to the telemetry service
 */
export class TelemetryEventService {
    private telemetryService: TelemetryService;

    constructor(telemetryService: TelemetryService) {
        this.telemetryService = telemetryService;
    }

    /**
     * Sends an event to the telemetry service
     * @param id the event id
     * @param ownerId the owner id
     * @param properties optional properties for this event
     */
    async sendEvent(
        id: EventId,
        ownerId: string,
        properties: [string, string][]
    ): Promise<void> {
        this.telemetryService.submitTelemetryEvent(
            id,
            ownerId,
            'null',
            'null',
            'null',
            properties
        );
    }
}
