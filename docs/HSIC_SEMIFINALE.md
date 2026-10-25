# HSIC 2026: jurizare, semifinală și plan de lucru

Întocmit la 25 octombrie 2026, din paginile oficiale [liceeni.rau.ro](https://liceeni.rau.ro) (principală, /ghid-participare, /structura-programului, /semifinale, /teme, /comunitate, /termeni-si-conditii). Regulamentul oficial se trimite separat echipelor înscrise și nu l-am văzut; dacă îl aveți, verificați tot ce e mai jos față de el.

Nimeni nu poate garanta punctajul maxim. Jurizarea e subiectivă, iar o parte din punctaj (validarea cu clienți, echipa, prezentarea) depinde de lucruri pe care codul nu le poate produce. Documentul spune ce acoperă produsul, ce lipsește și cine trebuie să facă ce.

## 1. Faptele care contează

**Calendar (de pe site):**

| Dată | Ce se întâmplă |
|---|---|
| 29 oct (joi) | Ultima sesiune înainte de semifinală |
| 30–31 oct | Se finalizează prezentarea și videoclipul |
| **1 nov 08:00 – 2 nov 24:00** | **Fereastra de încărcare** (formularul nu era activ când am citit pagina) |
| 3–8 nov | Evaluarea juriului |
| 9 nov, până la 12:00 | Rezultate: **25 de echipe** intră în finală |
| 1–4 dec | Săptămâna finaliștilor: mentorat și pitch coaching 1:1 |
| 5 dec | Finala, **prezență fizică obligatorie** la URA, București |

**Livrabile semifinală (ambele obligatorii, altfel proiectul poate fi declarat neeligibil):**
- Prezentare PPT/PPTX sau PDF, **maximum 25 de slide-uri**.
- Videoclip MP4, **maximum 5 minute, care prezintă MVP-ul**.

**Juriu:** doi evaluatori pe proiect, aceeași grilă, scorul final e media aritmetică. Maximum 100 de puncte. Tipurile acceptate de proiect: produs fizic, serviciu, aplicație, platformă sau organizație socială. Folosirea AI e opțională, dar se punctează la „Idee și inovație".

**Atenție:** semifinala NU evaluează costuri, KPI, strategie de business sau conținutul săptămânilor 5–8. Nu pierdeți slide-uri pe ele.

## 2. Grila semifinalei (100 + 5 bonus) și unde stă Molted

| Criteriu | Punctaj | Sub-criterii | Ce are deja Molted (în repo) | Ce lipsește / de făcut |
|---|---|---|---|---|
| **Problemă și analiză de piață** | 20 | Problema 0–8 · Piață și concurenți 0–7 · Oportunitate 0–5 | Problema documentată în README cu surse (Lally 2010, Singh 2024, Sheeran 2025), context BAC 2026 (29.084 respinși, 76,9% promovare, sursa Profit.ro) | **Analiza de concurenți nu există în repo.** Secțiunea 5 are un început verificat; trebuie completată. Cifrele despre elevi români (câți abandonează planuri) lipsesc: dacă nu aveți sondaj propriu, nu inventați. |
| **Client** | 20 | Client țintă 0–8 · Nevoi 0–7 · **Validare 0–5** | Clientul e definit (elev de liceu). Funcții construite din nevoi (planificator de teme, Focus, rescue). | **Cel mai slab punct.** Nu există nicio dovadă de validare cu elevi reali în repo. Trebuie interviuri și un sondaj scurt, reale (kit în secțiunea 6). Fără ele, 5–10 puncte din 20 sunt la risc. |
| **Idee și inovație** | 20 | Originalitate 0–8 · Diferențiere 0–7 · **Utilizare AI 0–5** | Agent AI cu unelte (nu chatbot), propunerile cer confirmare, măsoară efectul înainte/după 14 zile, citează doar surse găsite, explicabilitate (`dataUsed`, `confidence`, `expectedEffect`), baza de cunoștințe cu limite. | Diferențierea trebuie argumentată față de concurenți reali (secțiunea 5). Nu spuneți „unic" fără dovadă; spuneți „combinația" (vezi secțiunea 5). |
| **MVP** | 20 | Ce face 0–8 · Legătura cu problema 0–7 · Realism 0–5 | Aplicație funcțională la app.molted.eu, cont, sincronizare, AI, grupuri. **Nou:** card Școală pe Acasă (teme, examene, sesiuni de studiu, fără AI) și „Timp de studiu" în Progres. | Legătura cu problema trebuie vizibilă în 5 minute de video: elev cu temă, examen, plan, studiu, măsurare. Vezi scenariul din secțiunea 4. |
| **Prezentare și video** | 15 | Prezentare 0–6 · Video 0–5 · Echipă 0–4 | Pagina Echipa pe molted.eu. | Deck de maximum 25 de slide-uri și videoclip MP4 de maximum 5 minute: **nu le pot produce eu din repo.** Structura e în secțiunile 3–4. |
| **Pașii următori (bonus)** | 5 | Direcția de dezvoltare 0–3 · **Impact asupra educației 0–2** | Rulare săptămânală automată a agentului, „Molted în cifre" pe landing. | Un slide cu direcția clară (de exemplu pilot într-o școală) și cu impactul măsurat. Impactul se poate susține doar cu date reale de utilizare. |

**Departajare dacă scorurile sunt egale:** 1) Idee și inovație, 2) Problemă și analiză de piață, 3) MVP, 4) deliberarea juriului. Deci inovația și analiza contează de două ori.

## 3. Cele 25 de slide-uri (propunere, cu punctele vizate)

Fără costuri, KPI sau strategie de business. Un mesaj pe slide.

1. **Titlu:** Molted, coach AI pentru elevi. Echipa, liceul, direcția aleasă din /teme (recomand E3 „Smart Homework Planner" ca direcție principală și F2 „AI Challenge & Gamification Platform" ca secundară; ambele există pe site).
2. Problema în o propoziție (elevii abandonează planurile de studiu).
3–5. **Problema cu dovezi** (8 p): cercetare (Lally, Singh, Sheeran din README), BAC 2026, citatele din interviurile voastre.
6–7. **Piață și concurenți** (7 p): tabelul din secțiunea 5, cu ce nu rezolvă fiecare.
8. **Oportunitatea** (5 p): de ce acum (AI agentic, Gen Z, examene naționale).
9–10. **Clientul țintă** (8 p): profil, empathy map din săptămâna 3.
11. **Nevoile** (7 p): ce au spus elevii, în cuvintele lor.
12. **Validarea** (5 p): câte interviuri, câte răspunsuri la sondaj, ce s-a schimbat în produs după ele. Numai cifre reale.
13. **Ideea** într-un slide: obiectiv → plan → acțiune → feedback → adaptare → progres măsurat (formularea din `AI_IMPLEMENTATION_NOTES.md`).
14. **Originalitate** (8 p): agentul măsoară dacă schimbarea a ajutat, nu doar notează bifele.
15. **Diferențiere** (7 p): tabelul comparativ, pe criterii.
16. **Cum folosim AI** (5 p): bucla observă, documentează, propune, măsoară; confirmare umană; text scris de AI sau deloc.
17–20. **MVP** (8 p): capturi sau demonstrație pentru Școală (teme și examene), Focus, plan al zilei, Molt, Progres.
21. **Legătura cu problema** (7 p): fiecare funcție mapată la o cauză din slide-urile 3–5.
22. **Realism** (5 p): ce funcționează azi, ce e în lucru, ce nu pretindem (fără „dovedește cauzalitate").
23. **Echipa** (4 p): cine face ce.
24. **Pașii următori** (3 p): direcția clară și realistă.
25. **Impactul asupra educației** (2 p): ce se poate măsura și ce ați măsurat deja.

## 4. Scenariul videoclipului (5 minute maximum, MP4)

Videoclipul trebuie să prezinte MVP-ul (8 p la „Video", 5 p la prezentare). Înregistrați ecranul aplicației reale cu un cont de test care are date.

| Timp | Ce se vede | Mesaj |
|---|---|---|
| 0:00–0:25 | Elev real (sau voiceover) cu o problemă concretă: test vineri, temă luni, plan abandonat | Problema, cu o cifră sursată |
| 0:25–1:10 | Acasă: card Școală. Se adaugă un test și o temă (30 de secunde, fără AI). Se apasă „+25 min" | Planificatorul de teme și examene (direcția E3) |
| 1:10–2:00 | Molt: „Planul zilei" și „Teme și examene" cu AI. Propunerea cere confirmare, apare motivul și datele folosite | AI explicabil, omul decide |
| 2:00–2:40 | Focus (sesiune), bifare obicei, personajul evoluează | Gamificare care ține motivația |
| 2:40–3:20 | Progres: „Timp de studiu", momentum, impactul coach-ului (înainte/după) | Măsurăm ce a funcționat |
| 3:20–4:00 | Rescue / revive după o zi ratată | Nu penalizăm, revenim |
| 4:00–4:40 | Un elev real spune ce a folosit (cu acord scris al părintelui dacă e minor) | Validare |
| 4:40–5:00 | Ce urmează, contact | Pașii următori |

Sfaturi: sub 5:00 cu 10 secunde de rezervă; subtitrări (juriul poate vedea fără sunet); fără animații lungi; nu arătați erori de rețea sau ecrane „AI indisponibil". Dacă AI-ul din cont pică în timpul filmării, filmați din nou, nu înlocuiți cu text scris de mână.

## 5. Concurenți și diferențiere (început, de completat)

Verificat din magazinele de aplicații la 25 oct 2026:

| Produs | Ce face (verificat) | Ce nu face față de Molted |
|---|---|---|
| [MyStudyLife](https://apps.apple.com/app/id910639339) | Planificator pentru elevi: orar, teme cu priorități și alerte, calendar de examene cu remindere, urmărire note, cronometru Pomodoro, sincronizare și lucru offline; gratuit, cu achiziții în aplicație | Nu are agent AI care propune schimbări, nu măsoară efectul schimbărilor, nu are personaj sau grupuri (din ce apare în descriere; verificați în aplicație) |
| [Habitica](https://apps.apple.com/app/id994882113) | Urmărire de obiceiuri cu mecanici RPG: avatar, experiență, obiecte, petreceri și provocări opționale | Nu e construit pentru școală (fără teme și examene), nu are coach AI cu surse, nu măsoară efectul schimbărilor |

**De completat de echipă** (nu le-am verificat, deci nu le scriu ca fapte): un tutor AI generic (de exemplu un chatbot de uz general), o aplicație de tip flashcards/quiz, un agendă școlară obișnuită, platforma școlii (de exemplu eCatalog sau echivalentul vostru). Pentru fiecare: ce face, ce nu face pentru problema voastră, sursa (link).

**Formulare sigură a diferențierii:** nu „suntem unici", ci „combinăm, într-o singură aplicație pentru elevi: planificare de teme și examene, obiceiuri cu un personaj motivant și un agent AI care își măsoară propria eficiență pe fiecare elev, cu surse și limite spuse explicit". Verificați dacă un concurent face deja asta înainte să afirmați lipsa.

## 6. Kit de validare (singura cale spre cele 5 puncte de validare)

**Țintă realistă în 5 zile (26–30 oct):** 8–10 interviuri de 15 minute cu elevi de liceu din clase diferite, plus un sondaj de 8 întrebări cu cel puțin 30 de răspunsuri. Nu inventați numere: dacă faceți 6 interviuri, spuneți 6.

**Minori:** pentru interviuri înregistrate, imagini sau citate cu nume, aveți nevoie de acordul părintelui sau al tutorelui; altfel anonimizați și nu înregistrați. Sondajul fără date personale (fără nume, email, școală exactă).

**Ghid de interviu (în ordinea asta, fără să vindeți aplicația):**
1. Spune-mi despre ultima dată când ai avut un test sau o temă mare. Cum ai planificat?
2. Ce instrumente folosești acum (agendă, telefon, aplicații, grup)? De ce acelea?
3. Cât din plan ai respectat de obicei? Ce te-a oprit?
4. Ce faci când ratezi o zi sau mai multe?
5. Ai încercat vreo aplicație de planificare sau de obiceiuri? Ce ai lăsat și de ce?
6. Cine te ajută (părinți, profesori, colegi)? Când ai vrea ajutor?
7. (Arătați cardul Școală, 2 minute.) Ce ai face cu asta mâine? Ce lipsește?
8. Ai da o aplicație ca asta unui coleg? Ce i-ai spune?
9. Ce te-ar face să renunți după o săptămână?
10. Ce nu te-am întrebat și ar fi trebuit?

**Sondaj (Google Forms, anonim):** clasa; cât de des ratezi o temă sau un termen (niciodată … des); cum îți planifici temele; ce te oprește (listă + „altceva"); dacă ai folosit aplicații de planificare; cât de util ți s-ar părea fiecare dintre: lista de teme/examene, sesiuni de studiu, coach AI, personaj, grup (1–5); ce ai schimba; dacă ai vrea să testezi (da/nu, fără contact obligatoriu).

**Cum raportați:** cifre reale, mărimea eșantionului, o limită spusă („30 de elevi din 2 licee, nereprezentativ"), 2–3 citate (cu acord) și **ce ați schimbat în produs din cauza lor**. Aceea e validarea; un sondaj fără o schimbare în produs convinge puțin.

## 7. Plan pe zile (25 oct – 2 nov)

| Zi | Ce | Cine |
|---|---|---|
| Dum 25 oct | Revedeți acest document, alegeți direcția principală din /teme, confirmați că echipa e înscrisă și are acces la platforma URA | Echipa |
| Lun 26 – Mie 28 | Interviuri și sondaj (secțiunea 6); completați tabelul de concurenți | Echipa |
| Mie 28 | Ajustați produsul după ce ați aflat (cel puțin o schimbare, notată); deploy | Dev |
| Joi 29 | Ultima sesiune: întrebări către mentori despre deck și video | Echipa |
| Vin 30 | Deck complet (25 de slide-uri), repetiție | Echipa |
| Sâm 31 | Videoclip filmat și montat, subtitrări, verificat sub 5:00; export MP4 | Echipa |
| Dum 1 nov 08:00 | Încărcare (nu așteptați ultima zi: fereastra se închide **luni 2 nov, 24:00**) | Echipa |

## 8. Ce s-a făcut în repo pentru asta

- Produsul spune „coach pentru elevi" (logo, descrieri, prompturi AI, landing). Studiu e primul drum; celelalte rămân, încadrate educațional: Educație fizică, Educație financiară, Bunăstare, Creativitate.
- Catalog școlar: Teme pentru a doua zi, Pregătire pentru examen, Recapitulare după ore, Planifică ziua de mâine, Pauză activă la studiu, Lecție de educație financiară, Buget de buzunar.
- **Cardul Școală pe Acasă:** teme și examene adăugate manual (fără AI), bifare, „+25 min" de studiu. Datele se salvează în aceleași tabele ca cele create de AI (`assignments`, `exams`, `study_sessions`), deci le vede și agentul.
- **Timp de studiu în Progres:** minute pe zi și pe materie, ultimele 7 zile.
- Baza de cunoștințe: sursa Dunlosky et al. (2013) despre tehnicile de învățare (testarea activă și exersarea distribuită au primit cele mai mari ratinguri de utilitate; recitirea și sublinierea, cele mai mici). **Trebuie rulat `supabase/seed/knowledge.sql` în Supabase** ca agentul să o poată cita.
- Prompturile AI sunt modificate în `supabase/functions/_shared/prompts.ts`: **funcțiile Edge trebuie redeployate** ca schimbarea să aibă efect.

## 9. Riscuri și lucruri neverificate

- Nu am văzut regulamentul oficial; criteriile de aici vin de pe site. Dacă regulamentul spune altceva, are prioritate.
- Pagina principală spune că înscrierile s-au încheiat; pagina de ghid dă termen 2 oct. Dacă nu sunteți siguri că sunteți înscriși, scrieți la liceeni@rau.ro **azi**.
- Site-ul spune „20 de direcții tematice" și enumeră 19; nu contează pentru jurizare, dar nu citați „20".
- Nu am testat aplicația cu elevi reali, nici cu cont real și AI activ după ultimele modificări; faceți o trecere completă înainte de filmare.
- Textele legale (termeni, confidențialitate) încă folosesc „self-improvement", iar cu minori (cerința de vârstă 16 ani sau acord parental) e nevoie de o verificare juridică, nu doar de schimbarea unui cuvânt. Juriul poate întreba.
- AI-ul se bazează pe OpenRouter: dacă pică în timpul demonstrației sau filmării, nu aveți un plan B scris de mână (regulă a proiectului). Filmați din timp, cu un moment în care știți că funcționează.

## 10. Actualizare: ce am mai aflat (platforma Igodemy și ghidul) și ce s-a adăugat

Surse: [liceeni-ura.igodemy.ai](https://liceeni-ura.igodemy.ai/) (aceeași competiție, pagini /, /ghid-participare, /inscriere), plus o căutare publică.

**Două grile, nu una.** Pagina /semifinale are grila din secțiunea 2 (20/20/20/20/15 + 5 bonus). Ghidul participantului (secțiunea 8) dă o grilă generală, „aceeași pentru toate proiectele", cu 100 de puncte: Inovație și originalitate 25 · Impact și relevanță 20 · Fezabilitate 20 · Calitatea proiectului 15 · Prezentarea și susținerea 10 · Potențial de dezvoltare 10. Departajare în ordinea: inovație, impact, fezabilitate, deliberare. Nu știm care se aplică în finală; pregătiți-vă pentru ambele.

| Criteriu din ghid | Ce să arătați |
|---|---|
| Inovație și originalitate (25) | Agentul care măsoară efectul propriilor propuneri; planul de pregătire bazat pe cercetare; diferențierea față de MyStudyLife și Habitica (secțiunea 5) |
| Impact și relevanță (20) | Elevi reali și cifre reale (secțiunea 6); timpul de studiu din Progres; legătura cu BAC |
| Fezabilitate (20) | Aplicația funcționează azi; ce rămâne în lucru; costuri de AI reale, dacă le aveți |
| Calitatea proiectului (15) | Surse corecte și cu limite (baza de cunoștințe), structură clară, fără afirmații de cauzalitate |
| Prezentare și susținere (10) | Repetiții, răspunsuri la întrebări, rolurile în echipă |
| Potențial de dezvoltare (10) | Pilot într-o școală, extindere pe materii, rapoarte pentru părinți sau profesori (idei, nu promisiuni) |

**Reguli care contează și nu erau în prima versiune:**
- **Copierea unui startup existent duce la descalificare.** Formulați deci diferențierea cu grijă: nu „RPG de obiceiuri" (Habitica există), ci un coach pentru elevi care leagă teme și examene, obiceiuri și un agent AI ce își măsoară eficiența.
- Echipa trebuie să aibă un **Team Lead** pentru comunicarea cu organizatorii; schimbările de componență se anunță în scris în 5 zile lucrătoare.
- Elevii sub 16 ani au nevoie de acordul părintelui sau al tutorelui (și pentru interviurile și materialele voastre de validare).
- Juriul și mentorii vin din marketing, strategie, antreprenoriat, AI și mediul corporate (de exemplu un CEO de asigurări, un dezvoltator AI de la TotalSoft, Google România ca invitat). Așteptați întrebări despre fezabilitate, diferențiere, model de business (în finală), date personale și etica AI. Pregătiți câte un răspuns scurt pentru fiecare.
- Programul subliniază gândirea critică, creativitatea, colaborarea, comunicarea și **utilizarea etică și responsabilă a AI** (din presă; verificați în regulament). Ghidul nu fixează reguli de folosire a AI.

**Ce s-a adăugat în produs pentru asta:**
- **Plan de pregătire pentru examene** (cardul Școală, butonul „Plan"): din data examenului, 2–5 sesiuni distribuite pe zilele rămase, ultima de autotestare, create ca to-do-uri în calendar. Fără AI, fără dubluri la a doua apăsare. Se bazează pe exersarea distribuită și testarea activă (Dunlosky et al., 2013; vezi `knowledge/dunlosky-2013.md`). Limită spusă și în produs: planul e o împărțire regulată a zilelor, nu o garanție de notă.
- **„Cum folosesc AI-ul"** în Molt, la „Ce știe Molt": confirmarea ta, motivul și datele folosite, surse cu limite, ajutor pentru a înțelege (nu temele făcute), nu e terapeut sau medic, 112 și Telefonul Copilului 116 111.
- **Prompturile Edge** spun acum „coach pentru elevi de liceu" și cer lui Molt să explice și să dea indicii, nu să predea teme gata făcute, și să trimită spre un adult de încredere, 112 sau 116 111 dacă elevul vorbește despre autovătămare, abuz, violență sau urgență medicală. **Funcțiile Edge trebuie redeployate** (`ai`, `agent`, `weekly`), altfel aceste reguli nu sunt active. Nu le-am testat cu un model real.

**Idei care ar mai ajuta, neimplementate (decideți voi):**
- Pe landing, o secțiune „Pentru elevi" cu direcțiile E3, F2 și G1 din /teme și cu sursele.
- „Molted în cifre" cu minute de studiu agregate (necesită o modificare în baza de date).
- Un raport lunar exportabil pentru elev, părinte sau diriginte.
- Un pilot într-o clasă, cu acord parental: ar fi cea mai puternică dovadă pentru Impact, Validare și Pașii următori.
