# Agent speed study, 2026-11-14

**Bottom line:** agents are slow mostly because of how they take turns, not because of the work. Builders spend
51 to 73 percent of their time on model turns, and most turns make one tool call. Sidecars run one after another
and block their lead. A check-after-every-edit loop doubles the verification time. Reviews spend most of their time
waiting on one slow blind sidecar, then writing. Status: proposed.

Method: five read-only Haiku agents measured these transcripts with `jq`:
- the long T52 builder, 5 h 38 m;
- the T61 builder;
- the two early T52 builders;
- three reviews;
- startup cost and eight sidecars.

The scripts are in the session scratchpad.

## Measured

| Where | Finding |
| --- | --- |
| Builders, model turns | 51 to 73 percent of wall time. 665 of 1,043 turns made one tool call; 115 were a lone Edit (about 19 min). Edit argument streaming took 26 min |
| Builders, sidecars | Each blocked its lead 3.5 to 6 min; four sidecars ran back to back (23 min). Nested Agent calls return only when done, even with `run_in_background` |
| Builders, verification | 30 percent of wall time. `check:fix` then a plain `check` in one command: 67 times, 27 min. Checks after nearly every edit; full test runs with no file argument (25 min in T61) |
| Builders, ramp-up | 90k to 190k characters read before the first real edit, much of it whole-file reads and `wk brief` dumps; `play.ts` read 4 to 8 times |
| Builders, early handoffs | Two handed off at 400k to 545k tokens with no compaction (the rule now forbids this) |
| Builders, idle | T61: 158 min parked on the dependency (by design). T52: 40 min idle, including 17 min after Monitor calls that returned at once |
| Reviews | 17 to 25 min. The sidecar batch takes 6 to 9 min, and the blind sidecar is the straggler every time. The lead writes for 8 to 15 min afterwards. Gate re-runs and scratch copies cost under a minute |
| Sidecars | 49 to 87 percent of wall time is thinking (Haiku at effort high). Tool time is 1 to 11 percent. Brief length does not predict time |
| Startup | About 58k input tokens before a general-purpose agent's first step (tool schemas about 36k, Artifact alone about 13k). That costs tokens, not time; Explore agents start at about 38k |
| Context | Model latency rose from about 3.5 s to 7.6 s per turn as context passed 800k |

## Proposed changes, by time saved

1. **Batch tool calls:** independent Reads, Edits and greps go in one message. This could cut builder turns by a third,
   about 20 to 40 min per long session.
2. **Launch all sidecars in one message,** so they run in parallel and the wait is the slowest one, not the sum. This
   saves about 15 to 20 min per builder session where sidecars were serial.
3. **One verification per batch of edits:** `check:fix` alone (no plain `check` after it), the touched test files
   while iterating, and the full package at each checkpoint commit. Saves about 27 min plus most of the test time.
4. **Resume cards:** a 5k-character resume note replaces the full brief and proposal dumps for a resumed builder.
   Files are read by line range, once. Saves a few minutes per start and keeps context smaller.
5. **Reviews:**
   - cap each sidecar at about 25 tool calls or 5 min;
   - give the blind sidecar a context pack (the cited Spec rules) instead of whole Specs;
   - start gate re-runs in the background before the sidecar batch;
   - have sidecars return a fixed table (claim, file:line, repro), so the lead writes the review in one pass.

   Could cut reviews from about 20 min to about 12.
6. **Haiku effort medium for read-only sweeps,** high kept for review sidecars. This would need a timed trial first,
   and it changes the user's effort rule.
7. **Explore-type agents for read-only sidecars:** saves about 20k tokens per agent, no time.

Not proposed: trusting the builder's recorded gates in reviews (saves under a minute), and fewer sidecars (none
was wasted; rejection rates were 9 to 23 percent).
