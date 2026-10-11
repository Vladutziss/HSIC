// Web Push for Molted. Deployed as a Supabase Edge Function without gateway JWT verification
// (Clerk tokens are checked here, like in `ai` and `stats`):
//
//   supabase functions deploy push --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
//
// Body {action: "tick"}      : called every minute by pg_cron. Sends the daily-report push to the devices
//                              due_report_pushes() returns (once per local day). Takes no input, so no auth.
// Body {action: "nudge", id} : called by the client after it inserts a group reminder. Only the sender can
//                              trigger it, only for a recent nudge, and it goes to the recipients' devices.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

webpush.setVapidDetails("https://app.molted.eu", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

type Sub = { endpoint: string; p256dh: string; auth: string };

/** Sends one payload to many devices; devices the push service says are gone are deleted. */
async function send(admin: ReturnType<typeof createClient>, subs: Sub[], payload: unknown) {
  const body = JSON.stringify(payload);
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else console.error("push", code);
      }
    })
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  return subs.length - gone.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { code: "bad_request" });

  let input: { action?: string; id?: string; userId?: string; count?: number };
  try {
    input = await req.json();
  } catch {
    return reply(400, { code: "bad_request" });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (input.action === "tick") {
      const { data, error } = await admin.rpc("due_report_pushes");
      if (error) throw error;
      const sent = data?.length
        ? await send(admin, data, {
            title: "Raportul zilei e gata",
            body: "Deschide Molted și vezi cum ți-a mers azi.",
            url: "/",
            tag: "daily-report",
          })
        : 0;
      return reply(200, { sent });
    }

    // the weekly coach run (supabase/functions/weekly) tells one player that something is waiting
    if (input.action === "agent" && typeof input.userId === "string") {
      const secret = Deno.env.get("AGENT_CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return reply(401, { code: "session_expired" });
      const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", input.userId);
      const n = Number(input.count) || 1;
      const sent = await send(admin, subs ?? [], {
        title: "Coach-ul ți-a pregătit săptămâna",
        body: n === 1 ? "Ai o propunere nouă. Deschide Obiceiuri." : `Ai ${n} propuneri noi. Deschide Obiceiuri.`,
        url: "/",
        tag: "coach-weekly",
      });
      return reply(200, { sent });
    }

    if (input.action === "nudge" && typeof input.id === "string") {
      const auth = req.headers.get("Authorization");
      if (!auth) return reply(401, { code: "session_expired" });
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "", {
        global: { headers: { Authorization: auth } },
      });
      const { data: me, error: authError } = await asUser.rpc("requesting_user_id");
      if (authError || !me) return reply(401, { code: "session_expired" });

      const { data: nudge } = await admin.from("nudges").select("from_user,to_users,text,at").eq("id", input.id).maybeSingle();
      if (!nudge || nudge.from_user !== me || Date.now() - new Date(nudge.at).getTime() > 120_000) return reply(403, { code: "forbidden" });

      const [{ data: profile }, { data: subs }] = await Promise.all([
        admin.from("profiles").select("name").eq("id", me).maybeSingle(),
        admin.from("push_subscriptions").select("endpoint,p256dh,auth").in("user_id", nudge.to_users).eq("group_nudges", true),
      ]);
      const sent = await send(admin, subs ?? [], {
        title: `${profile?.name || "Un prieten"} ți-a trimis un reminder`,
        body: nudge.text,
        url: "/",
        tag: `nudge-${input.id}`,
      });
      return reply(200, { sent });
    }

    return reply(400, { code: "bad_request" });
  } catch (e) {
    console.error("push", e);
    return reply(500, { code: "upstream_error" });
  }
});
