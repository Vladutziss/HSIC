import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_LOOK, resolveLook, spriteRuns } from "../src/lib/sprites.js";
import { PATHS, STAGES, hashRuns, snapshot } from "./fixtures/sprites-snapshot.mjs";

const golden = JSON.parse(readFileSync(new URL("./fixtures/sprites-golden.json", import.meta.url), "utf8"));

test("without a look every frame is exactly what the app drew before looks existed", () => {
  const now = snapshot();
  assert.equal(Object.keys(now).length, Object.keys(golden).length);
  const changed = Object.keys(golden).filter((k) => golden[k] !== now[k]);
  assert.deepEqual(changed, []);
});

test("the default look is the same as no look", () => {
  assert.deepEqual(snapshot(DEFAULT_LOOK), golden);
  assert.deepEqual(snapshot({}), golden);
  assert.deepEqual(snapshot(null), golden);
});

test("an unknown or malformed look falls back to the defaults and cannot break the drawing", () => {
  assert.deepEqual(resolveLook({ hat: "does-not-exist", held: 7, aura: {}, dye: ["x"] }), DEFAULT_LOOK);
  assert.deepEqual(resolveLook({ hat: "__proto__", held: "constructor", aura: "toString" }), DEFAULT_LOOK);
  assert.deepEqual(snapshot({ hat: "nope", aura: "nope" }), golden);
});

test("taking the hat or the held item off changes a stage that wears them and nothing else", () => {
  const frame = (stage, look) => hashRuns(spriteRuns({ path: "studiu", stage, look }));
  for (const stage of STAGES) {
    const wearsHat = ["apprentice", "adept", "master", "legend"].includes(stage);
    assert.equal(frame(stage, { hat: "none" }) !== frame(stage), wearsHat, `hat on ${stage}`);
    const wearsHeld = ["adept", "master", "legend"].includes(stage);
    assert.equal(frame(stage, { held: "none" }) !== frame(stage), wearsHeld, `held on ${stage}`);
  }
});

test("every class has a hat and a held item to take off", () => {
  for (const path of PATHS) {
    const a = hashRuns(spriteRuns({ path, stage: "legend" }));
    assert.notEqual(hashRuns(spriteRuns({ path, stage: "legend", look: { hat: "none" } })), a, path);
    assert.notEqual(hashRuns(spriteRuns({ path, stage: "legend", look: { held: "none" } })), a, path);
  }
});
