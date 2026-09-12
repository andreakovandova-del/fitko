// Akční potraviny Lidl z kupi.cz → akce-lidl.json (běží v GitHub Action 2× týdně).
// Bez závislostí. Stránky kategorií jsou vykreslené na serveru; čteme jen veřejné
// stránky /slevy/<kategorie>/lidl, které robots.txt nezakazuje, s rozestupem mezi požadavky.
// Když kupi.cz změní HTML, skript skončí chybou a starý feed zůstane (appka ukáže stáří).

import { writeFile, readFile } from 'node:fs/promises';

const BASE = 'https://www.kupi.cz';
const CATEGORIES = [
  'maso-drubez-a-ryby', 'mlecne-vyrobky-a-vejce', 'ovoce-a-zelenina', 'pecivo', 'zdrava-vyziva',
  'mrazene-a-instantni-potraviny', 'konzervy', 'lahudky', 'vareni-a-peceni', 'nealko-napoje', 'sladkosti-a-slane-snacky',
];
const MAX_PAGES = 4;
const DELAY_MS = 1500;
const UA = 'FitkoBot/1.0 (+https://github.com/andreakovandova-del/fitko; osobni nakupni seznam, 2x tydne)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s ?? '')
  .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => { const m = String(s ?? '').replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null; };

async function fetchPage(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'cs' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

// „čt 17. 9. – ne 20. 9.“ / „dnes končí“ / „zítra končí“ / „od zítra“ / „od čt 17. 9.“ → ISO data
export function parseValidity(text, today = new Date()) {
  const t = decode(text).toLowerCase();
  const y = today.getFullYear();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mk = (day, month) => {
    let year = y;
    if (month < today.getMonth() + 1 - 6) year = y + 1; // prosinec → leden
    if (month > today.getMonth() + 1 + 6) year = y - 1;
    return iso(new Date(year, month - 1, day));
  };
  const dates = [...t.matchAll(/(\d{1,2})\.\s?(\d{1,2})\./g)].map((m) => mk(+m[1], +m[2]));
  const tomorrow = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  if (dates.length >= 2) return { validFrom: dates[0], validTo: dates[1] };
  if (dates.length === 1) return /\bod\b/.test(t) ? { validFrom: dates[0], validTo: null } : { validFrom: null, validTo: dates[0] };
  if (/dnes konc/.test(t)) return { validFrom: null, validTo: iso(today) };
  if (/zitra konc|zítra konč/.test(t)) return { validFrom: null, validTo: tomorrow };
  if (/od zitra|od zítra/.test(t)) return { validFrom: tomorrow, validTo: null };
  return { validFrom: null, validTo: null };
}

export function parseProducts(html, category) {
  const out = [];
  const chunks = html.split('class="product--wrap"').slice(1);
  for (const chunk of chunks) {
    const name = decode((chunk.match(/<strong>([^<]+)<\/strong>/) ?? [])[1]);
    const url = (chunk.match(/href="(\/sleva\/[^"?#]+)"/) ?? [])[1] ?? null;
    if (!name || !url) continue;
    const qty = decode((chunk.match(/class="nowrap">\s*<span>([^<]+)<\/span>/) ?? [])[1]) || null;
    const rows = chunk.split('class="discount_row').slice(1);
    const seen = new Set();
    for (const row of rows) {
      const price = num((row.match(/discount_price_value">([^<]+)</) ?? [])[1]);
      if (price == null) continue;
      const amount = decode((row.match(/discount_amount">([^<]+)</) ?? [])[1]).replace(/^\/\s*/, '') || qty;
      const pct = num((row.match(/discount_percentage">([^<]+)</) ?? [])[1]);
      const perUnit = decode((row.match(/price_per_unit">([^<]+)</) ?? [])[1]) || null;
      const validity = decode((row.match(/discounts_validity[^>]*>[\s\S]*?padding-left: 4px;">([\s\S]*?)<\/div>/) ?? [])[1]);
      const key = `${url}|${amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${url.replace('/sleva/', '')}|${amount ?? ''}`,
        name, qty: amount, price, pricePerUnit: perUnit,
        discountPct: pct != null ? Math.abs(pct) : null,
        ...parseValidity(validity),
        future: /price_future_discount/.test(row),
        category, url: `${BASE}${url}`,
      });
    }
  }
  return out;
}

function hasNextPage(html, category, page) {
  return html.includes(`href="/slevy/${category}/lidl?page=${page + 1}"`);
}

async function main() {
  const items = [];
  const seen = new Set();
  for (const category of CATEGORIES) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const path = `/slevy/${category}/lidl${page > 1 ? `?page=${page}` : ''}`;
      let html;
      try { html = await fetchPage(path); } catch (err) { console.warn('přeskakuji', path, err.message); break; }
      const found = parseProducts(html, category);
      for (const it of found) if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
      console.log(path, '→', found.length, 'položek');
      if (!hasNextPage(html, category, page)) break;
      await sleep(DELAY_MS);
    }
    await sleep(DELAY_MS);
  }
  if (items.length < 20) throw new Error(`Podezřele málo položek (${items.length}) — změnilo se HTML kupi.cz? Starý feed zůstává.`);
  const feed = { store: 'Lidl', source: 'kupi.cz', fetchedAt: new Date().toISOString(), items };
  // nezapisuj, když se nic nezměnilo (kromě času) — ať Pages nedeployuje zbytečně
  try {
    const old = JSON.parse(await readFile('akce-lidl.json', 'utf8'));
    if (JSON.stringify(old.items) === JSON.stringify(items)) { console.log('beze změny'); return; }
  } catch { /* první běh */ }
  await writeFile('akce-lidl.json', JSON.stringify(feed));
  console.log('zapsáno', items.length, 'položek');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
