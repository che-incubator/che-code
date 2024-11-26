/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { localize } from '../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { TerminalMenuBarGroup } from '../terminalMenus.js';

// see enum ContextMenuGroup in the terminalMenus
const CONTEXT_MENU_GROUP_CREATE = '1_create';
const NEW_TERMINAL_IN_CONTAINER_COMMAND_ID = 'che-terminal.new';
const NEW_TERMINAL_IN_CONTAINER_TITLE = localize('newTerminal.selectContainer.title', 'New Terminal (Select a Container)');

export function setupCheTerminalMenus(): void {
  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.MenubarTerminalMenu,
        item: {
          group: TerminalMenuBarGroup.Create,
          command: {
            id: NEW_TERMINAL_IN_CONTAINER_COMMAND_ID,
            title: NEW_TERMINAL_IN_CONTAINER_TITLE
          },
          order: 1.5
        }
      }
    ]
  );

  MenuRegistry.appendMenuItems(
    [
      {
        id: MenuId.TerminalInstanceContext,
        item: {
          command: {
            id: NEW_TERMINAL_IN_CONTAINER_COMMAND_ID,
            title: NEW_TERMINAL_IN_CONTAINER_TITLE
          },
          group: CONTEXT_MENU_GROUP_CREATE
        }
      }
    ]
  );
}
