const path = require('path');
const esbuild = require('esbuild');

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'dist');

esbuild.build({
	platform: 'node',
	bundle: true,
	minify: true,
	treeShaking: true,
	sourcemap: true,
	target: ['es2020'],
	external: ['vscode'],
	format: 'cjs',
	entryPoints: {
		'devfile-extension': path.join(srcDir, 'devfile-extension.ts'),
	},
	outdir: outDir,
}).catch(() => process.exit(1));
