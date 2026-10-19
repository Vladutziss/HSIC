// A short hash of every sprite frame the app can draw without a custom look (5 classes x 6 stages x 4 moods x 2 eye
// frames x 3 crack levels). sprites.test.mjs compares it with sprites-golden.json, so a change to the renderer that
// alters today's look fails the test. Regenerate the file on purpose with: node tests/fixtures/sprites-golden.gen.mjs
import { createHash } from "node:crypto";
import { spriteRuns } from "../../src/lib/sprites.js";

export const PATHS = ["sport", "studiu", "bani", "minte", "creativ"];
export const STAGES = ["egg", "hatchling", "apprentice", "adept", "master", "legend"];
export const MOODS = ["idle", "happy", "joy", "sleep"];
export const EYES = ["open", "closed"];
export const CRACKS = [0, 1, 2];

export const hashRuns = (runs) => createHash("sha1").update(JSON.stringify(runs)).digest("hex").slice(0, 16);

export function snapshot(look) {
  const out = {};
  for (const path of PATHS) for (const stage of STAGES) for (const mood of MOODS) for (const eyes of EYES) for (const crack of CRACKS) {
    out[`${path}|${stage}|${mood}|${eyes}|${crack}`] = hashRuns(spriteRuns({ path, stage, mood, eyes, crack, look }));
  }
  return out;
}
