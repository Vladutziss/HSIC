import test from "node:test";
import assert from "node:assert/strict";
import { rescueInfo } from "../src/lib/rescue.js";

const state = (todos = []) => ({ todos });
const day = "2026-10-12";

const d = (overrides = {}) => ({
  resetRisk: false,
  companion: { mood: "calm", awayDays: 0 },
  scheduled: [{ h: { name: "Citit" }, code: 0 }],
  ...overrides,
});

test("rescue offers one easy step before a reset", () => {
  assert.deepEqual(rescueInfo(d({ resetRisk: true }), state(), day), {
    title: "Revenire: Citit - versiunea usoara",
    date: day,
    dur: 10,
    reason: "Un pas mic azi poate opri seria de zile fara activitate.",
    source: "reset-risk",
  });
});

test("rescue offers a small step after returning from a break", () => {
  const result = rescueInfo(d({ companion: { mood: "joy", awayDays: 2 } }), state(), day);
  assert.equal(result.source, "return");
  assert.equal(result.dur, 10);
});

test("rescue does not duplicate an open step for the same day", () => {
  const todos = [{ date: day, done: false, title: "Revenire: Citit - versiunea usoara" }];
  assert.equal(rescueInfo(d({ resetRisk: true }), state(todos), day), null);
});

test("rescue stays quiet without risk or return", () => {
  assert.equal(rescueInfo(d(), state(), day), null);
});
