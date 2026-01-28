/**********************************************************************
 * Copyright (c) 2026 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

/* eslint-disable header/header */

//@ts-check

export const preset = 'ts-jest';
export const testEnvironment = 'node';
export const roots = ['<rootDir>/tests'];
export const globals = {
    'ts-jest': {
        tsconfig: '<rootDir>/tsconfig.jest.json'
    }
};
export const moduleNameMapper = {
    '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts'
};
