// Web Push for Molted. Deployed as a Supabase Edge Function without gateway JWT verification
// (Clerk tokens are checked here, like in `ai` and `stats`):
//
//   supabase functions deploy push --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
//
// Body {action: "tick"}      : called every minute by pg_cron. Sends the daily-report push to the devices
//                              due_report_pushes() returns (once per local day). Takes no input, so no auth.
// Body {action: "exam_reminder", userId, title, text} : the daily run of `weekly` (secret-protected), one exam reminder.
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

/** Sends a notification in each device owner's language (profiles.settings.prefs.lang; Romanian unless it says "en"). */
async function sendLocalized(
  admin: ReturnType<typeof createClient>,
  subs: Sub[],
  payloads: { ro: unknown; en: unknown },
) {
  if (!subs.length) return 0;
  const { data: owners } = await admin.from("push_subscriptions").select("endpoint,user_id").in("endpoint", subs.map((s) => s.endpoint));
  const ids = [...new Set((owners ?? []).map((o: { user_id: string }) => o.user_id))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id,settings").in("id", ids) : { data: [] };
  const english = new Set((profiles ?? []).filter((p: { settings?: { prefs?: { lang?: string } } }) => p.settings?.prefs?.lang === "en").map((p: { id: string }) => p.id));
  const enEndpoints = new Set((owners ?? []).filter((o: { user_id: string }) => english.has(o.user_id)).map((o: { endpoint: string }) => o.endpoint));
  const en = subs.filter((s) => enEndpoints.has(s.endpoint));
  const ro = subs.filter((s) => !enEndpoints.has(s.endpoint));
  return (ro.length ? await send(admin, ro, payloads.ro) : 0) + (en.length ? await send(admin, en, payloads.en) : 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { code: "bad_request" });

  let input: { action?: string; id?: string; userId?: string; count?: number; text?: string; title?: string };
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
        ? await sendLocalized(admin, data, {
            ro: { title: "Raportul zilei e gata", body: "Deschide Molted și vezi cum ți-a mers azi.", url: "/", tag: "daily-report" },
            en: { title: "Your daily report is ready", body: "Open Molted to see how your day went.", url: "/", tag: "daily-report" },
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
      const sent = await sendLocalized(admin, subs ?? [], {
        ro: {
          title: "Coach-ul ți-a pregătit săptămâna",
          body: n === 1 ? "Ai o propunere nouă. Deschide Obiceiuri." : `Ai ${n} propuneri noi. Deschide Obiceiuri.`,
          url: "/",
          tag: "coach-weekly",
        },
        en: {
          title: "Your coach prepared your week",
          body: n === 1 ? "You have a new proposal. Open Habits." : `You have ${n} new proposals. Open Habits.`,
          url: "/",
          tag: "coach-weekly",
        },
      });
      return reply(200, { sent });
    }

    // the daily streak check of the same function: one message, already written by the model
    if (input.action === "coach_nudge" && typeof input.userId === "string" && typeof input.text === "string") {
      const secret = Deno.env.get("AGENT_CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return reply(401, { code: "session_expired" });
      const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", input.userId);
      const body = input.text.slice(0, 200); // already written in the player's language by the weekly function
      const sent = await sendLocalized(admin, subs ?? [], {
        ro: { title: "Molt îți ține seria", body, url: "/", tag: "coach-nudge" },
        en: { title: "Molt is guarding your streak", body, url: "/", tag: "coach-nudge" },
      });
      return reply(200, { sent });
    }

    // the daily exam reminder of the same function: title and text come from a fixed template, already in the player's language
    if (input.action === "exam_reminder" && typeof input.userId === "string" && typeof input.text === "string") {
      const secret = Deno.env.get("AGENT_CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return reply(401, { code: "session_expired" });
      const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", input.userId);
      const title = String(input.title ?? "Molted").slice(0, 80);
      const body = input.text.slice(0, 200);
      const sent = await sendLocalized(admin, subs ?? [], {
        ro: { title, body, url: "/", tag: "exam-reminder" },
        en: { title, body, url: "/", tag: "exam-reminder" },
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

      // the choice is the account's (profiles.settings.pushNudges, on unless it says false), not the device's
      const [{ data: profile }, { data: recipients }] = await Promise.all([
        admin.from("profiles").select("name").eq("id", me).maybeSingle(),
        admin.from("profiles").select("id,settings").in("id", nudge.to_users),
      ]);
      const wanting = (recipients ?? []).filter((r: { settings?: { pushNudges?: unknown } }) => r.settings?.pushNudges !== false).map((r: { id: string }) => r.id);
      const { data: subs } = wanting.length
        ? await admin.from("push_subscriptions").select("endpoint,p256dh,auth").in("user_id", wanting)
        : { data: [] };
      const sent = await sendLocalized(admin, subs ?? [], {
        ro: { title: `${profile?.name || "Un prieten"} ți-a trimis un reminder`, body: nudge.text, url: "/", tag: `nudge-${input.id}` },
        en: { title: `${profile?.name || "A friend"} sent you a reminder`, body: nudge.text, url: "/", tag: `nudge-${input.id}` },
      });
      return reply(200, { sent });
    }

    return reply(400, { code: "bad_request" });
  } catch (e) {
    console.error("push", e);
    return reply(500, { code: "upstream_error" });
  }
});
