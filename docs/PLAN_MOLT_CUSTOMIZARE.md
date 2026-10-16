# Plan: Molt personalizabil (garderobă, aure, efecte, animal de companie)

Stare: propunere, nimic implementat. Scris pe 2026-10-16.

## 1. Ideea

Molt nu mai doar crește (ou → legendă), ci devine **al tău**: ce poartă arată ce ai făcut cu adevărat.
Fiecare obiect se **câștigă** din ceva real (bifări, Focus, rapoarte de seară, scopuri, experimente, grup, revenirea după o pauză). Nu se cumpără, nu se trage la noroc și nu se pierde.

## 2. Reguli de aur (ca să nu strice jocul)

1. **Doar prin fapte.** Fără bani, fără cutii-surpriză, fără „timp petrecut în aplicație”.
2. **Permanent.** Deblocările se calculează din istoric, pe **nivelul maxim atins**, nu pe cel curent. Un reset de momentum nu ia nimic (aceeași filozofie ca „progresul rămâne” de la ștergerea unui obicei).
3. **Transparent.** Fiecare obiect blocat arată ce lipsește („încă 4 sesiuni Focus”). Excepție: 4–5 obiecte secrete, toate pozitive.
4. **Doar cosmetic.** Nu schimbă momentum, PE sau reguli. Nimeni nu poate „trișa” sistemul prin obiecte.
5. **Fără FOMO.** Nimic care dispare. Sezoanele (Bac, vară, iarnă) pot fi câștigate și anul următor.
6. **Revenirea e sărbătorită.** Cel mai frumos obiect secret (Phoenix) vine după o pauză, nu după o serie perfectă.
7. **Alegere liberă.** Sloturi independente, combini cum vrei.
8. **Text AI = generat sau deloc.** Numele și descrierile obiectelor sunt fixe, din catalog; AI-ul doar comentează (și primește lista reală, ca să nu inventeze obiecte).

## 3. De la ce pornim (din cod)

- Sprite procedural 32×32 în `packages/ui/sprites.js` (folosit și de landing). Pe clasă (sport, studiu, bani, minte, creativ): obiect pe cap de la Ucenic, obiect în mână de la Adept, mantie și medalie la Maestru, halo la Legendă.
- **Două progrese deja derivate din log** (`engine.js`): *Evoluție* (PE, 6 stadii: 0/3/15/45/105/210) și *Momentum* (10 niveluri cu nume de foc: Scânteie … Supernovă). Plus serii (`STREAK_MARKS` 3…365), sesiuni Focus, rapoarte, scopuri cu etape, experimente, școală, grup.
- Sistemul de **momente** (`moments.js`, `MomentModal`) sărbătorește o dată evenimente: loc natural pentru „ai deblocat…”.
- Persistare fără migrare: `profiles.companion` (jsonb, azi doar numele), `profiles.extra`, `group_members.stats` (jsonb public per membru).

## 4. Trei axe de progres, trei feluri de recompense

| Axă | Măsoară | Deblochează |
|---|---|---|
| Evoluție (PE, stadiu) | cât ai bifat în total | **corpul**: pălării, obiect în mână, mantie, culori, companionul |
| Momentum (nivel de vârf) | cât de bine ții ritmul | **aure** (numele nivelurilor sunt deja flăcări, se potrivesc perfect) |
| Fapte (colecții) | ce fel de lucruri faci | obiecte tematice: Focus, școală, scopuri, seară, experimente, grup, revenire |

## 5. Sloturi

Pălărie · Aură · Efect · Obiect în mână · Culoare/mantie · Scenă (fundalul piedestalului) · Companion · Titlu (sub nume, vizibil în grup).

## 6. Catalogul de pornire (~45 obiecte)

Raritatea arată **efortul**, nu norocul: Comun, Rar, Epic, Legendar.

### Aure (nivel de vârf de momentum)
| Nivel | Aură |
|---|---|
| 2 Jar | licurici roșii, puțini |
| 3 Flacără | contur cald, pâlpâitor |
| 4 Torță | flăcărui lângă picioare |
| 5 Foc de tabără | scântei care urcă |
| 6 Far | fascicul de lumină care se rotește |
| 7 Vâlvătaie | aură roșu-aurie care pulsează |
| 8 Cometă | coadă de cometă la sărituri |
| 9 Stea | constelație în jurul lui Molt |
| 10 Supernovă | explozie curcubeu la fiecare bifă |

### Efecte (serii de zile)
3 zile: steluțe · 7: fluturi de lumină · 14: petale · 30: ninsoare mică · 60: fulgere mici · 100: ploaie de stele · 200: aur · 365: ceas de aur care orbitează.

### Pălării
| Obiect | Cum îl câștigi | Raritate |
|---|---|---|
| Semnul clasei (cel de azi) | Ucenic, implicit | Comun |
| Cască de focus | 10 sesiuni Focus | Comun |
| Beretă de absolvent | 10 sesiuni de studiu înregistrate sau primul examen încheiat | Rar |
| Cască de explorator | 3 obiceiuri din 3 categorii, fiecare bifat în 7 zile | Rar |
| Pălărie de cercetător | primul experiment de 2 săptămâni terminat | Rar |
| Coroană de lauri | un obiectiv cu etape, terminat complet | Epic |
| Fes de noapte | 7 rapoarte de seară | Comun |
| Pălărie de vrăjitor | serie de 30 de zile | Epic |
| Coroană | Legendă | Legendar |

### Obiect în mână și „costume de clasă”
Cross-training: după **100 de bifări într-o altă clasă**, Molt poate purta unealta acelei clase (torță, carte, pungă, toiag, lăută) și culoarea ei. Încurajează echilibrul, nu doar specializarea.

### Scene
Noapte înstelată (implicit) · Bibliotecă (150 bifări Studiu) · Sală (150 Sport) · Piață (150 Bani) · Turn (150 Minte) · Atelier (150 Creativ) · Observator (nivel 8) · Vârf de munte (Legendă).

### Titluri
Prima bifă · Zi de zi (serie 7) · Ritualul serii (30 rapoarte) · Cercetător de sine (experiment) · Tăietor de scopuri (scop împărțit în pași) · Colegul grupului (4 săptămâni în grup) · Revenit (secret).

### Secrete (toate pozitive)
Phoenix (revenire după ≥7 zile de pauză, apoi 3 zile active la rând) · Trei zile perfecte · Prima săptămână completă.
Nu recompensăm nopțile târzii și nici ore de somn pierdute.

## 7. Animalul de companie (Legendă și după)

- La Legendă (210 PE) primești un **ou de companion**. Alegi familia după clasă: sport → șoim, studiu → bufniță, bani → pisică norocoasă, minte → libelulă luminoasă, creativ → fluture.
- Oul dă **un nou obiectiv după Legendă**, când progresul principal s-ar fi oprit: eclozează la +50 PE, crește la +120 PE (Mic → Mare), are nume dat de tine (vizibil doar ție).
- Reacții simple: doarme când doarme Molt, sare când Molt e bucuros, stă pe umărul lui în Acasă.
- **Legendă ★1–★5** la fiecare +100 PE: obiectiv fără capăt, stele în cadru, ultima aduce o aură de aur.
- Mai multe animale: al doilea la 400 PE, iar **mascota grupului** (pet comun) când un grup de minim 3 își atinge obiectivul săptămânal 4 săptămâni la rând (recompensă de cooperare, nu de competiție).

## 8. Cum arată în aplicație

```
Molt → Garderobă
┌───────────────────────────────────────────────┐
│  [Molt mare pe piedestal, ținuta live]        │
│  Pixel · Ucenic · „Zi de zi”                  │
├───────────────────────────────────────────────┤
│ Pălărie | Aură | Efect | Mână | Culoare | Scenă | Companion | Titlu │
│ [✓ Semn] [Cască] [🔒 Beretă] [🔒 …]            │
│  blocat = siluetă + „încă 4 sesiuni Focus” ▓▓░ │
└───────────────────────────────────────────────┘
```
- Apăsarea unui obiect deblocat îl îmbracă pe loc (fără buton de salvare). Pe cele blocate, „Probează” arată doar previzualizarea.
- **Acasă:** cardul lui Molt arată ținuta și o linie „Următoarea recompensă: Cască de focus, încă 3 sesiuni” (cea mai apropiată, nu cea mai scumpă).
- **Deblocare:** reutilizează `MomentModal` („Ai deblocat…” cu „Îmbracă acum” / „Mai târziu”), maxim un modal pe zi; restul rămân ca punct pe „Molt” în meniu, ca la Grup.
- **Grup:** clasamentul arată ținuta și titlul (opțiune în Setări: „Arată ținuta în grup”).
- **Chat/AI:** contextul include ținuta și următoarea deblocare; Molt poate comenta (text generat), fără să inventeze obiecte.

## 9. Plan tehnic

**Modul nou `apps/app/src/lib/cosmetics.js`** (funcții pure, ca `engine.js`):
- `CATALOG`: id, slot, raritate, nume, indiciu, regulă.
- `unlockedItems(input)`, `progressToward(item, input)`, `nextReward(input)`, `normalizeLook(look, unlocked)`.
- Teste în `apps/app/tests/cosmetics.test.mjs`: praguri, *peak* vs curent (un reset nu retrage nimic), look invalid curățat.

**Date:**
- `companion.look = { hat, aura, effect, held, dye, scene, pet, title }` în `profiles.companion` (fără migrare; mapare în `remote.js` + test în `remote.test.mjs`).
- Fapte care trăiesc doar în DB (experimente terminate) se scriu ca `extra.earned[id] = zi`, la momentul evenimentului (idempotent). Restul se derivă din state, deci merg offline și în artifact.
- `extra.seenItems` pentru „ce e nou”.
- Grup: `publicStats.look` (doar id-uri, câțiva octeți); la citire, ce nu e în catalog se ignoră. De verificat dacă `group_members.stats` are limită de mărime.

**Sprite (`packages/ui/sprites.js`):**
- `spriteRuns({ ..., look })`, cache cu look în cheie.
- Straturi cu ordine fixă: aură-spate → mantie → corp → culoare (variantă de paletă) → pălărie → mână → medalie → contur → halo/aură-față.
- Tabel de **ancore** per stadiu (capul unui Pui e mai jos decât al unui Ucenic). Oul și puiul primesc doar aură/efect/scenă.
- Rămâne 32×32 (mărimi multiple de 32 ca să fie clare) și compatibil cu landing-ul (`look` opțional).

**Efecte animate:** overlay CSS în `Sprite.jsx` (ca `Twinkles` de azi), oprite sub 64px și în liste, respectă `prefers-reduced-motion` (deja global).

**Animal de companie:** componentă separată `<Pet>` (sprite 16×16 afișat la 2×), lângă Molt, doar la `size ≥ 96`.

**UI:** abilitate nouă „Garderobă” în grupul „Molt” din `screens/Molt.jsx` (apare la fel ca celelalte, cu punct de „nou”).

**Accesibilitate:** etichetă text pentru ținută („Pixel, Ucenic, cu cască de focus”); starea „blocat” nu se bazează doar pe culoare; tile-uri cu focus vizibil.

## 10. Etape

| Fază | Conținut | Estimare |
|---|---|---|
| 0. Fundație | `cosmetics.js` + teste, persistare, straturi în sprites.js, look implicit = ce e azi (zero regresii) | 1,5–2 zile |
| 1. MVP vizibil | 6 pălării + 9 aure + Garderobă + celebrare + teaser pe Acasă + ținută în grup | 3–4 zile |
| 2. Profunzime | efecte de serie, costume de clasă, culori, scene, titluri, secrete, „Probează”, ținute salvate, context AI | 3–4 zile |
| 3. Companion | oul, 5 familii × 3 stadii, nume, reacții, Legendă ★ | 4–5 zile |
| 4. Social și sezoane | mascota grupului, card Molt ca imagine de partajat, sezoane fără FOMO | 3 zile |
| 5. Reglaj | ritm de deblocare din date reale, ordinea recompenselor | continuu |

Total aproximativ 3 săptămâni pentru un dev. Fiecare fază se poate livra singură.

**Ritm țintă** (3 obiceiuri/zi, ~60% bifate, ≈3,6 PE/zi, Legendă în ~2 luni): primul obiect în ziua 1 (oul se deschide), 3 obiecte în prima săptămână, ~8 în prima lună, ~20 la 3 luni, ~35 la 6 luni, 45+ pentru cei care vor tot.

## 11. Riscuri și cum le tratăm

- **Recompensele externe pot scădea motivația proprie.** De aceea: legate de comportamentul în sine (nu de timp în aplicație), nu la fiecare bifă, accent pe identitate („Cercetător de sine”), fără clasamente de ținute.
- **Comparații în grup.** Ținuta în grup se poate opri din Setări; mascota grupului e cooperare, nu competiție.
- **Minori.** Zero plăți. Numele companionului e vizibil doar proprietarului (nu e conținut moderat de cineva). Alte conținuturi vizibile în grup vin doar din catalog.
- **Efort de artă pixel.** Ținutele rămân procedurale (formule, ca azi); doar cele 5 familii de companioni cer desen manual, în matrici mici (16×16).
- **Complexitate de sprite** (ancore, suprapuneri). Pagina de galerie doar pentru dezvoltare, cu toate combinațiile, ca test vizual.

## 12. Decizii luate (2026-10-16)

1. **Ținuta în grup:** vizibilă implicit, cu opțiune de oprire în Setări („Arată ținuta în grup”).
2. **Companion:** unul singur activ pe ecran; colecția crește cu al doilea animal și mascota grupului, le alegi din Garderobă.
3. **Ordine:** după fundație, începem cu MVP-ul „pălării + aure” (faza 1).
4. **Stil:** rămânem pe pixel art procedural 32×32; doar cele 5 familii de companioni se desenează manual (16×16).
5. **Nume abilitate:** „Garderobă”.
6. **Sezoane:** rămân pentru faza 4, fără FOMO; nu blochează nimic înainte.
