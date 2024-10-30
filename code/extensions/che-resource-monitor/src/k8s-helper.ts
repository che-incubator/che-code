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
import * as request from 'request';
import { injectable } from 'inversify';

export interface K8SRawResponse {
  statusCode: number;
  data: string;
  error: string;
}

@injectable()
export class K8sHelper {
  private k8sAPI!: k8s.CoreV1Api;
  private kc!: k8s.KubeConfig;

  initConfig(): k8s.KubeConfig {
    return new k8s.KubeConfig();
  }

  getCoreApi(): k8s.CoreV1Api {
    if (!this.k8sAPI) {
      this.kc = this.initConfig();

      try {
        this.kc.loadFromDefault();
      } catch (err) {
        console.error(`> Failed to load default KubeConfig. ${err.message}`);

        console.error(`    > statusCode: ${err.statusCode}`);
        console.error(`    > error.body.message: ${err.body ? err.body.message : ''}`);
      }
      
      this.k8sAPI = this.kc.makeApiClient(k8s.CoreV1Api);
    }
    return this.k8sAPI;
  }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendRawQuery(requestURL: string, opts: any): Promise<K8SRawResponse> {
      this.kc.applyToRequest(opts);
      const cluster = this.kc.getCurrentCluster();
      if (!cluster) {
        throw new Error('K8S cluster is not defined');
      }
      const URL = `${cluster.server}${requestURL}`;
  
      return this.makeRequest(URL, opts);
    }
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeRequest(URL: string, opts: any): Promise<K8SRawResponse> {
      return new Promise((resolve) => {
        request.get(URL, opts, (error: string, response: { statusCode: number }, body: string) => {
          resolve({
            statusCode: response.statusCode,
            data: body,
            error: error,
          });
        });
      });
    }



}
