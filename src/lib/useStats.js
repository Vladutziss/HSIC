import { useEffect, useMemo, useState } from "react";
import { getClient } from "./supabase.js";
import { buildStats } from "./stats.js";

/**
 * Stats for the Statistici screen. In Supabase mode they come from the `stats` Edge Function,
 * asked again each time the rows are saved; until then (and in the artifact, signed out, or on
 * an error) they are computed here from the same rules.
 */
export function useStats(state, today, mode, saveStatus) {
  const local = useMemo(() => buildStats(state, today), [state, today]);
  const [remote, setRemote] = useState(null);

  useEffect(() => {
    if (mode !== "supabase" || saveStatus !== "saved") return;
    let live = true;
    (async () => {
      const client = await getClient();
      if (!client) return;
      const { data, error } = await client.functions.invoke("stats", { body: { today } });
      if (live && !error && data?.stats) setRemote(data.stats);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [mode, saveStatus, today, state]);

  return remote && remote.today === today ? remote : local;
}
