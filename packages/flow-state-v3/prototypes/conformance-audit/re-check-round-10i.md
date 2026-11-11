# Re-check of the v3 test system after round 10, stage I

Commit `cfad211e`, branch `flow-rewrite`. Run from a detached worktree at `scratchpad/recheck10i`, 17:25 to 18:06. The worktree was removed after the run. Scripts are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/r10i/scripts/`: `run-mut.ts` (the 10h runner, cut to the boot lies, plus the new state lies below), `probe-where.ts`, `one-mutant.ts`, `streams.sh` and `suite-rest.sh`. Outputs are in `r10i/out/`. No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at cfad211e; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

H1⁶ and T1 are fixed (section 1). One thing blocks a pass, and it is the limit D176 states.

- **S1** (High). A restored ending that runs in the **right** actor and copy, but from a **state it is not in**, passes at a boot [ran].
  - `h.boot-stale`: a restored ending is routed from the node its owner sent from (`item.owner.node`), not from the current leaf. That breaks the rule the runtime writes down for restored mail: "current from the active leaf, whatever the owner" (`world.ts:124`; `routeFrom`, `turn.ts:1105`). This is a realistic bug: it is what a runtime does if it forgets that a restored ending is current. Its probe (`probe.boot-stale`) fires in **12 cases**. The lie is red in **1** (PAY-08/reload-while-reconciling, by a timer count). **0 by (j). With whole output: 737/738**, so the output sees nothing more.
  - `h.boot-state`: a restored ending runs the handler of any node outside the leaf's chain that handles its event. Its probe fires in 14 cases. Red in 11, all by the case's own `state:` or timer checks. **0 by (j)**; with whole output, still 727/738. Green in PAY-15/reload-holds-exactly-once, PAY-15/dispose-held and PAY-16/retry-count-persists. There, `Checkout/Pay` in `UNSURE` ran `PAYING`'s `PayUnsure` (target `UNSURE`) in place of `UNSURE`'s own (target `self`). Both end in `UNSURE`, so no case check sees it [ran, `probe-where.ts`].
  - `h.boot-state-stay` (the same, but only for a wrong node whose handler does not move) is vacuous: its trigger fires in no case [ran].
  - Why [read]: every other run's state is checked at the ear (`inState`, `drive.ts:327`). At a boot the ear has no `who` (`booting ||`, `:326`), and the held batches are placed after `port.boot` returns, by serial only. Nothing checks the node. D176 states this ("only the state check waits: the leaf has moved").
  - Why it blocks: entities reload many rows at once, each with a write in flight, and rows move while the write is out (Saving to Editing, a row closed). Each restored ending has to take its row's **current** state's handler. A runtime that picks the handler from a stale state passes 11 of 12 cases where it does that, with whole output, and the general oracle is blind there. It is the same class as H1⁶: "a boot is not a special case" holds for who and how many, not for which state.

## 1. H1⁶ and T1, rerun [ran]

Control: `738/738` named; `RECIPIENTS observed 45,642; ambiguous 0; unplaceable 0; at a boot, placed 260; one serial in two places 0; unobserved (A2) 143; by sends 175; left over 0`.

| Lie or mutant | 10h | Now (named, `--no-output`) |
|---|---|---|
| `h.boot-other` (restored ending in another live actor) | MED-01 green; red only in FRAG-20 | red in **4 of 4**, all by `(j) delivered to the wrong recipient` (MED-01, FRAG-20, R10-BOOT-ROWS ×2) |
| `h.boot-copy` (restored ending in another unfrozen copy) | 736/736 green | red in **1 of 1** (FRAG-15) by (j) |
| `h.boot-dup` (owner and another actor) | red 2 of 2 | red in 4 of 4 by `(j) a handler run nothing accounts for`; left over 7 |
| `h.restore-absent-lost` (the runtime's restore-less branch returns `{}`) | 736/736 green | red in **92**, 61 by (j). `falsify --part mutants`: killed by named oracles in 92 |

`falsify --part lies --lie h.boot-other,h.boot-copy,h.boot-dup`: all three `ok`, `FALSIFY every gate fails on what it should`.

**H1⁶ is closed. T1 is closed:** `listen` no longer installs a restore (`drive.ts`, `tagged`), and the runtime's branch at `durable.ts:411` runs and is guarded.

One thin spot remains [ran]. `h.boot-copy` fires in **one** case, FRAG-15. The 10h gate asked for a named case with two copies, each with a parked ending across a reload. R10-BOOT-ROWS has two rows only. Copies at a boot rest on one case. Medium. It closes with that case.

## 2. D177: the `JSON.parse` hook

### What it does [read]

`whileRuntimeRuns` (`drive.ts:35-47`) swaps the global `JSON.parse` for the length of each `run`, `settle` and `boot`. Every plain, unfrozen object any parse returns in that window gets a serial in place, nested objects included. A counter handles nesting and `finally` puts the original back.

### Does it change runtime behaviour? No, here [ran, read]

- Control 738/738 named, and `mutate-one` on the control (suite with output, `--swap`, typed compare, CLI pins, `checks/`, 5 s gate): `{"killedBy":null}`. So no expected output, hash or pin moved.
- In round-10, nothing reads symbol keys: `canon`, `carry`, `deepFreeze` and the codec walk `Object.keys`; no `Reflect.ownKeys`, `getOwnPropertySymbols`, `isDeepStrictEqual` or `Bun.deepEquals` in `round-10/` or `conformance/` [read].
- `JSON.parse` is the original at process exit [ran, instrumented copy].

### Does it leak? Yes, to everything in the window [ran]

I counted the hooked parses over the whole suite (an instrumented copy of `drive.ts`, 738/738):

| Caller | Parses | What gets a serial |
|---|---|---|
| the suite's own code in the runtime's callbacks (`drive.ts:371` `reaches`, `:471` the leaf before) | 253,766 | nothing (arrays of strings) |
| `durable.ts:89`, a restored lane's key | 8,545 objects | every object lane key |
| `durable.ts:214`, a record | 934 | the record, its memory, and everything nested in it (ending values, inputs) |
| `adapter.ts:94`, the Port's disk codec, called by the suite | 1 | the suite's own read |

- Searches run under it: `search/run.ts` uses `makeHarness` [read]. `--part search` is all ok (section 4).
- The reference model has no `JSON.parse` [read]. The bench drives a real browser through its own driver, not `drive.ts` [read].
- Of the 260 boot placements, **257 rest on the hook**. Only 3 go through a compiled `memory.restore`: with the restore-less branch replaced by `structuredClone(i.memory)` (my `d177.other-codec`), at a boot, placed drops to 3, ambiguous rises to 78, and 62 cases are red by `(j) ... a view with no suite identity` [ran]. So it fails loudly, as D177 says.
- A wrong pass through it [reasoning, Low]: a lane key or an ending value is now an object with a serial. A handler that spreads one into memory gives the incarnation that object's serial. If one parsed object reaches two incarnations, they share a serial. D178 sees that only on a scan, and a scan runs only when an unknown serial turns up (`resolve`, `drive.ts:288`). A shared serial that is already known resolves to the first place, so a run in the other incarnation passes as the first. No case does this today.

### Will it carry to production? No [read, reasoning]

- `durable.ts:404` says this restore is "a stand-in for Schema decode with defaults" (D82). A Schema decode of a struct builds a new object of the declared keys, so the serial is gone. A browser store such as IndexedDB returns structured clones and does not call `JSON.parse` at all. Either way every restored view is `ambiguous` and the ledger is red throughout. That is not a wrong pass, but production's harness would need a new means.
- A process-wide swap with a dynamic extent is also unsafe once the runtime is asynchronous (Effect fibers): parses from other work in the window get serials, and the runtime's own parses after an `await` get none.

### Judgement: a hack, not a blocker

It is a hack by scope. It instruments the platform for the whole process to reach one branch, and it gives serials to about 9,500 objects that are not memories. It is sound for this prototype: it changes no behaviour, and it fails loudly on any other codec. **It does not block this gate.** It is a Medium limit, because the boot's placement (257 of 260) does not carry.

The alternative, inside the harness's own seams:

1. **Route the record decode through the Host.** `durable.ts`'s `parse` calls `host.decode?.(key, text) ?? JSON.parse(text)`. The fake host is the suite's own (`fake.host()`). Its `decode` mints serials on what it returns, and only there: no global, no lane keys, no suite parses. It is a standard upfront contract. Production's host is where its store and codec live anyway.
2. **In production, wrap the decode Slot the compiled data has.** Every persisted memory there has a Schema, so it compiles a `memory.restore`. Stage H's wrapper of an existing restore (kept in stage I) is the production seam. The restore-less branch is then only for memory that is never persisted.
3. Keying serials by actor identity in a harness table, as the builder was asked, does not reach a boot by itself [ran, reasoning]. At a boot's ear the view is all the suite has. For a keyed copy, or one with kids, the view's `memory` is a spread copy (`viewOf`, `inc.ts:72-74`), so a table keyed by the object misses it. And after the restored turn, the actor publishes a new object. A table works only if the boot returns before restored endings run (see S1's fix B), so the suite can read every restored actor and copy first.

## 3. D176 attacked: a boot's run in the wrong state

See the verdict. The lies are in `run-mut.ts`: `probe.boot-stale`, `h.boot-stale`, `probe.boot-state`, `h.boot-state`, `probe.boot-state-stay`, `h.boot-state-stay`.

To pass, one of these:

- **A, harness only.** At a boot's ear, record the node. Before `port.boot`, read each actor's leaf and its copies' states from the disk the suite owns, through the runtime's declared codec (`port.disk`, D142; it needs one more reader there, `leaf(record, path)`). When the held batches are judged in order, check each run's node against that leaf's chain. Advance the leaf by the reference's own step, not by the runtime's `turn`.
- **B, a standard contract (recommended).** `port.boot` returns before restored endings are delivered, and they run on the first settle. Then a boot's runs are ordinary runs. They are placed live, state checked live, and need no held batches. The JSON.parse hook can go too, since the suite can read and mint before any run (section 2, item 3). Check this against the spec's boot rule first.

Either way, add a named case where two rows reload with a write in flight, and one row moved between the send and the kill into a state with a different handler for the ending's event. Each row has to take its current state's handler, and (j) has to see the state. Put `h.boot-stale` and `h.boot-state` in `falsify --part lies`.

## 4. Gates the builder did not run [ran], one command at a time per stream

Streams ran side by side (my lies; the lie halves; the parts), each command bounded at 295 s by `watch.ts`.

| Gate | Result |
|---|---|
| `mutate-one.ts` on the control (suite with output, `--swap`, typed compare, date check, CLI pins, every `checks/` file, 5 s gate) | `{"killedBy":null}`, 199 s |
| `mutate-one.ts` on mutant `d138.self-allowed` (`mutants-r10.ts`) | `killedBy: suite` (R10-RUNTIME/a-state-named-self-is-refused-at-the-seal), 63 s |
| `falsify --part search` | all 14 searches ok: not green on null or a constant hash; green or inconclusive on the real runtime; `listen.load` fails as known. 46 s |
| `falsify --part mutants` | ok, `FALSIFY every gate fails on what it should`; `h.restore-absent-lost` killed by named oracles in 92 |
| `falsify --part suite` | **cut by 295 s again**, after the same 8 ok lines as at 10h (null, no runtime, constantHash 61/738, lyingFatal 0, noEvidence 36, noWaits 179, bogusIssue 5, lyingReplay 2). No BAD |
| The rest of `--part suite`, by hand with its own commands (`suite-rest.sh`) | `junkDiskKey`: red, 255/738, exit 1. `oracles: bogusIssue --no-output`: 5/738 pass, exactly the 5 allowed (SEARCH-ODD ×2 and the three NO_BOOT cases). `lyingReplay --no-output`: 2/738, exactly SEARCH-ODD ×2. `--only NOPE-99`: exit 1. **Every check of the part is now reached, and each holds** |

### Lie halves 7-22 of 24 [ran]

`--slice h/24`, one at a time, about 2 minutes each. **All 32 lies reached, every one `ok`**, and `FALSIFY every gate fails on what it should` in all 16 halves. None was killed by the bound.

| Half | Lies |
|---|---|
| 7-11 | `lie.settled-superseded` (284 of 290 by (j)), `a5.unmapped-save`, `lie.serialize-as-latest`, `a6.abandoned-like2`, `lie.dispose-start` (now red in R10-BOOT-ROWS too), `a6.abandoned-save`, `lie.settled-released`, `e2.subject-fan-fail-att`, `lie.letgo-all-parked-on-cancel`, `e2.subject-fan-att` |
| 12-16 | `h1.like2nc-released`, `e1.park-keyed`, `h1.like2nc-plain`, `e1.park-keyed-fan-att`, `h1.save-released`, `a3p.park-decline`, `h1.second-released`, `a4p.refused-turn`, `h1.unknown-released`, `ref.binding-first-copy` |
| 17-22 | `h1.lanecell-noatt-like2nc`, `e8.wa-unknown`, `d154.moved-fail-released` (10 of 11), `e8.wa-failure` (7 of 8), `d154.moved-like-released`, `e5.at-intent-fail`, `d154.moved-save-released` (**vacuous**, as before), `e5.at-intent-fail-3` (1 of 2), `a1.ghost-like2`, `g.decline-letgo-other-actor`, `a1.ghost-save`, `q3.dup-other` (35 of 36) |

`d154.moved-save-released` is the one vacuous lie left. Its trigger fires in no case. It was not retired with the two `d154.event-*` lies (D179).

## Stated limits that remain once S1 closes

| Limit | Severity | Closes with |
|---|---|---|
| D177's hook does not carry to production; 257 of 260 boot placements rest on it | Medium [ran, read] | The Host's decode (section 2, item 1), and in production the compiled `memory.restore` wrapper |
| Copies at a boot rest on one case (FRAG-15) | Medium [ran] | The two-copies reload case the 10h gate asked for |
| A follow-up pays a run in any copy of its actor (10h) | Medium [reasoning] | A credit for the copy the reference's dispatch picks |
| Timer credits (`Infinity`) and unspent send credits live across batches (10h) | Low-Medium [read] | Credits scoped to their batch or firing |
| D178's one-place check runs only on a scan, and a scan only on an unknown serial; parsed objects with serials can reach memory | Low [read, reasoning] | A scan after every batch, or serials only on memories (section 2, item 1) |
| A stale serial resolves to the current life (10h) | Low [reasoning] | Record the life when the serial is minted |
| Allowance A2: 143 unobserved | Low | As 10f |
| `d154.event-*` retired (D179); a cancel by a driven event has no lie | Gate [read] | The case owed in `round-10/STATUS.md`, item 0 |

## Not reached

- Lie halves 1-6 and 23-24 of 24 (the builder's, and stage I's boot lies; I ran those three by `--lie` instead).
- `falsify --part suite` in one command under 5 minutes. It needs about 7 minutes. I reached every check by hand (section 4).
- `mutate.ts` itself. I ran `mutate-one.ts` directly, as at 10h.
- `--part tamper` and `--part watch` (ok at 10h; stage I does not touch them [read]).
- A lie for the follow-up and credit limits (10h).
- A runtime with an asynchronous boot, to confirm the hook's dynamic extent misses its parses [reasoning only].
- The S1 fixes A and B. Neither is built.
