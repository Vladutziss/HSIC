// Postgres persistence for the Supabase mode. The app keeps working with the
// same `state` object (and month documents) it always had; this file turns it
// into table rows and back:
//
//   toRows / fromRows           state          <-> profiles, habits, completions, todos, day_reviews, streak_revives, wardrobe_items, …
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
  subjects: { pk: ["id"], conflict: "id" },
  assignments: { pk: ["id"], conflict: "id" },
  exams: { pk: ["id"], conflict: "id" },
  study_sessions: { pk: ["id"], conflict: "id" },
  wardrobe_items: { pk: ["user_id", "item_id"], conflict: "user_id,item_id" },
};
const UPSERT_ORDER = ["habits", "completions", "todos", "day_reviews", "streak_revives", "chapters", "subjects", "assignments", "exams", "study_sessions", "wardrobe_items"];
const DELETE_ORDER = ["completions", "day_reviews", "streak_revives", "todos", "chapters", "study_sessions", "exams", "assignments", "subjects", "wardrobe_items", "habits"];

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
      focusSessions: state.focusSessions || [],
      goals: state.goals || [],
      objectives: state.objectives || [],
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
      repeat: nul(t.repeat),
      done_days: t.repeat ? t.doneDays || [] : [],
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
    // the wardrobe: one row per unlocked item (what Molt wears is companion.look, the theme is settings.theme)
    wardrobe_items: Object.entries(state.unlocked || {})
      .filter(([id, on]) => id && /^\d{4}-\d{2}-\d{2}$/.test(String(on)))
      .map(([id, on]) => ({ user_id: uid, item_id: id.slice(0, 40), unlocked_on: on })),
    ...plannerRows(state.schoolPlanner, uid),
  };
}

// Homework planner. A subject is the lowercase name, so the id is the same on every device.
// `due` is a local calendar day ('YYYY-MM-DD') and travels as that string, never as a Date.
const subjectKey = (name) => String(name || "").trim().toLowerCase();

function plannerRows(planner, uid) {
  const subjects = new Map();
  const subjectId = (subject) => {
    const name = String(subject || "").trim();
    if (!name) return null;
    const id = `${uid}:${subjectKey(name)}`;
    if (!subjects.has(id)) subjects.set(id, { id, user_id: uid, name });
    return id;
  };
  const titled = (x) => x?.id && String(x.title || "").trim(); // the tables need an id and a title
  const assignments = [];
  for (const a of planner?.assignments || []) {
    if (!titled(a)) continue;
    assignments.push({
      id: a.id,
      user_id: uid,
      subject_id: subjectId(a.subject),
      title: a.title ?? "",
      due: nul(a.due),
      estimated_minutes: a.estimatedMinutes ?? 30,
      done: !!a.done,
    });
  }
  const exams = [];
  for (const e of planner?.exams || []) {
    if (!titled(e) || !e.date) continue; // exams.date is not null
    exams.push({ id: e.id, user_id: uid, subject_id: subjectId(e.subject), title: e.title ?? "", date: e.date, done: !!e.done });
  }
  const known = new Set(assignments.map((a) => a.id));
  const study_sessions = [];
  for (const s of planner?.sessions || []) {
    if (!s?.id || !s.day || !(s.minutes >= 1)) continue;
    study_sessions.push({
      id: s.id,
      user_id: uid,
      subject_id: subjectId(s.subject),
      assignment_id: known.has(s.assignmentId) ? s.assignmentId : null, // FK: a removed assignment must not break the write
      day: s.day,
      minutes: Math.min(1440, Math.round(s.minutes)),
    });
  }
  return { subjects: [...subjects.values()], assignments, exams, study_sessions };
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
      ...(t.repeat ? { repeat: t.repeat, doneDays: t.done_days || [] } : {}),
      createdAt: t.created_at,
    })),
    streak: { revived },
    settings: p.settings || {},
    meta: { start: p.start_date, created: meta.created, months: meta.months || [] },
    groups: rows.groups || [],
    seen: extra.seen ?? null,
    moments: extra.moments || [],
    ...(extra.focusSessions?.length ? { focusSessions: extra.focusSessions } : {}),
    ...(extra.goals?.length ? { goals: extra.goals } : {}),
    ...(extra.objectives?.length ? { objectives: extra.objectives } : {}),
    ...unlockedFromRows(rows, extra, p),
    ...plannerFromRows(rows, extra),
  };
}

// the wardrobe: rows win; the first version kept it in extra (seenItems: [id], earned: {id: day}), which is still read
// so nothing is lost before migration 0025 has copied it
function unlockedFromRows(rows, extra) {
  const out = {};
  const day = /^\d{4}-\d{2}-\d{2}$/;
  for (const id of Array.isArray(extra.seenItems) ? extra.seenItems : []) if (typeof id === "string" && id) out[id] = out[id] || "1970-01-01";
  for (const [id, on] of Object.entries(extra.earned && typeof extra.earned === "object" ? extra.earned : {})) if (id) out[id] = day.test(on) ? on : out[id] || "1970-01-01";
  for (const r of rows.wardrobe_items || []) out[r.item_id] = r.unlocked_on;
  return Object.keys(out).length ? { unlocked: out } : {};
}

// rows win; a profile that still carries extra.schoolPlanner (before migration 0020) is read as before
function plannerFromRows(rows, extra) {
  const { assignments = [], exams = [], study_sessions = [] } = rows;
  if (assignments.length || exams.length || study_sessions.length) {
    const names = new Map((rows.subjects || []).map((s) => [s.id, s.name]));
    const byCreated = (a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""));
    const subject = (r) => names.get(r.subject_id) || "";
    return {
      schoolPlanner: {
        assignments: [...assignments].sort(byCreated).map((a) => ({
          id: a.id,
          title: a.title,
          subject: subject(a),
          due: a.due,
          estimatedMinutes: a.estimated_minutes,
          done: a.done,
        })),
        ...(exams.length ? { exams: [...exams].sort(byCreated).map((e) => ({ id: e.id, subject: subject(e), title: e.title, date: e.date, done: e.done })) } : {}),
        ...(study_sessions.length
          ? { sessions: [...study_sessions].sort(byCreated).map((x) => ({ id: x.id, subject: subject(x), assignmentId: x.assignment_id, day: x.day, minutes: x.minutes })) }
          : {}),
      },
    };
  }
  const old = extra.schoolPlanner;
  return old?.assignments?.length || old?.exams?.length || old?.sessions?.length ? { schoolPlanner: old } : {};
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
  return toOps(diffTables(a, b, ["habits", "completions", "todos", "day_reviews", "streak_revives", "subjects", "assignments", "exams", "study_sessions", "wardrobe_items"]), ops);
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
  const [profile, habits, completions, todos, day_reviews, streak_revives, groups, subjects, assignments, exams, study_sessions, wardrobe_items] = await Promise.all([
    client.from("profiles").select("*").eq("id", uid).maybeSingle().then(must),
    // RLS already scopes these to the caller; the explicit filter keeps the weekly job, which reads
    // other players' rows with the service role (bypassing RLS), from mixing their data
    client.from("habits").select("*").eq("user_id", uid).then(must),
    client.from("completions").select("habit_id, day, code").eq("user_id", uid).then(must),
    client.from("todos").select("*").eq("user_id", uid).then(must),
    client.from("day_reviews").select("day, ai_score, at").eq("user_id", uid).then(must),
    client.from("streak_revives").select("missed_day, revived_on").eq("user_id", uid).then(must),
    client.from("group_members").select("group_id").eq("user_id", uid).then(must),
    client.from("subjects").select("*").eq("user_id", uid).then(must),
    client.from("assignments").select("*").eq("user_id", uid).then(must),
    client.from("exams").select("*").eq("user_id", uid).then(must),
    client.from("study_sessions").select("*").eq("user_id", uid).then(must),
    client.from("wardrobe_items").select("item_id, unlocked_on").eq("user_id", uid).then(must),
  ]);
  return fromRows({ profile, habits, completions, todos, day_reviews, streak_revives, subjects, assignments, exams, study_sessions, wardrobe_items, groups: (groups || []).map((g) => g.group_id) });
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
