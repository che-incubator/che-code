/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from 'vs/base/common/process';
import { IProductConfiguration } from 'vs/base/common/product';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';

/**
 * @deprecated You MUST use `IProductService` if possible.
 */
let product: IProductConfiguration;

// Native sandbox environment
const vscodeGlobal = (globalThis as any).vscode;
if (typeof vscodeGlobal !== 'undefined' && typeof vscodeGlobal.context !== 'undefined') {
	const configuration: ISandboxConfiguration | undefined = vscodeGlobal.context.configuration();
	if (configuration) {
		product = configuration.product;
	} else {
		throw new Error('Sandbox: unable to resolve product configuration from preload script.');
	}
}
// _VSCODE environment
else if (globalThis._VSCODE_PRODUCT_JSON && globalThis._VSCODE_PACKAGE_JSON) {
	// Obtain values from product.json and package.json-data
	product = globalThis._VSCODE_PRODUCT_JSON as unknown as IProductConfiguration;

	// Running out of sources
	if (env['VSCODE_DEV']) {
		Object.assign(product, {
			nameShort: `${product.nameShort} Dev`,
			nameLong: `${product.nameLong} Dev`,
			dataFolderName: `${product.dataFolderName}-dev`,
			serverDataFolderName: product.serverDataFolderName ? `${product.serverDataFolderName}-dev` : undefined
		});
	}

	// Version is added during built time, but we still
	// want to have it running out of sources so we
	// read it from package.json only when we need it.
	if (!product.version) {
		const pkg = globalThis._VSCODE_PACKAGE_JSON as { version: string };

		Object.assign(product, {
			version: pkg.version
		});
	}
}

// Web environment or unknown
else {

	// Built time configuration (do NOT modify)
	product = { /*BUILD->INSERT_PRODUCT_CONFIGURATION*/ } as IProductConfiguration;

	// need to add something here
	try {
		const href = `${window.location.href}oss-dev/static/product.json`;
		console.log(`>> TRY TO GET product.json from ${href}`);

		var xmlhttp = new XMLHttpRequest();
		xmlhttp.open("GET", href, false);
		xmlhttp.send();
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

	// Running out of sources
	if (Object.keys(product).length === 0) {
		Object.assign(product, {
			version: '1.87.0-dev',
			nameShort: 'Code - OSS Dev',
			nameLong: 'Code - OSS Dev',
			applicationName: 'code-oss',
			dataFolderName: '.vscode-oss',
			urlProtocol: 'code-oss',
			reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new',
			licenseName: 'MIT',
			licenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			serverLicenseUrl: 'https://github.com/microsoft/vscode/blob/main/LICENSE.txt',
			extensionsGallery: {
				serviceUrl: 'https://open-vsx.org/vscode/gallery',
				itemUrl: 'https://open-vsx.org/vscode/item',
			},
		});
	}
}

/**
 * @deprecated You MUST use `IProductService` if possible.
 */
export default product;
