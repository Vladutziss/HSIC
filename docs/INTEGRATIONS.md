# Integrări

Cinci integrări, toate pornite de elev din **Setări → Integrări**. Niciuna nu e activă implicit și niciuna nu poate schimba ceva în Molted fără elev: calendarul și notițele doar citesc, webhook-urile și Notion primesc copii, iar agenții AI doar propun.

| Integrare | Ce face | Unde e codul |
|---|---|---|
| Calendar `.ics` | Link secret pe care Google Calendar, Apple Calendar și Outlook îl abonează: to-do-uri (și cele care se repetă, zi cu zi), teme, examene, pași din obiective, termene, opțional obiceiurile cu oră. Se actualizează singur. Fără cont: descărcare unică `.ics`. | `apps/app/src/lib/ics.js`, `supabase/functions/calendar`, `_shared/calendar-core.js` |
| Markdown / Obsidian | Un fișier `.md` pe zi (front matter cu scor, momentum, serie; raportul, bifele ca task-uri, to-do-uri, Focus, reflecția), toate într-un `.zip`. Făcut în browser, merge și fără cont. | `apps/app/src/lib/mdExport.js`, `lib/zip.js` |
| Webhook-uri | POST JSON semnat (Standard Webhooks, HMAC-SHA256) la max. 3 adrese: `habit.checked`, `plan.applied`, `report.created` (cu nota Markdown), `reflection.created`. Reîncercări, oprire după 20 de eșecuri la rând, buton de test. | `_shared/webhooks-core.js`, `supabase/functions/webhooks`, `lib/webhookUrl.js` |
| Notion | OAuth (integrare publică); baza de date „Molted” găsită sau creată într-o pagină partajată; fiecare raport și reflecție nouă devine o pagină (scris de `webhooks` din outbox), plus „Scrie ultimele 30 de zile”. | `_shared/notion-core.js`, `_shared/notion-api.js`, `_shared/integrations.ts`, `supabase/functions/notion` |
| Server MCP | Agenții (Claude, ChatGPT, Cursor...) citesc datele elevului cu un token `mlt_…` și pot propune acțiuni. Propunerile intră în `agent_actions` ca `pending`, verificate cu aceleași reguli ca ale lui Molt (`validateProposals`), și se confirmă în aplicație. | `_shared/mcp-core.js`, `supabase/functions/mcp` |

## Cum curg datele

- **Migrarea 0042** ține tot ce e de cont: `calendar_feeds`, `webhook_endpoints`, `notion_connections` + `notion_pages`, `mcp_tokens`, `integration_events` (outbox). RLS și granturi explicite în aceeași migrare; clientul scrie doar prin funcții (`save_calendar_feed`, `create_webhook_endpoint`, `create_mcp_token` etc.).
- **Evenimentele** le pun în outbox declanșatoare pe `completions`, `agent_actions` (status → `applied`), `day_reviews` (textul raportului) și `reflections`, câte un rând pentru fiecare destinatar. Un declanșator nu poate bloca scrierea elevului (erorile sunt înghițite) și ignoră zilele vechi (importuri).
- **`webhooks`** (pg_cron la minut, migrarea 0043) ia rândurile scadente (`claim_integration_events`), citește datele așa cum sunt în acel moment, trimite și notează rezultatul (`record_integration_result`): reîncercări după 1 min, 5 min, 30 min, 2 h, 12 h.
- **Siguranța adreselor**: doar `https`, fără user:parolă în adresă, fără IP-uri sau nume private; numele se rezolvă (A și AAAA) înainte de fiecare trimitere și orice adresă privată oprește trimiterea; redirect-urile nu se urmează.
- **Tokenuri**: linkul de calendar e secret (64 hex, se poate înlocui); tokenul Notion e criptat AES-256-GCM cu o cheie derivată din `INTEGRATIONS_SECRET`; din tokenurile MCP se păstrează doar SHA-256, max. 5 pe cont, 60 de apeluri/minut, max. 5 propuneri în așteptare și 20 pe zi.

## Deploy (o singură dată)

1. **Migrări**: aplică `0042_integrations.sql` în SQL editor, apoi rulează `supabase/tests/integrations.sql` (și `rls.sql`).
2. **Secrete** (niciodată în repo sau în chat):
   ```bash
   supabase secrets set INTEGRATIONS_SECRET=$(openssl rand -hex 32) INTEGRATIONS_CRON_SECRET=$(openssl rand -hex 32)
   supabase secrets set NOTION_CLIENT_ID=... NOTION_CLIENT_SECRET=...      # după pasul 4
   ```
   `INTEGRATIONS_SECRET` nu se mai schimbă după ce cineva a conectat Notion (tokenurile stocate nu s-ar mai putea citi; elevii ar trebui să se reconecteze).
3. **Funcții**:
   ```bash
   npm run sync:functions
   supabase functions deploy calendar --no-verify-jwt
   supabase functions deploy webhooks --no-verify-jwt
   supabase functions deploy notion --no-verify-jwt
   supabase functions deploy mcp --no-verify-jwt
   ```
4. **Notion**: pe https://www.notion.so/profile/integrations creezi o integrare **publică** („Molted”), cu Redirect URI `https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/notion` și capabilitățile *Read content*, *Insert content*, *Update content*. Notion cere pentru integrările publice și linkuri spre politica de confidențialitate și termeni (cele de pe molted.eu). Copiezi Client ID și Client secret în secrete (pasul 2). Opțional: `NOTION_REDIRECT_URI`, `APP_URL`.
5. **Cron**: în `0043_integrations_cron.sql` înlocuiești `REPLACE_WITH_INTEGRATIONS_CRON_SECRET` cu valoarea secretului și îl rulezi în SQL editor (nu se commit-uiește cu valoarea reală).
6. **Aplicația**: merge pe Vercel; panoul apare în Setări pentru conturile autentificate. În artifactul din claude.ai panoul e ascuns (nu poate salva fișiere și nu are cont).

## Pentru elev: conectarea unui agent prin MCP

- Adresa: `https://ldggxdgrmlhcfoherdlu.supabase.co/functions/v1/mcp`, antet `Authorization: Bearer mlt_…` (sau `?key=mlt_…` pentru clienții care primesc doar o adresă).
- Claude Desktop / Cursor: Setări → Integrări → Token nou dă o configurare gata de lipit (`npx mcp-remote … --header Authorization:Bearer …`).
- Claude.ai / ChatGPT (conectori „custom”): adresa cu `?key=`.
- Instrumente: `get_overview`, `list_habits`, `get_day`, `list_todos`, `get_school`, `get_goals`, `get_reports`, `get_reflections`, `get_action_log`, `propose_action` (doar dacă tokenul are „poate propune”).

## Verificare pentru un webhook (la primitor)

Antetele `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`; semnătura e HMAC-SHA256 cu cheia `whsec_…` (base64 după prefix) peste `id.timestamp.corp`. Orice bibliotecă Standard Webhooks / Svix o verifică. Același `webhook-id` la reîncercare, deci primitorul poate ignora dublurile.

## Teste

- `apps/app/tests/ics.test.mjs`, `mdExport.test.mjs`, `webhooks.test.mjs`, `outbox.test.mjs`, `notion.test.mjs`, `mcp.test.mjs`, `calendar.test.mjs` (în `npm test`).
- `supabase/tests/integrations.sql`: RLS, limitele, declanșatoarele, outbox-ul, reîncercările, ștergerea contului.

## Ce nu face (încă)

- Calendarul e doar citire: o mutare în Google Calendar nu ajunge în Molted.
- Fără notificări push sau email la eșecul unui webhook; starea apare în Setări.
- Notion: un singur workspace pe cont; doar rapoarte și reflecții (nu și to-do-uri).
- Funcțiile Edge au fost verificate cu teste pe nucleele lor și cu bundle-ul esbuild, nu și rulate în Deno local; primul deploy merită urmărit în logurile Supabase.
