/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
import 'reflect-metadata';

import { Container } from 'inversify';
import { devfileModule } from '../devfile/devfile-module';
import { k8sModule } from '../k8s/k8s-module';

/**
 * Manage all bindings for inversify
 */
export class InversifyBinding {
  private container: Container;

  public async initBindings(options: InversifyBindingOptions): Promise<Container> {
    this.container = new Container();
    this.container
      .bind('boolean')
      .toConstantValue(options.insertDevWorkspaceTemplatesAsPlugin)
      .whenTargetNamed('INSERT_DEV_WORKSPACE_TEMPLATE_AS_PLUGIN');

    this.container.load(devfileModule);
    this.container.load(k8sModule);
    return this.container;
  }
}

/**
 * Options for inversify bindings
 */
export interface InversifyBindingOptions {
  // insert the devWorkspaceTemplate as a plugin of the devWorkspace
  insertDevWorkspaceTemplatesAsPlugin: boolean;
}
