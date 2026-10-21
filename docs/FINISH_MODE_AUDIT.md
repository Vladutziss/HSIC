# Finish Mode — audit (2026-10-19, branch frontend-qa)

Baseline, evidence-based. Nimic modificat în cod în acest pas.

## Verificări executate
| Verificare | Rezultat |
|---|---|
| `npm test` (apps/app) | 208 pass, 0 fail |
| `npm run build` (app, Supabase) | OK (doar avertisment chunk size) |
| `npm run build:web` (landing) | OK |
| `npm run sync:functions` | fără diferență de conținut (doar zgomot CRLF pe `retired.js`, revenit) |
| Supabase advisors (security), proiect Momentum | vezi mai jos |
| RLS pe tabelele `public` | activat pe toate cele 28 |
| TODO/FIXME/HACK în sursă | niciunul (potriviri doar în nume `TODO_KINDS`) |

## Constatări securitate (DB live)
- `group_profiles` view SECURITY DEFINER (ERROR în linter): intenționat (0003/0009, `anon` revocat, `authenticated` select). RISC acceptat, de confirmat de om.
- `public_stats()` / `agent_stats()` executabile de `anon`: `public_stats` e intenționat (landing „Molted în cifre"); `agent_stats` expus la `anon` — de verificat dacă e dorit.
- `rls_auto_enable()`: EXECUTE revocat pentru anon/authenticated (rezolvat).
- `site_admins`: RLS fără policy = deny-all, intenționat (acces doar prin `is_site_admin()`).
- `pg_net` în schema public; leaked-password protection oprită (Clerk face auth, deci irelevant pentru Supabase Auth).

## Neverificat (necesită acces/oameni)
- `supabase/tests/rls.sql`, `rls_memory.sql`: neexecutate (necesită rulare în SQL editor cu rollback).
- Edge Functions (ai/agent/weekly/push/stats): doar testele unitare ale bibliotecilor comune; fără test live (chei OpenRouter/VAPID).
- Registrul de migrări remote (versiuni 0001–0008 + 2 cu timestamp) nu se potrivește cu fișierele 0009–0029; schema live pare aplicată (tabele existente), dar registrul nu o dovedește.
- Fluxuri UI end-to-end (Clerk sign-in) neparcurse în browser.
