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
import { K8SServiceImpl } from './k8s-service-impl';
import { K8sDevWorkspaceEnvVariables } from './k8s-devworkspace-env-variables';
import { WorkspaceService } from '../api/workspace-service';

@injectable()
export class K8sWorkspaceServiceImpl implements WorkspaceService {
    @inject(K8SServiceImpl)
    private k8SService!: K8SServiceImpl;
  
    @inject(K8sDevWorkspaceEnvVariables)
    private env!: K8sDevWorkspaceEnvVariables;
  
    public async getNamespace(): Promise<string> {
      return this.env.getWorkspaceNamespace();
    }
  
    public async getWorkspaceId(): Promise<string> {
      return this.env.getWorkspaceId();
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
  
      const options = { headers: { 'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH } };
      await customObjectsApi.patchNamespacedCustomObject(
        group,
        version,
        namespace,
        plural,
        name,
        patch,
        undefined,
        undefined,
        undefined,
        options
      );
    }
  
  }