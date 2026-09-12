// Chytré notifikace bez serveru: GitHub Action každých ~30 min přečte zálohu Fitka
// (privátní gist), spočítá TÝMŽ enginem co appka, jestli je co říct, a pošle push.
// Posílá jen relevantní věci, každou nejvýš jednou, s tichem v noci. Paměť odeslaného
// drží ve vedlejším souboru gistu (fitko-notif.json) — do zálohy samotné nikdy nezapisuje.
//
// Potřebuje secrets: FITKO_GH_TOKEN (gist scope — ten samý, co používá appka),
// VAPID_PRIVATE_KEY (pár k vapid.public.txt vedle appky).

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as engine from '../engine.mjs';

const require = createRequire(import.meta.url);

const TOKEN = process.env.FITKO_GH_TOKEN;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const PAGES_URL = 'https://andreakovandova-del.github.io/fitko/';
const BACKUP_FILE = 'fitko-zaloha.json';
const MEMORY_FILE = 'fitko-notif.json';
const MAX_PER_RUN = 2;
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

/** Čas v Praze: { iso, hour, minute, dow (Po=1…Ne=7) }. */
export function pragueNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return { iso, hour: Number(parts.hour) % 24, minute: Number(parts.minute), dow };
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const czDays = (n) => (n === 1 ? '1 dnem' : `${n} dny`);

/**
 * Pravidla → kandidáti { key, title, body, url }. Čistá funkce, testovatelná.
 * @param state záloha appky, @param now pragueNow(), @param feed akce-lidl.json (nebo null), @param memory odeslané
 */
export function dueNotifications(state, now, feed, memory = {}) {
  const prefs = { workout: true, weigh: true, meals: true, protein: true, shopping: true, quietFrom: 22, quietTo: 7, ...(state.push?.prefs ?? {}) };
  const out = [];
  const { iso, hour, minute } = now;
  const minutes = hour * 60 + minute;
  if (hour >= prefs.quietFrom || hour < prefs.quietTo) return out;
  if (!state.onboarded) return out;

  const food = state.food ?? {};
  const meals = food.meals ?? [];
  const custom = food.customFoods ?? [];
  const plan = food.plan && food.plan.weekStart === engine.weekStartOf(iso) ? food.plan : null;
  const dayPlan = plan?.days?.[iso] ?? null;
  const eatenDay = food.eaten?.[iso] ?? {};
  const targets = state.targets;

  // 1) rozdělaný trénink (déle než 3 h) — dřív než připomínka nového
  const aw = state.activeWorkout;
  if (prefs.workout && aw?.startedAt && Date.now() - aw.startedAt > 3 * 3600e3 && hour >= 8) {
    out.push({ key: `unfinished:${iso}`, title: `Rozdělaný trénink ${aw.unit?.name ?? ''}`.trim(), body: 'Dokonči ho v appce, ať se zapíše progrese — nebo ho zahoď.', url: '#today' });
  }

  // 2) trénink dnes: odpoledne, když jsi 2+ dny necvičil a dnes ještě ne
  if (prefs.workout && !aw && hour >= 15 && hour <= 20) {
    const sessions = state.sessions ?? [];
    const last = sessions.at(-1)?.date ?? null;
    const since = last ? daysBetween(last, iso) : 99;
    const todayDone = sessions.some((s) => s.date === iso);
    if (!todayDone && since >= 2) {
      const unit = engine.WEEK_TEMPLATE[sessions.length % engine.WEEK_TEMPLATE.length];
      const sets = unit.exercises.reduce((a, e) => a + e.sets, 0);
      const estMin = Math.round((sets * 2.4 + 8) / 5) * 5;
      out.push({
        key: `workout:${iso}`,
        title: `Dnes ${unit.name}`,
        body: last ? `${unit.exercises.length} cviků · ~${estMin} min. Poslední trénink před ${czDays(since)}.` : `${unit.exercises.length} cviků · ~${estMin} min. První trénink čeká.`,
        url: '#today',
      });
    }
  }

  // 3) vážení: ráno, když je poslední 3+ dny staré
  if (prefs.weigh && hour >= 6 && hour <= 10) {
    const last = state.weighIns?.at(-1)?.date ?? null;
    const since = last ? daysBetween(last, iso) : 99;
    if (since >= 3) {
      out.push({
        key: `weigh:${iso}`,
        title: 'Zvaž se',
        body: last ? `Poslední vážení před ${czDays(since)}. Kalorie se řídí trendem váhy — bez dat stojí.` : 'Zatím žádné vážení — kalorie se řídí trendem váhy.',
        url: '#today',
      });
    }
  }

  // 4) jídlo: 45–180 min po plánovaném čase, pokud není zapsané
  if (prefs.meals && dayPlan) {
    for (const slot of engine.FOOD_SLOTS) {
      const e = dayPlan[slot.id];
      if (!e || eatenDay[slot.id]) continue;
      const slotMin = slot.hour * 60 + slot.minute;
      if (minutes < slotMin + 45 || minutes > slotMin + 180) continue;
      const meal = meals.find((m) => m.id === e.mealId);
      if (!meal) continue;
      const m = engine.roundMacros(engine.mealMacros(meal, custom));
      const p = e.portion ?? 1;
      out.push({
        key: `meal:${iso}:${slot.id}`,
        title: `${slot.label}: ${meal.name}`,
        body: `${Math.round(m.kcal * p)} kcal · ${Math.round(m.p * p)} g bílkovin — snědeno? Ťukni ✓ v appce.`,
        url: '#food',
      });
    }
  }

  // 5) bílkoviny večer: ve 20. hodině, když chybí víc než 30 g
  if (prefs.protein && hour === 20 && targets && (dayPlan || eatenDay.extra?.length)) {
    const eaten = engine.eatenMacros(dayPlan, eatenDay, meals, custom);
    const gap = targets.proteinG - eaten.p;
    if (gap > 30) {
      out.push({
        key: `protein:${iso}`,
        title: `Bílkoviny: ${eaten.p} / ${targets.proteinG} g`,
        body: `Chybí ${gap} g — skyr, tvaroh nebo protein před spaním to zavře.`,
        url: '#food',
      });
    }
  }

  // 6) nový leták: když přišel nový feed a máš z něj něco v nákupu (nebo v jídlech)
  if (prefs.shopping && feed?.fetchedAt && hour >= 8 && hour <= 20 && feed.fetchedAt !== memory.lastFeedNotified) {
    const valid = (feed.items ?? []).filter((it) => !it.validTo || it.validTo >= iso);
    const discounted = engine.matchDiscounts({ items: valid }, custom);
    const n = Object.keys(discounted).length;
    if (n) {
      let body;
      if (plan) {
        const list = engine.shoppingList(plan, meals, custom, discounted).flatMap((g) => g.items).filter((i) => i.discount);
        body = list.length ? `${list.length} položek z tvého nákupu je v akci: ${list.slice(0, 3).map((i) => i.name).join(', ')}${list.length > 3 ? '…' : ''}.` : `${n} tvých potravin je v akci — nákup tento týden nic z toho nemá.`;
      } else if (meals.length) {
        body = `${n} tvých potravin je v akci — naplánuj týden a nákup se z nich poskládá.`;
      }
      if (body) out.push({ key: `shopping:${feed.fetchedAt}`, title: 'Nový leták Lidl', body, url: '#food', feedStamp: feed.fetchedAt });
    }
  }

  return out.filter((n) => !memory.sent?.[n.key]);
}

async function main() {
  if (!TOKEN) { console.log('FITKO_GH_TOKEN chybí — notifikace se neposílají (nastav secret v repozitáři).'); return; }
  if (!VAPID_PRIVATE) { console.log('VAPID_PRIVATE_KEY chybí.'); return; }
  const vapidPublic = (await readFile('vapid.public.txt', 'utf8')).trim();

  const gists = await gh('/gists?per_page=100');
  const meta = gists.find((g) => g.files && g.files[BACKUP_FILE]);
  if (!meta) { console.log('Záloha Fitka na účtu není — appka ještě nic nezálohovala.'); return; }
  const gist = await gh(`/gists/${meta.id}`);
  const state = await gistFile(gist, BACKUP_FILE);
  const memory = (await gistFile(gist, MEMORY_FILE)) ?? { sent: {} };
  memory.sent ??= {};
  const now = pragueNow();
  memory.checkedAt = new Date().toISOString();

  const sub = state?.push?.subscription;
  const save = () => gh(`/gists/${meta.id}`, { method: 'PATCH', body: JSON.stringify({ files: { [MEMORY_FILE]: { content: JSON.stringify(memory, null, 1) } } }) });

  if (!sub?.endpoint) { console.log('Notifikace v appce nejsou zapnuté.'); memory.error = null; await save(); return; }
  if (memory.deadEndpoint === sub.endpoint) { console.log('Subscription je mrtvá — čeká na nové zapnutí v appce.'); await save(); return; }

  // úklid paměti (14 dní)
  const cutoff = Date.now() - 14 * 86400e3;
  for (const [k, at] of Object.entries(memory.sent)) if (new Date(at).getTime() < cutoff) delete memory.sent[k];

  let feed = null;
  try { const r = await fetch(`${PAGES_URL}akce-lidl.json?t=${Date.now()}`); if (r.ok) feed = await r.json(); } catch { /* bez feedu */ }

  const due = dueNotifications(state, now, feed, memory);
  console.log(`${now.iso} ${now.hour}:${String(now.minute).padStart(2, '0')} Praha — kandidátů: ${due.length}`);
  if (!due.length) { memory.error = null; await save(); return; }

  const webpush = require('web-push');
  webpush.setVapidDetails('https://github.com/andreakovandova-del/fitko', vapidPublic, VAPID_PRIVATE);
  for (const n of due.slice(0, MAX_PER_RUN)) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: n.title, body: n.body, tag: n.key, url: `./${n.url ?? ''}` }), { TTL: 3600, urgency: 'normal' });
      memory.sent[n.key] = new Date().toISOString();
      memory.last = { title: n.title, at: memory.sent[n.key] };
      memory.error = null;
      if (n.feedStamp) memory.lastFeedNotified = n.feedStamp;
      console.log('odesláno:', n.title);
    } catch (err) {
      const code = err?.statusCode;
      memory.error = `push ${code ?? ''} ${err?.body ?? err?.message ?? ''}`.trim();
      console.error('chyba odeslání', memory.error);
      if (code === 404 || code === 410) { memory.deadEndpoint = sub.endpoint; break; }
    }
  }
  await save();
}

if (process.argv[1] && /notify\.mjs$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
