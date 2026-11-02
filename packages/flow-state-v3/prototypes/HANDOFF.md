# Handoff: Flow State v3 buildout

Written at the end of round 7, at `b423af26`. Everything here is proposed unless marked decided. The grouping into rounds is rough; only round 8's list comes from a review.

Continue the Flow State v3 runtime prototype in `/Users/arpit/Developer/flow-state`, branch `flow-rewrite`. Read `AGENTS.md` and the memory index first; memory holds the working rules. You have delegated authority for design calls: make them, record the reasons, report them for Arpit to overrule. Editing `.plan` files and `machine-design.md` waits for the merge. Commit locally, never push, no next-step buttons.

## Read, in order

Under `packages/flow-state-v3/prototypes/`:

1. `round-7/review.md`: final review. Advice; you decide.
2. `round-7/RESULTS.md`: where it disagrees with the review, trust neither until rerun.
3. `round-7/review-mid.md`: assumptions table.
4. `convergence-7.md`, `round-7/edge-proposal.md`

From the repo root:

5. `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`

## State

Suite 563/563. Lane core stable. Edge rule unbroken, but H1, M2 and M3 are open. `Compiled` is not settled: 84 of 563 cases boot typed machines. Nothing from the review is applied.

## Round 8: make the edge and the tests trustworthy

1. H1 at `round-7/durable.ts:161`: apply the fix, or remove `acked` if that is the root cause. Add a case in `conformance/scenarios/`, and a `serialize` target and alphabet in `conformance/search/flush.search.ts`; oracle (h) must read the record. Rerun on real IndexedDB with the slowed store, and confirm on `Checkout/Refunds`, which the review only read.
2. `edge.ts:147`: issue when hidden (M2). `driver.ts:115`: fatal check. `durable.ts:176`: `meta` (M3).
3. M9's three doors, `gate.ts` and `turn.ts`, one codec.
4. Harness: `conformance/mutate-one.ts` gets `--swap`, CLI pins, gate. Pin the survivors, starting with hide on two actors, after-drain, poison's lanes. Find why no search kills a core mutant, and why the builder's 3 search-only kills did not reproduce.
5. `conformance/fake-world.ts`: a wipe step, a slow store after an ack, fix the `claim` type error at line 401. `conformance/bench/cdp.ts`: name the kill kinds.
6. H3: the origin is deleted on a main-process kill. Find what deletes it, and test a normal profile and a real crash. Design for a wiped origin regardless.

## Round 9: entities and types

7. H2 entity redesign from scratch: per-field versions (decided), top-level entity table, using `round-7/known-failing-h2.ts`. Then type `domain` and streams. One real TanStack DB integration.

## Rounds 10 and on: compile prototypes, the drift test

8. Typed suite with `JSON.parse(JSON.stringify(compiled))` plus a code table; binary format is rejected for now. Then parallel compile prototypes: machine and fragment, operations first; entity and outside world (fetch, SDK, `EventSource`, real socket for `Feed.callback`) only after step 7.
   - Each starts from the design's public API and may change its shape if logged with before/after and a reason.
   - Behaviour may not change: the same suite, searches and kills must pass on compiled output.
   - Report gaps in `Compiled`; change it once, together.
   - Define what a failed decode means at each door.

## Before production

9. A phone or Safari run with real quota. This could change the design, so don't leave it until after the production switch.
10. Sweep findings from all rounds, including round 6's M5, M6, M10, M12: pinned, taught to fake/search/oracle, known-failing, or dropped with a reason.
11. `flow check`: keep it as a lint. Limit Rule 16 to external events.
12. Harness-only review by an agent with no prior reading; tamper checks and change-log audit; draft performance budgets (10,000 messages at 6x is a stress test, not a target).

## For Arpit's read

One real example in the public API through `flow explain`, the API change log, one page of behaviour decisions. Include first-send click loss (2.10.15; reviewer proposes accept), H3 restated, second-tab Pay declining, 5 s/hidden flush.

## Production switch

Move `conformance/` out of `prototypes/`, add fast parts to `nub run verify`, keep real-browser runs and independent reviews. Then plans merge, specs, tasks, build via skills at `/Users/arpit/Developer/workflow/skills/suites/workflow`.

## Agent rules

- Builders Opus medium, every third high. Reviews Opus high, writing mutants before reading the builder's results.
- A builder gets a mid-session review at 60 minutes, in parallel on a checkpoint, and keeps working. It commits a checkpoint and status file by minute 50 and keeps commands under 5 minutes.
- Every review has a section on the tests and continues the assumptions audit.
- When findings pile up on one part, redesign from scratch, giving the agent problems and traces, not the old code.
- Report plainly what failed and wasn't run.

## Limits

- Weekly usage 55% at handover, hard stop 90%. The memory note `v3-prototype-handover` still says 55%; 90% is the later figure.
- Run under `conformance/watch.ts`, one process under 2 GB. Never run from `codebases/`.
- Pay stays pinned. Entities optional, not up for cutting.
- Leave `.claude/launch.json` and `machine-fragments/explorations/` uncommitted.
- Remove `refs/snapshots/round-7-mid` and its `r7-mid` scratch worktree when convenient.
