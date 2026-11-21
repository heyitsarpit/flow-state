# Operations: companion to the Spec

**Bottom line:** a read is three small states (entry, slot, releasing call) with one dispatch for a settled call,
one position per entry and no stored timer, flag or waiter position; an ending's refusal lives on its row and the
row moves before the publish; every issue is a view over its owner's state through one catalog; a failure that
crosses cleanup is one total function over Exits; and everything public goes through one door. The write lane's
table (`core/cells.ts`) is not changed. This file holds what does not fit @spec.Operations: the walkthrough, the
problem classes, the principle ledger, the fit to today's code, the seams, the questions, the open holes and the
process notes. The Spec is pre-coding analysis, to be followed as best-guess guidance and revised whenever building
shows it wrong (`wiki/specs/specs.log` records each change).

Code paths are under `packages/flow-state-v3/` (`src/core/` unless they start with `src/`, `tests/` or `fixtures/`).
Every keyword in a code block is marked existing, CHANGED, NEW or user-defined.

## 1. Walkthrough: one payment, from `fetch` to the mapper

The app's code (`fixtures/services/shop/`, shortened: the real commit also maps its value and catches
`IntentBusy`; every name is existing unless marked):

```ts
// operations/writes.ts. user-defined: ShopApi, onTheWire, LOST, TimedOut, PAY_DEADLINE
export const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    ShopApi.use((api) => onTheWire(api.confirm(input, { idempotencyKey: attempt.id }))).pipe(
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({ duration: PAY_DEADLINE, orElse: () => Outcome.unknown(new TimedOut()) }),
    ),
});
// adapters/shop.ts: HttpClientRequest.post("/confirm") with the header Idempotency-Key, run by
// FetchHttpClient.layer: interrupting the fiber aborts the fetch's AbortSignal (Effect's client; not re-checked).

// machines/pay.ts. CHANGED: the mapper's second argument (the user's decision, 2026-11-20)
operations: {
  pay: pay.outcomes({
    success: E.Confirmed.from((value, { input, key }) => ({ ...value, card: input.paymentMethodId })),
    failure: { IntentBusy: E.PayRefused.from(() => ({ reason: "..." })) /* and the other tags */ },
    notSent: E.PayNotSent.from((e) => ({ why: e.why })),
    unknown: E.PayUnsure,
  }),
},
```

1. **Send.** `PayRequested` runs `O.pay.commit(withCard)`. The lane's table mints an Attempt, writes it ahead and
   sends it: `Command.Invoke`. The host forks `call/<id>` under the Runtime's Owner and runs `commit`. The Attempt
   id is the idempotency key, `att-<seed>-<n>` (`core/tx.ts:188-191`): the seed is fresh for every boot, so no
   later Runtime mints it again and the server never takes a new payment for a replay of an old one (Spec, rows).
2. **Timeout.** After 60 seconds `timeoutOrElse` ends the Effect as `Outcome.unknown(TimedOut)`. The host reports
   `CallResult.Unknown`; the lane holds its head and owes one row, channel `unknown`. The row's turn sends
   `PayUnsure` and Pay enters `UNSURE`. A bare `Effect.timeout` would put `Cause.TimeoutError` in the commit's
   error type: that is a type error on `transaction`, and at run time it is classed unknown, never a failure.
3. **Reading back.** `UNSURE` polls `O.intent.lookup(intent)` every 3 seconds. The first lookup finds the entry
   `Checkout/intent | pi_1` Idle and starts one call. The second tick finds it Running and current: the slot keeps
   its one wait and no second call starts. Today each lookup interrupts the call before it (`lanes.ts:275`), so a
   server slower than the poll never answers; `payment-retry.test.ts:153` pins that and flips.
4. **Cancel during the call.** `OrderSeen` runs `O.intent.cancel` and `O.pay.cancel(intent)`.
   - The read: the slot is dropped; it was the key's last hold, so at the end of the step the call is released:
     it moves to `releasing` with the time, and the entry is Idle. If the server ignores the abort, the call
     reads as `ReleaseOverdue` once the bound passes, until it ends: in inspection and evidence, and as an issue
     of any incarnation that holds that key again. Its late answer is evidence only.
   - The write: the lane's own cell (`Cancelling`), unchanged. An answer for a head on the wire is still owed.
5. **Reload with the answer unheard.** The page reloads while `confirm` is on the wire. The saved head comes back
   `Held` with one unknown, reason `Restored` (`Records`). The first turn after the start hears it as `PayUnsure`;
   `UNSURE`'s timer arms on entry and the lookups run again. The entry itself was not saved, so it starts missing.
   `O.pay.retry` re-sends the same Attempt, with the same key.
6. **Dispose with a failing release.** The page closes; `dispose()` ends every life, so every slot leaves and each
   running read is released. One lookup's adapter fails in its `Effect.onInterrupt`: its Owner hears that Cause,
   as today. Another call ignores the abort. `failureOf` gives `dispose()` one `FlowError`: diagnostics
   `CleanupFailed` at the first call, then `ReleaseOverdue` at the other; its `cause` holds the first one's whole
   Cause. Nothing is squashed, and nothing is counted from a Cause.

## 2. Required properties, in user terms

- **P1.** Flow never sends two different writes under one idempotency key, in this Runtime or a later one (R1).
- **P2.** Every answer to an Attempt is heard exactly once, as success, a failure tag, not sent or unknown. A
  timeout is never a definite failure. An unknown may be followed by the real answer, never the reverse, and an
  unknown not yet heard is dropped when the real answer arrives first (R2).
- **P3.** Equal contract and input share one request on the wire (R3).
- **P4.** A read's success never carries data Flow knew to be stale when it delivered it, and written data is
  never replaced by an answer asked before the write (R4).
- **P5.** Every lookup a live machine waits on ends exactly once, a freeze included: no loading state is stuck by
  Flow. A machine that has ended hears nothing (R5).
- **P6.** An issue is shown exactly while its cause exists. Two keys of one operation never share or erase one (R6).
- **P7.** The snapshot published after an ending's turn already shows what that turn did to its row (R7).
- **P8.** A call that was told to stop and has not can be seen until it ends (inspection, evidence, and the issues
  of whoever holds its key), and it never delays a turn (R8).
- **P9.** `dispose()` and `runPromise` reject with one `FlowError` that names every failure, the primary one
  first, and keeps every Cause. An interruption stays an interruption (R9).
- **P10.** No public call throws anything but a `FlowError`, and a copy of a value is never taken for one Flow
  made (R10).
- **P11.** A throw in a user callback changes only its own check: a mapper's throw refuses its own row's turn, a
  reset selection's throw is that slot's issue (R11).
- **P12.** After a reload, saved read data is shown as stale and never served as fresh; data older than `gcTime`
  starts missing (R12).

## 3. Problem classes

The Spec's `model` lists each family with its outcome. A family is **removed** only where a type or signature
cannot express a member. Members, with the cluster's own names for them:

| Family                                       | Members                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A. An answer for something that moved on     | a settle after a clear; a settle after a collect; a settle after disposal; W5; a superseded lookup          |
| B. A fact stored beside what determines it   | the `overdue` flag; the collect timer id; `waiting.after` and `Trigger`; `landedAt`; a read's `concurrency` |
| C. Two writers of one publication            | publish inside `tryOne`                                                                                     |
| D. One fact, several names or lists          | five names for a store refusal; five code lists; two classification rules                                   |
| E. A failure crossing cleanup                | squashed Causes; `CleanupOverdue`; the count in a summary string                                            |
| F. A check apart from the use; trust by mark | a lookup's input; a call's value; the `trusted` cast in `contract.ts`                                       |
| G. Scans for per-step questions              | `interruptReads`, `retire`; owed rows rewritten per row                                                     |
| H. Ids and positions across boots            | Attempt ids; restored data                                                                                  |
| I. A throw in a user callback                | a mapper; `resetOn` under `Begin`; a `lookup` or `commit` that throws synchronously; a placement's select   |

## 4. Principle ledger

The Spec's `realization` holds the one-line ledger. Two rows carry a trade the build must keep visible:

- **Cheap operations: traded.** Invalidate by a partial key is O(entries of the contract), and `issuesOf` reads every
  row per publish; a prefix index and a memo land with a bench row.
- **Every Cause kept: traded.** `Cause.combine` drops equal causes; the diagnostic keeps one of each, so the count is
  never read from a Cause.

Held by cutting: `Trigger`, `landedAt`, `waiting.after`, the trailing input and the release table's states.

## 5. Fit to today's code

Paths under `packages/flow-state-v3/`. The code audit agrees on `IssueSource.Creation`, the marks to `Made` and
`CleanupOverdue`. The lane table and the ledger's other functions are kept; three ledger functions change. Rows
outside this area (the edge flags, `Quarantine`, the four `settle`s) are not decided here.

| Code                                                               | Verdict | What and who calls it                                                                                   |
| ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| `core/cells.ts`, `core/lane-moves.ts`                              | keep    | I20. `Answer` and `owedOrRecorded` pass the head's `input` to `ledger.owe`                              |
| `core/lanes.ts#commit`, `#settle`, `#answer`, `#everyLane`         | keep    | callers `serve.ts:123`, `answers.ts:74, 79`, `disposal.ts:70, 103`; a lane's `At` names its subject     |
| `core/lanes.ts#viewOf`                                             | keep    | the one reader of a lane for a guard, a member and `O.x.get`; found by subject, operation, key text     |
| `core/lanes.ts#lookup`, `#interruptReads`, cancel's Read arm       | delete  | `entries.ts`; callers: the turn's members (`lookup`, `cancel`)                                          |
| `core/answers.ts#settled`                                          | change  | the dispatch; `#settledRead` deleted; `#classify` kept; caller `step.ts:148`                            |
| `core/ledger.ts#owe`                                               | change  | `input`; one unknown per Attempt; nine call sites (`lanes.ts`, `lane-moves.ts`, `answers.ts`, `start`)  |
| `core/ledger.ts#tryOne`, `#afterTry`, `#refused`                   | change  | split into `tried` and `afterTry(row, heard)`; the caller moves from `serve.ts:444` to the applier's C4 |
| `core/ledger.ts#start`                                             | change  | `Origin.HeldAtStart` goes (`:68, 140, 378`); rows written once per pass; caller `incarnations.ts:201`   |
| `core/ledger.ts#live`, `#close`, `#wait`, `#suspend`, `#letGoKept` | keep    | callers `disposal.ts:68`, `incarnations.ts:318, 335`, `lanes.ts:208, 257`; a read slot calls `letGo`    |
| `core/serve.ts#serveEnding`, `#endingSource` (`:71, 411`)          | change  | the mapper's context; returns a change; no publish; `endingSource` builds `IssueSource.Ending`          |
| `core/world.ts` `Read`, `reads`, `IssueSource`                     | change  | `entries`, `slots`, `placements`, `releasing`; the source union of the Spec's types                     |
| `core/incarnations.ts:301-302` (`retire`'s loop), `:42` `CREATION` | delete  | `entries.end(life)` from the applier's `End`; creation's refusal is `Schedules`'                        |
| `core/disposal.ts:85`                                              | delete  | `entries.runtimeEnds()`                                                                                 |
| `core/life.ts`, `core/frozen.ts`, `core/same.ts`                   | keep    | no change; key text uses `selectionCodec`, not `sameValue` (callers not swept)                          |
| `core/defect.ts`                                                   | change  | raises `InvariantViolation`                                                                             |
| `core/boundary.ts#admitted` (528-541)                              | rewrite | `intake`'s lift; `walkerOf` kept for the decode                                                         |
| `contract.ts#Ending`, `#resource`, `#trusted`                      | change  | `MapperContext`; no `concurrency` on a read; `key` is the input; `output`; the cast goes                |
| `compiled-parts.ts:74` (`concurrency: bound.concurrency`)          | change  | a write's only                                                                                          |
| `handles.ts#readHandle`                                            | change  | gains `refetch`; `#erase` kept                                                                          |
| `operation-checks.ts`                                              | keep    | plus a read's key covering its input, until the type says it                                            |
| `error.ts`                                                         | change  | `CATALOG`, one `classify`, `code` a getter                                                              |
| `entry.ts`, `construction.ts#isMarker`, `machine.ts:273`           | change  | `door`, `made`, `madeOf`; marks go                                                                      |
| `host/driver.ts#call`, `#resultOf`, `Lookup`                       | change  | a lookup forks under `work`; `Died` keeps its Cause; a write's timeout is Unknown; `output` decode      |
| `host/close.ts`                                                    | change  | `failureOf`; `cleanupFailed` (93-104), `CleanupOverdue` and the count deleted; `unsettledOf` kept       |
| `host/run-promise.ts#runFailed`                                    | change  | `failureOf` with `primary` `RunFailed`                                                                  |
| `host/owners/owners.ts#judge`, `#waitAtMost`                       | keep    | the one classifier; callers `owners.ts:212`, `close.ts:239, 251`, `failureOf`                           |
| `host/owners/schedule-steps.ts:27`                                 | change  | returns the Exit; no `Cause.squash`                                                                     |
| `host/edge.ts`                                                     | keep    | the store's edge; no read state                                                                         |
| `host/print.ts#shown`                                              | change  | a throwing `toJSON` is caught (`print.ts:46`)                                                           |
| `host/snapshot.ts#issueOf`, `DIAGNOSTIC_OF` (`:140, 150, 154`)     | change  | read `issuesOf` and `CATALOG`                                                                           |

Tests that pin a changed behaviour, beyond those the Spec names: `close.test.ts:192-204` (the codes of a dispose
with a forget); `cleanups.test.ts:435-491` (a defect plus a cleanup failure); `rules/commits.ts:146-155` (a replaced
lookup's evidence). T99's rules (unbound lanes, consumers before providers, `RuntimeDisposed`) are untouched.

## 6. Seams with other Specs

The Spec's `composition` is the list. Notes that do not fit there:

- `Schedules`: key text is its `selectionCodec`, so a read's key and a slot's equality use one codec.
- `Changes`: the three applier cells (C2 writes no outcome for a refused ending; C4 calls `afterTry` for an ending's
  `Turn`, `Refused` and `Unturned`) are accepted. The turn walk's `Freeze` text says "its life-held calls are
  interrupted"; this Spec adds that a read's request runs on while any hold remains.
- `Records`: its `HeadShape.unknown` encodes one row; `admit` derives the `Restored` unknown, so `Origin.HeldAtStart`
  goes. `Records` owns the format step that renames `StorageRefused`.
- `Types`: the mapper's inference, the `resource` key rule and the excluded `TimeoutError` are stated here and proven
  there; the one `MapperContext<I, K>` definition is `Types`'.
- `Host`: the alarm heap is one; this module's two kinds are `Collect` and `Release`.
- Tasks: @task.V3.T21's acceptance still says `{ value, input, key, attempt }`; the decision is
  `(value, { input, key })`.

Where each hole of the older designs is answered, for a reader of the code history: the stale answer after a clear
and after a disposal (Spec, algorithm, "Dispatch" and "Entry table"); the overdue flag (Releases); the two writers of
one publication (Rows, "Row before publish"); a restored position (Entry store); the dropped `Trigger` (open Q2);
the failure across cleanup (`failureOf`); the codes (Catalog); the saved text (the rename table); the key text
(`Schedules`).

## 7. Questions

**Answered (agent correctness calls; the Spec follows each).**

| Question                                                                    | Answer                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One position: a result that went behind never lands                         | A; "behind" is derived, so a written value never loses to a late answer                                                                                                                               |
| `ReleaseOverdue` is an issue only for incarnations that hold the call's key | A; a released call nobody holds shows in inspection, evidence and `dispose()`                                                                                                                         |
| An invalid lookup input ends the read as `Defect`; evidence `InvalidInput`  | A                                                                                                                                                                                                     |
| Issues as views, with the source `Ending { operation, key, attempt }`       | A                                                                                                                                                                                                     |
| `Flow.private` is saved in clear text                                       | A; `private` means "not in outside snapshots"; a value that must not be stored comes from host context. Alternatives: never saved (sign-in loses its session on reload); a per-field `persist: false` |
| Three cells of the applier change                                           | A; accepted into `Changes`                                                                                                                                                                            |
| An unknown is replaced by a final answer                                    | A, once; trace without: Pay hears `PayUnsure` after the truth is known, re-enters `UNSURE` and polls for an answer it is about to get                                                                 |
| Written data is fresh and answers waiters                                   | A; alternative: written data is stale and every `setData` is followed by a request                                                                                                                    |
| A read whose mapper throws                                                  | A: one rule for every row; the row is refused, tried once more and Kept with its issue (the Spec's ThrowingRead). B (replace it by a `Defect` row) makes a mapper bug look like a `lookup` bug        |
| `gcTime: 0` removes the entry in the step its last hold leaves              | A; a step is the next turn boundary                                                                                                                                                                   |

**Already decided by the user.** Mapper shape `(value, { input, key })` (2026-11-20); the brand `Symbol.for(
"flow-state/Made")` plus the owner compare (2026-11-21); retries inside a contract function are immediate only, a
delayed retry is a machine schedule (2026-11-21); `InvariantViolation` (2026-11-19).

**Answered by the user 2026-11-22** (the Spec's open Q1 to Q8; Q6 was answered earlier). Each, with the trace that
makes it a decision; all as recommended (A):

1. **A read's key is its whole input** (Q1). [decided: user 2026-11-22] Why: equal keys with different inputs would
   race. Reverse: B.

   ```ts
   // before (existing): resource({ input: { account, currency }, key: ["account"], ... })   // compiles
   // after: a type error on `key`: it omits `currency`
   ```

   - A: for a `resource`, `key` orders the input's fields for partial-key matching and must name every field.
     Trace B: two lookups with `{ account, currency }` and key `["account"]` share one entry; the second gets the
     first currency's answer as a success.
   - B: keep a partial key and store the input on the entry; equal keys with different inputs then race.
2. **No `Trigger` cue** (Q2). [decided: user 2026-11-22] Departs from @plan.Operations.O2 ("focus regained and
   connection restored refetch"). Why: a schedule does it. Reverse: B. A: a request starts by itself only at a
   placement, an invalidate and a clear; a refetch on focus or an interval is a schedule that runs `O.x.refetch()`, as
   Pay's `UNSURE` does.

   ```ts
   // today: resource({ id, input, key, services, staleTime, gcTime, lookup })   // no refetch trigger exists
   // after: schedules: { refresh: { schedule: "1 minute", send: E.Refresh } }
   //        on: { Refresh: { actions: [O.x.refetch()] } }
   ```

   Alternative: a host occasion (focus, online) as a new input and a new row.
3. **A life's end and a disposal owe waiters nothing** (Q3). [decided: user 2026-11-22] Departs from the Plan's
   "the Interrupted ending a freeze or an actor's end parks". Why: a gone life's rows close at once as evidence.
   Reverse: B.

   ```ts
   // before: dispose(actor) queues an Interrupted row per waiting lookup, closed at once as evidence
   // after:  dispose(actor) releases the slots; no row. A freeze still parks one Interrupted row per lookup
   ```

   Trace A: each waiter gets an `Interrupted` row that closes at once as evidence, since its life is gone. Trace B:
   the slots leave and the calls are released.
4. **`failureOf` gives one `FlowError` per crossing** (Q4). [decided: user 2026-11-22] Why: the defect stays in
   `cause`. Reverse: B keeps the `Die`. Today (`close.ts:282-296`) a defect plus a
   cleanup failure is a `Die` holding the error.

   ```ts
   // before: a defect plus a cleanup failure is a Die holding the error
   // after:  FlowError { code, cause: the defect }, and one CleanupFailed diagnostic per cleanup
   ```
5. **A write's timeout is unknown and a type error** (Q5). [decided: user 2026-11-22] For a read the tag
   `TimeoutError` stays in `E`. Why: an unknown must not look like a typed error. Reverse: allow `Effect.timeout`.

   ```ts
   // allowed today: commit: (i) => api.pay(i).pipe(Effect.timeout("30 seconds"))    // no fixture writes this
   // after:  that line is a type error; the fixtures' form stays (transfers/operations/writes.ts:17-20):
   //         Effect.timeoutOrElse({ duration: "30 seconds", orElse: () => Outcome.unknown(...) })
   ```
6. **A made value's internals sit under a second registered symbol** (Q6). Answered by R10's user decision.

   ```ts
   // decided: Symbol.for("flow-state/Made") on a shared prototype, plus the owner compare
   // after: the same brand; NEW: value[Symbol.for("flow-state/Internals")] holds the internals, off the public
   //        face, in place of a WeakMap beside the brand, so a second loaded copy of Flow reads them too
   ```
7. **A persisted write declares its `output` and error Schemas** (Q7). [decided: user 2026-11-22] Required when the
   app persists. Why: a success must not reload as "unsure". Reverse: B keeps the fallback.

   ```ts
   // today: transaction({ id, input, key, concurrency, services, commit })   // an unsaveable ending reloads as unknown
   // after: transaction({ id, input, key, concurrency, services, commit, output, error })   // NEW: output, error
   ```

   Today an ending that cannot be saved becomes unknown `Restored` (`record.ts:107`): a success turns into "unsure"
   on reload. B keeps the fallback.
8. **The rename of saved text and the constructors** (Q8). [decided: user 2026-11-22] The rename is one step of
   `Records`' format plan. Why: one format step. Reverse: keep `StorageRefused`.

Costs of the proposals (for 3 and 15): with one position, one answer is thrown away when an invalidate arrives
mid-flight and nobody waits, and invalidations that never pause for one round trip starve the waiters. The
alternative, two positions, lands stale data that views can show.

## 8. Open holes

Each now has a home:

1. **The models are narrower than the text.** A build-time choice in @task.V3.T122's description (re-run the step
   model; the Clear-from-`again` waste).
2. **The types were not compiled.** Built and pinned with @task.V3.T121 and @task.V3.T122; `Types` owns the proof.
3. **Not every source was read in full.** The four T21 Tasks are @task.V3.T121 to @task.V3.T124; the uncovered Plan
   sentences are in @task.V3.T122's and @task.V3.T123's build-time choices.
4. **Placements.** A build-time choice in @task.V3.T123's description (Q12).
5. **Hydrate against restore.** Answered in `Records` (Q13).
6. **`CleanupFailed` as a lasting issue.** Decided: not an issue (Q14; the catalog row).
7. **`persist: true` with `gcTime: 0`.** A build-time choice in @task.V3.T124's description (Q15).
8. **The door table.** A build-time choice in @task.V3.T131's description (Q16); internals are answered (Q6).
9. **Starvation under endless invalidation.** Decided: no bound until a bench or Story shows one (Q17).
10. **An entry's `last` shown to a late slot.** Decided: kept until a fixture needs it per slot (Q18).
11. **The public event for `refetch`.** `Host` owns it (its Q6).
12. **The lane policy table.** Written from `core/lanes.ts` by the operation-endings Task's Spec (Q20); the alarm
    kind order is `Changes`' (its Q9).
13. **Not checked:** context propagation and a line-by-line pass of the entry table against the model; the reads model
    of the Spec's T1 is that pass, run by @task.V3.T122.

## 9. Process notes

- **What went wrong before.** Reads were built as "one call per incarnation" beside the lane, and each review added
  a field (the slot's position, the overdue flag, the collect timer) to answer one sequence. The table was never run;
  an adversary broke four of this design's own first cells in five minutes, and a model found three disagreements
  between a table and its pseudo-code. The errors design listed names without asking which state each names, so three
  names survived for one fact.
- **Order of work.** The row first (`input`, `refusal`, the three applier cells): it is small and red today on Story
  1. Then `CATALOG`, mechanical and type-driven. Then entries, model first: port the scratch model's generator into
  `tests/generated` before `entries.ts` exists. `failureOf` any time after the catalog, from its exhaustive table.
  Doors before `derive.ts`.
- **First failing checks.** Stories 1, 2 and 6; the four inverted restore tests of the one-unknown rule.
- **Where a review pays.** One on the entry table against the generator's oracles, before code. One on the hostile
  table for doors. None per field.
- **Fixtures.** No fixture shares an entry in time (`staleTime: 0` everywhere), and no Story has a read that ignores
  an abort: the catalog's step 4 fixtures come before the entries Task, or its table is tested by the generator
  alone.
- **A retry guard.** `O.x.idle` and `O.x.retryable` exist in the code and were reached by no design; five fixtures use
  them. The Spec's R15 gives them one view.
- **The scratch models.** They lived in a session scratchpad, not in the repository. The models that guard this
  Spec belong in the package's tests before the code is written.
