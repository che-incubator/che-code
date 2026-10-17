const path = require('path');
const esbuild = require('esbuild');

esbuild.build({
	entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
	tsconfig: path.join(__dirname, 'tsconfig.json'),
	bundle: true,
	external: ['vscode'],
	minify: true,
	platform: 'node',
	outdir: path.join(__dirname, 'dist'),
	packages: 'bundle',
}).catch(() => process.exit(1));
