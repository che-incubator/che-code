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

import { injectable } from 'inversify';
import * as vscode from 'vscode';

export const CHANNEL_NAME = 'Che GitHub Authentication';

@injectable()
export class Logger {
  private outputChannel: vscode.LogOutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(CHANNEL_NAME, { log: true });
  }

  info(message: string): void {
    this.outputChannel.info(message);
  }

  warn(message: string): void {
    this.outputChannel.warn(message);
  }

  error(message: string): void {
    this.outputChannel.error(message);
  }

  trace(message: string): void {
    this.outputChannel.trace(message);
  }
}
