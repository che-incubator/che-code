/**********************************************************************
 * Copyright (c) 2022 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

import * as k8s from '@kubernetes/client-node';
import { inject, injectable } from 'inversify';
import { AxiosInstance } from "axios";
import { K8SServiceImpl } from './k8s-service-impl';
import { K8sDevWorkspaceEnvVariables } from './k8s-devworkspace-env-variables';
import { WorkspaceService } from '../api/workspace-service';

@injectable()
export class K8sWorkspaceServiceImpl implements WorkspaceService {
  @inject(K8SServiceImpl)
  private k8SService!: K8SServiceImpl;

  @inject(K8sDevWorkspaceEnvVariables)
  private env!: K8sDevWorkspaceEnvVariables;

  @inject(Symbol.for('AxiosInstance'))
  private axiosInstance!: AxiosInstance;

  public async getNamespace(): Promise<string> {
    return this.env.getWorkspaceNamespace();
  }

  public async getWorkspaceId(): Promise<string> {
    return this.env.getWorkspaceId();
  }

  public async getPodName(): Promise<string> {
    return this.env.getWorkspacePodName();
  }

  private machineExecPortFault = false;

  public async updateWorkspaceActivity(): Promise<void> {
    if (this.machineExecPortFault) {
      // no need to check the environment variable again
      return;
    }

    if (!process.env.MACHINE_EXEC_PORT) {
      this.machineExecPortFault = true;
      throw new Error('Environment variable MACHINE_EXEC_PORT not found.');
    }

    const requestUrl = `http://127.0.0.1:${process.env.MACHINE_EXEC_PORT}/activity/tick`;
    await this.axiosInstance.post(requestUrl);
  }

  // stopping the workspace is changing the started state to false
  public async stop(): Promise<void> {
    const customObjectsApi = this.k8SService.makeApiClient(k8s.CustomObjectsApi);
    const group = 'workspace.devfile.io';
    const version = 'v1alpha2';
    const namespace = this.env.getWorkspaceNamespace();
    const plural = 'devworkspaces';
    const name = this.env.getWorkspaceName();
    const patch = [
      {
        op: 'replace',
        path: '/spec/started',
        value: false,
      },
    ];

    // TODO: In v1.4.0, content-type header is automatically set for patch operations
    await customObjectsApi.patchNamespacedCustomObject({
      group: group,
      version: version,
      namespace: namespace,
      plural: plural,
      name: name,
      body: patch,
    });
  }
}
