#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const scriptDir = import.meta.dirname;
const codeDir = path.join(scriptDir, '..');

// Map of build script filename -> target extension directory
const scripts = {
	'js-debug.esbuild.ts': 'extensions/js-debug',
	'js-debug-companion.esbuild.ts': 'extensions/js-debug-companion',
	'js-profile-visualizer.esbuild.ts': 'extensions/js-profile-visualizer',
	'js-profile-visualizer.webpack.override.js': 'extensions/js-profile-visualizer',
	'devfile.esbuild.ts': 'extensions/devfile',
};

for (const [scriptFile, extensionDir] of Object.entries(scripts)) {
	const src = path.join(scriptDir, 'extension-build-scripts', scriptFile);
	const destDir = path.join(codeDir, extensionDir);

	// Extract the actual filename (remove the prefix before the first dot)
	let destFile;
	if (scriptFile.includes('.esbuild.ts')) {
		destFile = '.esbuild.ts';
	} else if (scriptFile.includes('.webpack.override.js')) {
		destFile = 'webpack.override.js';
	} else {
		destFile = scriptFile;
	}

	const dest = path.join(destDir, destFile);

	if (!fs.existsSync(src)) {
		console.warn(`Warning: ${src} not found, skipping`);
		continue;
	}

	if (!fs.existsSync(destDir)) {
		console.warn(`Warning: ${destDir} not found, skipping`);
		continue;
	}

	fs.copyFileSync(src, dest);
	console.log(`Copied ${scriptFile} -> ${extensionDir}/${destFile}`);
}
