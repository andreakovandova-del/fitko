// Testy enginu: node scripts/test-engine.mjs — ověřují výživu pro hubnutí i nabírání,
// bezpečná minima, projekci podle směru cíle, program z preferencí a streak.
import assert from 'node:assert/strict';
import * as e from '../engine.mjs';

const t = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (err) { console.log('FAIL', name, '\n    ', err.message); process.exitCode = 1; } };

const matilda = { name: 'Matilda', sex: 'f', age: 20, heightCm: 165, weightKg: 53, goalWeightKg: 51, pace: 'light', trainingDays: [2, 4], priority: 'balanced' };
const niklas = { ...e.DEFAULT_PROFILE, name: 'Niklas' };

t('BMI a zdravé pásmo', () => {
  assert.equal(e.bmi(53, 165), 19.5);
  assert.equal(e.bmiBand(19.5), 'normal');
  assert.equal(e.minGoalWeightKg(165), 50.5);
  assert.deepEqual(e.healthyWeightRange(165), [50.5, 68]);
});

t('Matilda: hubnutí = deficit pod udržením, nikdy pod floor', () => {
  const tg = e.initialTargets(matilda, 53);
  assert.equal(tg.phase, 'cut');
  const maint = e.maintenanceKcal(matilda, 53);
  assert.ok(tg.kcal < maint, `kcal ${tg.kcal} má být pod udržením ${maint}`);
  assert.ok(tg.kcal >= e.kcalFloor(matilda, 53));
  assert.ok(tg.kcal >= 1500 && tg.kcal <= 1750, `čekám ~1 650 kcal, je ${tg.kcal}`);
  assert.equal(tg.proteinG, 106);
  assert.deepEqual(tg.rateBandPctWk, [-0.4, -0.25]);
});

t('Niklas: nabírání beze změny (BMR × 1,7 + 350)', () => {
  const tg = e.initialTargets(niklas, 85);
  assert.equal(tg.phase, 'bulk');
  assert.equal(tg.kcal, e.roundToStep(e.mifflinStJeor({ ...niklas, weightKg: 85 }) * 1.7 + 350, 50));
  assert.equal(tg.proteinG, 153);
});

t('udržování: do 1 kg rozdílu', () => {
  const tg = e.initialTargets({ ...matilda, goalWeightKg: 53.5 }, 53);
  assert.equal(tg.phase, 'maintain');
});

t('týdenní korekce v hubnutí: moc rychle → přidat, pomalu → ubrat, floor drží', () => {
  const targets = { phase: 'cut', kcal: 1650, proteinG: 106, rateBandPctWk: [-0.4, -0.25] };
  const mk = (rateKgWk) => Array.from({ length: 14 }, (_, i) => ({ date: e.addDays('2026-09-01', i), kg: 53 + (rateKgWk / 7) * i }));
  const fast = e.weeklyAdjustment({ targets, weighIns: mk(-0.5), weeksOnPlan: 4, today: '2026-09-14', kcalMin: 1350 });
  assert.equal(fast.reason, 'too_slow'); // rate pod spodní hranicí pásma = klesá rychleji, než má
  assert.ok(fast.deltaKcal > 0);
  const slow = e.weeklyAdjustment({ targets, weighIns: mk(0), weeksOnPlan: 4, today: '2026-09-14', kcalMin: 1350 });
  assert.equal(slow.reason, 'too_fast');
  assert.ok(slow.deltaKcal < 0);
  const floor = e.weeklyAdjustment({ targets: { ...targets, kcal: 1400 }, weighIns: mk(0), weeksOnPlan: 4, today: '2026-09-14', kcalMin: 1350 });
  assert.equal(floor.newKcal, 1350);
});

t('dosažení cíle a přechod na udržování', () => {
  assert.equal(e.goalReached('cut', 51.1, 51), true);
  assert.equal(e.goalReached('cut', 52, 51), false);
  assert.equal(e.goalReached('bulk', 94.9, 95), true);
  const m = e.maintainTargets(matilda, 51, 1600, -0.2);
  assert.equal(m.phase, 'maintain');
  assert.equal(m.kcal, 1800); // 1600 + 0,2 × 7700 / 7 ≈ 1 820 → 1 800
});

t('projekce podle směru', () => {
  const down = Array.from({ length: 28 }, (_, i) => ({ date: e.addDays('2026-08-01', i), kg: 53 - 0.03 * i }));
  const p = e.projectGoalDate({ weighIns: down, goalKg: 51, today: '2026-08-29', direction: 'lose' });
  assert.equal(p.status, 'ok');
  assert.ok(p.etaDate > '2026-08-29');
  const wrong = e.projectGoalDate({ weighIns: down, goalKg: 60, today: '2026-08-29', direction: 'gain' });
  assert.equal(wrong.status, 'losing');
  const up = down.map((w, i) => ({ date: w.date, kg: 53 + 0.03 * i }));
  assert.equal(e.projectGoalDate({ weighIns: up, goalKg: 51, today: '2026-08-29', direction: 'lose' }).status, 'gaining');
  assert.equal(e.projectGoalDate({ weighIns: up, goalKg: 51, today: '2026-08-29', direction: 'maintain' }).status, 'maintaining');
});

t('milníky podle směru', () => {
  assert.deepEqual(e.nextWeightMilestone(52.6, 53, 51, 'lose'), { targetKg: 52 });
  assert.equal(e.nextWeightMilestone(51.2, 53, 51, 'lose').targetKg, 51);
  assert.equal(e.nextWeightMilestone(50.9, 53, 51, 'lose'), null);
  assert.deepEqual(e.nextWeightMilestone(86.3, 85, 95, 'gain'), { targetKg: 87 });
});

t('streak podle počtu tréninkových dnů', () => {
  assert.equal(e.weekKeepsStreak(4, 5), true);
  assert.equal(e.weekKeepsStreak(3, 5), false);
  assert.equal(e.weekKeepsStreak(2, 2), true);
  assert.equal(e.weekKeepsStreak(1, 2), false);
  assert.equal(e.weekKeepsStreak(3, 3), true);
});

t('program: spodek 2 dny, bez horní části, kolena', () => {
  const p = e.buildProgram({ days: 2, focus: 'lower', upperBody: 'none', avoid: ['knees'] });
  assert.equal(p.length, 2);
  const ids = p.flatMap((d) => d.exercises.map((x) => x.exerciseId));
  assert.ok(!ids.includes('goblet_squat') && !ids.includes('bss'));
  assert.ok(ids.includes('hip_thrust') && ids.includes('leg_press'));
  assert.ok(!ids.includes('lat_pulldown'));
  const vol = e.weeklyVolume(p);
  assert.ok(vol.glutes <= 20 && vol.quads <= 20);
});

t('program: původní PPL zůstává, klíčové cviky z programu', () => {
  const p = e.buildProgram({ days: 5, focus: 'ppl' });
  assert.deepEqual(p.map((d) => d.unit), ['push', 'pull', 'legs', 'upper', 'lower']);
  assert.deepEqual(e.keyExerciseIds(e.buildProgram({ days: 2, focus: 'lower' })).sort(), ['hip_thrust', 'rdl']);
  assert.ok(e.strengthLifts(p).includes('bench'));
});

t('stavy cviků z programu', () => {
  const p = e.buildProgram({ days: 2, focus: 'lower' });
  const st = e.buildInitialExerciseStates({ hip_thrust: { weightKg: 40, reps: 10 } }, p);
  assert.equal(st.hip_thrust.status, 'active');
  assert.ok(st.hip_thrust.loadKg > 0 && st.hip_thrust.loadKg < 40);
  assert.equal(st.goblet_squat.status, 'calibration');
  assert.ok(!st.bench);
});

t('objem: sloty z programu', () => {
  const p = e.buildProgram({ days: 2, focus: 'lower' });
  const picks = e.pickVolumeSlots({}, new Set(), 2, p);
  assert.equal(picks.length, 2);
  assert.ok(picks.every((x) => x.unit.startsWith('glutes')));
});

t('honestPlan hubnutí podle tempa', () => {
  const plan = e.honestPlan({ startWeightKg: 53, goalWeightKg: 51, pace: 'light', fromIso: '2026-09-13' });
  assert.equal(plan.mode, 'cut');
  assert.ok(plan.months >= 2 && plan.months <= 4, `měsíce ${plan.months}`);
});

console.log(process.exitCode ? '\nNĚKTERÉ TESTY SELHALY' : '\nvšechny testy prošly');
