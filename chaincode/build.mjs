// tsc (emit decorator metadata untuk fabric-contract-api) → esbuild bundle (termasuk @akreditasi/shared) → dist/index.js
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('build', { recursive: true, force: true });
rmSync('dist', { recursive: true, force: true });
execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
await build({
  entryPoints: ['build/index.js'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['fabric-contract-api', 'fabric-shim'],
  sourcemap: true,
  keepNames: true,
  logLevel: 'info',
});
rmSync('build', { recursive: true, force: true });
