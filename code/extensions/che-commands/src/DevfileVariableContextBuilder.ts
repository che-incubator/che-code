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

import { VariableContext } from "./devfileVariableResolver";

export class DevfileVariableContextBuilder {
	public static build(
		devfile: any,
		command?: any,
		component?: any,
	): VariableContext {
		const context: VariableContext = {};

		// Devfile variables
		for (const [key, value] of Object.entries(
			devfile?.variables ?? {},
		)) {
			context[key] = String(value);
		}

		// Component env overrides devfile variables
		for (const env of component?.container?.env ?? []) {
			context[env.name] = String(env.value);
		}

		// Command env overrides component env
		for (const env of command?.exec?.env ?? []) {
			context[env.name] = String(env.value);
		}

		// Resolve nested variables
		const maxIterations = Object.keys(context).length || 1;

		for (let i = 0; i < maxIterations; i++) {
			let changed = false;

			for (const [key, value] of Object.entries(context)) {
				const resolved = value.replace(
					/\$\{([^}]+)\}/g,
					(match, variableName) => context[variableName] ?? match,
				);

				if (resolved !== value) {
					context[key] = resolved;
					changed = true;
				}
			}

			if (!changed) {
				break;
			}
		}

		return context;
	}
}
