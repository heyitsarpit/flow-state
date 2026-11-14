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
| 2026-11-14 | `tools/process/agent-metrics.ts`: fixed per-agent numbers | Studies compare like with like | Delete the tool |
| 2026-11-14 | `tools/process/review-yield.ts`: findings by angle, miss tally | Low-yield angles dropped; repeat causes become checklist lines | Delete the tool |
| 2026-11-14 | Shell-write hook (`block-shell-writes.ts`, project settings) | Slips per session (were 5 in every builder); false blocks (were 0 of 6902 real commands) | Remove the hook from `.claude/settings.json` |
| 2026-11-14 | Builder checklist: weak check (8 misses), gathering (5 misses) | Those causes in the next reviews' miss notes | Drop the two lines in instructions |

## Candidate experiments

Run them as studies make them useful; move each to Open experiments when started.

1. **A metrics script:** `jq` turned into a committed tool that prints each agent's numbers (calls per turn,
   verification and sidecar minutes, idle, characters read before the first edit, rule slips). Studies then compare
   like with like, and Haiku only interprets.
2. **Mechanical rule enforcement:** a PreToolUse hook that blocks file writes from Bash (`sed -i`, redirects into
   project files, heredocs). Measure: slips per session (5 today, in every builder).
3. **A miss tally:** each review's "missed by the builder, because…" line, counted by cause (gathering, weak check,
   rule gap, context). A cause seen three times becomes a checklist line in the builder brief.
4. **Review yield by angle:** accepted and blocking findings per sidecar angle and per review minute. Low-yield
   angles are dropped; angles are added where misses cluster.
5. **Brief templates under version:** builder and reviewer briefs kept here as templates; try a variant on
   alternate Tasks. Measure ramp-up and turns.
6. **Effort trials for builders:** medium against high on alternate steps. Measure review findings (rework) against
   minutes.
7. **Cost per correct close:** hours and weekly-usage percent per Task, against its requirement count. Trend it.
8. **Gate timing history:** time every gate per checkpoint; speed up the slowest and flag flaky ones.
9. **Rule retirement:** at each study, remove an instruction the numbers show doesn't matter. Measure instruction
   length; shorter briefs cost fewer tokens and less attention.

## Studies

### 2026-11-14: T61 close study

Measured with `tools/process` by a Haiku sweep at medium effort.

- **Speed rules not taken up:** the T61 builder got them by message mid-session (21:00). Its one-call turns rose from
  65 to 75 percent, and its verification share rose from 20 to 47 percent. A long-running builder keeps its habits.
  Judge the rules on a fresh builder that gets them in its first brief (T54 next).
- **Idle:** 161 of 410 builder minutes, parked on T52 by design. That's not waste.
- **Haiku medium trial not run:** 22 of 23 Haiku agents were launched at high. Sweeps must be launched at medium
  explicitly.
- **Hook:** no project-file slip after it went live; two scratch-path false positives in the metrics tool (relative
  paths).
- **Reviews:** 15.8 to 20.2 minutes, no clear change yet. Blind sidecar findings were used 80 percent of the time
  (n=99).
- **Changes:**
  - T54's builder brief carries the speed rules up front;
  - sweeps are launched at effort medium explicitly;
  - the tools get a time window, verdict kinds (noted, held, confirmed) and relative-path handling.

### 2026-11-14: first study (T52, T60, T61)

Report: [agent-speed-study-2026-11-14.md](../proposals/agent-speed-study-2026-11-14.md).

- **Model turns:** 51 to 73 percent of a builder's time, mostly one tool call per turn.
- **Sidecars:** they blocked their lead serially.
- **Verification:** `check:fix` followed by `check` cost 27 minutes in one session.
- **Reviews:** they wait on the blind sidecar, then spend 8 to 15 minutes writing.
- **Gate re-runs in reviews:** under a minute, so not worth cutting.
- **Changes:** all of the rows in Open experiments.
