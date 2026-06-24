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

import { V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv } from "@devfile/api";

export class EnvUtils {
	public static buildExportStatements(
		env?: Array<V1alpha2DevWorkspaceSpecTemplateCommandsItemsExecEnv>,
	): string {
		if (!env?.length) {
			return "";
		}

		let initialVariables = "";

		for (const e of env) {
			let value = e.value.replaceAll('"', '\\"');
			initialVariables += `export ${e.name}="${value}"; `;
		}

		return initialVariables;
	}
}
