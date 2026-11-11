# Re-check of the v3 test system after round 10, stage H

Commit `22a35366`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 15:52 to 16:40. The worktree was removed after the run. Scripts are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10h/scripts/`: `run-mut.ts` (the 10g runner, cut down, plus the `h.*` lies below), `one-mutant.ts`, `slices.sh`, `gates.sh` and `lies.sh`. Outputs are in `recheck10h/out/`. No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at 22a35366; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

Two things block a pass. Both are about the reload of many rows, which entities rely on.

- **H1⁶** (High). A restored ending that runs in the **wrong** actor or copy at a boot passes every named oracle [ran].
  - `h.boot-other`: the restored ending runs in another live actor of the machine. Its probe fires in 2 cases (MED-01, FRAG-20). It is red in FRAG-20 only, where the delivery comes after the boot. **MED-01 stays green.**
  - `h.boot-copy`: the restored ending runs in another unfrozen copy of the same fragment. Its probe fires in FRAG-15. **736/736 green.**
  - Why [read]: at a boot, `fits` takes any observation (`o.boot ||`, `drive.ts:517`), and a credit matches any recipient (`o.boot ||`, `:638`); `heardNow` never resolves a boot's serial (`:371`). So the count is conserved, but the recipient is never checked. Stage H states this limit. It is the H1 class (who received the ending) moved to the reload.
  - Why it blocks: entities reload with writes in flight on many rows of one machine, or many copies. If the endings are permuted among the rows at a boot, nothing named sees it. `h.boot-dup` (the ending run in its owner **and** in another actor at a boot) is red 2 of 2. So only the count is checked, not the placement.
- **T1** (High). The serial changes the compiled data the runtime runs. A restore-less machine's restore path is no longer tested [ran, read].
  - `listen` installs a `memory.restore` on every machine and fragment that has none (`drive.ts:308`). Only 2 of 44 fixture and scenario files define one. The runtime has its own branch for a missing restore (`durable.ts:408`: `dec ? dec.run(i.memory) : i.memory`), and `gate.ts:246/366` gate a restore only when one exists.
  - `h.restore-absent-lost` changes that branch to `{}`: every restore-less machine and copy loses its memory at a boot. Result: **736/736 green**, named oracles only (`--no-output`).
  - Before stage H, every boot of those machines ran that branch [reasoning; I did not run the mutant at `a766d75e`].
  - Why it blocks: "the tests run the real program" no longer holds for restore. Persisted entity rows without a custom restore are the default case.

The rest of stage H holds. The ledger closes H1⁵ and equal views (section 3). A serial shared by two incarnations is caught in practice (section 2). The gates I reached are ok (section 1).

## 1. Gates the builder did not run [ran]

| Gate | Result |
|---|---|
| `mutate-one.ts` on the control (suite, `--swap`, typed compare, date check, CLI pins, every `checks/` file, 5 s gate) | `{"killedBy":null}`, 200 s |
| `mutate-one.ts` on mutant `d138.self-allowed` (`mutants-r10.ts`) | `killedBy: suite` (R10-RUNTIME/a-state-named-self-is-refused-at-the-seal) |
| `mutate.ts --only d138.self-allowed` | void. From the worktree, its temp copy has no `node_modules`, so `types-check` says "no tsc". From the main checkout under load, the control hit mutate.ts's own 240 s limit. Neither is evidence. The direct `mutate-one` run above stands in for it |
| `falsify --part tamper` | every gate ok |
| `--part mutants` | 3 of 3 killed by named oracles; ok |
| `--part watch` | 3 of 3 ok |
| `--part search` | all 14 searches ok: not green on null or a constant hash, green or inconclusive on the real runtime, `listen.load` fails as known |
| `--part suite` | **cut by 295 s under load** after 8 ok lines (null, no runtime, constantHash, lyingFatal, noEvidence, noWaits, bogusIssue, lyingReplay). Not reached: `junkDiskKey` and the rest of the part. No BAD |

The `--swap` pass, the 5 s gate, the CLI pins and `checks/` ran inside the `mutate-one` control, and none of them killed it. I did not run them on their own, so I have no counts for them.

### Lie slices 6-12 [ran]

`--slice i/N` is supported (`falsify.ts:315`, index `% N`). I ran each slice k/12 as the two halves k/24 and (k+12)/24, one at a time. My other runs used the machine at the same time, so a lie took 60 to 130 s.

| Slice | Lie | Result |
|---|---|---|
| 6 | `lie.save-released`, `a4.refused-fence`, `d154.moved-fail-released`, `ref.binding-first-copy` | red: 23 of 38 by (j); 45 of 45; 10 of 11; 13 of 13 by `(ref) binding with subject` |
| 7 | `lie.settled-superseded`, `a4.refused-denied`, `d154.moved-like-released`, `e8.wa-unknown` | red: 282 of 288; 45 of 45; 1 of 1 (SURV-03); 21 of 23 by `(j) delivered to the wrong recipient` |
| 8 | `lie.serialize-as-latest`, `a5.unmapped-like2nc`, `d154.moved-save-released`, `e8.wa-failure` | red: 3 of 3; 2 of 2; vacuous, as before; 7 of 8 |
| 9 | `lie.dispose-start`, `a5.unmapped-save`, `d154.event-fail-released`, `e5.at-intent-fail` | red: 2 of 2; 38 of 38; **vacuous** (its trigger fires in no case); 5 of 6 |
| 10 | `lie.settled-released`, `a6.abandoned-like2`, `d154.event-like-released`, `e5.at-intent-fail-3` | red: 288 of 288; 3 of 3; **vacuous**; 1 of 2 |
| 11 | `lie.letgo-all-parked-on-cancel`, `a6.abandoned-save`, `a1.ghost-like2`, `g.decline-letgo-other-actor` | red: 1 of 1; 38 of 38; 32 of 32; 1 of 1 |
| 12 | `h1.like2nc-released`, `e2.subject-fan-fail-att`, `a1.ghost-save`, `q3.dup-other` | red: 2 of 2; 5 of 6; 62 of 62; 33 of 34 |

**All 28 lies of slices 6-12 were reached. Every one is `ok`**, and `FALSIFY every gate fails on what it should` in each half. Three are vacuous, meaning their trigger fires in no case: `d154.moved-save-released` (as before), `d154.event-fail-released` and `d154.event-like-released`.

## 2. The ledger and the serial, attacked

### Can the serial change runtime behaviour? [read, ran]

- **Copying, freezing, hashing, disk: no.** `canon` and `carry` (`gate.ts:35-48`) walk `Object.keys`, so the symbol key is not in any name, hash or carried text. `deepFreeze` freezes the object, and with it the key. Spread and `Object.assign` keep the key. A rebuild through `Object.entries` drops it, and the next run then counts as `ambiguous`, which is red. So a runtime that loses the serial fails loudly.
- **Restore: yes, this is T1.** The serial is minted in `initial` and `restore`. For the second, the suite gives every restore-less memory a restore, and the runtime then never takes its own branch for a missing restore.
- **Initial: no change in behaviour** [reasoning]. `tag` returns a fresh plain copy of a plain object. A runtime that compares `initial`'s result by reference would see a difference. None does [read: no such comparison in `round-10`].

### Stated limit: a boot's runs are counted, not placed [ran]

| Lie | Fires in | Named fails | By (j) |
|---|---|---|---|
| `h.boot-other`: a restored ending runs in another live actor | 2 (`probe.boot-other`: MED-01, FRAG-20) | 1 (FRAG-20, after the boot) | 1 |
| `h.boot-copy`: a restored ending runs in another unfrozen copy | 1 (`probe.boot-copy`: FRAG-15) | **0** | 0 |
| `h.boot-dup`: a restored ending runs in its owner and in another actor | (as `h.boot-other`) | 2 (MED-01, FRAG-20) | 2, `(j) a handler run nothing accounts for` |

**This blocks (H1⁶).** The ear already reads the serial at a boot (`drive.ts:279`). Only resolving it waits for `port.boot`.

### Stated limit: a serial published by two incarnations [ran, read]

- `h.shared-serial` is a wrong-actor delivery where the other actor runs on the **owner's memory object**, so both publish one serial afterwards. Red in 21 cases, 12 by (j). `h.shared-serial-eq` does the same only where the memories are equal: red in 15, 11 by (j).
- Why it is caught: `resolve` caches the first place a serial was seen (`whereOf`, `drive.ts:243`: it scans only when the serial is unknown). So the later runs in the clobbered actor resolve to the owner and are left over. The builder's note says "the last scanned wins". In fact the first one cached wins [read].
- A shared serial with no later run in either actor is unseen [reasoning]. Low. It closes with a scan that asserts each serial is in one place.
- A stale serial maps to the actor's **current** life (`lifeOf` is read at resolve time). A handler run on a pre-kill memory after a boot would pass as the current life [reasoning]. The fake process kill makes this hard to reach. Low.

### Stated limit: a follow-up pays a run in any copy of its actor [read, reasoning]

- A follow-up becomes actor-level `send` mail (`turn.ts:976`). Which copy it reaches is the runtime's dispatch, and the credit is the actor's with `path: null` (`drive.ts:297`). So a follow-up dispatched into the wrong copy of the right actor passes. I built no lie for it.
- Medium for entities with copies as rows. It closes by crediting the copy that the reference's dispatch picks for that event.
- Related [read]: a timer credit is `Infinity` and lives until the kill (`drive.ts:147`). A send credit that is never spent (the send was unhandled) also lives across batches. Either can pay a later wrong run of the same event in that actor. `q5.send-stolen` covers only the same batch. Low to Medium. It closes with credits scoped to the batch, or to the timer firing.

## 3. The last gate's lies, rerun [ran]

| Lie | 10g | Now (named, `--no-output`) |
|---|---|---|
| `q3.dup-other` | 0 by (j) | red in 34, **33 by (j)**. RECIPIENTS left over 2,241 |
| `q3.dup-copy` | 0 by (j) | red in 11, **9 by (j)** (FRAG-07, FRAG-15, FRAG-21 ×2, FRAG-22 ×2, ...) |
| `q1.wa-eq-any` | 1 by (j) of 26 fired | red in 28, **25 by (j)** |
| `q1.wa-eq-diffleaf` | fires nowhere | 1 fail: REV7-EDGE, my lie crashing on a BigInt, as at 10g. Still fires nowhere |
| `q2.copy-eq-sameleaf` | fires nowhere | 736/736: still vacuous (D174: within one actor, copies never share a view) |
| `h.copy-sib` (new: any ending run in a sibling copy, not only equal ones) | not run | red in 14, 12 by (j) |

H1⁵ and equal views are **fixed** while the runtime is up. The control's RECIPIENTS line is unchanged from the builder's: observed 45,380; ambiguous 0; at a boot 256; A2 143; by sends 175; left over 0.

## To pass

1. **H1⁶:** place a boot's observations after `port.boot` returns. Resolve their serials, which `restore` has minted, and apply the same `fits` and credit rules as any other batch. Put `h.boot-other` and `h.boot-copy` in `falsify --part lies`. Add a named case: two rows of one machine, and two copies, each with a parked ending across a reload, each ending reaching its own row.
2. **T1:** do not change what the runtime runs. Wrap only a `restore` the compiled data has. For a restore-less memory, mint its serial on the suite's first read after the boot, outside the runtime's path, or by a means that leaves the compiled data alone. Put `h.restore-absent-lost` in `--part mutants`, killed by a named oracle.
3. Rerun `--part suite` in full, and the slices not reached below, on an idle machine.

## Stated limits that remain once those close

| Limit | Severity | Closes with |
|---|---|---|
| A follow-up pays a run in any copy of its actor | Medium [reasoning] | A credit for the copy the reference's dispatch picks |
| Timer credits (`Infinity`) and unspent send credits live across batches | Low-Medium [read] | Credits scoped to their batch or firing |
| A serial with two publishers and no later run | Low [reasoning] | A scan that asserts one place per serial |
| A stale serial resolves to the current life | Low [reasoning] | Record the life when the serial is minted |
| Allowance A2: 143 unobserved | Low | As 10f |
| `d154.event-fail-released` and `d154.event-like-released` are vacuous (not reached at 10g) | Gate | A case where they fire, or retire them |

## Not reached

- `falsify --part suite` past its first 8 checks (`junkDiskKey` and the rest). It was cut at 295 s under load.
- `mutate.ts` itself. It ran, but neither run counts as evidence (section 1). `mutate-one.ts` ran directly instead.
- The `--swap` pass, the 5 s gate, the CLI pins and `checks/` on their own. Each passed inside the control's `mutate-one` run, which stops at the first gate that kills it, and nothing killed it.
- `h.restore-absent-lost` at `a766d75e`, which would show that stage H took the branch out of the tests. It is reasoned from the diff (`tagged` is new in stage H).
- `h.restore-absent-lost` with whole output, and through `mutate-one` (my run hit the 285 s spawn limit after the suite, with no verdict).
- A lie for the follow-up and credit limits in section 2.
