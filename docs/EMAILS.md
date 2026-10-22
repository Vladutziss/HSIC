# Emails from Molted (retention and reactivation)

Two campaigns, sent through Resend from `Molted <noreply@molted.eu>` (reply-to `molted.app@gmail.com`). Everything is behind a feature flag: **nothing is sent until `CAMPAIGNS_ENABLED=true` is set as a Supabase secret.**

## What is sent, and when

Delays are counted from sign-up. The job runs once a day and looks at the player's behaviour *at send time*, so a player who unsubscribed, came back or ticked something in between is handled correctly (this is why it is a daily job and not messages scheduled in advance with `scheduledAt`: a scheduled message does not know about an unsubscribe unless you cancel it, and Resend schedules at most about a month ahead).

| Campaign | Email (`campaign_type`) | When | Who |
|---|---|---|---|
| Retention | `onboarding_nudge` | day 2 (until day 14) | no tick yet. Goal: the first check-in. |
| Retention | `quick_win` | day 9 (until day 30) | has started ticking. One technique ("after X I do Y", Gollwitzer 1999). |
| Retention | `feature_tour` | day 16 (until day 45) | active in the last 14 days. Coach AI and groups. |
| Retention | `feedback` | day 35 (until day 90) | active in the last 14 days. One question, answered by replying. |
| Reactivation | `reactivation` | 14 days with no sign of life | **one email, ever.** Molt sleeps, nothing is lost, what is new. |

Why these days: day 2 is after the sign-up is forgotten but while the egg is still fresh; day 9 is the end of week one, when a first rhythm exists; day 16 and 35 keep the 7-day gap and the 3-in-30-days ceiling (the privacy policy promises exactly that) while spreading the asks. Reactivation waits two weeks: the character has been asleep long enough for the message to be true. There is no discount and no countdown (the app is free), and no "last chance" step: after the one reactivation email the player is left alone (sunset) unless they come back.

Caps (all in `supabase/functions/_shared/campaigns-core.js`, `CONFIG`): at most **one email per player per 7 days**, at most **3 in 30 days**; a step whose window passed is skipped, not sent out of context; each step at most once per player.

## Consent and unsubscribing

- Everybody is opted in by default (`email_preferences.marketing_enabled`, migration 0032, backfill included). New players see an optional, pre-ticked box on the sign-up form and can untick it; the choice is stored in the Clerk user (`unsafeMetadata.legal.emails`) and copied to the database when the row is created.
- Ways out, all immediate: the **Dezabonează-te** link in every email (page `apps/app/public/unsubscribe.html`, one button, no login), the **List-Unsubscribe / List-Unsubscribe-Post** headers (RFC 8058, one-click POST to `functions/v1/email?a=unsub`), the toggle in **Setări → Emailuri**, a permanent bounce or a spam complaint (Resend webhook). The link page asks for one click on purpose: a mail scanner that opens the URL must not unsubscribe anyone.
- The database is the source of truth. `claim_email_sends()` re-checks consent, bounce flag and the 7-day gap in the statement that reserves a send, so a player who unsubscribed a second ago is never mailed.
- No open or click tracking (domain created with both off). The webhook only handles `delivered`, `bounced`, `complained`.
- The email address is not in our database until the player signs in once after migration 0032: the app calls `sync_email_profile()` and the database reads the verified `email` claim of the Clerk token. Players who have not signed in since then get their address from the Clerk API instead: with the `CLERK_SECRET_KEY` secret set, POST `{"backfill": true}` (add `"dry_run": true` to only count) to `functions/v1/campaigns`. It fills only empty addresses, only verified primary ones, and the "last seen" time from Clerk, and it never overwrites a value. Done once on 2026-10-21: 40 of the 48 profiles matched a live Clerk user; the other 8 have no address and are never emailed. Run it again after a burst of sign-ups if the daily app sync has not caught them.

## Files

- `supabase/migrations/0032_email.sql`, `0033_email_steps.sql`: tables `email_preferences`, `email_log`, RPCs. `0034_email_cron.sql`: the daily schedule (**not applied**).
- `supabase/functions/_shared/campaigns-core.js`: rules and caps. `email-render.js`: placeholders, links, headers. `svix.js`: webhook signature. `email-templates.generated.js`: generated.
- `supabase/functions/campaigns`: the daily job. `supabase/functions/email`: unsubscribe endpoint and Resend webhook.
- `scripts/emails/`: copy (`copy.js`, RO and EN, two subject variants each) and the React Email layout. `npm run build:emails` regenerates the templates; `npm run preview:emails` also writes HTML files to `scripts/emails/preview/` to open in a browser.
- Tests: `apps/app/tests/campaigns.test.mjs` (rules, caps, templates, signature), `supabase/tests/email.sql` (consent, claims, privacy of the tables; run in a rolled-back transaction).

## Running it

```bash
npm run build:emails                      # after any change in scripts/emails; commit the generated file
npx supabase functions deploy campaigns --no-verify-jwt --use-api
npx supabase functions deploy email --no-verify-jwt --use-api
```

Dry run (never sends; reports counts and a sample of player ids): POST to `functions/v1/campaigns` with header `x-cron-secret: <CAMPAIGNS_SECRET>` and body `{}` while the flag is off, or `{"dry_run": true}` any time.

One sample email to an address you name (fake name, nothing logged): body `{"test_to": "you@example.com", "campaign": "reactivation", "lang": "ro", "variant": "a"}`. It needs `molted.eu` verified in Resend.

## What is still manual

1. **DNS** at Namecheap (Advanced DNS). The sending domain is `molted.eu` itself, verified in Resend with these records (Host is the part before `.molted.eu`): TXT `resend._domainkey` (the DKIM value Resend shows), MX `send` → `feedback-smtp.eu-west-1.amazonses.com` priority 10 (Mail Settings → Custom MX), TXT `send` → `v=spf1 include:amazonses.com ~all`, CNAME `rsend` → `send.forge.rmta.net`.
   - Still to add: TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:molted.app@gmail.com` (monitoring mode, tighten later).
   - Heads-up: switching Namecheap's Mail Settings to *Custom MX* (needed for the `send` MX) removed the registrar's email-forwarding MX and SPF records on the root. If addresses @molted.eu forwarded somewhere, re-add as Custom MX `@` → `eforward1..5.registrar-servers.com` and a root TXT `v=spf1 include:spf.efwd.registrar-servers.com ~all`.
2. **Cron**: replace the placeholder in `0034_email_cron.sql` with the `CAMPAIGNS_SECRET` value and run it.
3. **Switch on**: `supabase secrets set CAMPAIGNS_ENABLED=true` (only after DNS is verified and a test email looked right).
4. Secrets already set: `RESEND_API_KEY`, `CAMPAIGNS_SECRET`, `RESEND_WEBHOOK_SECRET`. The Resend webhook points at `functions/v1/email?a=webhook` (events: delivered, bounced, complained).
5. A legal postal address is not in the footer, because Molted has no legal entity yet: the footer carries the team name and the contact email. Add the address to `FOOTER` in `scripts/emails/copy.js` when there is one.
6. Stale `pending` rows in `email_log` mean a run died between reserving and sending; they block that step for that player (so nobody is mailed twice) until you set them to `failed` by hand.
