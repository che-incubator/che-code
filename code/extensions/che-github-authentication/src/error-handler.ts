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
  V1alpha2DevWorkspaceSpecTemplate
} from '@devfile/api';
import * as k8s from '@kubernetes/client-node';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as vscode from 'vscode';
import { K8sHelper, createLabelsSelector, filterCheSecrets, getDevfileAnnotation } from './k8s-helper';

const GIT_CREDENTIAL_LABEL = {
  'controller.devfile.io/git-credential': 'true'
};

const GIT_CREDENTIALS_PATH: string = path.resolve('/.git-credentials', 'credentials');
const GIT_CREDENTIALS_LABEL_SELECTOR: string = createLabelsSelector(GIT_CREDENTIAL_LABEL);

const TOKEN_EXPIRED_MESSAGE = `The GitHub token included in the workspace file ${GIT_CREDENTIALS_PATH} has expired`;
const TOKEN_ABSENT_MESSAGE = `A valid GitHub token stored in file ${GIT_CREDENTIALS_PATH} is required for this feature to work`;

const OPEN_CHE_DOCS_LABEL = 'Open Eclipse Che documentation';
const OPEN_DEVWOKSPACE_OPERATOR_DOCS_LABEL = 'Open DevWorkspace Operator documentation';

const CHE_DOCS_REFERENCE = 'https://www.eclipse.org/che/docs/stable/end-user-guide/using-a-git-provider-access-token/';
const DEVWORKSPACE_OPERATOR_DOCS_REFERENCE = 'https://github.com/devfile/devworkspace-operator/blob/main/docs/additional-configuration.adoc#adding-git-credentials-to-a-workspace';


@injectable()
export class ErrorHandler {
  
  @inject(K8sHelper)
  private k8sHelper!: K8sHelper;

  @inject(Symbol.for('DevfileServiceInstance'))
  private readonly devfileService!: {
    get(): Promise<V1alpha2DevWorkspaceSpecTemplate>
  }

  async onUnauthorizedError(): Promise<void> {
    const gitCredentialSecrets = await this.k8sHelper.getSecret(GIT_CREDENTIALS_LABEL_SELECTOR);
    return gitCredentialSecrets.length > 0 ? this.onTokenExpired(gitCredentialSecrets) : this.onTokenAbsent();
  }

  // the token is present, but is expired
  private async onTokenExpired(gitCredentialSecrets: Array<k8s.V1Secret>): Promise<void> {
    const cheSecrets = filterCheSecrets(gitCredentialSecrets);
    if (cheSecrets.length > 0) {
      this.onCheControlledTokenExpired();
    } else {
      let message;
      if (gitCredentialSecrets.length === 1 && gitCredentialSecrets[0].metadata?.name) {
        message = `${TOKEN_EXPIRED_MESSAGE}. The expired token is stored in the secret ${gitCredentialSecrets[0].metadata?.name} and needs to be updated with a new one.`;
      } else {
        message = `${TOKEN_EXPIRED_MESSAGE}. The expired token is stored in a secret and needs to be updated with a new one.`;
      }
      vscode.window.showWarningMessage(message);
    }
  }

  // the token is managed by Che, it's present, but is expired
  private async onCheControlledTokenExpired(): Promise<void> {
    if (await this.isWorkspaceRestartingRequired()) {
      const message = `${TOKEN_EXPIRED_MESSAGE}. Restarting the workspace from Dashboard will automatically update the file with a new GitHub token`;
      const selected = await vscode.window.showWarningMessage(message, 'Open Dasboard');
      if (selected) {
        vscode.commands.executeCommand('che-remote.command.openDashboard');
      }
    } else {
      const message = `${TOKEN_EXPIRED_MESSAGE}. Please reference to the Eclipse Che documentation article to learn how to automatically include one in your workspaces.`;
      this.suggestOpenDocumentation(message, OPEN_CHE_DOCS_LABEL, CHE_DOCS_REFERENCE);
    }
  }

  // the token is not present
  private async onTokenAbsent(): Promise<void> {
    const isWorkspaceManagedByChe = await this.isWorkspaceManagedByChe();
    if (isWorkspaceManagedByChe) {
      const message = `${TOKEN_ABSENT_MESSAGE}. Please reference to the Eclipse Che documentation article to learn how to automatically include one in your workspaces.`;
      this.suggestOpenDocumentation(message, OPEN_CHE_DOCS_LABEL, CHE_DOCS_REFERENCE);
    } else {
      const message = `${TOKEN_ABSENT_MESSAGE}. Please reference to the DevWorkspace Operator documentation article to learn how to create a secret to automatically include one in your workspaces.`;
      this.suggestOpenDocumentation(message, OPEN_DEVWOKSPACE_OPERATOR_DOCS_LABEL, DEVWORKSPACE_OPERATOR_DOCS_REFERENCE);
    }
  }

  private async isWorkspaceRestartingRequired(): Promise<boolean> {
    const devfile = await this.devfileService.get();
    const projects = devfile.projects;
    if (!projects) {
      return false;
    }

    const gitProjects = projects.filter(project => {
      return project.git ? true : false;
    });
    return gitProjects.length > 0;
  }

  private async isWorkspaceManagedByChe(): Promise<Boolean> {
    const devWorkspace = await this.k8sHelper.getDevWorkspace();
    const devfileAnnotation = getDevfileAnnotation(devWorkspace.metadata?.annotations);
    return devfileAnnotation ? true : false; 
  }

  private async suggestOpenDocumentation(message: string, buttonLabel: string, docsReference: string): Promise<void> {
    const selected = await vscode.window.showWarningMessage(message, buttonLabel);
    if (selected) {
      vscode.commands.executeCommand(
        'vscode.open',
        docsReference
      );
    }
  }
}
