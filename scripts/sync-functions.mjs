// Edge Functions are bundled from supabase/functions only, so the shared rules are copied there.
// Run before `supabase functions deploy stats` (npm run sync:functions).
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("supabase/functions/_shared/app", { recursive: true });
for (const f of ["dates", "engine", "remote", "stats"]) cpSync(`apps/app/src/lib/${f}.js`, `supabase/functions/_shared/app/${f}.js`);
