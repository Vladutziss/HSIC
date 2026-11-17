// Notion for Molted: the player connects their workspace once, then every new evening report and weekly reflection is
// written as a page in a "Molted" database (by `webhooks`, from the outbox). Deployed without gateway JWT verification,
// because Notion sends the browser back here without a Supabase session:
//
//   npm run sync:functions && supabase functions deploy notion --no-verify-jwt
//   supabase secrets set NOTION_CLIENT_ID=... NOTION_CLIENT_SECRET=... INTEGRATIONS_SECRET=...
//   (optional) NOTION_REDIRECT_URI=https://<project>.supabase.co/functions/v1/notion   APP_URL=https://app.molted.eu
//
// POST {action: "start"}       + player token -> {url}: the Notion page where they choose what Molted may see
// GET  ?code=…&state=…          Notion's answer: token exchanged, encrypted, stored; the database found or made;
//                               the browser goes back to the app (…/?notion=connected | needs_page | error)
// POST {action: "setup"}       + player token -> look for (or make) the database again, after sharing a page
// POST {action: "sync", days}  + player token -> write the reports of the last `days` (≤ 60) and the reflections
// POST {action: "disconnect"}  + player token -> token revoked at Notion, everything about it deleted here
//
// Rules (state, encryption, blocks): ../_shared/notion-core.js. Requests to Notion: ../_shared/notion-api.js.

import { authorizeUrl, decryptToken, encryptToken, makeState, readState } from "../_shared/notion-core.js";
import { exchangeCode, findOrCreateDatabase, notionClient, revokeToken } from "../_shared/notion-api.js";
import { adminClient, callerOf, CORS, fail, langOf, reply, syncToNotion } from "../_shared/integrations.ts";

const admin = adminClient();
const env = (k: string) => Deno.env.get(k) ?? "";
const APP = env("APP_URL") || "https://app.molted.eu";
const redirectUri = () => env("NOTION_REDIRECT_URI") || `${env("SUPABASE_URL")}/functions/v1/notion`;
const back = (status: string) => Response.redirect(`${APP}/?notion=${status}`, 302);

async function setupDatabase(userId: string): Promise<"connected" | "needs_page"> {
  const { data: conn } = await admin.from("notion_connections").select("access_token").eq("user_id", userId).maybeSingle();
  const token = conn ? await decryptToken(env("INTEGRATIONS_SECRET"), conn.access_token) : null;
  if (!token) throw new Error("no usable token");
  const db = await findOrCreateDatabase(notionClient(token), { lang: await langOf(admin, userId) });
  await admin.from("notion_connections").update({ database_id: db?.id ?? null, database_url: db?.url ?? null, last_error: db ? null : "needs_page" }).eq("user_id", userId);
  return db ? "connected" : "needs_page";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const configured = env("NOTION_CLIENT_ID") && env("NOTION_CLIENT_SECRET") && env("INTEGRATIONS_SECRET");

  // ---- the browser, back from Notion
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (!configured) return back("error");
    if (url.searchParams.get("error")) return back("cancelled"); // the player said no on Notion's page
    const userId = await readState(env("INTEGRATIONS_SECRET"), url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!userId || !code) return back("error");
    try {
      const t = await exchangeCode({ clientId: env("NOTION_CLIENT_ID"), clientSecret: env("NOTION_CLIENT_SECRET"), code, redirectUri: redirectUri() });
      const { error } = await admin.from("notion_connections").upsert({
        user_id: userId,
        access_token: await encryptToken(env("INTEGRATIONS_SECRET"), t.accessToken),
        workspace_id: t.workspaceId,
        workspace_name: (t.workspaceName ?? "").slice(0, 100) || null,
        bot_id: t.botId,
        database_id: null,
        database_url: null,
        last_error: null,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      return back(await setupDatabase(userId));
    } catch (e) {
      console.error("notion callback", e);
      return back("error");
    }
  }

  if (req.method !== "POST") return fail(405, "bad_request");
  if (!configured) return fail(503, "unavailable");
  const me = await callerOf(req);
  if (!me) return fail(401, "session_expired");
  const input = await req.json().catch(() => ({}));

  try {
    switch (input?.action) {
      case "start":
        return reply(200, { url: authorizeUrl({ clientId: env("NOTION_CLIENT_ID"), redirectUri: redirectUri(), state: await makeState(env("INTEGRATIONS_SECRET"), me) }) });
      case "setup":
        return reply(200, { status: await setupDatabase(me) });
      case "sync": {
        const days = Math.min(60, Math.max(1, Math.round(Number(input.days) || 30)));
        const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
        const [{ data: reviews }, { data: reflections }] = await Promise.all([
          admin.from("day_reviews").select("day").eq("user_id", me).gte("day", from).not("summary", "is", null),
          admin.from("reflections").select("id").eq("user_id", me).gte("created_at", from),
        ]);
        const r = await syncToNotion(admin, me, { days: (reviews ?? []).map((x) => x.day), reflectionIds: (reflections ?? []).map((x) => x.id) });
        return r.ok ? reply(200, { written: r.written ?? 0 }) : reply(502, { code: r.error === "not connected" ? "not_connected" : "upstream_error", detail: r.error });
      }
      case "disconnect": {
        const { data: conn } = await admin.from("notion_connections").select("access_token").eq("user_id", me).maybeSingle();
        const token = conn ? await decryptToken(env("INTEGRATIONS_SECRET"), conn.access_token) : null;
        if (token) await revokeToken({ clientId: env("NOTION_CLIENT_ID"), clientSecret: env("NOTION_CLIENT_SECRET"), token });
        await admin.from("notion_connections").delete().eq("user_id", me); // notion_pages and waiting writes go with it
        await admin.from("integration_events").delete().eq("user_id", me).eq("target", "notion").eq("status", "pending");
        return reply(200, { ok: true });
      }
      default:
        return fail(400, "bad_request");
    }
  } catch (e) {
    console.error("notion", input?.action, e);
    return fail(500, "upstream_error");
  }
});
