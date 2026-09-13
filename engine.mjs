// ===== src/engine/util.js =====
// Sdílené utility enginu — čisté funkce, žádné závislosti.

export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

export function floorToStep(value, step) {
  return Math.floor(value / step + 1e-9) * step;
}

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function avg(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function daysBetween(isoA, isoB) {
  return Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86400000);
}

export function addDays(iso, days) {
  const d = new Date(Date.parse(iso) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

// Lineární regrese přes body {x, y} → {slope, intercept}; slope v jednotkách y na 1 x.
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = avg(points.map((p) => p.x));
  const my = avg(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

// Trend časové řady [{date: 'YYYY-MM-DD', value}] za posledních windowDays dní.
// Vrací sklon v jednotkách hodnoty za den, nebo null při nedostatku dat.
export function seriesTrendPerDay(series, windowDays, minPoints = 4) {
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted[sorted.length - 1].date;
  const windowed = sorted.filter((p) => daysBetween(p.date, end) < windowDays);
  if (windowed.length < minPoints) return null;
  const reg = linearRegression(
    windowed.map((p) => ({ x: daysBetween(windowed[0].date, p.date), y: p.value })),
  );
  return reg ? reg.slope : null;
}

// Průměr hodnot řady v okně <endExclusiveDaysBack, startDaysBack> dní od posledního záznamu.
export function windowAvg(series, startDaysBack, endExclusiveDaysBack) {
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted[sorted.length - 1].date;
  const values = sorted
    .filter((p) => {
      const back = daysBetween(p.date, end);
      return back >= startDaysBack && back < endExclusiveDaysBack;
    })
    .map((p) => p.value);
  return values.length ? avg(values) : null;
}


// ===== src/engine/program.js =====
// Kurátorovaný program — jediný zdroj pravdy o cvicích a týdenní šabloně.
// Čísla odpovídají docs/PROGRAM.md; nic z toho negeneruje model.

// type: 'heavy' = těžký osový compound (RIR 2–3), 'secondary' = sekundární compound (RIR 1–2),
// 'isolation' = izolace/stroj (RIR 0–1). incrementRule řídí zaokrouhlování a 10% pravidlo.
export const EXERCISES = {
  bench: {
    id: 'bench', name: 'Bench press', type: 'heavy', key: true,
    muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
    repRange: [5, 8], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Základní horizontální tlak — nejvíc prozkoumaný cvik na prsa, snadná progrese po 2,5 kg.',
    how: 'Lopatky stažené k sobě a dolů, chodidla pevně na zemi. Osu spouštěj na spodní hrudník, lokty ~45° od těla. Dole se nedopružuj o hrudník.',
    substitutes: ['db_bench'],
  },
  ohp: {
    id: 'ohp', name: 'Tlaky nad hlavu ve stoje', type: 'heavy', key: true,
    muscles: { primary: ['front_delts'], secondary: ['triceps', 'side_delts'] },
    repRange: [5, 8], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Základní vertikální tlak — ramena a stabilita trupu, přenáší se do všech tlaků.',
    how: 'Zpevni břicho i hýždě, žebra dolů. Osa jde těsně kolem nosu, hlava se v půlce protlačí vpřed — nahoře propni a zamkni.',
    substitutes: ['db_press'],
  },
  incline_db: {
    id: 'incline_db', name: 'Tlaky na šikmé lavici (jednoručky)', type: 'secondary',
    muscles: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Doplněk benche z jiného úhlu (horní prsa), jednoručky = delší dráha a symetrie.',
    how: 'Lavice na 30°. Jednoručky spouštěj ke klíčním kostem, lokty 45°. Dole cítíš protažení prsou, nahoře je nepokládej k sobě.',
    substitutes: ['bench'],
  },
  lat_raise: {
    id: 'lat_raise', name: 'Upažování (jednoručky)', type: 'isolation', dropset: true,
    muscles: { primary: ['side_delts'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 2, incrementRule: 'dumbbell',
    why: 'Střední hlava ramen nedostává přímou práci z tlaků — a dělá šířku ramen.',
    how: 'Mírný předklon, lokty vedou pohyb nahoru do výšky ramen. Netočíš zápěstím ani nehoupeš trupem — dolů pomalu.',
    substitutes: ['cable_lat_raise'],
  },
  triceps_pushdown: {
    id: 'triceps_pushdown', name: 'Stahování kladky na triceps', type: 'isolation', dropset: true,
    muscles: { primary: ['triceps'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Izolace tricepsu s nízkou únavovou cenou — sem patří práce blízko selhání i dropsety.',
    how: 'Lokty přilepené k tělu, hýbe se jen předloktí. Dole plně propni a na půl vteřiny zastav.',
    substitutes: ['oh_triceps'],
  },
  pullup: {
    id: 'pullup', name: 'Shyby', type: 'secondary', key: true,
    muscles: { primary: ['back'], secondary: ['biceps'] },
    repRange: [5, 10], rir: [1, 2], increment: 2.5, incrementRule: 'bodyweight',
    why: 'Nejlepší poměr výkon/čas pro šířku zad; progrese opakováními, pak přídavnou zátěží.',
    how: 'Start z úplného zavěšení, ramena aktivní. Táhni lokty k bokům a hrudník k hrazdě, dolů kontrolovaně.',
    substitutes: ['lat_pulldown'],
  },
  bb_row: {
    id: 'bb_row', name: 'Přítahy velké činky v předklonu', type: 'heavy', key: true,
    muscles: { primary: ['back'], secondary: ['biceps', 'rear_delts'] },
    repRange: [6, 10], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Tloušťka zad a zpevnění celého zadního řetězce; drž RIR 2–3, technika je tu limit.',
    how: 'Trup ~45°, záda rovná, břicho zpevněné. Táhni osu k pupku, lokty podél těla — netrhej to zády.',
    substitutes: ['chest_row'],
  },
  lat_pulldown: {
    id: 'lat_pulldown', name: 'Stahování horní kladky', type: 'secondary',
    muscles: { primary: ['back'], secondary: ['biceps'] },
    repRange: [8, 12], rir: [1, 2], increment: 5, incrementRule: 'stack',
    why: 'Doplňkový objem na šířku zad bez limitu vlastní váhy.',
    how: 'Hrudník vzhůru, mírný záklon. Táhni lokty dolů k bokům, tyč ke klíčním kostem, nahoře nech lopatky vyjet.',
    substitutes: ['pullup'],
  },
  face_pull: {
    id: 'face_pull', name: 'Face pulls', type: 'isolation',
    muscles: { primary: ['rear_delts'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Zadní delty + zdraví ramen — protiváha všem tlakům.',
    how: 'Kladka ve výšce obličeje. Táhni lano k čelu a rozevři lokty do stran, na vteřinu stiskni lopatky.',
    substitutes: ['reverse_fly'],
  },
  bb_curl: {
    id: 'bb_curl', name: 'Bicepsový zdvih (velká/EZ činka)', type: 'isolation',
    muscles: { primary: ['biceps'], secondary: [] },
    repRange: [8, 12], rir: [0, 1], increment: 2.5, incrementRule: 'barbell',
    why: 'Biceps roste z tahů jen částečně — přímá práce je potřeba.',
    how: 'Lokty u těla a nehýbou se dopředu. Nahoře stiskni biceps, dolů pomalu a paže plně propni.',
    substitutes: ['db_curl'],
  },
  squat: {
    id: 'squat', name: 'Dřep (velká činka)', type: 'heavy', key: true,
    muscles: { primary: ['quads'], secondary: ['hams_glutes'] },
    repRange: [5, 8], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Základ dolní poloviny — kvadricepsy, hýždě a nejvyšší systémový stimul.',
    how: 'Osa na horní části zad, chodidla na šířku ramen, špičky mírně ven. Kolena tlač ven přes špičky, dolů pod paralelu.',
    substitutes: ['hack_squat', 'leg_press'],
  },
  rdl: {
    id: 'rdl', name: 'Rumunský mrtvý tah', type: 'heavy', key: true,
    muscles: { primary: ['hams_glutes'], secondary: [] }, // vzpřimovače ≠ objem na šířku zad
    repRange: [6, 10], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Hamstringy přes protažení pod zátěží — nejsilnější hypertrofický podnět pro zadní stehna.',
    how: 'Kolena lehce pokrčená a fixní, posílej boky vzad. Osa klouže po stehnech, záda rovná — dolů, dokud táhne v hamstringách.',
    substitutes: ['leg_curl'],
  },
  leg_press: {
    id: 'leg_press', name: 'Leg press', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['hams_glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 5, incrementRule: 'stack',
    why: 'Objem na kvadricepsy bez axiální zátěže — doplňuje dřep, nekonkuruje mu.',
    how: 'Chodidla na šířku ramen ve středu plošiny, záda i pánev přilepené. Kolena spouštěj k hrudi, nahoře nepropínej naplno.',
    substitutes: ['hack_squat'],
  },
  calf_stand: {
    id: 'calf_stand', name: 'Výpony ve stoje', type: 'isolation',
    muscles: { primary: ['calves'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Lýtka potřebují přímou práci a plný rozsah s pauzou dole.',
    how: 'Plný rozsah: dole nech patu klesnout co nejníž, nahoře vteřinová výdrž na špičce.',
    substitutes: ['calf_seated'],
  },
  cable_crunch: {
    id: 'cable_crunch', name: 'Sklapovačky na kladce', type: 'isolation',
    muscles: { primary: ['abs'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Břicho je sval jako každý jiný — progresivní zátěž, ne stovky sklapovaček.',
    how: 'Klek pod kladkou, lano u hlavy. Kulať páteř a táhni lokty ke kolenům břichem — ne rukama.',
    substitutes: ['hanging_leg_raise'],
  },
  dips: {
    id: 'dips', name: 'Dipy', type: 'secondary',
    muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
    repRange: [6, 10], rir: [1, 2], increment: 2.5, incrementRule: 'bodyweight',
    why: 'Druhý zásah prsou a tricepsů v týdnu; progrese přídavnou zátěží.',
    how: 'Mírný předklon (svisle = víc triceps), lokty vzad. Dolů, dokud ramena nejsou pod lokty; dole nezůstávej viset.',
    substitutes: ['close_bench'],
  },
  cable_row: {
    id: 'cable_row', name: 'Přítahy spodní kladky v sedě', type: 'secondary',
    muscles: { primary: ['back'], secondary: ['biceps', 'rear_delts'] },
    repRange: [8, 12], rir: [1, 2], increment: 5, incrementRule: 'stack',
    why: 'Druhý zásah tloušťky zad bez nároků na spodní záda po přítazích s činkou.',
    how: 'Hrudník vzhůru, záda rovná. Táhni rukojeť k pupku a stiskni lopatky, dopředu je nech kontrolovaně rozjet.',
    substitutes: ['chest_row'],
  },
  db_press: {
    id: 'db_press', name: 'Tlaky s jednoručkami v sedě', type: 'secondary',
    muscles: { primary: ['front_delts'], secondary: ['triceps', 'side_delts'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Druhý zásah ramen v týdnu, šetrnější varianta tlaku.',
    how: 'Sedni si opřený, jednoručky ve výšce uší. Tlač nahoru a lehce k sobě, dole nepouštěj pod bradu.',
    substitutes: ['ohp'],
  },
  db_curl: {
    id: 'db_curl', name: 'Bicepsový zdvih s jednoručkami', type: 'isolation',
    muscles: { primary: ['biceps'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 2, incrementRule: 'dumbbell',
    why: 'Druhý zásah bicepsu, supinace navíc oproti velké čince.',
    how: 'Start v neutrále, při zvedání otoč dlaň vzhůru (supinace). Lokty u těla, dolů pomalu.',
    substitutes: ['bb_curl'],
  },
  oh_triceps: {
    id: 'oh_triceps', name: 'Extenze na triceps nad hlavou (kladka)', type: 'isolation',
    muscles: { primary: ['triceps'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Dlouhá hlava tricepsu pracuje nejvíc v protažení — doplněk stahování kladky.',
    how: 'Lano nad hlavou, lokty míří vpřed a nehýbou se. Protáhni triceps za hlavou, nahoře plně propni.',
    substitutes: ['triceps_pushdown'],
  },
  deadlift: {
    id: 'deadlift', name: 'Mrtvý tah (velká činka)', type: 'heavy', key: true,
    muscles: { primary: ['hams_glutes'], secondary: [] }, // vzpřimovače ≠ objem na šířku zad
    repRange: [5, 8], rir: [2, 3], increment: 5, incrementRule: 'barbell',
    why: 'Celý zadní řetězec + úchop; nikdy do selhání — poslední opakování musí být čisté.',
    how: 'Osa nad středem chodidla, hrudník vzhůru, záda rovná. Zatlač nohama do země, osa klouže po holeních — každé opakování čistě.',
    substitutes: ['rdl'],
  },
  bss: {
    id: 'bss', name: 'Bulharské dřepy', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['hams_glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Jednostranná práce nohou — kvadricepsy a hýždě, vyrovnává stranové rozdíly.',
    how: 'Zadní noha na lavici, přední chodidlo dost daleko vpřed. Klesej svisle, tlač přes patu přední nohy.',
    substitutes: ['hack_squat', 'lunges'],
  },
  leg_curl: {
    id: 'leg_curl', name: 'Zakopávání (leg curl)', type: 'isolation', dropset: true,
    muscles: { primary: ['hams_glutes'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Hamstringy přes ohyb kolene — funkce, kterou mrtvé tahy nepokryjí.',
    how: 'Boky přilepené k podložce. Nahoře stiskni a na vteřinu zastav, dolů brzdi.',
    substitutes: ['rdl'],
  },
  calf_seated: {
    id: 'calf_seated', name: 'Výpony v sedě', type: 'isolation',
    muscles: { primary: ['calves'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Soleus pracuje nejvíc s pokrčeným kolenem — doplněk výponů ve stoje.',
    how: 'Kolena v pravém úhlu, plný rozsah — dole protažení, nahoře výdrž.',
    substitutes: ['calf_stand'],
  },
  hanging_leg_raise: {
    id: 'hanging_leg_raise', name: 'Zvedání nohou ve visu', type: 'isolation',
    muscles: { primary: ['abs'], secondary: [] },
    repRange: [8, 15], rir: [0, 1], increment: 2.5, incrementRule: 'bodyweight',
    why: 'Spodní část břicha + úchop; progrese opakováními a zpomalením.',
    how: 'Ve visu, ramena aktivní. Zvedej nohy podsazením pánve, ne švihem — dolů pomalu.',
    substitutes: ['cable_crunch'],
  },
  // Cviky dostupné jen přes progresi objemu (SLOTY) nebo náhrady:
  cable_fly: {
    id: 'cable_fly', name: 'Rozpažky na kladce', type: 'isolation', dropset: true,
    muscles: { primary: ['chest'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Izolace prsou přes protažení — slot pro růst objemu bez další zátěže ramen.',
    how: 'Kladky ve výšce ramen, lokty lehce pokrčené a fixní. Ruce veď obloukem před tělo a vpředu stiskni.',
    substitutes: ['incline_db'],
  },
  hammer_curl: {
    id: 'hammer_curl', name: 'Hammer curls', type: 'isolation',
    muscles: { primary: ['biceps'], secondary: [] },
    repRange: [10, 15], rir: [0, 1], increment: 2, incrementRule: 'dumbbell',
    why: 'Brachialis a předloktí — šířka paže; slot pro růst objemu.',
    how: 'Neutrální úchop (palce nahoru), lokty u těla. Nahoře stiskni, dolů pomalu.',
    substitutes: ['db_curl'],
  },
  leg_ext: {
    id: 'leg_ext', name: 'Předkopávání', type: 'isolation', dropset: true,
    muscles: { primary: ['quads'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Izolace kvadricepsů bez systémové únavy; slot pro růst objemu.',
    how: 'Opři se zády, kolena v ose stroje. Nahoře plně propni a zastav, dolů brzdi.',
    substitutes: ['leg_press'],
  },
  db_bench: {
    id: 'db_bench', name: 'Tlaky s jednoručkami na rovné lavici', type: 'secondary',
    muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Náhrada benche, když je lavice obsazená.',
    how: 'Lopatky stažené, jednoručky ke spodnímu hrudníku, lokty 45°. Dole cítíš protažení.',
    substitutes: ['bench'],
  },
  chest_row: {
    id: 'chest_row', name: 'Přítahy s oporou hrudníku', type: 'secondary',
    muscles: { primary: ['back'], secondary: ['biceps', 'rear_delts'] },
    repRange: [8, 12], rir: [1, 2], increment: 5, incrementRule: 'stack',
    why: 'Náhrada přítahů bez nároků na spodní záda.',
    how: 'Hrudník opřený o opěrku. Táhni lokty vzad k bokům a stiskni lopatky.',
    substitutes: ['bb_row', 'cable_row'],
  },
  hack_squat: {
    id: 'hack_squat', name: 'Hacken dřep', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['hams_glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 5, incrementRule: 'stack',
    why: 'Náhrada dřepu/bulharů — kvadricepsy s oporou zad.',
    how: 'Záda a pánev na opěrce, chodidla ve středu plošiny. Dolů pod paralelu, kolena ven.',
    substitutes: ['leg_press'],
  },
  close_bench: {
    id: 'close_bench', name: 'Tlaky úzkým úchopem', type: 'secondary',
    muscles: { primary: ['triceps'], secondary: ['chest', 'front_delts'] },
    repRange: [6, 10], rir: [1, 2], increment: 2.5, incrementRule: 'barbell',
    why: 'Náhrada dipů, když nejsou bradla nebo bolí ramena.',
    how: 'Úchop na šířku ramen (ne užší), lokty těsně u těla. Osa na spodní hrudník, nahoře propni.',
    substitutes: ['dips'],
  },
  cable_lat_raise: {
    id: 'cable_lat_raise', name: 'Upažování na kladce', type: 'isolation', dropset: true,
    muscles: { primary: ['side_delts'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 2.5, incrementRule: 'stack',
    why: 'Náhrada upažování — konstantní napětí i dole.',
    how: 'Kladka dole za tělem, upažuj s pevným loktem do výšky ramen. Napětí drž celou dobu.',
    substitutes: ['lat_raise'],
  },
  reverse_fly: {
    id: 'reverse_fly', name: 'Rozpažky v předklonu', type: 'isolation',
    muscles: { primary: ['rear_delts'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 2, incrementRule: 'dumbbell',
    why: 'Náhrada face pulls.',
    how: 'Předklon s rovnými zády, lokty lehce pokrčené. Rozpaž do stran a stiskni lopatky.',
    substitutes: ['face_pull'],
  },
  lunges: {
    id: 'lunges', name: 'Výpady s jednoručkami', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['hams_glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Náhrada bulharských dřepů.',
    how: 'Krok vpřed, koleno zadní nohy k zemi. Trup vzpřímený, tlač přes patu přední nohy.',
    substitutes: ['bss'],
  },

  // ---------- spodek těla a hýždě (program „Spodek“) ----------
  hip_thrust: {
    id: 'hip_thrust', name: 'Hip thrust (osa)', type: 'heavy', key: true,
    muscles: { primary: ['glutes'], secondary: ['hams_glutes'] },
    repRange: [6, 10], rir: [2, 3], increment: 2.5, incrementRule: 'barbell',
    why: 'Nejsilnější cvik na hýždě s nejvyšším napětím v plném stahu — základ programu na spodek.',
    how: 'Lopatky opřené o lavici, osa (s polstrem) přes boky, chodidla tak, aby v horní poloze byla kolena v 90°. Nahoře brada k hrudníku, pánev podsadit, zadek stáhnout na vteřinu. Dolů kontrolovaně.',
    substitutes: ['glute_bridge'],
  },
  glute_bridge: {
    id: 'glute_bridge', name: 'Glute bridge (jednoručka)', type: 'secondary',
    muscles: { primary: ['glutes'], secondary: ['hams_glutes'] },
    repRange: [10, 15], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Stejný pohyb jako hip thrust, ale ze země — bezpečnější pro záda a jde dělat kdekoli.',
    how: 'Leh na zádech, chodidla na šířku boků, jednoručka přes boky. Zatlač patami, nahoře stáhni zadek a vydrž vteřinu. Bedra neprohýbej.',
    substitutes: ['hip_thrust'],
  },
  goblet_squat: {
    id: 'goblet_squat', name: 'Goblet dřep (jednoručka)', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Dřep, který se sám hlídá: jednoručka před hrudníkem drží trup vzpřímený a učí správnou hloubku.',
    how: 'Jednoručku drž svisle u hrudníku, chodidla mírně ven. Dřepni mezi kolena tak hluboko, jak drží rovná záda, lokty jdou dovnitř kolen. Nahoru přes celé chodidlo.',
    substitutes: ['leg_press', 'hack_squat'],
  },
  sumo_db_squat: {
    id: 'sumo_db_squat', name: 'Sumo dřep (jednoručka)', type: 'secondary',
    muscles: { primary: ['glutes'], secondary: ['quads'] },
    repRange: [10, 15], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Široký postoj přesouvá práci z kvadricepsů na hýždě a vnitřní stehna.',
    how: 'Široký postoj, špičky ven 30–45°, jednoručka visí mezi nohama. Kolena tlač ven ve směru špiček, dole zastav, nahoře stáhni zadek.',
    substitutes: ['goblet_squat'],
  },
  hip_abduction: {
    id: 'hip_abduction', name: 'Abdukce (stroj)', type: 'isolation', dropset: true,
    muscles: { primary: ['glutes'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Střední hýžďový sval (gluteus medius) — tvar boků a stabilita kolen, nic jiného ho tak přímo nezasáhne.',
    how: 'Mírný předklon trupu, kolena tlač ven proti odporu až do plného rozsahu, na vteřinu vydrž, zpátky pomalu. Bez švihu.',
    substitutes: ['cable_kickback'],
  },
  cable_kickback: {
    id: 'cable_kickback', name: 'Zakopávání na kladce (kickback)', type: 'isolation',
    muscles: { primary: ['glutes'], secondary: ['hams_glutes'] },
    repRange: [12, 15], rir: [0, 1], increment: 5, incrementRule: 'stack',
    why: 'Izolace velkého hýžďového svalu v protažení i ve stahu; nízká únava, dobře se zaostřuje na cílový sval.',
    how: 'Manžeta na kotníku, ruce opřené o stroj, lehký předklon. Nohu veď dozadu a mírně nahoru z hýždě, ne z beder; nahoře vteřinu stáhni. Střídej nohy, počítej na každou.',
    substitutes: ['glute_bridge'],
  },
  step_up: {
    id: 'step_up', name: 'Výstupy na bednu (jednoručky)', type: 'secondary',
    muscles: { primary: ['quads'], secondary: ['glutes'] },
    repRange: [8, 12], rir: [1, 2], increment: 2, incrementRule: 'dumbbell',
    why: 'Jednostranný cvik na stehna a hýždě šetrný ke kolenům — výška bedny řídí náročnost.',
    how: 'Bedna po koleno. Celé chodidlo na bedně, vystup tlakem přes patu bez odrazu druhou nohou. Dolů pomalu. Počítej na každou nohu.',
    substitutes: ['bss', 'lunges'],
  },
  back_extension: {
    id: 'back_extension', name: 'Hyperextenze (hýždě)', type: 'isolation',
    muscles: { primary: ['hams_glutes'], secondary: ['glutes'] },
    repRange: [10, 15], rir: [0, 1], increment: 2.5, incrementRule: 'bodyweight',
    why: 'Zadní řetězec bez zátěže na páteř; s kotoučem na hrudi jde progredovat dlouho.',
    how: 'Polstr pod pánevními kostmi, špičky mírně ven. Dolů s rovnými zády, nahoru stahem hýždí jen do roviny — nepřepínej. Kotouč u hrudníku = přídavná zátěž.',
    substitutes: ['rdl'],
  },
  leg_raise_floor: {
    id: 'leg_raise_floor', name: 'Zvedání nohou vleže', type: 'isolation',
    muscles: { primary: ['abs'], secondary: [] },
    repRange: [12, 15], rir: [0, 1], increment: 2.5, incrementRule: 'bodyweight',
    why: 'Spodní břicho bez nářadí; když je snadné, zpomal spouštění nebo přidej kotouč mezi kotníky.',
    how: 'Leh, dlaně pod zadkem, bedra přitisknutá k zemi. Nohy zvedej propnuté do svislé polohy a spouštěj pomalu těsně nad zem — bedra se nesmí zvednout.',
    substitutes: ['cable_crunch'],
  },
};

// Týdenní šablona: pořadí jednotek a cviků, výchozí počty pracovních sérií.
export const WEEK_TEMPLATE = [
  {
    unit: 'push', name: 'Push',
    exercises: [
      { exerciseId: 'bench', sets: 3 },
      { exerciseId: 'ohp', sets: 3 },
      { exerciseId: 'incline_db', sets: 3 },
      { exerciseId: 'lat_raise', sets: 3, dropsetLast: true },
      { exerciseId: 'triceps_pushdown', sets: 3, dropsetLast: true },
    ],
    slots: [
      { kind: 'add_exercise', exerciseId: 'cable_fly', sets: 2 },
      { kind: 'add_set', exerciseId: 'lat_raise' },
    ],
  },
  {
    unit: 'pull', name: 'Pull',
    exercises: [
      { exerciseId: 'pullup', sets: 3 },
      { exerciseId: 'bb_row', sets: 3 },
      { exerciseId: 'lat_pulldown', sets: 2 },
      { exerciseId: 'face_pull', sets: 2 },
      { exerciseId: 'bb_curl', sets: 3 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'lat_pulldown' },
      { kind: 'add_set', exerciseId: 'face_pull' },
      { kind: 'add_exercise', exerciseId: 'hammer_curl', sets: 2 },
    ],
  },
  {
    unit: 'legs', name: 'Legs',
    exercises: [
      { exerciseId: 'squat', sets: 3 },
      { exerciseId: 'rdl', sets: 3 },
      { exerciseId: 'leg_press', sets: 3 },
      { exerciseId: 'calf_stand', sets: 3 },
      { exerciseId: 'cable_crunch', sets: 3 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'leg_press' },
      { kind: 'add_set', exerciseId: 'calf_stand' },
      { kind: 'add_set', exerciseId: 'cable_crunch' },
    ],
  },
  {
    unit: 'upper', name: 'Upper',
    exercises: [
      { exerciseId: 'dips', sets: 3 },
      { exerciseId: 'cable_row', sets: 3 },
      { exerciseId: 'db_press', sets: 2 },
      { exerciseId: 'lat_raise', sets: 2, dropsetLast: true },
      { exerciseId: 'db_curl', sets: 2 },
      { exerciseId: 'oh_triceps', sets: 2 },
    ],
    slots: [
      { kind: 'add_exercise', exerciseId: 'cable_fly', sets: 2 },
      { kind: 'add_set', exerciseId: 'cable_row' },
      { kind: 'add_set', exerciseId: 'db_curl' },
      { kind: 'add_set', exerciseId: 'oh_triceps' },
    ],
  },
  {
    unit: 'lower', name: 'Lower',
    exercises: [
      { exerciseId: 'deadlift', sets: 3 },
      { exerciseId: 'bss', sets: 3 },
      { exerciseId: 'leg_curl', sets: 3, dropsetLast: true },
      { exerciseId: 'calf_seated', sets: 3 },
      { exerciseId: 'hanging_leg_raise', sets: 3 },
    ],
    slots: [
      { kind: 'add_exercise', exerciseId: 'leg_ext', sets: 2 },
      { kind: 'add_set', exerciseId: 'leg_curl' },
      { kind: 'add_set', exerciseId: 'hanging_leg_raise' },
    ],
  },
];

export const VOLUME_LIMITS = {
  weeklyCapPerMuscle: 20, // tvrdých sérií/partie/týden (strop progrese)
  sessionCapPerMuscle: 10, // sérií na partii v jedné jednotce
  startBandLarge: [9, 12], // startovní přímé série velkých partií
};

// ---------- program z preferencí ----------
// Stavební bloky dnů. Push/Pull/Legs/Upper/Lower jsou původní šablona (Niklas),
// „Spodek A/B/C“ je program na hýždě a stehna (Matilda), „Celé tělo“ pro 2–3 dny.
// `upper` = doplněk horní části pro dny spodku (jen když si ho uživatel zapne).

export const DAY_BLOCKS = {
  push: WEEK_TEMPLATE[0],
  pull: WEEK_TEMPLATE[1],
  legs: WEEK_TEMPLATE[2],
  upper: WEEK_TEMPLATE[3],
  lower: WEEK_TEMPLATE[4],
  glutes_a: {
    unit: 'glutes_a', name: 'Spodek A',
    exercises: [
      { exerciseId: 'hip_thrust', sets: 3 },
      { exerciseId: 'goblet_squat', sets: 3 },
      { exerciseId: 'rdl', sets: 3 },
      { exerciseId: 'hip_abduction', sets: 3, dropsetLast: true },
      { exerciseId: 'cable_crunch', sets: 3 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'hip_abduction' },
      { kind: 'add_exercise', exerciseId: 'glute_bridge', sets: 2 },
      { kind: 'add_set', exerciseId: 'cable_crunch' },
    ],
    upper: [{ exerciseId: 'lat_pulldown', sets: 2 }],
  },
  glutes_b: {
    unit: 'glutes_b', name: 'Spodek B',
    exercises: [
      { exerciseId: 'bss', sets: 3 },
      { exerciseId: 'leg_press', sets: 3 },
      { exerciseId: 'leg_curl', sets: 3, dropsetLast: true },
      { exerciseId: 'cable_kickback', sets: 3 },
      { exerciseId: 'leg_raise_floor', sets: 3 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'leg_curl' },
      { kind: 'add_set', exerciseId: 'cable_kickback' },
      { kind: 'add_exercise', exerciseId: 'calf_stand', sets: 2 },
    ],
    upper: [{ exerciseId: 'face_pull', sets: 2 }],
  },
  glutes_c: {
    unit: 'glutes_c', name: 'Spodek C',
    exercises: [
      { exerciseId: 'sumo_db_squat', sets: 3 },
      { exerciseId: 'hip_thrust', sets: 3 },
      { exerciseId: 'step_up', sets: 3 },
      { exerciseId: 'back_extension', sets: 3 },
      { exerciseId: 'hanging_leg_raise', sets: 2 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'hip_thrust' },
      { kind: 'add_set', exerciseId: 'back_extension' },
      { kind: 'add_exercise', exerciseId: 'leg_ext', sets: 2 },
    ],
    upper: [{ exerciseId: 'cable_row', sets: 2 }, { exerciseId: 'db_press', sets: 2 }],
  },
  upper_lite: {
    unit: 'upper_lite', name: 'Horní (lehce)',
    exercises: [
      { exerciseId: 'lat_pulldown', sets: 3 },
      { exerciseId: 'db_press', sets: 3 },
      { exerciseId: 'cable_row', sets: 3 },
      { exerciseId: 'face_pull', sets: 2 },
      { exerciseId: 'lat_raise', sets: 2 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'lat_pulldown' },
      { kind: 'add_set', exerciseId: 'face_pull' },
    ],
  },
  full_a: {
    unit: 'full_a', name: 'Celé tělo A',
    exercises: [
      { exerciseId: 'squat', sets: 3 },
      { exerciseId: 'bench', sets: 3 },
      { exerciseId: 'cable_row', sets: 3 },
      { exerciseId: 'rdl', sets: 2 },
      { exerciseId: 'cable_crunch', sets: 2 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'cable_row' },
      { kind: 'add_exercise', exerciseId: 'lat_raise', sets: 2 },
    ],
  },
  full_b: {
    unit: 'full_b', name: 'Celé tělo B',
    exercises: [
      { exerciseId: 'deadlift', sets: 3 },
      { exerciseId: 'ohp', sets: 3 },
      { exerciseId: 'lat_pulldown', sets: 3 },
      { exerciseId: 'leg_press', sets: 2 },
      { exerciseId: 'hanging_leg_raise', sets: 2 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'lat_pulldown' },
      { kind: 'add_exercise', exerciseId: 'db_curl', sets: 2 },
    ],
  },
  full_c: {
    unit: 'full_c', name: 'Celé tělo C',
    exercises: [
      { exerciseId: 'hip_thrust', sets: 3 },
      { exerciseId: 'incline_db', sets: 3 },
      { exerciseId: 'bb_row', sets: 3 },
      { exerciseId: 'bss', sets: 2 },
      { exerciseId: 'calf_stand', sets: 2 },
    ],
    slots: [
      { kind: 'add_set', exerciseId: 'bb_row' },
      { kind: 'add_exercise', exerciseId: 'triceps_pushdown', sets: 2 },
    ],
  },
};

// Pořadí bloků podle počtu dnů a zaměření.
const PROGRAM_LAYOUTS = {
  lower: {
    2: ['glutes_a', 'glutes_b'],
    3: ['glutes_a', 'glutes_b', 'glutes_c'],
    4: ['glutes_a', 'upper_lite', 'glutes_b', 'glutes_c'],
    5: ['glutes_a', 'upper_lite', 'glutes_b', 'glutes_c', 'upper_lite'],
    6: ['glutes_a', 'upper_lite', 'glutes_b', 'glutes_c', 'upper_lite', 'glutes_a'],
  },
  full: {
    2: ['full_a', 'full_b'],
    3: ['full_a', 'full_b', 'full_c'],
    4: ['upper', 'lower', 'upper', 'lower'],
    5: ['push', 'pull', 'legs', 'upper', 'lower'],
    6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  },
  ppl: {
    2: ['upper', 'lower'],
    3: ['push', 'pull', 'legs'],
    4: ['upper', 'lower', 'upper', 'lower'],
    5: ['push', 'pull', 'legs', 'upper', 'lower'],
    6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  },
};

// Co nahradit při bolavých kolenou, zádech nebo ramenou (cvik → šetrnější varianta).
export const AVOID_SUBSTITUTES = {
  knees: { goblet_squat: 'leg_press', squat: 'leg_press', bss: 'glute_bridge', lunges: 'glute_bridge', step_up: 'hip_thrust', leg_ext: 'hip_abduction', hack_squat: 'leg_press', sumo_db_squat: 'hip_thrust' },
  back: { rdl: 'leg_curl', deadlift: 'hip_thrust', squat: 'leg_press', bb_row: 'chest_row', back_extension: 'leg_curl', goblet_squat: 'leg_press', sumo_db_squat: 'leg_press' },
  shoulders: { ohp: 'lat_raise', db_press: 'face_pull', bench: 'db_bench', incline_db: 'cable_fly', dips: 'triceps_pushdown', lat_raise: 'face_pull' },
};

export const AVOID_LABELS = { knees: 'kolena', back: 'záda', shoulders: 'ramena' };

export const PROGRAM_PREFS_DEFAULT = {
  days: 5,          // 2–6 tréninků týdně
  focus: 'ppl',     // ppl (původní Push/Pull/Legs/Upper/Lower) | lower (spodek a hýždě) | full (celé tělo)
  upperBody: 'full', // u zaměření lower: none | minimal | full
  avoid: [],        // knees | back | shoulders
  dislikes: [],     // id cviků, které uživatel nechce
};

/**
 * Sestaví týdenní šablonu z preferencí. Čistá funkce: stejné preference → stejný
 * program. Původní Push/Pull/Legs/Upper/Lower (5 dnů, ppl) vyjde beze změny.
 */
export function buildProgram(prefs = {}) {
  const p = { ...PROGRAM_PREFS_DEFAULT, ...prefs };
  const days = clamp(Math.round(p.days || 5), 2, 6);
  const layout = (PROGRAM_LAYOUTS[p.focus] ?? PROGRAM_LAYOUTS.ppl)[days];
  const dislikes = new Set(p.dislikes ?? []);
  const avoidMaps = (p.avoid ?? []).map((a) => AVOID_SUBSTITUTES[a]).filter(Boolean);

  const substitute = (id, used) => {
    let cur = id;
    for (let i = 0; i < 4; i++) {
      let next = cur;
      for (const m of avoidMaps) if (m[next]) next = m[next];
      if (dislikes.has(next)) next = (EXERCISES[next]?.substitutes ?? []).find((s) => !dislikes.has(s) && !avoidMaps.some((m) => m[s])) ?? null;
      if (next === cur || next == null) { cur = next; break; }
      cur = next;
    }
    if (!cur || !EXERCISES[cur] || used.has(cur)) return null;
    return cur;
  };

  return layout.map((key) => {
    const block = DAY_BLOCKS[key];
    const used = new Set();
    const exercises = [];
    const source = [...block.exercises];
    if (p.focus === 'lower' && block.upper && p.upperBody !== 'none') source.push(...block.upper);
    for (const ex of source) {
      const id = substitute(ex.exerciseId, used);
      if (!id) continue;
      used.add(id);
      exercises.push({ exerciseId: id, sets: ex.sets, dropsetLast: !!(ex.dropsetLast && EXERCISES[id].dropset) });
    }
    const slots = block.slots
      .map((s) => {
        if (s.kind === 'add_set') return used.has(s.exerciseId) ? { ...s } : null;
        const id = substitute(s.exerciseId, used);
        return id ? { ...s, exerciseId: id } : null;
      })
      .filter(Boolean);
    return { unit: block.unit, name: block.name, exercises, slots };
  });
}

/** Aktuální program uživatele: vlastní (z onboardingu) nebo původní šablona. */
export function programDays(state) {
  const days = state?.program?.days;
  return Array.isArray(days) && days.length ? days : WEEK_TEMPLATE;
}

/** Jméno jednotky pro zobrazení — i pro jednotky, které v programu už nejsou. */
export function unitName(template, unit) {
  return template.find((d) => d.unit === unit)?.name ?? DAY_BLOCKS[unit]?.name ?? unit;
}

// Týdenní objem šablony: přímé série dle primární partie + volitelně 0,5 za sekundární.
export function weeklyVolume(template = WEEK_TEMPLATE, addedSets = {}, { fractional = true } = {}) {
  const out = {};
  const add = (muscle, n) => { out[muscle] = (out[muscle] ?? 0) + n; };
  for (const day of template) {
    for (const ex of day.exercises) {
      const def = EXERCISES[ex.exerciseId];
      const sets = ex.sets + (addedSets[`${day.unit}:${ex.exerciseId}`] ?? 0);
      for (const m of def.muscles.primary) add(m, sets);
      if (fractional) for (const m of def.muscles.secondary) add(m, sets * 0.5);
    }
  }
  return out;
}

// Objem jedné jednotky po partiích (přímé série) — pro kontrolu session capu.
export function sessionVolume(day, addedSets = {}) {
  const out = {};
  for (const ex of day.exercises) {
    const def = EXERCISES[ex.exerciseId];
    const sets = ex.sets + (addedSets[`${day.unit}:${ex.exerciseId}`] ?? 0);
    for (const m of def.muscles.primary) out[m] = (out[m] ?? 0) + sets;
  }
  return out;
}

// Klíčové cviky programu (sledují se pro deload a PR). Bez šablony = celý katalog.
export function keyExerciseIds(template = null) {
  if (!template) return Object.values(EXERCISES).filter((e) => e.key).map((e) => e.id);
  const seen = new Set();
  for (const day of template) for (const ex of day.exercises) if (EXERCISES[ex.exerciseId]?.key) seen.add(ex.exerciseId);
  return [...seen];
}


// ===== src/engine/progression.js =====
// Dvojitá progrese s RIR autoregulací — docs/PROGRAM.md §Progrese zátěže.
// Čisté funkce: stav cviku + historie výkonů → předpis dalšího tréninku.


const STEP_BY_RULE = { barbell: 2.5, dumbbell: 2, stack: 5, bodyweight: 2.5 };
export const MAX_RANGE_EXTENSION = 6; // hi + 6 → dál už jen slot-série
const RELATIVE_JUMP_CAP = 0.10; // přírůstek > 10 % zátěže se nepovoluje

export function loadStep(exDef) {
  return STEP_BY_RULE[exDef.incrementRule] ?? 2.5;
}

// Pracovní série = bez rozcviček a bez dropů (drop na −22 % by rozbil sledování zátěže).
function workingSets(performance) {
  return (performance?.sets ?? []).filter((s) => !s.isWarmup && !s.isDropset);
}

// Série je „tvrdá“, jen když RIR ≤ 4 (PROGRAM §RIR).
export function isHardSet(set) {
  return set.rir == null || set.rir <= 4;
}

// Série „čistě“ splnila strop rozsahu: opakování ≥ hi při cílové rezervě (RIR ≥ spodní cíl).
function setClean(set, hi, rirLo) {
  return set.reps >= hi && (set.rir == null || set.rir >= rirLo);
}

// Série reálně nedosáhla spodní hranice rozsahu i přes plné úsilí (RIR ≤ horní cíl).
function setFailedBottom(set, lo, rirHi) {
  return set.reps < lo && (set.rir == null || set.rir <= rirHi);
}

function sessionLoad(performance) {
  const sets = workingSets(performance);
  return sets.length ? sets[sets.length - 1].weightKg : null;
}

// Povolený přírůstek zátěže, nebo null, když by relativní skok přesáhl 10 %.
export function effectiveIncrement(exDef, loadKg) {
  if (exDef.incrementRule === 'bodyweight') return exDef.increment; // relativní k tělu, vždy OK
  if (loadKg == null || loadKg <= 0) return exDef.increment;
  return exDef.increment / loadKg <= RELATIVE_JUMP_CAP ? exDef.increment : null;
}

/**
 * Předpis dalšího tréninku cviku.
 * @param exDef definice z program.js
 * @param state { loadKg, sets, status: 'calibration'|'active', rangeHi? } — rangeHi = prodloužený strop
 * @param recent výkony cviku, nejnovější první: [{ date, sets: [{weightKg, reps, rir, isWarmup?}] }]
 * @returns { action, loadKg, targetReps[], rangeHi, note }
 *   action: calibrate | increase_load | hold | extend_range | suggest_slot | reduce_load
 *   Volající si po zvolení předpisu uloží loadKg a rangeHi zpět do state.
 */
export function computeNextPrescription(exDef, state, recent = []) {
  const [lo, baseHi] = exDef.repRange;
  const [rirLo, rirHi] = exDef.rir;
  const sets = state.sets ?? 3;
  const hi = state.rangeHi ?? baseHi;

  if (state.status === 'calibration' || state.loadKg == null) {
    // Shyby, dipy, zvedání nohou: „váha" je PŘÍDAVNÁ zátěž, takže vlastní tělo = 0.
    // Uživatel tedy nic nehledá — jen udělá, co zvládne.
    const bodyweight = exDef.incrementRule === 'bodyweight';
    return {
      action: 'calibrate',
      loadKg: bodyweight ? 0 : null,
      rangeHi: baseHi,
      targetReps: Array(sets).fill(Math.round((lo + baseHi) / 2)),
      note: bodyweight ? 'bodyweight_start' : 'find_load',
    };
  }

  const last = recent[0];
  const lastWorking = workingSets(last);
  if (!lastWorking.length) {
    return {
      action: 'hold', loadKg: state.loadKg, rangeHi: hi,
      targetReps: Array(sets).fill(lo), note: 'no_history',
    };
  }

  // 3) Regrese: 2 jednotky po sobě pod spodní hranicí na (zhruba) stejné zátěži → −5 %.
  const lastFailed = lastWorking.some((s) => setFailedBottom(s, lo, rirHi));
  if (lastFailed) {
    const prev = recent[1];
    const prevWorking = workingSets(prev);
    const prevFailed =
      prevWorking.some((s) => setFailedBottom(s, lo, rirHi)) &&
      sessionLoad(prev) != null && sessionLoad(last) != null &&
      sessionLoad(prev) >= sessionLoad(last) - 1e-9;
    if (prevFailed) {
      const step = loadStep(exDef);
      let reduced = floorToStep(state.loadKg * 0.95, step);
      if (reduced >= state.loadKg) reduced = state.loadKg - step;
      return {
        action: 'reduce_load', loadKg: Math.max(reduced, 0), rangeHi: baseHi,
        targetReps: Array(sets).fill(lo), note: 'regression',
      };
    }
    // první zaváhání: drž zátěž, cíl spodní hranice
    return {
      action: 'hold', loadKg: state.loadKg, rangeHi: hi,
      targetReps: Array(sets).fill(lo), note: 'missed_bottom_once',
    };
  }

  // 1) Všechny pracovní série čistě na stropu → zátěž nahoru (nebo prodloužit rozsah).
  const allClean = lastWorking.every((s) => setClean(s, hi, rirLo));
  if (allClean) {
    const inc = effectiveIncrement(exDef, state.loadKg);
    if (inc != null) {
      return {
        action: 'increase_load',
        loadKg: roundToStep(state.loadKg + inc, loadStep(exDef)),
        rangeHi: baseHi,
        targetReps: Array(sets).fill(lo),
        note: null,
      };
    }
    if (hi + 2 <= baseHi + MAX_RANGE_EXTENSION) {
      return {
        action: 'extend_range', loadKg: state.loadKg, rangeHi: hi + 2,
        targetReps: Array(sets).fill(hi + 2), note: 'small_increment_extend',
      };
    }
    // Rozsah je na stropu a menší kotouč než nejmenší krok neexistuje — pak se
    // zátěž zvedne i přes 10% pravidlo, jinak by cvik uvízl navždy.
    return {
      action: 'increase_load',
      loadKg: roundToStep(state.loadKg + exDef.increment, loadStep(exDef)),
      rangeHi: baseHi,
      targetReps: Array(sets).fill(lo),
      note: 'range_maxed_step_up',
    };
  }

  // 2) Jinak drž zátěž a přidávej opakování: každá série, která měla rezervu, +1 (strop hi).
  const targetReps = [];
  for (let i = 0; i < sets; i++) {
    const s = lastWorking[i];
    if (!s) { targetReps.push(lo); continue; }
    const hadReserve = s.rir == null || s.rir >= rirLo;
    const base = Math.max(lo, Math.min(hi, s.reps));
    targetReps.push(hadReserve ? Math.min(hi, base + 1) : base);
  }
  return { action: 'hold', loadKg: state.loadKg, rangeHi: hi, targetReps, note: null };
}

// Aktualizace stavu cviku po odcvičeném tréninku (zdroj pravdy = co uživatel reálně zvedl).
export function nextStateAfterSession(exDef, state, performance, prescription = null) {
  const sets = workingSets(performance);
  if (!sets.length) return { ...state };
  const load = sessionLoad(performance);
  return {
    ...state,
    status: 'active',
    loadKg: load,
    rangeHi: prescription?.rangeHi ?? state.rangeHi ?? exDef.repRange[1],
  };
}

/**
 * Přepočet cílů cviku Z NULY podle zapsaných sérií.
 * Nezapsané série se vrátí na původní předpis, zahodí se staré příznaky a teprve
 * pak se aplikuje predikce + autoregulace. Díky tomu je stav vždy čistou funkcí
 * toho, co je zapsané — odznačení série tedy korektně vrátí i cíle a štítky.
 */
export function recomputeEntryTargets(exDef, entry) {
  const workRows = entry.rows.filter((r) => r.kind === 'work');
  const base = entry.prescription;
  workRows.forEach((r, i) => {
    if (r.logged) return;
    r.target = {
      weightKg: base.loadKg,
      reps: base.targetReps[i] ?? base.targetReps[base.targetReps.length - 1],
    };
    delete r.adjusted;
  });
  return adjustRemainingTargets(exDef, entry.rows);
}

/**
 * Autoregulace UVNITŘ tréninku (PROGRAM §Progrese): po zapsané pracovní sérii
 * uprav cíle zbývajících sérií cviku podle skutečné rezervy.
 *  - velká rezerva (RIR ≥ horní cíl + 2) → další série těžší (přírůstek; když
 *    10% pravidlo skok nepovolí, +2 opakování),
 *  - pod cílovou rezervou (RIR < spodní cíl) → další série drží zátěž a cíl
 *    opakování klesne na to, co reálně šlo; když je cíl už na spodku rozsahu,
 *    ubere se místo toho jeden krok na zátěži ('lighter').
 * Štítek se nastaví JEN když se cíl opravdu změnil — jinak by v UI lhal.
 * Mutuje targets nezapsaných work řádků; vrací 'up' | 'down' | 'lighter' | null.
 */
export function adjustRemainingTargets(exDef, rows) {
  const [lo] = exDef.repRange;
  const [rirLo, rirHi] = exDef.rir;
  const workRows = rows.filter((r) => r.kind === 'work');
  let lastIdx = -1;
  for (let i = 0; i < workRows.length; i++) if (workRows[i].logged) lastIdx = i;
  const logged = lastIdx >= 0 ? workRows[lastIdx].logged : null;
  if (!logged) return null;
  const remaining = workRows.slice(lastIdx + 1).filter((r) => !r.logged);
  if (!remaining.length) return null;

  // Predikce váhy: zbývající série dědí to, co jsi právě reálně zvedl.
  // Pokrývá i kalibraci (cíl byl prázdný) a ruční změnu váhy uprostřed cviku.
  if (logged.weightKg != null) {
    for (const r of remaining) r.target.weightKg = logged.weightKg;
  }

  if (logged.rir == null) return null;

  // chip „4" v UI znamená 4 a víc — práh proto stropujeme na 4
  if (logged.rir >= Math.min(rirHi + 2, 4)) {
    const inc = effectiveIncrement(exDef, logged.weightKg);
    if (inc != null && logged.weightKg > 0) {
      const step = loadStep(exDef);
      for (const r of remaining) {
        r.target.weightKg = roundToStep(logged.weightKg + inc, step);
        r.adjusted = 'up';
      }
    } else {
      for (const r of remaining) {
        r.target.reps = (r.target.reps ?? lo) + 2;
        r.adjusted = 'up';
      }
    }
    return 'up';
  }

  if (logged.rir < rirLo) {
    const repsAfter = (r) => Math.max(lo, Math.min(r.target.reps ?? lo, logged.reps));
    if (remaining.some((r) => repsAfter(r) < (r.target.reps ?? lo))) {
      for (const r of remaining) {
        r.target.reps = repsAfter(r);
        r.adjusted = 'down';
      }
      return 'down';
    }
    // Cíl opakování je už na spodku rozsahu — jediná cesta zpět do cílové rezervy
    // je ubrat na zátěži. Bereme fyzický krok cviku (nejbližší lehčí pár/deska);
    // 10% pravidlo se tu neuplatní, to hlídá jen příliš velké SKOKY NAHORU.
    if (logged.weightKg > 0) {
      const step = loadStep(exDef);
      const lighter = roundToStep(logged.weightKg - exDef.increment, step);
      const floor = exDef.incrementRule === 'bodyweight' ? 0 : step;
      if (lighter >= floor && lighter < logged.weightKg) {
        for (const r of remaining) {
          r.target.weightKg = lighter;
          r.target.reps = lo;
          r.adjusted = 'lighter';
        }
        return 'lighter';
      }
    }
    return null; // nejde ubrat (jen vlastní tělo) → žádný štítek, žádná lež
  }

  return null;
}

// Dropset předpis pro poslední sérii izolace: −20–25 % po pracovní sérii (PROGRAM §Dropsety).
export function dropsetPrescription(exDef, loadKg) {
  if (!exDef.dropset || loadKg == null) return null;
  const step = loadStep(exDef);
  const dropped = Math.min(Math.max(floorToStep(loadKg * 0.775, step), step), loadKg - step);
  // U nejlehčích zátěží (např. 5kg deska) by vyšla 0 nebo záporná váha — pak
  // váhu nenavrhujeme a uživatel ji zapíše sám.
  return { drops: 1, dropLoadKg: dropped > 0 ? dropped : null, toFailure: true };
}


// ===== src/engine/deload.js =====
// Reaktivní deload + pojistka — docs/PROGRAM.md §Deload (žádný fixní kalendářní deload).


// Průměr jen ze skutečně vyplněných políček check-inu (nedokončený den → null,
// jinak by NaN tiše vypnul deload a naopak pustil přidávání objemu).
function dayScore(day) {
  const vals = [day?.sleep, day?.soreness, day?.motivation].filter((v) => typeof v === 'number');
  return vals.length ? avg(vals) : null;
}

export const READINESS_THRESHOLD = 2.5; // průměr check-inu (1–5, 5 = nejlepší)
export const READINESS_DAYS = 3;
export const FAILSAFE_WEEKS = 10; // pásmo 8–12 týdnů tvrdého tréninku

/**
 * Vyhodnocení deload triggerů.
 * @param input {
 *   keyRegressions: string[] — id ★ cviků, u kterých progrese vrátila 'reduce_load' (2× po sobě pod rozsahem),
 *   readinessLog: [{date, sleep, soreness, motivation}] — denní check-in 1–5 (5 = dobré), nejnovější poslední,
 *   weeksSinceDeload: number
 * }
 * @returns { triggered, reasons: [{type, detail}] }
 */
export function detectDeloadTriggers({ keyRegressions = [], readinessLog = [], weeksSinceDeload = 0 }) {
  const reasons = [];

  if (keyRegressions.length >= 2) {
    reasons.push({ type: 'performance', detail: keyRegressions });
  }

  const lastDays = readinessLog.slice(-READINESS_DAYS);
  if (lastDays.length === READINESS_DAYS) {
    const scores = lastDays.map(dayScore);
    const allBad = scores.every((s) => s != null && s < READINESS_THRESHOLD);
    if (allBad) reasons.push({ type: 'readiness', detail: lastDays.map((d) => d.date) });
  }

  if (weeksSinceDeload >= FAILSAFE_WEEKS) {
    reasons.push({ type: 'failsafe', detail: weeksSinceDeload });
  }

  return { triggered: reasons.length > 0, reasons };
}

// Deload předpis pro jeden cvik: série −50 % (nahoru), zátěž −25 %, RIR min. 3, žádné dropsety.
export function deloadPrescription(exDef, state, loadStepFn) {
  const sets = Math.ceil((state.sets ?? 3) / 2);
  const step = loadStepFn(exDef);
  const load = state.loadKg == null ? null : Math.max(Math.round((state.loadKg * 0.75) / step) * step, step);
  const [lo, hi] = exDef.repRange;
  return {
    action: 'deload',
    loadKg: load,
    targetReps: Array(sets).fill(Math.round((lo + hi) / 2)),
    rirMin: 3,
    dropsets: false,
  };
}

// Průměrná připravenost za posledních N dní (pro podmínku progrese objemu).
export function readinessAvg(readinessLog, days = 7) {
  const scores = readinessLog.slice(-days).map(dayScore).filter((s) => s != null);
  return scores.length ? avg(scores) : null;
}


// ===== src/engine/volume.js =====
// Podmíněná progrese objemu do SLOTŮ — docs/PROGRAM.md §Progrese objemu.
// Nikdy automatická: engine ji jen NABÍZÍ, když jsou splněné podmínky.


export const VOLUME_CYCLE_WEEKS = 3; // vyhodnocení každé 3–4 týdny
const MIN_READINESS = 3.5;
const MIN_PROGRESSING_SHARE = 0.6;

/**
 * Má engine nabídnout přidání sérií?
 * @param input { weeksSinceVolumeChange, deloadTriggered, readinessAvg7d, progressingShare }
 *   progressingShare = podíl cviků, kde poslední předpisy byly increase_load/extend_range/hold s +opak.
 */
export function shouldOfferVolumeIncrease({
  weeksSinceVolumeChange = 0,
  deloadTriggered = false,
  readinessAvg7d = null,
  progressingShare = 0,
}) {
  if (deloadTriggered) return { offer: false, reason: 'deload' };
  if (weeksSinceVolumeChange < VOLUME_CYCLE_WEEKS) return { offer: false, reason: 'cycle_not_due' };
  if (readinessAvg7d != null && readinessAvg7d < MIN_READINESS) return { offer: false, reason: 'readiness' };
  if (progressingShare < MIN_PROGRESSING_SHARE) return { offer: false, reason: 'not_progressing' };
  return { offer: true, reason: null };
}

// Klíč přidané série: "unit:exerciseId" → počet přidaných sérií (addedSets mapa ve stavu appky).
export function slotKey(unit, exerciseId) {
  return `${unit}:${exerciseId}`;
}

/**
 * Vybere až maxPicks slotů k přidání (+1 série každý), při respektování stropů:
 * ≤ sessionCap přímých sérií na partii v jednotce, ≤ weeklyCap tvrdých sérií na partii týdně,
 * max +2 série na partii v jednom cyklu.
 * @param addedSets aktuální mapa přidaných sérií { "unit:exerciseId": n }
 * @param enabledExercises množina id slot-cviků, které už v plánu jsou (add_exercise se nabízí jen jednou)
 */
export function pickVolumeSlots(addedSets = {}, enabledExercises = new Set(), maxPicks = 2, template = WEEK_TEMPLATE) {
  const picks = [];
  const addedThisCycle = {}; // partie → přidané série v tomto výběru
  const current = weeklyVolume(template, addedSets);

  for (const day of template) {
    for (const slot of day.slots) {
      if (picks.length >= maxPicks) break;
      const def = EXERCISES[slot.exerciseId];
      const muscle = def.muscles.primary[0];

      if ((addedThisCycle[muscle] ?? 0) >= 2) continue;
      if ((current[muscle] ?? 0) + 1 > VOLUME_LIMITS.weeklyCapPerMuscle) continue;

      const session = sessionVolume(day, addedSets);
      if ((session[muscle] ?? 0) + 1 > VOLUME_LIMITS.sessionCapPerMuscle) continue;

      if (slot.kind === 'add_exercise') {
        if (enabledExercises.has(slot.exerciseId)) continue; // už zapnutý — přidávej mu série přes add_set
        picks.push({ ...slot, unit: day.unit });
        addedThisCycle[muscle] = (addedThisCycle[muscle] ?? 0) + slot.sets;
        current[muscle] = (current[muscle] ?? 0) + slot.sets;
      } else {
        picks.push({ ...slot, unit: day.unit });
        addedThisCycle[muscle] = (addedThisCycle[muscle] ?? 0) + 1;
        current[muscle] = (current[muscle] ?? 0) + 1;
      }
    }
  }
  return picks;
}

// Po deloadu se objem vrací o krok níž: odeber poslední přidanou sérii z každé partie nad startem.
export function volumeAfterDeload(addedSets = {}) {
  const out = { ...addedSets };
  const keys = Object.keys(out).filter((k) => out[k] > 0);
  for (const k of keys) out[k] = Math.max(0, out[k] - 1);
  return out;
}


// ===== src/engine/nutrition.js =====
// Výživový engine — docs/PROGRAM.md §Výživa. Řízení tempem váhy, ne kaloriemi.


export const RATE_BANDS_PCT_WK = {
  mass: [0.30, 0.35],
  balanced: [0.25, 0.30],
  lean: [0.15, 0.25],
};

// Hubnutí: lehké tempo drží sílu a náladu, běžné je klasických −0,5 % týdně.
export const CUT_BANDS_PCT_WK = {
  light: [-0.40, -0.25],
  normal: [-0.60, -0.40],
};

// Udržování: váha se smí hýbat jen v šumu.
export const MAINTAIN_BAND_PCT_WK = [-0.15, 0.15];

const KCAL_MAX = 5500;
const MIN_WEIGHINS_14D = 6; // min. vážení za 14 dní (≈3×/týden)
const KCAL_PER_KG = 7700;   // energie 1 kg tělesného tuku

export function mifflinStJeor({ weightKg, heightCm, age, sex = 'm' }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'm' ? base + 5 : base - 161;
}

// Násobek BMR podle počtu silových tréninků týdně (zbytek dne sedavý).
// 5 dnů = 1,7 jako dosud, ať se původní cíle nezmění.
export function activityFactor(trainingDaysPerWeek = 5) {
  const table = { 0: 1.3, 1: 1.4, 2: 1.45, 3: 1.55, 4: 1.6, 5: 1.7, 6: 1.75, 7: 1.8 };
  return table[clamp(Math.round(trainingDaysPerWeek), 0, 7)];
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return +(weightKg / (m * m)).toFixed(1);
}

// Pásma WHO: under < 18,5 · normal < 25 · over < 30 · obese
export function bmiBand(value) {
  if (value < 18.5) return 'under';
  if (value < 25) return 'normal';
  if (value < 30) return 'over';
  return 'obese';
}

/** Zdravé rozmezí váhy pro výšku (BMI 18,5 až 24,9), zaokrouhleno na 0,5 kg. */
export function healthyWeightRange(heightCm) {
  const m2 = (heightCm / 100) ** 2;
  return [Math.round(18.5 * m2 * 2) / 2, Math.round(24.9 * m2 * 2) / 2];
}

/** Nejnižší cílová váha, kterou appka pustí: BMI 18,5 (zaokrouhleno nahoru na 0,5 kg). */
export function minGoalWeightKg(heightCm) {
  return Math.ceil(18.5 * (heightCm / 100) ** 2 * 2) / 2;
}

/** Směr cíle z profilu: lose | maintain | gain (do 1 kg rozdílu = udržování). */
export function goalKind(profile, weightKg = profile.weightKg) {
  if (profile.goal === 'maintain') return 'maintain';
  const delta = profile.goalWeightKg - weightKg;
  if (Math.abs(delta) < 1) return 'maintain';
  return delta < 0 ? 'lose' : 'gain';
}

/** Odhad udržovacího příjmu. */
export function maintenanceKcal(profile, weightKg = profile.weightKg) {
  return mifflinStJeor({ ...profile, weightKg }) * activityFactor(profile.trainingDays?.length ?? 5);
}

/**
 * Pod tohle kalorie nikdy neklesnou: zhruba bazální metabolismus, nikdy méně než
 * 1 200 kcal (ženy) / 1 500 kcal (muži). Hubnutí pod BMR ničí sílu i hormony.
 */
export function kcalFloor(profile, weightKg = profile.weightKg) {
  const bmr = mifflinStJeor({ ...profile, weightKg });
  return roundToStep(Math.max(profile.sex === 'f' ? 1200 : 1500, bmr * 1.05), 50);
}

export function proteinPerKg(phase) {
  return phase === 'cut' ? 2.0 : phase === 'minicut' ? 2.1 : 1.8;
}

/**
 * Startovní cíle podle směru cíle. Jen výchozí bod — dál řídí weeklyAdjustment.
 *  - gain:  udržení + 350 kcal, tempo podle priority (lean bulk jako dosud)
 *  - lose:  udržení − deficit spočítaný z tempa (střed pásma × váha × 7 700 kcal / 7),
 *           nikdy pod kcalFloor
 *  - maintain: udržení, pásmo ±0,15 %
 */
export function initialTargets(profile, weightKg) {
  const kind = goalKind(profile, weightKg);
  const maint = maintenanceKcal(profile, weightKg);
  if (kind === 'gain') {
    return {
      phase: 'bulk',
      kcal: roundToStep(maint + 350, 50),
      proteinG: Math.round(proteinPerKg('bulk') * weightKg),
      rateBandPctWk: RATE_BANDS_PCT_WK[profile.priority ?? 'balanced'],
    };
  }
  if (kind === 'lose') {
    const band = CUT_BANDS_PCT_WK[profile.pace ?? 'light'] ?? CUT_BANDS_PCT_WK.light;
    const midPct = -(band[0] + band[1]) / 2 / 100;
    const deficit = (midPct * weightKg * KCAL_PER_KG) / 7;
    return {
      phase: 'cut',
      kcal: Math.max(kcalFloor(profile, weightKg), roundToStep(maint - deficit, 50)),
      proteinG: Math.round(proteinPerKg('cut') * weightKg),
      rateBandPctWk: band,
    };
  }
  return {
    phase: 'maintain',
    kcal: roundToStep(maint, 50),
    proteinG: Math.round(proteinPerKg('maintain') * weightKg),
    rateBandPctWk: MAINTAIN_BAND_PCT_WK,
  };
}

/** Dosažení cílové váhy podle 7denního průměru (s tolerancí 0,2 kg). */
export function goalReached(phase, avgKg, goalKg) {
  if (avgKg == null || goalKg == null) return false;
  if (phase === 'cut') return avgKg <= goalKg + 0.2;
  if (phase === 'bulk') return avgKg >= goalKg - 0.2;
  return false;
}

/**
 * Cíle udržování po dosažení cíle: udržovací příjem odhadnutý z pozorovaného tempa
 * (příjem − tempo × 1 100 kcal), jinak z rovnice. Bílkoviny 1,8 g/kg.
 */
export function maintainTargets(profile, weightKg, currentKcal = null, observedRateKgWk = null) {
  const est = currentKcal != null && observedRateKgWk != null
    ? currentKcal - (observedRateKgWk * KCAL_PER_KG) / 7
    : maintenanceKcal(profile, weightKg);
  return {
    phase: 'maintain',
    kcal: roundToStep(clamp(est, kcalFloor(profile, weightKg), KCAL_MAX), 50),
    proteinG: Math.round(proteinPerKg('maintain') * weightKg),
    rateBandPctWk: MAINTAIN_BAND_PCT_WK,
  };
}

/**
 * Týdenní korekce kalorií podle 14denního trendu váhy.
 * @param input { targets, weighIns: [{date, kg}], weeksOnPlan, today, kcalMin }
 * @returns { newKcal, deltaKcal, ratePctWk, reason }
 */
export const STALE_WEIGHIN_DAYS = 5;

export function weeklyAdjustment({ targets, weighIns = [], weeksOnPlan = 0, today = null, kcalMin = 1200 }) {
  const noChange = (reason) => ({ newKcal: targets.kcal, deltaKcal: 0, ratePctWk: null, reason });

  if (weeksOnPlan < 3) return noChange('too_early'); // glykogen/voda prvních 2 týdnů
  const series = weighIns.map((w) => ({ date: w.date, value: w.kg }));

  // Zastaralá data nesmí řídit kalorie: bez čerstvého vážení by se stejný starý
  // trend aplikoval znovu a znovu a cíl by ujel o stovky kcal.
  if (today && series.length) {
    const latest = [...series].sort((a, b) => a.date.localeCompare(b.date)).at(-1).date;
    if (daysBetween(latest, today) > STALE_WEIGHIN_DAYS) return noChange('stale_data');
  }
  const avgNow = windowAvg(series, 0, 7);
  const avgPrev = windowAvg(series, 7, 14);
  const count14 = countRecent(series, 14);
  if (avgNow == null || avgPrev == null || count14 < MIN_WEIGHINS_14D) {
    return noChange('need_more_data');
  }

  const rateKgWk = avgNow - avgPrev;
  const ratePctWk = (rateKgWk / avgNow) * 100;
  const [lo, hi] = targets.rateBandPctWk;

  if (ratePctWk >= lo && ratePctWk <= hi) {
    return { newKcal: targets.kcal, deltaKcal: 0, ratePctWk, reason: 'on_track' };
  }

  const off = ratePctWk < lo ? lo - ratePctWk : ratePctWk - hi;
  const magnitude = off > 0.15 ? 150 : 100;
  const delta = ratePctWk < lo ? magnitude : -magnitude;
  const newKcal = Math.min(KCAL_MAX, Math.max(kcalMin, targets.kcal + delta));
  return {
    newKcal, deltaKcal: newKcal - targets.kcal, ratePctWk,
    reason: ratePctWk < lo ? 'too_slow' : 'too_fast',
  };
}

function countRecent(series, days) {
  if (!series.length) return 0;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted[sorted.length - 1].date;
  return sorted.filter((p) => (Date.parse(end) - Date.parse(p.date)) / 86400000 < days).length;
}

/**
 * Doporučení mini-cutu — docs/PROGRAM.md §Výživa.
 * @param input { waistSeries: [{date, cm}], weightSeries: [{date, kg}], heightCm }
 * @returns { recommend, reasons: [{type, detail}] }
 */
export function miniCutCheck({ waistSeries = [], weightSeries = [], heightCm }) {
  const reasons = [];

  if (waistSeries.length) {
    const latest = [...waistSeries].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (latest.cm / heightCm >= 0.5) {
      reasons.push({ type: 'whtr', detail: latest.cm });
    }
    const trendPerDay = seriesTrendPerDay(
      waistSeries.map((w) => ({ date: w.date, value: w.cm })), 60, 6,
    );
    if (trendPerDay != null && trendPerDay * 30.44 > 1) {
      reasons.push({ type: 'waist_rate', detail: +(trendPerDay * 30.44).toFixed(2) });
    }
  }

  return { recommend: reasons.length > 0, reasons };
}

// Cíle mini-cutu: −0,5 % BW/týden, protein 2,1 g/kg, 6–8 týdnů.
export function miniCutTargets(currentTargets, weightKg, observedRateKgWk = null, kcalMin = 1500) {
  // Udržovací příjem odhadem z pozorovaného tempa (7700 kcal ≈ 1 kg), jinak z aktuálních kalorií −350.
  const surplusPerDay = observedRateKgWk != null ? (observedRateKgWk * 7700) / 7 : 350;
  const maintenance = currentTargets.kcal - surplusPerDay;
  return {
    phase: 'minicut',
    kcal: Math.max(kcalMin, roundToStep(maintenance - 550, 50)),
    proteinG: Math.round(2.1 * weightKg),
    rateBandPctWk: [-0.6, -0.4],
    durationWeeks: [6, 8],
  };
}


// ===== src/engine/projection.js =====
// Poctivá projekce — docs/PROGRAM.md §Měření a projekce.
// Nikdy neukazuje datum, které odporuje fyziologickým stropům z rešerše (§7).


// Epley korigovaná o RIR: efektivní opakování = provedená + rezerva.
export function e1rm(weightKg, reps, rir = 0) {
  if (weightKg == null || !reps) return null;
  return +(weightKg * (1 + (reps + (rir ?? 0)) / 30)).toFixed(1);
}

// Pásmo reálného růstu svalů kg/měsíc dle tréninkového věku (science.md §7).
export function muscleGainBandKgMo(trainingAgeMonths) {
  if (trainingAgeMonths < 12) return [0.4, 0.7];
  if (trainingAgeMonths < 24) return [0.25, 0.4];
  return [0.15, 0.25];
}

// 7denní průměr váhy — jediné číslo váhy, které UI ukazuje.
export function currentAvgWeight(weighIns) {
  const series = weighIns.map((w) => ({ date: w.date, value: w.kg }));
  const a = windowAvg(series, 0, 7);
  return a == null ? null : +a.toFixed(1);
}

/**
 * Projekce data dosažení cílové váhy z 28denního trendu — podle SMĚRU cíle.
 * @param direction 'gain' | 'lose' | 'maintain' (maintain = žádná projekce, jen trend)
 * @returns { etaDate, rateKgWk, status: 'ok'|'stalled'|'losing'|'gaining'|'maintaining'|'need_more_data'|'stale'|'reached' }
 *   losing = váha klesá, ačkoli má růst; gaining = váha roste, ačkoli má klesat
 */
export const STALE_DAYS = 10;

export function projectGoalDate({ weighIns = [], goalKg, today = null, direction = 'gain' }) {
  const series = weighIns.map((w) => ({ date: w.date, value: w.kg }));
  const avgNow = currentAvgWeight(weighIns);
  if (avgNow == null) return { etaDate: null, rateKgWk: null, status: 'need_more_data' };

  // Ze starých vážení nesmí vzniknout „projekce" s datem v minulosti.
  if (today && series.length) {
    const latest = [...series].sort((a, b) => a.date.localeCompare(b.date)).at(-1).date;
    if (daysBetween(latest, today) > STALE_DAYS) {
      return { etaDate: null, rateKgWk: null, status: 'stale', lastWeighIn: latest };
    }
  }
  const perDay = seriesTrendPerDay(series, 28, 8);
  const rateKgWk = perDay == null ? null : +(perDay * 7).toFixed(3);

  if (direction === 'maintain') {
    return { etaDate: null, rateKgWk, status: rateKgWk == null ? 'need_more_data' : 'maintaining' };
  }
  const lose = direction === 'lose';
  if (lose ? avgNow <= goalKg : avgNow >= goalKg) return { etaDate: null, rateKgWk, status: 'reached' };
  if (rateKgWk == null) return { etaDate: null, rateKgWk: null, status: 'need_more_data' };

  if (lose) {
    if (rateKgWk > 0.02) return { etaDate: null, rateKgWk, status: 'gaining' };
    if (rateKgWk > -0.05) return { etaDate: null, rateKgWk, status: 'stalled' };
  } else {
    if (rateKgWk < -0.02) return { etaDate: null, rateKgWk, status: 'losing' };
    if (rateKgWk < 0.05) return { etaDate: null, rateKgWk, status: 'stalled' };
  }

  const days = Math.round((Math.abs(goalKg - avgNow) / Math.abs(rateKgWk)) * 7);
  const lastDate = [...weighIns].sort((a, b) => a.date.localeCompare(b.date)).at(-1).date;
  return { etaDate: addDays(lastDate, days), rateKgWk, status: 'ok' };
}

/**
 * Kvalita přírůstku: křížení trendu váhy s trendem pasu (science.md §8).
 * @returns { quality: 'lean_gain'|'ok_gain'|'too_fast'|'maintaining'|'losing'|'need_more_data', waistRateCmMo }
 */
export function gainQuality({ weighIns = [], waistSeries = [] }) {
  const weightPerDay = seriesTrendPerDay(weighIns.map((w) => ({ date: w.date, value: w.kg })), 28, 8);
  if (weightPerDay == null) return { quality: 'need_more_data', waistRateCmMo: null };

  const weightRateKgWk = weightPerDay * 7;
  const waistPerDay = seriesTrendPerDay(waistSeries.map((w) => ({ date: w.date, value: w.cm })), 56, 4);
  const waistRateCmMo = waistPerDay == null ? null : +(waistPerDay * 30.44).toFixed(2);

  if (weightRateKgWk < -0.05) return { quality: 'losing', waistRateCmMo };
  if (weightRateKgWk < 0.05) return { quality: 'maintaining', waistRateCmMo };
  if (waistRateCmMo == null) return { quality: 'ok_gain', waistRateCmMo };
  if (waistRateCmMo <= 0.5) return { quality: 'lean_gain', waistRateCmMo };
  if (waistRateCmMo <= 1) return { quality: 'ok_gain', waistRateCmMo };
  return { quality: 'too_fast', waistRateCmMo };
}

/**
 * Kvalita hubnutí: váha dolů + pas dolů = tuk; moc rychle (přes 1 % váhy týdně) = i svaly.
 * @returns { quality: 'good_cut'|'ok_cut'|'too_fast'|'stalled'|'gaining'|'need_more_data', waistRateCmMo, weightRateKgWk }
 */
export function cutQuality({ weighIns = [], waistSeries = [], weightKg = null }) {
  const weightPerDay = seriesTrendPerDay(weighIns.map((w) => ({ date: w.date, value: w.kg })), 28, 8);
  if (weightPerDay == null) return { quality: 'need_more_data', waistRateCmMo: null, weightRateKgWk: null };
  const weightRateKgWk = +(weightPerDay * 7).toFixed(3);
  const waistPerDay = seriesTrendPerDay(waistSeries.map((w) => ({ date: w.date, value: w.cm })), 56, 4);
  const waistRateCmMo = waistPerDay == null ? null : +(waistPerDay * 30.44).toFixed(2);
  const ref = weightKg ?? currentAvgWeight(weighIns) ?? 70;

  if (weightRateKgWk > 0.05) return { quality: 'gaining', waistRateCmMo, weightRateKgWk };
  if (weightRateKgWk > -0.05) return { quality: 'stalled', waistRateCmMo, weightRateKgWk };
  if (-weightRateKgWk > ref * 0.01) return { quality: 'too_fast', waistRateCmMo, weightRateKgWk };
  if (waistRateCmMo != null && waistRateCmMo <= -0.3) return { quality: 'good_cut', waistRateCmMo, weightRateKgWk };
  return { quality: 'ok_cut', waistRateCmMo, weightRateKgWk };
}

/**
 * Poctivý plán k cílové váze — VŽDY spočítaný z aktuálních čísel uživatele
 * (žádné natvrdo psané scénáře). Tempa: lean bulk dle priority (science.md §7),
 * růst svalů dle tréninkového věku, cut −0,5 % BW/týden.
 * @returns { mode: 'gain'|'cut'|'there', months, etaIso, absEtaIso,
 *            muscleLo, muscleHi, fatLo, fatHi, needsCut }
 */
export function honestPlan({ startWeightKg, goalWeightKg, priority = 'balanced', pace = 'light', trainingAgeMonths = 0, fromIso }) {
  const delta = goalWeightKg - startWeightKg;
  if (Math.abs(delta) <= 0.5) {
    return { mode: 'there', months: 0, etaIso: fromIso, absEtaIso: fromIso, muscleLo: 0, muscleHi: 0, fatLo: 0, fatHi: 0, needsCut: false };
  }

  if (delta < 0) {
    const band = CUT_BANDS_PCT_WK[pace] ?? CUT_BANDS_PCT_WK.light;
    const pctWk = -(band[0] + band[1]) / 2 / 100;
    const ratePerMonth = pctWk * startWeightKg * 4.345;
    const months = Math.max(1, Math.ceil(-delta / ratePerMonth));
    const etaIso = addDays(fromIso, Math.round(months * 30.44));
    return { mode: 'cut', months, etaIso, absEtaIso: etaIso, muscleLo: 0, muscleHi: 0, fatLo: +(-delta).toFixed(1), fatHi: +(-delta).toFixed(1), needsCut: false };
  }

  const pctWk = { mass: 0.325, balanced: 0.275, lean: 0.2 }[priority] ?? 0.275;
  let w = startWeightKg;
  let months = 0;
  let muscleLo = 0;
  let muscleHi = 0;
  while (w < goalWeightKg && months < 60) {
    const [lo, hi] = muscleGainBandKgMo(trainingAgeMonths + months);
    muscleLo += lo;
    muscleHi += hi;
    w += (pctWk / 100) * w * 4.345;
    months++;
  }
  muscleLo = Math.min(muscleLo, delta);
  muscleHi = Math.min(muscleHi, delta);
  const fatLo = Math.max(0, delta - muscleHi);
  const fatHi = Math.max(0, delta - muscleLo);
  const needsCut = fatHi > 2;
  const etaIso = addDays(fromIso, Math.round(months * 30.44));
  const absEtaIso = needsCut ? addDays(etaIso, 56) : etaIso; // + ~8 týdnů mini-cutu
  return {
    mode: 'gain', months, etaIso, absEtaIso,
    muscleLo: +muscleLo.toFixed(1), muscleHi: +muscleHi.toFixed(1),
    fatLo: +fatLo.toFixed(1), fatHi: +fatHi.toFixed(1), needsCut,
  };
}

/**
 * Poctivý odhad složení přírůstku: kolik z aktuálního tempa může být sval.
 * @returns { rateKgMo, muscleBandKgMo, muscleShareNote: 'realistic'|'part_fat'|'mostly_fat'|null }
 */
export function gainComposition({ weighIns = [], trainingAgeMonths = 0 }) {
  const perDay = seriesTrendPerDay(weighIns.map((w) => ({ date: w.date, value: w.kg })), 28, 8);
  if (perDay == null) return { rateKgMo: null, muscleBandKgMo: muscleGainBandKgMo(trainingAgeMonths), muscleShareNote: null };
  const rateKgMo = +(perDay * 30.44).toFixed(2);
  const band = muscleGainBandKgMo(trainingAgeMonths);
  let note = 'realistic';
  if (rateKgMo > band[1] * 2) note = 'mostly_fat';
  else if (rateKgMo > band[1] * 1.3) note = 'part_fat';
  return { rateKgMo, muscleBandKgMo: band, muscleShareNote: note };
}


// ===== src/engine/milestones.js =====
// Subcíle, milníky, streaky, PR — docs/PROGRAM.md §Subcíle a motivace.


// Dlouhodobé kotvy e1RM (kg); mezi nimi se generují kroky po 5/10 kg.
export const STRENGTH_ANCHORS = {
  bench: [80, 90, 100, 110, 120],
  squat: [100, 120, 140, 160],
  deadlift: [120, 150, 180, 200],
  ohp: [50, 60, 70, 80],
  hip_thrust: [40, 60, 80, 100, 120],
  rdl: [40, 60, 80, 100],
};

/** Cviky, u kterých se sleduje síla (graf e1RM): klíčové cviky programu. */
export function strengthLifts(template = null) {
  const ids = template ? keyExerciseIds(template) : Object.keys(STRENGTH_ANCHORS);
  return ids.length ? ids : Object.keys(STRENGTH_ANCHORS);
}

// Váhové checkpointy po 1 kg 7denního průměru — podle směru cíle.
export function nextWeightMilestone(avg7, startKg, goalKg, direction = 'gain') {
  if (direction === 'maintain') return null;
  const base = avg7 ?? startKg;
  if (direction === 'lose') {
    const next = Math.ceil(base) - 1;
    return next < goalKg ? null : { targetKg: next };
  }
  const next = Math.floor(base) + 1;
  return next > goalKg ? null : { targetKg: next };
}

// Další silový milník cviku z aktuálního e1RM: nejbližší kotva, jinak další kulatý krok +5 kg.
export function nextStrengthMilestone(exerciseId, currentE1rm) {
  const anchors = STRENGTH_ANCHORS[exerciseId];
  if (currentE1rm == null) return anchors ? { targetE1rm: anchors[0] } : null;
  if (anchors) {
    const above = anchors.find((a) => a > currentE1rm);
    if (above) return { targetE1rm: above };
  }
  return { targetE1rm: Math.floor(currentE1rm / 5) * 5 + 5 };
}

// Nejlepší e1RM cviku z historie výkonů (jen pracovní série).
export function bestE1rm(performances = []) {
  let best = null;
  for (const p of performances) {
    for (const s of p.sets ?? []) {
      if (s.isWarmup) continue;
      const val = e1rm(s.weightKg, s.reps, s.rir);
      if (val != null && (best == null || val > best)) best = val;
    }
  }
  return best;
}

// PR detekce: nové e1RM nad dosavadním maximem (tolerance 0,1 na zaokrouhlení).
export function detectPR(previousBest, session) {
  let sessionBest = null;
  for (const s of session.sets ?? []) {
    if (s.isWarmup) continue;
    const val = e1rm(s.weightKg, s.reps, s.rir);
    if (val != null && (sessionBest == null || val > sessionBest)) sessionBest = val;
  }
  if (sessionBest == null) return { isPR: false, e1rm: null };
  if (previousBest == null) return { isPR: false, e1rm: sessionBest }; // první záznam není PR
  return { isPR: sessionBest > previousBest + 0.1, e1rm: sessionBest };
}

// Týden „drží streak“ při ≥ 75 % plánovaných tréninků (5 → 4, 3 → 3, 2 → 2);
// deload týdny streak nepřerušují.
export function weekKeepsStreak(completedSessions, plannedSessions = 5) {
  return completedSessions >= Math.max(1, Math.ceil(plannedSessions * 0.75));
}

// Délka streaku v týdnech: [{completed, planned, isCurrentWeek?}], nejnovější první.
// Rozběhnutý aktuální týden streak nikdy nezlomí — jen ho může prodloužit.
export function streakWeeks(weeklyLog = []) {
  let streak = 0;
  for (const [i, week] of weeklyLog.entries()) {
    if (weekKeepsStreak(week.completed, week.planned)) {
      streak++;
    } else if (i === 0 && week.isCurrentWeek) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}



// ===== src/engine/onboarding.js =====
// Onboarding → výchozí stav enginu — docs/PROGRAM.md §Onboarding.





export const DEFAULT_PROFILE = {
  name: '',
  weightKg: 85,
  heightCm: 186,
  age: 21,
  sex: 'm',
  goalWeightKg: 95,
  goal: null,           // null = podle cílové váhy | 'maintain' = držet váhu
  priority: 'balanced', // nabírání: mass | balanced | lean
  pace: 'light',        // hubnutí: light | normal
  trainingDays: [1, 2, 3, 4, 5], // Po–Pá (0 = neděle)
  trainingAgeMonths: 0,
};

/**
 * Odhad pracovní zátěže z nahlášeného výkonu „váha × opakování“.
 * Předpoklad RIR 1 u nahlášené série (lidé hlásí těžké série); cílová zátěž tak,
 * aby horní hranice rozsahu vyšla s rezervou u horního cílového RIR → konzervativní start.
 */
export function estimateWorkingLoad(exDef, reportedWeightKg, reportedReps) {
  if (!reportedWeightKg || !reportedReps) return null;
  const est1rm = e1rm(reportedWeightKg, reportedReps, 1);
  const [, hi] = exDef.repRange;
  const [, rirHi] = exDef.rir;
  const target = est1rm / (1 + (hi + rirHi) / 30);
  const step = loadStep(exDef);
  return Math.max(floorToStep(target, step), step);
}

/**
 * Sestaví výchozí stavy cviků.
 * @param reportedLifts { [exerciseId]: {weightKg, reps} | null } — jen ★ cviky, null = „nevím“
 */
export function buildInitialExerciseStates(reportedLifts = {}, template = WEEK_TEMPLATE) {
  const states = {};
  const inPlan = new Set();
  for (const day of template) for (const ex of day.exercises) inPlan.add(ex.exerciseId);

  for (const id of inPlan) {
    const def = EXERCISES[id];
    const sets = Math.max(...template.flatMap((d) =>
      d.exercises.filter((e) => e.exerciseId === id).map((e) => e.sets)));
    const reported = reportedLifts[id];
    if (reported && def.incrementRule !== 'bodyweight') {
      const load = estimateWorkingLoad(def, reported.weightKg, reported.reps);
      states[id] = { exerciseId: id, status: load ? 'active' : 'calibration', loadKg: load, sets };
    } else if (reported && def.incrementRule === 'bodyweight') {
      // U shybů/dipů je „zátěž“ přídavná váha; nahlášené = přídavná váha (0 = vlastní tělo).
      states[id] = { exerciseId: id, status: 'active', loadKg: Math.max(0, reported.weightKg ?? 0), sets };
    } else {
      states[id] = { exerciseId: id, status: 'calibration', loadKg: null, sets };
    }
  }
  return states;
}



// ===== src/engine/foods.js =====
// Databáze potravin — české základy pro lean bulk, hodnoty na 100 g (u tekutin na 100 ml).
// Zdroj hodnot: běžné tabulky (ÚZEI / USDA / etikety Lidl vlastních značek), zaokrouhleno.
// Kdo chce přesnou etiketu konkrétního výrobku, přidá si ho přes Open Food Facts nebo ručně.
//
// Pole:
//   name      název jak ho vidí uživatel
//   cat       kategorie (FOOD_CATEGORIES) — řadí nákupní seznam
//   kcal/p/c/f na 100 g — energie, bílkoviny, sacharidy, tuky
//   pieceG    hmotnost 1 kusu, pokud se jídlo přirozeně počítá na kusy (vejce, banán, rohlík)
//   packG     typické balení v Lidlu — nákupní seznam zaokrouhluje na celá balení
//   packLabel volitelný popisek balení („10 ks“, „1 l“)
//   loose     kupuje se na kusy (ovoce, zelenina) — nákupní seznam ukáže počet kusů
//   match     vzory (bez diakritiky, malá písmena) pro párování s názvy zboží v akci:
//             každé slovo vzoru je předponou některého slova názvu; „slovo$“ = přesné slovo
//   exclude   vzory, které párování zakážou („cherry“ u obyčejných rajčat)

export const FOOD_CATEGORIES = {
  maso: 'Maso a ryby',
  mlecne: 'Mléčné a vejce',
  sacharidy: 'Přílohy a obiloviny',
  pecivo: 'Pečivo',
  ovoce: 'Ovoce',
  zelenina: 'Zelenina',
  lusteniny: 'Luštěniny a rostlinné',
  tuky: 'Tuky, ořechy a semínka',
  ostatni: 'Ostatní',
};

export const FOOD_SLOTS = [
  { id: 'snidane', label: 'Snídaně', share: 0.25, hour: 7, minute: 30 },
  { id: 'svacina1', label: 'Svačina', share: 0.10, hour: 10, minute: 30 },
  { id: 'obed', label: 'Oběd', share: 0.30, hour: 12, minute: 30 },
  { id: 'svacina2', label: 'Svačina', share: 0.10, hour: 16, minute: 0 },
  { id: 'vecere', label: 'Večeře', share: 0.25, hour: 19, minute: 0 },
];

export const FOODS = {
  // ---------- maso a ryby (syrové) ----------
  kureci_prsa: { name: 'Kuřecí prsa', cat: 'maso', kcal: 110, p: 23, c: 0, f: 1.5, packG: 600, match: ['kureci prs', 'kureci rizk', 'kureci prsni'] },
  kureci_stehna: { name: 'Kuřecí stehna (bez kosti, s kůží)', cat: 'maso', kcal: 180, p: 17, c: 0, f: 12, packG: 600, match: ['kureci stehn', 'kureci stehenni'] },
  kruti_prsa: { name: 'Krůtí prsa', cat: 'maso', kcal: 105, p: 24, c: 0, f: 1, packG: 500, match: ['kruti prs', 'kruti rizk'] },
  hovezi_mlete: { name: 'Hovězí mleté (10 % tuku)', cat: 'maso', kcal: 175, p: 20, c: 0, f: 10, packG: 500, match: ['hovezi mlete', 'mlete hovezi'] },
  hovezi_zadni: { name: 'Hovězí zadní (libové)', cat: 'maso', kcal: 125, p: 22, c: 0, f: 4, packG: 500, match: ['hovezi zadni', 'hovezi kyta', 'hovezi kulata'] },
  veprova_panenka: { name: 'Vepřová panenka', cat: 'maso', kcal: 110, p: 21, c: 0, f: 2.5, packG: 500, match: ['veprova panenka', 'panenka'] },
  veprova_kyta: { name: 'Vepřová kýta', cat: 'maso', kcal: 140, p: 21, c: 0, f: 6, packG: 500, match: ['veprova kyta', 'veprovy rizek', 'veprova plec'] },
  veprova_krkovice: { name: 'Vepřová krkovice', cat: 'maso', kcal: 250, p: 17, c: 0, f: 20, packG: 500, match: ['veprova krkov', 'krkovice'] },
  losos: { name: 'Losos (filet)', cat: 'maso', kcal: 200, p: 20, c: 0, f: 13, packG: 250, match: ['losos'] },
  treska: { name: 'Treska (filet)', cat: 'maso', kcal: 80, p: 18, c: 0, f: 0.7, packG: 400, match: ['treska', 'tresci'] },
  tunak_konzerva: { name: 'Tuňák ve vlastní šťávě (okapaný)', cat: 'maso', kcal: 110, p: 25, c: 0, f: 1, packG: 110, packLabel: '1 konzerva', match: ['tunak'], exclude: ['steak', 'filet', 'cerstv'] },
  sardinky: { name: 'Sardinky v oleji (okapané)', cat: 'maso', kcal: 210, p: 24, c: 0, f: 12, packG: 90, packLabel: '1 konzerva', match: ['sardink'] },
  sunka: { name: 'Šunka nejvyšší jakosti', cat: 'maso', kcal: 110, p: 20, c: 1, f: 3, packG: 100, match: ['sunka', 'sunky'], exclude: ['salam'] },
  kureci_sunka: { name: 'Kuřecí šunka', cat: 'maso', kcal: 100, p: 18, c: 1, f: 2, packG: 100, match: ['kureci sunk'] },
  slanina: { name: 'Slanina', cat: 'maso', kcal: 450, p: 15, c: 0, f: 42, packG: 100, match: ['slanina'] },

  // ---------- mléčné a vejce ----------
  vejce: { name: 'Vejce', cat: 'mlecne', kcal: 143, p: 12.6, c: 0.7, f: 9.5, pieceG: 55, packG: 550, packLabel: '10 ks', match: ['vejce', 'vajec'], exclude: ['testovin', 'liker'] },
  bilky: { name: 'Vaječné bílky (tekuté)', cat: 'mlecne', kcal: 50, p: 11, c: 0.7, f: 0.2, packG: 500, match: ['bilky', 'vajecne bilky'] },
  skyr: { name: 'Skyr natural', cat: 'mlecne', kcal: 63, p: 11, c: 4, f: 0.2, packG: 450, match: ['skyr'] },
  tvaroh_polotucny: { name: 'Tvaroh polotučný', cat: 'mlecne', kcal: 105, p: 12, c: 4, f: 4.5, packG: 250, match: ['tvaroh polotuc', 'tvaroh mekky'] },
  tvaroh_odtucneny: { name: 'Tvaroh odtučněný', cat: 'mlecne', kcal: 70, p: 12, c: 4, f: 0.5, packG: 250, match: ['tvaroh odtuc', 'tvaroh nizkotuc'] },
  tvaroh_tucny: { name: 'Tvaroh tučný', cat: 'mlecne', kcal: 155, p: 11, c: 3.5, f: 11, packG: 250, match: ['tvaroh tucn'] },
  recky_jogurt: { name: 'Řecký jogurt 0 %', cat: 'mlecne', kcal: 57, p: 10, c: 4, f: 0.2, packG: 400, match: ['recky jogurt', 'jogurt reck'] },
  bily_jogurt: { name: 'Bílý jogurt 3 %', cat: 'mlecne', kcal: 65, p: 4, c: 5, f: 3, packG: 150, match: ['bily jogurt', 'jogurt bily'], exclude: ['reck'] },
  cottage: { name: 'Cottage sýr', cat: 'mlecne', kcal: 100, p: 12, c: 3, f: 4, packG: 200, match: ['cottage'] },
  mleko_polotucne: { name: 'Mléko polotučné 1,5 %', cat: 'mlecne', kcal: 46, p: 3.3, c: 4.8, f: 1.5, packG: 1000, packLabel: '1 l', match: ['mleko polotuc', 'mleko 1,5'] },
  mleko_plnotucne: { name: 'Mléko plnotučné 3,5 %', cat: 'mlecne', kcal: 62, p: 3.3, c: 4.7, f: 3.5, packG: 1000, packLabel: '1 l', match: ['mleko plnotuc', 'mleko 3,5'] },
  kefir: { name: 'Kefír', cat: 'mlecne', kcal: 55, p: 3.3, c: 4, f: 3, packG: 500, packLabel: '500 ml', match: ['kefir'] },
  eidam: { name: 'Eidam 30 %', cat: 'mlecne', kcal: 260, p: 27, c: 0, f: 17, packG: 250, match: ['eidam', 'gouda'] },
  mozzarella: { name: 'Mozzarella', cat: 'mlecne', kcal: 250, p: 18, c: 1, f: 19, packG: 125, match: ['mozzarella'] },
  balkansky_syr: { name: 'Balkánský sýr / feta', cat: 'mlecne', kcal: 250, p: 16, c: 1, f: 20, packG: 200, match: ['balkansky', 'feta'] },
  parmezan: { name: 'Parmezán', cat: 'mlecne', kcal: 400, p: 33, c: 0, f: 28, packG: 100, match: ['parmez', 'grana padano', 'parmigiano'] },
  smetanovy_syr: { name: 'Smetanový sýr (Lučina typ)', cat: 'mlecne', kcal: 250, p: 6, c: 3, f: 24, packG: 200, match: ['lucina', 'smetanovy syr', 'zervais'], exclude: ['cheesecake', 'dort', 'mrazen'] },
  maslo: { name: 'Máslo', cat: 'mlecne', kcal: 740, p: 0.7, c: 0.6, f: 82, packG: 250, match: ['maslo$'] },

  // ---------- přílohy a obiloviny (syrové) ----------
  ovesne_vlocky: { name: 'Ovesné vločky', cat: 'sacharidy', kcal: 370, p: 13, c: 60, f: 7, packG: 500, match: ['ovesne vlocky', 'vlocky ovesne'] },
  ryze: { name: 'Rýže (syrová)', cat: 'sacharidy', kcal: 355, p: 7, c: 78, f: 0.6, packG: 1000, match: ['ryze$', 'basmati', 'jasminova'] },
  testoviny: { name: 'Těstoviny (syrové)', cat: 'sacharidy', kcal: 360, p: 12, c: 72, f: 1.5, packG: 500, match: ['testoviny', 'spaget', 'penne', 'fusilli'] },
  brambory: { name: 'Brambory', cat: 'sacharidy', kcal: 75, p: 2, c: 16, f: 0.1, packG: 2000, match: ['brambory', 'brambor$'] },
  bataty: { name: 'Batáty', cat: 'sacharidy', kcal: 86, p: 1.6, c: 20, f: 0.1, packG: 1000, match: ['batat'] },
  kuskus: { name: 'Kuskus (syrový)', cat: 'sacharidy', kcal: 360, p: 12, c: 72, f: 1, packG: 500, match: ['kuskus'] },
  bulgur: { name: 'Bulgur (syrový)', cat: 'sacharidy', kcal: 340, p: 12, c: 70, f: 1.5, packG: 500, match: ['bulgur'] },
  quinoa: { name: 'Quinoa (syrová)', cat: 'sacharidy', kcal: 370, p: 14, c: 64, f: 6, packG: 500, match: ['quinoa'] },
  pohanka: { name: 'Pohanka (syrová)', cat: 'sacharidy', kcal: 345, p: 13, c: 70, f: 3, packG: 500, match: ['pohanka'] },
  musli: { name: 'Müsli', cat: 'sacharidy', kcal: 400, p: 9, c: 65, f: 10, packG: 750, match: ['musli', 'granola'] },
  ryzove_chlebicky: { name: 'Rýžové chlebíčky', cat: 'sacharidy', kcal: 385, p: 8, c: 82, f: 3, pieceG: 8, packG: 100, match: ['ryzove chleb', 'ryzovy chleb'] },

  // ---------- pečivo ----------
  chleb: { name: 'Chléb žitno-pšeničný', cat: 'pecivo', kcal: 240, p: 8, c: 47, f: 1.5, pieceG: 45, packG: 500, match: ['chleb$'] },
  celozrnny_toust: { name: 'Celozrnný toustový chléb', cat: 'pecivo', kcal: 250, p: 9, c: 43, f: 4, pieceG: 30, packG: 500, match: ['toustov', 'toast'] },
  rohlik: { name: 'Rohlík', cat: 'pecivo', kcal: 300, p: 9, c: 58, f: 3, pieceG: 43, packG: 43, packLabel: '1 ks', match: ['rohlik'] },
  tortilla: { name: 'Tortilla (pšeničná)', cat: 'pecivo', kcal: 300, p: 8, c: 50, f: 8, pieceG: 40, packG: 240, packLabel: '6 ks', match: ['tortill', 'wrap'] },

  // ---------- ovoce ----------
  banan: { name: 'Banán', cat: 'ovoce', kcal: 89, p: 1.1, c: 23, f: 0.3, pieceG: 120, packG: 1000, match: ['banan'], exclude: ['chips', 'susen'], loose: true },
  jablko: { name: 'Jablko', cat: 'ovoce', kcal: 52, p: 0.3, c: 14, f: 0.2, pieceG: 180, packG: 1000, match: ['jablk'], exclude: ['dzus', 'stava', 'mostu', 'susen'], loose: true },
  pomeranc: { name: 'Pomeranč', cat: 'ovoce', kcal: 47, p: 0.9, c: 12, f: 0.1, pieceG: 200, packG: 1000, match: ['pomeranc'], exclude: ['dzus', 'stava'], loose: true },
  mandarinka: { name: 'Mandarinka', cat: 'ovoce', kcal: 53, p: 0.8, c: 13, f: 0.3, pieceG: 70, packG: 1000, match: ['mandarink', 'klementin'], loose: true },
  boruvky: { name: 'Borůvky', cat: 'ovoce', kcal: 57, p: 0.7, c: 14, f: 0.3, packG: 125, match: ['boruvk'] },
  jahody: { name: 'Jahody', cat: 'ovoce', kcal: 32, p: 0.7, c: 8, f: 0.3, packG: 250, match: ['jahod'], exclude: ['susen', 'mrazem', 'dzem', 'sirup'] },
  hrozny: { name: 'Hrozny', cat: 'ovoce', kcal: 69, p: 0.7, c: 18, f: 0.2, packG: 500, match: ['hrozn', 'hrozen'] },
  kiwi: { name: 'Kiwi', cat: 'ovoce', kcal: 61, p: 1.1, c: 15, f: 0.5, pieceG: 75, packG: 450, packLabel: '6 ks', match: ['kiwi'] },
  hruska: { name: 'Hruška', cat: 'ovoce', kcal: 57, p: 0.4, c: 15, f: 0.1, pieceG: 170, packG: 1000, match: ['hrusk'], exclude: ['dzus', 'stava'], loose: true },

  // ---------- zelenina ----------
  brokolice: { name: 'Brokolice', cat: 'zelenina', kcal: 34, p: 2.8, c: 7, f: 0.4, pieceG: 400, packG: 400, packLabel: '1 ks', match: ['brokolic'] },
  spenat_mrazeny: { name: 'Špenát (mražený)', cat: 'zelenina', kcal: 23, p: 2.9, c: 3.6, f: 0.4, packG: 400, match: ['spenat'] },
  rajcata: { name: 'Rajčata', cat: 'zelenina', kcal: 18, p: 0.9, c: 3.9, f: 0.2, pieceG: 120, packG: 500, match: ['rajcat', 'rajce'], exclude: ['cherry', 'loupan', 'protlak', 'konzerv', 'pasta', 'susen'], loose: true },
  cherry_rajcata: { name: 'Cherry rajčata', cat: 'zelenina', kcal: 18, p: 0.9, c: 3.9, f: 0.2, packG: 250, match: ['rajcata cherry', 'cherry rajc'] },
  okurka: { name: 'Okurka salátová', cat: 'zelenina', kcal: 15, p: 0.7, c: 3, f: 0.1, pieceG: 300, packG: 300, packLabel: '1 ks', match: ['okurka', 'okurky salat'], exclude: ['nakladan', 'sterilov'] },
  paprika: { name: 'Paprika', cat: 'zelenina', kcal: 31, p: 1, c: 6, f: 0.3, pieceG: 150, packG: 450, packLabel: '3 ks', match: ['paprika', 'papriky'], exclude: ['mleta', 'korenici', 'sterilov'], loose: true },
  mrkev: { name: 'Mrkev', cat: 'zelenina', kcal: 41, p: 0.9, c: 10, f: 0.2, pieceG: 80, packG: 1000, match: ['mrkev'], loose: true },
  cuketa: { name: 'Cuketa', cat: 'zelenina', kcal: 17, p: 1.2, c: 3, f: 0.3, pieceG: 300, packG: 300, packLabel: '1 ks', match: ['cuket'] },
  ledovy_salat: { name: 'Ledový salát', cat: 'zelenina', kcal: 14, p: 0.9, c: 3, f: 0.1, pieceG: 400, packG: 400, packLabel: '1 ks', match: ['ledovy salat', 'salat ledov'] },
  cibule: { name: 'Cibule', cat: 'zelenina', kcal: 40, p: 1.1, c: 9, f: 0.1, pieceG: 100, packG: 1000, match: ['cibule'], exclude: ['smazen', 'susen'], loose: true },
  cesnek: { name: 'Česnek', cat: 'zelenina', kcal: 149, p: 6.4, c: 33, f: 0.5, pieceG: 5, packG: 100, match: ['cesnek$'], loose: true },
  avokado: { name: 'Avokádo', cat: 'zelenina', kcal: 160, p: 2, c: 9, f: 15, pieceG: 130, packG: 130, packLabel: '1 ks', match: ['avokad'] },
  kukurice_konzerva: { name: 'Kukuřice (konzerva, okapaná)', cat: 'zelenina', kcal: 80, p: 2.5, c: 15, f: 1, packG: 165, packLabel: '1 konzerva', match: ['kukurice'] },
  hrasek_mrazeny: { name: 'Hrášek (mražený)', cat: 'zelenina', kcal: 80, p: 5, c: 14, f: 0.4, packG: 450, match: ['hrasek'] },
  zeleninova_smes: { name: 'Zeleninová směs (mražená)', cat: 'zelenina', kcal: 45, p: 2.5, c: 8, f: 0.5, packG: 750, match: ['zeleninova smes', 'smes zelenin', 'zelenina mrazen'] },

  // ---------- luštěniny a rostlinné ----------
  cocka: { name: 'Čočka (syrová)', cat: 'lusteniny', kcal: 350, p: 25, c: 60, f: 1, packG: 500, match: ['cocka'] },
  cizrna_konzerva: { name: 'Cizrna (konzerva, okapaná)', cat: 'lusteniny', kcal: 140, p: 8, c: 22, f: 3, packG: 240, packLabel: '1 konzerva', match: ['cizrna'] },
  fazole_konzerva: { name: 'Fazole (konzerva, okapané)', cat: 'lusteniny', kcal: 100, p: 7, c: 17, f: 0.5, packG: 240, packLabel: '1 konzerva', match: ['fazole$', 'fazole cerven', 'fazole bil'] },
  tofu: { name: 'Tofu', cat: 'lusteniny', kcal: 120, p: 12, c: 2, f: 7, packG: 200, match: ['tofu'] },

  // ---------- tuky, ořechy a semínka ----------
  olivovy_olej: { name: 'Olivový olej', cat: 'tuky', kcal: 884, p: 0, c: 0, f: 100, packG: 750, packLabel: '750 ml', match: ['olivovy olej', 'olej olivov'] },
  repkovy_olej: { name: 'Řepkový olej', cat: 'tuky', kcal: 884, p: 0, c: 0, f: 100, packG: 1000, packLabel: '1 l', match: ['repkovy olej', 'olej repkov', 'slunecnicovy olej'] },
  arasidove_maslo: { name: 'Arašídové máslo', cat: 'tuky', kcal: 600, p: 25, c: 20, f: 50, packG: 350, match: ['arasidove maslo', 'arasidovy krem', 'burakove maslo'] },
  mandle: { name: 'Mandle', cat: 'tuky', kcal: 580, p: 21, c: 22, f: 50, packG: 200, match: ['mandle'], exclude: ['mleko', 'napoj', 'cukru', 'cokolad', 'solen'] },
  vlasske_orechy: { name: 'Vlašské ořechy', cat: 'tuky', kcal: 650, p: 15, c: 14, f: 65, packG: 150, match: ['vlasske'] },
  kesu: { name: 'Kešu', cat: 'tuky', kcal: 553, p: 18, c: 30, f: 44, packG: 200, match: ['kesu'] },
  chia: { name: 'Chia semínka', cat: 'tuky', kcal: 490, p: 17, c: 42, f: 31, packG: 200, match: ['chia'] },

  // ---------- ostatní ----------
  protein_syrovatkovy: { name: 'Syrovátkový protein (prášek)', cat: 'ostatni', kcal: 380, p: 78, c: 6, f: 5, pieceG: 30, packG: 1000, match: ['whey', 'syrovatkov', 'proteinovy prasek', 'protein prasek'], exclude: ['tycink', 'napoj', 'pudink', 'jogurt', 'rohlik', 'chleb'] },
  med: { name: 'Med', cat: 'ostatni', kcal: 320, p: 0.3, c: 80, f: 0, packG: 250, match: ['med$'] },
  dzem: { name: 'Džem', cat: 'ostatni', kcal: 250, p: 0.5, c: 60, f: 0, packG: 340, match: ['dzem', 'marmelad'] },
  horka_cokolada: { name: 'Hořká čokoláda 70 %', cat: 'ostatni', kcal: 580, p: 8, c: 35, f: 42, packG: 100, match: ['horka cokolada', 'cokolada horka'] },
  kecup: { name: 'Kečup', cat: 'ostatni', kcal: 100, p: 1.5, c: 25, f: 0.2, packG: 500, match: ['kecup'] },
  horcice: { name: 'Hořčice', cat: 'ostatni', kcal: 90, p: 5, c: 8, f: 4, packG: 250, match: ['horcice'] },
  sojova_omacka: { name: 'Sójová omáčka', cat: 'ostatni', kcal: 60, p: 6, c: 6, f: 0, packG: 150, packLabel: '150 ml', match: ['sojova omacka'] },
  rajcatovy_protlak: { name: 'Rajčatový protlak / passata', cat: 'ostatni', kcal: 30, p: 1.5, c: 5, f: 0.3, packG: 500, match: ['passata', 'protlak', 'rajcata loupan', 'loupana rajcata'] },
  kakao: { name: 'Kakao (holandské)', cat: 'ostatni', kcal: 350, p: 20, c: 12, f: 20, packG: 100, match: ['kakao holand', 'kakaovy prasek'], exclude: ['granko', 'instant'] },
};

export const FOOD_IDS = Object.keys(FOODS);

/** Text bez diakritiky, malá písmena, sjednocené mezery — pro vyhledávání a párování akcí. */
export function normText(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%,.$\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// ===== src/engine/food.js =====
// Jídlo: jídla složená z potravin (makra se počítají PŘI TVORBĚ, ne při jídle),
// týdenní plán na kalorie a bílkoviny z enginu výživy, nákupní seznam sečtený
// z celého týdne a zaokrouhlený na balení, a jednoduché „snědeno“ bez focení.
// Čistý modul bez DOM — všechno je testovatelné.



export const PORTION_MIN = 0.6;
export const PORTION_MAX = 1.6;
const PORTION_STEP = 0.05;

// ---------- potraviny ----------

/** Potravina podle id — vestavěná, nebo vlastní (z Open Food Facts / ručně). */
export function foodById(id, customFoods = []) {
  return FOODS[id] ?? customFoods.find((f) => f.id === id) ?? null;
}

/** Fulltext nad vestavěnými + vlastními potravinami, bez diakritiky, řazeno podle shody. */
export function searchFoods(query, customFoods = [], limit = 12) {
  const q = normText(query);
  if (!q) return [];
  const words = q.split(' ');
  const all = [
    ...Object.entries(FOODS).map(([id, f]) => ({ id, ...f })),
    ...customFoods,
  ];
  return all
    .map((f) => {
      const name = normText(f.name);
      let score = 0;
      for (const w of words) {
        if (name.startsWith(w)) score += 3;
        else if (name.split(' ').some((n) => n.startsWith(w))) score += 2;
        else if (name.includes(w)) score += 1;
        else return null;
      }
      return { food: f, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'cs'))
    .slice(0, limit)
    .map((x) => x.food);
}

// ---------- makra ----------

export function emptyMacros() { return { kcal: 0, p: 0, c: 0, f: 0 }; }

export function addMacros(a, b, factor = 1) {
  return { kcal: a.kcal + b.kcal * factor, p: a.p + b.p * factor, c: a.c + b.c * factor, f: a.f + b.f * factor };
}

export function roundMacros(m) {
  return { kcal: Math.round(m.kcal), p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f) };
}

/** Makra jedné položky jídla { foodId, grams }. Neznámá potravina = 0 (jídlo se nerozbije). */
export function itemMacros(item, customFoods = []) {
  const food = foodById(item.foodId, customFoods);
  if (!food || !(item.grams > 0)) return emptyMacros();
  const k = item.grams / 100;
  return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
}

/** Makra celého jídla (na 1 porci). */
export function mealMacros(meal, customFoods = []) {
  return (meal?.items ?? []).reduce((acc, it) => addMacros(acc, itemMacros(it, customFoods)), emptyMacros());
}

// ---------- plán ----------

/** Pondělí týdne, do kterého spadá iso. */
export function weekStartOf(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Po = 0
  return addDays(iso, -dow);
}

export function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Kalorický cíl slotu z denního cíle (podíly ze FOOD_SLOTS). */
export function slotTargets(targets) {
  return Object.fromEntries(FOOD_SLOTS.map((s) => [s.id, { kcal: targets.kcal * s.share, proteinG: targets.proteinG * s.share }]));
}

function bestPortion(mealKcal, wantKcal) {
  if (!(mealKcal > 0)) return 1;
  const raw = wantKcal / mealKcal;
  return Math.round(clamp(raw, PORTION_MIN, PORTION_MAX) / PORTION_STEP) * PORTION_STEP;
}

/**
 * Potraviny, které jsou teď v akci (id → položka akce). Párování přes vzory v FOODS.match.
 * @param discounts { items: [{ name, ... }] } feed z akce-lidl.json
 */
export function matchDiscounts(discounts, customFoods = []) {
  const out = {};
  const items = discounts?.items ?? [];
  const all = [
    ...Object.entries(FOODS).map(([id, f]) => ({ id, ...f })),
    ...customFoods.filter((f) => f.match?.length),
  ];
  for (const item of items) {
    const words = normText(item.name).split(' ');
    for (const f of all) {
      if (out[f.id]) continue;
      if ((f.exclude ?? []).some((x) => patternHits(x, words))) continue;
      if ((f.match ?? []).some((m) => patternHits(m, words))) out[f.id] = item;
    }
  }
  return out;
}

// Vzor „kureci prs“ = každé slovo vzoru je předponou některého slova názvu (pořadí nehraje roli);
// „med$“ = přesné slovo. Díky tomu „Mléko trvanlivé … 3,5% plnotučné“ chytne „mleko plnotuc“.
export function patternHits(pattern, nameWords) {
  const parts = normText(pattern.replace(/\$/g, ' $')).split(' ');
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (w === '$' || !w) continue;
    const exact = parts[i + 1] === '$';
    if (!nameWords.some((n) => (exact ? n === w : n.startsWith(w)))) return false;
  }
  return true;
}

/** Kolik položek jídla je v akci (0–1 podíl gramů) — pro plánovač i štítek v UI. */
export function mealDiscountShare(meal, discounted) {
  const total = (meal.items ?? []).reduce((a, it) => a + (it.grams || 0), 0);
  if (!total) return 0;
  const hit = meal.items.reduce((a, it) => a + (discounted[it.foodId] ? it.grams : 0), 0);
  return hit / total;
}

/**
 * Naplánuje týden: pro každý den a slot vybere jídlo tak, aby den seděl na kcal
 * (±5 %) a bílkoviny (≥ cíl), s preferencí jídel v akci a s obměnou dnů.
 * Deterministické — stejný vstup, stejný plán.
 * @returns { days: { [iso]: { [slotId]: { mealId, portion } } }, totals: { [iso]: macros } } | null
 */
export function planWeek({ targets, meals, customFoods = [], weekStart, discounted = {}, keep = {} }) {
  if (!targets || !meals?.length) return null;
  const withMacros = meals.map((m) => ({ meal: m, macros: mealMacros(m, customFoods), disc: mealDiscountShare(m, discounted) }))
    .filter((x) => x.macros.kcal > 0);
  if (!withMacros.length) return null;

  const slotT = slotTargets(targets);
  const days = {};
  const totals = {};
  const usedAt = {}; // mealId → poslední den (index), kdy bylo použito — obměna
  const dayList = weekDays(weekStart);

  dayList.forEach((iso, di) => {
    const day = {};
    let dayMacros = emptyMacros();

    for (const slot of FOOD_SLOTS) {
      const kept = keep?.[iso]?.[slot.id];
      if (kept?.mealId) {
        const km = withMacros.find((x) => x.meal.id === kept.mealId);
        if (km) {
          day[slot.id] = { mealId: kept.mealId, portion: kept.portion ?? 1 };
          dayMacros = addMacros(dayMacros, km.macros, kept.portion ?? 1);
          usedAt[kept.mealId] = di;
          continue;
        }
      }
      const want = slotT[slot.id];
      let best = null;
      for (const x of withMacros) {
        const fits = !x.meal.slot || x.meal.slot === slot.id.replace(/\d$/, '');
        if (!fits) continue;
        const portion = bestPortion(x.macros.kcal, want.kcal);
        const kcalErr = Math.abs(x.macros.kcal * portion - want.kcal) / Math.max(want.kcal, 1);
        const proteinBonus = Math.min(x.macros.p * portion / Math.max(want.proteinG, 1), 1.5);
        const recency = usedAt[x.meal.id] == null ? 0 : Math.max(0, 3 - (di - usedAt[x.meal.id]));
        const score = -kcalErr * 4 + proteinBonus * 1.2 + x.disc * 1.5 - recency * 0.9;
        if (!best || score > best.score) best = { x, portion, score };
      }
      if (!best) continue;
      day[slot.id] = { mealId: best.x.meal.id, portion: best.portion };
      dayMacros = addMacros(dayMacros, best.x.macros, best.portion);
      usedAt[best.x.meal.id] = di;
    }

    // Dorovnání dne: kcal do ±5 % a bílkoviny ≥ cíl — škáluje porce jídel s nejvyšší hustotou bílkovin
    for (let iter = 0; iter < 6; iter++) {
      const kcalGap = targets.kcal - dayMacros.kcal;
      const pGap = targets.proteinG - dayMacros.p;
      if (Math.abs(kcalGap) <= targets.kcal * 0.05 && pGap <= 0) break;
      const entries = Object.entries(day).filter(([sid]) => !keep?.[iso]?.[sid]?.mealId);
      if (!entries.length) break;
      const scored = entries.map(([sid, e]) => {
        const x = withMacros.find((m) => m.meal.id === e.mealId);
        const density = x.macros.p / Math.max(x.macros.kcal, 1);
        return { sid, e, x, density };
      });
      // bílkoviny chybí → zvětši nejhustší; kalorie přebývají → zmenši nejméně hustou
      const pick = pGap > 0 || kcalGap > 0
        ? scored.sort((a, b) => b.density - a.density)[0]
        : scored.sort((a, b) => a.density - b.density)[0];
      const dir = kcalGap > 0 || pGap > 0 ? 1 : -1;
      const next = clamp(pick.e.portion + dir * PORTION_STEP * 2, PORTION_MIN, PORTION_MAX);
      if (next === pick.e.portion) break;
      dayMacros = addMacros(dayMacros, pick.x.macros, next - pick.e.portion);
      pick.e.portion = Math.round(next * 100) / 100;
    }

    days[iso] = day;
    totals[iso] = roundMacros(dayMacros);
  });

  return { weekStart, days, totals };
}

/** Makra dne z plánu (s porcemi). */
export function dayPlanMacros(dayPlan, meals, customFoods = []) {
  let m = emptyMacros();
  for (const e of Object.values(dayPlan ?? {})) {
    const meal = meals.find((x) => x.id === e.mealId);
    if (meal) m = addMacros(m, mealMacros(meal, customFoods), e.portion ?? 1);
  }
  return roundMacros(m);
}

// ---------- snědeno ----------

/**
 * Co bylo dnes reálně snědeno: zaškrtnuté sloty z plánu + volné položky navíc.
 * @param eatenDay { [slotId]: true, extra: [{ name, kcal, p }] }
 */
export function eatenMacros(dayPlan, eatenDay, meals, customFoods = []) {
  let m = emptyMacros();
  for (const [sid, e] of Object.entries(dayPlan ?? {})) {
    if (!eatenDay?.[sid]) continue;
    const meal = meals.find((x) => x.id === e.mealId);
    if (meal) m = addMacros(m, mealMacros(meal, customFoods), e.portion ?? 1);
  }
  for (const x of eatenDay?.extra ?? []) m = addMacros(m, { kcal: x.kcal || 0, p: x.p || 0, c: x.c || 0, f: x.f || 0 });
  return roundMacros(m);
}

// ---------- nákupní seznam ----------

/**
 * Sečte gramy potravin přes celý týden (porce × položky), zaokrouhlí na balení
 * a připojí akci, pokud potravina v akci je. Seskupeno podle kategorie.
 * @returns [{ cat, label, items: [{ foodId, name, grams, packs, packLabel, discount }] }]
 */
export function shoppingList(plan, meals, customFoods = [], discounted = {}) {
  const grams = {};
  for (const day of Object.values(plan?.days ?? {})) {
    for (const e of Object.values(day)) {
      const meal = meals.find((x) => x.id === e.mealId);
      if (!meal) continue;
      for (const it of meal.items ?? []) grams[it.foodId] = (grams[it.foodId] ?? 0) + it.grams * (e.portion ?? 1);
    }
  }
  const byCat = {};
  for (const [foodId, g] of Object.entries(grams)) {
    const food = foodById(foodId, customFoods);
    if (!food) continue;
    const packG = food.packG ?? 500;
    const packs = Math.max(1, Math.ceil(g / packG - 0.05)); // 5 % tolerance — kvůli 505 g nekupuj dvě balení
    // počet kusů jen tam, kde se tak nakupuje (vejce „10 ks“, ovoce na kusy) — ne u chleba (krajíce) ani proteinu (odměrky)
    const countable = !!food.pieceG && (food.loose || /\bks\b/.test(food.packLabel ?? ''));
    const pieces = countable ? Math.ceil(g / food.pieceG) : null;
    const cat = food.cat ?? 'ostatni';
    (byCat[cat] ??= []).push({
      foodId, name: food.name, grams: Math.round(g), packs, pieces,
      packLabel: food.packLabel ?? (packG >= 1000 ? `${packG / 1000} kg` : `${packG} g`),
      discount: discounted[foodId] ?? null,
    });
  }
  return Object.keys(FOOD_CATEGORIES)
    .filter((cat) => byCat[cat])
    .map((cat) => ({ cat, label: FOOD_CATEGORIES[cat], items: byCat[cat].sort((a, b) => b.grams - a.grams) }));
}

// ---------- startovní jídla ----------

// 14 poctivých jídel na lean bulk — každé z vestavěných potravin, ať jde plán udělat
// na jeden klik. Uživatel si je upraví nebo smaže.
export function starterMeals() {
  const m = (id, name, slot, items) => ({ id, name, slot, items: items.map(([foodId, grams]) => ({ foodId, grams })), starter: true });
  return [
    m('s_ovesna_kase', 'Ovesná kaše s tvarohem a banánem', 'snidane', [['ovesne_vlocky', 80], ['mleko_polotucne', 250], ['tvaroh_polotucny', 125], ['banan', 120], ['med', 15]]),
    m('s_vejce_chleb', 'Míchaná vejce s chlebem a zeleninou', 'snidane', [['vejce', 165], ['chleb', 90], ['maslo', 8], ['rajcata', 120], ['sunka', 50]]),
    m('s_skyr_musli', 'Skyr s müsli a borůvkami', 'snidane', [['skyr', 300], ['musli', 60], ['boruvky', 100], ['mandle', 15]]),
    m('s_tvaroh_med', 'Tvaroh s medem a ořechy', 'svacina', [['tvaroh_polotucny', 250], ['med', 20], ['vlasske_orechy', 20]]),
    m('s_protein_banan', 'Protein s mlékem a banánem', 'svacina', [['protein_syrovatkovy', 30], ['mleko_polotucne', 300], ['banan', 120]]),
    m('s_jogurt_ovoce', 'Řecký jogurt s ovocem', 'svacina', [['recky_jogurt', 200], ['jablko', 180], ['arasidove_maslo', 15]]),
    m('s_chleb_sunka_syr', 'Chléb se šunkou, sýrem a okurkou', 'svacina', [['chleb', 90], ['sunka', 60], ['eidam', 30], ['okurka', 100]]),
    m('s_kure_ryze', 'Kuřecí prsa s rýží a brokolicí', 'obed', [['kureci_prsa', 200], ['ryze', 100], ['brokolice', 200], ['olivovy_olej', 10]]),
    m('s_hovezi_brambory', 'Hovězí mleté s bramborami a zeleninou', 'obed', [['hovezi_mlete', 180], ['brambory', 350], ['zeleninova_smes', 200], ['repkovy_olej', 8]]),
    m('s_testoviny_tunak', 'Těstoviny s tuňákem a rajčaty', 'obed', [['testoviny', 120], ['tunak_konzerva', 110], ['rajcatovy_protlak', 150], ['cibule', 50], ['olivovy_olej', 10], ['parmezan', 15]]),
    m('s_losos_bataty', 'Losos s batáty a špenátem', 'vecere', [['losos', 180], ['bataty', 300], ['spenat_mrazeny', 150], ['olivovy_olej', 8]]),
    m('s_kure_kuskus', 'Kuřecí s kuskusem a zeleninou', 'vecere', [['kureci_prsa', 180], ['kuskus', 90], ['paprika', 150], ['cuketa', 150], ['olivovy_olej', 10]]),
    m('s_tortilla_kure', 'Tortilly s kuřecím, sýrem a salátem', 'vecere', [['tortilla', 120], ['kureci_prsa', 150], ['eidam', 40], ['ledovy_salat', 80], ['rajcata', 100], ['kecup', 20]]),
    m('s_ryze_vejce_zelenina', 'Smažená rýže s vejci a zeleninou', 'vecere', [['ryze', 100], ['vejce', 110], ['zeleninova_smes', 200], ['sojova_omacka', 15], ['repkovy_olej', 10]]),
  ];
}

// ---------- vlastní potravina z Open Food Facts ----------

/** Převod produktu z OFF na vlastní potravinu (id stabilní z čárového kódu). */
export function foodFromOpenFoodFacts(product) {
  const n = product?.nutriments ?? {};
  const kcal = Number(n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : NaN));
  if (!Number.isFinite(kcal)) return null;
  const name = [product.product_name, product.brands].filter(Boolean).join(' · ').trim();
  if (!name) return null;
  return {
    id: `off_${product.code ?? normText(name).replace(/\s+/g, '_')}`,
    name,
    cat: 'ostatni',
    kcal: Math.round(kcal),
    p: Number(n.proteins_100g ?? 0),
    c: Number(n.carbohydrates_100g ?? 0),
    f: Number(n.fat_100g ?? 0),
    packG: parsePackGrams(product.quantity) ?? 500,
    source: 'off',
  };
}

export function parsePackGrams(q) {
  const m = normText(q).match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return m[2] === 'kg' || m[2] === 'l' ? Math.round(v * 1000) : Math.round(v);
}
