// Bundles the server (and the TS-only @fancave/shared workspace package) into one file.
// Runtime npm dependencies stay external and are installed in the Docker image.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: 'info',
});
