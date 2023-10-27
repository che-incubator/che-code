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
import { AxiosInstance } from 'axios';
import * as fs from 'fs-extra';
import { inject, injectable } from 'inversify';
import * as path from 'path';

import { GithubService, GithubUser } from '../api/github-service';
import { Logger } from '../logger';
import { K8SServiceImpl } from './k8s-service-impl';
import { base64Decode, base64Encode, createLabelsSelector, randomString } from './utils';

const GIT_CREDENTIALS_PATH = path.resolve('/.git-credentials', 'credentials');
const GIT_CREDENTIAL_LABEL = {
  'controller.devfile.io/git-credential': 'true'
};
const DEVICE_AUTHENTICATION_LABEL = {
  'che.eclipse.org/device-authentication': 'true'
}
const DEVICE_AUTHENTICATION_LABEL_SELECTOR: string = createLabelsSelector(DEVICE_AUTHENTICATION_LABEL);
const SCM_URL_ATTRIBUTE = 'che.eclipse.org/scm-url';
const GITHUB_URL = 'https://github.com';
const GIT_CREDENTIALS_LABEL_SELECTOR: string = createLabelsSelector(GIT_CREDENTIAL_LABEL);

@injectable()
export class GithubServiceImpl implements GithubService {
  private token: string | undefined;

  constructor(
    @inject(Logger) private logger: Logger,
    @inject(K8SServiceImpl) private readonly k8sService: K8SServiceImpl,
    @inject(Symbol.for('AxiosInstance')) private readonly axiosInstance: AxiosInstance
  ) {
    this.iniitializeToken();
  }

  private checkToken(): void {
    if (!this.token) {
      throw new Error('GitHub authentication token is not setup');
    }
  }

  async getToken(): Promise<string> {
    this.checkToken();
    return this.token!;
  }

  async getUser(): Promise<GithubUser> {
    this.checkToken();
    const result = await this.axiosInstance.get<GithubUser>('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    return result.data;
  }

  async getTokenScopes(token: string): Promise<string[]> {
    this.checkToken();
    const result = await this.axiosInstance.get<GithubUser>('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return result.headers['x-oauth-scopes'].split(', ');
  }

  async persistDeviceAuthToken(token: string): Promise<void> {
    this.token = token;
    this.logger.info(`Github Service: adding token to the device-authentication secret...`);

    const deviceAuthSecrets = await this.k8sService.getSecret(DEVICE_AUTHENTICATION_LABEL_SELECTOR);
    if (deviceAuthSecrets.length < 1) {
      this.logger.info(`Github Service: device-authentication secret not found, creating a new secret...`);

      const namespace = this.k8sService.getDevWorkspaceNamespace();
      const newSecret = toDeviceAuthSecret(token, namespace);
      await this.k8sService.createNamespacedSecret(newSecret);

      this.logger.info(`Github Service: device-authentication secret was created successfully!`);
      return;
    }

    const deviceAuthSecret = deviceAuthSecrets[0];
    this.logger.info(`Github Service: updating exsting device-authentication secret...`);

    const data = {
      token: base64Encode(`${token}`)
    };

    const updatedSecret = { ...deviceAuthSecret, data };
    const name = deviceAuthSecret.metadata?.name || `device-authentication-secret-${randomString(5).toLowerCase()}`;
    this.k8sService.replaceNamespacedSecret(name, updatedSecret);

    this.logger.info(`Github Service: device-authentication secret was updated successfully!`);
  }

  async removeDeviceAuthToken(): Promise<void> {
    this.logger.info(`Github Service: got request for removing a device-authentication secret`);
    const deviceAuthSecrets = await this.k8sService.getSecret(DEVICE_AUTHENTICATION_LABEL_SELECTOR);
    if (deviceAuthSecrets.length < 1) {
      this.logger.warn('Github Service: device-authentication secret not found');
      throw new Error('device-authentication secret not found');
    }

    for (const secret of deviceAuthSecrets) {
      this.logger.info(`Github Service: removing device-authentication secret with ${secret.metadata?.name} name...`);
      await this.k8sService.deleteNamespacedSecret(secret);
      this.logger.info(`Github Service: device-authentication secret with ${secret.metadata?.name} name was deleted successfully!`);
    }

    // another token should be used by the Github Service after removing the Device Authentication token
    this.iniitializeToken();
  }

  private async iniitializeToken(): Promise<void> {
    this.logger.info('Github Service: extracting token...');

    const deviceAuthToken = await this.getDeviceAuthToken();
    if (deviceAuthToken) {
      this.token = deviceAuthToken;
      this.logger.info('Github Service: Device Authentication token is used');
      return;
    }

    const gitCredentialTokens = await this.getGitCredentialTokens();
    if (gitCredentialTokens.length === 1) {
      this.token = gitCredentialTokens[0];
      this.logger.info('Github Service: git-credential token is used');
      return;
    }
    this.token = await this.getTokenFromSecret();
  }

  /* Extracts a token from the device-authentication secret */
  private async getDeviceAuthToken(): Promise<string | undefined> {
    const deviceAuthSecrets = await this.k8sService.getSecret(DEVICE_AUTHENTICATION_LABEL_SELECTOR);
    this.logger.info(`Github Service: found ${deviceAuthSecrets.length} device-authentication secrets`);
    if (deviceAuthSecrets.length > 0) {
      const decodedToken = base64Decode(deviceAuthSecrets[0].data!.token);
      return decodedToken;
    } else {
      return undefined;
    }
  }

  /* Extracts tokens from the .git-credentials/credentials file */
  private async getGitCredentialTokens(): Promise<Array<string>> {
    this.logger.info(`Github Service: looking for the github token in the ${GIT_CREDENTIALS_PATH} file...`);
    const tokens: string[] = [];
    if (!fs.existsSync(GIT_CREDENTIALS_PATH)) {
      this.logger.info(`Github Service: ${GIT_CREDENTIALS_PATH} file does not exist`);
      return tokens;
    }

    const credentialsFileContent = fs.readFileSync(GIT_CREDENTIALS_PATH).toString();
    const lines = credentialsFileContent.split('\n');
    for (const line of lines) {
      const token = line.substring(line.lastIndexOf(':') + 1, line.indexOf('@'));
      tokens.push(token);
    }
    this.logger.info(`Github Service: found ${tokens.length} tokens in the ${GIT_CREDENTIALS_PATH} file`);
    return tokens;
  }

  /* Extracts token from the git-credential secret */
  private async getTokenFromSecret(): Promise<string | undefined> {
    this.logger.info(`Github Service: looking for the corresponding git-credentials secret to get token...`);

    const gitCredentialSecrets = await this.k8sService.getSecret(GIT_CREDENTIALS_LABEL_SELECTOR);
    if (gitCredentialSecrets.length === 0) {
      this.logger.warn('Github Service: token is not found');
      return undefined;
    }

    const githubSecrets = gitCredentialSecrets.filter(secret => secret.metadata?.annotations?.[SCM_URL_ATTRIBUTE] === GITHUB_URL);
    this.logger.info(`Github Service: found ${githubSecrets.length} github secrets`);

    const credentials = githubSecrets.length > 0 ? githubSecrets[0].data!.credentials : gitCredentialSecrets[0].data!.credentials;
    const decodedCredentials = base64Decode(credentials);
    const decodedToken = decodedCredentials.substring(decodedCredentials.lastIndexOf(':') + 1, decodedCredentials.indexOf('@'));
    this.logger.info('Github Service: a token from the git-credential secret is used');

    return decodedToken;
  }
}

function toDeviceAuthSecret(token: string, namespace: string): k8s.V1Secret {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `device-authentication-secret-${randomString(5).toLowerCase()}`,
      namespace,
      labels: {
        'che.eclipse.org/device-authentication': 'true'
      }
    },
    type: 'Opaque',
    data: {
      token: base64Encode(`${token}`)
    },
  };
}
