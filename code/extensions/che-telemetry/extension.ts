/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
import * as vscode from 'vscode';
import { TelemetryEventService } from "./telemetry-event-service";

let telemetryEventService: TelemetryEventService;

export async function activate(context: vscode.ExtensionContext) {
    const telemetryService = await getTelemetryService();
    telemetryEventService = new TelemetryEventService(telemetryService);

    telemetryEventService.sendEvent(
        "WORKSPACE_OPENED",
        context.extensionPath,
        []
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(
            (e: vscode.TextDocumentChangeEvent) => {
                if (e.document.uri.scheme !== "output") {
                    telemetryEventService.sendEvent(
                        "EDITOR_USED",
                        context.extensionPath,
                        [["programming language", e.document.languageId]]
                    );
                }
            }
        )
    );
}

async function getTelemetryService(): Promise<any> {
    const CHE_API = "eclipse-che.api";
    const extensionApi = vscode.extensions.getExtension(CHE_API);
    if (!extensionApi) {
        throw Error(
            `Failed to get workspace service. Extension ${CHE_API} is not installed.`
        );
    }

    try {
        await extensionApi.activate();
        const cheApi: any = extensionApi?.exports;
        return cheApi.getTelemetryService();
    } catch {
        throw Error(
            `Failed to get telemetry service. Could not activate and retrieve exports from extension ${CHE_API}.`
        );
    }
}

export function deactivate() {}
