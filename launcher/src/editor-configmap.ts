/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as k8s from '@kubernetes/client-node';

const CONFIGMAP_NAME = 'vscode-editor-configurations';

/**
 * See following documentation for details
 * https://eclipse.dev/che/docs/stable/administration-guide/editor-configurations-for-microsoft-visual-studio-code/
 */
export class EditorConfigMap {
  async read(): Promise<Record<string, string> | undefined> {
    console.log(`# Checking for editor configurations provided by '${CONFIGMAP_NAME}' Config Map...`);

    if (!process.env.DEVWORKSPACE_NAMESPACE) {
      console.log('  > process.env.DEVWORKSPACE_NAMESPACE is not set, skip this step');
      return undefined;
    }

    try {
      const k8sConfig = new k8s.KubeConfig();
      k8sConfig.loadFromCluster();
      const coreV1API = k8sConfig.makeApiClient(k8s.CoreV1Api);

      const body = await coreV1API.readNamespacedConfigMap({
        name: CONFIGMAP_NAME,
        namespace: process.env.DEVWORKSPACE_NAMESPACE!,
      });

      if (!body || !body.data) {
        console.log(`  > Config Map ${CONFIGMAP_NAME} is not provided, skip this step`);
        return undefined;
      }

      return body.data;
    } catch (error) {
      const err = error as { message?: string; response?: { statusCode?: number } };
      console.log(
        `  > Warning: Can not get Configmap with editor configurations: ${err.message}, status code: ${err.response?.statusCode}`
      );
      return undefined;
    }
  }
}
