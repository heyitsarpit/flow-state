# Prototypes

Throwaway experiments for the runtime. Each folder answers one question and holds its code and a `RESULTS.md` with the
inputs, conditions, results and limits. Nothing here becomes production code; the findings carry over.

Everything is proposed. Context: `workflow/plans/flow/references/explorations/runtime-architecture/discussion.md` and
`review-1.md`. Method: the `prototype` skill.

Rules:

- Name entry files `main.ts`, not `*.test.ts`, because `vp test` covers `packages/**`.
- One process at a time, under 2 GB.
- No new dependencies. `effect` resolves from the workspace root (4.0.5).
- A result claims only what ran.

| Spike | Question | State |
| --- | --- | --- |
| S1 | Is lane plus record queue live? What else can wait forever? | done: [s1-wait-graph/RESULTS.md](s1-wait-graph/RESULTS.md) |
| S2 | Can one completion per Attempt be guaranteed? | done: [s2-completion/RESULTS.md](s2-completion/RESULTS.md) |
| S5 | Does a stream session need to live in the world? | not started |
| S6 | Can a real definition compile to the form the runtime wants? | not started |
| S3 | What does persistence cost per commit? | not started |
| S4 | Does the turn hold on a throttled browser? | not started |
