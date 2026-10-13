# Molted AI implementation notes

Updated: 2026-10-12

## Context

Molted.eu participates in the High School Innovation Challenge at liceeni.rau.ro. The product is an AI-assisted, gamified self-improvement and study coach for teenagers.

Best competition positioning:

> Molted transforms student goals into small actions, adapts the plan from real behavior, and measures what works for each student.

Core loop:

`goal -> plan -> action -> feedback -> adaptation -> measurable progress`

## Already implemented in this worktree

- AI explainability contract for agent proposals:
  - `dataUsed`
  - `confidence`
  - `expectedEffect`
- Explainability display in the coach action log.
- `daily_plan` AI kind and Daily Planner UI.
- Daily Planner inputs:
  - available minutes
  - energy
  - habits
  - todos
  - goals
  - school assignments
- Rescue Agent:
  - detects reset risk or return after a break;
  - proposes one small recovery todo;
  - deduplicates the same recovery todo for the day.
- Homework Planner:
  - Romanian natural-language input;
  - AI extracts assignments, subject, due date and estimated minutes;
  - user confirms each assignment;
  - data is currently stored compatibly in `profiles.extra.schoolPlanner`.
- Goal Decomposition:
  - vague goal -> up to three week/month goals;
  - user confirms each goal before saving.
- Reflection Agent in Stats:
  - user writes what helped or blocked them;
  - AI returns one observation and one next step.
- Shared Edge Function code synchronized with `npm run sync:functions`.

## Remaining work, in priority order

### 1. Make Daily Planner actions executable

Current behavior: it displays up to three recommended steps.

Implement:

- confirm button per step;
- create a todo or Focus session after confirmation;
- reuse `planApply`, `planUndo`, `agent_actions` and `AgentLog`;
- preserve `reason`, `dataUsed`, `confidence`, `expectedEffect`;
- prevent duplicate todos and duplicate Focus sessions.

Relevant files:

- `apps/app/src/screens/Planner.jsx`
- `apps/app/src/lib/ai.js`
- `apps/app/src/lib/agentActions.js`
- `apps/app/src/App.jsx`
- `apps/app/src/components/AgentLog.jsx`
- `supabase/functions/agent/index.ts`

### 2. Make Rescue Agent auditable

Current behavior: it directly creates a local todo.

Implement:

- log Rescue as a `create_todo` action in `agent_actions` when Supabase is available;
- confirm and undo through the existing action flow;
- keep the local fallback for artifact/local mode;
- measure whether the student returned to activity.

Relevant files:

- `apps/app/src/lib/rescue.js`
- `apps/app/src/screens/Dashboard.jsx`
- `apps/app/src/App.jsx`
- `apps/app/src/lib/agentActions.js`
- `supabase/migrations/0016_agent_actions.sql`

### 3. Persist Reflection history

Implement a small append-only model or compatible profile extra field for weekly reflections.

Recommended fields:

- `id`
- `week`
- `answer`
- `observation`
- `next_step`
- `data_used`
- `confidence`
- `created_at`

Add RLS if a table is introduced. Do not expose another user's reflection.

Relevant files:

- `apps/app/src/components/AiCoach.jsx`
- `apps/app/src/screens/Stats.jsx`
- `apps/app/src/lib/remote.js`
- `supabase/migrations/`
- `supabase/tests/rls.sql`

### 4. Upgrade Goal Decomposition from flat goals to milestones

Current behavior: decomposed goals are saved as flat existing goals.

Implement later:

- parent/child goal nodes;
- due date;
- status;
- completion criteria;
- links to todo and habit IDs;
- migration fallback for existing `state.goals`.

Do not break the current flat goals format during migration.

### 5. Move Homework Planner to dedicated tables

Current compatibility version uses `profiles.extra.schoolPlanner`.

For production, add a migration with owner-only RLS for:

- `subjects`
- `assignments`
- `exams`
- `study_sessions`

Keep local/artifact mode working without Supabase. Add mapping in both:

- `apps/app/src/lib/remote.js`
- `supabase/functions/_shared/app/remote.js`

Test timezone and local-day behavior carefully.

### 6. Authenticated AI E2E test

The local browser test reached the Clerk login and the artifact onboarding/Planner flow. It did not run real AI because no authenticated Clerk/Supabase session was available.

Run with a real development account:

- open web app;
- authenticate with Clerk;
- verify `daily_plan`;
- verify homework parsing;
- verify goal decomposition;
- verify reflection;
- verify Rescue action and undo;
- inspect Supabase `agent_actions` and usage limits.

Never commit credentials or put secrets in this file.

## Validation commands

From repository root:

```powershell
npm test
npm run build
npm run build:artifact
npm run sync:functions
```

Current verified baseline after implementation:

- 111 tests passing;
- web build passing;
- artifact build passing;
- artifact onboarding and Planner navigation manually verified in browser.

## Important worktree notes

- Existing user modification: `supabase/functions/weekly/index.ts`. Do not revert or overwrite it without checking the user's intent.
- `graphify-out/` contains generated exploration artifacts. Do not delete or reset it unless explicitly requested.
- Artifact build output is `artifact/momentum.html` and is generated from the app build process.
- AI server-only features must stay hidden or unavailable in the artifact build (`__SUPABASE__ = false`).

## Agent handoff instruction

Start by reading this file. Implement one priority slice at a time. After every substantive edit:

1. run the narrow relevant test;
2. run `npm test` after the slice is complete;
3. run `npm run build` and `npm run build:artifact` before handoff;
4. report anything blocked by missing authenticated Supabase/OpenRouter access.
