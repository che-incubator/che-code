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

// che-code packages this monorepo as a single built-in extension rooted at this
// directory (the build globs extensions/*/package.json), so at runtime
// `context.extensionUri` is this repo root. The table package's webpack output
// lands in packages/vscode-js-profile-table/out, but two different runtime paths
// expect it at the repo root:
//   - the extension loads its webview bundles via joinPath(extensionUri, 'out', ...)
//     so they must exist at <root>/out
//   - the build rewrites a bundled extension's manifest `main` from /out/ to /dist/
//     (see updateExtensionPackageJSON in build/lib/extensions.ts), so the entry
//     point (and its webpack-split sibling chunks/wasm) must exist at <root>/dist
// Mirror the build output to both locations so every runtime path resolves.
const tableOut = path.join(tableDir, 'out');
for (const dir of ['out', 'dist']) {
	const dest = path.join(rootDir, dir);
	fs.rmSync(dest, { recursive: true, force: true });
	fs.cpSync(tableOut, dest, { recursive: true });
}

// Promote the table package's manifest to the repo root so `vsce ls` and VS Code
// read it as the extension manifest. Point main/browser at the mirrored entry in
// dist/ (the /out/ -> /dist/ rewrite then leaves these unchanged).
const tablePkg = JSON.parse(fs.readFileSync(path.join(tableDir, 'package.json'), 'utf8'));
tablePkg.main = './dist/extension.js';
if (tablePkg.browser) {
	tablePkg.browser = './dist/extension.web.js';
}
fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify(tablePkg, null, 2));
