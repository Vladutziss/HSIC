// The player's side of the coach agent: deciding on a proposal (logged in agent_actions, with the
// reaction kept as feedback for the agent) and running experiments (table `experiments`).
// Everything goes through the player's own supabase client, so RLS is the only gate.

import { analyzeExperiment, isDue } from "./experiments.js";
import { recordFeedback } from "./memory.js";

const fail = (code) => ({ code });
const must = ({ data, error }) => {
  if (error) throw fail("db_error");
  return data;
};

/** Marks a logged proposal accepted or rejected and keeps the reaction for the agent's next run. */
export async function decideAction(client, { id, proposal, decision, reason }) {
  if (!client) throw fail("unavailable");
  const status = decision === "accepted" ? "applied" : "rejected";
  if (id) await client.from("agent_actions").update({ status, decided_at: new Date().toISOString() }).eq("id", id).then(must);
  await recordFeedback(client, { proposal: stripProposal(proposal), decision, reason });
}

/** What is worth keeping of a proposal in the feedback log (no source texts). */
function stripProposal(p) {
  const { action, habitId, name, diff, days, reason, factor } = p;
  return { action, habitId, name, diff, days, reason, factor, sources: (p.sources || []).map((s) => s.id || s) };
}

/** Starts the experiment the agent proposed. One can run at a time (unique index); a second one reports `running`. */
export async function startExperiment(client, proposal) {
  const e = proposal.experiment;
  if (!client || !e) throw fail("unavailable");
  const { error } = await client.from("experiments").insert({
    habit_id: e.habitId,
    factor: e.factor,
    arm_a: e.armA,
    arm_b: e.armB,
    start_day: e.startDay,
    end_day: e.endDay,
    assignments: e.assignments,
  });
  if (error) throw fail(error.code === "23505" ? "experiment_running" : "db_error");
}

export async function loadExperiments(client) {
  if (!client) return [];
  const { data, error } = await client.from("experiments").select("*").order("created_at", { ascending: false }).limit(6);
  if (error) return [];
  return data.map((r) => ({
    id: r.id,
    habitId: r.habit_id,
    factor: r.factor,
    armA: r.arm_a,
    armB: r.arm_b,
    startDay: r.start_day,
    endDay: r.end_day,
    assignments: r.assignments || {},
    status: r.status,
    result: r.result,
  }));
}

/** Closes the running experiment once its last day has passed, storing the verdict. */
export async function finishDue(client, experiments, state, today) {
  let changed = false;
  for (const exp of experiments) {
    if (exp.status !== "running" || !isDue(exp, today)) continue;
    const result = analyzeExperiment(exp, state, today);
    const { error } = await client.from("experiments").update({ status: "done", result }).eq("id", exp.id);
    if (!error) {
      exp.status = "done";
      exp.result = result;
      changed = true;
    }
  }
  return changed;
}

export async function cancelExperiment(client, id) {
  await client.from("experiments").update({ status: "cancelled" }).eq("id", id).then(must);
}
