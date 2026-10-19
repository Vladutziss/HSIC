// Regenerates sprites-golden.json from the CURRENT renderer. Only run it when a sprite is changed on purpose.
import { writeFileSync } from "node:fs";
import { snapshot } from "./sprites-snapshot.mjs";

const snap = snapshot();
writeFileSync(new URL("./sprites-golden.json", import.meta.url), JSON.stringify(snap, null, 1));
console.log(Object.keys(snap).length, "sprites");
