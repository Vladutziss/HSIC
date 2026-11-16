import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, PROTOCOL_VERSIONS, READ_TOOLS, buildTools, handleMcp, handleRpc, localDay, sha256Hex, tokenOf, toolList } from "../../../supabase/functions/_shared/mcp-core.js";
import { planApply } from "../src/lib/agentActions.js";

const TODAY = "2026-11-16"; // a Monday
const TOKEN = "mlt_" + "ab12".repeat(12);

const state = () => ({
  profile: { nick: "Ana", goal: "Medalie la olimpiadă", path: "studiu" },
  meta: { start: "2026-10-01" },
  settings: {},
  habits: [
    { id: "h1", name: "Citit", diff: 2, days: [0, 1, 2, 3, 4, 5, 6], time: "07:30", target: "20 pagini", createdAt: "2026-10-01" },
    { id: "h2", name: "Sală", diff: 3, days: [2, 4], createdAt: "2026-10-01" },
    { id: "h3", name: "Vechi", diff: 1, days: [1], createdAt: "2026-10-01", archivedAt: "2026-11-01" },
  ],
  log: { "2026-11-14": { h1: 1 }, "2026-11-15": { h1: 1 }, [TODAY]: { h1: 1 } },
  reviews: { "2026-11-15": { ai: 70, at: "2026-11-15T19:00:00Z" } },
  todos: [
    { id: "t1", title: "Eseu", date: TODAY, time: "16:00", dur: 45, done: false },
    { id: "t2", title: "Gata azi", date: TODAY, done: true, doneOn: TODAY },
    { id: "t3", title: "Restant", date: "2026-11-10", done: false },
    { id: "t4", title: "Cândva", date: null, done: false },
    { id: "t5", title: "Apă", date: "2026-11-01", repeat: { kind: "daily", days: [0, 1, 2, 3, 4, 5, 6], until: null }, doneDays: [] },
  ],
  schoolPlanner: { assignments: [{ id: "a1", title: "Probleme", subject: "Mate", due: "2026-11-19", estimatedMinutes: 60 }], exams: [{ id: "e1", title: "Teză", subject: "Mate", date: "2026-11-25" }] },
  objectives: [{ id: "o1", title: "Termin teoria", why: "Pentru olimpiadă", deadline: "2026-12-20", steps: [{ id: "s1", title: "Cursul 5", done: true, doneOn: "2026-11-12" }, { id: "s2", title: "Cursul 6", done: false }] }],
});

/** A stand-in for the database of one player. */
function fakeData(overrides = {}) {
  const inserted = [];
  const rows = overrides.actions || [];
  return {
    inserted,
    state: async () => ("state" in overrides ? overrides.state : state()),
    review: async (d) => (d === "2026-11-15" ? { day: d, ai_score: 70, summary: "Ai citit.", highlight: "Cititul", tip: "Continuă.", ai: true } : null),
    reviews: async (from, to) => [{ day: "2026-11-15", ai_score: 70, summary: "Ai citit.", highlight: "Cititul", tip: "Continuă." }].filter((r) => r.day >= from && r.day <= to),
    reflections: async (limit) => [{ week: "2026-W46", created_at: "2026-11-13T18:00:00Z", answer: "a", observation: "b", next_step: "c" }].slice(0, limit),
    actions: async (limit) => [...rows, ...inserted].slice(0, limit),
    agentProposals: async () => [...rows, ...inserted].filter((r) => String(r.run_id).startsWith("mcp-")),
    insertAction: async (row) => {
      const made = { id: `act-${inserted.length + 1}`, created_at: "2026-11-16T10:00:00Z", ...row };
      inserted.push(made);
      return { id: made.id };
    },
  };
}
const tools = (data = fakeData(), canPropose = true) => buildTools({ data, today: TODAY, token: { id: "0f1e2d3c-aaaa-bbbb-cccc-000000000000", name: "Claude Desktop", canPropose } });
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

test("the protocol: initialize agrees on a version, tools are listed, unknown things get proper errors", async () => {
  const ctx = { canPropose: true, tools: tools() };
  const init = await handleRpc(rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }), ctx);
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.result.serverInfo.name, "molted");
  assert.match(init.result.instructions, /never change anything\s+yourself/);
  assert.equal((await handleRpc(rpc("initialize", { protocolVersion: "1999-01-01" }), ctx)).result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.deepEqual(await handleRpc(rpc("ping", undefined, "p-1"), ctx), { jsonrpc: "2.0", id: "p-1", result: {} });

  const listed = (await handleRpc(rpc("tools/list"), ctx)).result.tools;
  assert.deepEqual(listed.map((t) => t.name), ["get_overview", "list_habits", "get_day", "list_todos", "get_school", "get_goals", "get_reports", "get_reflections", "get_action_log", "propose_action"]);
  for (const t of listed) {
    assert.equal(t.inputSchema.type, "object");
    assert.equal(t.inputSchema.additionalProperties, false);
    assert.ok(t.description.length > 40 && t.title);
  }
  assert.equal(READ_TOOLS.every((t) => t.annotations.readOnlyHint === true), true);
  assert.equal(listed.at(-1).annotations.readOnlyHint, false);
  // a read-only token is not even shown the proposing tool, and cannot call it
  const readOnly = { canPropose: false, tools: tools(fakeData(), false) };
  assert.equal(toolList(false).some((t) => t.name === "propose_action"), false);
  assert.equal((await handleRpc(rpc("tools/list"), readOnly)).result.tools.length, 9);
  assert.equal((await handleRpc(rpc("tools/call", { name: "propose_action", arguments: { action: "todo", reason: "x" } }), readOnly)).error.code, -32602);

  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "tools/list" }, ctx), null, "a request without an id gets no answer");
  assert.equal(await handleRpc({ jsonrpc: "2.0", id: 5, result: {} }, ctx), null, "a stray response is ignored");
  assert.equal((await handleRpc(rpc("resources/list"), ctx)).error.code, -32601);
  assert.equal((await handleRpc({ id: 1, method: "ping" }, ctx)).error.code, -32600);
  assert.equal((await handleRpc("ping", ctx)).error.code, -32600);
  assert.equal((await handleRpc(rpc("tools/call", { name: "constructor" }), ctx)).error.code, -32602);
  assert.equal((await handleRpc(rpc("tools/call", { name: "get_day", arguments: "today" }), ctx)).error.code, -32602);
});

const call = async (t, name, args) => {
  const r = await handleRpc(rpc("tools/call", { name, arguments: args }), { canPropose: true, tools: t });
  const text = r.result.content[0].text;
  return r.result.isError ? { error: text } : JSON.parse(text);
};

test("reading: the overview, habits, a day, to-dos, school, goals, reports, reflections", async () => {
  const t = tools();
  const o = await call(t, "get_overview");
  assert.equal(o.today, TODAY);
  assert.deepEqual(o.student, { name: "Ana", goal: "Medalie la olimpiadă" });
  assert.deepEqual(o.streak, { current: 3, best: 3, active_today: true });
  assert.deepEqual(o.habits_today, { scheduled: 1, done: 1 });
  assert.deepEqual(o.habits, [
    { id: "h1", name: "Citit", difficulty: 2, time: "07:30", scheduled_today: true, done_today: true },
    { id: "h2", name: "Sală", difficulty: 3, time: null, scheduled_today: false, done_today: false },
  ]);
  assert.deepEqual(o.todos_today.map((x) => `${x.title}:${x.done}`), ["Eseu:false", "Gata azi:true", "Apă:false"]);
  assert.equal(o.evening_report_written, false);
  assert.equal(o.your_proposals_waiting, 0);
  assert.ok(o.momentum > 0 && o.level >= 1);

  const h = await call(t, "list_habits");
  assert.equal(h.active, 2);
  assert.equal(h.max_active, 20);
  assert.deepEqual(h.habits[0].last_28_days, { scheduled: 28, done: 2 }); // the 28 days before today; today is still open
  assert.deepEqual(h.habits[1].days, [2, 4]);

  const d = await call(t, "get_day", { day: "2026-11-15" });
  assert.equal(d.evening_report.summary, "Ai citit.");
  assert.deepEqual(d.habits, [{ name: "Citit", scheduled: true, done: true }]);
  assert.equal(typeof d.score, "number");
  assert.equal((await call(t, "get_day", {})).day, TODAY);
  assert.match((await call(t, "get_day", { day: "2026-11-17" })).error, /has not come yet/);
  assert.match((await call(t, "get_day", { day: "15.11.2026" })).error, /YYYY-MM-DD/);

  const td = await call(t, "list_todos", {});
  assert.deepEqual([td.from, td.to], [TODAY, "2026-11-30"]);
  assert.deepEqual(td.days[0], { day: TODAY, todos: [{ title: "Eseu", time: "16:00", minutes: 45, done: false, repeats: false }, { title: "Apă", time: null, minutes: null, done: false, repeats: true }] });
  assert.equal(td.days.length, 15); // the daily one gives every day a line
  assert.deepEqual(td.overdue, [{ title: "Restant", day: "2026-11-10" }]);
  assert.deepEqual(td.without_date, [{ title: "Cândva" }]);
  assert.equal((await call(t, "list_todos", { from: TODAY, to: TODAY, include_done: true })).days[0].todos.length, 3);
  assert.match((await call(t, "list_todos", { from: TODAY, to: "2027-03-01" })).error, /62 days/);
  assert.match((await call(t, "list_todos", { from: TODAY, to: "2026-11-01" })).error, /before/);

  const s = await call(t, "get_school");
  assert.deepEqual(s.exams, [{ subject: "Mate", title: "Teză", date: "2026-11-25", daysLeft: 9 }]);
  assert.equal(s.assignments[0].daysLeft, 3);

  const g = await call(t, "get_goals");
  assert.deepEqual(g.goals, [{ title: "Termin teoria", why: "Pentru olimpiadă", deadline: "2026-12-20", reached_on: null, progress_percent: 50, steps: [{ title: "Cursul 5", done: true, planned_for: null }, { title: "Cursul 6", done: false, planned_for: null }] }]);
  assert.equal(g.free_slots, 5);
  assert.equal(g.goal_in_profile, "Medalie la olimpiadă");

  assert.deepEqual((await call(t, "get_reports", { days: 3 })).reports, [{ day: "2026-11-15", ai_score: 70, summary: "Ai citit.", highlight: "Cititul", tip: "Continuă." }]);
  assert.deepEqual((await call(t, "get_reports", { days: 1 })).reports, []);
  assert.equal((await call(t, "get_reflections", { limit: 99 })).reflections[0].coach_observation, "b");

  // an account that has not finished onboarding has nothing to read, and says so instead of failing
  assert.match((await call(tools(fakeData({ state: null })), "get_overview")).error, /not finished setting up/);
});

test("proposing: checked by Molt's own rules, recorded as pending, never applied, marked with the connection's name", async () => {
  const data = fakeData();
  const t = tools(data);
  const made = await call(t, "propose_action", { action: "todo", title: "Recapitulare mate", date: "2026-11-17", minutes: 25, reason: "Teză la mate în 9 zile, 0 minute studiate.", data_used: ["teză în 9 zile"], confidence: "medium", expected_effect: "25 de minute de mate mâine" });
  assert.equal(made.status, "waiting_for_student");
  assert.deepEqual(made.proposed, { kind: "create_todo", what: "Recapitulare mate" });
  assert.match(made.message, /Nothing has changed/);
  const row = data.inserted[0];
  assert.deepEqual(
    { run_id: row.run_id, kind: row.kind, autonomy: row.autonomy, status: row.status, habit_id: row.habit_id, sources: row.sources, baseline: row.baseline },
    { run_id: "mcp-0f1e2d3c-2026-11-16", kind: "create_todo", autonomy: "confirm", status: "pending", habit_id: null, sources: [], baseline: null }
  );
  assert.deepEqual(row.payload, { title: "Recapitulare mate", date: "2026-11-17", dur: 25, source: { kind: "mcp", name: "Claude Desktop" }, explanation: { dataUsed: ["teză în 9 zile"], confidence: "medium", expectedEffect: "25 de minute de mate mâine" } });
  assert.equal(row.reason, "Teză la mate în 9 zile, 0 minute studiate.");
  // the app applies it exactly like one of Molt's own proposals, once the player taps Confirm
  const applied = planApply({ id: row.id, kind: row.kind, payload: row.payload }, state(), TODAY);
  assert.equal(applied.error, undefined);
  assert.equal(applied.patch(state()).todos.at(-1).title, "Recapitulare mate");
  assert.equal(applied.patch(state()).todos.at(-1).date, "2026-11-17");

  // the other kinds, each in the shape the app applies
  await call(t, "propose_action", { action: "add_habit", name: "Flashcarduri", days: [1, 3, 5], difficulty: 1, reason: "Toate obiceiurile merg bine." });
  await call(t, "propose_action", { action: "change_habit", habit_id: "h2", days: [1, 3], reason: "Marțea și joia nu ajungi la sală." });
  await call(t, "propose_action", { action: "goal", title: "Subiecte de olimpiadă", steps: ["Subiectele din 2025", "Subiectele din 2024"], why: "Antrenament", deadline: "2026-12-15", reason: "Ai spus că vrei medalie." });
  await call(t, "propose_action", { action: "note", note_kind: "event", body: "Teză la mate pe 25 noiembrie", ends_on: "2026-11-25", reason: "Ca să țin cont de teză." });
  assert.deepEqual(data.inserted.map((r) => r.kind), ["create_todo", "add_habit", "change_habit", "add_goal", "add_note"]);
  const [, add, change, goal, note] = data.inserted;
  assert.deepEqual({ name: add.payload.name, days: add.payload.days, diff: add.payload.diff }, { name: "Flashcarduri", days: [1, 3, 5], diff: 1 });
  assert.equal(planApply({ id: add.id, kind: add.kind, payload: add.payload }, state(), TODAY).patch(state()).habits.at(-1).name, "Flashcarduri");
  assert.deepEqual({ habit_id: change.habit_id, days: change.payload.days, diff: change.payload.diff }, { habit_id: "h2", days: [1, 3], diff: 3 }); // difficulty left as it was
  assert.deepEqual(change.baseline, { rate28: 0, asOf: TODAY });
  const changed = planApply({ id: change.id, kind: change.kind, habitId: change.habit_id, payload: change.payload }, state(), TODAY).patch(state()).habits.find((h) => h.id === "h2");
  assert.deepEqual([changed.days, changed.diff], [[1, 3], 3]);
  assert.equal(planApply({ id: goal.id, kind: goal.kind, payload: goal.payload }, state(), TODAY).patch(state()).objectives.at(-1).steps.length, 2);
  assert.deepEqual({ noteKind: note.payload.noteKind, body: note.payload.body, endsOn: note.payload.endsOn }, { noteKind: "event", body: "Teză la mate pe 25 noiembrie", endsOn: "2026-11-25" });
  assert.equal(data.inserted.every((r) => r.status === "pending" && r.autonomy === "confirm" && r.payload.source.name === "Claude Desktop"), true);

  // five wait now: the sixth is refused until the player has answered
  assert.match((await call(t, "propose_action", { action: "todo", title: "Încă unul", date: TODAY, minutes: 10, reason: "x" })).error, /5 proposals already wait/);
  assert.equal(data.inserted.length, LIMITS.pending);
  assert.equal((await call(t, "get_overview")).your_proposals_waiting, 5);
  const log = await call(t, "get_action_log", { limit: 3 });
  assert.deepEqual(log.actions[0], { id: "act-1", status: "pending", kind: "create_todo", what: "Recapitulare mate", reason: "Teză la mate în 9 zile, 0 minute studiate.", proposed_by: "Claude Desktop", created_at: "2026-11-16T10:00:00Z", decided_at: null, measured_effect: null });
});

test("proposing: what is refused, with a reason the agent can act on", async () => {
  const bad = async (args, re, data = fakeData()) => {
    const r = await call(tools(data), "propose_action", args);
    assert.match(r.error || "", re, JSON.stringify(args));
    assert.equal(data.inserted.length, 0);
  };
  await bad({ action: "todo", title: "x", date: "2026-11-17", minutes: 25 }, /needs a reason/);
  await bad({ action: "todo", title: "x", date: "2026-11-17", minutes: 25, reason: "   " }, /needs a reason/);
  await bad({ action: "delete_everything", reason: "x" }, /must be one of/);
  await bad({ action: "todo", title: "x", date: "2026-11-15", minutes: 25, reason: "r" }, /not be in the past \(today is 2026-11-16\)/);
  await bad({ action: "todo", title: "x", date: "2026-11-17", minutes: 240, reason: "r" }, /minutes between 10 and 60/);
  await bad({ action: "todo", title: "", date: "2026-11-17", minutes: 20, reason: "r" }, /needs a title/);
  await bad({ action: "change_habit", habit_id: "nope", days: [1], reason: "r" }, /habit_id from list_habits/);
  await bad({ action: "change_habit", habit_id: "h3", days: [2], reason: "r" }, /habit_id from list_habits/); // an archived habit
  await bad({ action: "change_habit", habit_id: "h2", days: [4, 2], difficulty: 3, reason: "r" }, /already is/);
  await bad({ action: "change_habit", habit_id: "h2", reason: "r" }, /already is/);
  await bad({ action: "add_habit", name: "A", days: [1], reason: "r" }, /needs a name/);
  await bad({ action: "add_habit", name: "Bun", days: [9], reason: "r" }, /weekdays 0-6/);
  await bad({ action: "goal", title: "Termin teoria", steps: ["a"], reason: "r" }, /does not already have/);
  await bad({ action: "goal", title: "Nou", steps: [], reason: "r" }, /1 to 5 steps/);
  await bad({ action: "goal", title: "Nou", steps: ["a"], deadline: "2026-01-01", reason: "r" }, /deadline must not be in the past/);
  await bad({ action: "note", note_kind: "diagnosis", body: "x", reason: "r" }, /note_kind/);
  await bad({ action: "note", note_kind: "event", body: "x", starts_on: "2026-12-02", ends_on: "2026-12-01", reason: "r" }, /ends_on/);
  // at the habit limit nothing new is proposed
  const full = { ...state(), habits: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, name: `H${i}`, diff: 1, days: [1], createdAt: "2026-10-01" })) };
  await bad({ action: "add_habit", name: "Încă unul", days: [1], reason: "r" }, /below the limit/, fakeData({ state: full }));
  // the same thing twice, and the daily limit
  const waiting = [{ id: "w1", run_id: "mcp-0f1e2d3c-2026-11-15", kind: "create_todo", status: "pending", payload: { title: "Recapitulare Mate" } }];
  await bad({ action: "todo", title: "recapitulare mate", date: "2026-11-17", minutes: 25, reason: "r" }, /already waits/, fakeData({ actions: waiting }));
  const busy = Array.from({ length: LIMITS.perDay }, (_, i) => ({ id: `d${i}`, run_id: "mcp-0f1e2d3c-2026-11-16", kind: "create_todo", status: "rejected", payload: { title: `t${i}` } }));
  await bad({ action: "todo", title: "Peste limită", date: "2026-11-17", minutes: 25, reason: "r" }, /daily limit/, fakeData({ actions: busy }));
  // text is cut to what the app shows, never passed on at full length
  const data = fakeData();
  await call(tools(data), "propose_action", { action: "todo", title: "T".repeat(500), date: "2026-11-17", minutes: 30, reason: "R".repeat(900) });
  assert.equal(data.inserted[0].payload.title.length, 120);
  assert.equal(data.inserted[0].reason.length, 200);
});

test("a failing database is an error for the agent, not a crash, and is reported to the function", async () => {
  const seen = [];
  const broken = { ...fakeData(), state: async () => { throw new Error("db down"); } };
  const r = await handleRpc(rpc("tools/call", { name: "get_overview" }), { canPropose: true, tools: tools(broken), onError: (e) => seen.push(e.message) });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /could not answer right now/);
  assert.deepEqual(seen, ["db down"]);
});

// ------------------------------------------------------------ HTTP

const deps = (over = {}) => {
  const data = over.data || fakeData();
  const seenHashes = [];
  return {
    data,
    seenHashes,
    owner: async (hash) => {
      seenHashes.push(hash);
      return hash === over.hash ? { tokenId: "0f1e2d3c-aaaa", userId: "user_aaa", name: "Claude Desktop", canPropose: over.canPropose ?? true, tz: over.tz ?? "Europe/Bucharest", allowed: over.allowed ?? true } : null;
    },
    dataFor: (userId) => {
      assert.equal(userId, "user_aaa");
      return data;
    },
    now: () => new Date("2026-11-16T10:00:00Z"),
  };
};
const post = (body, headers = {}, url = "https://x.supabase.co/functions/v1/mcp") =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("HTTP: only a valid token gets in; the token is looked up by its hash, never sent on as it is", async () => {
  const hash = await sha256Hex(TOKEN);
  assert.equal(hash.length, 64);
  const d = deps({ hash });
  const auth = { Authorization: `Bearer ${TOKEN}` };

  const ok = await handleMcp(post(rpc("initialize", { protocolVersion: "2025-06-18" }), auth), d);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/json");
  assert.equal(ok.headers.get("access-control-allow-origin"), "*");
  assert.equal((await ok.json()).result.protocolVersion, "2025-06-18");
  assert.deepEqual(d.seenHashes, [hash]);

  for (const headers of [{}, { Authorization: "Bearer nope" }, { Authorization: `Basic ${TOKEN}` }, { Authorization: "Bearer mlt_" + "cd34".repeat(12) }]) {
    const r = await handleMcp(post(rpc("tools/list"), headers), d);
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /^Bearer/);
    assert.equal((await r.json()).error.code, -32001);
  }
  // clients that can only be given an address pass the token in it
  assert.equal(tokenOf(new Request(`https://x/functions/v1/mcp?key=${TOKEN}`, { method: "POST" })), TOKEN);
  assert.equal((await handleMcp(post(rpc("ping"), {}, `https://x.supabase.co/functions/v1/mcp?key=${TOKEN}`), d)).status, 200);
  assert.equal(tokenOf(new Request("https://x/mcp?key=mlt_short", { method: "POST" })), null);

  const limited = await handleMcp(post(rpc("ping"), auth), deps({ hash, allowed: false }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  const down = await handleMcp(post(rpc("ping"), auth), { ...d, owner: async () => { throw new Error("db"); }, onError: () => {} });
  assert.equal(down.status, 503);
});

test("HTTP: methods, notifications, batches, bad input, and today is the player's own day", async () => {
  const hash = await sha256Hex(TOKEN);
  const d = deps({ hash });
  const auth = { Authorization: `Bearer ${TOKEN}` };

  const preflight = await handleMcp(new Request("https://x/functions/v1/mcp", { method: "OPTIONS" }), d);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers"), /mcp-protocol-version/);
  const get = await handleMcp(new Request("https://x/functions/v1/mcp", { method: "GET", headers: auth }), d);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST, OPTIONS");
  assert.equal((await handleMcp(new Request("https://x/functions/v1/mcp", { method: "DELETE", headers: auth }), d)).status, 405);

  const note = await handleMcp(post({ jsonrpc: "2.0", method: "notifications/initialized" }, auth), d);
  assert.equal(note.status, 202);
  assert.equal(await note.text(), "");

  const batch = await handleMcp(post([rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc("tools/list", undefined, 2)], auth), d);
  assert.deepEqual((await batch.json()).map((r) => r.id), [1, 2]);
  assert.equal((await handleMcp(post([], auth), d)).status, 400);

  assert.equal((await (await handleMcp(post("{not json", auth), d)).json()).error.code, -32700);
  assert.equal((await handleMcp(post(rpc("ping"), { ...auth, "MCP-Protocol-Version": "1999-01-01" }), d)).status, 400);
  assert.equal((await handleMcp(post(rpc("ping"), { ...auth, "MCP-Protocol-Version": "2025-06-18" }), d)).status, 200);
  assert.equal((await handleMcp(post(JSON.stringify(rpc("ping")) + " ".repeat(LIMITS.body), auth), d)).status, 413);

  // 10:00 UTC on the 16th is still the 16th in Bucharest, already the 17th in Auckland, and a bad zone falls back
  const today = async (tz) => JSON.parse((await (await handleMcp(post(rpc("tools/call", { name: "get_overview", arguments: {} })), deps({ hash, tz }))).json()).result?.content?.[0]?.text ?? "{}").today;
  assert.equal(localDay(new Date("2026-11-16T10:00:00Z"), "Europe/Bucharest"), "2026-11-16");
  assert.equal(localDay(new Date("2026-11-16T22:30:00Z"), "Europe/Bucharest"), "2026-11-17");
  assert.equal(localDay(new Date("2026-11-16T10:00:00Z"), "Pacific/Auckland"), "2026-11-16");
  assert.equal(localDay(new Date("2026-11-16T12:00:00Z"), "Pacific/Auckland"), "2026-11-17");
  assert.equal(localDay(new Date("2026-11-16T10:00:00Z"), "Nowhere/Land"), "2026-11-16");
  assert.equal(await today("Europe/Bucharest"), undefined, "no token, no data"); // the request above carried no Authorization
  const withAuth = await handleMcp(post(rpc("tools/call", { name: "get_overview", arguments: {} }), auth), deps({ hash, tz: "Europe/Bucharest" }));
  assert.equal(JSON.parse((await withAuth.json()).result.content[0].text).today, "2026-11-16");
});
