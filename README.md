# Molted

Coach AI pentru elevi. Molted transformă un obiectiv într-un plan de pași mici, îl adaptează după ce face elevul în realitate și măsoară ce a funcționat.

Aplicația: [app.molted.eu](https://app.molted.eu) · Site: [molted.eu](https://molted.eu)

Proiect înscris la High School Innovation Challenge 2026 (tema: educația; direcții din /teme: E3 „Smart Homework Planner" și F2 „AI Challenge & Gamification Platform"). Criteriile de jurizare, livrabilele semifinalei și planul de lucru: [`docs/HSIC_SEMIFINALE.md`](docs/HSIC_SEMIFINALE.md).

## Problema

Elevii își fac planuri de studiu și le abandonează în câteva zile. Cercetarea despre formarea obiceiurilor arată de ce:

- Timpul în care un obicei devine automat variază foarte mult de la un om la altul: între 18 și 254 de zile într-un studiu (Lally et al., 2010) și între 4 și 335 de zile într-o meta-analiză din 2024 (Singh et al.). Cifra de 21 de zile nu are suport în aceste surse.
- Un plan de tip "dacă se întâmplă X, fac Y" ajută semnificativ la atingerea obiectivelor: efecte între d = 0,27 și d = 0,66 într-o meta-analiză a 642 de teste (Sheeran, Listrom & Gollwitzer, 2025).
- Aplicațiile de obiceiuri și de planificare obișnuite înregistrează ce a bifat utilizatorul. Rareori îl ajută să afle dacă o schimbare în rutină a funcționat.

Context: la prima sesiune a Bacalaureatului din 2026, 29.084 de candidați au fost declarați respinși, iar rata de promovare a fost de 76,9% ([Profit.ro](https://profit.ro/stiri/social/rezultatele-finale-la-bac-2026-rata-de-promovare-a-crescut-dupa-contestatii-cati-elevi-au-obtinut-media-10-22514382)).

## Soluția

Un agent AI care folosește unelte, nu un chatbot generic. Bucla lui are patru pași:

1. **Observă.** Citește statisticile obiceiurilor, contextul, feedbackul, acțiunile trecute și experimentele, apoi caută tipare.
2. **Documentează.** Caută în baza de cunoștințe din `knowledge/` și poate cita doar surse pe care le-a găsit în conversația respectivă.
3. **Propune.** Sugerează o acțiune concretă (un to-do, un obicei nou sau o mutare în program), cu motivul, datele folosite, încrederea și efectul așteptat.
4. **Măsoară.** După 14 zile compară rata de bifare dinainte cu cea de după. Arată diferența și nu pretinde că agentul a cauzat-o.

Elevul rămâne cel care decide:

- schimbările de program sau de obiceiuri cer confirmare;
- pașii mici și reversibili (un to-do) se aplică singuri, cu buton de anulare;
- fiecare acțiune are istoric: ce s-a făcut, de ce și pe ce date;
- textul generat de AI este scris de AI sau lipsește, fără variante scrise de mână.

## Ce poate face un elev

| Funcție | Cum funcționează |
| --- | --- |
| Planificator de teme | Elevul scrie în română ce are de făcut. AI-ul extrage materia, termenul și minutele estimate, iar elevul confirmă fiecare temă. |
| Planul zilei | Pornește de la timpul disponibil, energie, obiceiuri, to-do-uri, scopuri și teme. Propune până la trei pași, fiecare cu motiv, date folosite, încredere și efect așteptat. Pașii se confirmă, se aplică și se pot anula prin jurnalul de acțiuni. |
| Descompunerea scopurilor | Un scop vag devine până la trei scopuri pe săptămână sau pe lună, salvate după confirmare. |
| Obiective | Obiective pe termen lung, cu pași și sub-pași, obiceiuri legate, termen, o valoare de urmărit și remindere. |
| Chat cu Molt | Conversație cu personajul; poate propune un plan, care trece prin același jurnal de acțiuni. |
| Agent de salvare | După o pauză sau la risc de resetare, propune un singur pas mic de revenire. |
| Reflecție săptămânală | Elevul scrie ce l-a ajutat și ce l-a blocat. AI-ul răspunde cu o observație și un pas următor, iar răspunsurile se păstrează în istoric. |
| Sesiuni Focus | Sesiuni de concentrare, cu statistici. |
| Obiceiuri și joc | 25 de obiceiuri pe 5 drumuri (Sport, Studiu, Bani, Minte, Creativitate), momentum, serii cu 2 revive-uri pe lună și un personaj care evoluează. |
| Grupuri | Cod de invitație, clasament săptămânal și remindere între colegi. |
| Raport de seară | AI-ul rezumă ziua și dă un scor. Scorul zilei este 60% activitate bifată și 40% evaluarea AI. |
| Rulare săptămânală | Opțional, duminică la 18:00 UTC, agentul pregătește un pas mic pentru luni. Se oprește din Setări. |
| Notificări push | Raportul de seară și remindere între colegi, alese din Setări pentru tot contul. |

## Baza de cunoștințe

Agentul citează numai din sursele din `knowledge/`, scrise din rezumatele articolelor. Fiecare fișier spune și ce arată sursa, și ce nu arată.

| Sursă | Tip |
| --- | --- |
| Sheeran, Listrom & Gollwitzer (2025), planuri if-then, 642 de teste | meta-analiză mare |
| Buyalskaya et al. (2023), formarea obiceiului de sală și de spălat pe mâini, date obiective | analiză cu date mari |
| Singh et al. (2024), timpul de formare a unui obicei | meta-analiză |
| Ma et al. (2023), intervenții pentru formarea obiceiurilor | meta-analiză mică |
| Lally et al. (2010), cum se formează obiceiurile | studiu |
| Dai, Milkman & Riis (2014), efectul de început proaspăt | studii de arhivă |
| Silverman & Barasch (2023), serii întrerupte | experimente |
| Biskas, Sirois & Webb (2023), autocompătimire după un eșec | studiu randomizat |
| Wood & Neal (2007) și Gollwitzer (1999) | teorie |
| Fogg (2009), modelul comportamentului | teorie |

Fișierele se transformă în `supabase/seed/knowledge.sql` cu `node scripts/build-knowledge.mjs`. Căutarea folosește pgvector.

## Cum e construit

- **Aplicația** (`apps/app`): React și Vite, aceeași sursă pentru versiunea web și pentru pagina publicată în claude.ai.
- **Landing** (`apps/web`): pagini statice în română și engleză, generate la build.
- **Backend**: Supabase (Postgres cu RLS pe toate tabelele, pgvector, Edge Functions `ai`, `agent`, `weekly`, `push`, `stats`, `campaigns`, `email`).
- **Autentificare**: Clerk.
- **Model AI**: prin OpenRouter, din Edge Functions. Cheile se țin doar ca secrete Supabase.
- **Emailuri**: Resend (retenție și reactivare, oprite implicit).
- **Găzduire**: Vercel.
- **Limbi**: română și engleză, cu verificare automată a traducerilor.
- **Teste**: peste 300 de teste automate (252 în aplicație, 53 în landing) pentru regulile jocului, agent, traduceri, giveaway-uri și textele legale.

## Rulare locală

```bash
npm install
npm run dev              # aplicația în browser, cu date salvate local
npm test                 # testele aplicației (reguli de joc, agent) și ale landing-ului
npm run build            # build static al aplicației în apps/app/dist/
npm run build:web        # build static al landing-ului în apps/web/dist/
npm run build:artifact   # o singură pagină HTML pentru claude.ai
npm run sync:functions   # copiază bibliotecile comune în supabase/functions/_shared/app
npm run build:emails     # regenerează șabloanele de email
```

Fără Supabase, aplicația merge cu datele în `localStorage`. Funcțiile care cer AI din server (agentul, rapoartele, poveștile) rămân indisponibile în acest mod.

## Structură

```
apps/app/src/lib/engine.js         regulile jocului (momentum, niveluri, serii, evoluție)
apps/app/src/lib/ai.js             prompturile pentru poveste, raport, plan zilnic și reflecție
apps/app/src/lib/agentActions.js   acțiunile propuse de agent și jurnalul lor
apps/app/src/lib/outcomes.js       măsurarea efectului după 14 zile
apps/app/src/lib/rescue.js         agentul de salvare după pauze
apps/app/src/lib/schoolPlanner.js  teme, materii și termene
packages/ui/                       tokenuri de design și pixel art comun
supabase/functions/                ai, agent, weekly, push, stats, campaigns, email
supabase/migrations/               schema bazei de date, cu RLS în aceeași migrare
knowledge/                         sursele științifice citate de agent
docs/                              emailuri, localizare, giveaway-uri, admin, planuri
```

## Documentație suplimentară

- `AI_IMPLEMENTATION_NOTES.md`: note despre funcțiile AI și ordinea lucrărilor (datate 2026-10-12, parțial depășite)
- `docs/ADMIN_AND_ARTIFACT.md`: panoul de administrare și versiunea din claude.ai
- `docs/EMAILS.md`: emailurile de retenție și reactivare
- `docs/LOCALIZATION.md`: limbile, regulile de traducere și textele legale
- `docs/GIVEAWAYS.md`: sistemul de giveaway-uri

## Echipa

Echipa Molted este prezentată pe [molted.eu](https://molted.eu), în secțiunea Echipa.
