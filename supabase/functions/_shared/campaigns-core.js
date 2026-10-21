// Rules of the email campaigns, with no I/O: given the rows of email_candidates() (migrations 0032 and 0033) it decides
// who gets which email today. Pure, so tests/campaigns.test.mjs covers it without a database;
// supabase/functions/campaigns runs it once a day.
//
// Campaign 1, retention: a short sequence that follows the player's first weeks. Each step goes out at most once.
//   onboarding_nudge  day 2    signed up, never ticked a habit
//   quick_win         day 9    has started ticking: one small technique to make it stick
//   feature_tour      day 16   the coach and groups, for players still around
//   feedback          day 35   one question, answered by replying to the email
// Campaign 2, reactivation: ONE email, ever, for a player who has been away for two weeks. After it nothing more is
// sent unless the player comes back.
//
// Everybody is opted in by default (email_preferences); unsubscribed, bounced and address-less players never reach this
// code, because email_candidates() does not return them, and claim_email_sends() checks again at send time.
// Delays are counted from sign-up; the sequence is driven by a daily job that looks at the player's behaviour at send
// time (a player who unsubscribed, or came back, is handled correctly), not by messages scheduled in advance.

export const CONFIG = {
  templateVersion: "v1",

  // Never more than one campaign email per player per 7 days (kept in step with claim_email_sends in SQL), and at most
  // 3 in 30 days: the privacy policy and terms promise exactly this. The app is new and its players are teenagers.
  minGapDays: 7,
  maxPer30Days: 3,

  // Order matters: the first step whose conditions hold is the one sent.
  // afterDays/untilDay: the window, in days since sign-up, in which the step still makes sense (a step that is
  // long overdue is skipped rather than sent out of context).
  steps: [
    { type: "onboarding_nudge", afterDays: 2, untilDay: 14, needs: "no_ticks" },
    { type: "quick_win", afterDays: 9, untilDay: 30, needs: "has_ticks" },
    { type: "feature_tour", afterDays: 16, untilDay: 45, needs: "around" },
    { type: "feedback", afterDays: 35, untilDay: 90, needs: "around" },
  ],

  // "around" = active in the last N days (a tick, a to-do, a report, or opening the app)
  aroundWithinDays: 14,

  reactivation: {
    afterInactiveDays: 14, // two weeks without any sign of life; the player's character has been asleep since day 2-3
  },

  batchSize: 100, // Resend's batch endpoint takes up to 100 messages
};

export const CAMPAIGN_TYPES = ["onboarding_nudge", "quick_win", "feature_tour", "feedback", "reactivation"];

const DAY = 86_400_000;
const days = (from, to) => (to - from) / DAY;
const at = (v) => (v ? new Date(v).getTime() : null);

/** Subject variant: stable per player, so a player always sees the same wording for a campaign. */
export function variantFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 === 0 ? "a" : "b";
}

/**
 * The campaign for one candidate row, or { skip: reason }. `now` is a Date.
 * Row fields are those of email_candidates().
 */
export function pickCampaign(row, now, cfg = CONFIG) {
  const t = now.getTime();
  const lastEmail = at(row.last_email_at);
  const signup = at(row.signup_at);
  const lastActive = at(row.last_active_at) ?? signup;
  const sent = new Set(row.sent_types || []);

  if (!row.email) return { skip: "no_email" };
  if (lastEmail != null && days(lastEmail, t) < cfg.minGapDays) return { skip: "frequency_cap" };
  if ((row.emails_30d ?? 0) >= cfg.maxPer30Days) return { skip: "monthly_cap" };
  // sunset: the reactivation email went out and the player has not come back since, so we stop
  if (row.last_email_type === "reactivation" && lastEmail != null && lastActive <= lastEmail) return { skip: "sunset" };

  const inactive = days(lastActive, t);
  const age = signup != null ? days(signup, t) : 0;
  const variant = variantFor(row.user_id);
  const make = (campaign_type) => ({ campaign_type, period_key: "once", variant });

  if (!sent.has("reactivation") && inactive >= cfg.reactivation.afterInactiveDays) return make("reactivation");

  const around = inactive <= cfg.aroundWithinDays;
  const ticks = (row.completions_total ?? 0) > 0;
  for (const s of cfg.steps) {
    if (sent.has(s.type) || age < s.afterDays || age > s.untilDay) continue;
    if (s.needs === "no_ticks" && ticks) continue;
    if (s.needs === "has_ticks" && !ticks) continue;
    if (s.needs === "around" && !around) continue;
    return make(s.type);
  }
  return { skip: "nothing_due" };
}

/**
 * Who gets what today. Returns { items, skipped } where items are { user_id, campaign_type, period_key, variant,
 * template_version } (at most one per player) and skipped counts the reasons, for the dry-run report.
 */
export function selectAudience(rows, now, cfg = CONFIG) {
  const items = [];
  const skipped = {};
  for (const row of rows) {
    const pick = pickCampaign(row, now, cfg);
    if (pick.skip) {
      skipped[pick.skip] = (skipped[pick.skip] || 0) + 1;
      continue;
    }
    items.push({ user_id: row.user_id, ...pick, template_version: cfg.templateVersion });
  }
  return { items, skipped };
}

export const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** Retry with exponential backoff on Resend's rate limit (429) and server errors; anything else fails at once. */
export async function withBackoff(fn, { tries = 4, baseMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = e?.statusCode ?? e?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500) || e?.name === "rate_limit_exceeded";
      if (!retryable || i === tries - 1) break;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}
