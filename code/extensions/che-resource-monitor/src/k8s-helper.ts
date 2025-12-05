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
import { injectable } from 'inversify';
import { Agent as HttpsAgent } from 'https';
import fetch, { RequestInit } from 'node-fetch';

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
      this.kc.loadFromDefault();
      this.k8sAPI = this.kc.makeApiClient(k8s.CoreV1Api);
    }
    return this.k8sAPI;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendRawQuery(requestURL: string, opts: any): Promise<K8SRawResponse> {
    this.kc.applyToFetchOptions(opts);
    const cluster = this.kc.getCurrentCluster();
    if (!cluster) {
      throw new Error('K8S cluster is not defined');
    }
    const URL = `${cluster.server}${requestURL}`;
  
    return this.makeRequest(URL, opts);
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async makeRequest(URL: string, opts: any): Promise<K8SRawResponse> {
    try {
      const fetchOptions: RequestInit = {
        method: opts.method || 'GET',
        headers: opts.headers || {},
      };

      // Configure HTTPS agent if cert/key/ca are provided
      if (opts.cert || opts.key || opts.ca || opts.agentOptions) {
        const agentOptions: any = opts.agentOptions || {};
        if (opts.cert) agentOptions.cert = opts.cert;
        if (opts.key) agentOptions.key = opts.key;
        if (opts.ca) agentOptions.ca = opts.ca;
        if (opts.strictSSL !== undefined) agentOptions.rejectUnauthorized = opts.strictSSL;

        // @ts-ignore - node-fetch accepts agent option
        fetchOptions.agent = new HttpsAgent(agentOptions);
      }

      const response = await fetch(URL, fetchOptions);
      const body = await response.text();

      return {
        statusCode: response.status,
        data: body,
        error: '',
      };
    } catch (error) {
      return {
        statusCode: 0,
        data: '',
        error: String(error),
      };
    }
  }

}
