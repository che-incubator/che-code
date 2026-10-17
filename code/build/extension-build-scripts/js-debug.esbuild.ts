const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Run js-debug's own gulp build which populates dist/
cp.execFileSync(process.execPath, [path.join(__dirname, 'node_modules', 'gulp', 'bin', 'gulp.js'), 'compile'], {
	cwd: __dirname,
	stdio: 'inherit',
});

// Rewrite main to point into dist/ so the packaged extension resolves correctly
const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.main = './dist/src/extension.js';
pkg.activationEvents = [];
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
