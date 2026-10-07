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

function applyPatch(patchFile) {
	return new Promise((resolve) => {
		const patchFileBuf = fs.createReadStream(patchFile);
		const child = cp.spawn('patch', ['-N', '-t', '-r', '/dev/null', '-p2'], {
			stdio: ['pipe', 'pipe', 'pipe']
		});
		patchFileBuf.pipe(child.stdin);

		console.log(`Applying ${patchFile} ..`);
		child.stdout.on('data', (data) => { process.stdout.write(data); });
		child.stderr.on('data', (data) => { process.stderr.write(data); });
		child.on('error', (err) => {
			console.log(`Failed to patch ${patchFile}: patch exited with : ${err}`);
			resolve();
		});
		child.on('close', (code) => {
			if (code !== 0) {
				console.log(`Process exited with code: ${code}`);
			} else {
				console.log(`Patch applied successfully for ${patchFile}`);
			}
			resolve();
		});
	});
}

for (const patchFileName of patches) {
	const patchFile = path.join(scriptDir, 'extension-build-scripts', patchFileName);
	if (!fs.existsSync(patchFile)) {
		console.warn(`Warning: ${patchFile} not found, skipping`);
		continue;
	}

	await applyPatch(patchFile);
}
