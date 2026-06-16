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

import * as https from 'https';
import * as k8s from '@kubernetes/client-node';
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

type TokenSource = 'device-auth' | 'git-credentials-file' | 'git-credential-secret';

interface TokenInfo {
  value: string;
  source: TokenSource;
}

@injectable()
export class GithubServiceImpl implements GithubService {
  private tokenInfo: TokenInfo | undefined;
  readonly whenReady: Promise<void>;

  constructor(
    @inject(Logger) private logger: Logger,
    @inject(K8SServiceImpl) private readonly k8sService: K8SServiceImpl
  ) {
    this.whenReady = this.initializeToken();
  }

  private checkToken(): void {
    if (!this.tokenInfo) {
      throw new Error('GitHub authentication token is not setup');
    }
  }

  async getToken(): Promise<string> {
    this.checkToken();
    return this.tokenInfo!.value;
  }

  async getUser(): Promise<GithubUser> {
    this.checkToken();
    const result = await this.fetchGithubUser(this.tokenInfo!.value);
    return result.user;
  }

  async getTokenScopes(token: string): Promise<string[]> {
    this.checkToken();
    const result = await this.fetchGithubUser(token);
    return result.scopes;
  }

  async isDeviceAuthToken(): Promise<boolean> {
    return this.tokenInfo?.source === 'device-auth';
  }

  private async fetchGithubUser(token: string): Promise<{ user: GithubUser; scopes: string[] }> {
    try {
      this.logger.info('Github Service: fetching GitHub user using fetch...');
      const result = await this.fetchGithubUserWithFetch(token);
      this.logger.info('Github Service: successfully fetched GitHub user using fetch');
      
      return result;
    } catch (fetchError: any) {
      if (fetchError.httpStatus) {
        this.logger.warn(`Github Service: fetch failed with HTTP ${fetchError.httpStatus}: ${fetchError.message}`);
        throw fetchError;
      }
      this.logger.warn(`Github Service: fetch failed: ${fetchError.message}${fetchError.cause ? ` (cause: ${fetchError.cause.message})` : ''}`);
      try {
        this.logger.info('Github Service: falling back to https module...');
        const result = await this.fetchGithubUserWithHttps(token);
        this.logger.info('Github Service: successfully fetched GitHub user using https fallback');
        
        return result;
      } catch (httpsError: any) {
        this.logger.error(`Github Service: https fallback also failed: ${httpsError.message}`);
        throw httpsError;
      }
    }
  }

  private async fetchGithubUserWithFetch(token: string): Promise<{ user: GithubUser; scopes: string[] }> {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const message = await response.text();
      const err: any = new Error(`GitHub user request failed: ${response.status} ${response.statusText} - ${message}`);
      err.httpStatus = response.status;
      throw err;
    }
    const user = await response.json() as GithubUser;
    const scopesHeader = response.headers.get('x-oauth-scopes') ?? '';
    const scopes = scopesHeader
      .split(', ')
      .map(scope => scope.trim())
      .filter(scope => scope.length > 0);
    return { user, scopes };
  }

  private fetchGithubUserWithHttps(token: string): Promise<{ user: GithubUser; scopes: string[] }> {
    return new Promise((resolve, reject) => {
      const req = https.request('https://api.github.com/user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'che-code',
          'Accept': 'application/json',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub user request failed: ${res.statusCode} ${res.statusMessage} - ${body}`));
            return;
          }
          try {
            const user = JSON.parse(body) as GithubUser;
            const scopesHeader = res.headers['x-oauth-scopes'] ?? '';
            const scopes = (Array.isArray(scopesHeader) ? scopesHeader[0] : scopesHeader)
              .split(', ')
              .map(scope => scope.trim())
              .filter(scope => scope.length > 0);
            resolve({ user, scopes });
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      });
      req.setTimeout(60_000, () => {
        req.destroy(new Error('GitHub user request timed out after 60000ms'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  async persistDeviceAuthToken(token: string): Promise<void> {
    this.tokenInfo = { value: token, source: 'device-auth' };

    this.persistDeviceAuthTokenToK8s(token).catch(err =>
      this.logger.error(`Github Service: failed to persist device auth token to K8s: ${err.message}`)
    );
  }

  private async persistDeviceAuthTokenToK8s(token: string): Promise<void> {
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
    await this.k8sService.replaceNamespacedSecret(name, updatedSecret);

    this.logger.info(`Github Service: device-authentication secret was updated successfully!`);
  }

  async removeDeviceAuthToken(): Promise<void> {
    this.logger.info(`Github Service: got request for removing a device-authentication secret`);

    const deviceAuthSecrets = await this.k8sService.getSecret(DEVICE_AUTHENTICATION_LABEL_SELECTOR);
    if (deviceAuthSecrets.length < 1) {
      this.logger.warn('Github Service: device-authentication secret not found');
      throw new Error('device-authentication secret not found');
    }

    await this.deleteDeviceAuthSecrets(deviceAuthSecrets);

    // another token should be used by the Github Service after removing the Device Authentication token
    this.initializeToken();
  }

  private async deleteDeviceAuthSecrets(secrets?: k8s.V1Secret[]): Promise<void> {
    const toDelete = secrets ?? await this.k8sService.getSecret(DEVICE_AUTHENTICATION_LABEL_SELECTOR);
    for (const secret of toDelete) {
      this.logger.info(`Github Service: removing device-authentication secret with ${secret.metadata?.name} name...`);
      await this.k8sService.deleteNamespacedSecret(secret);
      this.logger.info(`Github Service: device-authentication secret with ${secret.metadata?.name} name was deleted successfully!`);
    }
  }

  /**
   * Legacy device-auth tokens were created with only 'user:email' scope by the old flow.
   * They should be removed so the PAT (if available) can be used instead.
   */
  private async isLegacyDeviceAuthToken(token: string): Promise<boolean> {
    try {
      const { scopes } = await this.fetchGithubUser(token);
      return scopes.length === 1 && scopes[0] === 'user:email';
    } catch {
      return false;
    }
  }

  private async initializeToken(): Promise<void> {
    this.logger.info('Github Service: extracting token...');

    const deviceAuthToken = await this.getDeviceAuthToken();
    if (deviceAuthToken) {
      if (await this.isLegacyDeviceAuthToken(deviceAuthToken)) {
        this.logger.info('Github Service: legacy device-auth token detected (user:email only), removing and falling through to PAT');
        await this.deleteDeviceAuthSecrets();
      } else {
        this.tokenInfo = { value: deviceAuthToken, source: 'device-auth' };
        this.logger.info('Github Service: Device Authentication token is used');
        return;
      }
    }

    const gitCredentialTokens = await this.getGitCredentialTokens();
    if (gitCredentialTokens.length === 1) {
      this.tokenInfo = { value: gitCredentialTokens[0], source: 'git-credentials-file' };
      this.logger.info('Github Service: git-credential token is used');
      return;
    }

    const secretToken = await this.getTokenFromSecret();
    if (secretToken) {
      this.tokenInfo = { value: secretToken, source: 'git-credential-secret' };
    } else {
      this.tokenInfo = undefined;
    }
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
