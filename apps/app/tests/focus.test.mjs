import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, continueWork, finish, fmtClock, fmtSpan, newSession, pause, resume, view, workMs } from "../src/lib/focus.js";

const MIN = 60000;
const T0 = 1_700_000_000_000;

test("a free session counts focused time and ignores pauses", () => {
  let s = newSession(T0);
  assert.equal(workMs(s, T0 + 10 * MIN), 10 * MIN);
  s = pause(s, T0 + 10 * MIN);
  assert.equal(workMs(s, T0 + 50 * MIN), 10 * MIN, "paused time does not count");
  s = resume(s, T0 + 50 * MIN);
  assert.equal(workMs(s, T0 + 55 * MIN), 15 * MIN);
  assert.equal(advance(s, T0 + 999 * MIN).events.length, 0, "no phases without a pomodoro");
});

test("pomodoro: work, break, wait, then work again", () => {
  let s = newSession(T0, { work: 25, brk: 5 });
  assert.equal(advance(s, T0 + 24 * MIN).session.phase, "work");

  let r = advance(s, T0 + 25 * MIN);
  assert.deepEqual(r.events, ["break"]);
  assert.equal(r.session.phase, "break");
  assert.equal(r.session.cycles, 1);
  assert.equal(workMs(r.session, T0 + 27 * MIN), 25 * MIN, "work stops during the break");
  assert.equal(view(r.session, T0 + 27 * MIN).remaining, 3 * MIN);

  r = advance(r.session, T0 + 30 * MIN);
  assert.deepEqual(r.events, ["wait"]);
  assert.equal(r.session.phase, "wait");
  assert.equal(workMs(r.session, T0 + 90 * MIN), 25 * MIN, "nothing counts while waiting to continue");

  s = continueWork(r.session, T0 + 40 * MIN);
  assert.equal(s.phase, "work");
  assert.equal(workMs(s, T0 + 45 * MIN), 30 * MIN);
});

test("a tab that slept catches up through every due phase, at the exact times", () => {
  const s = newSession(T0, { work: 25, brk: 5 });
  const r = advance(s, T0 + 61 * MIN); // 25 work, 5 break, wait since 30 min
  assert.deepEqual(r.events, ["break", "wait"]);
  assert.equal(r.session.phase, "wait");
  assert.equal(workMs(r.session, T0 + 61 * MIN), 25 * MIN);
  assert.equal(r.session.breakMs, 5 * MIN);
});

test("pausing mid-work shifts the break; skipping a break goes back to work", () => {
  let s = newSession(T0, { work: 25, brk: 5 });
  s = pause(s, T0 + 20 * MIN);
  s = resume(s, T0 + 60 * MIN);
  assert.equal(advance(s, T0 + 64 * MIN).session.phase, "work");
  assert.deepEqual(advance(s, T0 + 65 * MIN).events, ["break"]);

  const b = advance(s, T0 + 66 * MIN).session; // 1 minute into the break
  const w = continueWork(b, T0 + 66 * MIN);
  assert.equal(w.phase, "work");
  assert.equal(w.breakMs, 1 * MIN);
});

test("every 4th break is a long one", () => {
  let s = newSession(T0, { work: 25, brk: 5 });
  let t = T0;
  for (let i = 1; i <= 4; i++) {
    t += 25 * MIN;
    s = advance(s, t).session;
    assert.equal(s.phase, "break");
    assert.equal(view(s, t).longBreak, i === 4);
    assert.equal(view(s, t).limitMs, (i === 4 ? 15 : 5) * MIN);
    t += (i === 4 ? 15 : 5) * MIN;
    s = continueWork(advance(s, t).session, t);
  }
});

test("finishing keeps focused time, and drops sessions under a minute", () => {
  assert.equal(finish(newSession(T0), T0 + 30_000), null);
  let s = newSession(T0, { work: 25, brk: 5 });
  const rec = finish(s, T0 + 40 * MIN); // 25 work, 5 break, waiting
  assert.equal(rec.work, 25 * 60);
  assert.equal(rec.breaks, 5 * 60);
  assert.equal(rec.cycles, 1);
  assert.deepEqual(rec.pomodoro, { work: 25, brk: 5 });

  const free = finish(pause(newSession(T0), T0 + 90 * MIN), T0 + 500 * MIN);
  assert.equal(free.work, 90 * 60);
  assert.equal(free.cycles, 0);
});

test("formats", () => {
  assert.equal(fmtClock(3725_000), "01:02:05");
  assert.equal(fmtSpan(42 * 60), "42 min");
  assert.equal(fmtSpan(3725), "1 h 02 min");
});

test("focus history survives the database round trip", async () => {
  const { fromRows, toRows } = await import("../src/lib/remote.js");
  const rec = { id: "f1", start: T0, end: T0 + 30 * MIN, work: 1500, breaks: 300, cycles: 1, pomodoro: { work: 25, brk: 5 } };
  const state = { profile: { nick: "a", path: "sport" }, habits: [], log: {}, reviews: {}, todos: [], focusSessions: [rec], meta: { start: "2026-10-05" } };
  const rows = toRows(state, "u1");
  const back = fromRows({ profile: { ...rows.profile, onboarded: true } });
  assert.deepEqual(back.focusSessions, [rec]);
  const none = fromRows({ profile: { ...toRows({ ...state, focusSessions: [] }, "u1").profile, onboarded: true } });
  assert.equal(none.focusSessions, undefined);
});
