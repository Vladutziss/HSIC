import { useEffect, useMemo, useState } from "react";
import { getClient } from "./supabase.js";
import { buildStats } from "./stats.js";

/**
 * Stats for the Statistici screen. In Supabase mode they come from the `stats` Edge Function,
 * asked again each time the rows are saved; until then (and in the artifact, signed out, or on
 * an error) they are computed here from the same rules. `loading` is true until the first server answer.
 */
export function useStats(state, today, mode, saveStatus) {
  const local = useMemo(() => buildStats(state, today), [state, today]);
  const [remote, setRemote] = useState(null);
  const [failed, setFailed] = useState(false); // function not deployed or unreachable: show the local numbers

  useEffect(() => {
    if (mode !== "supabase" || saveStatus !== "saved") return;
    let live = true;
    (async () => {
      const client = await getClient();
      if (!client) return;
      const { data, error } = await client.functions.invoke("stats", { body: { today } });
      if (!live) return;
      if (!error && data?.stats) setRemote(data.stats);
      else setFailed(true);
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [mode, saveStatus, today, state]);

  const fresh = remote && remote.today === today;
  // loading: the first answer from the server has not arrived yet (local numbers are not shown meanwhile)
  return { stats: fresh ? remote : local, loading: mode === "supabase" && !fresh && !failed };
}
