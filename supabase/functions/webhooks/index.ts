// Delivers what migration 0042 puts in the outbox (integration_events): webhooks to the addresses players chose, and
// new reports and reflections to their Notion database. Deployed without gateway JWT verification:
//
//   npm run sync:functions && supabase functions deploy webhooks --no-verify-jwt
//   supabase secrets set INTEGRATIONS_CRON_SECRET=... INTEGRATIONS_SECRET=...   (the cron job is in docs/INTEGRATIONS.md)
//
// POST {action: "run"}  + header x-cron-secret   every minute from pg_cron: claims due rows, delivers, records results.
// POST {action: "test", id} + the player's token sends a signed "ping" to one of their own addresses, now.
//
// Rules (signing, what each event says, which addresses may be called): ../_shared/webhooks-core.js.

import { loadState } from "../_shared/app/remote.js";
import { trFor } from "../_shared/app/i18n.js";
import { deliver, envelope, pingData, processEvent } from "../_shared/webhooks-core.js";
import { adminClient, callerOf, CORS, fail, langOf, reply, syncToNotion } from "../_shared/integrations.ts";

const admin = adminClient();
const BATCH = 40;
const DEADLINE_MS = 50_000; // stop claiming well before the platform's time limit

/** Every address the name leads to, so deliver() can refuse private ones. */
async function resolve(host: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([Deno.resolveDns(host, "A").catch(() => []), Deno.resolveDns(host, "AAAA").catch(() => [])]);
  return [...v4, ...v6];
}
const send = (d: { url: string; secret: string; id: string; body: string }) => deliver({ ...d, resolve });

async function run() {
  const started = Date.now();
  const out = { claimed: 0, delivered: 0, failed: 0, skipped: 0 };
  while (Date.now() - started < DEADLINE_MS) {
    const { data: batch, error } = await admin.rpc("claim_integration_events", { p_limit: BATCH });
    if (error) throw error;
    if (!batch?.length) break;
    out.claimed += batch.length;
    const states = new Map<string, unknown>();
    const deps = {
      state: async (u: string) => (states.has(u) ? states.get(u) : (states.set(u, await loadState(admin, u)), states.get(u))),
      lang: (u: string) => langOf(admin, u),
      review: async (u: string, day: string) => (await admin.from("day_reviews").select("*").eq("user_id", u).eq("day", day).maybeSingle()).data,
      action: async (id: string) => (await admin.from("agent_actions").select("*").eq("id", id).maybeSingle()).data,
      reflection: async (id: string) => (await admin.from("reflections").select("*").eq("id", id).maybeSingle()).data,
      send,
      notion: (u: string, event: string, ref: { day?: string; id?: string }) =>
        event === "report.created" ? syncToNotion(admin, u, { days: [ref.day!], replace: true }) : syncToNotion(admin, u, { reflectionIds: [ref.id!] }),
      tr: trFor,
    };
    for (const ev of batch) {
      let r;
      try {
        r = await processEvent(ev, deps);
      } catch (e) {
        console.error("webhooks event", ev.id, e);
        r = { ok: false, status: null, error: "internal error", retry: true };
      }
      if (r.skipped) out.skipped++;
      else if (r.ok) out.delivered++;
      else out.failed++;
      const { error: recErr } = await admin.rpc("record_integration_result", { p_id: ev.id, p_ok: r.ok, p_status: r.status, p_error: r.error, p_retry: r.retry });
      if (recErr) console.error("webhooks record", ev.id, recErr);
    }
    if (batch.length < BATCH) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request");
  const input = await req.json().catch(() => ({}));

  if (input?.action === "run") {
    const secret = Deno.env.get("INTEGRATIONS_CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return fail(401, "session_expired");
    try {
      return reply(200, await run());
    } catch (e) {
      console.error("webhooks run", e);
      return fail(500, "upstream_error");
    }
  }

  if (input?.action === "test" && typeof input.id === "string") {
    const me = await callerOf(req);
    if (!me) return fail(401, "session_expired");
    const { data: ep } = await admin.from("webhook_endpoints").select("id, url, secret, last_test_at").eq("id", input.id).eq("user_id", me).maybeSingle();
    if (!ep) return fail(404, "not_found");
    if (ep.last_test_at && Date.now() - Date.parse(ep.last_test_at) < 10_000) return fail(429, "rate_limited");
    await admin.from("webhook_endpoints").update({ last_test_at: new Date().toISOString() }).eq("id", ep.id);
    const id = `test_${crypto.randomUUID()}`;
    const r = await send({ url: ep.url, secret: ep.secret, id, body: JSON.stringify(envelope(id, "ping", new Date().toISOString(), pingData())) });
    await admin.from("webhook_endpoints").update({ last_status: r.status, last_error: r.ok ? null : r.error }).eq("id", ep.id);
    return reply(200, r);
  }

  return fail(400, "bad_request");
});
