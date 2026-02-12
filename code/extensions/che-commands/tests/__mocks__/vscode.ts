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

export class EventEmitter<T> {
	private listeners: Array<(e: T) => any> = [];

	event = (listener: (e: T) => any) => {
		this.listeners.push(listener);
		return { dispose: () => {} };
	};

	fire(data: T) {
		for (const l of this.listeners) l(data);
	}

	dispose() {
		this.listeners = [];
	}
}

export class CustomExecution {
	constructor(public callback: any) {}
}

export class Task {
	constructor(
		public definition: any,
		public scope: any,
		public name: string,
		public source: string,
		public execution: any,
		public problemMatchers?: any[],
	) {}
}

export const TaskScope = {
	Workspace: 1,
};

export const window = {
	createOutputChannel: () => ({
		appendLine: () => {},
		append: () => {},
		show: () => {},
	}),
};
