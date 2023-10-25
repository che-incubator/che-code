/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
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

import { ApiType } from '@kubernetes/client-node';
import { injectable } from 'inversify';
import { K8SRawResponse, K8SService } from '../api/k8s-service';

const request = require('request');

@injectable()
export class K8SServiceImpl implements K8SService {
  private coreV1API!: k8s.CoreV1Api;
  private customObjectsApi!: k8s.CustomObjectsApi;
  private k8sConfig: k8s.KubeConfig;
  private devWorkspaceName!: string;
  private devWorkspaceNamespace!: string;

  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromCluster();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendRawQuery(requestURL: string, opts: any): Promise<K8SRawResponse> {
    this.k8sConfig.applyToRequest(opts);
    const cluster = this.k8sConfig.getCurrentCluster();
    if (!cluster) {
      throw new Error('K8S cluster is not defined');
    }
    const URL = `${cluster.server}${requestURL}`;

    return this.makeRequest(URL, opts);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeRequest(URL: string, opts: any): Promise<K8SRawResponse> {
    return new Promise((resolve, _reject) => {
      request.get(URL, opts, (error: string, response: { statusCode: number }, body: string) => {
        resolve({
          statusCode: response.statusCode,
          data: body,
          error: error,
        });
      });
    });
  }

  getConfig(): k8s.KubeConfig {
    return this.k8sConfig;
  }

  makeApiClient<T extends ApiType>(apiClientType: new (server: string) => T): T {
    return this.k8sConfig.makeApiClient(apiClientType);
  }

  getCoreApi(): k8s.CoreV1Api {
    if (!this.coreV1API) {
      this.k8sConfig.loadFromCluster();
      this.coreV1API = this.makeApiClient(k8s.CoreV1Api);
    }
    return this.coreV1API;
  }

  getCustomObjectsApi(): k8s.CustomObjectsApi {
    if (!this.customObjectsApi) {
      this.k8sConfig.loadFromCluster();
      this.customObjectsApi = this.makeApiClient(k8s.CustomObjectsApi);
    }
    return this.customObjectsApi;
  }

  async getSecret(labelSelector?: string): Promise<Array<k8s.V1Secret>> {
    const namespace = this.getDevWorkspaceNamespace();
    if (!namespace) {
      throw new Error('Can not get secrets: DEVWORKSPACE_NAMESPACE env variable is not defined');
    }

    try {
      const coreV1API = this.getCoreApi();
      const { body } = await coreV1API.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );
      return body.items;
    } catch (error) {
      console.error('Can not get secret ', error);
      return [];
    }
  }

  async replaceNamespacedSecret(name: string, secret: k8s.V1Secret): Promise<void> {
    const namespace = this.getDevWorkspaceNamespace();
    if (!namespace) {
      throw new Error('Can not replace a secret: DEVWORKSPACE_NAMESPACE env variable is not defined');
    }

    const coreV1API = this.getCoreApi();
    await coreV1API.replaceNamespacedSecret(name, namespace, secret);
  }

  async createNamespacedSecret(secret: k8s.V1Secret): Promise<void> {
    const namespace = this.getDevWorkspaceNamespace();
    if (!namespace) {
      throw new Error('Can not create a secret: DEVWORKSPACE_NAMESPACE env variable is not defined');
    }

    const coreV1API = this.getCoreApi();
    await coreV1API.createNamespacedSecret(namespace, secret);
  }

  async deleteNamespacedSecret(secret: k8s.V1Secret): Promise<void> {
    const namespace = this.getDevWorkspaceNamespace();
    if (!namespace) {
      throw new Error('Can not delete a secret: DEVWORKSPACE_NAMESPACE env variable is not defined');
    }

    const secretName = secret.metadata?.name;
    if (!secretName) {
      throw new Error('Can not delete a secret: secret name is not defined');
    }

    const coreV1API = this.getCoreApi();
    await coreV1API.deleteNamespacedSecret(secretName, namespace);
  }

  async getDevWorkspace(): Promise<V1alpha2DevWorkspace> {
    try {
      const workspaceName = this.getDevWorkspaceName();
      const namespace = this.getDevWorkspaceNamespace();
      const customObjectsApi = this.getCustomObjectsApi();

      const resp = await customObjectsApi.getNamespacedCustomObject(
        devworkspaceGroup,
        devworkspaceLatestVersion,
        namespace,
        devworkspacePlural,
        workspaceName,
      );
      return resp.body as V1alpha2DevWorkspace;
    } catch (e) {
      console.error(e);
      throw new Error('Unable to get Dev Workspace');
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
