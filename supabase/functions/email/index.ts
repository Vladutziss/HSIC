// The public side of the emails from Molted. Deployed without gateway JWT verification, because its callers are mail
// clients and Resend, not signed-in players:
//
//   supabase functions deploy email --no-verify-jwt
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...     (shown once when the webhook is created in Resend)
//
// POST ?a=unsub&t=<token>   One-click unsubscribe. Called by mail clients through the List-Unsubscribe-Post header
//                           (RFC 8058, form body "List-Unsubscribe=One-Click") and by app.molted.eu/unsubscribe.html
//                           (JSON body {"t": "<token>"}). Needs no login: the token is the credential. Idempotent.
// GET  ?a=unsub&t=<token>   Sends a browser to the unsubscribe page. It never changes anything, so a link scanner that
//                           opens the URL cannot unsubscribe a player by accident.
// POST ?a=webhook           Resend events, signature checked (svix). Delivered: noted in the log. Bounced (permanent)
//                           and complained: the player is opted out at once, so a dead or angry address is never mailed again.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifySvix } from "../_shared/svix.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APP = "https://app.molted.eu";
const TOKEN = /^[a-f0-9]{64}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("a");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (action === "unsub") {
      const fromQuery = url.searchParams.get("t") ?? "";
      if (req.method === "GET") {
        const lang = url.searchParams.get("lang") === "en" ? "en" : "ro";
        return Response.redirect(`${APP}/unsubscribe.html?t=${encodeURIComponent(fromQuery)}&lang=${lang}`, 302);
      }
      if (req.method !== "POST") return reply(405, { code: "bad_request" });
      const raw = await req.text();
      let token = fromQuery;
      let source = "header";
      if ((req.headers.get("content-type") ?? "").includes("application/json")) {
        try {
          token = String(JSON.parse(raw)?.t ?? fromQuery);
        } catch {
          return reply(400, { code: "bad_request" });
        }
        source = "link";
      }
      if (!TOKEN.test(token)) return reply(400, { code: "bad_request" });
      const { data, error } = await admin.rpc("unsubscribe_by_token", { p_token: token, p_source: source });
      if (error) throw error;
      return reply(200, { ok: true, found: data === true });
    }

    if (action === "webhook" && req.method === "POST") {
      const body = await req.text();
      if (!(await verifySvix(req.headers, body, Deno.env.get("RESEND_WEBHOOK_SECRET") ?? ""))) return reply(401, { code: "bad_signature" });
      const evt = JSON.parse(body);
      const emailId = evt?.data?.email_id;
      if (typeof emailId !== "string") return reply(200, { ignored: true });
      const { data: row } = await admin.from("email_log").select("id,user_id").eq("resend_email_id", emailId).maybeSingle();
      if (!row) return reply(200, { ignored: true }); // not one of the campaign emails (or not logged yet)
      const now = new Date().toISOString();

      if (evt.type === "email.delivered") {
        await admin.from("email_log").update({ status: "delivered" }).eq("id", row.id).eq("status", "sent");
      } else if (evt.type === "email.bounced") {
        const permanent = evt?.data?.bounce?.type !== "Transient"; // a full mailbox may recover; anything else will not
        await admin.from("email_log").update({ status: "bounced", error: evt?.data?.bounce?.message?.slice(0, 300) ?? null }).eq("id", row.id);
        if (permanent) {
          await admin.from("email_preferences").update({ bounced_at: now, updated_at: now }).eq("user_id", row.user_id);
          await admin.from("email_preferences")
            .update({ marketing_enabled: false, unsubscribed_at: now, unsubscribe_source: "bounce" })
            .eq("user_id", row.user_id).eq("marketing_enabled", true);
        }
      } else if (evt.type === "email.complained") {
        await admin.from("email_log").update({ status: "complained" }).eq("id", row.id);
        await admin.from("email_preferences")
          .update({ marketing_enabled: false, unsubscribed_at: now, unsubscribe_source: "complaint", updated_at: now })
          .eq("user_id", row.user_id).eq("marketing_enabled", true);
      }
      return reply(200, { ok: true });
    }

    return reply(400, { code: "bad_request" });
  } catch (e) {
    console.error("email", e);
    return reply(500, { code: "upstream_error" });
  }
});
