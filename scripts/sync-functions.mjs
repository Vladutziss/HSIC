// Edge Functions are bundled from supabase/functions only, so the shared rules are copied there.
// Run before `supabase functions deploy stats` (npm run sync:functions).
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("supabase/functions/_shared/app", { recursive: true });
for (const f of ["dates", "engine", "objectives", "remote", "stats", "coach", "patterns", "memory", "experiments", "history", "outcomes", "schoolPlanner", "retired", "todos", "ics", "mdExport", "webhookUrl"]) cpSync(`apps/app/src/lib/${f}.js`, `supabase/functions/_shared/app/${f}.js`);
// the app files import ./i18n.js (React, two languages): the server gets a plain Romanian stand-in
cpSync("scripts/server-i18n.js", "supabase/functions/_shared/app/i18n.js");
// ...which can still answer in English for one player (trFor), from the app's dictionary
cpSync("apps/app/src/i18n/en.js", "supabase/functions/_shared/app/en.js");
