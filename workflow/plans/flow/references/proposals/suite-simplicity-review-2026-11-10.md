# Conformance suite: code-simplicity review (2026-11-10)

An Opus reviewing lead with four Haiku sidecars reviewed the code at HEAD `e9320217`, after its review of the
Haiku-written code. The orchestrator verified the High findings and decided what to act on, recorded in
`workflow/tasks/V3/log.task` and carried out through @task.V3.T40 and @task.V3.T7. This file keeps the reviewer's
findings as evidence. The verdicts below are the reviewer's; the decisions are the orchestrator's.

## Verdict

About 900 of the suite's roughly 8,050 lines (about 11%) can go with every guarantee still judged. The bigger cost
is the same fact modelled several times:

- an Attempt's life, once in each of the 5 oracles;
- lane identity, 3 ways;
- "may have applied", 3 ways;
- the Pay scenario helpers, copied into 9 files;
- every oracle folds over the whole timeline again after every step.

Rewrite `lane-queue` (with `lane-model`) and `delivered-once` from the Spec; patch everything else.

## Module verdicts (lines now → after, estimated)

| Module                                  | Serves                                | Action                                                                    |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `port.ts` (280)                         | The Port (Conformance R1)             | Keep                                                                      |
| `dsl/oracle.ts` (167)                   | Facts, Oracle, Mutant                 | A step fold with typed violations (S1), → about 190                       |
| `dsl/case.ts` (415)                     | Case DSL, judging                     | Split `openCase`, drop dead surface (S3), → about 320                     |
| `dsl/timeline.ts` (35)                  | An array with a copy                  | Inline, → 0                                                               |
| `dsl/actor.ts` (109)                    | Typed actor views                     | Drop `declared`/`NotInFixture`, `ensureWith`, `ref`, → about 90           |
| `world/*` (756)                         | The fake world                        | Remove dead parts (S6), → about 700                                       |
| `adapters/prototype*.ts` (573)          | Round-14 boundary                     | Delete dead parts only                                                    |
| `runner/*` (596)                        | Verdicts, falsify                     | Small merges (S8), → about 565                                            |
| `fixtures/*` (471)                      | References, fixtures                  | Drop `attempts`, derive `keyFields`, drop dead generics (S7), → about 440 |
| `lane-queue.ts` + `lane-model.ts` (661) | WriteLanes I8, I9, I11, I12, I20, I21 | Rewrite (S2), → about 480                                                 |
| `delivered-once.ts` (443)               | WriteLanes I15, I16, I22              | Rewrite (S2), → about 320                                                 |
| `ending-channels.ts` (281)              | WriteLanes I3                         | Patch: step fold, shared helpers, H5, → about 230                         |
| `attempt-identity.ts` (203)             | WriteLanes I6                         | Patch: step fold, shared helpers, drop `"(no key)"`, → about 175          |
| `actors/disposal*.ts` (762)             | Actors I29 to I36                     | Use the shared LaneId, attemptKey, may-have-applied (S5)                  |
| `*.mutants.ts` (490)                    | R6 kills                              | Keep; name duplicated find text once                                      |
| `*.scenarios.ts` (about 1,560)          | Cases                                 | One helpers module (S4), about −80                                        |

## Simplifications

**S1. The Oracle contract becomes a pure step fold with typed violations.**

- Goes: each oracle's own `steps(timeline)` re-fold and `fresh()` on every check; the copied `judged` tuple and
  `reduce<Judged>` folds in `delivered-once` and `disposal`; `lane-queue`'s `judgeStep` bookkeeping; the
  whole-timeline passes in `ending-channels` and `attempt-identity`; `case.ts` `judge` keeping only the first
  violation of each oracle; the string-prefixed Invariant in messages.
- Target: `Oracle<S> = { name; guarantee: ReadonlyArray<InvariantId>; start(reference): S; step(state, step,
  requests): readonly [S, ReadonlyArray<Violation>] }`, `Violation = { invariant; text }`. The Case keeps each
  oracle's state and folds only the new step.
- Keep the step as the unit, not the fact: `attempt-identity` learns every Minted and Ended before judging,
  `lane-queue` judges cancels at step end, and `delivered-once` keeps `pending` per step.
- Typed violations give R9 its rule as a field (Conformance Q11). Risk medium: a mechanical move first.

**S2. Rewrite `lane-queue` and `delivered-once` from WriteLanes R6 to R8, R10, R14, R15** as closed phases plus one
transition. Folds in the earlier review's M1, H1 to H4 and L1.

- `lane-queue`: phase `Queued | Waiting | Wire | Held{ at } | Replaced`; `heldAt` and `?? Infinity` go into
  `Held{ at }`; a pending cancel stays a separate obligation `CancelPending{ id, from }`, since it can coexist with
  `Replaced`; the `laneOf` index goes; lane identity from S5; `unstoppable` and `drivenTurns` stay as lists.
- `delivered-once`: the `owed`, `owedInSpan`, `parked` counters and the `open`, `unsent`, `excused` sets become one
  `Life` per ending, `Owed{ inDisposal } | Parked | Settled`, keyed by Attempt plus ordinal (one Attempt can have
  several endings: a StorageRefused re-send, Restored once per incarnation). Declines are a FIFO per operation,
  popped on delivery and on record; today a recorded decline is never popped (`delivered-once.ts:208`,
  `ending-channels.ts:57-74`), probably a pairing bug, unconfirmed. `claimedSuperseded` is dropped.
- Constraints the rewrite keeps: what survives a reload (`heldAt`, `drivenTurns`, `unstoppable`, `open`, `unsent`,
  `excused`, and disposed as a multiset: dispose, dispose, ensure still counts as disposed); `unstoppable` read at
  step end; each lane mutant's dependency: `audit-1.cancel-all-leaves-the-head` through the obligation,
  `lane.cancel-wire-as-never-sent` and `1b.cancel-all-wire-held-at-once` through `from`, `lane.held-auto-resend`
  and `lane.fresh-mint-on-held` through `Held{ at }` and the driven turns.
- Baselines to settle and state: a reload in the same step as a cancel (`forget` runs, then the deferred judgement
  writes `cancelled` again, against the Gotcha); which "before" a cancel is judged from when a previous turn's
  `Sent` lands between two turns.
- Risk high, intended: verdicts change on purpose.

**S3. Split and trim `dsl/case.ts`.** Split `openCase` into the runtime's life (boot, reload, end), the step engine
(`act`, `judge`) and the `Case` surface. Drop `Driver` and `driver`; break the case.ts and actor.ts cycle with
`import type`. Inline the timeline; counters instead of `count()` rescans. One `reportsOf(tag)` for `endings`,
`evidence`, `issues`, `denials`, `runtimeDisposals`. `ackAll` is `ack`. Remove `landLate` (with `network.landLate`,
`oldestLost`, `lost`), the unused `match` parameter of `answerStorage` (with `storage.matches`) and
`Actor.ensureWith`. Keep `hide` and `captureMs` (WriteAhead R10, T5); keep `answerWhere` only if keyed-lane cases
use it. Don't simplify: `shown`'s `String(...)`, structural equality via `Equal.equals`, `Facts.requests` as the
live log, the order inside `act` (record, run, settle, note requests, judge), `row` judging without settling, a
`Mismatch` naming no oracle.

**S4. One Pay helpers module.** `KEY`, `CART`, `CAPTURABLE`, `Shopper`, `shopper`, `pay`, `row`, `lastReason`,
`sent`, `toResend`, `reloadOnWire`, `cells`/`cellsShopper`, `start` are copied into 9 scenario files (`toResend`
and `reloadOnWire` exactly). Move them to `fixtures/pay-steps.ts` with `onWire(c, variant)`, and name the 3000 ms
re-read interval and the 60 s timeout from the fixture reference with their source (earlier review M3).

**S5. One definition per domain fact, in `dsl/`.**

- `attemptKey` (today `idOf` twice, inlined three times, and `keyOf` with the `"(decline)"` sentinel).
- One write lookup by machine and name (today `isWrite`, `writeNamed`, an inline filter, `writeOf`); resolve the
  machine from the Attempt's `Minted` actor.
- One `LaneId` and `sameLane`, from `disposal-ledger.ts:19-27`, used by `lane-queue` (H1) and `delivered-once`.
- One `mayHaveApplied(requests, request, operation)` anchored to the server log (WriteLanes R5); today three
  definitions. Unifying may change StillUnknown verdicts: check against R5 first.

**S6. World: dead parts.** `Storage.entries`, `Page.tasks`/`tasksRun`, `WorldClock.armed`, `World.seed` have no
readers; `Request.page` and `Request.at` are written and never read; defensive leftovers in `phaseOf` and
`shuffled`. Keep the seed formulas (`page.ts:69`, `storage.ts:116`). Copy-on-write private state is optional.

**S7. Fixtures.** Drop the `attempts` flag (true everywhere); derive `keyFields` from the key Schema; drop
`Fixture`'s 4 unused generic parameters and the identity map `CHANNEL`.

**S8. Runner and adapters, low priority.** `main.ts`'s `RuntimeChoice` round trip becomes a string, and its two
"no verdict" paths merge; `falsify.ts` `applyEdit` uses one `Effect.try` (keep `() => edit.replace`). Adapter
decoding once is optional.

## Patterns

1. An oracle is a pure step fold: state, one exhaustive transition (`$match`), typed violations.
2. Each tracked thing has one closed phase; a fact of one phase lives in that variant. Obligations that overlap
   phases are separate values. `disposal-ledger.ts`'s `ON_SENT`/`ON_ANSWER` tables are the template.
3. One definition per domain fact.
4. Absence is an `Option` or a union, never `""`, `"(…)"`, `-1` or `Infinity`.
5. Delete surface no case or named next area uses.

Share the pattern, not the state: one shared Attempt model would make the oracles fail together, and they judge
at different instants on purpose; each keeps its own state and name (R6's per-pair kill accounting).

## Proposed STYLE.md lines and lint rules

- STYLE.md example: an oracle model whose `Held` variant carries `at`, with one total transition; "a fact of one
  phase lives in that variant, never in a side map keyed by id".
- STYLE.md line: "Share the pattern, not the state, between independent checks."
- Lint `no-option-to-sentinel`; lint against template-literal map keys; a duplicate-definition check (jscpd).
- `guarantee` typed as InvariantIds, with a test that each has a registered mutant (R6, I38).

## Showing nothing got weaker

- Verdict-neutral items (S3, S4, S6, S7, S8, S5's key and lookup) land alone, with `suite --json` (seeds 1 and
  2), `suite --runtime null --json` and `falsify --sweep` byte-identical.
- S1 changes text: compare per case the verdict kind, oracle names and first violation's Invariant; per mutant
  the red set, caught-by set and expected Invariant.
- S2 and S5's may-have-applied change verdicts on purpose: land each with the changed cases and mutants, each
  with its cited rule (Conformance R11), plus new mutants for H1 to H5 and I16.
- The null gate can't tell oracles apart; only the sweep's sets show strength.
