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

import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';
import * as k8s from '@kubernetes/client-node';

import {
  V1alpha2DevWorkspaceSpecTemplate
} from '@devfile/api';

import { inject, injectable } from 'inversify';

import { K8SServiceImpl } from './k8s-service-impl';
import { DevfileService } from '../api/devfile-service';
import { K8sDevWorkspaceEnvVariables } from './k8s-devworkspace-env-variables';
import { V1Pod } from '@kubernetes/client-node';

@injectable()
export class K8sDevfileServiceImpl implements DevfileService {
  @inject(K8SServiceImpl)
  private k8SService!: K8SServiceImpl;

  @inject(K8sDevWorkspaceEnvVariables)
  private env!: K8sDevWorkspaceEnvVariables;

  async getRaw(): Promise<string> {
    // get content of the file
    const devFilePath = this.env.getDevWorkspaceFlattenedDevfilePath();
    const devfileContent = await fs.readFile(devFilePath, 'utf-8');
    return devfileContent;
  }

  async get(): Promise<V1alpha2DevWorkspaceSpecTemplate> {
    // get raw content
    const devfileRaw = await this.getRaw();
    return jsYaml.load(devfileRaw) as V1alpha2DevWorkspaceSpecTemplate;
  }

  async getWorkspacePod(): Promise<V1Pod> {
    // get workspace pod
    const k8sCoreV1Api = this.k8SService.makeApiClient(k8s.CoreV1Api);
    const labelSelector = `controller.devfile.io/devworkspace_id=${this.env.getWorkspaceId()}`;
    const { body } = await k8sCoreV1Api.listNamespacedPod(
      this.env.getWorkspaceNamespace(),
      undefined,
      undefined,
      undefined,
      undefined,
      labelSelector
    );

    // ensure there is only one item
    if (body.items.length !== 1) {
      throw new Error(
        `Got invalid items when searching for objects with label selector ${labelSelector}. Expected only one resource`
      );
    }

    return body.items[0];
  }


  async updateDevfile(devfile: V1alpha2DevWorkspaceSpecTemplate): Promise<void> {
    // Grab custom resource object
    const customObjectsApi = this.k8SService.makeApiClient(k8s.CustomObjectsApi);
    const group = 'workspace.devfile.io';
    const version = 'v1alpha2';

    const patch = [
      {
        op: 'replace',
        path: '/spec/template',
        value: devfile,
      },
    ];
    const options = {
      headers: {
        'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH,
      },
    };
    await customObjectsApi.patchNamespacedCustomObject(
      group,
      version,
      this.env.getWorkspaceNamespace(),
      'devworkspaces',
      this.env.getWorkspaceName(),
      patch,
      undefined,
      undefined,
      undefined,
      options
    );
  }
}
