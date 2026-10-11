# Knowledge base for the Molted coach

One file per source. Written from the abstract (or the open full text where noted), nothing added from memory.
`strength`: `strong` = large meta-analysis or large objective data; `moderate` = single studies or small meta-analyses; `theory` = conceptual models.
Each file has a `shows` chunk (what the source reports) and a `limits` chunk (what it does not support). The agent must
carry the limits along when it cites a source.

Build the seed: `node scripts/build-knowledge.mjs` -> `supabase/seed/knowledge.sql` (re-runnable).
