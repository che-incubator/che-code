/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { execSync } from 'child_process';

function prepareHusky() {
	execSync('npm run husky:install', { stdio: 'inherit' });
}

function main() {
	prepareHusky();
}

main();
