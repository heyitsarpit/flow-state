# Process notebook

How agents spend their time on this project, what we changed, and whether it worked. Read it before changing how
agents are briefed, reviewed or paced. Add one entry per study; keep each entry short.

## Running a study

- **When:** at each Task's close, beside its retrospective.
- **Who:** about five read-only Haiku Explore agents at effort medium. Each takes one angle and reads transcripts with
  `jq`, never whole. Transcripts: `~/.claude/projects/-Users-arpit-Developer-flow-state/<session>/subagents/agent-*.jsonl`.
- **Angles:** the builder, the reviewers, the sidecars and startup, ramp-up and handoffs, and coordination between
  agents.
- **Measure:**
  - wall time by activity: model turns, thinking, tools grouped by kind, sidecar waits, idle;
  - the longest waits;
  - repeated reads and re-runs;
  - rule slips;
  - context growth and compactions.
- **Output:** the measured sinks, then changes tied to them. Each change gets a measure and a reverse.
- **Who decides:** the orchestrator applies process experiments itself and the next study keeps or drops them.
  Authority, stops, the reserve, gates and Task scope stay the user's (the user, 2026-11-14).

## Open experiments

| Since | Change | Measure to judge it | Reverse |
| --- | --- | --- | --- |
| 2026-11-14 | Batch independent tool calls in one message | Tool calls per turn (was 1 in 64 percent of turns) | Drop the speed rule |
| 2026-11-14 | Launch a round's sidecars in one message | Lead wait per sidecar round (was serial, 3.5–6 min each) | Drop the speed rule |
| 2026-11-14 | `check:fix` once per edit batch; touched tests while iterating | Verification minutes per session (was 30 percent) | Drop the speed rule |
| 2026-11-14 | Resume cards; ranged reads | Characters read before the first edit (was 90k–190k) | Drop the speed rule |
| 2026-11-14 | Reviews: background gates, capped sidecars, a rule pack for the blind one, a finding table | Review minutes (was 17–25) | Drop the review speed line |
| 2026-11-14 | Haiku sweeps at effort medium (reviews stay high) | Sweep minutes and findings against the high baseline | Back to high (AGENTS.md, memory) |
| 2026-11-14 | Hand off only at 90 percent context after a third compaction | Handoffs with no compaction (were 3 of 3) | The rotation rule in the Epic |

## Studies

### 2026-11-14: first study (T52, T60, T61)

Report: [agent-speed-study-2026-11-14.md](../proposals/agent-speed-study-2026-11-14.md).

- **Model turns:** 51 to 73 percent of a builder's time, mostly one tool call per turn.
- **Sidecars:** they blocked their lead serially.
- **Verification:** `check:fix` followed by `check` cost 27 minutes in one session.
- **Reviews:** they wait on the blind sidecar, then spend 8 to 15 minutes writing.
- **Gate re-runs in reviews:** under a minute, so not worth cutting.
- **Changes:** all of the rows in Open experiments.
