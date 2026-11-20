# Planuri și prețuri (fără procesator de plăți)

Trei planuri: **Gratuit**, **Pro**, **Școală**. Nu există plată online: după o înțelegere (transfer bancar, contract cu școala, sponsor) un admin creează un cod, iar elevul îl introduce în aplicație, la Setări → Plan.

## Ce schimbă un plan

Doar limita zilnică de apeluri AI. `bump_ai_usage()` (migrarea 0041) înmulțește limita pe care o trimit funcțiile Edge (`ai`: 40, `agent`: 15) cu factorul planului: gratuit ×1, Pro ×3, Școală ×2. Funcțiile Edge nu se redeployează.

Factorii și prețurile (ipoteze, în EUR) sunt în `packages/ui/plans-core.js`, folosit de aplicație și de pagina de prețuri. `apps/app/tests/plan.test.mjs` verifică în plus că factorii sunt aceiași cu cei din migrare.

## Unde stă

| Piesă | Fișier |
|---|---|
| Tabele, funcții, factori | `supabase/migrations/0041_plans.sql` (`plan_codes`, `user_plans`, `plan_code_redemptions`, `my_plan()`, `redeem_plan_code()`) |
| Teste DB | `supabase/tests/plans.sql` (într-o tranzacție cu rollback) |
| Constante comune | `packages/ui/plans-core.js` |
| Aplicația | `apps/app/src/lib/plan.js`, `components/PlanPanel.jsx` (în Setări, doar în modul Supabase) |
| Pagina publică | `/ro/preturi/`, `/en/pricing/` (rută `pricing` în `apps/web/src/i18n/routes.js`) |

## Operare (SQL editor din Supabase)

Cod pentru o școală, 200 de elevi, un an:

```sql
insert into public.plan_codes (code, plan, days, max_uses, label)
values ('LICEUL-X-2027', 'school', 365, 200, 'Liceul X');
```

Pro pentru un cont, 30 de zile (id-ul Clerk al utilizatorului):

```sql
insert into public.user_plans (user_id, plan, until, source)
values ('user_abc', 'pro', now() + interval '30 days', 'transfer')
on conflict (user_id) do update set plan = excluded.plan, until = excluded.until, source = excluded.source;
```

Retragere: `delete from public.user_plans where user_id = 'user_abc';`

Reguli: un cod se poate folosi o singură dată pe cont, până la `max_uses` și până la `expires_at`; același plan se prelungește de la data de final curentă; când `until` trece, contul revine automat la gratuit; nu există reînnoire automată.

## Deploy

1. Aplică `0041_plans.sql` (SQL editor), apoi rulează `supabase/tests/plans.sql`.
2. Merge-uiește: aplicația și landing-ul se redeployează singure pe Vercel.
3. Nu e nevoie de `supabase functions deploy`.

## Ce nu face (încă)

- Nu limitează altceva decât apelurile AI (obiective, istoric etc. rămân la fel).
- Nu are pagină de admin pentru coduri; se creează din SQL.
- Nu verifică vârsta pentru Pro (țintă 16+); vezi planul de verificare din prezentare.
- Textele legale (termeni) nu menționează încă planurile plătite: de actualizat înainte de prima vânzare reală.

## Roluri (migrarea 0042)

| Rol | Cum îl primești | Ce poate |
|---|---|---|
| Admin site | rândul din `site_admins` | pagina `/admin/plans/`: creează școli, coduri, pune conturi în școli, acordă sau retrage planuri |
| Admin de școală | pus de adminul site (`admin_set_member`) | creează coduri de diriginte și de elev pentru școala lui, în limita locurilor; vede panoul clasei |
| Diriginte | cod de diriginte | vede panoul clasei |
| Elev | cod de elev | nimic în plus; școala nu îi vede datele |
| Părinte | codul de invitație al unui elev (3 zile, o folosire) | vede numele elevului și două numere din ultimele 7 zile; elevul sau părintele șterg legătura oricând |

- Panoul clasei (`school_panel()`) arată doar numere (elevi, activi, bifări în 7 zile) și **nimic sub 5 elevi**. Pragul e în `plans-core.js` și în migrare, iar `plan.test.mjs` le ține egale.
- Un cont aparține unei singure școli. Planul din școală nu depășește `schools.until` (sfârșitul contractului), iar un cod de elev cere un loc liber.
- În aplicație: Setări → Plan, Școala ta, Familie (`SchoolPanel.jsx`, `FamilyPanel.jsx`). Pentru site admin: `/admin/plans/` (`apps/web/src/admin-plans.js`).
- Teste: `supabase/tests/roles.sql` (rulat local pe PGlite împreună cu `plans.sql`, apoi se poate rula în SQL editor, într-o tranzacție cu rollback).

Flux pentru o școală: admin site → „Școală nouă” → „Pune un cont în școală” (primul admin) → adminul școlii creează codurile din Setări și le dă dirigintelui și elevilor → elevii le introduc în Setări → Plan.

## Ghicirea codurilor (migrarea 0043)

Orice �ncercare gre?ita de cod de plan sau de invita?ie de familie se numara pe cont; dupa 10 �ncercari gre?ite �ntr-o ora, urmatoarea (corecta sau nu) prime?te 	oo_many_attempts p�na trece ora. Codurile facute de adminul site au cel pu?in 8 caractere, iar un c�mp gol genereaza un cod aleatoriu (MLT-). Codurile de ?coala (SCH-) ?i invita?iile de familie sunt deja aleatorii. Test: supabase/tests/code_attempts.sql.
