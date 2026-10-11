# Molted RPG — note pentru Claude

- Acesta e repo-ul proiectului (Vladutziss/HSIC). Toată munca la aplicație se face aici.
- Artifact publicat: https://claude.ai/artifact/5CVNPku5rNoHFQAV2bk65E — se actualizează la același URL (`url` la publish), fără a schimba capabilitățile (sample, assets, db, user).
- Monorepo (npm workspaces): `apps/app` (aplicația, Vite), `apps/web` (landing molted.eu, Vite static), `packages/ui` (tokenuri de design comune: preset Tailwind + base.css), `supabase/` rămâne la rădăcină. Vercel: proiectul aplicației are Root Directory `apps/app` (app.molted.eu), proiectul landing `apps/web` (molted.eu).
- Sursa aplicației e în `apps/app/src/`; pagina publicată e `artifact/momentum.html`, generată cu `npm run build:artifact` și copiată din `apps/app/dist/momentum.html`. Commit-uiește-o după fiecare rebuild.
- Înainte de commit: `npm test` (regulile jocului) și `npm run build:artifact`.
- Răspunsuri scurte, în română.

## Backend (Supabase)

- Aceeași sursă dă două build-uri: **web** (`npm run build`, Vite, în `apps/app`, `__SUPABASE__=true`, hosting pe Vercel) și **artifact** (`npm run build:artifact`, `__SUPABASE__=false`, fără supabase-js, rămâne demo fără sincronizare). Cod nou care atinge Supabase se ascunde în spatele `getClient()` din `apps/app/src/lib/supabase.js`.
- Proiect Supabase `Momentum`, ref `ldggxdgrmlhcfoherdlu` (eu-west-2), în organizația „Molted" (cont hsicmomentum@proton.me); proiectul vechi `ssisfijdypneapohbkak` e abandonat. Variabilele clientului (publice) sunt în `.env.local` (necomis; model în `.env.example`).
- Schema: `supabase/migrations/000N_*.sql`, aplicate în ordine (în dashboard: SQL editor). Orice tabel nou primește RLS în aceeași migrare. După schimbări în DB rulează `supabase/tests/rls.sql` (într-o tranzacție cu rollback).
- Starea aplicației ↔ rânduri: `apps/app/src/lib/remote.js` (funcții pure, testate în `apps/app/tests/remote.test.mjs`); `store.js` are modul `supabase` lângă `cloud`/`local`/`memory`.
- AI: Edge Function `supabase/functions/ai` (OpenRouter). Secretele (`OPENROUTER_API_KEY`, `AI_MODEL`) se setează doar cu `supabase secrets set`, niciodată în repo sau în chat.
- Planul complet: `C:\Users\const\.claude\plans\ok-crezi-ca-poti-valiant-bengio.md`.
