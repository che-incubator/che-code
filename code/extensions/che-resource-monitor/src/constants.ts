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

export const SHOW_RESOURCES_INFORMATION_COMMAND = 'resources-monitor-show-resources-information';

export const SHOW_WARNING_MESSAGE_COMMAND = 'resources-monitor-show-warning-message';

export enum Units {
  None = 1,
  K = 1000,
  M = 1000 * 1000,
  G = 1000 * 1000 * 1000,
  KI = 1024,
  MI = 1024 * 1024,
  GI = 1024 * 1024 * 1024,
}
