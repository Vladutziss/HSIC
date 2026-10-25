# Master prompt: cleanup frontend app.molted.eu

Folosește textul de la „PROMPT" în jos într-o sesiune nouă de Claude Code, în repo-ul HSIC. Secțiunea „Audit" e baza pe care a fost scris; promptul o include, ca să nu fie re-derivată.

---

## Audit (făcut pe codul din `apps/app/src`, nu pe aplicația randată)

Limită: notele vin din structura codului (număr de panouri, butoane, tonuri, componente). Nu am rulat aplicația și nu am auditat accesibilitatea. Prima fază a promptului cere verificarea vizuală.

| Zonă | Notă | Constatare |
|---|---|---|
| Tokenuri de design (`packages/ui`, Tailwind pe variabile CSS) | 8/10 | Arhitectura e corectă: o singură sursă, tonuri prin `rgb(var(--c-x) / alpha)`. De păstrat. |
| Primitive (`components/ui.jsx`: Panel, Button, Tabs, Modal, Chip, Stat...) | 6/10 | Există și sunt folosite, dar `Panel` are `tone` și `corners` decorative, iar 114 locuri pasează `tone="..."` manual. |
| Arhitectura informației | 3/10 | 7 intrări în meniu, dar comentariul din cod spune „șase locuri". Planificarea apare în două locuri (Plan și 4 abilități din Molt). Personajul apare în trei (Dashboard, Companion, Molt > Evoluție). |
| Dashboard (`screens/Dashboard.jsx`) | 3/10 | Hero cu 4 mini-statistici, badge de nivel, bară, buton Focus; apoi Revive, avertisment de resetare, Rescue, Obiective, Misiuni (cu opționale și cufăr), Companion, Raport, Grup. Aproximativ 10 blocuri; răspunde la „ce fac acum?" abia după trei ecrane de scroll pe mobil. |
| Bara de sus (`Shell.jsx` Hud) | 4/10 | Serie, revive-uri, inel de misiuni, ora raportului, indicator de salvare, notificări, Focus. Repetă ce arată și Dashboard-ul (serie, revive, momentum apar de 2-3 ori). |
| Molt (`screens/Molt.jsx`) | 6/10 | Ideea e bună (un loc pentru AI). Execuția e încărcată: 10 abilități în 4 grupuri. Plan zi, plan săptămână, teme și scop-în-pași sunt același gest de planificare. Reflecție și Tipare sunt același gest de înțelegere. |
| Obiective (`Objectives.jsx`, 949 linii, 15 panouri, 22 butoane) | 3/10 | Cel mai încărcat ecran din aplicație. |
| Planner (888 linii) | 4/10 | Se suprapune cu Molt > Planifică. |
| Statistici (8 panouri, 7 titluri) | 4/10 | Momentum general, pe obiceiuri, scorul zilei, activitate, niveluri, momente-cheie, coach. Un singur răspuns util („merg bine?") îngropat în șapte. |
| Setări | 5/10 | „Regulile jocului", „Aspect", „Limbă", „Raport de seară" sunt toate panouri de același rang. |
| Teme | 3/10 | 9 teme (5 dark, 4 light). Fiecare cere verificare de contrast și fiecare nouă componentă trebuie testată de 9 ori. Valoare mică pentru un produs de elevi. |
| Coerență vizuală | 4/10 | Fiecare titlu de secțiune are altă culoare de icon (gold, violet, mint, ember, sky, rose). Efect de curcubeu: culoarea nu mai spune nimic. |

Cauza de fond: fiecare funcție adăugată a primit propriul panou, propriul titlu colorat și propriul loc, fără o regulă de „ce merită ecran". Cleanup-ul nu e o rescriere de CSS, e o decizie de produs aplicată în cod.

## Direcția de design recomandată

Nu un design system din afară (Material, shadcn ca tematică, Polaris). Aplicația are deja tokenuri bune; problema e disciplina de folosire. Direcția:

- Produs calm, joc doar la Molt. Referințe de ton: Things 3 și Linear pentru densitate și ierarhie, Duolingo doar pentru personaj și recompense. Joaca se concentrează în Molt și în momentul bifării, nu în fiecare panou.
- Culoarea are roluri fixe: gold = acțiunea principală; violet = Molt și tot ce e AI; mint/rose/ember = stare (reușit, eșuat, avertisment); restul neutru. Fără culori decorative la titluri.
- Suprafețe: fundal, o singură suprafață de card, un singur „inset" pentru câmpuri. Fără colțuri decorative, fără ecran înstelat în mod implicit.
- Tipografie: Nunito rămâne (e deja în aplicație, încărcat propriu). Scală de 5 trepte (titlu pagină, titlu secțiune, corp, secundar, etichetă). Clasa `font-pixel` e o denumire greșită pentru Nunito 800; redenumește în `font-display`.
- Spațiere pe grilă de 4/8, două valori de rază, o singură umbră.
- Teme: Noapte (implicit, dark) și Lumină (light). Restul se elimină. Dacă vrei să păstrezi una în plus, Grafit.

---

# PROMPT

Ești arhitect și implementator de frontend pe proiectul Molted (monorepo, `apps/app`, React + Vite + Tailwind peste tokenurile din `packages/ui`). Obiectiv: curăță tot frontendul aplicației app.molted.eu astfel încât să fie intuitiv și minimalist. Moltul și AI-ul integrat rămân funcții de bază, dar încadrate mai simplu. Răspunde și lucrează în română; comentariile din cod urmează stilul existent.

## Principiu călăuzitor

Fiecare ecran are un singur răspuns principal la „ce fac acum?" și cel mult trei zone secundare. Dacă un element nu ajută direct răspunsul principal, se mută mai adânc (un nivel de navigare, un `details`, un modal) sau se elimină. Un număr, o stare sau o acțiune apare într-un singur loc din aplicație.

## Reguli de neatins

1. Nu elimini și nu schimbi comportamentul: Molt (chat, evoluție, garderobă, memorie), funcțiile AI, motorul de reguli (`lib/engine.js`), modelul de date, sincronizarea Supabase, autentificarea, Focus, grupurile ca funcție. Simplifici prezentarea și navigarea, nu logica.
2. Orice text vizibil rămâne `tr("text românesc")` cu intrare în `src/i18n/en.js`. `tests/i18n.test.mjs` trebuie să treacă (chei rămase fără folosire cad testul: când scoți un text, scoți și cheia).
3. Cod nou care atinge Supabase merge în spatele `getClient()`. Build-ul artifact (`__SUPABASE__=false`) trebuie să rămână funcțional.
4. Nu salvezi nimic nou pe dispozitiv fără trecere în politica de cookie-uri (`docs/LOCALIZATION.md`).
5. Nu compari șiruri traduse în cod.
6. Mobilul (360 px) este ecranul principal de proiectare; desktopul extinde, nu reface.
7. Contrast WCAG AA, țintă tactilă minimă 44 px, focus vizibil, `prefers-reduced-motion` respectat.

## Faza 0: verificare înainte de orice modificare

1. Rulează aplicația (`npm run dev` în `apps/app`) și fă capturi cu Playwright la 360, 768 și 1280 px pentru fiecare ecran și stare relevantă (cont nou fără date, cont cu date, serie întreruptă, revive disponibil, ziua fără misiuni).
2. Pentru fiecare ecran notează: numărul de panouri, numărul de acțiuni vizibile, ce se repetă pe alt ecran, câți pixeli de scroll pe mobil până la prima acțiune utilă.
3. Confirmă sau corectează auditul de mai sus (secțiunea „Audit" din `docs/FRONTEND_CLEANUP_PROMPT.md`). Dacă o concluzie nu se verifică vizual, spune-o.
4. Rulează `npm test` și `npm run build:artifact` ca bază de referință; notează ce pică deja.
5. Livrează un document scurt `docs/FRONTEND_AUDIT.md` cu capturile „înainte", notele, și lista propusă de eliminări/mutări. Oprește-te și cere aprobare înainte de Faza 2.

## Faza 1: arhitectura informației (decizii, fără cod)

Propune și argumentează, pornind de la această ipoteză de lucru, pe care o poți contrazice cu motive:

- Navigare principală de maximum 5 intrări: Azi, Plan, Molt, Progres, Tu (Grup și Setări intră sub „Tu" sau Progres, după cum arată datele de utilizare). Mobil: bară jos; desktop: aceeași structură în bară laterală îngustă.
- Azi: lista misiunilor de azi ca element dominant, un indicator compact de progres (serie și momentum într-o singură linie), un punct de intrare către Molt (o frază + „Întreabă"), un buton Focus. Revive, resetare și rescue devin un singur banner contextual, afișat doar când contează, cu o singură prioritate odată. Raportul de seară devine o acțiune în același banner/zonă, nu un card permanent.
- Bara de sus: titlul ecranului, notificări, salvare (doar la eroare). Seria, revive-urile și inelul de misiuni ies din bară (apar în Azi).
- Plan: o singură suprafață pentru planificare (zi, săptămână, teme, obiective ca vizualizări/filtre ale aceleiași liste). Abilitățile de planificare din Molt devin acțiuni în Plan care apelează AI-ul, nu 4 ecrane separate.
- Molt: chat-ul este ecranul principal. Abilitățile devin sugestii/acțiuni rapide în chat („Planifică-mi ziua", „Reflecție", „Tipare"), nu o listă de 10 file. Garderoba, „Ce știe Molt", „Ce a făcut Molt" și Evoluția stau sub un singur meniu „Despre Molt". Elimină duplicarea Companion ↔ Molt > Evoluție.
- Progres (fostul Statistici): un rezumat (momentum, serie, săptămâna asta) și un singur grafic principal; restul (pe obiceiuri, calendar de activitate, niveluri, momente-cheie) în file sau detalii. Cardul „Cum te ajută coach-ul" intră la Molt.
- Setări: grupe clare (Cont, Aspect și limbă, Notificări, Date). „Regulile jocului" devin pagină de informare, nu panou de setări.

Pentru fiecare ecran livrează: ce rămâne, ce se mută (unde), ce se elimină, de ce. Orice funcție pe care o consideri de eliminat complet, nu doar de mutat, o listezi separat pentru decizia mea.

## Faza 2: fundația design system

1. Păstrează arhitectura de tokenuri (`packages/ui/base.css`, `tailwind-preset.js`). Reduci, nu reconstruiești.
2. Teme: rămân Noapte (implicit) și Lumină. Elimină blocurile `[data-theme]` ale celorlalte, intrările din `lib/themes.js` și selectorul din Setări. Un cont care avea o temă eliminată cade pe cea mai apropiată ca mod (dark/light), fără eroare.
3. Tipografie: scala de 5 trepte ca utilități sau clase; elimină dimensiunile arbitrare `text-[10px]`, `text-[11px]` etc. Redenumește `font-pixel` în `font-display` (înlocuire peste tot).
4. Culoare: introdu rolurile (primary, ai, success, warning, danger, neutral). `Panel`, `Chip`, `SectionTitle`, `Button` primesc `tone` doar din aceste roluri. Elimină `tone` decorativ pe `SectionTitle`: titlurile devin neutre cu icon neutru.
5. `Panel`: elimină `corners`. O singură variantă standard plus „highlight" pentru elementul principal al ecranului (cel mult unul pe ecran).
6. Fundal: fără stele în mod implicit; pe light, fundal plat.
7. Primitive de adăugat sau consolidat în `components/ui.jsx`: `PageHeader` (titlu + acțiune principală), `Section` (titlu neutru + conținut), `Row` (listă cu acțiune), `Banner` (un singur tip pentru Revive/Rescue/Reset/Info), `EmptyState` cu o singură acțiune. Documentează-le într-un fișier scurt `docs/DESIGN_SYSTEM.md` (tokenuri, roluri, componente, reguli de folosire, ce NU se face).
8. Teste: dacă există teste care depind de teme sau clase șterse, actualizează-le; adaugă un test care eșuează dacă apar `tone=` în afara rolurilor permise.

## Faza 3: reconstruirea ecranelor, în ordinea impactului

Ordine: Azi, Molt, Plan (incluzând Objectives și Planner), Progres, Tu/Setări, Grup, Onboarding, Focus, Auth. Pentru fiecare ecran:

- Respectă decizia din Faza 1; pornește de la ce trebuie să realizeze utilizatorul, nu de la ce există.
- Redu fișierele mari: `Objectives.jsx` (949), `Planner.jsx` (888), `App.jsx` (887) se sparg în module pe responsabilitate, fără schimbare de comportament, cu teste verzi la fiecare pas.
- Limită dură: maximum 1 panou evidențiat și 3 secțiuni vizibile simultan pe ecran; restul în file, `details` sau modale. O singură acțiune principală vizibilă (buton plin) pe ecran.
- Stări goale utile: un mesaj, o acțiune.
- Cuvinte: texte scurte, un verb pe buton, fără explicații de mecanică de joc în ecranele de lucru (acelea merg în pagina de informare).

Un commit per ecran, cu mesaj care spune ce s-a eliminat și ce s-a mutat.

## Faza 4: verificare

1. `npm test`, `npm run build`, `npm run build:artifact` fără erori; commit-uiește `artifact/momentum.html` regenerat.
2. Capturi „după" la 360/768/1280 px, comparate cu cele „înainte"; tabel înainte/după: panouri per ecran, acțiuni vizibile, scroll până la prima acțiune utilă.
3. Trece prin fiecare flux critic cu Playwright: cont nou și onboarding, bifarea unei misiuni, conversație cu Molt și aplicarea unui plan propus, crearea unui obiectiv, folosirea unui revive, schimbarea limbii RO/EN.
4. Verificare de accesibilitate: contrast, navigare cu tastatura, ținte tactile, `prefers-reduced-motion`.
5. Raport final scurt: ce s-a eliminat, ce s-a mutat, ce riscuri rămân, ce NU s-a putut verifica.

## Mod de lucru

- Lucrează în pași mici, pe branch separat; nu face push pe `main`; nu deschide PR fără cerere.
- La Faza 1 și la orice funcție propusă spre eliminare completă, oprește-te și întreabă.
- Dacă o regulă de mai sus intră în conflict cu o decizie bună de design, spune conflictul și propune alternativa; nu o ocoli în tăcere.
- Nu inventa date de utilizare. Dacă analytics (`lib/analytics.js`) poate arăta ce ecrane și funcții se folosesc efectiv, cere-mi accesul sau cifrele, pentru că deciziile de eliminare sunt mai bune cu ele.
