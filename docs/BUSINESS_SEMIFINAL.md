# Molted: partea de business pentru semifinala II (HSIC 2026)

Materialul pentru criteriile 1 (clientul), 4 (business și comunicare) și 5 (costuri, venituri, KPI). Cifrele marcate **[ipoteză]** sunt decizii sau estimări ale echipei, nu date măsurate. Cifrele marcate **[de verificat]** trebuie confirmate înainte de upload (prețuri de furnizori, planuri curente). Restul vin din prezentarea de preselecție și din cod.

## 1. Clientul: ICP și harta empatiei

### ICP (profilul clientului ideal)

| | |
|---|---|
| Cine | Liceean de 16–18 ani, clasa a XI-a sau a XII-a, în pregătire pentru Bac sau admitere |
| Context | Peste 3 ore online pe zi (73% dintre liceeni); școala și temele ocupă ~8 ore |
| Problema lui | „Greu să încep” (8 din 17) și „greu să rămân concentrat” (9 din 17) |
| Ce folosește azi | Nimic (12 din 17), notițe în telefon (4), caiet sau agendă (3), aplicații (1) |
| Unde îl găsim | Licee, grupuri de clasă, TikTok/Instagram, evenimente (turneul de baschet) |
| Cine decide plata | Elevul (gratuit), părintele (Pro), școala (licență) |
| Clienți secundari | Părinți și diriginți (vor vedea progresul fără să controleze) |

### Harta empatiei

| Zonă | Conținut (din sondajul Molted, 17 răspunsuri) |
|---|---|
| **Gândește și simte** | „Nu știu de unde să încep.” Presiunea Bacului (23% respinși la prima sesiune 2026). Vinovăție după o zi ratată. |
| **Vede** | Colegi care par organizați, aplicații cu abonamente, notificări peste tot, 3+ ore pe telefon. |
| **Aude** | „Trebuie să fii constant.” „Ai timp, mai e până la Bac.” Sfaturi generice de la profesori și părinți. |
| **Spune și face** | Își face planuri și le abandonează în câteva zile. Folosește notițe în telefon, nu o aplicație dedicată. |
| **Dureri** | Distragere (35% dintre elevii de 15 ani, OCDE), ratări care par eșecuri, nu vede ce l-a ajutat. |
| **Câștiguri dorite** | Un pas mic pe zi, ratări iertate, dovada că ceva funcționează, să fie constant, nu perfect. |

## 2. Propunerea de valoare

„Molted ajută liceanul să transforme «trebuie să învăț pentru Bac» într-un singur pas mic pe zi și îi arată, cu propriile lui date, dacă acel pas l-a ajutat.”

Pentru școli: elevi mai constanți, măsurați anonim (teme la termen, minute de studiu), fără să le promitem note.

## 3. Business Model Canvas

| Bloc | Molted |
|---|---|
| **Segmente de clienți** | (1) Liceeni XI–XII (utilizatori). (2) Părinți (plătitori Pro, secundar). (3) Licee (cumpărători de licență). (4) Parteneri locali pentru giveaway-uri (sponsori). |
| **Propunerea de valoare** | Un singur pas pe zi, explicat, cu confirmarea elevului. Comparație înainte/după la 14 zile. Ratări iertate. Totul în română, într-un singur loc (planificare, Focus, personaj, grup). |
| **Canale** | App web instalabilă (app.molted.eu), landing molted.eu, TikTok/Instagram/Facebook, licee și diriginți, evenimente (turnee), giveaway-uri cu QR. |
| **Relația cu clientul** | Autoservire cu AI, grupuri de colegi, emailuri de retenție (oprite implicit, cu consimțământ), discuții de 10 minute cu elevii (12 din 17 au acceptat). |
| **Fluxuri de venituri** | Freemium: Pro elev **[ipoteză]**. Licență pentru școli **[ipoteză]**. Sponsori pentru giveaway-uri **[ipoteză]**. Granturi și premii de competiție. |
| **Resurse cheie** | Codul și agentul AI, baza de cunoștințe din 11 surse științifice, echipa de 4, baza de utilizatori, domeniul molted.eu. |
| **Activități cheie** | Dezvoltarea produsului, măsurarea efectului la 14 zile, conținut video, relații cu licee, administrarea giveaway-urilor. |
| **Parteneri cheie** | Licee și diriginți, furnizori (OpenRouter, Supabase, Vercel, Clerk, Resend), sponsori locali, organizatori de turnee, HSIC și URA. |
| **Structura de costuri** | Fix: infrastructură și domeniu. Variabil: AI per elev activ. Marketing: conținut propriu, premii giveaway. Munca echipei: neplătită acum. |

Legătura dintre blocuri: problema (planuri abandonate) → valoarea (un pas și dovada efectului) → canalele ajung la elevi → elevii folosesc gratuit → școlile și părinții plătesc pentru constanță măsurată.

## 4. Comunicare și marketing

**Mesaj pentru elev:** „Un singur pas pe zi. Peste 14 zile vezi dacă a mers.” Ton: relaxat, fără predici, ratarea nu e eșec.
**Mesaj pentru școală:** constanță măsurabilă, date anonime, fără promisiuni de note.
**Mesaj pentru părinte:** elevul învață constant, tu nu trebuie să-l controlezi.

| Canal | Rol | Dovadă / plan |
|---|---|---|
| Turnee și evenimente | Achiziție directă | Baschet: 70 de participanți → 20 de utilizatori noi (~29% conversie, afișe cu QR). Cost: afișe, timp. |
| TikTok, Instagram, Facebook | Notorietate | „Content machine”: clipuri scurte făcute cu Claude și voiceover ElevenLabs, 3–4 pe săptămână **[ipoteză]**. |
| Giveaway-uri (doar România) | Achiziție și viralitate | Sistem deja construit (`docs/GIVEAWAYS.md`): QR, atribuire pe sursă, administrare. Nicio campanie publicată încă. |
| Licee și diriginți | Distribuție în clasă | Pilot de 8 săptămâni în 1–3 licee (slide 19). |
| Grupuri în aplicație | Creștere organică | Cod de invitație de 6 caractere, clasament săptămânal. |
| Email | Retenție | Secvență pe 4 pași și reactivare, oprite implicit, doar cu consimțământ. |

## 5. Costuri

### Pornire (o singură dată)

| Element | Cost |
|---|---|
| Buget comun de API: 4 × 2 EUR | **8 EUR** (conform conversației echipei) |
| Domeniu molted.eu (Namecheap) | ~10–15 EUR/an **[de verificat]** |
| Afișe pentru turneu | Costul real tipărit **[de completat]** |
| Muncă | Neplătită (4 elevi voluntari) |

8 EUR de API acoperă aproximativ 18 luni-utilizator activ pe un model de cost mediu (0,44 EUR/lună) sau ~80 pe unul ieftin (0,10 EUR/lună). Nu e un buget de scară; e pentru pilot.

### Lunar, la funcționare

| Element | Cost |
|---|---|
| AI per elev activ / lună | **0** pe modele gratuite; ~**0,10** (ieftin), ~**0,44** (mediu), ~**3,24** (premium) EUR. Calcul din cotele din `ai` (40 apeluri/zi) și `agent` (15 rulări/zi), cu ipoteze de tokeni. |
| Supabase (bază de date, funcții, pgvector) | Plan gratuit sau Pro, ~25 USD/lună **[de verificat planul actual]** |
| Vercel (două proiecte) | Gratuit sau Pro **[de verificat]** |
| Clerk (autentificare) | Gratuit până la o limită de utilizatori activi **[de verificat]** |
| Resend (email) | Gratuit până la o limită lunară **[de verificat]** |
| Upstash (limită de rată) | Plan gratuit **[de verificat]** |
| **Total fix estimat la scară mică** | **~0–50 EUR/lună** **[ipoteză]** |

Costul AI crește cu utilizarea, restul rămâne aproape fix. Plafonul de abuz pe utilizator (toate cotele epuizate zilnic) e ~2,5 EUR/lună pe modelul ieftin și ~10,5 pe cel mediu; îl limitează și burst-ul de 8 apeluri pe minut.

## 6. Venituri și sustenabilitate

Principiu: elevul folosește gratuit, plătește cine primește valoarea măsurată.

| Sursă | Preț propus **[ipoteză]** | Cine plătește |
|---|---|---|
| **Molted Pro** | 3 EUR/lună sau 25 EUR/an: limite AI mai mari, istoric extins, mai multe obiective | Elev 16+ sau părinte |
| **Licență școală** | 1 EUR / elev activ / lună, minim 100 de elevi, cu panou anonim pentru diriginți | Liceu sau asociația de părinți |
| **Sponsori giveaway** | 100–300 EUR / campanie, cu raport de atribuire | Afaceri locale (cafenele, librării, magazine) |
| **Granturi și premii** | Premii HSIC și programe pentru tineri | Organizatori |

### Scenarii pe 12 luni (calcul simplu, ipotezele sunt în tabel)

| | Pilot (conservator) | Creștere cu licee |
|---|---|---|
| Conturi | 1.000 | 3 licee × ~800 = 2.400 |
| Activi lunar | 20% → 200 (acum 8 din 53 = 15%) | 40% activare → ~960 |
| Venit lunar | 5% din activi plătesc Pro → 10 × 3 = 30 EUR; un sponsor pe trimestru, ~50 EUR/lună. **Total ~80 EUR** | 960 × 1 = **~960 EUR** (licență) |
| Cost AI lunar | ieftin: 200 × 0,10 = 20 EUR; mediu: 88 EUR | ieftin: ~96 EUR; mediu: ~422 EUR |
| Cost fix | ~50 EUR | ~100 EUR |
| **Rezultat lunar** | ieftin: ~+10 EUR; mediu: **~−58 EUR** | ieftin: **~+764 EUR**; mediu: **~+438 EUR** |

Concluzia onestă: în faza de pilot proiectul abia acoperă costurile și numai cu un model ieftin sau gratuit. Sustenabilitatea reală vine din licențele pentru școli. Din acest motiv ținta noastră e pilotul în licee, nu abonamentul elevilor, care au disponibilitate mică de plată.

Prag de rentabilitate pe Pro (fără licențe): cost fix 50 EUR împărțit la contribuția pe utilizator (3 EUR minus ~0,10–0,44 AI minus ~0,35 comision de plată **[de verificat]**), adică **~18–20 de abonați plătitori**.

Cum continuă pe termen lung: licențe recurente de școală (venit predictibil), sponsori pe sezon (Bac, vacanță), și costul AI ținut mic prin cotele zilnice, limita de burst și modele ieftine.

## 7. KPI și impact

| Tip | KPI | Valoare acum | Țintă pilot 8 săptămâni **[ipoteză]** |
|---|---|---|---|
| Achiziție | Utilizatori noi din evenimente | 20 din 70 la turneu (~29%) | ≥25% la fiecare eveniment |
| Activare | Activi 7 zile / conturi | 8 din 53 (15%) | ≥30% |
| Retenție | Obiceiuri păstrate după 30 și 60 de zile | nemăsurat | ≥40% la 30 de zile |
| Calitatea agentului | Propuneri acceptate | 96% din 24 | ≥80% (dacă rămâne mare, verificăm că nu acceptă din inerție) |
| **Efect** | Rata de bifare înainte/după la 14 zile | „în curs” | primele măsurători, cu cifre absolute |
| **Impact în educație** | Teme finalizate la termen, minute de studiu pe săptămână, elevi care revin după o pauză | nemăsurat | măsurat la început și la sfârșit, cu clasă de comparație |
| Business | Cost AI per elev activ, conversie la Pro, licențe semnate | cost estimat, 0 plătitori | cost real din OpenRouter, ≥1 liceu pilot |

Nu promitem creșteri de note. Mesajul onest, în linie cu prezentarea de preselecție: măsurăm constanță și obiceiuri, nu note.

## 8. Cum încape în maximum 25 de slide-uri

Acum sunt 21. Adaugă 3 și ajungi la 24:

1. **Nou: Clientul (ICP + harta empatiei)**, în locul slide-ului 5 sau lângă el.
2. **Nou: Business Model Canvas** (tabelul de la secțiunea 3).
3. **Nou: Costuri și venituri** (tabelul de costuri și scenariile; un singur slide cu trei cifre mari).
4. Marketing: extinde slide-ul 21 (turneul) cu canalele de la secțiunea 4.
5. KPI: extinde slide-ul 19 cu tabelul de la secțiunea 7.

Dacă vrei și un slide de arhitectură tehnică, ajungi la 25; nu mai e loc de nimic altceva.

## 9. Înainte de upload (26–27 noiembrie)

- Confirmă prețul modelului (`AI_MODEL`, `AGENT_MODEL` în Supabase → Edge Functions → Secrets) și costul real din OpenRouter → Activity; înlocuiește estimările din secțiunea 5.
- Confirmă planurile Supabase, Vercel, Clerk și Resend și completează costurile fixe.
- Actualizează utilizatorii și activii (slide 17 are cifrele din 2 noiembrie).
- Decideți prețurile. Pro și licența sunt ipoteze; juriul va întreba „de ce atât?”. Răspunsul cel mai bun e un interviu cu un diriginte sau un director.
- Giveaway-ul: sistemul e implementat, dar nicio campanie nu e publicată, iar activarea cere toate cele 5 puncte de verificare și regulile legale (`docs/GIVEAWAYS.md`). Dacă îl faceți până la submit, folosiți atribuirea pe sursă ca să măsurați conversia reală.
