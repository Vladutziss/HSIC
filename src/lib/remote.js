// Postgres persistence for the Supabase mode. The app keeps working with the
// same `state` object (and month documents) it always had; this file turns it
// into table rows and back:
//
//   toRows / fromRows           state          <-> profiles, habits, completions, todos, day_reviews, streak_revives
//   monthToRows / rowsToMonth   month document <-> chapters, day_reviews (text part)
//   diff / diffMonth            old doc + new doc -> the minimal list of writes
//
// Pure functions first (tested in tests/remote.test.mjs), then the thin part
// that talks to a supabase-js client.

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nul = (v) => (v === undefined ? null : v);

// ------------------------------------------------------------ table specs

// pk: columns of the primary key; conflict: onConflict for upserts
const SPEC = {
  habits: { pk: ["id"], conflict: "id" },
  completions: { pk: ["habit_id", "day"], conflict: "habit_id,day" },
  todos: { pk: ["id"], conflict: "id" },
  day_reviews: { pk: ["user_id", "day"], conflict: "user_id,day" },
  streak_revives: { pk: ["user_id", "missed_day"], conflict: "user_id,missed_day" },
  chapters: { pk: ["id"], conflict: "id" },
};
const UPSERT_ORDER = ["habits", "completions", "todos", "day_reviews", "streak_revives", "chapters"];
const DELETE_ORDER = ["completions", "day_reviews", "streak_revives", "todos", "chapters", "habits"];

const keyOf = (table, row) => SPEC[table].pk.map((c) => row[c]).join("|");

// ------------------------------------------------------------ state <-> rows

export function toRows(state, uid) {
  const p = state.profile || {};
  const meta = state.meta || {};
  const habits = state.habits || [];
  const known = new Set(habits.map((h) => h.id));

  const profile = {
    name: p.nick ?? "",
    path: nul(p.path),
    goal: nul(p.goal),
    companion: state.companion || {},
    settings: state.settings || {},
    start_date: nul(meta.start),
    extra: {
      v: nul(state.v),
      meta: { created: nul(meta.created), months: meta.months || [] },
      seen: nul(state.seen),
      moments: state.moments || [],
    },
    onboarded: true,
  };

  const completions = [];
  for (const [day, entries] of Object.entries(state.log || {})) {
    for (const [habitId, code] of Object.entries(entries || {})) {
      if (known.has(habitId) && code) completions.push({ user_id: uid, habit_id: habitId, day, code });
    }
  }

  return {
    profile,
    habits: habits.map((h, i) => ({
      id: h.id,
      user_id: uid,
      name: h.name ?? "",
      target: nul(h.target),
      diff: h.diff ?? 2,
      days: h.days || [],
      time: nul(h.time),
      icon: nul(h.icon),
      cat: nul(h.cat),
      color: nul(h.color),
      catalog_id: nul(h.catalogId),
      created_at: nul(h.createdAt),
      archived_at: nul(h.archivedAt),
      sort: i,
    })),
    completions,
    todos: (state.todos || []).map((t) => ({
      id: t.id,
      user_id: uid,
      title: t.title ?? "",
      date: nul(t.date),
      time: nul(t.time),
      dur: t.dur ?? 30,
      done: !!t.done,
      done_on: nul(t.doneOn),
      created_at: nul(t.createdAt),
    })),
    // the numeric part of a day review; its text comes with the month document
    day_reviews: Object.entries(state.reviews || {}).map(([day, r]) => ({
      user_id: uid,
      day,
      ai_score: typeof r?.ai === "number" ? r.ai : null,
      at: nul(r?.at),
    })),
    streak_revives: Object.entries(state.streak?.revived || {}).map(([missed, on]) => ({ user_id: uid, missed_day: missed, revived_on: on })),
  };
}

/** rows: {profile, habits, completions, todos, day_reviews, streak_revives, groups: [id]} -> state, or null before onboarding. */
export function fromRows(rows) {
  const p = rows.profile;
  if (!p || !p.onboarded) return null;
  const extra = p.extra || {};
  const log = {};
  for (const c of rows.completions || []) (log[c.day] ||= {})[c.habit_id] = c.code;
  const reviews = {};
  for (const r of rows.day_reviews || []) {
    // a row that only carries text (no score, no time) is not a closed day
    if (r.ai_score == null && r.at == null) continue;
    reviews[r.day] = { ai: r.ai_score, at: r.at };
  }
  const revived = {};
  for (const r of rows.streak_revives || []) revived[r.missed_day] = r.revived_on;
  const meta = extra.meta || {};
  return {
    v: extra.v ?? undefined,
    profile: { nick: p.name, path: p.path, goal: p.goal },
    companion: p.companion || {},
    habits: [...(rows.habits || [])]
      .sort((a, b) => a.sort - b.sort)
      .map((h) => ({
        id: h.id,
        catalogId: h.catalog_id,
        name: h.name,
        icon: h.icon,
        cat: h.cat,
        diff: h.diff,
        days: h.days || [],
        time: h.time,
        target: h.target,
        color: h.color,
        createdAt: h.created_at,
        archivedAt: h.archived_at,
      })),
    log,
    reviews,
    todos: (rows.todos || []).map((t) => ({
      id: t.id,
      title: t.title,
      date: t.date,
      time: t.time,
      dur: t.dur,
      done: t.done,
      doneOn: t.done_on,
      createdAt: t.created_at,
    })),
    streak: { revived },
    settings: p.settings || {},
    meta: { start: p.start_date, created: meta.created, months: meta.months || [] },
    groups: rows.groups || [],
    seen: extra.seen ?? null,
    moments: extra.moments || [],
  };
}

// ------------------------------------------------------------ month documents <-> rows

export function monthToRows(doc, uid) {
  const d = doc || {};
  return {
    chapters: (d.chapters || []).map((c) => ({
      id: c.id,
      user_id: uid,
      day: c.day,
      title: nul(c.title),
      story: nul(c.story),
      stage: nul(c.stage),
      ai: !!c.ai,
      at: nul(c.at),
    })),
    day_reviews: Object.entries(d.reviews || {}).map(([day, r]) => ({
      user_id: uid,
      day,
      summary: nul(r.summary),
      highlight: nul(r.highlight),
      tip: nul(r.tip),
      ai: !!r.ai,
    })),
  };
}

export function rowsToMonth(rows) {
  const reviews = {};
  for (const r of rows.day_reviews || []) {
    if (r.summary == null && r.highlight == null && r.tip == null) continue;
    reviews[r.day] = { summary: r.summary, highlight: r.highlight, tip: r.tip, ai: r.ai, score: r.ai_score };
  }
  const chapters = (rows.chapters || [])
    .map((c) => ({ id: c.id, type: "chapter", day: c.day, at: c.at, stage: c.stage, title: c.title, story: c.story, ai: c.ai }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return { chapters, reviews };
}

/** [first day, first day of next month) for a "YYYY-MM" key. */
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${ym}-01`, `${next}-01`];
}

// ------------------------------------------------------------ diffs

/** Compares row sets table by table; returns {upserts: {table: rows}, deletes: {table: rows}}. */
function diffTables(prev, next, tables) {
  const upserts = {};
  const deletes = {};
  for (const t of tables) {
    const before = new Map((prev[t] || []).map((r) => [keyOf(t, r), r]));
    const after = new Map((next[t] || []).map((r) => [keyOf(t, r), r]));
    const up = [...after].filter(([k, r]) => !before.has(k) || !eq(before.get(k), r)).map(([, r]) => r);
    const del = [...before].filter(([k]) => !after.has(k)).map(([, r]) => r);
    if (up.length) upserts[t] = up;
    if (del.length) deletes[t] = del;
  }
  return { upserts, deletes };
}

/** Turns table -> deleted rows into matches: single-column keys batch into one `in`, composite ones group by their first column. */
function deleteMatches(table, rows) {
  const pk = SPEC[table].pk;
  if (pk.length === 1) return [{ table, match: { [pk[0]]: rows.map((r) => r[pk[0]]) } }];
  const [lead, last] = [pk[0], pk[pk.length - 1]];
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r[lead])) groups.set(r[lead], []);
    groups.get(r[lead]).push(r[last]);
  }
  return [...groups].map(([v, vals]) => ({ table, match: { [lead]: v, [last]: vals } }));
}

function toOps({ upserts, deletes }, extra = []) {
  const ops = [...extra];
  for (const t of UPSERT_ORDER) if (upserts[t]) ops.push({ op: "upsert", table: t, rows: upserts[t], onConflict: SPEC[t].conflict });
  for (const t of DELETE_ORDER) if (deletes[t]) for (const m of deleteMatches(t, deletes[t])) ops.push({ op: "delete", ...m });
  return ops;
}

const TABLES = Object.keys(SPEC);

/** What the profile row looks like before onboarding (and after "delete all data"). */
export const EMPTY_PROFILE = { name: "", path: null, goal: null, companion: {}, settings: {}, start_date: null, extra: {}, onboarded: false };

/** The writes that turn `prev` into `next` (either may be null = no data). */
export function diff(prev, next, uid) {
  const a = prev ? toRows(prev, uid) : {};
  const b = next ? toRows(next, uid) : {};
  const ops = [];
  if (next) {
    // the profile row always exists (signup trigger), so it is updated, never inserted
    if (!prev || !eq(a.profile, b.profile)) ops.push({ op: "update", table: "profiles", match: { id: uid }, row: b.profile });
  } else if (prev) {
    ops.push({ op: "update", table: "profiles", match: { id: uid }, row: EMPTY_PROFILE });
  }
  return toOps(diffTables(a, b, ["habits", "completions", "todos", "day_reviews", "streak_revives"]), ops);
}

/** Same for one month document. Review text goes into day_reviews as a partial row. */
export function diffMonth(prev, next, uid) {
  const a = prev ? monthToRows(prev, uid) : {};
  const b = next ? monthToRows(next, uid) : {};
  const { upserts, deletes } = diffTables(a, b, ["chapters", "day_reviews"]);
  // a removed review text clears the text columns; the score row stays with the state
  const cleared = (deletes.day_reviews || []).map((r) => ({ user_id: r.user_id, day: r.day, summary: null, highlight: null, tip: null, ai: false }));
  delete deletes.day_reviews;
  if (cleared.length) upserts.day_reviews = [...(upserts.day_reviews || []), ...cleared];
  return toOps({ upserts, deletes });
}

// ------------------------------------------------------------ supabase-js

export async function applyOps(client, ops) {
  for (const o of ops) {
    let q;
    if (o.op === "upsert") q = client.from(o.table).upsert(o.rows, { onConflict: o.onConflict });
    else if (o.op === "update") q = client.from(o.table).update(o.row).match(o.match);
    else {
      q = client.from(o.table).delete();
      for (const [col, v] of Object.entries(o.match)) q = Array.isArray(v) ? q.in(col, v) : q.eq(col, v);
    }
    const { error } = await q;
    if (error) throw error;
  }
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function loadState(client, uid) {
  const [profile, habits, completions, todos, day_reviews, streak_revives, groups] = await Promise.all([
    client.from("profiles").select("*").eq("id", uid).maybeSingle().then(must),
    client.from("habits").select("*").then(must),
    client.from("completions").select("habit_id, day, code").then(must),
    client.from("todos").select("*").then(must),
    client.from("day_reviews").select("day, ai_score, at").then(must),
    client.from("streak_revives").select("missed_day, revived_on").then(must),
    client.from("group_members").select("group_id").eq("user_id", uid).then(must),
  ]);
  return fromRows({ profile, habits, completions, todos, day_reviews, streak_revives, groups: (groups || []).map((g) => g.group_id) });
}

export async function loadMonth(client, uid, ym) {
  const [from, to] = monthRange(ym);
  const inMonth = (t, cols) => client.from(t).select(cols).gte("day", from).lt("day", to).then(must);
  const [chapters, day_reviews] = await Promise.all([
    inMonth("chapters", "*"),
    inMonth("day_reviews", "day, ai_score, summary, highlight, tip, ai"),
  ]);
  const doc = rowsToMonth({ chapters, day_reviews });
  return doc.chapters.length || Object.keys(doc.reviews).length ? doc : null;
}

export { TABLES };
