import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const binDir = path.join(projectRoot, 'bin');
const outFile = path.join(binDir, 'json-to-srt.mjs');

if (!existsSync(binDir)) {
	mkdirSync(binDir, { recursive: true });
}

await esbuild.build({
	entryPoints: [path.join(projectRoot, 'src', 'cli.ts')],
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node18',
	outfile: outFile,
	banner: {
		js: '#!/usr/bin/env node',
	},
});

chmodSync(outFile, 0o755);
console.log(`CLI built: ${outFile}`);
