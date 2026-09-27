# HSIC · Momentum habit tracker (prototype)

`src/MomentumHabits.jsx` is a single self-contained React component (Tailwind, recharts, lucide-react).

- **Momentum score** instead of streaks: a check-in closes 8.5% of the gap to 100 (up to +50% on a 6-day run), a miss keeps 93% (95% for further consecutive misses), and the first 3 check-ins after a miss get a 1.6× comeback bonus. A "lighter version" counts for 60% and is never a miss.
- **Screens:** onboarding (3–4 habits + goal), Today dashboard with an adaptive AI-suggestion card and a to-do list (Today/Later, optional habit tag), Progress (30-day trajectory + 60-day projection, streak vs momentum comparison), and habit detail (check-in calendar + templated AI insight).
- Seeds ~30 days of simulated check-ins and sleep data so the mechanic is visible immediately.

Usage: `import MomentumHabits from "./src/MomentumHabits.jsx"` and render `<MomentumHabits />` in any React 18 + Tailwind project.

## Where data is stored

Everything you enter (habits, goal, daily check-ins, sleep, to-dos) is kept in one JSON document, with check-ins keyed by date, so each day's check-ins become real history.

- **As a Claude artifact:** the artifact's database, at `data/users/<your id>/momentum`. That path is private to you, even from other people the artifact is shared with.
- **In your own React app:** `localStorage` under `momentum-habits-v1`.
- If neither is available, data lasts for the session only. The footer shows which one is in use.

A tracked day with no check-in counts as a miss. A habit added later starts tracking on the day it was added. Momentum is replayed over your full history, not just the last 30 days. "Edit habits → Delete all my data" wipes the document.
