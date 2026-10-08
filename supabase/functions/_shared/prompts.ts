// Prompts for the AI features. They live on the server: the client only sends a
// `kind` and plain parameters, never prompt text, so the function cannot be
// used as a free general-purpose LLM proxy. Parameters are clipped here.
// (The claude.ai artifact build keeps its own copy in src/lib/ai.js.)

// deno-lint-ignore-file no-explicit-any

export const KINDS = ["verify", "review", "moment", "chapter"] as const;
export type Kind = (typeof KINDS)[number];

const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};
const list = (a: unknown, n: number, each: number) => (Array.isArray(a) ? a.slice(0, n).map((x) => clip(x, each)) : []);

function verify(p: any, hasImage: boolean): string {
  const habit = p.habit ?? {};
  const companion = p.companion ?? {};
  const type = ["photo", "voice", "note"].includes(p.type) ? p.type : "note";
  const recent = list(p.recent, 3, 420);
  const story = recent.length ? recent.map((s) => `- ${s}`).join("\n") : "- (the story is just beginning)";
  const kind =
    type === "photo"
      ? hasImage
        ? "a photo (attached)"
        : "a photo you cannot see (judge from the player's note only)"
      : type === "voice"
        ? `a voice note of about ${Number(p.seconds) || "?"} seconds (you cannot hear it; judge from the player's description only)`
        : "a written note";
  return `You are the game master of "Molted", a self-improvement RPG. The player submitted proof for today's habit check-in.

Habit: "${clip(habit.name, 80)}". Target: "${clip(habit.target, 80) || "-"}".
Proof: ${kind}.
Player's note: "${clip(p.note, 500)}"

The player's companion is ${clip(companion.name, 30) || "a Molt"}, a ${clip(p.cls, 30) || "Atlet"} at the "${clip(companion.stage, 30)}" stage.
Story so far (newest last):
${story}

1. Decide whether the proof plausibly shows the habit was done today:
   - "verified": the photo clearly matches the habit (a gym, a running route, an open notebook with solved problems, a budget table, a sketch...).
   - "plausible": consistent but not conclusive, such as a specific written or voice note, or a photo that only loosely fits.
   - "rejected": empty, unrelated, or clearly not this habit.
   Be fair rather than strict, and never reject a photo only for low quality.
2. Write the next story fragment: 2-3 sentences, at most 300 characters, in Romanian, third person, present tense, about the companion continuing its adventure, inspired by what the player did. Warm and playful, never guilt-tripping. If rejected, the companion waits patiently and cheers the player on.
3. Give the fragment a title of 2-4 words in Romanian.

Reply with only JSON: {"verdict":"verified|plausible|rejected","reason":"<one short sentence in Romanian about the verdict, addressing the player as tu>","title":"...","story":"..."}`;
}

function review(p: any): string {
  const habits = (Array.isArray(p.habits) ? p.habits.slice(0, 12) : [])
    .map(
      (h: any) =>
        `- ${clip(h.name, 80)} (${clip(h.diffLabel, 12)}${h.scheduled ? "" : ", optional today"}): ${h.done ? `done${h.proof ? `, proof ${clip(h.proof, 12)}` : ""}` : "not done"}`,
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

Score the day from 0 to 100 for effort and consistency against the plan: 100 = everything scheduled done, most with proof; about 60 = most of it done; about 30 = a small start; 0 = nothing. Then write, in Romanian, addressing the player as "tu":
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
  return `In "Molted", a self-improvement RPG, the player's companion ${clip(p.name, 30) || "the Molt"} (a ${clip(p.cls, 30) || "hero"}) just evolved from "${clip(p.from, 30)}" to "${clip(p.to, 30)}" thanks to the player's proofs of effort.
Recent story (newest last):
${recent.map((s) => `- ${s}`).join("\n") || "- (none yet)"}
Write a short celebratory chapter: 3 sentences, at most 380 characters, in Romanian, third person, present tense, describing the transformation and what the companion can do now. Give it a title of 2-4 words.
Reply with only JSON: {"title":"...","story":"..."}`;
}

export function buildPrompt(kind: Kind, params: any, hasImage: boolean): string {
  const p = params && typeof params === "object" ? params : {};
  switch (kind) {
    case "verify":
      return verify(p, hasImage);
    case "review":
      return review(p);
    case "moment":
      return moment(p);
    case "chapter":
      return chapter(p);
  }
}
