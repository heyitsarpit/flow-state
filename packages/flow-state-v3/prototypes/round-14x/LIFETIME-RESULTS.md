# Lifetime experiment: round 13 under "an actor lives while it is used"

Status: **experiment, PROPOSED.** This tests `workflow/plans/flow/references/explorations/actor-lifetime/proposal.md` on a copy of round 13. It never
becomes production code, and nothing here is decided. Marks: [ran], [read], [reasoning].

## Commands and results

| Run | Command (from the repo root) | Result |
| --- | --- | --- |
| Baseline | `bun packages/flow-state-v3/prototypes/conformance/main.ts --round 13 --runtime ../round-13/adapter.ts --no-search` | 761/761, lock clean, exit 0 [ran] |
| A: rule on, suite as written | `… main.ts --round 14 --runtime ../round-14x/adapter.ts --no-search` | first run 759/761 (2 ledger reds, fixed in the suite); final **768/768, lock clean, recipients as written, exit 0** [ran] |
| B: `ensure` = attach, `dispose` = last detach | `FLOW_LIFETIME=uses …` (same command) | 24 cases red by a named oracle; the rest only by output [ran] |
| C: B, and a reload starts with no uses | `FLOW_LIFETIME=uses+boot …` | 93 red by a named oracle (B's 24, plus 69 reads after a reload) [ran] |
| Round 13 on the new suite | `… --runtime ../round-13/adapter.ts` | 760/768: the 7 LIFE cases red (no uses), FRAG-15 by output (a send no longer restores), round files unlogged [ran] |
| New cases, fail side | `bun packages/flow-state-v3/prototypes/conformance/lifetime-falsify.ts --runtime ../round-14x/adapter.ts` | control 7/7 green; all 7 wrong runtimes red [ran] |
| falsify | `bun conformance/falsify.ts --runtime ../round-14x/adapter.ts --part suite1/suite2/suite3/mutants` | every gate fails on what it should, after one fix to `broken-adapter.ts` [ran] |

`FLOW_LIFETIME_PROBE=1` prints whether each `dispose` the suite drives meets an actor that has work in progress. In run A, 26 cases dispose a busy actor. 22 of B's 24 reds are among them.

## The runtime change (round-14x; +117 −8 lines)

- `world.ts` (+11 −1): `World.uses`, the use count for each identity under the rule. Inputs: `attach` (with `once`), `detach` (with `all`), `sweep`. Boot can take `unused`.
- `step.ts` (+78 −2):
  - `busy(world, key)`: work in progress is a lane with a head, waiting commits or a parked ending; an armed schedule; a kept fire; a read in flight; mail or follow-ups for the actor.
  - `sweepDue`, `onAttach`, `onDetach`, `onSweep`. The sweep disposes every identity with 0 uses and no work through the existing `onDisposeActor`, so a persisted record is kept.
  - `restoreForSend`: a send to an absent identity with a kept record restores it before the send is queued, and puts it under the rule with 0 uses.
  - An explicit dispose drops the identity's uses.
- `driver.ts` (+14 −2): at the end of a drain, if a sweep is due, one `sweep` input is queued in the host's next task (`host.later`). Boot passes `unusedAtBoot`.
- `adapter.ts` (+14 −3): `attach` and `detach` on the port; the `FLOW_LIFETIME` mapping modes; the probe.
- `mutants-lifetime.ts`: seven wrong runtimes.

Explicit `dispose` is unchanged, and it keeps the record. Round 13 has no record-removing `disposeActor` or `forget`. Neither did this experiment add them.

## Suite changes

- `harness.ts`: `attach` and `detach` steps; optional `Instance.attach` and `detach`.
- `drive.ts`: `attach` makes an actor live. `detach` ends what the suite owes it, but its life goes on. A send to a disposed persisted actor clears its ghost mark (Runtime O4 under the rule). A runtime without uses throws on `attach`.
- `main.ts`, `SCENARIOS.md`: LIFE-01..05 are wired in and catalogued as R 14.
- `broken-adapter.ts`: `bogusIssue` also breaks `attach`. Without that, falsify suite3 found that every LIFE case stayed green under it.
- The lock, the log (21 lines), outputs and recipients now follow round-14x.

## Cases whose verdict changed

**Run A (2, both the rule, both fixed in the suite).** FRAG-15 and SEARCH-ODD-SMALL search through `dispose` then `send`. A send now restores the disposed persisted actor, and the ledger called the restored actor a ghost. Fix: the `drive.ts` line above. FRAG-15's output moves (`unbound` becomes `restoredBySend`), and its new output is logged.

**Run B, made impossible by the rule (22): the case disposes an actor while it has work.**

| Group | Cases | What the suite should do |
| --- | --- | --- |
| A persisted identity disposed mid-flight, its ending parked for the next life | FRAG-08/persisted-disposed-ending-parked-delivered-once, FRAG-08/rebind-delivers-a-hold-once, FRAG-20/adopted-ending-is-current-from-the-active-leaf, REV5-H5H6 ×5, REV5-M1 ×2, REV8-PINS/D72, REV9-EDGE/a-new-persisted-life-does-hear-it, REV9-EDGE/a-new-life-tries-a-kept-ending-once | Where the subject is "a parked ending survives and is delivered once", **rewrite it on a reload**, which still parks for the identity. Where the subject is the dispose itself, **delete it**. |
| Unbound lanes of a non-persisted actor | FRAG-08/non-persisted-with-no-return-is-evidence, FRAG-12/unbound-hold-with-a-waiter-yields, FRAG-20/no-waiter-left-no-yield, FRAG-15 (in B) | **Rewrite to explicit `disposeActor`**. The design keeps a disposed actor's non-Idle lanes as unbound lanes. |
| Local actors | FRAG-13, FRAG-20/local-sent-finishes-to-evidence, REV9-EDGE/a-new-local-life-hears-nothing-of-the-old | **Keep.** A local actor lives as long as its component does, outside the shared rule. Its unmount is an explicit dispose. |
| A kept deadline | REV9-KEPT/a-kept-deadline-goes-with-a-disposed-actor-and-comes-back | **Rewrite to `disposeActor`**, or delete. A kept fire is a use. |
| A spin | REV9-LOOP/a-dispose-during-a-spin-ends-it | **Rewrite to `disposeActor`.** Mail is work, so an actor stuck in a loop never goes on its own; in B the settle never quiesces. |

**Run B, the reload (2): under-specified, not a regression.** FRAG-24/a-dispose-waiting-on-a-slow-load-… and R10-BOOT-ORDER/inputs-that-wait-on-a-slow-load-… queue the dispose behind a slow load. Uses are not persisted, so the detach meets a restored actor that no one attached in this boot, and it does nothing.

**Run C (69 more): the reload.** 52 are "(j) X stopped publishing, and the suite never disposed it"; the rest read state or memory after a reload. A restored actor with no consumer goes once idle. In React the page's components remount and attach again, so the right suite change is in the harness: a `reload` attaches again each actor the suite had attached. Not built.

No regression was found: every changed verdict traces to the rule or to the reload question.

## New cases: LIFE-01..05

Expected results come from the rule, by hand. They are red on round 13 (no uses), and each is red on at least one wrong runtime [ran]:

| Case | Pins | Red on |
| --- | --- | --- |
| LIFE-01 | Pay mid-charge: the last detach leaves it alive, the endings reach the same life, it goes after `place` settles, its record is kept, the next attach is PAID | busy-ignored, no-sweep, sweep-drops-record |
| LIFE-02 ×2 | non-persisted: busy until its write lands, then gone with nothing kept; idle with no uses, gone at once | busy-ignored, no-sweep |
| LIFE-03 | a send to an absent persisted Pay restores it (intent `pi1`), delivers CardChosen then PayRequested in order, then it goes again | send-no-restore, busy-ignored, sweep-same-task (3 disposals instead of 2), sweep-drops-record |
| LIFE-04 ×2 | a detach and an attach in one task dispose nothing; uses are counted | sweep-same-task, uses-not-counted, no-sweep |
| LIFE-05 | an ending parked for a removed copy's path keeps the unused actor until a copy takes it | parked-not-a-use (the only kill), busy-ignored, no-sweep |

## What the rule makes unnecessary, and what stays

- **Never reached by implicit disposal:** parking for a persisted identity with no live actor (2.9.x, "disposed by retain expiry"); `retired` records carrying frozen timers and kept fires (D118); unbound holds and their five-minute yield (D15); `releasing` lanes. A busy actor is never swept, so a swept record has no lanes, timers or parked endings.
- **Must stay:**
  - **Reload:** lanes restored before their actor, endings parked for the identity, `NotSent { Restored }`.
  - **`disposeActor`:** unbound lanes, evidence-only endings, D15's yield.
  - **Local actors:** D21's release at once, never adopted.
  - **Parked-for-path endings** inside a live actor (rule 53).
- **The record-keeping explicit dispose** is used only by the suite. The proposal has no public way to dispose a busy actor and keep its record. If nothing else needs it, the 13 persisted cases above move to reload, and `onDisposeActor`'s `retired` branch serves the sweep alone (with no timers to carry).

## Under-specified in the proposal, and what I chose

1. **A bare ensure with no use.** The proposal drops "forever without it", but the suite's `ensure` has no consumer. Chose: an identity enters the rule only by `attach`, a send that restores it, or (in mode C) a boot. Otherwise it is kept until disposed, as in round 13.
2. **Uses across a reload.** The proposal speaks of server-rendering hydration only. Uses are the host's and are not persisted. Whether a restored actor starts with 0 uses is mode C's question, and it decides 69 cases.
3. **"After the host's current React commit."** The core has no commit, so I used the next host task. LIFE-04 and the sweep-same-task mutant show the timing matters for send-restores too: swept in the same task, an actor restored by the first of two sends would be disposed before the second.
4. **A parked ending for a path that never returns** keeps its actor forever, like open item 2. LIFE-05 pins the proposal as written.
5. **Mail is work.** An actor that spins is never disposed on its own (REV9-LOOP).
6. **An explicit dispose while uses remain:** chose to drop the uses.
7. **A send to an absent non-persisted target:** unchanged. Round 13 notes `unbound` evidence and raises no `SendTargetAbsent`, which is a gap against Runtime O4 either way.
8. **Order on a send-restore:** the restore runs before the send is queued, so the restored life's adopted endings run first, then the sends in order.
9. **Module sessions** (streams, sockets) are not work here, because the proposal does not list them.
10. **Schedules count** (open item 3, taken as written). No case pins a schedule as the only use: Pay's PAYING always has a lane as well.
