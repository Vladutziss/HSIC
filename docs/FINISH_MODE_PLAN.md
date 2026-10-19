# Finish Mode — plan

| # | Task | Status | Dovadă / blocaj |
|---|---|---|---|
| 1 | Teste jocului/agent (208) | VERIFIED | `npm test` pass |
| 2 | Build app + landing | VERIFIED | build OK |
| 3 | Sincronizare `_shared/app` | VERIFIED | fără drift de conținut |
| 4 | RLS activat pe toate tabelele | VERIFIED | query pg_class |
| 5 | Revocare EXECUTE `rls_auto_enable` pentru anon/authenticated | VERIFIED | aplicat pe Momentum (`has_function_privilege` = false) și fixat în `supabase/migrations/0030_revoke_rls_auto_enable.sql` |
| 6 | Decizie `agent_stats` expus anon | VERIFIED (intenționat) | 0028: doar agregate, null sub 20 propuneri decise și 3 jucători; folosit de landing (`apps/web/src/main.js`). Fără modificare |
| 7 | Rulare `supabase/tests/rls*.sql` | VERIFIED | rulate pe Momentum cu rollback, fără excepții (NOTICE-urile nu sunt returnate de tool; succesul = absența erorii) |
| 8 | Test live Edge Functions | PARTIAL | neautentificat: ai/agent/weekly/stats → 401, push fără acțiune → 400; cron `push-daily-report` rulează în fiecare minut cu 200 (`{"sent":0}`) — VERIFIED; `agent-nudge` (zilnic 17:00 UTC) și `agent-weekly` (duminică 18:00 UTC) nu au încă nicio rulare în `cron.job_run_details` → de verificat după 17:00 UTC 2026-10-20 și după 2026-10-25 18:00 UTC; calea cu AGENT_CRON_SECRET nu poate fi testată fără secretul (nu e citibil prin MCP); încercarea de a declanșa manual `agent-nudge` (0 jucători opt-in, deci inofensiv) a fost refuzată de clasificatorul de permisiuni și nu a fost ocolită; `agent-weekly` are 3 jucători opt-in, deci nu e rulat manual (ar scrie acțiuni reale) — rulează duminică 18:00 UTC |
| 9 | Parcurgere UI e2e (Clerk), app.molted.eu | PARTIAL | login uman OK; to-do: creare → persistă după refresh → bifare → ștergere, confirmate în DB (VERIFIED). Chat coach: răspunde, mesajele persistă (VERIFIED). Bifă de obicei: neexercitată în UI (nu modificăm date reale ale utilizatorului); logica acoperită de testele engine/stats (209 pass) și RLS pe `completions` (rls.sql, VERIFIED). Rămâne ca verificare manuală pe un cont de test |
| 12 | Coach chat: date reale pentru AI (bife azi + 7 zile, serie, focus, scopuri, calendar 7 zile cu ore, to-do fără dată) | VERIFIED | live pe app.molted.eu (PR #61, 71d9624) + `ai` v20; la întrebarea „ce am bifat și ce a rămas, seria?” răspunsul a coincis cu DB (5 bifate, 3 rămase, serie 13). 209 teste |
| 13 | „Vercel – molted: failure” în statusurile GitHub | VERIFIED (fals pozitiv) | în dashboard-ul Vercel (echipa molted) toate deployment-urile proiectului app sunt Ready, inclusiv Production 71d9624; eșecul vine din altă integrare (proiect `molted` în contul vladutziss-projects, 404 din contul hsicmomentum). De curățat integrarea duplicat, manual |
| 10 | Aliniere registru migrări remote | NOT VERIFIED | GitHub nu are migrări peste 0029; efectele 0009–0029 sunt prezente pe DB (cron, pgvector, constraint add_note, tabele); doar registrul `list_migrations` e nealiniat — cosmetic, nu s-a re-aplicat nimic |
| 11 | Edge Functions desfășurate (ai, agent, weekly, push, stats) | VERIFIED (doar existență) | toate ACTIVE; comportament live neverificat |
