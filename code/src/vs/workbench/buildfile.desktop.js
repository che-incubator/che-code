/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const { createModuleDescription, createEditorWorkerModuleDescription } = require('../base/buildfile');

exports.collectModules = function () {
	return [
		createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputer'),

		createModuleDescription('vs/workbench/contrib/debug/node/telemetryApp'),

		createModuleDescription('vs/platform/files/node/watcher/watcherMain'),

		createModuleDescription('vs/platform/terminal/node/ptyHostMain'),

		createModuleDescription('vs/workbench/api/node/extensionHostProcess'),
	];
};
