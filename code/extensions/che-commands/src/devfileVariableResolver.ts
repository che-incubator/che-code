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

export interface VariableContext {
	[key: string]: string;
}

export class DevfileVariableResolver {
	private static readonly BRACED_VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

	public resolve(
		value: string | undefined,
		context: VariableContext = {},
	): string {
		if (!value) {
			return "";
		}

		let resolved = value;

		const maxIterations = Object.keys(context).length || 1;
		for (let i = 0; i < maxIterations; i++) {
			let changed = false;

			resolved = resolved.replace(
				DevfileVariableResolver.BRACED_VARIABLE_PATTERN,
				(match, variableName) => {
					const replacement = context[variableName];

					if (replacement === undefined || replacement === match) {
						return match;
					}

					changed = true;
					return replacement;
				},
			);

			if (!changed) {
				break;
			}
		}

		return resolved;
	}

	public resolveObject<T>(value: T, context: VariableContext = {}): T {
		if (value === null || value === undefined) {
			return value;
		}

		if (typeof value === "string") {
			return this.resolve(value, context) as T;
		}

		if (Array.isArray(value)) {
			return value.map((v) => this.resolveObject(v, context)) as T;
		}

		if (typeof value === "object") {
			const result: Record<string, unknown> = {};

			for (const [key, val] of Object.entries(value)) {
				result[key] = this.resolveObject(val, context);
			}

			return result as T;
		}

		return value;
	}
}
