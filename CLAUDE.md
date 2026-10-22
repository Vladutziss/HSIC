# Molted RPG — note pentru Claude

- Acesta e repo-ul proiectului (Vladutziss/HSIC). Toată munca la aplicație se face aici.
- Artifact publicat: https://claude.ai/artifact/5CVNPku5rNoHFQAV2bk65E — se actualizează la același URL (`url` la publish), fără a schimba capabilitățile (sample, assets, db, user).
- Monorepo (npm workspaces): `apps/app` (aplicația, Vite), `apps/web` (landing molted.eu, Vite static), `packages/ui` (tokenuri de design comune: preset Tailwind + base.css), `supabase/` rămâne la rădăcină. Vercel: proiectul aplicației are Root Directory `apps/app` (app.molted.eu), proiectul landing `apps/web` (molted.eu).
- Limba după țară: `apps/web/middleware.js` redirecționează `/` spre `/ro/` (țara RO sau MD, ori browser în română) sau `/en/` (restul); `vercel.json` nu mai are redirect pe `/` (ar masca middleware-ul). Detalii în `docs/LOCALIZATION.md`.
- Landing `apps/web`: pagini localizate `/ro` și `/en` generate la build din `src/i18n/routes.js` + dicționare (`ro.js`/`en.js`); regulile, URL-urile și checklist-ul de deploy sunt în `docs/LOCALIZATION.md`. `npm test` rulează și testele landing-ului.
- Textele legale (`apps/web/content/{terms,privacy,cookies}.{ro,en}.html`): româna e originalul, engleza traducere; nu se salvează nimic pe dispozitiv și nu se încarcă nimic de la terți înainte de consimțământ (fonturile sunt proprii), orice stocare nouă se trece în politica de cookie-uri. Regulile și citările corecte (Legea 506/2004 art. 4 alin. (5) = acord, alin. (6) lit. b) = excepția) sunt în `docs/LOCALIZATION.md`, testate de `apps/web/tests/legal.test.mjs`.
- Giveaway-uri (doar România, `/ro/giveaways`): sistem administrat din `/admin/giveaways/`, schema în migrarea 0031, documentat în `docs/GIVEAWAYS.md`. Testele DB: `supabase/tests/giveaways.sql`.
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

### Coach AI

- Edge Functions: `ai` (single-shot: review/moment/chapter/insights), `agent` (buclă de tool-uri: get_habit_stats, get_context, get_feedback, get_past_actions, get_experiments, analyze_patterns, search_knowledge, propose_action; sursele pot fi citate doar dacă au fost aduse de un tool; propunerile se validează în `supabase/functions/_shared/agent-core.js`) și `weekly` (pg_cron duminica 18:00 UTC, opt-in `settings.agentWeekly`, reguli deterministe în `supabase/functions/_shared/weekly-core.js`, loghează în `agent_actions`, măsoară efectele cu `lib/outcomes.js`).
- Baza de cunoștințe: `knowledge/*.md` → `node scripts/build-knowledge.mjs` → `supabase/seed/knowledge.sql`; pgvector în migrarea 0013, embeddings gte-small completate lazy. Migrări 0013-0017.
- `npm run sync:functions` copiază bibliotecile comune în `supabase/functions/_shared/app`.
- Deploy: din dashboard-ul Supabase ca fișier unic bundle-uit (`esbuild --bundle --external:jsr:*`) sau cu CLI.
- Secrete: `OPENROUTER_API_KEY`, `AI_MODEL`, `AGENT_MODEL`, `AGENT_CRON_SECRET` (niciodată în repo).
- Regulă: textul AI e generat de AI sau deloc (fără fallback-uri scrise de mână).

### Emailuri (Resend)

- Retenție (secvență pe 4 pași) și reactivare (un singur email), trimise de funcția `campaigns` (job zilnic) de la `molted.eu`; dezabonare și webhook în funcția `email`. Totul în spatele `CAMPAIGNS_ENABLED` (oprit implicit). Detalii, config, ce rămâne manual: `docs/EMAILS.md`. Șabloanele (React Email) se regenerează cu `npm run build:emails` și fișierul generat se commit-uiește.
- Adresa de email nu e în DB până la prima autentificare după migrarea 0032 (`sync_email_profile()` o citește din tokenul Clerk). Consimțământul stă în `email_preferences`, nu în Clerk.

## Limbi (RO / EN)

- Interfața aplicației e în română și engleză. Textul sursă e în română: orice text vizibil e `tr("text românesc {var}", { var })` din `apps/app/src/lib/i18n.js`; engleza se caută după același text în `apps/app/src/i18n/en.js`. Fără intrare în `en.js` textul rămâne românesc, iar `tests/i18n.test.mjs` pică (acoperire, placeholdere identice, chei rămase fără folosire, text românesc scăpat în afara `tr()`).
- `"cuvânt§context"`: sufixul după `§` nu se afișează, dar face cheia diferită când același cuvânt românesc cere două traduceri.
- Limba se alege o dată la încărcarea paginii (`?lang=` → alegerea salvată în `molted.prefs.lang` → `?hl=ro`, pus de `apps/app/middleware.js` pentru IP din RO/MD (fără cookie sau altă stocare, vezi `docs/LOCALIZATION.md`) → limba browserului, `ro-*` = română, altfel engleză); comutatorul din Setări (`LanguageSwitch`) salvează și reîncarcă. Contul păstrează alegerea în `settings.prefs.lang`.
- Nu compara niciodată în cod șiruri traduse (ex. „azi”); folosește valori (`diffDays`) sau ID-uri.
- AI: clientul trimite `lang` către `ai`/`agent`; `weekly` și `push` citesc `profiles.settings.prefs.lang`. Funcțiile Edge folosesc copii ale bibliotecilor aplicației (`_shared/app`) cu un `i18n.js` fără React (`scripts/server-i18n.js`, copiat de `npm run sync:functions`), deci acolo rămâne româna.
