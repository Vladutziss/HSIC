import test from "node:test";
import assert from "node:assert/strict";
import { MAX_LINKS, childrenOf, liveLinks, milestoneSet, normalizeGoal, progressOf, statusPatch, suggestDone, toggleLink, topLevel } from "../src/lib/milestones.js";

test("old flat goals normalize with safe defaults", () => {
  const g = normalizeGoal({ id: "a", period: "week", key: "k", text: "x", done: true });
  assert.equal(g.status, "done");
  assert.equal(g.parentId, null);
  assert.deepEqual(g.todoIds, []);
  assert.equal(normalizeGoal({ id: "b", text: "y", due: "mâine", status: "zzz" }).due, null);
});

test("milestone set links children to the parent and progress counts them", () => {
  let n = 0;
  const set = milestoneSet({ period: "month", key: "2026-10", text: "P" }, [{ period: "week", key: "w", text: "a" }, { period: "week", key: "w", text: "b", due: "2026-10-20" }], (g) => ({ id: `o${++n}`, done: false, ...g }));
  assert.equal(set.length, 3);
  assert.ok(set.slice(1).every((c) => c.parentId === set[0].id));
  set[1].done = true;
  assert.deepEqual(progressOf(set, set[0].id), { done: 1, total: 2 });
  assert.equal(childrenOf(set, set[0].id).length, 2);
  assert.deepEqual(topLevel(set.slice(1)).length, 2); // orphans (parent missing) stay visible
  assert.deepEqual(topLevel(set).map((g) => g.id), [set[0].id]);
});

test("links toggle, are capped, and stale ids are filtered out", () => {
  assert.deepEqual(toggleLink([], "a"), ["a"]);
  assert.deepEqual(toggleLink(["a", "b"], "a"), ["b"]);
  assert.equal(toggleLink(["a", "b", "c"], "d").length, MAX_LINKS);
  assert.deepEqual(toggleLink(undefined, "a"), ["a"]);
  const g = { id: "g", todoIds: ["t1", "gone"], habitIds: ["h1", "h2"] };
  const l = liveLinks(g, [{ id: "t1" }], [{ id: "h1" }, { id: "h2", archivedAt: "2026-01-01" }]);
  assert.deepEqual(l.todos.map((t) => t.id), ["t1"]);
  assert.deepEqual(l.habits.map((h) => h.id), ["h1"]);
});

test("status patch keeps done in step, and done-able is suggested only when all live linked todos are done", () => {
  assert.deepEqual(statusPatch("done", "2026-10-13"), { status: "done", done: true, doneOn: "2026-10-13" });
  assert.deepEqual(statusPatch("dropped", "2026-10-13"), { status: "dropped", done: false, doneOn: null });
  const g = { id: "g", todoIds: ["t1", "t2", "gone"] };
  assert.equal(suggestDone(g, [{ id: "t1", done: true }, { id: "t2", done: false }]), false);
  assert.equal(suggestDone(g, [{ id: "t1", done: true }, { id: "t2", done: true }]), true);
  assert.equal(suggestDone({ ...g, status: "dropped" }, [{ id: "t1", done: true }, { id: "t2", done: true }]), false);
  assert.equal(suggestDone({ id: "x" }, []), false); // nothing linked
});

test("progress counts done by status and skips dropped milestones", () => {
  const goals = [{ id: "p" }, { id: "a", parentId: "p", status: "done" }, { id: "b", parentId: "p", status: "dropped" }, { id: "c", parentId: "p" }];
  assert.deepEqual(progressOf(goals, "p"), { done: 1, total: 2 });
});
