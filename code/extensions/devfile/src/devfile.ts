/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

export interface Devfile {
    schemaVersion?: string;
    metadata?: Metadata;
    components?: Component[];
    commands?: Command[];
}

export interface Metadata {
    name?: string;
}

export interface Component {
    name: string;
    container?: ComponentContainer;
}

export interface ComponentContainer {
    image: string;
    memoryRequest?: string;
    memoryLimit?: string;
    cpuRequest?: string;
    cpuLimit?: string;
    mountSources?: boolean;
    endpoints?: Endpoint[];
    env?: EnvironmentVariable[];
}

export interface Endpoint {
    name: string;
    targetPort: number;
    exposure?: 'public' | 'internal' | 'none';
}

export interface EnvironmentVariable {
    name: string;
    value: string;
}

export interface Command {
    id: string;
    exec: CommandExec;
}

export interface CommandExec {
    component: string;
    commandLine: string;
    workingDir: string;
    label: string;
}
