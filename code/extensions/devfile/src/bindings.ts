/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import { Container } from 'inversify';
import { NewCommandImpl } from './command/new-command';
import { NewContainerImpl } from './command/new-container';
import { SaveDevfileImpl } from './command/save-devfile';
import { DevfileExtensionImpl } from './devfile-extension';
import { DevfileService } from './devfile/devfile-service';
import { DevfileExtension, NewCommand, NewContainer, NewEndpoint, NewEnvironmentVariable, SaveDevfile } from './model/extension-model';
import { NewEndpointImpl } from './command/new-endpoint';
import { NewEnvironmentVariableImpl } from './command/new-environment-variable';
import { InstallYaml } from './command/install-yaml';

export function initBindings(): Container {
    const container = new Container();

    container.bind(DevfileExtensionImpl).toSelf().inSingletonScope();
    container.bind(DevfileExtension).toService(DevfileExtensionImpl);

    container.bind(DevfileService).toSelf().inSingletonScope();

    container.bind(NewCommandImpl).toSelf().inSingletonScope();
    container.bind(NewCommand).toService(NewCommandImpl);

    container.bind(SaveDevfileImpl).toSelf().inSingletonScope();
    container.bind(SaveDevfile).toService(SaveDevfileImpl);

    container.bind(NewContainerImpl).toSelf().inSingletonScope();
    container.bind(NewContainer).toService(NewContainerImpl);

    container.bind(NewEndpointImpl).toSelf().inSingletonScope();
    container.bind(NewEndpoint).toService(NewEndpointImpl);

    container.bind(NewEnvironmentVariableImpl).toSelf().inSingletonScope();
    container.bind(NewEnvironmentVariable).toService(NewEnvironmentVariableImpl);

    container.bind(InstallYaml).toSelf().inSingletonScope();

    return container;
}
