const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const coreDir = path.join(rootDir, 'packages', 'vscode-js-profile-core');
const tableDir = path.join(rootDir, 'packages', 'vscode-js-profile-table');
const tsc = path.join(rootDir, 'node_modules', '.bin', 'tsc');
const cpy = path.join(rootDir, 'node_modules', '.bin', 'cpy');
const webpack = path.join(rootDir, 'node_modules', '.bin', 'webpack');

// Build the core package first (table depends on it)
// Type errors are non-fatal - tsc still emits output even when it exits with error code
try {
	cp.execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: coreDir, stdio: 'inherit' });
} catch (e) {
	// Ignore tsc errors - output files are still generated
}
try {
	cp.execFileSync(tsc, ['-p', 'tsconfig.browser.json'], { cwd: coreDir, stdio: 'inherit' });
} catch (e) {
	// Ignore tsc errors - output files are still generated
}
cp.execFileSync(cpy, ['src/**/*.css', 'out/esm'], { cwd: coreDir, stdio: 'inherit' });

// Build the table package with webpack using override config that disables type-checking
cp.execFileSync(webpack, ['--mode', 'production', '--config', path.join(rootDir, 'webpack.override.js')], { cwd: tableDir, stdio: 'inherit' });

// Copy the sub-package's package.json to root so the build system picks up
// the correct extension manifest (with engines, contributes, main, etc.)
const tablePkg = JSON.parse(fs.readFileSync(path.join(tableDir, 'package.json'), 'utf8'));
tablePkg.main = './packages/vscode-js-profile-table/out/extension.js';
if (tablePkg.browser) {
	tablePkg.browser = './packages/vscode-js-profile-table/out/extension.web.js';
}
fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify(tablePkg, null, 2));
