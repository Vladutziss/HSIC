# Giveaway campaigns (Romania only)

Reusable, admin-managed giveaway system. Campaigns live in Supabase, not in code: opening, pausing or closing one needs no deploy. Public pages exist only under `/ro`; nothing is built, linked or listed under `/en`.

**State of this work:** implemented and tested. Migration `0031_giveaways.sql` is applied on the Momentum project (schema only: no campaign, partner or entry exists) and `supabase/tests/giveaways.sql` passed against it (rolled back). The landing code is not deployed until merged. No campaign is published. See "Deploy".

## Where things live

| Piece | Where |
|---|---|
| Schema, RLS, lifecycle trigger, functions | `supabase/migrations/0031_giveaways.sql` |
| DB tests (RLS, lifecycle, entries, winners, attribution, deletion) | `supabase/tests/giveaways.sql` |
| Shared browser rules (sources, QR URLs, attribution memory, phase, copy, time zones) | `packages/ui/giveaway-core.js` |
| Public list `/ro/giveaways/` | `apps/web/src/giveaways.js` (+ generated static page) |
| Public campaign `/ro/giveaways/<slug>/` | `apps/web/src/giveaway.js`, HTML in `giveaway-view.js` |
| Admin `/admin/giveaways/` | `apps/web/admin/giveaways/index.html`, `src/admin-giveaways.js` |
| Routing and SEO | `apps/web/src/i18n/routes.js`, `ro-only.js`, `vercel.json` (see `LOCALIZATION.md`) |
| Tests | `apps/web/tests/giveaways.test.mjs`, `i18n.test.mjs` |

Reused, not duplicated: Clerk sign-in (same accounts as the app), the `requesting_user_id()` / `is_site_admin()` helpers, the `profiles` and `completions` tables, the team admin's Clerk + Supabase pattern, the design tokens and the `giveaways` storage bucket pattern of the `team` bucket.

## Lifecycle

Stored `status`: `draft`, `scheduled`, `active`, `paused`, `completed`, `cancelled`. The **effective phase** also uses the server clock (`giveaway_phase`): `scheduled`/`active` become `scheduled` before `starts_at`, `active` inside the window and `ended` from `ends_at` on. No cron is needed: visibility and entry are decided on every request, from the database clock.

| Transition | Rule (trigger `giveaway_campaign_guard`) |
|---|---|
| new campaign | always `draft` |
| `draft` → `scheduled`/`active` | title, description, prize, rules filled; end date in the future; **all five checklist items ticked** |
| `scheduled` → `active`/`paused`/`cancelled`; `active` → `paused`/`completed`/`cancelled`; `paused` → `active`/`completed`/`cancelled` | allowed |
| `completed`, `cancelled` | final |
| cancel after publication | a public reason is required |
| slug | locked after publication (it is printed in QR codes) |
| eligibility | locked once anyone entered |
| delete | admins, drafts only |

Public behaviour: draft never visible. `scheduled`/`active`/`ended`/`completed` visible. `paused` visible or hidden per campaign (`paused_visibility`); a hidden paused campaign still answers its link with only "în pauză". `cancelled` is not listed but its link shows the cancellation notice, so a printed QR never breaks. Entry is possible only in phase `active`, below `max_entries`.

## Eligibility, rules and legal

Supported conditions only (`eligibility` json): `requireOnboarded`, `minCheckins` (0–100), `requireAttestation` (default true). Plus, always, acceptance of the official rules. The attestation is the player's own confirmation that they meet the age and residence conditions of the rules; **the system does not verify age or location** and stores no personal data for it (only the timestamp). No friend-spamming, posting or extra personal data is required and no referral mechanic exists (the `referral` source is only a label for links).

The admin page requires the organizer's five-point review before publishing (rules, eligibility, prize conditions, data processing, minors) and says plainly that Molted does not guarantee legal compliance. **The official rules are written by the organizer; nothing here is legal advice.** Before the first real campaign: have the rules, the age condition (and parental consent if minors may enter), prize/tax terms and the data processing (information, retention, partners) reviewed under Romanian and EU law, and update the privacy policy if the campaign changes what is processed.

## Entering

`enter_giveaway(slug, accept_rules, attest, source, medium)` (signed-in only) checks, in order: authenticated, campaign exists and is public, already entered (returns `already_entered`), phase open, profile exists, rules accepted, attestation, onboarding, minimum check-ins, entry cap. One entry per player and campaign is a database unique constraint. Errors are stable codes (`not_started`, `paused`, `ended`, `cancelled`, `full`, `no_profile`, `rules_not_accepted`, `attestation_required`, `not_onboarded`, `not_enough_checkins`, …) mapped to Romanian text in `giveaway-core.js`; raw database messages never reach the player. The page shows "Ești înscris" only after re-reading the state from the database.

Sign-in uses Clerk on the landing, with `fallbackRedirectUrl` set to the same campaign URL, so the player returns to the campaign afterwards. A brand-new account still has to finish onboarding in the app (`no_profile` / `not_onboarded` explain this) before it can enter a campaign that requires it.

## QR destinations and attribution

Destination: `https://www.molted.eu/ro/giveaways/<slug>/?utm_source=<source>&utm_medium=<medium>&utm_campaign=<slug>`. Allowed `source`: `plato_print`, `plao_streetball`, `poster`, `event`, `social`, `referral`. Allowed `medium`: `qr`, `link`, `print`, `social`. Anything else is ignored. Nothing personal is ever in a URL. Admins create sources per campaign (optionally tied to a partner), copy the link, and "Verifică destinația" (checks the page answers and that the campaign is public; a draft is flagged "do not print yet"). **QR images are not generated** (the project has no QR library and none was added): make the code from the link in a trusted generator and scan a printed proof before printing. Links keep working after pause or end: the page shows the status.

**Attribution model**
1. A visit with an allowed `utm_*` pair is remembered in the browser (`localStorage`) as the **first touch** for that campaign and valid **7 days**. A later visit from another source does not replace it.
2. Each browser session counts one **visit** (`track_giveaway_visit`: an anonymous counter row, no identifier, so unique visitors are *not* measurable and not claimed). Visits without parameters count as `direct`.
3. When the visitor signs in, the stored source is attached to the account once (`claim_giveaway_attribution`, only if the visit is at most 7 days old). Entries record the source too.
4. Later visits are not attributed to the original scan.

**Funnel** (admin overview, per campaign and source, admins only; partners have no access and see nothing): QR scan → **visits** → **conversions to accounts attributed** (signed in after such a visit) → **new registrations** (profile created after the visit) → **activated** (≥1 habit check-in since the visit) → **returning** (check-ins on ≥2 different days) → **valid entries**. Account creation is never counted as activation. These numbers show a path, not a cause; they do not prove the giveaway changed retention. A visit counter flood guard drops counted visits above 300 per campaign per minute; there is no per-IP rate limit.

## Winners

Only after entries close (phase `ended` or status `completed`). `draw_giveaway_winner` picks on the server (`order by gen_random_uuid()` among valid entries that never had a winner row; nothing from the browser influences it) and records pool size, a digest of the pool and the method in `audit`. Manual selection needs a written reason. A winner can be voided (reason required; the same entry is not drawn again) and entries can be disqualified (which voids their winner). Notification and fulfillment status and private notes are internal. A winner becomes public only through **Anunță public**, with a label typed by an admin (for example "Andrei P."); contact details are never public. Every step goes to `giveaway_audit`. To reach a winner, look up their account id in Clerk.

## Security

- RLS on all nine tables. Players and anon have **no** direct write on any giveaway table; `giveaway_events` and `giveaway_attributions` have no client grants at all. Entries are readable by their owner and admins. Admins are the existing `site_admins` (verified email in the JWT).
- All player-affecting writes and all admin actions on entries/winners go through `security definer` functions with a pinned `search_path`; admin ones call `giveaway_require_admin()`. Service-role keys are never used in the browser (tested).
- The public reads only `get_giveaways()` / `get_giveaway(slug)`, which return public fields (no internal name, notes, checklist, creator, counts).
- Deleting an account deletes its entries (cascade) and attribution (`delete_my_account` was extended); winner/audit rows are kept without the link to the account.
- Supabase's security linter will list the anon-executable `get_giveaway*` and `track_giveaway_visit` functions: that is intended (public reads and the anonymous counter).

## Tests

- `npm test` runs the app tests, the landing tests (routing, SEO, giveaway pages in every visitor state, attribution, lifecycle mirror, escaping, schema guards).
- `supabase/tests/giveaways.sql` covers RLS, lifecycle and date boundaries, duplicate prevention, eligibility, the cap, pause/cancel, winner constraints, attribution, stats, audit and account deletion. It was run against the Momentum project **inside a rolled-back transaction together with the migration** (nothing persisted). After applying 0031, run it again as it is (it also rolls back).

## Deploy

1. Done on Momentum (0031 applied, tests run). For another project: apply `0031_giveaways.sql`, then run `supabase/tests/giveaways.sql`. No Edge Function, secret or cron is needed.
2. Env vars on the `molted-web` Vercel project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` (already used by the team admin). In Clerk, `www.molted.eu` must be allowed for sign-in and sign-up.
3. Merge to `main`. Then check on `www.molted.eu`: `/ro/giveaways/` 200; `/ro/giveaways/<slug>/` serves the campaign (the `vercel.json` rewrite sends every slug to `/ro/giveaways/_shell/`; both slash spellings are configured, but this host behaviour could not be tested before deploy); `/en/giveaways/` and `/en/giveaways/x/` 404; `/ro/giveaways/_shell/` redirects to the list.
4. Create the partners (verified names, texts, logos) and the first campaign as a draft in `/admin/giveaways/`; preview it; tick the legal checklist only after the organizer's real review; schedule or publish.
5. Print QR codes only after "Verifică destinația" says the campaign is public and a printed proof scans to the right page.

## Known limits (honest list)

- **Unknown campaign slugs return HTTP 200**, not 404, because the campaign set is in the database and the host serves a static shell. The page shows "Campania nu a fost găsită" and sets `noindex`. A real 404 needs an edge function or server rendering. Slugs that cannot be valid (characters outside `a-z 0-9 -`, wrong length, extra path segments), and anything under `/en`, do return 404.
- **Per-campaign metadata is set by JavaScript** (title, description, canonical, Open Graph). Search engines that render JavaScript see it; link-preview bots that do not (some social apps) see the generic title. Fixing that needs edge or server rendering. There is no structured data for campaigns on purpose (no prize claims without a source).
- The sitemap lists `/ro/giveaways/` only; campaign pages are discoverable from the list.
- No QR image generation, no email/push notification to winners (status is tracked by hand), no referral mechanic, no unique-visitor count, no per-IP rate limiting, no scheduled job (not needed).
- The legal items above are blockers for the first real campaign, owned by the organizer.
