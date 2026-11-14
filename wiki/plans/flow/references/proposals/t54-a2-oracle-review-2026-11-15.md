# T54 A2 oracle review (2026-11-15)

All three oracle changes in `f0387b7e` hold by the cited rules, and each one's old reading goes red on the A2
runtime. Two things need the builder: the lifecycle change turns round-14 red (suite 84/124, so falsify and liar on
round-14 fail their control), and the model now owes a restore beside a `Maybe` row, which reverses close O3.

1. **Lifecycle (the boot owes nothing, each start owes its restores): holds** by Actors I40 and Restore R1, R3, I1,
   I6. With the old reading planted, suite production gives 77/78 (`DISP-05`, Actors I32: AwaitRestore not met at
   reload).
2. **`selection` (a Restored ending is never the server's answer): holds** by Restore R3 and
   `code:conformance/turn/anchor.ts#ended`'s own doc. With the old reading planted, parts gives two Turn I26 false
   reds (`PART-pay-stress-7`, `MIX-sync+transfers+sign-in+pay-stress-2`).
3. **`refusal` (the leaf comes from earlier in the same step): holds** by Turn I14: a refused turn leaves PreTurn,
   which after a reload is the restored leaf. With the old reading planted, crash gives `DLV-06@11` red ("next turn
   ran from LEFT ... refused at PAYING").

Reviewed on a scratch copy of the tree at `17d13e55` plus the uncommitted A2 core (`incarnations.ts`,
`lane-moves.ts`, `ledger.ts`).

## Findings

1. **Round-14 is now a wrong runtime for the boot (blocking for the round-14 gates).** Round-14's boot decides and
   parks restores before it opens any incarnation. Under the new model that breaks WriteLanes I15 ("Held got
   EndUnknown unknown Restored") at 40 reload cases. Suite round-14 goes from 124/124 to 84/124 with change 1 alone.
   With the old lifecycle files it is back to 124/124. Falsify round-14 gives 153/154 with a red control and 2/4 probes.
   Liar round-14 still turns all 126/126 mutants red, but its control fails. The oracle is right by Actors I40; the
   decision is round-14's: update its `onBoot`, or record round-14 as stale on the boot and rebase the gate counts.
   That is the orchestrator's call.
2. **A `Maybe` row now gets a restore beside it (minor, model bug).** The old `keptAtReload` kept `Maybe`.
   `OWED_ROWS` leaves it out, so a Held head with a `Maybe` row owes AwaitRestore at the next start. Probe: Reload,
   then Incarnated, gives restores 0/1 for Maybe and 0/0 for Kept, Parked and Delivering. The test that guarded this
   (`lifecycle-capture.test.ts`, "close O3") now checks only the Reload, so it passes vacuously. Restore R3 and I6 say a
   saved row for the Attempt replaces the restore. A rollback keeps a Held head's ending unchanged
   (`lifecycle-capture.ts#rolledEnding`), so this may not be reachable. Fix: exclude `Maybe` at the start, and add an
   `Incarnated` step to that test.
3. **Wake-set catch weaker (residual, owed to T20).** The old boot owed every Held head a restore by the reload
   step's end, so a runtime that never woke an Owing identity went red at once. Now nothing is owed until a start
   happens. Plant: the boot never wakes in-flight lanes (`incarnations.ts`,
   `.filter((l) => l.inFlight && false)`). The suite stays 78/78. Parts catch it in four scripts, as WriteLanes I16
   "Gone got EndUnknown" at the later ensure. Restore I1 has no oracle (`coverage-standings.txt`: owed to T20), so a
   wake-set check belongs there.
4. **Deleted trace held no live unique kill.** Only one held trace was deleted in this commit: "a boot owes no
   restore to a head whose ending was decided in the disposal". Its unique kill, old fold mutant m87, flipped
   `e.life._tag === "Owed"` inside `keptAtReload`, code the commit removed. Its case is still covered in two steps. The
   Reload trace (`lifecycle-lives.traces.ts`, Owed in the disposal goes to Parked) covers the first; `ownsRow` covering
   Parked is pinned by new m86 (`closedRowRestore`). The probe gives 0 restores at the start. The redundancy gate and
   the step-killer test pass: `lifecycle*.test.ts` 42/42. The other "deleted" item is the four `bootRestore` obligations
   dropped from "a reload". No trace checks those four heads (hq, r, o, i) at a later start; only head `s` is checked.
5. **The step killer `search PART-cells-stress-1` depends on the A2 core.** It is the first pilot to pass. It passes
   only on the A2 runtime (on HEAD's `src` it fails at the reload), so the KILLERS test is green only once the A2
   core lands.
6. **Residue of change 3 (low).** If a start publishes nothing before a refused turn, `met` is None and the check
   says nothing. Production publishes at the start (DLV-06@11 trace: Incarnated, then Published LEFT, then the
   refusal), so no case reaches this today.
7. **Stale text the commit missed.** `lifecycle.ts#ownsRow` gotcha (it still describes the boot);
   `lifecycle-model.ts#Capture` (`removed` is now written and never read, and its doc still says a boot reads it);
   `lifecycle-capture.ts#rolledBack` ("the boot owes it instead"); `lifecycle-obligations.traces.ts` ("exactly once
   in the boot"); `runtime-disposal.scenarios.ts` ("the boot delivers"); `ending-delivery.scenarios.ts` DLV-07 note.
   With `removed` unread, an unlanded disposeActor counts as landed. That shifts only which Invariant claims a missed
   restore (Actors I29 instead of Restore I6, `lifecycle-rules.ts` AwaitRestore deadlines).

## Gates (scratch copy, A2 core included)

| Gate | Here | `gates.json` |
| --- | --- | --- |
| falsify production | pass 18/18 | 18/18 |
| liar production | pass 13/13, 0 fixture gaps | 13/13 |
| falsify round-14 | fail 153/154, control red, 2/4 probes | 154/154 |
| liar round-14 | fail on control, 126/126 red | 126/126 |
| suite production / round-14 | 78/78 / 84/124 | 77/78 / 124/124 |
| crash production | pass 733/735, 0 red, 2 owed | 724/1125, 399 red |

Falsify round-14 also printed "the Spec WriteLanes could not be read". That comes from the scratch copy's
missing `wiki/`, not from the oracle.

## Owed part rows

The T54 `UNBOUND_RESTORE` rows and the T19 rows (PART-cells-stress-1, -9, PART-cells-varied-110,
PART-transfers-varied-4) pass because of the A2 runtime, not an oracle change:

- old oracles on the A2 runtime: the same rows "no longer break" (parts -136/129, as in `gates.json`);
- new oracles on HEAD's runtime: still red at the reload (PART-cells-stress-1: "place att-…3ee-1 (Held) got
  EndUnknown unknown Restored (at reload)");
- replay on the A2 runtime: `trace --script PART-cells-stress-1` gives `verdict: pass`.

The T19 rows cite `RETRY_COUNT`, but the boot fix alone cleared them. Their breaks probably came from the boot
parking, not the retry count, so delete them rather than move them to T54. PART-cells-stress-9 still has an
unowned red: lane-queue WriteLanes I12, "Await Released of att-…2330-3 was not met by TurnCloses (at reload)".

## Repro

From a package copy (`src`, `fixtures`, `conformance`, `prototypes`, with `node_modules` linked):

```sh
bun conformance/runner/main.ts suite --runtime production --only "$PRODUCTION_CASES" --parallel 4
bun conformance/runner/main.ts parts
bun conformance/runner/main.ts crash --runtime production --only "$PRODUCTION_CASES"
bun conformance/runner/main.ts suite --runtime prototypes/round-14 --parallel 4
bun conformance/runner/main.ts trace --case DLV-06 --crash 11 --scratch DIR --runtime production
bun conformance/runner/main.ts trace --script PART-cells-stress-1 --scratch DIR --runtime production
```

Plants: `git show f0387b7e^:` of `dsl/lifecycle.ts` with `dsl/lifecycle-incarnate.ts`, `turn/selection.ts`, or
`turn/refusal.ts` over the copy.

## Sidecar log

Three Haiku Explore sidecars at effort high: S1 blind (the cited rules and the three diffs only), S2 the lifecycle
traces and killers, S3 the owed rows.

| Finding | Sidecar | Result | Why |
| --- | --- | --- | --- |
| `Maybe` no longer excluded at restore | S1 | Accepted | Probe: start owes 1 beside Maybe (finding 2) |
| Unlanded disposal now read as landed | S1 | Changed | Only moves the Invariant label; wake set: finding 3 |
| `ownsRow` gotcha stale | S1 | Accepted | Finding 7 |
| Forget heads not woken at ready | S1 | Rejected | Not in the diff; the start owes them whenever it runs |
| Selection lets a re-send follow a restore | S1 | Rejected | `ended` doc says a restore leaves the call Held |
| Refusal skips when nothing is published first | S1 | Accepted | Low; production publishes at the start (finding 6) |
| No in-disposal reload-then-start trace | S2 | Changed | Covered in two steps; old m87 was removed code |
| Four boot heads unchecked at a start | S2 | Accepted | Finding 4 |
| `search PART-cells-stress-1` unreachable | S2 | Rejected | Pilots judge with no owed rows; passes on A2 |
| Stale boot comments | S2 | Accepted | Verified each line (finding 7) |
| Owed rows may flip by oracle | S3 | Changed | Plants show the runtime clears them (Owed part rows) |
| stress-9 I29 filed under RETRY_COUNT | S3 | Accepted | The boot fix cleared it, so its `why` text is wrong |
