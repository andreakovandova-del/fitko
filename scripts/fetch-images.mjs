// Fotky receptů: stáhne obrázky podle img/recepty/zdroje.json (id → url), zmenší je
// na 640 px JPEG a uloží jako img/recepty/<id>.jpg. Běží v GitHub Action (obrazky.yml),
// protože z vývojového prostředí není CDN dostupné. Potřebuje `sharp` (npm install --no-save sharp).
//
//   node scripts/fetch-images.mjs          # stáhne jen chybějící
//   node scripts/fetch-images.mjs --force  # přepíše všechny

import { readFile, writeFile, access } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCES = 'img/recepty/zdroje.json';
const force = process.argv.includes('--force');

const sources = JSON.parse(await readFile(SOURCES, 'utf8'));
let done = 0; let skipped = 0; let failed = 0;
for (const [id, entry] of Object.entries(sources.images ?? {})) {
  const url = typeof entry === 'string' ? entry : entry?.url;
  if (!url) continue;
  const out = `img/recepty/${id}.jpg`;
  if (!force) {
    try { await access(out); skipped++; continue; } catch { /* chybí → stáhnout */ }
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const jpg = await sharp(buf).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 78, progressive: true, mozjpeg: true }).toBuffer();
    await writeFile(out, jpg);
    done++;
    console.log('uloženo', out, `${Math.round(jpg.length / 1024)} kB`);
  } catch (err) {
    failed++;
    console.warn('nepovedlo se', id, err.message);
  }
}
console.log(`hotovo: ${done} nových, ${skipped} už bylo, ${failed} chyb`);
