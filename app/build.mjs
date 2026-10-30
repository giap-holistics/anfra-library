// Bundle src/main.js (three.js included) with esbuild into one IIFE and inline it into
// src/template.html, writing the single-file Data App apps/library.html. esbuild comes from the nix shell.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const js = execFileSync(
  'esbuild',
  [
    'src/main.js',
    '--bundle',
    '--format=iife',
    '--target=es2020',
    '--minify',
    '--legal-comments=none',
    '--log-level=warning',
  ],
  {
    cwd: new URL('.', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  },
);
const tpl = readFileSync(here('./src/template.html'), 'utf8');
if (!tpl.includes('/*BUNDLE*/')) throw new Error('template has no /*BUNDLE*/ marker');
const html = tpl.split('/*BUNDLE*/').join(js.replace(/<\/script/gi, '<\\/script'));
mkdirSync(here('./apps/'), { recursive: true });
writeFileSync(here('./apps/library.html'), html);
console.log(
  `apps/library.html ${(html.length / 1024).toFixed(0)} KB (bundle ${(js.length / 1024).toFixed(0)} KB)`,
);
