/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as fs from './fs-extra.js';
import { env } from 'process';
import * as jsYaml from 'js-yaml';

export interface Devfile {
  projects?: Project[];
  dependentProjects?: Project[];
  starterProjects?: Project[];
  components: Component[];
}

export interface Project {
  name: string;
  git: Git;
}

export interface Git {
  remotes: Remotes;
}

export interface Remotes {
  url: string;
}

export interface Component {
  attributes: KeyValue;
  container: Container;
}

export interface KeyValue {
  [key: string]: string;
}

export interface Container {
  endpoints: Endpoint[];
}

export interface Endpoint {
  name: string;
  attributes: KeyValue;
}

export class FlattenedDevfile {
  private devfile: Devfile;

  async getDevfile(): Promise<Devfile> {
    if (!env.DEVWORKSPACE_FLATTENED_DEVFILE) {
      throw new Error('  > Unable to find flattened devworkspace file, env.DEVWORKSPACE_FLATTENED_DEVFILE is not set');
    }

    if (!this.devfile) {
      const content = await fs.readFile(env.DEVWORKSPACE_FLATTENED_DEVFILE);
      this.devfile = jsYaml.load(content) as Devfile;
    }

    return this.devfile;
  }

  async getCheCodeEndpoint(): Promise<string> {
    const devfile = await this.getDevfile();
    const cheCodeEndpointURI = devfile.components
      .find(
        (component) =>
          component.attributes && 'che-code-runtime' === component.attributes['app.kubernetes.io/component']
      )
      ?.container.endpoints.find((e) => 'che-code' === e.name)?.attributes['controller.devfile.io/endpoint-url'];

    if (!cheCodeEndpointURI) {
      throw new Error(`Failure to find che-code endpoint in ${env.DEVWORKSPACE_FLATTENED_DEVFILE}`);
    }

    return cheCodeEndpointURI;
  }
}
