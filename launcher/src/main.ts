/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { CodeWorkspace } from './code-workspace.js';
import { DevWorkspaceId } from './devworkspace-id.js';
import { NodeExtraCertificate } from './node-extra-certificate.js';
import { OpenVSIXRegistry } from './openvsix-registry.js';
import { LocalStorageKeyProvider } from './local-storage-key-provider.js';
import { TrustedExtensions } from './trusted-extensions.js';
import { VSCodeLauncher } from './vscode-launcher.js';
import { WebviewResources } from './webview-resources.js';
import { EditorConfigurations } from './editor-configurations.js';

/**
 * Mandatory environment variables:
 *  env.PROJECTS_ROOT
 *  env.DEVWORKSPACE_FLATTENED_DEVFILE
 *  env.VSCODE_NODEJS_RUNTIME_DIR
 */
export class Main {
  async start(): Promise<void> {
    await new DevWorkspaceId().configure();
    await new OpenVSIXRegistry().configure();
    await new WebviewResources().configure();
    await new NodeExtraCertificate().configure();
    await new LocalStorageKeyProvider().configure();
    await new TrustedExtensions().configure();

    const workspaceFile = await new CodeWorkspace().generate();
    await new EditorConfigurations(workspaceFile).configure();

    await new VSCodeLauncher().launch(workspaceFile);
  }
}
