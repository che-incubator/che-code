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


import { DevfileHandler } from './devfile-handler';
import { Endpoint } from './endpoint';
import { EndpointCategory } from './endpoint-category';
import { EndpointExposure } from './endpoint-exposure';
import {
  V1alpha2DevWorkspaceSpecTemplate, V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainerEndpoints
} from '@devfile/api';
import * as vscode from 'vscode';

/**
 * Handle endpoints retrieval for DevWorkspaces.
 * It filters all container endpoints and then check if there are some attributes to know if it's user or plug-ins side
 * @author Florent Benoit
 */
export class DevWorkspaceDevfileHandlerImpl implements DevfileHandler {
  async getEndpoints(): Promise<Array<Endpoint>> {
    const extension = vscode.extensions.getExtension('eclipse-che.api');
    if (!extension) {
      return [];
    }
    await extension.activate();
    const cheApi = extension?.exports;
    const devfileService = cheApi.getDevfileService();
    const devfile: V1alpha2DevWorkspaceSpecTemplate = await devfileService.get();
    const containerComponents =
      devfile?.components
        ?.filter(component => component.container)
        .map(
          component =>
          ({
            ...component.container,
            componentAttributes: component.attributes,
          })
        ) || [];

    const devfileEndpoints = containerComponents
      .map(container =>
        (container.endpoints || []).map(endpoint => ({
          ...endpoint,
          componentAttributes: container.componentAttributes,
        }))
      )
      .reduce((acc, val) => acc.concat(val), []);

    const endpoints = devfileEndpoints.map(exposedEndpoint => {
      let exposure: EndpointExposure;
      if (exposedEndpoint.exposure === V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainerEndpoints.ExposureEnum.Public) {
        exposure = EndpointExposure.FROM_DEVFILE_PUBLIC;
      } else if (exposedEndpoint.exposure === V1alpha2DevWorkspaceSpecTemplateComponentsItemsContainerEndpoints.ExposureEnum.Internal) {
        exposure = EndpointExposure.FROM_DEVFILE_PRIVATE;
      } else {
        exposure = EndpointExposure.FROM_DEVFILE_NONE;
      }

      // category ? is is part of eclipse che-theia
      let category;
      const isPartOfCheCode =
        (exposedEndpoint.componentAttributes as any)?.['app.kubernetes.io/part-of'] === 'che-code.eclipse.org';
      if (isPartOfCheCode) {
        category = EndpointCategory.PLUGINS;
      } else {
        category = EndpointCategory.USER;
      }
      return {
        name: exposedEndpoint.name,
        category,
        exposure,
        protocol: exposedEndpoint.protocol,
        url: (exposedEndpoint.attributes as any)?.['controller.devfile.io/endpoint-url'],
        targetPort: exposedEndpoint.targetPort,
      } as Endpoint;
    });

    // Add private JWT proxy ports
    const jwtProxyEnv: string[] = Object.keys(process.env).filter(key =>
      key.includes('_JWTPROXY_SERVICE_PORT_SERVER_')
    );
    jwtProxyEnv.forEach((key, index) => {
      const value = process.env[key]!.toLocaleLowerCase() || '';
      const port = parseInt(value);
      if (!isNaN(port)) {
        const endpoint: Endpoint = {
          name: `jwt-proxy-${index + 1}`,
          exposure: EndpointExposure.FROM_DEVFILE_PRIVATE,
          url: '',
          targetPort: port,
          protocol: 'tcp',
          type: 'jwt-proxy',
          category: EndpointCategory.PLUGINS,
        };
        endpoints.push(endpoint);
      }
    });

    return endpoints;
  }
}
