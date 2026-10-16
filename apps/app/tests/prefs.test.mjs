import { test } from "node:test";
import assert from "node:assert/strict";

const store = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
// a fresh copy of the module, so its start-up read of the device can be tested
let n = 0;
const load = async (ls) => {
  if (ls) globalThis.localStorage = ls;
  else delete globalThis.localStorage;
  return import(`../src/lib/prefs.js?copy=${n++}`);
};

test("setPref shows the value, keeps a device copy and hands the full set to the saver", async () => {
  const ls = store();
  const p = await load(ls);
  const saved = [];
  p.bindPrefsSync((v) => saved.push(v));
  assert.equal(p.getPref("sidebar", "open"), "open");
  p.setPref("sidebar", "closed");
  p.setPref("habitsLayout", "compact");
  assert.equal(p.getPref("sidebar", "open"), "closed");
  assert.deepEqual(saved.at(-1), { sidebar: "closed", habitsLayout: "compact" });
  assert.deepEqual(JSON.parse(ls.getItem("molted.prefs")), { sidebar: "closed", habitsLayout: "compact" });
});

test("the account's choices win key by key, and loading them is not saved back", async () => {
  const p = await load(store());
  const saved = [];
  p.setPref("sidebar", "open");
  p.setPref("habitsLayout", "compact");
  p.bindPrefsSync((v) => saved.push(v));
  p.hydratePrefs({ sidebar: "closed", focus: { clock: "digital" } });
  assert.equal(p.getPref("sidebar"), "closed");
  assert.equal(p.getPref("habitsLayout"), "compact"); // only on this device so far: kept
  assert.deepEqual(p.getPref("focus"), { clock: "digital" });
  assert.deepEqual(saved, []);
  // the same values again change nothing; junk is ignored
  let calls = 0;
  p.bindPrefsSync(() => calls++);
  p.hydratePrefs(p.allPrefs());
  p.hydratePrefs(null);
  p.hydratePrefs("x");
  assert.equal(calls, 0);
});

test("choices made before accounts held them (one localStorage key each) are read once", async () => {
  const ls = store();
  ls.setItem("molted.sidebar", "closed");
  ls.setItem("molted.habitsLayout", "details");
  ls.setItem("molted.habitsSort", JSON.stringify({ sort: "name", desc: true }));
  ls.setItem("molted.focusPrefs", JSON.stringify({ clock: "digital", todosOpen: true }));
  const p = await load(ls);
  assert.deepEqual(p.allPrefs(), { sidebar: "closed", habitsLayout: "details", habitsSort: { sort: "name", desc: true }, focus: { clock: "digital", todosOpen: true } });
  // once the new key exists it is the one that counts
  const q = await load(Object.assign(store(), { getItem: (k) => (k === "molted.prefs" ? JSON.stringify({ sidebar: "open" }) : ls.getItem(k)) }));
  assert.deepEqual(q.allPrefs(), { sidebar: "open" });
});

test("without any storage (private mode) the choices still work until the page closes", async () => {
  const p = await load(null);
  p.setPref("sidebar", "closed");
  assert.equal(p.getPref("sidebar", "open"), "closed");
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const q = await load(broken);
  assert.deepEqual(q.allPrefs(), {});
  q.setPref("a", 1);
  assert.equal(q.getPref("a"), 1);
});

test("the Focus screen's preferences go through the same store", async () => {
  const ls = store();
  globalThis.localStorage = ls;
  const p = await import(`../src/lib/prefs.js?copy=${n++}`);
  const saved = [];
  p.bindPrefsSync((v) => saved.push(v));
  p.setPref("focus", { ...p.getPref("focus", {}), clock: "digital" });
  p.setPref("focus", { ...p.getPref("focus", {}), todosOpen: true });
  assert.deepEqual(saved.at(-1).focus, { clock: "digital", todosOpen: true });
});
