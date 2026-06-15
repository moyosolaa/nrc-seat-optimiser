// Bundles the extension's three entry points into IIFE files Chrome can load directly.
// No CRXJS — just esbuild, so the build is transparent and fast.

import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist-ext', { recursive: true });

await build({
  entryPoints: {
    inject: 'src/inject/main.ts',
    content: 'src/content/main.tsx',
    background: 'src/background/main.ts',
  },
  outdir: 'dist-ext',
  bundle: true,
  format: 'iife',
  target: ['chrome111'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});

copyFileSync('manifest.json', 'dist-ext/manifest.json');
console.log('✓ Extension built → dist-ext/  (load unpacked at chrome://extensions)');
