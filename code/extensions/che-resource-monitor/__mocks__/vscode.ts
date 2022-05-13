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
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mock of vscode module
 */
const vscode: any = {};
vscode.ExtensionContext = {};
vscode.commands = {};
vscode.commands.registerCommand = jest.fn();
vscode.StatusBarAlignment = {};
vscode.StatusBarAlignment.Left = 1;
vscode.StatusBarItem = {};
vscode.StatusBarItem.color = '';
vscode.window = {};
vscode.extensions = {};
vscode.extensions.getExtension = jest.fn();
vscode.window.createStatusBarItem = jest.fn();
vscode.window.showQuickPick = jest.fn();
vscode.window.showWarningMessage = jest.fn();
module.exports = vscode;
