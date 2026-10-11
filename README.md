# Molted · self-improvement RPG

Aplicație de obiceiuri gamificată: îți crești **momentum-ul** bifând obiceiuri, iar un **personaj** ieșit dintr-un ou evoluează odată cu tine. Interfața e un joc RPG întunecat, cu bare de XP, insigne de nivel, serii și clasament.

## Ce face

| Din plan | Cum e implementat |
| --- | --- |
| Obiceiuri personalizate + predefinite | Catalog cu 25 de obiceiuri pe 5 drumuri (Sport, Studiu, Bani, Minte, Creativitate) și editor de obiceiuri proprii: iconiță, dificultate, zile, oră, țintă. Maxim 8 active. |
| Momentum + niveluri, reset după inactivitate | Puncte de momentum din bife, to-do-uri și raportul de seară, cu bonus pentru zile la rând (până la +40%). 10 niveluri (Scânteie → Supernovă). O zi ratată scade puțin; după 3 zile la rând fără activitate (configurabil 2–5), momentum-ul revine la zero. |
| Streak-uri cu 2 revive-uri/lună | Seria numără zilele cu cel puțin o bifă. A doua zi după o zi ratată poți folosi un revive (2 pe lună). |
| Personaj care evoluează | La onboarding primești un ou; drumul ales decide clasa: Atlet, Cărturar, Negustor, Înțelept sau Bard. Evoluează din bifări (1, 2 sau 3 puncte de evoluție, după dificultatea obiceiului): Ou → Pui → Ucenic → Adept → Maestru → Legendă, cu echipament nou la fiecare stadiu (pixel art generat procedural). |
| Povestea personajului | La eclozare și la fiecare evoluție apare un capitol nou, scris de AI sau dintr-un șablon. |
| Nu moare: doarme și se bucură | Doarme cât lipsești (fără activitate azi și ieri) și sare de bucurie în ziua în care revii. |
| Grupuri / partener de progres | Grupuri cu cod de invitație, clasament săptămânal (și după momentum sau serie), remindere către o persoană, mai multe sau tot grupul. Un grup demonstrativ apare până îți faci unul. |
| Raport zilnic la ora aleasă | La ora ritualului de seară, AI-ul rezumă ziua și dă un scor; scorul zilei = 60% activitate bifată + 40% evaluarea AI, iar jumătate din el devine momentum. |
| Grafice | Momentum general cu praguri de nivel și resetări marcate, momentum pe fiecare obicei, scorurile zilelor, heatmap de activitate pe 26 de săptămâni. |
| To-do + calendar | Listă de to-do-uri (+5 momentum fiecare) și calendar pe săptămână (cu ore, drag-and-drop) sau pe lună; obiceiurile cu oră apar automat. |
| Citate la momente-cheie | Resetare, scădere de momentum, revenire, eclozare, evoluție, nivel nou, serii de 3/7/14/30… zile. Citate cu sursă, alese după moment și drum, plus o propoziție de context scrisă de AI. |

## Rulare

```bash
npm install
npm run dev              # aplicația în browser, cu date salvate local
npm test                 # testele motorului de joc
npm run build            # build static al aplicației (Vite) în apps/app/dist/
npm run build:web        # build static al landing-ului în apps/web/dist/
npm run build:artifact   # o singură pagină HTML pentru claude.ai, în apps/app/dist/momentum.html
```

În afara claude.ai aplicația merge complet, dar cu înlocuitori: datele stau în `localStorage`, rapoartele și poveștile vin din șabloane, iar grupul e doar cel demonstrativ.

## Cum funcționează în claude.ai

Versiunea publicată folosește capabilitățile paginilor Claude:

- **db**: datele fiecărei persoane stau privat în `data/users/<id>/state` (obiceiuri, istoric, setări) și `data/users/<id>/m-AAAA-LL` (capitole din poveste, texte de raport). Grupurile sunt documente comune: `groups/<id>`, `groups/<id>/members/<uid>` (doar statistici publice) și `groups/<id>/nudges/<id>`.
- **sample**: AI-ul (Claude) rulează pe contul celui care folosește pagina, după ce își dă acordul. Folosește modelul rapid pentru rapoarte și povești.
- **user**: numele membrilor din grup.

Ca să folosească grupurile, prietenii trebuie să poată deschide și edita aplicația (partajare din meniul Share).

**Datele din prima versiune** (`data/users/<id>/momentum`) nu se șterg. La primul onboarding în versiunea nouă, obiectivul și obiceiurile vechi sunt precompletate, iar to-do-urile se importă (opțiune activă implicit). Istoricul vechi de bife nu se mută, fiindcă era în mare parte date demonstrative.

## Structură

```
apps/app/src/lib/engine.js    regulile jocului (momentum, niveluri, reset, serii, revive-uri, evoluție, stări)
packages/ui/sprites.js        pixel art procedural pentru personaj (folosit de aplicație și de landing)
apps/app/src/lib/ai.js        prompturi pentru poveste, raport și momente + variante scrise
apps/app/src/lib/store.js     salvare în baza de date a aplicației sau local
apps/app/src/lib/groups.js    grupuri, clasament, remindere, grup demonstrativ
apps/app/src/lib/quotes.js    citate pentru momentele-cheie
apps/app/src/lib/moments.js   detectarea momentelor-cheie
apps/app/src/lib/demo.js      3 săptămâni de date demonstrative
apps/app/src/lib/legacy.js    import din prima versiune a aplicației
apps/app/src/screens/         Onboarding, Acasă, Obiceiuri, Personaj, Grup, Planificator, Statistici, Setări
apps/app/src/components/      interfață comună, grafice, ferestre pentru momente, obiceiuri, to-do
scripts/build-artifact.mjs   construiește pagina pentru claude.ai
tests/engine.test.mjs        teste pentru regulile jocului
```

## Limitări cunoscute

- Notificările (raportul de seară, reminderele) apar în aplicație când o deschizi; nu există notificări push.
