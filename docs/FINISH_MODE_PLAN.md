# Finish Mode — plan

| # | Task | Status | Dovadă / blocaj |
|---|---|---|---|
| 1 | Teste jocului/agent (208) | VERIFIED | `npm test` pass |
| 2 | Build app + landing | VERIFIED | build OK |
| 3 | Sincronizare `_shared/app` | VERIFIED | fără drift de conținut |
| 4 | RLS activat pe toate tabelele | VERIFIED | query pg_class |
| 5 | Revocare EXECUTE `rls_auto_enable` pentru anon/authenticated | VERIFIED | revocat; `has_function_privilege` = false pentru ambele (aplicat direct pe DB, fără fișier de migrare) |
| 6 | Decizie `agent_stats` expus anon | NOT STARTED | decizie produs |
| 7 | Rulare `supabase/tests/rls*.sql` | VERIFIED | rulate pe Momentum cu rollback, fără excepții (NOTICE-urile nu sunt returnate de tool; succesul = absența erorii) |
| 8 | Test live Edge Functions | PARTIAL | neautentificat: ai/agent/weekly/stats → 401 session_expired, push fără acțiune → 400, nicio scurgere; cu sesiune validă și cron secret: neverificat (necesită login/secrete) |
| 9 | Parcurgere UI e2e (Clerk), app.molted.eu | PARTIAL | login uman OK; to-do: creare → persistă după refresh → bifare → ștergere, confirmate în DB (VERIFIED). Chat coach: răspunde, mesajele persistă (VERIFIED). Bifă de obicei: NEFĂCUT (ar altera seria reală de 13 zile). Creare obicei: nefăcut |
| 12 | Coach chat afirma stări de completare neexistente în context (a spus „ai respectat…/ai uitat să studiezi investiții", contrazis de DB) | VERIFIED | cauză: promptul `chat` nu conține completări; regulă adăugată în `_shared/prompts.ts` + test (209 pass). `ai` redeploy-at pe Momentum (v18); în chat, întrebat ce a bifat, coach-ul răspunde acum „nu pot vedea ce ai bifat”, fără afirmații inventate |
| 10 | Aliniere registru migrări remote | NOT VERIFIED | GitHub nu are migrări peste 0029; efectele 0009–0029 sunt prezente pe DB (cron, pgvector, constraint add_note, tabele); doar registrul `list_migrations` e nealiniat — cosmetic, nu s-a re-aplicat nimic |
| 11 | Edge Functions desfășurate (ai, agent, weekly, push, stats) | VERIFIED (doar existență) | toate ACTIVE; comportament live neverificat |
