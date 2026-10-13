// Prompts for the AI features. They live on the server: the client only sends a
// `kind` and plain parameters, never prompt text, so the function cannot be
// used as a free general-purpose LLM proxy. Parameters are clipped here.
// (The claude.ai artifact build keeps its own copy in src/lib/ai.js.)

// deno-lint-ignore-file no-explicit-any

export const KINDS = ["review", "moment", "chapter", "insights", "daily_plan", "homework_parse", "goal_decompose", "reflection"] as const;
export type Kind = (typeof KINDS)[number];

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};
const list = (a: unknown, n: number, each: number) => (Array.isArray(a) ? a.slice(0, n).map((x) => clip(x, each)) : []);

function review(p: any): string {
  const habits = (Array.isArray(p.habits) ? p.habits.slice(0, 12) : [])
    .map(
      (h: any) =>
        `- ${clip(h.name, 80)} (${clip(h.diffLabel, 12)}${h.scheduled ? "" : ", optional today"}): ${h.done ? "done" : "not done"}`,
    )
    .join("\n");
  const todos = p.todos ?? {};
  const titles = list(todos.titles, 5, 60);
  const level = p.level ?? {};
  return `You are the evening coach in "Molted", a self-improvement RPG. Review the player's day and score it.

Player: ${clip(p.name, 40) || "the player"}. Goal: "${clip(p.goal, 200) || "-"}" (path: ${clip(p.pathLabel, 30) || "-"}).
Day: ${clip(p.dayLabel, 40)}.
Habits:
${habits || "- nothing scheduled"}
To-dos done: ${Number(todos.done) || 0} of ${Number(todos.total) || 0}${titles.length ? ` (${titles.join("; ")})` : ""}.
Momentum: level ${Number(level.lvl) || 1} (${clip(level.name, 30)}), ${Number(p.momentum) || 0} points. Streak: ${Number(p.streak) || 0} days.

Score the day from 0 to 100 for effort and consistency against the plan: 100 = everything scheduled done; about 60 = most of it done; about 30 = a small start; 0 = nothing. Then write, in Romanian, addressing the player as "tu":
- summary: 2 sentences, specific to what was done today, honest and encouraging, without guilt or pressure.
- highlight: the best thing today, at most 8 words.
- tip: one concrete suggestion for tomorrow, at most 18 words.

Reply with only JSON: {"score": <integer 0-100>, "summary": "...", "highlight": "...", "tip": "..."}`;
}

function moment(p: any): string {
  const quote = p.quote ?? {};
  return `In one sentence in Romanian (at most 170 characters), connect this quote to the player's situation in a self-improvement game. Address the player as "tu", be warm and concrete, and do not repeat the quote.
Situation: ${clip(p.situation, 300)}.
Quote: "${clip(quote.text, 300)}" (${clip(quote.author, 60)}).
Reply with only JSON: {"line":"..."}`;
}

function chapter(p: any): string {
  const recent = list(p.recent, 3, 420);
  return `In "Molted", a self-improvement RPG, the player's companion ${clip(p.name, 30) || "the Molt"} (a ${clip(p.cls, 30) || "hero"}) just evolved from "${clip(p.from, 30)}" to "${clip(p.to, 30)}" thanks to the player's daily check-ins.
Recent story (newest last):
${recent.map((s) => `- ${s}`).join("\n") || "- (none yet)"}
Write a short celebratory chapter: 3 sentences, at most 380 characters, in Romanian, third person, present tense, describing the transformation and what the companion can do now. Give it a title of 2-4 words.
Reply with only JSON: {"title":"...","story":"..."}`;
}

const WD = ["dum", "lun", "mar", "mie", "joi", "vin", "sâm"]; // index = Date.getDay()

/** The last 4 weeks per habit, for `insights` (the planning is done by the `agent` function). */
function habitsBlock(p: any): string {
  const habits = Array.isArray(p.habits) ? p.habits.slice(0, 8) : [];
  return (
    habits
      .map((h: any) => {
        const wd = (Array.isArray(h.wd) ? h.wd : [])
          .slice(0, 7)
          .map((c: any, i: number) => `${WD[i]} ${Number(c?.[1]) || 0}/${Number(c?.[0]) || 0}`)
          .join(", ");
        return `- id=${clip(h.id, 40)} "${clip(h.name, 60)}" difficulty ${Number(h.diff) || 2}/3, scheduled on [${list(h.days, 7, 2).join(",")}] (0=Sunday): done ${Number(h.done) || 0} of ${Number(h.sched) || 0}. Per weekday done/scheduled: ${wd}`;
      })
      .join("\n") || "- no habits"
  );
}

function insights(p: any): string {
  return `You are the data coach in "Molted", a self-improvement RPG. Below is the last 4 weeks of a player's habits. Find 2 or 3 real patterns (a weekday that always fails, a habit that is much weaker than the others, a habit that is easy to keep) and give one concrete fix for each. Use only the numbers below; never invent data.

Goal: "${clip(p.goal, 200) || "-"}".
${habitsBlock(p)}

Write in Romanian, addressing the player as "tu", warm and specific, no guilt. Each insight: title at most 6 words, text at most 200 characters with the numbers it is based on and the fix.
Reply with only JSON: {"insights":[{"title":"...","text":"..."}]}`;
}

function dailyPlan(p: any): string {
  const habits = Array.isArray(p.habits) ? p.habits.slice(0, 8) : [];
  const todos = Array.isArray(p.todos) ? p.todos.slice(0, 12) : [];
  const goals = Array.isArray(p.goals) ? p.goals.slice(0, 6) : [];
  const assignments = Array.isArray(p.assignments) ? p.assignments.slice(0, 10) : [];
  return `You are the daily planning coach in "Molted", a self-improvement RPG for teenagers. Turn the player's real tasks and habits into a small plan for today.

Today: ${clip(p.today, 40)}. Available time: ${Number(p.minutes) || 60} minutes. Energy: ${clip(p.energy, 12) || "medium"}.
Habits:
${habits.map((h: any) => `- ${clip(h.name, 70)}: ${h.done ? "done" : "not done"}${h.scheduled ? ", scheduled today" : ""}`).join("\n") || "- none"}
Open to-dos:
${todos.map((t: any) => `- ${clip(t.title, 90)}${t.date ? ` (${clip(t.date, 20)})` : ""}`).join("\n") || "- none"}
Goals:
${goals.map((g: any) => `- ${clip(g.text, 100)}${g.done ? " (done)" : ""}`).join("\n") || "- none"}
School assignments:
${assignments.map((a: any) => `- ${clip(a.title, 90)}${a.subject ? ` [${clip(a.subject, 40)}]` : ""} due ${clip(a.due, 20)}${a.done ? " (done)" : ""}`).join("\n") || "- none"}

Return at most 3 steps, ordered by usefulness. Each step must be small enough for the available time, concrete, and possible today. Do not invent assignments, deadlines or habits. Prefer one important task, then one scheduled habit, then a short easy win. Set "focus": true only for a step that is deep, uninterrupted work of at least 15 minutes (studying, writing, practice); otherwise false. Address the player as "tu" in Romanian, without guilt.
Reply with only JSON: {"steps":[{"title":"...","minutes":15,"focus":false,"reason":"...","dataUsed":["..."],"confidence":"low|medium|high"}]}`;
}

function homeworkParse(p: any): string {
  return `You extract school assignments from a Romanian student's text. Do not invent a deadline when it is not present: use ${clip(p.today, 20)} only as a fallback. Return only tasks that are explicit or strongly implied.
Text: "${clip(p.text, 1200)}"
Today: ${clip(p.today, 20)}
Set "type" to "exam" for a test, exam, quiz or oral (a fixed date to be examined on) and to "assignment" for homework or a project to hand in. For an exam, "due" is the exam day.
Reply with only JSON: {"assignments":[{"type":"assignment|exam","title":"...","subject":"...","due":"YYYY-MM-DD","estimatedMinutes":30}]}`;
}

function goalDecompose(p: any): string {
  return `You help a Romanian teenager turn one vague goal into three small goals for the next month. Do not promise outcomes and do not invent a schedule. Keep every step concrete and possible in less than one week. Write every "text" and "criteria" in Romanian, addressing the student as "tu" where needed.
Goal: "${clip(p.goal, 300)}"
Optionally add "due" (YYYY-MM-DD, only when a date is clearly implied) and "criteria" (one short sentence: how the student will know the step is done).
Reply with only JSON: {"goals":[{"text":"...","period":"week|month","due":"YYYY-MM-DD","criteria":"..."}]}`;
}

function reflection(p: any): string {
  return `You are a gentle weekly reflection coach for a Romanian teenager. Use only the supplied numbers and the student's own answer. Do not diagnose, shame or invent causes. Return one observation and one small change for next week. Refer to habits by their name, never by an id, and make every "dataUsed" entry a short human-readable phrase (for example "alergare 2/2"). Write both in Romanian, addressing the student as "tu", warm and specific, no guilt (observation at most 300 characters, nextStep at most 240).
Data: ${JSON.stringify(p.data || {})}
Student answer: "${clip(p.answer, 800)}"
Reply with only JSON: {"observation":"...","nextStep":"...","dataUsed":["..."],"confidence":"low|medium|high"}`;
}

export function buildPrompt(kind: Kind, params: any): string {
  const p = params && typeof params === "object" ? params : {};
  switch (kind) {
    case "insights":
      return insights(p);
    case "review":
      return review(p);
    case "moment":
      return moment(p);
    case "chapter":
      return chapter(p);
    case "daily_plan":
      return dailyPlan(p);
    case "homework_parse":
      return homeworkParse(p);
    case "goal_decompose":
      return goalDecompose(p);
    case "reflection":
      return reflection(p);
  }
}
