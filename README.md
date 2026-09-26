# HSIC · Momentum habit tracker (prototype)

`src/MomentumHabits.jsx` is a single self-contained React component (Tailwind, recharts, lucide-react, in-memory state only).

- **Momentum score** instead of streaks: a check-in closes 8.5% of the gap to 100 (up to +50% on a 6-day run), a miss keeps 93% (95% for further consecutive misses), and the first 3 check-ins after a miss get a 1.6× comeback bonus. A "lighter version" counts for 60% and is never a miss.
- **Screens:** onboarding (3–4 habits + goal), Today dashboard with an adaptive AI-suggestion card, Progress (30-day trajectory + 60-day projection, streak vs momentum comparison), and habit detail (check-in calendar + templated AI insight).
- Seeds ~30 days of simulated check-ins and sleep data so the mechanic is visible immediately.

Usage: `import MomentumHabits from "./src/MomentumHabits.jsx"` and render `<MomentumHabits />` in any React 18 + Tailwind project.
