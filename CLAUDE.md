# Molted RPG — note pentru Claude

- Acesta e repo-ul proiectului (Vladutziss/HSIC). Toată munca la aplicație se face aici.
- Artifact publicat: https://claude.ai/artifact/5CVNPku5rNoHFQAV2bk65E — se actualizează la același URL (`url` la publish), fără a schimba capabilitățile (sample, assets, db, user).
- Sursa e în `src/`; pagina publicată e `artifact/momentum.html`, generată cu `npm run build:artifact` și copiată din `dist/momentum.html`. Commit-uiește-o după fiecare rebuild.
- Înainte de commit: `npm test` (regulile jocului) și `npm run build:artifact`.
- Răspunsuri scurte, în română.

## Backend (Supabase)

- Aceeași sursă dă două build-uri: **web** (`npm run build`, Vite, `__SUPABASE__=true`, hosting pe Vercel) și **artifact** (`npm run build:artifact`, `__SUPABASE__=false`, fără supabase-js, rămâne demo fără sincronizare). Cod nou care atinge Supabase se ascunde în spatele `getClient()` din `src/lib/supabase.js`.
- Proiect Supabase `Momentum`, ref `ssisfijdypneapohbkak` (eu-west-2), în organizația „Duku's projects". Variabilele clientului (publice) sunt în `.env.local` (necomis; model în `.env.example`).
- Schema: `supabase/migrations/000N_*.sql`, aplicate în ordine (în dashboard: SQL editor). Orice tabel nou primește RLS în aceeași migrare. După schimbări în DB rulează `supabase/tests/rls.sql` (într-o tranzacție cu rollback).
- Starea aplicației ↔ rânduri: `src/lib/remote.js` (funcții pure, testate în `tests/remote.test.mjs`); `store.js` are modul `supabase` lângă `cloud`/`local`/`memory`.
- AI: Edge Function `supabase/functions/ai` (OpenRouter). Secretele (`OPENROUTER_API_KEY`, `AI_MODEL`) se setează doar cu `supabase secrets set`, niciodată în repo sau în chat.
- Planul complet: `C:\Users\const\.claude\plans\ok-crezi-ca-poti-valiant-bengio.md`.
