// The daily email job: retention sequence and reactivation (see _shared/campaigns-core.js for the rules and docs/EMAILS.md).
// Deployed without gateway JWT verification and called by pg_cron with a shared secret:
//
//   npm run build:emails && supabase functions deploy campaigns --no-verify-jwt
//   supabase secrets set CAMPAIGNS_SECRET=...        (the same value goes in the cron job, see docs/EMAILS.md)
//   supabase secrets set CAMPAIGNS_ENABLED=true      (the feature flag: without it NOTHING is ever sent)
//
// Body (all optional):
//   {}                      dry run unless CAMPAIGNS_ENABLED=true; then it sends for real
//   {"dry_run": true}       never sends; reports who would get what (player ids, no addresses)
//   {"test_to": "a@b.c", "campaign": "reactivation", "lang": "ro", "variant": "a"}
//                           sends ONE sample email (fake name, no real player, nothing logged) to that address only
//
// Sending is claim-then-send: claim_email_sends() reserves the log rows (and re-checks consent, bounces and the 7-day gap
// in the same statement), so running the job twice cannot mail anyone twice.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.34.1";
import { CAMPAIGN_TYPES, CONFIG, chunk, selectAudience, withBackoff } from "../_shared/campaigns-core.js";
import { CONTACT, FROM, fillTemplate, headersFor, sampleValues, valuesFor } from "../_shared/email-render.js";
import { TEMPLATES } from "../_shared/email-templates.generated.js";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Row = { user_id: string; lang: string; name: string; [k: string]: unknown };
type ClerkUser = {
  id: string;
  primary_email_address_id: string | null;
  email_addresses: Array<{ id: string; email_address: string; verification?: { status?: string } | null }>;
  last_active_at: number | null;
  last_sign_in_at: number | null;
};

async function loadCandidates(admin: ReturnType<typeof createClient>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.rpc("email_candidates").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const tags = (type: string, version: string, variant: string) => [
  { name: "campaign", value: type },
  { name: "version", value: version },
  { name: "variant", value: variant },
];

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { code: "bad_request" });
  const secret = Deno.env.get("CAMPAIGNS_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return reply(401, { code: "session_expired" });

  const input = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("RESEND_API_KEY");

  try {
    // ---- fill in the address (and "last seen") of players who have not signed in since migration 0032
    if (input.backfill === true) {
      const clerkKey = Deno.env.get("CLERK_SECRET_KEY");
      if (!clerkKey) return reply(500, { code: "upstream_error", error: "no CLERK_SECRET_KEY" });
      const users: ClerkUser[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await fetch(`https://api.clerk.com/v1/users?limit=500&offset=${offset}&order_by=-created_at`, { headers: { Authorization: `Bearer ${clerkKey}` } });
        if (!r.ok) return reply(502, { code: "upstream_error", error: `clerk ${r.status}` });
        const page: ClerkUser[] = await r.json();
        users.push(...page);
        if (page.length < 500) break;
      }
      const { data: pending, error } = await admin.from("email_preferences").select("user_id,email,last_active_at").is("email", null);
      if (error) throw error;
      const byId = new Map(users.map((u) => [u.id, u]));
      let matched = 0;
      let updated = 0;
      let noVerifiedEmail = 0;
      for (const p of pending ?? []) {
        const u = byId.get(p.user_id);
        if (!u) continue;
        matched++;
        const primary = (u.email_addresses ?? []).find((e) => e.id === u.primary_email_address_id);
        if (!primary || primary.verification?.status !== "verified") {
          noVerifiedEmail++;
          continue;
        }
        const seen = u.last_active_at ?? u.last_sign_in_at;
        const patch: Record<string, unknown> = { email: primary.email_address.trim().toLowerCase(), updated_at: new Date().toISOString() };
        if (!p.last_active_at && seen) patch.last_active_at = new Date(seen).toISOString();
        if (input.dry_run !== true) {
          const { error: e } = await admin.from("email_preferences").update(patch).eq("user_id", p.user_id).is("email", null);
          if (e) throw e;
        }
        updated++;
      }
      return reply(200, { mode: "backfill", dry_run: input.dry_run === true, clerk_users: users.length, without_address: (pending ?? []).length, matched, updated, no_verified_email: noVerifiedEmail });
    }

    // ---- one sample email to an address the caller names
    if (typeof input.test_to === "string") {
      if (!apiKey) return reply(500, { code: "upstream_error", error: "no RESEND_API_KEY" });
      const type = CAMPAIGN_TYPES.includes(input.campaign) ? input.campaign : "reactivation";
      const lang = input.lang === "en" ? "en" : "ro";
      const variant = input.variant === "b" ? "b" : "a";
      const t = TEMPLATES[type][lang];
      const values = sampleValues(lang);
      // a test may name its sender, but only on our own domains (used while a new sending domain is being verified)
      const from = typeof input.from === "string" && /^[^<>]*<?[\w.+-]+@(mail\.)?molted\.eu>?$/.test(input.from) ? input.from : FROM;
      const { data, error } = await new Resend(apiKey).emails.send({
        from,
        to: [input.test_to],
        replyTo: CONTACT,
        subject: `[TEST ${type} ${lang}/${variant}] ${t.subjects[variant]}`,
        html: fillTemplate(t.html, values, { html: true }),
        text: fillTemplate(t.text, values),
        headers: headersFor("0".repeat(64), lang),
        tags: tags(type, CONFIG.templateVersion, variant),
      });
      return reply(error ? 502 : 200, { ok: !error, id: data?.id, error: error?.message });
    }

    // ---- the real run
    const live = Deno.env.get("CAMPAIGNS_ENABLED") === "true" && input.dry_run !== true;
    const rows = await loadCandidates(admin);
    const { items, skipped } = selectAudience(rows, new Date());
    const byType: Record<string, number> = {};
    for (const i of items) byType[i.campaign_type] = (byType[i.campaign_type] || 0) + 1;

    if (!live) {
      return reply(200, {
        mode: "dry_run",
        flag: Deno.env.get("CAMPAIGNS_ENABLED") === "true",
        candidates: rows.length,
        would_send: items.length,
        by_type: byType,
        skipped,
        sample: items.slice(0, 20).map((i) => ({ user: i.user_id.slice(0, 10), type: i.campaign_type, variant: i.variant })),
      });
    }
    if (!apiKey) return reply(500, { code: "upstream_error", error: "no RESEND_API_KEY" });
    const resend = new Resend(apiKey);
    const byUser = new Map(rows.map((r) => [r.user_id, r]));

    // reserve first: only what comes back from here is sent
    const claimed: Array<{ log_id: number; user_id: string; email: string; token: string; campaign_type: string; variant: string; template_version: string }> = [];
    for (const part of chunk(items, 500)) {
      const { data, error } = await admin.rpc("claim_email_sends", { p_items: part, p_min_gap_days: CONFIG.minGapDays });
      if (error) throw error;
      claimed.push(...(data ?? []));
    }

    let sent = 0;
    let failed = 0;
    for (const batch of chunk(claimed, CONFIG.batchSize)) {
      const messages = batch.map((c) => {
        const row = byUser.get(c.user_id)!;
        const lang = row.lang === "en" ? "en" : "ro";
        const t = TEMPLATES[c.campaign_type][lang];
        const values = valuesFor({ lang, name: row.name, email: c.email, token: c.token });
        return {
          from: FROM,
          to: [c.email],
          replyTo: CONTACT,
          subject: t.subjects[c.variant] ?? t.subjects.a,
          html: fillTemplate(t.html, values, { html: true }),
          text: fillTemplate(t.text, values),
          headers: headersFor(c.token, lang),
          tags: tags(c.campaign_type, c.template_version, c.variant),
        };
      });
      const key = `campaigns-${batch[0].log_id}-${batch[batch.length - 1].log_id}-${batch.length}`;
      try {
        const result = await withBackoff(async () => {
          const { data, error } = await resend.batch.send(messages, { idempotencyKey: key });
          if (error) throw Object.assign(new Error(error.message), { statusCode: (error as { statusCode?: number }).statusCode, name: error.name });
          return data;
        });
        const ids: Array<{ id: string }> = result?.data ?? [];
        await Promise.all(batch.map((c, i) =>
          admin.from("email_log").update(ids[i]?.id ? { status: "sent", resend_email_id: ids[i].id } : { status: "failed", error: "no id returned" }).eq("id", c.log_id)
        ));
        sent += ids.length;
        failed += batch.length - ids.length;
      } catch (e) {
        const message = String((e as Error)?.message ?? e).slice(0, 300);
        console.error("campaigns batch", message);
        await admin.from("email_log").update({ status: "failed", error: message }).in("id", batch.map((c) => c.log_id));
        failed += batch.length;
      }
    }
    return reply(200, { mode: "live", candidates: rows.length, selected: items.length, claimed: claimed.length, sent, failed, by_type: byType, skipped });
  } catch (e) {
    console.error("campaigns", e);
    return reply(500, { code: "upstream_error" });
  }
});
