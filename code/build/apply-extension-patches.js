#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import * as cp from 'node:child_process';

const scriptDir = import.meta.dirname;

const patches = [
	'js-debug.patch',
	'js-debug-companion.patch',
	'js-profile-visualizer.patch',
	'devfile.patch'
];

for (const patchFileName of patches) {
	const patchFile = path.join(scriptDir, 'extension-build-scripts', patchFileName);
	if (!fs.existsSync(patchFile)) {
		console.warn(`Warning: ${patchFile} not found, skipping`);
		continue;
	}

	const patchFileBuf = fs.createReadStream(patchFile);
	const child = cp.spawn('patch', ['-p2']);
	patchFileBuf.pipe(child.stdin);

        let output = '';
        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { output += data.toString(); });
        child.on('error', (err) => {
		console.log(`Failed to patch ${patchFile}: patch exited with : ${err}`);
	});
	child.on('close', (code) => {
		if (code !== 0) {
			console.log(`Process exited with code: ${code}\n${output}`);
		} else {
			console.log(`Patch applied successfully for ${patchFile}`);
		}
	});
}
