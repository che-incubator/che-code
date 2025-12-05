/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import {
  devworkspaceGroup,
  devworkspaceLatestVersion,
  devworkspacePlural,
  V1alpha2DevWorkspace
} from '@devfile/api';
import * as k8s from '@kubernetes/client-node';
import { injectable } from 'inversify';

const PART_OF_LABEL = 'app.kubernetes.io/part-of';
const CHE_ECLIPSE_ORG_LABEL = 'che.eclipse.org';
const CHE_ECLIPSE_ORG_DEVFILE_LABEL = 'che.eclipse.org/devfile';

@injectable()
export class K8sHelper {
  private coreV1API!: k8s.CoreV1Api;
  private customObjectsApi!: k8s.CustomObjectsApi;
  private k8sConfig: k8s.KubeConfig;
  private devWorkspaceName!: string;
  private devWorkspaceNamespace!: string;


  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
  }

  getConfig(): k8s.KubeConfig {
    return this.k8sConfig;
  }

  getCoreApi(): k8s.CoreV1Api {
    if (!this.coreV1API) {
      this.k8sConfig.loadFromDefault();
      this.coreV1API = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    }
    return this.coreV1API;
  }

  getCustomObjectsApi(): k8s.CustomObjectsApi {
    if (!this.customObjectsApi) {
      this.k8sConfig.loadFromCluster();
      this.customObjectsApi = this.k8sConfig.makeApiClient(k8s.CustomObjectsApi);
    }
    return this.customObjectsApi;
  }

  async getDevWorkspace(): Promise<V1alpha2DevWorkspace> {
    try {
      const workspaceName = this.getDevWorkspaceName();
      const namespace = this.getDevWorkspaceNamespace();
      const customObjectsApi = this.getCustomObjectsApi();

      const resp = await customObjectsApi.getNamespacedCustomObject({
        group: devworkspaceGroup,
        version: devworkspaceLatestVersion,
        namespace: namespace,
        plural: devworkspacePlural,
        name: workspaceName,
      });
      return resp.body as V1alpha2DevWorkspace;
    } catch (e) {
      console.error(e);
      throw new Error('Unable to get Dev Workspace');
    }
  }

  async getSecret(labelSelector?: string): Promise<Array<k8s.V1Secret>> {
    const coreV1API = this.getCoreApi();
    const namespace = this.getDevWorkspaceNamespace();
    if (!namespace) {
      throw new Error('Can not get secrets: DEVWORKSPACE_NAMESPACE env variable is not defined');
    }

    try {
      const body = await coreV1API.listNamespacedSecret({
        namespace: namespace,
        labelSelector: labelSelector,
      });
      return body.items;
    } catch (error) {
      console.error('Can not get secret ', error);
      return [];
    }
  }

  getDevWorkspaceName(): string {
    if (this.devWorkspaceName) {
      return this.devWorkspaceName;
    }

    const workspaceName = process.env.DEVWORKSPACE_NAME;
    if (workspaceName) {
      this.devWorkspaceName = workspaceName;
      return this.devWorkspaceName;
    }

    console.error('Can not get Dev Workspace name: DEVWORKSPACE_NAME env variable is not defined');
    throw new Error('Can not get Dev Workspace name');
  }

  getDevWorkspaceNamespace(): string {
    if (this.devWorkspaceNamespace) {
      return this.devWorkspaceNamespace;
    }

    const workspaceNamespace = process.env.DEVWORKSPACE_NAMESPACE;
    if (workspaceNamespace) {
      this.devWorkspaceNamespace = workspaceNamespace;
      return this.devWorkspaceNamespace;
    }

    console.error('Can not get Dev Workspace namespace: DEVWORKSPACE_NAMESPACE env variable is not defined');
    throw new Error('Can not get Dev Workspace namespace');
  }
}

export function filterCheSecrets(secrets: k8s.V1Secret[]): k8s.V1Secret[] {
  return secrets.filter((secret: k8s.V1Secret) => {
    console.log('part of ', secret.metadata!.labels![PART_OF_LABEL]);
    if (secret.metadata!.labels![PART_OF_LABEL] === CHE_ECLIPSE_ORG_LABEL) {
      return true;
    }
    return false;
  });
}

export function getDevfileAnnotation(annotations?: { [key: string]: string }): string | undefined {
  if (annotations && annotations[CHE_ECLIPSE_ORG_DEVFILE_LABEL]) {
    console.dir(annotations[CHE_ECLIPSE_ORG_DEVFILE_LABEL]);
    return annotations[CHE_ECLIPSE_ORG_DEVFILE_LABEL];
  } else {
    console.log('NO annotations');
    return undefined;
  }
}
