import { build } from 'esbuild';

const banner = '/*\n  ANIMATOR: Where AI Meets Ergonomics\n*/\n';
const shared = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  minify: true,
  treeShaking: true,
  sourcemap: false,
};

await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  banner: { js: banner },
});

await build({
  ...shared,
  entryPoints: ['src/worker.ts'],
  outfile: 'dist/worker.js',
  banner: { js: banner },
});

console.log('Build complete.');
