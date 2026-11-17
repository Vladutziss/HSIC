// The MCP server of Molted: AI agents the player connects (Claude, ChatGPT, ...) read that player's data and propose
// actions the player confirms in the app. Deployed without gateway JWT verification (callers bring a Molted token,
// not a Supabase session):
//
//   npm run sync:functions && supabase functions deploy mcp --no-verify-jwt
//   (migration 0042_integrations.sql)
//
// Address for the agent: https://<project>.supabase.co/functions/v1/mcp, header "Authorization: Bearer mlt_...".
// The protocol, the tools and what a token can and cannot do: ../_shared/mcp-core.js.

import { loadState } from "../_shared/app/remote.js";
import { handleMcp } from "../_shared/mcp-core.js";
import { adminClient } from "../_shared/integrations.ts";

const admin = adminClient();

// Every query below names the user: the service role bypasses RLS, so these filters are what keeps players apart.
const dataFor = (userId: string) => ({
  state: () => loadState(admin, userId),
  review: async (day: string) => (await admin.from("day_reviews").select("day, ai_score, summary, highlight, tip, ai").eq("user_id", userId).eq("day", day).maybeSingle()).data,
  reviews: async (from: string, to: string) =>
    (await admin.from("day_reviews").select("day, ai_score, summary, highlight, tip").eq("user_id", userId).gte("day", from).lte("day", to).not("summary", "is", null).order("day", { ascending: false })).data ?? [],
  reflections: async (limit: number) => (await admin.from("reflections").select("week, created_at, answer, observation, next_step").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)).data ?? [],
  actions: async (limit: number) => (await admin.from("agent_actions").select("id, run_id, kind, status, payload, reason, outcome, created_at, decided_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)).data ?? [],
  agentProposals: async (today: string) =>
    (await admin.from("agent_actions").select("id, run_id, kind, status, payload").eq("user_id", userId).like("run_id", "mcp-%").or(`status.eq.pending,run_id.like.%-${today}`).limit(200)).data ?? [],
  insertAction: async (row: Record<string, unknown>) => {
    const { data, error } = await admin.from("agent_actions").insert({ ...row, user_id: userId }).select("id").single();
    if (error) throw error;
    return data;
  },
});

Deno.serve((req) =>
  handleMcp(req, {
    owner: async (hash: string) => {
      const { data, error } = await admin.rpc("mcp_token_owner", { p_hash: hash });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return r ? { tokenId: r.token_id, userId: r.user_id, name: r.name, canPropose: r.can_propose, tz: r.tz, allowed: r.allowed } : null;
    },
    dataFor,
    now: () => new Date(),
    onError: (e: unknown) => console.error("mcp", e),
  })
);
