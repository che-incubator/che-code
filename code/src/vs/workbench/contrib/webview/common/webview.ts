/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';

export interface WebviewRemoteInfo {
	readonly isRemote: boolean;
	readonly authority: string | undefined;
	readonly path?: string;
}

/**
 * Root from which resources in webviews are loaded.
 *
 * This is hardcoded because we never expect to actually hit it. Instead these requests
 * should always go to a service worker.
 */

function getSelfURI(): URI {
	try {
		if (self && self.location) {
			return URI.parse(self.location.toString());
		}
	} catch (err) {
		console.error('< skip getting URI from .self, fallback to localhost');
	}

	// fallback to localhost
	return URI.parse('https://localhost/');
}

const selfURI = getSelfURI();
console.log(`>> SELF URI ${selfURI.toString()}`);

// possible values
// >> SELF URI https://devspaces.apps.sandbox-m3.1530.p1.openshiftapps.com/workspacea98cfe74063046a6/tools/3100/
// >> SELF URI https://devspaces.apps.sandbox-m3.1530.p1.openshiftapps.com/workspacea98cfe74063046a6/tools/3100/oss-dev/static/out/vs/base/worker/workerMain.js
export let webviewResourceBaseHost = selfURI.authority;

export const webviewRootResourceAuthority = `vscode-resource.${webviewResourceBaseHost}`;

export const webviewGenericCspSource = `'self' https://*.${webviewResourceBaseHost}`;

function webviewLocalResources(): boolean {
	return true;
}

/**
 * Construct a uri that can load resources inside a webview
 *
 * We encode the resource component of the uri so that on the main thread
 * we know where to load the resource from (remote or truly local):
 *
 * ```txt
 * ${scheme}+${resource-authority}.vscode-resource.vscode-cdn.net/${path}
 * ```
 *
 * @param resource Uri of the resource to load.
 * @param remoteInfo Optional information about the remote that specifies where `resource` should be resolved from.
 */
export function asWebviewUri(resource: URI, remoteInfo?: WebviewRemoteInfo): URI {
	console.log(`>> asWebviewUri: ${resource.toString()}`);
	// if (remoteInfo) {
	// 	console.log(`>> remoteInfo ? ${JSON.stringify(remoteInfo, undefined, 2)}`);
	// }

	// original code
	if (resource.scheme === Schemas.http || resource.scheme === Schemas.https) {
		return resource;
	}

	if (remoteInfo && remoteInfo.authority && remoteInfo.isRemote && resource.scheme === Schemas.file) {

		if (webviewLocalResources() && remoteInfo.path) {

			// file:///checode/checode-linux-libc/extensions/markdown-language-features/media/pre.js
			if (resource.toString().startsWith('file:///checode/checode-linux-libc/')) {
				// replace to have
				// ${remoteInfo.path}oss-dev/static/extensions/markdown-language-features/media/pre.js
				const rpath = resource.toString().replace('file:///checode/checode-linux-libc/', `${remoteInfo.path}oss-dev/static/`);
				const u = URI.from({
					scheme: Schemas.https,
					authority: remoteInfo.authority,
					path: rpath,
					fragment: resource.fragment,
					query: resource.query
				});

				console.log(`   << return:    ${u.toString()}`);
				return u;
			}

			// file:///projects/web-nodejs-sample/images/default.png
			if (resource.toString().startsWith('file:///projects/')) {
				// replace to have
				// ${remoteInfo.path}oss-dev/static/projects/web-nodejs-sample/images/default.png
				const rpath = resource.toString().replace('file:///', `${remoteInfo.path}oss-dev/static/`);
				const u = URI.from({
					scheme: Schemas.https,
					authority: remoteInfo.authority,
					path: rpath,
					fragment: resource.fragment,
					query: resource.query
				});

				console.log(`   << return:    ${u.toString()}`);
				return u;
			}

			// file:///checode/remote/extensions/atlassian.atlascode-3.0.2-universal
			if (resource.toString().startsWith('file:///checode/remote/extensions/')) {
				// replace to have
				// ${remoteInfo.path}oss-dev/static/remote-extensionsprojects/atlassian.atlascode-3.0.2-universal
				const rpath = resource.toString().replace('file:///checode/remote/extensions/', `${remoteInfo.path}oss-dev/static/remote-extensions/`);
				const u = URI.from({
					scheme: Schemas.https,
					authority: remoteInfo.authority,
					path: rpath,
					fragment: resource.fragment,
					query: resource.query
				});

				console.log(`   << return:    ${u.toString()}`);
				return u;
			}
		}

		// original code
		resource = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: remoteInfo.authority,
			path: resource.path,
		});
	}


	// original code
	return URI.from({
		scheme: Schemas.https,
		authority: `${resource.scheme}+${encodeAuthority(resource.authority)}.${webviewRootResourceAuthority}`,
		path: resource.path,
		fragment: resource.fragment,
		query: resource.query,
	});
}

function encodeAuthority(authority: string): string {
	return authority.replace(/./g, char => {
		const code = char.charCodeAt(0);
		if (
			(code >= CharCode.a && code <= CharCode.z)
			|| (code >= CharCode.A && code <= CharCode.Z)
			|| (code >= CharCode.Digit0 && code <= CharCode.Digit9)
		) {
			return char;
		}
		return '-' + code.toString(16).padStart(4, '0');
	});
}

export function decodeAuthority(authority: string) {
	return authority.replace(/-([0-9a-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
