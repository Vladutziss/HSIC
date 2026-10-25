import test from "node:test";
import assert from "node:assert/strict";
import { addSchoolItem, addStudySession, nextAssignments, nextExams, normalizeAssignments, normalizeExams, normalizeSession, setSchoolDone, studiedMinutes, studyWeek } from "../src/lib/schoolPlanner.js";

const today = "2026-10-12";

test("normalizes AI assignments and rejects empty titles", () => {
  assert.deepEqual(normalizeAssignments([{ title: "  Test mate  ", subject: "Mate", due: "2026-10-14", estimatedMinutes: 90 }, { title: "" }], today), [
    { title: "Test mate", subject: "Mate", due: "2026-10-14", estimatedMinutes: 90 },
  ]);
});

test("invalid dates fall back to today and duration is bounded", () => {
  assert.deepEqual(normalizeAssignments([{ title: "Proiect", due: "vineri", estimatedMinutes: 9999 }], today), [
    { title: "Proiect", subject: "", due: today, estimatedMinutes: 600 },
  ]);
});

test("nextAssignments excludes done and past work and sorts by deadline", () => {
  const state = { schoolPlanner: { assignments: [
    { id: "late", title: "Trecut", due: "2026-10-10", done: false },
    { id: "later", title: "Mai tarziu", due: "2026-10-20", done: false },
    { id: "soon", title: "Urgent", due: "2026-10-13", done: false },
    { id: "done", title: "Gata", due: "2026-10-13", done: true },
  ] } };
  assert.deepEqual(nextAssignments(state, today).map((a) => a.id), ["soon", "later"]);
});

test("exams: AI items with a due day become exams and upcoming ones count local days left", () => {
  assert.deepEqual(normalizeExams([{ type: "exam", title: " Test mate ", subject: "Mate", due: "2026-10-15" }, { title: "" }], today), [
    { title: "Test mate", subject: "Mate", date: "2026-10-15" },
  ]);
  const state = { schoolPlanner: { exams: [
    { id: "e1", title: "Mate", date: "2026-10-15", done: false },
    { id: "e2", title: "Azi", date: today, done: false },
    { id: "e3", title: "Trecut", date: "2026-10-01", done: false },
    { id: "e4", title: "Gata", date: "2026-10-14", done: true },
  ] } };
  assert.deepEqual(nextExams(state, today).map((e) => [e.id, e.daysLeft]), [["e2", 0], ["e1", 3]]);
  assert.deepEqual(nextExams({}, today), []);
});

test("exam days left are calendar days in any time zone (DST included)", () => {
  const saved = process.env.TZ;
  try {
    for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "Europe/Bucharest"]) {
      process.env.TZ = tz;
      // 2026-10-25 is the end of DST in Europe; 11-01 in the US
      assert.equal(nextExams({ schoolPlanner: { exams: [{ id: "e", title: "x", date: "2026-11-02" }] } }, "2026-10-24")[0].daysLeft, 9, tz);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test("study sessions: bounded minutes, local day default, totals per day and subject", () => {
  assert.equal(normalizeSession({ minutes: 0 }, today), null);
  assert.deepEqual(normalizeSession({ subject: " Mate ", minutes: 5000, assignmentId: "a-1" }, today), { subject: "Mate", assignmentId: "a-1", day: today, minutes: 1440 });
  const state = { schoolPlanner: { sessions: [
    { id: "s1", subject: "Mate", day: today, minutes: 25 },
    { id: "s2", subject: "mate", day: today, minutes: 15 },
    { id: "s3", subject: "Fizică", day: today, minutes: 30 },
    { id: "s4", subject: "Mate", day: "2026-10-11", minutes: 60 },
  ] } };
  assert.equal(studiedMinutes(state, today), 70);
  assert.equal(studiedMinutes(state, today, "Mate"), 40);
});

test("addSchoolItem adds an assignment or an exam by hand and ignores an empty title", () => {
  const empty = { assignments: [], exams: [], sessions: [] };
  const a = addSchoolItem(empty, "assignment", { title: " Referat ", subject: "Istorie", due: "2026-10-20", estimatedMinutes: 60 }, today, "a-1");
  assert.deepEqual(a.assignments, [{ title: "Referat", subject: "Istorie", due: "2026-10-20", estimatedMinutes: 60, id: "a-1", done: false }]);
  const e = addSchoolItem(a, "exam", { title: "Test mate", subject: "Mate", date: "2026-10-22" }, today, "e-1");
  assert.deepEqual(e.exams, [{ title: "Test mate", subject: "Mate", date: "2026-10-22", id: "e-1", done: false }]);
  assert.equal(e.assignments.length, 1);
  assert.equal(addSchoolItem(empty, "exam", { title: "  " }, today), empty);
});

test("setSchoolDone ticks one item and leaves the rest", () => {
  const p = { assignments: [{ id: "a", title: "A", done: false }, { id: "b", title: "B", done: false }], exams: [{ id: "e", title: "E", date: today, done: false }] };
  const next = setSchoolDone(p, "assignment", "a", true);
  assert.deepEqual(next.assignments.map((x) => x.done), [true, false]);
  assert.equal(setSchoolDone(next, "exam", "e", true).exams[0].done, true);
  assert.equal(setSchoolDone(next, "assignment", "a", false).assignments[0].done, false);
});

test("addStudySession keeps valid blocks only, and studyWeek sums seven days by day and by subject", () => {
  let p = { sessions: [] };
  p = addStudySession(p, { subject: "Mate", minutes: 25 }, today, "s1");
  p = addStudySession(p, { subject: "mate ", minutes: 0 }, today, "s2");
  assert.equal(p.sessions.length, 1);
  p = addStudySession(p, { subject: "Chimie", minutes: 45, day: "2026-10-10" }, today, "s3");
  p = addStudySession(p, { subject: "Mate", minutes: 30, day: "2026-10-01" }, today, "s4");
  const w = studyWeek({ schoolPlanner: p }, today);
  assert.equal(w.days.length, 7);
  assert.equal(w.days[6].day, today);
  assert.equal(w.total, 70);
  assert.deepEqual(w.bySubject, [{ subject: "Chimie", minutes: 45 }, { subject: "Mate", minutes: 25 }]);
  assert.deepEqual(studyWeek({}, today).bySubject, []);
});
