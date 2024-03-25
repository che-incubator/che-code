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
    // const href = `./oss-dev/static/product.json`;
    console.log(`>> TRY TO GET product.json from ${href}`);

	try {
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", href, false);
		xmlhttp.send();

        console.log(`> status ${xmlhttp.status}`);
        console.log(`> readyState ${xmlhttp.readyState}`);

		if (xmlhttp.status == 200 && xmlhttp.readyState == 4) {
			const content = xmlhttp.responseText;
			console.log('>>>> GOT product.json');
			console.log(content);

			const json = JSON.parse(content);
			if (json && json.licenseFileName) {
				console.log(`>> got license file name ${json.licenseFileName}`)
			} else {
				console.log('>> something wrong with product.json');
			}

            return json;
		}
		else {
			// TODO Throw exception
			console.log('>>>> FAILURE getting product.json');
			console.log(`http status: ${xmlhttp.status}`);
			console.log(`http readyState: ${xmlhttp.readyState}`);
		}

	} catch (err) {
		console.error(`>>>> ERROR ${err.message}`, err);
	}

    throw new Error(`Unable to load product.json from ${href}.`);
}
