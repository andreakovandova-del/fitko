// Offline test AI plánovače: podklady a kontrola odpovědi bez volání API.
// node scripts/test-plan-ai.mjs (potřebuje npm install --no-save @anthropic-ai/sdk zod)
import assert from 'node:assert/strict';
import * as engine from '../engine.mjs';
import { buildBrief, validateProposal, systemPrompt, userPrompt, nextWeekStart } from './plan-ai.mjs';

const members = { niklas: { name: 'Niklas', kcal: 3600, proteinG: 153, phase: 'bulk' }, matilda: { name: 'Matilda', kcal: 1700, proteinG: 106, phase: 'cut' } };
const household = engine.emptyHousehold();
household.cook['2026-09-07'] = engine.planCookWeek({ weekStart: '2026-09-07', members });
const brief = buildBrief({ weekStart: '2026-09-14', members, household, feed: null, customRecipes: [] });
assert.ok(brief.recipeLines.length >= 40);
assert.equal(brief.recent.length, 4);
assert.ok(userPrompt(brief, '2026-09-14').includes('niklas a matilda'));
assert.ok(systemPrompt().length > 200);
assert.equal(nextWeekStart('2026-09-12'), '2026-09-14');
assert.equal(nextWeekStart('2026-09-13'), '2026-09-14');

// platná odpověď
const good = validateProposal({
  note: 'Kuřecí a kýta jsou v akci.',
  pick: { A: ['kure_curry', 'hovezi_bolognese'], B: ['losos_bataty_spenat', 'panenka_bulgur'], breakfasts: { niklas: ['ovesna_kase_tvaroh', 'skyr_musli_ovoce'], matilda: ['overnight_oats_skyr', 'toast_cottage_vejce'] }, snacks: { niklas: ['protein_banan', 'tvaroh_med_orechy'], matilda: ['skyr_mandle_mandarinka', 'jogurt_jablko_arasidy'] } },
  newRecipes: [],
}, brief, []);
assert.equal(good.ok, false, 'losos vydrží jen 3 dny a nemrazí se — do B nesmí');
const good2 = validateProposal({
  note: 'ok', pick: { A: ['losos_bataty_spenat', 'hovezi_bolognese'], B: ['kure_curry', 'panenka_bulgur'], breakfasts: { niklas: ['ovesna_kase_tvaroh', 'skyr_musli_ovoce'] }, snacks: {} }, newRecipes: [],
}, brief, []);
assert.equal(good2.ok, true);
assert.deepEqual(good2.pick.A, ['losos_bataty_spenat', 'hovezi_bolognese']);
assert.deepEqual(good2.pick.breakfasts.niklas, ['ovesna_kase_tvaroh', 'skyr_musli_ovoce']);
assert.equal(good2.pick.breakfasts.matilda, undefined);

// nový recept: špatné foodId se zahodí, dobrý projde a jde použít v plánu
const withNew = validateProposal({
  note: 'nový', pick: { A: ['kure_gyros_bulgur', 'nova_treska'], B: ['chilli_con_carne', 'panenka_bulgur'], breakfasts: {}, snacks: {} },
  newRecipes: [
    { id: 'nova_treska', name: 'Treska s rýží a zeleninou', kind: 'hlavni', emoji: '🐟', protein: 'ryba', color: 'ryba', prepMin: 10, cookMin: 25, fridgeDays: 3, freezer: false, equipment: ['trouba'], tags: ['rychle'], pantry: ['sůl'], items: [{ foodId: 'treska', grams: 220 }, { foodId: 'ryze', grams: 90 }, { foodId: 'zeleninova_smes', grams: 200 }, { foodId: 'olivovy_olej', grams: 10 }], steps: ['Tresku osol a peč 15 min na 200 °C.', 'Rýži uvař v rýžovaru, zeleninu na pánvi.'] },
    { id: 'spatny', name: 'Nesmysl', kind: 'hlavni', emoji: '❓', protein: 'kure', color: 'maso', prepMin: 5, cookMin: 5, fridgeDays: 3, freezer: true, equipment: [], tags: [], pantry: [], items: [{ foodId: 'neexistuje', grams: 100 }, { foodId: 'ryze', grams: 90 }], steps: ['Něco udělej pořádně.', 'A pak to sněz.'] },
  ],
}, brief, []);
assert.equal(withNew.ok, true);
assert.equal(withNew.newRecipes.length, 1);
assert.equal(withNew.newRecipes[0].id, 'nova_treska');
assert.deepEqual(withNew.pick.A, ['kure_gyros_bulgur', 'nova_treska']);
const plan = engine.planCookWeek({ weekStart: '2026-09-14', members, customRecipes: withNew.newRecipes, pick: withNew.pick });
assert.deepEqual(plan.sessions[0].dishes.map((d) => d.recipeId), ['kure_gyros_bulgur', 'nova_treska']);
console.log('plan-ai: testy prošly');
