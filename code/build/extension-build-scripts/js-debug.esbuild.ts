const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Run js-debug's own gulp build which populates dist/
cp.execFileSync(process.execPath, [path.join(__dirname, 'node_modules', 'gulp', 'bin', 'gulp.js'), 'compile'], {
	cwd: __dirname,
	stdio: 'inherit',
});

// The source root package.json is only a dev manifest: it has no `contributes`
// and no activation events, so VS Code never activates the extension. The real,
// complete manifest (debuggers, commands, activationEvents, nls placeholders) is
// generated into dist/package.json by the gulp build. `vsce ls` and VS Code both
// read the extension-root package.json as the manifest, so promote the generated
// one to the root. The bundled entry point lives at dist/src/extension.js; set
// `main` to a fixed path (rather than deriving it from dist/package.json's own
// dist-relative `main`) so re-runs stay idempotent. package.nls.json already
// exists at the root, so the %placeholder% strings in the manifest resolve.
const distPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist', 'package.json'), 'utf8'));
distPkg.main = './dist/src/extension.js';
fs.writeFileSync(path.join(__dirname, 'package.json'), JSON.stringify(distPkg, null, 2));
