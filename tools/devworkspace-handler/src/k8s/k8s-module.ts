/**********************************************************************
 * Copyright (c) 2021 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
import { ContainerModule, interfaces } from 'inversify';
import { CheCodeDevfileResolver } from '../api/che-code-devfile-resolver';
import { K8SUnits } from './k8s-units';

const k8sModule = new ContainerModule((bind: interfaces.Bind) => {
  bind(K8SUnits).toSelf().inSingletonScope();
});

export { k8sModule };
