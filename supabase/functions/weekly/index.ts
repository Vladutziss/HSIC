// The coach's weekly run (Sunday evening), for players who opted in (profiles.settings.agentWeekly).
// Deployed without gateway JWT verification and called by pg_cron with a shared secret:
//
//   npm run sync:functions && supabase functions deploy weekly --no-verify-jwt
//   supabase secrets set AGENT_CRON_SECRET=...        (the same value is in the cron job, see 0017)
//
// What it does for each opted-in player, with no language model involved:
//   1. measures the effect of changes accepted two weeks ago (outcomes.js) and stores it;
//   2. runs the statistics (patterns.js) and plans next week (weekly-core.js);
//   3. logs the plan in agent_actions: reversible low-risk actions as `auto` (the app applies them on the
//      next open, with an undo), anything that changes the plan as `confirm`;
//   4. sends one push notification if something was logged.
// Body {mode: "streak"} (daily, evening, for players with settings.agentNudge): if a streak of 3+ days is about
// to break, the model writes one short message and one push goes out; at most one per player per day. No text from
// the model means no push. It is logged as an applied `set_reminder` so the player sees it in "Ce a făcut Molt".
// The same daily run (the cron body still says "streak") also sends the exam reminders to the players whose account has
// notifications on (settings.pushOn, and settings.pushExams not false): see examReminder in weekly-core.js. No model, no
// log row, one push per player per run.
// It never edits the player's state itself: the app is the only writer of habits and to-dos.

import { RO_WORDING } from "../_shared/prompts.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadState } from "../_shared/app/remote.js";
import { analyzePatterns } from "../_shared/app/patterns.js";
import { activeContext, summarizeFeedback } from "../_shared/app/memory.js";
import { isOutcomeDue, measureOutcome } from "../_shared/app/outcomes.js";
import { examReminder, planWeek, streakAlert } from "../_shared/weekly-core.js";

const TZ = "Europe/Bucharest"; // the app's audience; per-player time zones would come from push_subscriptions
const MAX_USERS = 500;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const dayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

const nudgeSystem = (en: boolean) =>
  `You write one push notification for "Molted", a study and habit coach used by high school students. The player has a streak that breaks if they do nothing today. Write ONE sentence in ${en ? "English" : "Romanian"}, at most 120 characters,${en ? "" : ' addressing the player as "tu",'} warm, no guilt, no emojis, naming the habit as given and the streak length. Use only the numbers given.${en ? "" : ` ${RO_WORDING}`} Answer with the sentence only.`;

/** One short message from the model, or null (no key, no answer, nonsense): then nothing is sent. */
async function nudgeText(facts: { nick: string; streak: number; habit: string }, en: boolean): Promise<string | null> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  const models = (Deno.env.get("AGENT_MODEL") ?? Deno.env.get("AI_MODEL") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (!key || !models.length) return null;
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Molted" },
        body: JSON.stringify({ model, messages: [{ role: "system", content: nudgeSystem(en) }, { role: "user", content: JSON.stringify(facts) }], max_tokens: 200, temperature: 0.7 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const text = String((await res.json())?.choices?.[0]?.message?.content ?? "").replace(/\s+/g, " ").trim();
      if (text.length >= 10 && text.length <= 200) return text;
    } catch {
      /* try the next model */
    }
  }
  return null;
}

/** Exam reminders: a push for each player with notifications on whose nearest exam is 1-3 days away (examReminder decides). */
async function sendExamReminders(admin: ReturnType<typeof createClient>, url: string, secret: string, today: string) {
  const out = { players: 0, sent: 0, skipped: 0, failed: 0 };
  const { data: players, error } = await admin.from("profiles").select("id, settings").eq("settings->>pushOn", "true").limit(MAX_USERS);
  if (error) throw error;
  const wanting = (players ?? []).filter((p: { settings?: { pushExams?: unknown } }) => p.settings?.pushExams !== false);
  const { data: subs } = wanting.length ? await admin.from("push_subscriptions").select("user_id").in("user_id", wanting.map((p: { id: string }) => p.id)) : { data: [] };
  const withDevice = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id));
  out.players = wanting.length;
  for (const { id, settings } of wanting) {
    if (!withDevice.has(id)) {
      out.skipped++;
      continue;
    }
    try {
      const state = await loadState(admin, id);
      const r = state ? examReminder({ state, today, lang: settings?.prefs?.lang === "en" ? "en" : "ro" }) : null;
      if (!r) {
        out.skipped++;
        continue;
      }
      await fetch(`${url}/functions/v1/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret, Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}` },
        body: JSON.stringify({ action: "exam_reminder", userId: id, title: r.title, text: r.body }),
      });
      out.sent++;
    } catch (e) {
      out.failed++;
      console.error("exam reminder", id, e);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { code: "bad_request" });
  const secret = Deno.env.get("AGENT_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return reply(401, { code: "session_expired" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = dayIn(TZ);
  const runId = `weekly-${today}`;

  const mode = (await req.json().catch(() => ({})))?.mode;
  if (mode === "streak") {
    // players that did not opt into the streak check still get the exam reminders below
    const { data: nudgees, error: nErr } = await admin.from("profiles").select("id, name, settings").eq("settings->>agentNudge", "true").limit(MAX_USERS);
    if (nErr) {
      console.error("nudge users", nErr);
      return reply(500, { code: "upstream_error" });
    }
    const out = { players: nudgees?.length ?? 0, sent: 0, skipped: 0, failed: 0 };
    for (const { id, name, settings } of nudgees ?? []) {
      try {
        const nudgeRun = `nudge-${today}`; // one per player per day
        const { data: done } = await admin.from("agent_actions").select("id").eq("user_id", id).eq("run_id", nudgeRun).limit(1);
        const state = done?.length ? null : await loadState(admin, id);
        const alert = state ? streakAlert({ state, today }) : null;
        if (!alert) {
          out.skipped++;
          continue;
        }
        const text = await nudgeText({ nick: state.profile?.nick || name || "", streak: alert.streak, habit: alert.habit.name }, settings?.prefs?.lang === "en");
        if (!text) {
          out.skipped++;
          continue;
        }
        const { error: insErr } = await admin.from("agent_actions").insert({
          user_id: id,
          run_id: nudgeRun,
          kind: "set_reminder",
          autonomy: "auto",
          status: "applied",
          habit_id: alert.habit.id,
          payload: { text, streak: alert.streak },
          reason: text,
          sources: [],
          decided_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;
        await fetch(`${url}/functions/v1/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": secret, Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}` },
          body: JSON.stringify({ action: "coach_nudge", userId: id, text }),
        }).catch((e) => console.error("nudge push", e));
        out.sent++;
      } catch (e) {
        out.failed++;
        console.error("nudge player", id, e);
      }
    }
    let exams = null;
    try {
      exams = await sendExamReminders(admin, url, secret, today);
    } catch (e) {
      console.error("exam reminders", e);
    }
    return reply(200, { ...out, exams });
  }

  const { data: users, error } = await admin.from("profiles").select("id, settings").eq("settings->>agentWeekly", "true").limit(MAX_USERS);
  if (error) {
    console.error("weekly users", error);
    return reply(500, { code: "upstream_error" });
  }

  const summary = { players: users?.length ?? 0, planned: 0, logged: 0, skipped: 0, failed: 0, measured: 0 };
  for (const { id, settings } of users ?? []) {
    try {
      // one run per player per day
      const { data: done } = await admin.from("agent_actions").select("id").eq("user_id", id).eq("run_id", runId).limit(1);
      if (done?.length) {
        summary.skipped++;
        continue;
      }
      const state = await loadState(admin, id);
      if (!state) {
        summary.skipped++;
        continue;
      }

      const [{ data: actions }, { data: notes }, { data: feedback }] = await Promise.all([
        admin.from("agent_actions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(60),
        admin.from("user_context").select("kind, body, starts_on, ends_on, created_at").eq("user_id", id).limit(100),
        admin.from("proposal_feedback").select("proposal, decision, reason, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
      ]);

      // close the loop: what happened after the changes the player accepted two weeks ago
      for (const a of actions ?? []) {
        if (!isOutcomeDue(a, today)) continue;
        const outcome = measureOutcome(a, state, today);
        const { error: upErr } = await admin.from("agent_actions").update({ outcome }).eq("id", a.id);
        if (!upErr) {
          a.outcome = outcome;
          summary.measured++;
        }
      }

      const plan = planWeek({
        state,
        today,
        patterns: analyzePatterns(state, today),
        context: activeContext(notes ?? [], today),
        feedback: summarizeFeedback(feedback ?? []),
        pastActions: actions ?? [],
        lang: settings?.prefs?.lang === "en" ? "en" : "ro",
      });
      summary.planned++;
      if (!plan.actions.length) continue;

      const rows = plan.actions.map((a: { kind: string; autonomy: string; habitId?: string; payload: unknown; reason: string; sources: string[]; baseline: unknown }) => ({
        user_id: id,
        run_id: runId,
        kind: a.kind,
        autonomy: a.autonomy,
        status: "pending",
        habit_id: a.habitId ?? null,
        payload: a.payload,
        reason: a.reason,
        sources: a.sources,
        baseline: a.baseline,
      }));
      const { error: insErr } = await admin.from("agent_actions").insert(rows);
      if (insErr) throw insErr;
      summary.logged += rows.length;

      // one notification per player; failures here must not undo the log
      await fetch(`${url}/functions/v1/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`, // satisfies a gateway that still verifies JWTs
        },
        body: JSON.stringify({ action: "agent", userId: id, count: rows.length }),
      }).catch((e) => console.error("weekly push", e));
    } catch (e) {
      summary.failed++;
      console.error("weekly player", id, e);
    }
  }
  return reply(200, summary);
});
