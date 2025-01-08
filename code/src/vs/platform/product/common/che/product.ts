/**********************************************************************
 * Copyright (c) 2024-2025 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { FileAccess } from '../../../../base/common/network.js';
import { IProductConfiguration } from '../../../../base/common/product.js';

export function loadFromFileSystem(): IProductConfiguration {
	const href = FileAccess.asBrowserUri('vs/../../product.json').toString(true);
	try {
		const xmlhttp = new XMLHttpRequest();
		xmlhttp.open('GET', href, false);
		xmlhttp.send();

		if (xmlhttp.status === 200 && xmlhttp.readyState === 4) {
			return JSON.parse(xmlhttp.responseText);
		}

		console.log(`Request failed with status: ${xmlhttp.status}, readyState: ${xmlhttp.readyState}`);
	} catch (err) {
		console.error(err);
	}

	throw new Error(`Unable to load product.json from ${href}.`);
}
