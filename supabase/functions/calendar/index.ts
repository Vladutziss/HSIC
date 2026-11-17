// The calendar feed of Molted: the player's dated things as an .ics file that Google Calendar, Apple Calendar and
// Outlook subscribe to. Read-only: Molted stays the place where things change. Deployed without gateway JWT
// verification, because its callers are calendar apps, not signed-in players:
//
//   npm run sync:functions && supabase functions deploy calendar --no-verify-jwt
//   (migration 0042_integrations.sql)
//
// GET /functions/v1/calendar/molted.ics?t=<token>   -> text/calendar. The token is the secret part of the link the
//                                                      player makes in Settings (calendar_feeds); replacing or removing
//                                                      the link there stops this address at once.
// What it lists and how times are written: apps/app/src/lib/ics.js. Request handling: ../_shared/calendar-core.js.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadState } from "../_shared/app/remote.js";
import { handleCalendar } from "../_shared/calendar-core.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) =>
  handleCalendar(req, {
    owner: async (token: string) => {
      const { data, error } = await admin.rpc("calendar_feed_owner", { p_token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? { userId: row.user_id, tz: row.tz, habits: row.habits } : null;
    },
    // loadState filters every table by this user id (the service role bypasses RLS)
    state: (userId: string) => loadState(admin, userId),
    now: () => new Date(),
    onError: (e: unknown) => console.error("calendar", e),
  })
);
