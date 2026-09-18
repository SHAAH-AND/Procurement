// Verifies every named import resolves to a real export.
//
// `node --check` only parses a file; it never looks at what a module actually
// exports. A missing named export is a load-time SyntaxError that takes the
// WHOLE module graph down — boot() never runs and the app sits on its spinner
// forever with no error the user can see.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');

const DIR = REPO_ROOT + '/procurement_web/js';

const exportsOf = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    m[1].split(',').forEach(part => {
      const as = part.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    });
  }
  return names;
};

const cache = new Map();
const get = (f) => {
  if (!cache.has(f)) cache.set(f, exportsOf(f));
  return cache.get(f);
};

let problems = 0;
for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  // import { a, b as c } from './x.js?v=1'
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)\.js[^']*'/g)) {
    const target = path.join(DIR, m[2] + '.js');
    if (!fs.existsSync(target)) {
      console.log(`✗ ${file}: imports missing file ./${m[2]}.js`);
      problems++;
      continue;
    }
    const available = get(target);
    const wanted = m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const missing = wanted.filter(w => !available.has(w));
    if (missing.length) {
      console.log(`✗ ${file}  ->  ${m[2]}.js`);
      missing.forEach(w => console.log(`      "${w}" is imported but not exported`));
      problems += missing.length;
    }
  }
  // import * as ns from './x.js'
  for (const m of src.matchAll(/import\s*\*\s*as\s*[\w$]+\s*from\s*'\.\/([\w-]+)\.js[^']*'/g)) {
    const target = path.join(DIR, m[1] + '.js');
    if (!fs.existsSync(target)) { console.log(`✗ ${file}: namespace-imports missing ./${m[1]}.js`); problems++; }
  }
}

console.log(problems === 0
  ? '\nPASS — every named import resolves to a real export.'
  : `\nFAIL — ${problems} broken import(s). Any one of these stops the app booting.`);
process.exit(problems === 0 ? 0 : 1);
