# Fitko — požadavky a audit z 13. 9. 2026

Zadal Niklas (hlasem, přepis), sepsáno před začátkem prací. Slouží jako zadání,
audit současného stavu a průběžný stav prací. Aktualizuje se během kódování.

---

## 1. Audit současného výpočetního systému

Prošel jsem celý `engine.mjs` (stejná kopie je vložená v `index.html`) a orchestraci
v `appstate.js`. Níže je, jak to dnes doopravdy funguje a kde to nesedí.

### 1.1 Progrese zátěže (`computeNextPrescription`) — funguje správně

Dvojitá progrese s autoregulací podle RIR (kolik opakování zbylo v rezervě). Pořadí
pravidel po každém tréninku:

1. **Kalibrace.** Cvik bez známé váhy → „najdi váhu na střed rozsahu“. U shybů a dipů
   je váha přídavná zátěž, vlastní tělo = 0.
2. **Regrese.** Poslední trénink měl sérii pod spodní hranicí rozsahu při plném úsilí
   (RIR nejvýš horní cíl). Když se to stalo i v tréninku předtím na stejné nebo vyšší
   váze → váha −5 % zaokrouhleno na krok dolů, rozsah se vrátí na základní. Poprvé
   → drž váhu, cíl je spodní hranice rozsahu.
3. **Strop rozsahu.** Všechny pracovní série na stropu rozsahu s rezervou aspoň spodní
   cílový RIR → přidat krok (2,5 kg osa, 2 kg jednoručky, 5 kg stack). Když by krok
   byl víc než 10 % zátěže (lehké jednoručky, upažování), místo toho se prodlouží strop
   rozsahu o 2 opakování (nejvýš +6), pak teprve váha.
4. **Jinak** drž váhu; série, která měla rezervu, dostane +1 opakování (do stropu).

Rozcvičky a dropsety se do rozhodování nepočítají. Deload tréninky se z historie
vynechávají. Po tréninku se jako váha cviku uloží to, co jsi reálně zvedl v poslední
pracovní sérii (zdroj pravdy = realita, ne plán).

**Verdikt: správně a konzervativně.** Neměním. Jediné, co uživatel musí dělat, je
poctivě ťukat RIR: když ho nechá na výchozím (spodní cíl), engine bere sérii jako
„v cílové rezervě“, což je nejmírnější možná interpretace.

### 1.2 Autoregulace uvnitř tréninku (`adjustRemainingTargets`) — funguje správně

Po každé zapsané pracovní sérii se přepočítají zbývající série cviku:

- RIR 4 a víc (u izolací 3 a víc) → zbývající série o krok těžší; když krok nejde
  (10% pravidlo), +2 opakování.
- RIR pod spodní cíl → zbývající série mají cíl opakování, kolik jsi reálně dal;
  když je cíl už na spodku rozsahu, ubere se jeden krok na váze.
- Odznačení série vrátí vše do stavu, jako by zapsaná nebyla (čistý přepočet).

### 1.3 Deload a objem — logika správná, ale přibitá k 5dennímu programu

- **Deload se nabídne**, když aspoň 2 klíčové cviky čekají na regresi (−5 %), nebo
  3 dny po sobě check-in pod 2,5/5, nebo 10 týdnů bez deloadu. Deload = polovina
  sérií, −25 % váhy, RIR 3+, bez dropsetů, trvá 5 tréninků. Po něm se přidaný objem
  vrátí o jednu sérii níž.
- **Objem se nabídne** nejdřív po 3 týdnech od poslední změny, když aspoň 60 % cviků
  progreduje a průměrná připravenost je aspoň 3,5. Stropy: 20 tvrdých sérií na partii
  týdně, 10 v jednom tréninku, +2 na partii za cyklus.

**Problém:** délka deloadu (5), streak (4 z 5 tréninků týdně), sloty pro objem i pořadí
jednotek jsou napevno z `WEEK_TEMPLATE`. Pro Matildu s 2 tréninky týdně by streak nikdy
nevznikl a deload by trval 2,5 týdne. → Program musí být součástí profilu (bod R6).

### 1.4 Výživa — funguje jen pro lean bulk, pro hubnutí je nepoužitelná

Jak to dnes je:

- Start: Mifflin-St Jeor (BMR) × 1,7 + 350 kcal. **Vždy** fáze „bulk“, bílkoviny
  1,8 g/kg.
- Každý týden: průměr posledních 7 dní vážení vs. průměr 7 dní předtím → tempo v %
  váhy/týden. Porovná se s pásmem priority (vyvážené +0,25 až +0,30 %/týden). Pod
  pásmem → +100 nebo +150 kcal, nad pásmem → −100/−150. Podmínky: aspoň 3. týden,
  aspoň 6 vážení za 14 dní, poslední vážení nejvýš 5 dní staré.
- Tvrdé meze 2 200 až 5 500 kcal.
- Mini-cut (pas ≥ polovina výšky nebo pas roste přes 1 cm/měsíc): −550 kcal pod odhad
  udržení, bílkoviny 2,1 g/kg, 7 týdnů, pak zpět do bulku.

Co nesedí:

1. **Neexistuje fáze hubnutí ani udržování.** Kdo má cíl pod svou váhou, dostane
   +350 kcal a engine se týden co týden snaží, aby váha ROSTLA. Pro Matildu (53 kg,
   cíl 51) přesně naopak, než chce.
2. **Minimum 2 200 kcal** je pro 53 kg ženu nad udržovacím příjmem (BMR ≈ 1 290,
   udržení při 2 trénincích ≈ 1 850). Deficit by nikdy nevznikl.
3. **Aktivita 1,7 napevno**, bez ohledu na 2 vs. 5 tréninků týdně.
4. **Po dosažení cíle se nic nestane** — engine dál tlačí přírůstek.
5. Vzorec BMR má parametr pohlaví, ale profil ho nikdy nenastaví jinak než „muž“.

Pro Niklase (85 → 95 kg) to dnes funguje správně. Pro Matildu je nutná přestavba (R4).

### 1.5 Projekce, milníky, texty — všechno předpokládá nabírání

- `projectGoalDate`: klesající váha = stav „losing“ (špatně), milník je vždy +1 kg,
  „poctivá projekce“ a týdenní zpráva mluví jen o bulku. `honestPlan` má režim „cut“,
  ale jen pro zobrazení v onboardingu — cíle výživy se podle něj nenastaví.
- Streak předpokládá 5 tréninků týdně.

### 1.6 Technické příčiny hlášených chyb

- **Spodní lišta lítá.** Lišta je `position: fixed` a při každém překreslení se maže a
  vytváří znovu. iOS Safari (hlavně v appce z plochy) při otevřené klávesnici posune
  fixní prvky nad klávesnici a po jejím zavření je u nově vytvořeného prvku nevrátí —
  na screenshotu sedí lišta přesně o výšku klávesnice výš. Oprava: rozvržení bez
  `fixed` (obsah roluje v kontejneru, lišta je pevný „dock“ pod ním).
- **Pauza nepípá ve sluchátkách.** Zvuk jde jen přes Web Audio. Na iOS ho tichý
  režim (přepínač) umlčí; Bluetooth sluchátka navíc mezi tóny uspí spojení a první tón
  spolknou; po přepnutí výstupu skončí audio kontext ve stavu „interrupted“, který se
  neobnovuje. Oprava: relace „playback“, tichá stopa, která drží spojení po dobu pauzy,
  obnova kontextu, záložní přehrání přes `<audio>`, tlačítko „Test zvuku“ v Nastavení.

---

## 2. Požadavky

Priorita P1 = nejdřív, P3 = nakonec. Složitost S / M / L.

| # | Požadavek | Pri. | Slož. |
|---|-----------|------|-------|
| R1 | Spodní lišta pevně ukotvená, nelítá při přepínání ani po klávesnici | P1 | S |
| R2 | Zvuk pauzy funguje v Bluetooth sluchátkách i v tichém režimu; odpočet 3, 2, 1, píp; tlačítko na vyzkoušení | P1 | S |
| R3 | Nákupní seznam srozumitelný: kolik balení koupit je hlavní údaj, spotřeba je vedlejší; akce s množstvím a cenou za jednotku (rýže 5 kg za 189,90 Kč se nesmí tvářit jako 1 kg); barvy podle kategorie | P1 | S |
| R4 | Výživa pro hubnutí / udržování / nabírání: fáze podle cíle, ženský vzorec, aktivita podle počtu tréninků, bezpečná minima (BMI 18,5, kalorický floor), automatický přechod na udržování po dosažení cíle, BMI a zdravé pásmo v profilu | P1 | M |
| R5 | Projekce, milníky, týdenní zpráva a texty podle směru cíle; streak podle počtu tréninkových dnů | P1 | M |
| R6 | Program jako součást profilu: generátor z preferencí (2 až 5 dnů, spodek / celé tělo / vyvážené, bez horní části, zranění, oblíbené a neoblíbené cviky). Nové cviky pro spodek (hip thrust, abdukce, kickback, goblet dřep, step-up, sumo, hyperextenze, plank). Deload, streak a objem se řídí programem | P1 | M |
| R7 | Dva uživatelé: každý telefon si zvolí „Já jsem“, každý má vlastní zálohu ve stejném gistu (stejný token), společný soubor domácnosti (plán vaření, nákup, recepty). Onboarding pro Matildu s reálnými preferencemi. Push notifikace pro oba | P1 | L |
| R8 | Recepty a plán vaření do krabiček: v neděli (a ve středu) plán „uvař X krabiček A (3 Niklas, 2 Matilda)“, porce podle kalorií a bílkovin každého, ingredience sečtené, recept krok za krokem, doba přípravy, trvanlivost v lednici, mrazák, vakuovačka. Barevně, s obrázkem | P1 | L |
| R9 | Lehký barevný redesign záložky Jídlo a přehledu: barvy kategorií, barva osoby, intuitivnější karty na telefonu | P2 | M |
| R10 | AI konzultace týdenního plánu: GitHub Action se zeptá Claude API (secret `ANTHROPIC_API_KEY`) a uloží návrh týdne + případné nové recepty ve schématu do gistu; appka návrh ukáže k potvrzení. Bez klíče jede vestavěný plánovač | P2 | L |
| R11 | Fotky receptů (vygenerované), uložené v repu, malé | P3 | M |
| R12 | Build: jeden zdroj pro engine (`engine.mjs` → vložení do `index.html`), verze a cache service workeru se zvedají skriptem | P2 | S |

---

## 3. Pořadí prací podle složitosti

**S (malé, hned):** R1 lišta, R2 zvuk, R3 nákup, R12 build.

**M (střední):** R4 výživa, R5 projekce a texty, R6 program z profilu, R9 barvy.

**L (velké):** R7 dva uživatelé, R8 recepty a krabičky, R10 AI návrh, R11 fotky.

Každá část je samostatný commit na větvi `claude/fitko-projekt-hphs1z`. Na `gh-pages`
(živá appka) se nasazuje až na pokyn.

Pravidlo práce: upravuje se jen kód, který je špatně nebo chybí. Žádné přepisování
celku, žádné nové frameworky.

---

## 4. Rozhodnutí a předpoklady (z odpovědí 13. 9.)

- **Matilda:** žena, 20 let, 165 cm, 53 kg. BMI 19,5 (spodní okraj normy 18,5 až 25).
  Cíl: lehký deficit na **51 kg** (v přepisu „41“, to by bylo BMI 15 — bereme 51),
  tempo −0,25 až −0,4 % váhy týdně, pod BMI 18,5 appka cíl nepustí.
- Trénink 2× týdně (občas 3×), spodek těla a střed, horní část jen minimum na držení
  těla, pokud si to v onboardingu zapne. Vlastní iPhone, stejný token a gist jako Niklas.
- Jídlo: žádné alergie, jedí totéž, Matilda menší porce. Kuchyň: trouba, horkovzdušná
  fritéza, rýžovar, mikrovlnka, mixér, vakuovačka. Větší balení masa se vakuuje a mrazí.
- Recepty: jednoduché, vydrží v lednici do dne, kdy se jedí, nutričně kompletní.
  AI konzultace ano (přes GitHub Action, klíč jako secret). Fotky vygenerovat, když to půjde.
- Akce jen Lidl. Push notifikace i na jejím telefonu.
- Nasazení: jen větev, gh-pages na pokyn.

---

## 5. Stav prací

Aktualizuje se po každém commitu.

- [x] R1 lišta
- [x] R2 zvuk pauzy
- [x] R3 nákupní seznam
- [x] R12 build skript
- [x] R4 výživa
- [x] R5 projekce a texty
- [x] R6 program z profilu + nové cviky
- [ ] R9 barvy
- [ ] R7 dva uživatelé
- [ ] R8 recepty a krabičky
- [ ] R10 AI návrh týdne
- [ ] R11 fotky
