/**********************************************************************
 * Copyright (c) 2023 Red Hat, Inc.
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

    // const href = `${window.location.href}oss-dev/static/product.json`;
    const href = `./oss-dev/static/product.json`;
    console.log(`>> Load product.json from ${href}`);

	try {
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", href, false);
		xmlhttp.send();

		if (xmlhttp.status == 200 && xmlhttp.readyState == 4) {
			return JSON.parse(xmlhttp.responseText);
		}
		else {
			// TODO Throw exception
			console.log(`Request to get product.json failed. HTTP status: ${xmlhttp.status}, readyState: ${xmlhttp.readyState}`);
		}
	} catch (err) {
		console.error(err);
	}

    throw new Error(`Unable to load product.json from ${href}.`);
}
