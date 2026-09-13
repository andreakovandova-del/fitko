// AI návrh týdne vaření: GitHub Action (sobota odpoledne) přečte zálohy obou lidí
// a domácnost z gistu, akce z Lidlu a knihovnu receptů, zeptá se Claude na výběr jídel
// na příští týden (a případně 1–2 nové recepty ve stejném schématu jako vestavěné)
// a návrh uloží do domácnosti (fitko-domacnost.json → proposals). Appka ho v neděli
// ukáže v záložce Vaření jako „Návrh od AI“ na jedno ťuknutí. Když klíč chybí nebo
// AI neodpoví smysluplně, nic se nestane — appka má vlastní plánovač.
//
// Potřebuje secrets: FITKO_GH_TOKEN (gist), ANTHROPIC_API_KEY.

import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as engine from '../engine.mjs';

const TOKEN = process.env.FITKO_GH_TOKEN;
const MODEL = process.env.FITKO_AI_MODEL || 'claude-opus-5';
const TZ = 'Europe/Prague';

async function gh(path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

async function gistFile(gist, name) {
  const f = gist.files?.[name];
  if (!f) return null;
  const text = f.truncated && f.raw_url ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(text); } catch { return null; }
}

function pragueToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Příští pondělí (v neděli a v sobotu = zítřek/pozítří; jindy taky příští týden).
export function nextWeekStart(todayIso) {
  return engine.addDays(engine.weekStartOf(todayIso), 7);
}

// ---------- schéma odpovědi ----------

const FOOD_IDS = Object.keys(engine.FOODS);
const KINDS = ['hlavni', 'snidane', 'svacina'];
const PROTEINS = ['kure', 'kruti', 'hovezi', 'veprove', 'ryba', 'vejce', 'mlecne', 'lusteniny'];

const NewRecipe = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,40}$/),
  name: z.string().min(3).max(80),
  kind: z.enum(KINDS),
  emoji: z.string().min(1).max(4),
  protein: z.enum(PROTEINS),
  color: z.enum(['maso', 'ryba', 'vege', 'snidane', 'svacina']),
  prepMin: z.number().int().min(0).max(120),
  cookMin: z.number().int().min(0).max(240),
  fridgeDays: z.number().int().min(0).max(6),
  freezer: z.boolean(),
  equipment: z.array(z.string()).max(4),
  tags: z.array(z.string()).max(5),
  pantry: z.array(z.string()).max(8),
  items: z.array(z.object({ foodId: z.string(), grams: z.number().min(1).max(600) })).min(2).max(12),
  steps: z.array(z.string().min(10).max(300)).min(2).max(8),
});

const Proposal = z.object({
  note: z.string().max(400),
  pick: z.object({
    A: z.array(z.string()).length(2),
    B: z.array(z.string()).length(2),
    breakfasts: z.record(z.string(), z.array(z.string()).length(2)),
    snacks: z.record(z.string(), z.array(z.string()).length(2)),
  }),
  newRecipes: z.array(NewRecipe).max(2),
});

// ---------- podklady pro model ----------

export function buildBrief({ weekStart, members, household, feed, customRecipes }) {
  const discounted = engine.matchDiscounts({ items: (feed?.items ?? []).filter((it) => !it.validTo || it.validTo >= weekStart) }, []);
  const all = [...engine.RECIPES, ...customRecipes];
  const excluded = new Set(household.prefs?.excludedRecipes ?? []);
  const recent = [];
  for (let i = 1; i <= 3; i++) {
    const plan = household.cook?.[engine.addDays(weekStart, -7 * i)];
    if (plan) recent.push(...plan.sessions.flatMap((s) => s.dishes.map((d) => d.recipeId)));
  }
  const recipeLines = all.filter((r) => !excluded.has(r.id)).map((r) => {
    const m = engine.recipeMacros(r);
    const disc = engine.mealDiscountShare({ items: r.items }, discounted);
    return `${r.id} | ${r.kind} | ${r.name} | ${r.protein} | ${m.kcal} kcal, ${m.p} g B / porce | ${r.prepMin + r.cookMin} min | lednice ${r.fridgeDays} d${r.freezer ? ', mrazák' : ''}${disc >= 0.3 ? ' | V AKCI' : ''}`;
  });
  const deals = Object.entries(discounted).slice(0, 40).map(([id, it]) => `${engine.FOODS[id]?.name ?? id}: ${it.qty ?? ''} za ${it.price} Kč${it.validTo ? ` do ${it.validTo}` : ''}`);
  const memberLines = Object.entries(members).map(([id, m]) => `${id} (${m.name}): ${m.kcal} kcal/den, ${m.proteinG} g bílkovin, fáze ${m.phase}`);
  return { discounted, recent, excluded: [...excluded], recipeLines, deals, memberLines, memberIds: Object.keys(members) };
}

export function systemPrompt() {
  return `Jsi kuchař a výživový plánovač pro dvoučlennou domácnost v Česku, která vaří do krabiček
(meal prep). Vaří se dvakrát týdně: v neděli na pondělí až středu (3 dny) a ve středu na čtvrtek
až neděli (4 dny). Každé vaření = 2 hlavní jídla; každé jídlo se jí jako oběd jeden den a večeře
další den, oba lidé jedí totéž, jen v jiné porci (porce se dopočítají automaticky z kalorií).
Kuchyň: trouba, horkovzdušná fritéza, rýžovar, mikrovlnka, mixér, vakuovačka, běžné pánve a hrnce.
Nakupuje se v Lidlu. Žádné alergie.

Pravidla výběru:
- Vaření A pokrývá 3 dny → obě jídla musí vydržet v lednici 3 dny, nebo se dát zamrazit.
- Vaření B pokrývá 4 dny → vydrží 4 dny, nebo mrazák.
- Čtyři hlavní jídla týdne mají čtyři různé bílkoviny (kure, hovezi, ryba, veprove, kruti, lusteniny…).
- Neopakuj jídla z posledních tří týdnů, pokud jde jinak.
- Upřednostni recepty se surovinami v akci.
- Jednoduché na přípravu (do 60 min), nutričně kompletní, bílkoviny vysoko.
- Snídaně: 2 na osobu (jedna Po–Čt, druhá Pá–Ne). Svačiny: 2 na osobu.
- Nové recepty navrhuj jen tehdy, když opravdu chybí (max 2), ve stejném duchu jako knihovna:
  suroviny POUZE z povoleného seznamu foodId, gramy syrové na 1 porci ≈ 600–750 kcal a ≥ 40 g
  bílkovin u hlavního jídla, kroky psané pro celou dávku, česky, stručně.
- Poznámka pro uživatele: 1–2 věty česky, konkrétně proč tenhle výběr (akce, pestrost). Bez frází.`;
}

export function userPrompt(brief, weekStart) {
  return `Týden od ${weekStart}.

Lidé:
${brief.memberLines.join('\n')}

Knihovna receptů (id | druh | název | bílkovina | makra | čas | trvanlivost):
${brief.recipeLines.join('\n')}

Jídla z posledních 3 týdnů (neopakovat): ${brief.recent.join(', ') || 'žádná'}
Vyřazené recepty: ${brief.excluded.join(', ') || 'žádné'}

Akce v Lidlu na příští týden:
${brief.deals.join('\n') || 'feed není k dispozici'}

Povolené foodId pro nové recepty: ${FOOD_IDS.join(', ')}

Vyber: pick.A (2 id hlavních jídel na neděli → Po–St), pick.B (2 id na středu → Čt–Ne),
pick.breakfasts a pick.snacks jako objekt s klíči ${brief.memberIds.join(' a ')} (každý 2 id snídaní / 2 id svačin).
Můžeš použít i id nových receptů, které zároveň navrhneš v newRecipes.`;
}

// ---------- kontrola odpovědi (model může chybovat; appka nesmí dostat nesmysl) ----------

export function validateProposal(raw, brief, customRecipes) {
  const newRecipes = [];
  for (const r of raw.newRecipes ?? []) {
    if (r.items.some((it) => !engine.FOODS[it.foodId])) continue;
    if (engine.recipeById(r.id, customRecipes)) continue;
    const m = engine.recipeMacros(r);
    const ok = r.kind === 'hlavni' ? (m.kcal >= 500 && m.kcal <= 850 && m.p >= 35)
      : r.kind === 'snidane' ? (m.kcal >= 350 && m.kcal <= 700) : (m.kcal >= 150 && m.kcal <= 450);
    if (!ok) continue;
    newRecipes.push({ ...r, custom: true, updatedAt: new Date().toISOString() });
  }
  const known = new Set([...engine.RECIPES.map((r) => r.id), ...customRecipes.map((r) => r.id), ...newRecipes.map((r) => r.id)]);
  const byId = (id) => engine.recipeById(id, [...customRecipes, ...newRecipes]);
  const mainOk = (id, days) => known.has(id) && byId(id)?.kind === 'hlavni' && (byId(id).fridgeDays >= days || byId(id).freezer) && !brief.excluded.includes(id);
  const A = raw.pick.A.filter((id) => mainOk(id, 3));
  const B = raw.pick.B.filter((id) => mainOk(id, 4) && !A.includes(id));
  if (A.length !== 2 || B.length !== 2) return { ok: false, reason: `hlavní jídla neprošla kontrolou (A ${A.length}, B ${B.length})`, newRecipes };
  const proteins = new Set([...A, ...B].map((id) => byId(id).protein));
  if (proteins.size < 3) return { ok: false, reason: 'málo pestré bílkoviny', newRecipes };
  const perKind = (obj, kind) => Object.fromEntries(brief.memberIds.map((uid) => [uid, (obj?.[uid] ?? []).filter((id) => known.has(id) && byId(id)?.kind === kind).slice(0, 2)]));
  const breakfasts = perKind(raw.pick.breakfasts, 'snidane');
  const snacks = perKind(raw.pick.snacks, 'svacina');
  for (const uid of brief.memberIds) {
    if (breakfasts[uid].length < 1) delete breakfasts[uid];
    if (snacks[uid].length < 1) delete snacks[uid];
  }
  return { ok: true, pick: { A, B, breakfasts, snacks }, newRecipes, note: String(raw.note ?? '').slice(0, 400) };
}

// ---------- hlavní běh ----------

async function main() {
  if (!TOKEN) { console.log('FITKO_GH_TOKEN chybí — návrh se negeneruje.'); return; }
  if (!process.env.ANTHROPIC_API_KEY) { console.log('ANTHROPIC_API_KEY chybí — návrh se negeneruje (nastav secret v repozitáři).'); return; }

  const gists = await gh('/gists?per_page=100');
  const meta = gists.find(engine.isFitkoGist);
  if (!meta) { console.log('Záloha Fitka na účtu není.'); return; }
  const gist = await gh(`/gists/${meta.id}`);
  const household = engine.mergeHousehold(engine.emptyHousehold(), (await gistFile(gist, engine.HOUSEHOLD_FILE)) ?? {});

  // Cíle obou: z domácnosti (kam je appka zapisuje), doplněné ze záloh.
  const members = {};
  for (const uid of engine.USER_ORDER) {
    const m = household.members[uid];
    const state = await gistFile(gist, engine.backupFileFor(uid));
    const kcal = m?.kcal ?? state?.targets?.kcal;
    if (!kcal) continue;
    members[uid] = { name: m?.name ?? state?.profile?.name ?? engine.USERS[uid].name, kcal, proteinG: m?.proteinG ?? state?.targets?.proteinG ?? 0, phase: m?.phase ?? state?.targets?.phase ?? '—' };
  }
  if (!Object.keys(members).length) { console.log('Nikdo nemá nastavené cíle — není pro koho plánovat.'); return; }

  const today = pragueToday();
  const weekStart = nextWeekStart(today);
  if (household.cook?.[weekStart]) { console.log(`Týden ${weekStart} už je naplánovaný ručně — návrh není potřeba.`); return; }
  const existing = household.proposals?.[weekStart];
  if (existing?.createdAt && !process.env.FITKO_AI_FORCE) { console.log(`Návrh na ${weekStart} už existuje (${existing.createdAt}).`); return; }

  let feed = null;
  try { feed = JSON.parse(await readFile('akce-lidl.json', 'utf8')); } catch { /* bez feedu */ }
  const customRecipes = household.customRecipes ?? [];
  const brief = buildBrief({ weekStart, members, household, feed, customRecipes });

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(brief, weekStart) }],
    output_config: { format: zodOutputFormat(Proposal) },
  });
  if (response.stop_reason === 'refusal') { console.log('Model odmítl odpovědět:', response.stop_details?.explanation ?? ''); return; }
  const raw = response.parsed_output;
  if (!raw) { console.log('Odpověď nešla přečíst.'); return; }

  const checked = validateProposal(raw, brief, customRecipes);
  const now = new Date().toISOString();
  if (checked.newRecipes.length) {
    household.customRecipes = [...customRecipes, ...checked.newRecipes];
    console.log('nové recepty:', checked.newRecipes.map((r) => r.id).join(', '));
  }
  if (checked.ok) {
    household.proposals[weekStart] = { weekStart, createdAt: now, updatedAt: now, model: response.model, note: checked.note, pick: checked.pick };
    console.log(`návrh na ${weekStart}:`, JSON.stringify(checked.pick));
  } else {
    console.log('návrh neprošel kontrolou:', checked.reason);
  }
  household.updatedAt = now;
  await gh(`/gists/${meta.id}`, { method: 'PATCH', body: JSON.stringify({ files: { [engine.HOUSEHOLD_FILE]: { content: JSON.stringify(household, null, 1) } } }) });
  console.log(`tokeny: vstup ${response.usage.input_tokens}, výstup ${response.usage.output_tokens}`);
}

if (process.argv[1] && /(^|\/)plan-ai\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
