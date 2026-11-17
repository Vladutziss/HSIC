import { test } from "node:test";
import assert from "node:assert/strict";
import { processEvent } from "../../../supabase/functions/_shared/webhooks-core.js";
import { trFor } from "../../../supabase/functions/_shared/app/i18n.js";

const state = { meta: { start: "2026-11-10" }, habits: [{ id: "h1", name: "Citit", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], createdAt: "2026-11-10" }], log: { "2026-11-16": { h1: 1 } }, todos: [] };
const deps = (over = {}) => {
  const sent = [];
  return {
    sent,
    state: async () => state,
    lang: async () => "en",
    review: async (u, day) => ({ day, ai_score: 70, summary: "Good day.", highlight: "Reading", tip: "Again." }),
    action: async (id) => (id === "a1" ? { id: "a1", run_id: "ui-1", kind: "create_todo", status: "applied", payload: { title: "T" }, reason: "r" } : null),
    reflection: async () => null,
    send: async (d) => (sent.push(d), { ok: true, status: 200, error: null }),
    notion: async (u, event) => ({ ok: true, status: 200, error: null, retry: true, event }),
    tr: trFor,
    ...over,
  };
};
const ev = (over) => ({ id: "e1", user_id: "u1", target: "webhook", endpoint_id: "w1", url: "https://h.example.com/x", secret: "whsec_c2VjcmV0", endpoint_active: true, created_at: "2026-11-16T18:00:00Z", ...over });

test("each event becomes one signed envelope with what the database holds now", async () => {
  const d = deps();
  assert.equal((await processEvent(ev({ event: "habit.checked", ref: { habit_id: "h1", day: "2026-11-16" } }), d)).ok, true);
  const body = JSON.parse(d.sent[0].body);
  assert.deepEqual([body.id, body.type, body.created_at, body.data.habit.name], ["e1", "habit.checked", "2026-11-16T18:00:00Z", "Citit"]);
  assert.equal(d.sent[0].id, "e1");
  await processEvent(ev({ event: "report.created", ref: { day: "2026-11-16" } }), d);
  assert.ok(JSON.parse(d.sent[1].body).data.markdown.includes("## Evening report"));
  await processEvent(ev({ event: "plan.applied", ref: { action_id: "a1" } }), d);
  assert.equal(JSON.parse(d.sent[2].body).data.action.title, "T");
});

test("gone things are skipped, switched-off or refused addresses are not retried, Notion rows go to Notion", async () => {
  const d = deps();
  assert.deepEqual(await processEvent(ev({ event: "habit.checked", ref: { habit_id: "h1", day: "2026-11-15" } }), d), { ok: true, status: null, error: null, retry: false, skipped: true });
  assert.equal((await processEvent(ev({ event: "reflection.created", ref: { id: "r9" } }), d)).skipped, true);
  assert.equal(d.sent.length, 0);
  assert.equal((await processEvent(ev({ event: "habit.checked", endpoint_active: false }), d)).retry, false);
  assert.equal((await processEvent(ev({ event: "habit.checked", endpoint_id: null, url: null }), d)).retry, false);
  const refused = deps({ send: async () => ({ ok: false, status: null, error: "address not allowed (private)" }) });
  assert.equal((await processEvent(ev({ event: "habit.checked", ref: { habit_id: "h1", day: "2026-11-16" } }), refused)).retry, false);
  const down = deps({ send: async () => ({ ok: false, status: 503, error: "HTTP 503" }) });
  assert.equal((await processEvent(ev({ event: "habit.checked", ref: { habit_id: "h1", day: "2026-11-16" } }), down)).retry, true);
  assert.equal((await processEvent(ev({ target: "notion", endpoint_id: null, event: "report.created", ref: { day: "2026-11-16" } }), d)).event, "report.created");
});
