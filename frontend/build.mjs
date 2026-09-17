import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('../static/bundle', { recursive: true });

await build({
  entryPoints: ['src/canvas.jsx'],
  bundle: true,
  outfile: '../static/bundle/canvas.js',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
console.log('bundle written to static/bundle/canvas.js (+ canvas.css)');
