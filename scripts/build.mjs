// Build: vloží engine.mjs do index.html (jeden zdroj pravdy pro výpočty, appka
// i GitHub Actions počítají stejným kódem), zvedne verzi (BUILD_ID, version.json)
// a název cache service workeru, aby se nová verze na telefonu opravdu načetla.
//
//   node scripts/build.mjs          # vloží engine + zvedne verzi
//   node scripts/build.mjs --check  # jen ověří, že index.html odpovídá engine.mjs

import { readFile, writeFile } from 'node:fs/promises';

const ENGINE_START = '// ===== src/engine/util.js =====';
const ENGINE_END = '// ===== src/app/ui.js =====';

function inlineEngine(engine) {
  // export function / export const → bez exportu (v appce je vše v jednom scope)
  return engine.replace(/^export (function|const|let) /gm, '$1 ');
}

function pragueStamp(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}

const check = process.argv.includes('--check');
const html = await readFile('index.html', 'utf8');
const engine = await readFile('engine.mjs', 'utf8');
const start = html.indexOf(ENGINE_START);
const end = html.indexOf(ENGINE_END);
if (start < 0 || end < 0 || end < start) throw new Error('v index.html chybí značky engine bloku');

const current = html.slice(start, end);
const wanted = `${inlineEngine(engine).trimEnd()}\n\n\n`;
const same = current.trimEnd() === wanted.trimEnd();

if (check) {
  if (!same) { console.error('index.html NEODPOVÍDÁ engine.mjs — spusť node scripts/build.mjs'); process.exit(1); }
  console.log('engine v index.html odpovídá engine.mjs');
  process.exit(0);
}

const build = pragueStamp();
let out = html.slice(0, start) + wanted + html.slice(end);
out = out.replace(/const BUILD_ID = "[^"]*";/, `const BUILD_ID = "${build}";`);
await writeFile('index.html', out);
await writeFile('version.json', `${JSON.stringify({ build })}\n`);
const sw = await readFile('sw.js', 'utf8');
await writeFile('sw.js', sw.replace(/const CACHE = '[^']*';/, `const CACHE = 'fitko-${Date.now().toString(36)}';`));
console.log(`build ${build}${same ? '' : ' (engine vložen znovu)'}`);
