# Re-check of the v3 test system after round 10, stage J

Commit `4c0762a9`, branch `flow-rewrite`. Run from a detached worktree at `scratchpad/recheck10j`, 18:59 to 19:31. The worktree was removed after the run. Scripts are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/r10j/scripts/`: `run-mut.ts` (the 10i runner, plus the lies below; `ONLY=` limits it to some cases) and `streams.sh`. Outputs are in `r10j/out/`. No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at 4c0762a9; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

S1 as it was written is fixed (section 1). One thing blocks a pass: the same class, one step earlier.

- **S1′** (High). A runtime that **restores a row in the wrong state** at a boot, publishes that state, and routes the restored ending by it, passes [ran].
  - The lie, `h.restore-at-send`: at the end of `restore` (`durable.ts`), each incarnation with a restored ending in mail gets the leaf its owner sent from (`owner.node`), not the leaf in its record. The boot step logs that world, so `BootArgs.reads` publishes it, and the ending routes from it as "current". This is a realistic bug: a runtime that saves the asking state with the attempt and goes back to it to deliver.
  - Its probe (`probe.restore-at-send`) fires in **19 cases**. The lie is red in **2** by named oracles: PAY-08/reload-while-reconciling (a timer count) and R10-BOOT-STATE (the case's memory check). **0 by (j).** RECIPIENTS is identical to the control's. With whole output, red in 14 of 19.
  - **Fully green, output included, in 5:** PAY-15/reload-holds-exactly-once, PAY-15/dispose-held, PAY-16/retry-count-persists, REV8-M3/a-lane-alone-still-floors-the-boot, REV8-M3/a-hold-does-not-rewrite-per-boot. In the PAY cases `Checkout/Pay` is restored in `PAYING` instead of `UNSURE`, runs `PAYING`'s `PayUnsure` (target `UNSURE`), and ends in `UNSURE`. These are the same three cases where 10i's `h.boot-state` was green. The hole is the same one; D180 only moved it.
  - R10-BOOT-STATE catches the lie only by `a heard it in REVIEW: expected {"inEditing":0,"inReview":1,"inSaving":0}, got {"inEditing":0,"inReview":0,"inSaving":1}`. At the 5 s gate, `gate-5s-expected.txt` lists exactly that failure as expected ("a move never captured restores the earlier state"). So at 5 s the one named case that sees the lie cannot tell it apart from a real capture loss [ran, read].
  - Why [read]: D180's state check (`inState`, `drive.ts:279`) compares the ear's node with the leaf the runtime publishes (`leafOf`, through `BootArgs.reads`). After an ordinary step that is a check against the state the suite could read and check before the step. At a boot, the first published state is the runtime's decode of a disk the suite owns, and **nothing compares it with that disk**. `DiskCodec` (D142) has `kind`, `heads`, `parked`, `decode` and `scope`, but no reader for an actor record's leaf. The published state is not used to excuse an obligation, but here it is the expectation, and it is unanchored. By the inventory's own terms (`convergence-10.md`, "Checked: a self-report ... itself cross-checked against something observed"), row 14's boot state check is an unlisted allowance.
  - Why it blocks: entities reload many rows together, each with a write in flight, and rows move while their writes are out. A runtime that puts each row back in the state it sent from passes (j) in every case. Named cases see it in 2 of 19, and the 5 s gate excuses one of those.

## 1. S1, rerun [ran]

Control: `740/740` named. `RECIPIENTS observed 45646; ambiguous 0; unplaceable 0; at a boot, placed 264; one serial in two places 0; unobserved (A2) 143; by sends 175; left over 0`. This matches STATUS.

| Lie | 10i (named) | Now (named, `--no-output`) |
|---|---|---|
| `h.boot-stale` | red in 1 of 12 probe cases, 0 by (j) | red in **5**, all 5 by `(j) a handler of ... ran at ..., a state its recipient ... does not publish` (PAY-08/reload-while-reconciling, PAY-15 ×2, PAY-16/retry-count-persists, R10-BOOT-STATE) |
| `h.boot-state` | red in 11, 0 by (j) | red in **15 of 15** by the same (j) line |

- `probe.boot-stale` fires in 13 cases (the 12 from 10i plus R10-BOOT-STATE). In the 8 that stay green (REV8-H1 ×4, REV8-M3 ×2, REV8-PINS/D111, REV9-EDGE/two-parked), the lie's whole output is also identical to the control's (`ONLY=` run with output, 63/63). The builder's note that "the stale node's handler is presumably also the one the leaf's chain reaches" holds as far as the output shows [ran, reasoning].
- R10-BOOT-STATE does what it says. Row a moves SAVING to REVIEW while its write is out. At the reload, a takes REVIEW's `Unsure` and b takes SAVING's (to EDITING). Both state lies turn it red by the state check at the ear (`h.boot-stale` at `Lab/RowMove.SAVING`) [ran].
- FRAG-24 does what it says. `falsify --lie h.boot-copy,h.boot-other`: `h.boot-copy` red in 2 of 2 (FRAG-15, FRAG-24) by `(j) delivered to the wrong recipient`; `h.boot-other` red in 5 of 5. With the decode mutant below, FRAG-24 goes red, so its placement does rest on the Host's decode [ran].
- `d154.moved-save-released` now fires: red by (j) in 1 of 1, FRAG-24 (half 20). It is no longer vacuous [ran].
- The A at the root of this, which D180 does not address, is S1′ above.

## 2. D180: self-report as excuse or as expectation

- **As written, it is an expectation, not an excuse** [read]. The ear can only add a red (`missing.push`). A run that matches the published state passes, and nothing is waived because of it.
- **It is trusted, though.** The lie above publishes a wrong state and routes by it, and nothing goes red by (j). Two named checks catch it (section "Verdict"). This is the S1 hole again.
- **Loud when absent** [ran]. `d180.no-reads` (the Port never calls `a.reads`) is red in 57 by (j) (`ran in an incarnation no actor or copy the suite drove publishes ... at a boot`), with unplaceable 74 and placed at a boot 0. So D180's stated cost holds.
- **The builder's reason for rejecting A does not reach this part of it** [reasoning]. Stepping the leaf through every run in a boot needs the reference to run guards. Anchoring the **first** published state does not: the boot step (`onBoot`, `step.ts:347`) restores and runs no handler. Each restored ending is its own later step, one mail item per `turn` (`onTurn`, `turn.ts:1252`; `pump`, `driver.ts:251`). At the `boot` evidence, the published reads answer from exactly the restored world (`early`, `adapter.ts`).

To pass:

1. At a boot's `boot` evidence, before any run, every actor and copy record on disk must publish the leaf its record holds. Read the record through the runtime's codec: one more reader, `port.disk.leaf(entries, actorKey, path)`, beside D142's. Anything different is red. This is not an excuse, and it needs no reference step. After that, each run is state-checked live, as D180 does now.
2. Put `h.restore-at-send` in `falsify --part lies`, red by that check. The same lie on a copy's state (an `inner` leaf) should be red too.
3. The memory restored without a restore Slot could be compared with the record's decoded memory in the same pass (optional; a memory lie is already seen by the cases' `mem` checks more often).

## 3. D181: `Host.decode` minting serials

| Question | Answer |
|---|---|
| Does it change runtime behaviour? | **No** [ran, read]. Control 740/740 named, and the counts above match STATUS (I did not rerun with output). Every actor and lane record goes through one `parse` (`durable.ts:214`), and the only other runtime `JSON.parse` is a lane key's normal form (`durable.ts:89`), which is not minted now. The suite's decode is `JSON.parse` plus symbol keys on `actor` records (`port.disk.kind`). `{ ...host, decode }` is safe: the fake host's members are arrow functions over the `FakeWorld`, with no getters or `this` binding (`fake-world.ts:199`). Records that fail to parse still throw inside `parse`'s `try`, so quarantine is unchanged |
| Is a decode outside it loud? | **Yes** [ran]. `d181.own-parse` (`parse` ignores `tx.decode`): red in **64**, all by `(j) a handler of ... ran on a view with no suite identity`. Ambiguous 82, placed at a boot 3 (the compiled `memory.restore` ones) |
| Does it carry to a production host? | **Yes, as a contract** [read, reasoning]. It is an optional Host member that the runtime calls for each stored record's text, so the store and codec live where production's do. A production runtime that ignores it, decodes by Schema without a restore Slot, or reads structured values from IndexedDB with no text mints nothing. That is loud (ambiguous), not a wrong pass. Persisted memory with a Schema compiles a `memory.restore`, which the stage H wrapper tags. Two conditions: production's Host contract must keep `decode` (or an equivalent value-level hook) as a member the runtime has to call, and `storage.load`'s text contract must carry over |
| What is left | Low [read]. Every plain object in an actor record gets a serial, not only memories: ending values, inputs and nested memory. Object spread copies enumerable symbol keys, so a patch that spreads a nested restored object (`patch: ({ memory }) => ({ ...memory.extra })`) moves that object's serial onto the incarnation. The placement still resolves to where the scan finds it, so this is not a wrong pass on its own. A serial only on the memory objects (root and each copy, by the record's shape through the codec) closes it |

D177's leaks (lane keys, the suite's own parses, the dynamic extent) are gone [read].

## 4. Gates the builder did not run [ran]

Three streams ran side by side, one command at a time within each stream, each command bounded at 295 s by `watch.ts`.

| Gate | Result |
|---|---|
| `falsify --part lies --slice 5/24` … `24/24`, every half | **All 20 halves reached. 42 lies, every one `ok`, and `FALSIFY every gate fails on what it should` in each.** None was killed by the bound (peak 1347 MB, longest 211 s). Halves 5 and 6 hold `h.boot-stale` (5 of 5) and `h.boot-state` (15 of 15). Half 20 holds `d154.moved-save-released` (FRAG-24) |
| `--part tamper` | 12 ok, `FALSIFY every gate fails on what it should`, 3 s |
| `--part watch` | 3 ok, 1 s |
| Halves not reached | none |

Scratch: `flow-falsify-s9Icir` in `$TMPDIR` (`/var/folders/wk/.../T/`, made 18:56:36, last written 18:57:36, a minute before this run). That is the builder's half 5, stopped at the hour. No process was running and `lsof +D` named no user, so I removed it by exact path. 27 older `flow-falsify-*` directories from 13:07 to 14:58 remain. They are not from this run and I left them. My own runs left none.

## 5. Unanchored: a new class

- **S1′** (above) is the one that passes every named oracle where it matters.
- **Inputs that waited for an async load, before the restored endings** (Medium) [ran]. This is fix B's reordering, as a lie: `h.boot-order` puts the boot input and `waitingBoot` in one inbox, so they step before the turns that deliver restored mail. The result is **740/740**, but vacuously: `probe.boot-order` (an input waiting while lanes are on disk) fires in **no case**. No case reloads with an input waiting on a slow `storage.load` while there are restored endings on disk. Production's stores (IndexedDB) always load asynchronously, so this is the normal path for entity rows. A `send` enqueues into mail behind the restored endings either way [read], so the order shows mostly for inputs that act at once (`ensure`, `dispose`, `hide`). The builder rejected fix B for exactly this ordering, and no case pins it. It closes with a named case: async load, records with writes in flight, and a `send` and a `dispose` arriving before the load answers.
- Carried from 10h and 10i, unchanged [read]: a follow-up pays a run in any copy of its actor; timer and unspent send credits live across batches; a stale serial resolves to the current life; A2 has 143 unobserved runs.

## Stated limits once S1′ closes

| Limit | Severity | Closes with |
|---|---|---|
| No case has an input waiting for an async load with restored endings on disk (`probe.boot-order` vacuous) | Medium [ran] | The named case in section 5, with `h.boot-order` in `--part lies` |
| A follow-up pays a run in any copy of its actor (10h) | Medium [reasoning] | A credit for the copy the reference's dispatch picks |
| Timer credits and unspent send credits live across batches (10h) | Low-Medium [read] | Credits scoped to their batch or firing |
| Every plain object in an actor record carries a serial; a spread of a nested one moves it | Low [read] | Mint only on memory objects, by the record's shape |
| A stale serial resolves to the current life (10h) | Low [reasoning] | Record the life when the serial is minted |
| Allowance A2: 143 unobserved | Low | As 10f |
| `Host.decode` is optional; production must keep it as a member the runtime has to call | Low [reasoning] | The production Host contract |

## Not reached

- `mutate.ts` and `mutate-one.ts` (STATUS has the control run, 178 s). I did not rerun the suite with output on the control.
- `--part suite1`-`suite3`, `search` and `mutants` (the builder ran them at stage J).
- Lie halves 1-4 (the builder's). I ran `h.boot-copy` and `h.boot-other` by `--lie` instead.
- The S1′ fix, the copy-state variant of the lie, and the boot-order case. None is built.
