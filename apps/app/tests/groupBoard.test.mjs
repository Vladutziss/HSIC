import test from "node:test";
import assert from "node:assert/strict";
import { weekGainNow, withFreshWeek } from "../src/lib/groupBoard.js";

const TODAY = "2026-11-27"; // Friday, the week started on Monday 2026-11-23
const at = (d) => new Date(d + "T12:00:00").toISOString();

test("a snapshot from before this Monday does not count for this week", () => {
  assert.equal(weekGainNow({ id: "a", weekGain: 90, updatedAt: at("2026-11-20") }, TODAY), 0);
});

test("a snapshot from Monday or later keeps its weekly gain", () => {
  assert.equal(weekGainNow({ id: "a", weekGain: 40, updatedAt: at("2026-11-23") }, TODAY), 40);
  assert.equal(weekGainNow({ id: "a", weekGain: 40, updatedAt: at("2026-11-27") }, TODAY), 40);
});

test("your own row is live and never zeroed", () => {
  assert.equal(weekGainNow({ id: "me", isMe: true, weekGain: 12, updatedAt: at("2026-11-01") }, TODAY), 12);
});

test("missing or invalid dates change nothing", () => {
  assert.equal(weekGainNow({ id: "a", weekGain: 7 }, TODAY), 7);
  assert.equal(weekGainNow({ id: "a", weekGain: 7, updatedAt: "nope" }, TODAY), 7);
  assert.equal(weekGainNow({ id: "a" }, TODAY), 0);
});

test("a member who never opened the app this week no longer outranks an active one", () => {
  const rows = withFreshWeek(
    [
      { id: "idle", weekGain: 120, updatedAt: at("2026-11-18") },
      { id: "active", weekGain: 35, updatedAt: at("2026-11-26") },
    ],
    TODAY
  ).sort((a, b) => b.weekGain - a.weekGain);
  assert.deepEqual(rows.map((r) => r.id), ["active", "idle"]);
  assert.equal(rows[1].weekGain, 0);
});
