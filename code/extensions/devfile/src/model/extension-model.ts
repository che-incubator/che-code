/* eslint-disable @typescript-eslint/naming-convention */
/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

export const DevfileExtension = Symbol('DevfileExtension');
export interface DevfileExtension {
}

export const NewContainer = Symbol('NewContainer');
export interface NewContainer {
    /**
     * Returns true if a container was created successfully
     */
    run(): Promise<boolean>;

    /**
     * If the devfile does not have a component container, proposes the user to create it
     */
    ensureAtLeastOneContainerExist(): Promise<boolean>;
}

export const NewEndpoint = Symbol('NewEndpoint');
export interface NewEndpoint {
    /**
     * Returns true if an endpoint was created successfully
     */
    run(): Promise<boolean>;
}

export const NewEnvironmentVariable = Symbol('NewEnvironmentVariable');
export interface NewEnvironmentVariable {
    /**
     * Returns true if the environment variable was created successfully
     */
    run(): Promise<boolean>;
}

export const NewCommand = Symbol('NewCommand');
export interface NewCommand {
    /**
     * Returns true if a command was created successfully
     */
    run(): Promise<boolean>;
}

export const SaveDevfile = Symbol('SaveDevfile');
export interface SaveDevfile {
    onDidDevfileUpdate(message?: string): Promise<void>;
}
