/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { CodeWorkspace } from './code-workspace';
import { DevWorkspaceId } from './devworkspace-id';
import { NodeExtraCertificate } from './node-extra-certificate';
import { OpenVSIXRegistry } from './openvsix-registry';
import { LocalStorageKeyProvider } from './local-storage-key-provider';
import { TrustedExtensions } from './trusted-extensions';
import { VSCodeLauncher } from './vscode-launcher';
import { WebviewResources } from './webview-resources';

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
    await new LocalstorageKeyProvider().configure();
    await new TrustedExtensions().configure();

    const workspaceFile = await new CodeWorkspace().generate();

    await new VSCodeLauncher().launch(workspaceFile);
  }
}
