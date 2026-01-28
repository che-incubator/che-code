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

export class MockTerminalAPI {
  public calls: Array<{ component?: string; command: string; cwd: string }> = [];

  async getMachineExecPTY(component: string | undefined, command: string, cwd: string) {
    this.calls.push({ component, command, cwd });
    return {
      open: () => {},
      close: () => {},
      onDidWrite: () => {},
      onDidClose: () => {},
      handleInput: () => {}
    };
  }
}


class MockDevfileService {
	constructor(private devfile: any) {}
	async get() {
		return this.devfile;
	}
}

export class MockCheAPI {
	constructor(private devfile: any) {}
	getDevfileService() {
		return new MockDevfileService(this.devfile);
	}
}
