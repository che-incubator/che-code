/**********************************************************************
 * Copyright (c) 2024 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/
/* eslint-disable header/header */

import { IProductConfiguration } from 'vs/base/common/product';

export function loadFromFileSystem(): IProductConfiguration {
	const href = `./oss-dev/static/product.json`;

	try {
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", href, false);
		xmlhttp.send();

		if (xmlhttp.status == 200 && xmlhttp.readyState == 4) {
			return JSON.parse(xmlhttp.responseText);
		}

		console.log(`Request failed with status: ${xmlhttp.status}, readyState: ${xmlhttp.readyState}`);
	} catch (err) {
		console.error(err);
	}

	throw new Error(`Unable to load product.json from ${href}.`);
}

export function putToFileSystem(): void {
	const href = `./oss-dev/static/product-new.json`;

	try {
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("PUT", href, false);
		xmlhttp.send("test content");

		console.log('PUT status: ' + xmlhttp.status);

		if (xmlhttp.status == 200 && xmlhttp.readyState == 4) {
			// return JSON.parse(xmlhttp.responseText);
			console.log(`>>>>> THE REQUEST is DONE with message ${xmlhttp.responseText}`);
			return;
		}

		console.log(`Request failed with status: ${xmlhttp.status}, readyState: ${xmlhttp.readyState}`);
	} catch (err) {
		console.error(err);
	}

	throw new Error(`Unable to PUT product-new.json to ${href}.`);
}
