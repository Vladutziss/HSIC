// Group leaderboard helpers (pure). Every member publishes their own stats snapshot from their own app, so the
// weekly gain of someone who has not opened Molted since last week is still last week's number: the weekly reset
// happens in each member's app. A snapshot published before this Monday cannot hold points of this week.
import { dayKey, mondayOf } from "./dates.js";

/** The week's gain to show for a member: 0 when their snapshot is older than this Monday. Your own row is live. */
export function weekGainNow(member, today) {
  if (!member || member.isMe || !member.updatedAt) return member?.weekGain || 0;
  const at = new Date(member.updatedAt);
  if (Number.isNaN(at.getTime())) return member.weekGain || 0;
  return dayKey(at) < mondayOf(today) ? 0 : member.weekGain || 0;
}

/** Members with the stale weekly gain zeroed, ready to sort. */
export const withFreshWeek = (members, today) => members.map((m) => ({ ...m, weekGain: weekGainNow(m, today) }));
