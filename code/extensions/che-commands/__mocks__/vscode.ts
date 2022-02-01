/* eslint-disable header/header */
/*
 * Copyright (c) 2022 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const vscode: any = {};
export class EventEmitter {
  constructor() { }
  fire() { }
}

export enum TreeItemCollapsibleState {
  None,
  Collapsed,
  Expanded,
}

vscode.extensions = {};
const extensionsExports = {};

vscode.extensions.setExtensionExport = (name: string, value: any): void => {
  (extensionsExports as any)[name] = value;
};

vscode.extensions.getExtension = (name: string): any => {
  return {
    activate: jest.fn(),
    exports: (extensionsExports as any)[name],
  };
};


vscode.EventEmitter = EventEmitter;
vscode.TreeItemCollapsibleState = TreeItemCollapsibleState;
module.exports = vscode;
