// Burst limit for the AI functions, on Upstash Redis (REST, no dependency). The daily cap stays in Postgres
// (bump_ai_usage); this one stops a loop or a script from burning the OpenRouter budget within minutes.
//
//   supabase secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...   (AI_BURST_MAX / AI_BURST_WINDOW optional)
//
// Without the secrets, or if Upstash is down, the call is let through: the daily cap still applies.

const URL_ = Deno.env.get("UPSTASH_REDIS_REST_URL");
const TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
const MAX = Number(Deno.env.get("AI_BURST_MAX") ?? 8); // calls per user per window
const WINDOW = Number(Deno.env.get("AI_BURST_WINDOW") ?? 60); // seconds

/** true when the user may call now. Fixed window: INCR, and EXPIRE only on the first hit of the window. */
export async function burstAllowed(userId: string): Promise<boolean> {
  if (!URL_ || !TOKEN) return true;
  const key = `ai:${userId}:${Math.floor(Date.now() / 1000 / WINDOW)}`;
  try {
    const res = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, WINDOW, "NX"]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return true;
    const [incr] = await res.json();
    return Number(incr?.result) <= MAX;
  } catch (e) {
    console.error("ratelimit", e);
    return true; // ponytail: fail open; fail closed if Upstash becomes a hard requirement
  }
}
