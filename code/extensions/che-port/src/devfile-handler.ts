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

import { Endpoint } from './endpoint';

export interface CommandPreviewUrl {
  port: number;
  path?: string;
}

export interface DevfileHandler {
  getEndpoints(): Promise<Array<Endpoint>>;
}
