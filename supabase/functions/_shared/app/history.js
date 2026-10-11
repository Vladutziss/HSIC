// A habit's history starts at its first tick when that is earlier than its `createdAt`: rows that were
// claimed or migrated later keep a recent creation date but an older log, and the coach would otherwise
// see "less than 7 days of history" for a player with a month of check-ins.

export function withObservedStart(state) {
  const first = {};
  for (const [day, entries] of Object.entries(state?.log || {})) {
    for (const [id, code] of Object.entries(entries || {})) {
      if (code && (!first[id] || day < first[id])) first[id] = day;
    }
  }
  return {
    ...state,
    habits: (state?.habits || []).map((h) => (first[h.id] && (!h.createdAt || first[h.id] < h.createdAt) ? { ...h, createdAt: first[h.id] } : h)),
  };
}
