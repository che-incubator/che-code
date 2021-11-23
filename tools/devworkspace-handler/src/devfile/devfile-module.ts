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

import { CheCodeDescriptionComponentFinder } from './che-code-description-component-finder';
import { CheCodeDescriptionComponentRemoval } from './che-code-description-component-removal';
import { CheCodeDevfileExtract } from './che-code-devfile-extract';
import { CheCodeDevfileResolverImpl } from './che-code-devfile-resolver-impl';
import { DevContainerComponentFinder } from './dev-container-component-finder';
import { DevContainerComponentInserter } from './dev-container-component-inserter';
import { DevContainerComponentUpdater } from './dev-container-component-updater';

const devfileModule = new ContainerModule((bind: interfaces.Bind) => {
  bind(CheCodeDescriptionComponentFinder).toSelf().inSingletonScope();
  bind(CheCodeDescriptionComponentRemoval).toSelf().inSingletonScope();
  bind(CheCodeDevfileResolver).to(CheCodeDevfileResolverImpl).inSingletonScope();
  bind(DevContainerComponentFinder).toSelf().inSingletonScope();
  bind(DevContainerComponentInserter).toSelf().inSingletonScope();
  bind(DevContainerComponentUpdater).toSelf().inSingletonScope();
  bind(CheCodeDevfileExtract).toSelf().inSingletonScope();
});

export { devfileModule };
