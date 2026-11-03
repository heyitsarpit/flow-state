# Handoff: Flow State v3 buildout

Written at the end of round 7, at `b423af26`; state and round 8 updated at the end of round 8. Everything here is proposed unless marked decided. The grouping into rounds is rough.

Continue the Flow State v3 runtime prototype in `/Users/arpit/Developer/flow-state`, branch `flow-rewrite`. Read `AGENTS.md` and the memory index first; memory holds the working rules. You have delegated authority for design calls: make them, record the reasons, report them for Arpit to overrule. Editing `.plan` files and `machine-design.md` waits for the merge. Commit locally, never push, no next-step buttons.

## Read, in order

Under `packages/flow-state-v3/prototypes/`:

1. `round-8/RESULTS.md`, `round-8/review-mid.md`: where they disagree, trust neither until rerun.
2. `convergence-8.md`: what replaced what, and why.
3. `round-7/review.md`, `convergence-7.md`, `round-7/edge-proposal.md` for the edge's reasoning.

From the repo root:

5. `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md`

## State

Suite 621/621, all at `round-8/`. Lane core stable. H1, M2, M3, M9's doors, the fatal check closed; `acked` and `meta` gone. H3's cause found: Chrome's own recovery on a torn log. `Compiled` is not settled: typed machines still boot only a part of the suite. Round 8's final review is `round-8/review.md`: money path holds, H3 established, one High (D110's budget silently cuts correct programs), and its tamper and oracle gaps are open.

## Round 8: done

See `round-8/RESULTS.md`. Left from it, for later: `input` through its Schema with `keyFields` (the second codec's gap), stale names after D96 (`Purpose`, `byEnding`'s dead branch), design-doc lines listed in the mid review, a superseded bad lookup's generation.

## Order changed after round 8's review (coordinator, proposed)

- Round 9 first fixes `round-8/review.md`'s "What round 9 must do first", items 1-3 and 5. Why: entities are bulk writes, which hit D110's budget first, and the tests must see a missing ending before they judge entities.
- Items 4 and 6 (a kept firing, `row` when undelivered, a server key on a contract) are decided by the builder under delegation and listed for Arpit's read. They don't wait for him.
- Step 9 (phone or Safari, real quota) moves before step 8's compile prototypes. Why: H3's path differs on low-end devices per Chromium's code, and D97 and D110's numbers are unmeasured there, so it could change the edge that compile output must match.
- `keyFields` with Schemas moves into round 9's typing of `domain`, since a typed `Schema.BigInt` key reaches the fault today.

## Plan cut to what informs production (agreed with Arpit, 2026-11-03)

Arpit's condition: each remaining prototype step must directly inform production work. This supersedes the numbered steps below where they differ, which stay as prior art.

1. **Test gate passes:** round 10, stage F and its re-check.
2. **Entity store proven on the runtime,** from `round-9/entity-proposal-2.md`, test first. `listen.load` and `fragstore.row` must pass. Plus one thin real TanStack DB path, as a test of the seam.
3. **`Compiled` settled by compiling:** the typed suite through JSON with a code table, then compile prototypes for machine, fragment and operations from the public API, with the suite passing on compiled output. Entity and outside world thin: one real fetch or SDK path each.
4. **"For Arpit's read".**

- **Safari:** one short run of the edge's store contract on macOS Safari, now that `safaridriver` is enabled: atomic batches, issue order, quota errors, a lost connection, bfcache with the lock. It informs production's host adapter. It runs after step 1, by one agent, and is not a gate. Phones and iOS are production tasks.
- **Moved to production:** the sweep of old findings (step 10), performance budgets, typing streams beyond what compile needs, and a full TanStack DB integration.

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
- Shell commands must be bounded, since round 10's builder hung for 43 minutes. Don't read stdin unless you feed it (`</dev/null` otherwise; `cat` is `bat` here). Write and edit files with the Write and Edit tools. Run every command under `conformance/watch.ts --seconds N` or `perl -e 'alarm N; exec @ARGV' --`, since there is no `timeout` command. Never wait on unbounded background work; kill your own stale shells by exact pid.

## Limits

- Weekly usage: hard stop 90%.
- Run under `conformance/watch.ts`, one process under 2 GB. Never run from `codebases/`.
- Pay stays pinned. Entities optional, not up for cutting.
- Leave `.claude/launch.json` and `machine-fragments/explorations/` uncommitted.
- Remove `refs/snapshots/round-7-mid` and its `r7-mid` scratch worktree when convenient.
