# Re-check of the v3 test system after round 10, stage F

Commit `72beb7b7`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 13:23 to 13:50. Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10f/scripts/run-mut.ts` (the 10e runner, plus the lies below). No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at 72beb7b7; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

Two things block a pass.

- **H1''''** (High). An `unknown` ending delivered to **another actor** passes every named oracle (729/729).
  - The lie: when another live actor of the same machine exists, an attempt's `unknown` ending runs in that actor.
  - It fires in 20 cases (`probe.wa-unknown`). Only the whole-output compare sees it, in 4.
  - D164 checks the copy (`at`), not the actor. A root op's `at` is always `[]`, so any actor matches.
- **G1** (gate, a right runtime is red). `falsify --part search` is red on the real runtime.
  - The `odd` search's `list.dup` (two members with key `a`) gives `(j) delivered, and the suite could not decide its copy from what it drove: put att-1-1 ran in [uploads:a]`.
  - It is the same on a rerun, because the search runs on a state budget. D164 caused it. The builder did not run this part at stage F.

H1''', M1''' and M2''' are fixed. Item 3 (the per-actor `moveLetsGo`/`cancelsOn`) is a stated limit with no case. It does not block on its own. Details are below.

## 1. Last gate's findings, rerun [ran]

| Finding | Lie | Named fails (`--no-output`) | By (j)/(ref) | Status |
|---|---|---|---|---|
| H1''' | `e2.subject-fan-fail-att` | 4 (FRAG-15, FRAG-21, REV4-M3, REV4-L2) | 4 (j) "delivered to the wrong copy" | **Fixed**. It was 0/727 |
| | `e2.subject-fan-att` | 4 | 4 (j) | Fixed |
| | `e2.subject-fan-fail-att-last` (to the last copy) | 3 (FRAG-07, FRAG-15, FRAG-21/keyed-and-sends) | 2 (j) | Fixed |
| | `e2.subject-first` / `-last` | 16 / 16 | (ref) 11 / 12, plus (j) | Fixed |
| | `e7.restored-first` (a restored ending, after a reload, to the first of 2+ copies) | 1 (FRAG-15) | 1 (j) | Red, thin: one case |
| M1''' | `e1.park-keyed` | 64 | 50 (j) | **Fixed**. It was 0 |
| | `e1.park-keyed-fan-att` | 8 | 7 (j) | Fixed. It was 0 |
| | `a3p.park-decline` | 44 | 42 (j) | Fixed. It was 0 |
| A4' | `a4p.refused-turn` | 44 | 44 (j) | **Fixed** (D168). It was 0 |
| M2''' | lock | `expected.lock:910 file:reference/model.ts` [read]. `main.ts` walks `reference/` [read] | | **Fixed**. I did not rerun the tamper part. The builder ran it |

The control is 729/729 [ran].

## 2. Gates the builder did not run [ran]

| Gate | Result |
|---|---|
| `mutate-one.ts` control (suite with output, `--swap`, `typed/compare.ts`, `typed/date-check.ts`, `cli/main.ts` pins, `checks/` in sorted order) | Passed suite, `--swap`, typed compare, date check, CLI pins, `mailq-check`, `score-check` and `search-vacuity-check`. Stopped at `checks/types-check.ts`: `tsc` is found now (L2 fixed), but `Cannot find module 'effect'` from `fake-world.ts` and `fixtures/build.ts` in a fresh worktree. That is an environment artifact (L1 below). A scratch tsconfig with `paths` did not resolve it in time |
| `gate5s.ts` | `GATE-5S 29 failed, 29 expected; unexpected: none` |
| `falsify --part search` | **BAD** `search odd: green on the real runtime failed`. Every other search is `ok`. See G1 |
| `falsify --part mutants` | 3 ok, `FALSIFY every gate fails on what it should` |
| `falsify --part watch` | 3 ok |

### G1. D164 is red on a right runtime with duplicate keys [ran, read]

- **Rerun:** `search/run.ts --which odd --depth 4 --states 4000` gives verdict `failed` in 7.7 s, the same on a second run.
- **Cause** [read]:
  - `ODD_LISTS` has `["dup", [{ ref: "a" }, { ref: "a" }]]`.
  - `Reference.copies` pushes one entry per membership item, so the live path `uploads:a` appears twice.
  - `placeFor` keeps only `pick.length === 1`. Two equal paths count as undecided, and D164 makes an undecided delivery red.
- **Why it blocks:** the falsify gate says one gate "stayed green or broke". A right runtime fails the suite's own gate.
- **Fix:**
  - De-duplicate `copies` by path in `reference/model.ts`. Rule 51 makes one incarnation per key.
  - Add the `dup` shape to a named case, so the suite sees it, not only a search.

## 3. The per-actor `moveLetsGo` / `cancelsOn` (the builder's stated limit)

| Lie | Fires in (probe) | Named fails | By (j) |
|---|---|---|---|
| `e4.moved-other-released`: a keyed copy's failure let go (`Released` plus `evidenceOnly`) once another turn of the same owner has run in the step | **0** (`probe.moved-other`, `-fail`) | 0 | 0 |
| `e4.moved-other-plain` | 0 | 0 | 0 |
| `e3.keyed-released`: every keyed failure let go | 33 (`probe.keyed-fail`) | 33 | 18 |

- **What this shows** [ran]:
  - The shape the builder names fires in no case. The runtime admits an ending in a step of its own, so "another copy moved beside it" never occurs in the suite. FRAG-21's second variant was meant to reach it and does not.
  - The wide lie is red in every case where it fires (33/33), but only 18 of those are by (j). In the other 15 (REV4-H3 ×12, REAL-03, REV9-KEPT and others), (j) stays silent and hand asserts catch it.
  - [reasoning] That silence is the whole-actor excuse at work. A keyed copy's ending is a fragment op, so `moveLetsGo` returns `unknown` and pays the let-go whenever anything the actor publishes moved in the batch.
- **Judgement: a stated limit, not a blocker on its own.**
  - No wrong runtime I built passes with it, and its trigger is unreachable in today's cases.
  - Entities will reach it: many copies, one moving while another's write fails in one batch.
  - **Named case owed:** a keyed copy's failure, admitted in the same batch as another copy's own turn (two lanes answered in one `do`), with (j) asked to see the let-go.
  - **What closes it:** answer `moveLetsGo` and `cancelsOn` per copy from `Reference.copies`, as D165 did for parks. That means the attempt's own copy left, or its own reset value changed, and not "the actor's memory moved".

## 4. New classes, unanchored

### H1''''. Cross-actor delivery passes every named oracle [ran]

- **Lie `e8.wa-unknown`** (in `admitEnding`):
  - `const a = <another live actor of a0's machine> ?? a0` when `item.attempt && item.ending.ch === "unknown"`.
  - The ending is delivered and the turn runs. `delivered` is said with `at: []`, truthfully. It runs in the wrong actor.

| Lie | Fires in | Named fails | By (j)/(ref) | Whole output |
|---|---|---|---|---|
| `e8.wa-unknown` (`unknown` endings) | 20 (`probe.wa-unknown`: PAY-12, DRV-01, LIKE-02/03/04/06, STORE-03/05/07/11, LIB-02, MED-01/02, FRAG-12/13/20) | **0 (729/729)** | 0 | 4 fails |
| `e8.wa-failure` (`failure` endings) | | 3 (STORE-04/Cancelled, R10-AUDIT-ENDINGS ×2), all hand asserts | 0 | |
| `e8.wrong-actor-fail` (failure or unknown) | 23 | 3, hand asserts | 0 | 8 |
| `e8.wrong-actor-any` | | 7, hand asserts | 0 | |
| `e8.wa-fail-frag` / `-any-frag` (fragment ops only) | **0** (`probe.wa-frag`) | 0 | 0 | |

- **Why (j) cannot see it** [read]:
  - `delivered` carries `op`, `attempt`, `event` and `at`, but no actor (`turn.ts:1156`).
  - `heard` is any `turn` in the batch (`drive.ts:348`).
  - D164's check is `samePath(want.path, at)`. A root op's recorded copy is `[]`, so it matches in every actor.
  - The suite knows the owner (`attemptActor`) and is never asked whether the delivery's turn was the owner's.
- **Why it is a High:**
  - Entities fan endings out to many actors. Which actor hears a lost write is what they rely on.
  - The bug is plausible: an actor looked up by a lane's key built from a shared record, an entity id, or the first subscriber.
  - It is the 10e "Not reached" item ("the same destination check is owed per actor"), still open.
- **Coverage gap** [ran]: no case has two live actors of one machine with a fragment op (`probe.wa-frag` fires nowhere). The entity shape, copies across many actors, has no case at all.
- **Fix:**
  1. `delivered` names its actor (or D164 ties the delivery to the next `turn`'s `actor`).
  2. (j) checks it against `attemptActor`. A mismatch is red. The same goes for a park or a let-go: its actor must be the owner, or a seen cause.
  3. Put `e8.wa-unknown` in `falsify --part lies`, with its probe firing.
  4. Add a named case: two actors of one machine, an `unknown` ending of one, and an assert on the other's state.
  5. Add one case with two actors that each hold keyed copies.

### M1''''. D164 rests on `at`, the runtime's word [ran]

- **Lie `e5.at-intent-*`** (in `deliver`): the turn runs in another live copy (`runTurn(tx, a, <other path>, …)`), while `delivered` keeps `at: path`.

| Lie | Fires in | Named fails | By (j) |
|---|---|---|---|
| `e5.at-intent-fail` (to the first copy) | 4 | 1 (FRAG-21, hand assert) | 0 |
| `e5.at-intent-fail-last` (to the last copy) | 4 | 2 (FRAG-07, FRAG-21/keyed-and-sends, hand asserts) | 0 |
| `e5.at-intent-any` | 6 | 4 (FRAG-15 search, FRAG-21, REV8-M3, REV9-BURST, hand asserts) | 0 |
| `e5.at-intent-any-last` | | 7, hand asserts | 0 |
| `e5.at-intent-fail-3` (3+ copies) | **0** (`probe.fan3-fail-att`) | 0 | 0 |

- **Why it is Medium, not High:** every variant that fires is red by some named case.
- **Why it matters:**
  - D154's principle is that an oracle trusts only a cause the suite saw. D164 trusts the runtime's report of where a delivery ran.
  - When the report and the effect differ, only hand asserts in 1 to 4 cases speak.
  - No case has three or more live copies with a failure, and entities will have many.
- **Fix:** check the effect as well as the word. After a delivered turn, a copy other than the recorded one whose `inner` state or memory changed, with no other cause in the batch, is red. Add a case with 3 or more copies.

### Restore after reload with many copies [ran]

- `e7.restored-first` is red by (j), in FRAG-15 only. `probe.restored-fan` fires in FRAG-15 and in REV9-KEPT, which is a decline.
- It is covered, thinly. **Owed:** a named case where a reload has 2+ live copies and an ending restored to the second.

### A batch moving many owners [read, reasoning]

- `mayLetGo` for a let-go with no attempt (a parked decline's `ParkedLetGo` or `KeptLetGo`) accepts **any known actor's** move or cancel (`drive.ts:225`, `[...known].some(seen)`).
- So in a batch that moves owner A, a decline parked on owner B can be let go and (j) pays it. Entities' batch writes move many owners at once.
- I did not build this lie in time. Rated Medium [reasoning]: it is the same class as H1'''' (a destination by actor, not checked), on the decline path.
- **Fix:** a decline's let-go is owed the actor of its lane (`laneKey`'s actor, which the suite can read from the decline's turn, as D165 does for a decline's park).

### Cross-actor mail order [reasoning]

- Nothing orders two actors' turns unless a turn links them (convergence-10, owed rule 4). The searches `chain` and `cross` are green, and `chain` is inconclusive at its budget.
- I built no lie. The new risk is the same as H1'''': an ending landing in the wrong actor, not out of order.

## To pass

1. **H1''''**: a delivery's actor checked against `attemptActor`; `e8.wa-unknown` in `--part lies`; a named two-actor `unknown`-ending case.
2. **G1**: de-duplicate `Reference.copies` by path; rerun `falsify --part search` to all `ok`.

## Stated limits, if those two close (each with what closes it later)

| Limit | Severity | Closes with |
|---|---|---|
| `moveLetsGo` / `cancelsOn` whole-actor, so another copy's move excuses a keyed let-go (item 3) | Medium for entities, unreached today | Per-copy answers from `Reference.copies`, and a case with two lanes answered in one batch |
| `at` is a self-report (M1'''') | Medium | An effect check on `inner` per copy; a 3+ copy case |
| A decline's let-go is excused by any actor's move | Medium [reasoning] | The decline's lane actor, as for its park |
| `resetOn` copies not asked by (ref) (D166's stated cost) | Low | (j)'s park check covers them. (ref) can ask once the subject encoding is published |
| A restored ending among 2+ copies is red in one case only | Low | A named reload case with two copies |
| Allowances A2, A5, A6, A7 | Tolerable, as in 10e | |
| L1: `checks/types-check.ts` in a fresh worktree cannot resolve `effect` (`tsc` itself is found now) | Low, environment | Resolve modules through the common dir's `node_modules` too (a `typeRoots` or `paths` entry, or run from the main checkout) |

## Not reached

- `falsify --part tamper` and `--part lies` were not rerun. The builder reports them all ok, and 39 of 42 red.
- The second half of `types-check.ts` (stripped-directive pins) and real-browser modes were not reached.
- The decline-let-go lie above.
