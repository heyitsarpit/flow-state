---
proposal algo-operations
status proposed 2026-11-21
description Proposes reads as three small states, issues as views over owner state, and one door for everything public.
---
# Reads and operations, errors and construction trust: the core algorithm (2026-11-21)

**Bottom line:** a read is three small states (entry, slot, releasing call) with one dispatch for a settled call,
one position per entry and no stored timer, flag or waiter position; an ending's refusal lives on its row and the
row moves before the publish; every issue is a view over its owner's state through one catalog; a failure that
crosses cleanup is one total function over Exits; and everything public goes through one door. The write lane's
table (`core/cells.ts`) is not changed.

Everything here is **proposed**. Cluster 4 of @proposal.algorithm-round. It designs past
@proposal.spec-reads-operations (RO) and @proposal.spec-errors-trust (ET); each departure is a question in
section 14. Paths are under `packages/flow-state-v3/`. AS, AT and AR are @proposal.algo-schedules,
@proposal.algo-turn and @proposal.algo-records; R2 is @review.spec-cohesion-r2. This was the lead's only run;
section 17 lists what it left open.

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

// machines/pay.ts. CHANGED: the mapper's second argument (the user's decision, @proposal.spec-handover)
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
   later Runtime mints it again and the server never takes a new payment for a replay of an old one (6.5).
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
   `Held` with one unknown, reason `Restored` (AR 6.6). The first turn after the start hears it as `PayUnsure`;
   `UNSURE`'s timer arms on entry and the lookups run again. The entry itself was not saved, so it starts missing.
   `O.pay.retry` re-sends the same Attempt, with the same key.
6. **Dispose with a failing release.** The page closes; `dispose()` ends every life, so every slot leaves and each
   running read is released. One lookup's adapter fails in its `Effect.onInterrupt`: its Owner hears that Cause,
   as today. Another call ignores the abort. `failureOf` (6.8) gives `dispose()` one `FlowError`: diagnostics
   `CleanupFailed` at the first call, then `ReleaseOverdue` at the other; its `cause` holds the first one's whole
   Cause. Nothing is squashed, and nothing is counted from a Cause.

## 2. Required properties, in user terms

- **P1.** Flow never sends two different writes under one idempotency key, in this Runtime or a later one.
- **P2.** Every answer to an Attempt is heard exactly once, as success, a failure tag, not sent or unknown. A
  timeout is never a definite failure. An unknown may be followed by the real answer, never the reverse, and an
  unknown not yet heard is dropped when the real answer arrives first.
- **P3.** Equal contract and input share one request on the wire.
- **P4.** A read's success never carries data Flow knew to be stale when it delivered it, and written data is
  never replaced by an answer asked before the write.
- **P5.** Every lookup a live machine waits on ends exactly once, a freeze included: no loading state is stuck by
  Flow. A machine that has ended hears nothing.
- **P6.** An issue is shown exactly while its cause exists. Two keys of one operation never share or erase one.
- **P7.** The snapshot published after an ending's turn already shows what that turn did to its row.
- **P8.** A call that was told to stop and has not can be seen until it ends (inspection, evidence, and the
  issues of whoever holds its key), and it never delays a turn.
- **P9.** `dispose()` and `runPromise` reject with one `FlowError` that names every failure, the primary one
  first, and keeps every Cause. An interruption stays an interruption.
- **P10.** No public call throws anything but a `FlowError`, and a copy of a value is never taken for one Flow
  made.
- **P11.** A throw in a user callback changes only its own check: a mapper's throw refuses its own row's turn,
  a reset selection's throw is that slot's issue.
- **P12.** After a reload, saved read data is shown as stale and never served as fresh; data older than
  `gcTime` starts missing.

## 3. Problem classes

A family is **removed** only where a type or signature cannot express a member.

| Family                                       | Members                                                                                                                    | Outcome                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A. An answer for something that moved on     | RO-2 (settle after clear); settle after collect; RO-1 (disposal); W5; a superseded lookup; today's fall-through to lanes   | One point: the dispatch (6.1). The Settled cell takes a Running entry, so "Settled on Idle" has no cell |
| B. A fact stored beside what determines it   | RO-3 and M8 (`overdue` flag); the collect timer id; `waiting.after` and `Trigger` (RO-6); `landedAt`; a read's             | Removed: the fields do not exist (4.3). Overdue, collectable, current and fresh are functions           |
|                                              | `concurrency` (W7); issues by operation name (W1); `FlowError.code` (G11); `Origin.HeldAtStart`                            |                                                                                                         |
| C. Two writers of one publication            | RO-4 and W2 (publish inside `tryOne`)                                                                                      | One point: the applier's row C4 moves the row, row C6 publishes (6.5)                                   |
| D. One fact, several names or lists          | M8; G7 (five names for a store refusal); ET-2 (five code lists); two classification rules; `InvalidKey` and `InvalidInput` | Removed for codes: every union derives from `CATALOG` (6.7). Saved text: one rename table               |
| E. A failure crossing cleanup                | ET-1; G9 (squashed Causes); `CleanupOverdue`; the count in a summary string                                                | One point: `failureOf` (6.8)                                                                            |
| F. A check apart from the use; trust by mark | G1 to G5; T98a and T98b; W3 (lookup input); W8 (a call's value); the `trusted` cast in `contract.ts`                       | Removed where the body gets `Unread` or the taken copy (6.9); the door list itself is one point         |
| G. Scans for per-step questions              | @review.complexity-sweep F1: `interruptReads`, `retire`; F3: owed rows rewritten per row                                   | Removed: the maps are keyed by the question (section 10)                                                |
| H. Ids and positions across boots            | RO-5; Attempt ids (AR 14 f); restored data                                                                                 | Removed: `Option<Position>` on restored data; an Attempt id cannot be minted without the boot's seed    |
| I. A throw in a user callback                | a mapper; AT's H3 (`resetOn` under `Begin`); a `lookup` or `commit` that throws synchronously; a placement's select        | One point each, all read by the issue view (6.7)                                                        |

Debt, still one by one: the ending reasons Flow itself writes (`Restored`, `Defect`, `Interrupted`) are a
hand-written list in the catalog; the list of doors is found by the surface walk, not by a type; ET-4's `throw`
sites become values one by one (`driver.ts:396`, `schedule-steps.ts:27`), and the lint that keeps them out is
cluster 5's.

## 4. Model

### 4.1 State inventory

| State                     | Values                                       | Owner (only writer)                   | Readers                                | Saved                         |
| ------------------------- | -------------------------------------------- | ------------------------------------- | -------------------------------------- | ----------------------------- |
| Lane, displaced head      | today's (`world.ts:331-408`)                 | `cells.ts#table` through `lane-moves` | as today                               | as AR 6.6                     |
| Owed row                  | today's, plus `input` and `refusal`          | `ledger.ts`                           | `serveEnding`, the issue view, capture | `input` yes; `refusal` never  |
| Entry                     | 4.3; Idle or Running, current or behind      | `entries.ts#apply` (the entry table)  | slots, `entryView`, the issue view     | data and `at`, when `persist` |
| Read slot                 | absent, served, waiting                      | `entries.ts` (the slot rules)         | the entry table, the issue view        | never                         |
| Placement                 | RO 3.3, unchanged                            | `placements.ts#decide`                | the entry table (`placed`, holds)      | never                         |
| Releasing call            | present from the interrupt to the call's end | `entries.ts` (Release, the dispatch)  | the issue view, inspection             | never                         |
| A source's last outcome   | AT 4.1 `outcomes`                            | AT's `apply`, row C2                  | the issue view                         | never                         |
| Issues                    | none: derived                                | `issues-of.ts`, a pure read           | snapshot, inspection, rules            | never                         |
| Catalog                   | static                                       | `error.ts#CATALOG`                    | every code union                       | n/a                           |
| Public registry           | absent, a door, a made value of a kind       | `entry.ts` (write once)               | `madeOf`, the surface walk             | n/a                           |
| Trust of an outside value | `Unread`, taken, refused                     | `intake.ts#intake`                    | door bodies                            | n/a                           |

Positions and call ids are never saved. The clock is `tx.env.now`, the one clock of a step; every `at` and
`since` below is that value.

### 4.2 Callback inputs

| Callback                                      | Receives                                                               | A throw becomes                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `commit(input, { attempt })`                  | the taken input; the Attempt (`core/compiled.ts:322-329`)              | synchronous or a die: `CallResult.Defect`, an unknown ending                         |
| `lookup(input)`                               | the taken input, which is the entry's key (Q1)                         | `CallResult.Defect`: the read's `Defect` ending                                      |
| an ending mapper                              | `(value, { input, key })`: the row's value, the row's `input`, its key | the row's `Refusal { InvalidTurn, slot }`; the turn is refused, nothing else changes |
| a `Defect` or `Interrupted` mapper, `notSent` | `(undefined, { input, key })`; `notSent` gets `{ why }`                | as above                                                                             |
| a placement's `select`                        | AT's `readsOf(incarnation, scope, "committed")`                        | `Placement.select` is `Failed`, keeping the last key                                 |
| an input selector of a member                 | AT's `readsOf(..., "after")`                                           | AT's turn refusal, as today (`turn.ts:158`)                                          |
| a release (an Effect finalizer)               | Effect's own arguments                                                 | a failed cleanup: its Owner hears the Cause, which reaches `failureOf`               |

No callback of this cluster receives the clock, a position or an id other than `attempt.id`.

### 4.3 Types

```ts
// NEW: Position. The Runtime's one order; every `next` is larger than every earlier one; never saved (RO-5).
type Position = number & Brand.Brand<"Position">;

// existing (`core/tx.ts:188-191`): `att-<seed>-<n>`. The rule is new: the seed differs for every boot (6.5).
type AttemptId = string & Brand.Brand<"AttemptId">;

// NEW: one per (contract id, key text), per Runtime. world.entries: Map<contract, Map<keyText, Entry>>
type EntryId = { readonly contract: string; readonly keyText: string };   // a name, valid after its entry is removed
type Request = Data.TaggedEnum<{ Idle: {}; Running: { call: CallId; asked: Position } }>;
type Entry = {
  readonly key: Values;                      // the taken input: a read's key is its whole input (Q1)
  readonly data: Option.Option<{ value: unknown; at: number; asked: Option.Option<Position> }>;
  readonly staleAt: Position;                // the last Invalidate, Written or Clear
  readonly request: Request;
  readonly again: boolean;                   // one trailing request is wanted
  readonly last: Option.Option<ReadFailure>; // the last landed ending, when not a success
  readonly unheldSince: Option.Option<number>;
};

// NEW: one per (life, operation). world.slots: Map<ActivationId, Map<operation, ReadSlot>>
type ReadSlot = { readonly entry: EntryId; readonly owner: OwnedBy; readonly waiting: boolean };

// NEW: world.releasing: Map<CallId, Releasing>. A call the core told to stop and has not heard end.
type Releasing = { readonly entry: EntryId; readonly since: number };

// NEW on the row. `refusal` is written only by the ledger's `afterTry`.
type Refusal = { readonly code: RefusedCode; readonly slot: Option.Option<SlotName> };
type Owed = ExistingOwed & { readonly input: Values; readonly refusal: Option.Option<Refusal> };
type Heard = Data.TaggedEnum<{ Unmapped: {}; Heard: {}; Refused: { refusal: Refusal } }>;

// CHANGED: an issue's source names the state that holds its cause. Only the first three can be stored.
type StoredSource = Data.TaggedEnum<{
  Event: { tag: string; at: Address };
  Reaction: { slot: SlotName };
  Slot: { at: Address; slot: SlotName };     // a context slot, a prop, or an instance's reset selection (AT H3)
}>;
type IssueSource = StoredSource | Data.TaggedEnum<{
  Schedule: { name: string; key: Option.Option<string>; at: Address };       // AS
  Ending: { operation: string; key: string; attempt: Option.Option<AttemptId> };
  Entry: { operation: string; key: string };
  Placement: { path: string };
  Call: { operation: string; key: string };
  Record: { key: RecordKey };                                                 // AR
}>;

// NEW: what failureOf is fed. `cause` is whole; `at` is the owner path of the task that ended.
type Cleanup = { readonly at: Path; readonly cause: Cause.Cause<unknown> };
type Overdue = { readonly at: Path };
```

`SlotName` is the branded slot name AS asked for; an operation's own name keys a read slot and is not one.

Derived types, with their source:

| Public type                                                      | Derives from                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| a mapper's `value`                                               | the contract's `commit` or `lookup` return: `A`, `FailureOf<E, T>` (`contract.ts:84`) |
| a mapper's `{ input, key }`                                      | the contract's `input` fields and its `key` tuple: `{ input: I; key: Pick<I, K> }`    |
| `ReadFailure`, `NotSentWhy`, `IssueCode`, `ReportCode`, `Reason` | `CATALOG` and `ENDINGS` (6.7)                                                         |
| a read's `key`                                                   | its `input`: for a `resource`, `K` is every field of `I` (Q1)                         |
| a `transaction`'s `E`                                            | `commit`'s error, with `Cause.TimeoutError` excluded by a conditional type (Q9)       |

Casts and `unknown`s in the area:

| Where                                           | Today                                    | After                                                                              |
| ----------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `contract.ts:247` `trusted` (`input as A`)      | a read's input is "checked by type only" | removed: `intake` returns the typed copy, for a commit and a lookup alike          |
| `contract.ts:256` `trustedAttempt`              | restores `Attempt<I, K>` from `Compiled` | kept, justified: one of the erasures cluster 5 owns (@review.case-studies 3.3a)    |
| `contract.ts:60` `context: unknown`             | no mapper reads it                       | removed: `MapperContext<I, K>`                                                     |
| `contract.ts:70` `ErasedEnding = Ending<never>` | every `Ending<V>` assigns to it          | kept, justified: the one restore is `serveEnding`'s call of `from`                 |
| `handles.ts:30` `erase`                         | restores the callback's parameter        | kept, justified: cluster 5                                                         |
| `entry.ts:46` `wrapped as F`                    | the door's public type                   | kept, the one cast of a door (ET 3.3); the type comes from cluster 5's `derive.ts` |
| `Owed.value: unknown`, `Entry.data.value`       | a call's value                           | kept: decoded by the contract's `output` at the boundary when declared (W8)        |
| `Bound`'s defaults `R = unknown`, `I = Values`  | erased in `Compiled`                     | kept; `Bound<"read">` loses `concurrency` (W7; `compiled-parts.ts:74`)             |

## 5. Operations

```ts
// core/entries.ts (NEW). The only writer of entries, slots and releasing.
lookup(life, operation, input, owner): void       // takes the input, then the slot rule of 6.3
refetch(life, operation): void
cancelRead(life, operation): void
place(life, path, key): void;  unplace(life, path): void           // called by placements.ts#decide
freeze(life): void;  end(life): void                                // called from AT's row C4
invalidate(contract, partialKey): void;  written(contract, key, value): void;  clear(contract, partialKey): void
install(contract, key, data, at): void                              // a saved entry, from AR's install
collectDue(entry): void;  releaseDue(call): void                    // the two alarms
stepEnds(): void                                                    // judges "Last hold left" for touched entries
runtimeEnds(): void
settledRead(call, result): boolean                                  // the first two rows of the dispatch

// core/answers.ts (CHANGED): settled(call, result) is the dispatch of 6.1. No new `settle` is added (R2 M13).
// core/ledger.ts (CHANGED)
owe(ending, origin?): OwedId                      // one unknown per Attempt (6.5)
tried(actor, id): Option<Owed>                    // the row a mail reference may try; replaces tryOne's head
afterTry(row, heard: Heard): void                 // the row's move; called from AT's row C4, before C6
letGo(row): void                                  // closes a Kept row; a read slot's ask or cancel calls it

// core/issues-of.ts (one file, created by T118 per R2 M7)
issuesOf(world, compiled, incarnation, now): ReadonlyArray<Issue>

// src/host/failures.ts (NEW)
failureOf<A>(body: Exit<A, unknown>, cleanups: ReadonlyArray<Cleanup>, overdue: ReadonlyArray<Overdue>,
             primary: (cause: Cause<unknown>) => Finding): Exit<A, FlowError>

// src/entry.ts (CHANGED), internal: one door. ET's `capture` is a door whose argument schemas are all Unread.
door<F>(name: string, args: ReadonlyArray<Schema | typeof Unread>, run: (...taken) => unknown): F
made<K extends MadeKind, Face extends object>(kind: K, face: Face, internals: InternalsOf<K>): Face
madeOf<K extends MadeKind>(kind: K, owner): (value: unknown) => Result<InternalsOf<K>, Finding>
// src/intake.ts (NEW; ET's `admit`, renamed because `admit` has three meanings today, R2 M13): lift once, then
// decode the copy. Used for config, a lookup's and a commit's input, and a call's value.
intake<S>(schema: S, at: Path): (value: unknown) => Result<S["Type"], NonEmptyArray<Finding>>
```

## 6. Rules: the tables

Moves inside one cell run in the order written. Invariants hold at the end of every step.

### 6.1 The dispatch of a settled call

The host settles each call it started exactly once (`owners.ts:197` ends a task of a closing Owner as
`Interrupted`). `answers.ts#settled` routes it; this is the one place that decides who hears an answer.

| Where the call is                            | What happens                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ |
| in `releasing`                               | removed from it; its alarm is cleared; evidence `Released`         |
| an entry's `Running` request                 | that entry's Settled cell (6.2)                                    |
| a lane head on the wire, or a displaced head | the lane's rule, unchanged (`lanes.ts#settle`)                     |
| nowhere                                      | `defect`: the host settled a call the core never started, or twice |

- A call has one home from its start to its end. **Release** is the only move from an entry to `releasing`, and
  it makes the entry Idle in the same step, so a late answer cannot find an entry that is not waiting for it.
- A released call's answer is dropped; a Fail or Die its cleanup left is not. The call's Owner hears it through
  `judge` (`owners.ts:53`) and reports it as today (`Input.CleanupFailed`, the host's report), and from there it
  reaches `failureOf`.

### 6.2 The entry table

Derived, never stored:

- **current:** Running and `request.asked > staleAt`. **behind:** Running and not current.
- **fresh at `now`:** data is some, `data.asked` is some and `>= staleAt`, and `0 <= now - data.at < staleTime`.
- **holds:** the slots and placements that point at the entry, plus the data layer's holds.
- **placed:** a placement points at it. **waiters:** its slots with `waiting`.
- **collectable at `now`:** no hold, Idle, and `now - unheldSince >= gcTime`.

The moves:

- **Start:** mint a call and a position p; `request := Running { call, asked: p }`; `Command.Lookup` with the
  entry's key as input. The host forks it under the Runtime's Owner, since a request belongs to an entry.
- **Serve:** owe the asking slot a success with the data; no request.
- **Owe:** one row to a waiter's life, with the entry's key as `input`; its `waiting` becomes false.
- **Release:** `releasing[call] := { entry, since: now }`; `Command.Interrupt`; an alarm at `now + bound`;
  `request := Idle`.
- **Remove:** the entry is deleted. Its `EntryId` still names it in `releasing`.

An asker is a slot, which waits, or nobody (a placement being placed; the data layer's `Refresh`).

| Cue                | Idle                                                       | Running, current                                                 | Running, behind                                       |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Ask Lookup         | fresh: Serve the slot. Else Start; the slot waits          | the slot waits                                                   | `again := true`; the slot waits                       |
| Ask Refetch        | Start; the slot waits                                      | the slot waits                                                   | `again := true`; the slot waits                       |
| Invalidate         | `staleAt := next`; if placed: Start                        | `staleAt := next`; if a waiter exists or placed: `again := true` | the same                                              |
| Written(value)     | `p := next`; data is `{ value, at: now, asked: p }`;       | the same; then Owe every waiter a success with `value`           | the same                                              |
|                    | `staleAt := p`; `last := none`; `again := false`           |                                                                  |                                                       |
| Clear              | data and `last` none; `staleAt := next`; if placed: Start  | `w :=` a waiter exists, placed or `again`; the same data         | the same                                              |
|                    |                                                            | changes; Release; if `w`: Start, `again := false`                |                                                       |
| Settled(result)    | no cell (6.1)                                              | a success lands: data is `{ value, at: now, asked }`, `last`     | nothing lands, nobody is owed: evidence `Superseded`. |
|                    |                                                            | none; any other result sets `last`. Owe every waiter the         | If `again`: Start, `again := false`. Else Idle        |
|                    |                                                            | result. Idle                                                     |                                                       |
| Last hold left     | `unheldSince := now`; `gcTime` 0: Remove; else an alarm at | Release; `again := false`; then as Idle                          | the same                                              |
|                    | `now + gcTime`                                             |                                                                  |                                                       |
| First hold arrives | `unheldSince := none`; the alarm is cleared                | not reachable (I3)                                               | not reachable (I3)                                    |
| Collect due        | collectable: Remove. Else nothing                          | nothing                                                          | nothing                                               |
| Install(data, at)  | nothing: the entry in memory is newer (6.10)               | nothing                                                          | nothing                                               |
| Runtime ends       | Remove                                                     | Release; Remove                                                  | the same                                              |

- A request that went behind never lands and serves nobody: what a waiter is owed comes from a request that was
  current when it settled, from a Written value, or from fresh data. This is P4 with one position.
- Written answers everyone: the written data is fresh, so a waiter gets it as a lookup of a fresh entry would.
- An automatic start exists in three cells only (Invalidate, Clear and a placement's Ask). No cell starts a
  request because the last one failed, so a failing server is never called in a loop.
- **Last hold left is judged at the end of the step** that removed the hold (@plan.Operations.O1: "at the next
  turn boundary after the last hold ends"). A hold that leaves and returns inside one step changes nothing: an
  actor that ends while another starts on the same key in that step hands the running call over.
- **Runtime ends** runs after `End` for every life, so no slot is left to point at a removed entry, and it owes
  nothing: a row owed to a life that is gone closes as evidence (`ledger.ts:267`), so RO's "Owe all Interrupted"
  could reach nobody (RO-1).

### 6.3 Slots

A slot has one wait. Any Ask through a slot that is already waiting keeps that one wait; the older ask is
evidence `Superseded` and is never owed (R7). An ask or a cancel through a slot first lets go a Kept row of that
slot (`ledger.letGo`), as a cancel does for a write's key, so a read's refused row has an exit.

| Cue                               | No slot                                                      | Slot on this entry             | Slot on another entry                                         |
| --------------------------------- | ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------- |
| lookup, input refused by `intake` | one `Defect` row, evidence `InvalidInput`; nothing else      | the same; the slot is kept     | the same; the slot is kept                                    |
| lookup(input)                     | the entry is created if absent; the slot points at it (First | Ask Lookup                     | the old wait ends as `Superseded`; the slot leaves that entry |
|                                   | hold arrives if it was unheld); Ask Lookup                   |                                | (its hold is judged at the step's end); then as "No slot"     |
| refetch                           | nothing; evidence only                                       | Ask Refetch                    | n/a: refetch names the slot's own entry                       |
| cancel                            | nothing                                                      | the slot is dropped, no row    | n/a                                                           |
| Freeze of its life                | nothing                                                      | waiting: `waiting := false`,   | n/a                                                           |
|                                   |                                                              | one `Interrupted` row, which   |                                                               |
|                                   |                                                              | waits (AT 6.5). The hold stays |                                                               |
| End of its life                   | nothing                                                      | dropped, no row                | n/a                                                           |

- A placement is the same with no wait: `place` is "the entry is created if absent, First hold arrives, Ask
  Lookup by nobody", and `unplace` drops the hold. RO 3.3's placement table is unchanged and calls these: it
  unplaces at an exit, a freeze and a life's end, and places at an entry and a thaw.
- An entry is always created by its first hold, so it is born held.
- At a life's `End` its queued and waiting rows close as evidence (AT 6.5, the ledger); no new row is owed.

### 6.4 Releases, and one name for overdue

`overdue(call, now)` is: `releasing` has the call and `now - since >= bound` (`RuntimeDefaults.disposalBound`).
Nothing stores it. The alarm at `since + bound` fires once and writes no state of this cluster: it records
evidence `ReleaseOverdue` and raises one publish for the incarnations that hold the call's key.

| Cue           | Not in `releasing` | In `releasing`                              |
| ------------- | ------------------ | ------------------------------------------- |
| Release       | added, with `now`  | not reachable: Release reads a Running call |
| the call ends | 6.1's other rows   | removed; the alarm is cleared               |
| the alarm     | nothing            | evidence once; one publish                  |

Who sees it: inspection lists every releasing call with its age; evidence has the one line; an incarnation shows
one issue per key it holds that has an overdue call, however many such calls there are, under
`Call { operation, key }` with its own slot's operation. A released call whose key nobody holds is in no
snapshot (Q5).

One fact, one name (M8):

| Fact                                                | Name             | Where it shows                                                                 |
| --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| a call told to stop is still running past the bound | `ReleaseOverdue` | inspection; evidence; an issue for holders of its key; `failureOf`'s `overdue` |
| a release that ended in failure                     | `CleanupFailed`  | evidence when found; `failureOf`'s `cleanups`                                  |
| the Runtime's own close still running at its bound  | `ReleaseOverdue` | `failureOf`'s `overdue` list, at the path of the Owner still closing           |

`CleanupOverdue` (`close.ts:181`) is deleted; `cleanups.test.ts:313-334, 368` and `close.test.ts:206-227` pin
it and change. A cleanup that fails after `dispose()` already listed it overdue goes to the host's report, as
today. A write's `Cancelling` head is not in `releasing`: the lane row is the write's own signal (RO 8.6).

### 6.5 Rows: the refusal, one unknown, and the Attempt id

The refusal is on the row. Only `afterTry` writes it:

| Row's delivery \ the try | Heard                                                | Unmapped         | Refused { refusal }                       |
| ------------------------ | ---------------------------------------------------- | ---------------- | ----------------------------------------- |
| Queued                   | closed Delivered                                     | closed, evidence | Retrying, `refusal` set, queued once more |
| Retrying                 | closed Delivered                                     | closed, evidence | Kept, `refusal` set                       |
| Waiting, Kept            | not tried: `tried` returns none (not in the mailbox) | the same         | the same                                  |

Other writers leave `refusal` as it is: a start adopts a Kept row to Retrying for its one try; a suspend makes it
Waiting; letting go closes it. A restored row has none until its try in this process. A closed row is gone, and
its issue with it.

**One unknown per Attempt** (AR 14 b to d), at one point, `ledger.owe`:

| Owed for Attempt a           | No unheard unknown row for a | An unheard unknown row for a exists                              |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| unknown                      | the row is added             | nothing is added: the slot holds one                             |
| success, failure or not sent | the row is added             | that unknown row closes as evidence `Replaced`; the row is added |

- An unknown after a final answer is not reachable: a final answer removes the head (AR 6.6's second table), and
  only a head on the wire or held is answered.
- The head stays `Held` and the row is its unknown, so AR's `HeadShape.unknown` encodes one row and is not a
  projection. `Origin.HeldAtStart` (`ledger.ts:140`) and its once-guard go: AR's own `admit` derives the
  `Restored` unknown. Four inverted tests wait on this (`restore.test.ts:86, 98`, `cells/structure.test.ts:25`,
  `transfers/bank-app.test.ts:79`).

**The Attempt id** stays `att-<seed>-<n>`. The rule, which is the host's: `Host.sessionSeed` is fresh for every
boot (`host.ts:25`; at least 128 random bits in a browser, the tab's name and open count in a Story,
`testing/run.ts:132`). A restored Attempt keeps its saved id. What AR 14 f still owes is @task.V3.T28's: two tabs
of one store.

**Row before publish.** An ending's turn is computed first and applied as one of AT's changes; the applier's
row C4 calls `afterTry` and row C6 publishes (AT 6.6). `serveEnding` publishes nothing itself.

| AT's change, with an ending | Row C2 (`outcomes`)    | Row C4 (the ledger)                  |
| --------------------------- | ---------------------- | ------------------------------------ |
| `Turn`, trigger an ending   | as AT                  | `afterTry(row, Heard)`               |
| `Refused`, `ending` some    | **nothing is written** | `afterTry(row, Refused { refusal })` |
| `Unturned`                  | none                   | `afterTry(row, Unmapped)`            |

This asks AT's table for three changed cells (Q13).

**Timeout.** `resultOf` maps a failure whose error is a `Cause.TimeoutError` (`Cause.isTimeoutError`) to
`CallResult.Unknown` for a write. For a read it is an ordinary failure tag.

**Taken from RO 3.6 unchanged:** `Bound<"read">` without `concurrency`; a Compiled operation lists its services,
and the boot fails `MissingService`, naming operation and service, when the Runtime's Context lacks one.

### 6.6 Occasions that do not compare

| Occasion          | Skips                                                     | Which later occasion sees it                               |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Restore (a boot)  | no entry, slot or releasing call exists; a saved entry is | the first Ask: not fresh, so it starts a request           |
|                   | installed with `asked: none`                              |                                                            |
| Adoption          | a saved entry whose key is already in memory is ignored   | none needed: memory is newer                               |
| Time passing      | nothing is written when data ages past `staleTime`        | the next Ask or `entryView` reads `fresh` at its own `now` |
| The release alarm | writes no state                                           | the publish it raises derives `ReleaseOverdue`             |
| Freeze            | a frozen life's slots keep their holds; no key is re-read | Thaw queues the rows that waited; the machine asks again   |
| Thaw, wake        | no slot is re-asked                                       | the turn that hears the row                                |

### 6.7 The issue view and the one catalog

`issuesOf` is a concatenation; each part reads one owner's state and nothing else.

| Issue                                           | Source      | Read from                                              | Gone when                                |
| ----------------------------------------------- | ----------- | ------------------------------------------------------ | ---------------------------------------- |
| a refused event turn                            | `Event`     | AT's `outcomes`                                        | that source's next clean turn            |
| a failed reaction                               | `Reaction`  | AT's `outcomes`                                        | its next clean run                       |
| a slot's read threw (context, prop, `resetOn`)  | `Slot`      | AT's `outcomes`                                        | its next clean read                      |
| a schedule's refusal or failed read             | `Schedule`  | AS's `Scheduled`                                       | AS                                       |
| a refused ending                                | `Ending`    | `Owed.refusal` of the actor's rows                     | the row closes                           |
| a read's `Defect`, or a failure with no mapping | `Entry`     | `Entry.last`, for a slot of this incarnation           | the next landed success; a Clear; the    |
|                                                 |             |                                                        | slot leaves                              |
| a placement's select failed, `SelectedNoKey`    | `Placement` | `Placement.select`                                     | its next clean run; the placement leaves |
| `ReleaseOverdue`                                | `Call`      | `releasing` and `now`, for keys this incarnation holds | the key's last overdue call ends         |
| `RecordUndecodable`, `StorageFailure`           | `Record`    | `world.quarantined`, `world.withheld` (as today)       | AR                                       |

- **AT's H3:** a `resetOn` that throws under `Begin` is `outcomes[Slot { at, slot: "resetOn" }]`; the slot keeps
  its last value. `IssueSource.Creation` (`incarnations.ts:42`) and `IssueSource.Operation` are deleted.
- `StoredSource` cannot hold `Ending`, `Schedule`, `Entry`, `Placement`, `Call` or `Record`: a stored copy of a
  derived issue does not type-check.
- An entry's state is shared by its holders, as its data is: a slot that joins a key whose last answer failed
  shows that failure until a success lands (section 17, H10).
- The view takes `now` for one row only. No row of AT's applier compares issue lists, so X-6 has no case.

One catalog, in `error.ts`; every other list is a derived type:

```ts
// NEW: class and surfaces per code.   existing: the codes.   dropped: DIAGNOSTIC_OF, snapshot.ts#issueOf's rule
const CATALOG = {
  Defect:             { class: "Defect",  issue: true,  report: false, reasons: [] },
  InvalidTurn:        { class: "Failure", issue: true,  report: false, reasons: [] },
  GuardDefect:        { class: "Defect",  issue: true,  report: false, reasons: [] },
  StorageFailure:     { class: "Failure", issue: true,  report: true,
                        reasons: ["quota", "closed", "aborted", "failed", "silent"] },
  CleanupFailed:      { class: "ByCause", issue: false, report: true,  reasons: [] },
  ReleaseOverdue:     { class: "Failure", issue: true,  report: true,  reasons: [] },    // NEW
  RecordUndecodable:  { class: "Failure", issue: true,  report: true,  reasons: [/* AR's Reason tags */] },
  InvariantViolation: { class: "Defect",  issue: false, report: false, reasons: [] },    // NEW (the user, 2026-11-19)
  // ... one row per code of today's `Code`; AT's list repair (BC-5) is one more row with `report: true`
} as const;
type Code = keyof typeof CATALOG;
type IssueCode = { [C in Code]: (typeof CATALOG)[C]["issue"] extends true ? C : never }[Code];
type ReportCode = { [C in Code]: (typeof CATALOG)[C]["report"] extends true ? C : never }[Code];

// NEW: every reason an ending can carry that Flow itself writes; the contract's own tags join by type.
const ENDINGS = {
  unknown: ["Defect", "Interrupted", "Restored", "StorageFailure", "TimeoutError"],
  notSent: ["Rejected", "Cancelled", "StorageFailure", "Disposed", "Restored", "Unencodable", "NoPersistence"],
  failure: ["Defect", "Interrupted"],                                   // a read's ReadFailure
} as const;
```

- Classification has one rule, `CATALOG[code].class`; `ByCause` reads the diagnostic's own Cause (a die is a
  Defect, a fail a Failure, interrupts only an Interruption). `error.ts#classify` (80-86) and
  `snapshot.ts#issueOf` (150) become it.
- A literal that names a store refusal appears once (`StorageFailure`); the lane's evidence kinds and the port's
  error reuse it by type. The rename table for saved text (ET-3), handed to AR as data and applied by a format
  step that reads no definition: `{ StorageRefused: "StorageFailure" }` for `reason` and `why`
  (`stories/storage.test.ts:54` pins the old text).
- **`SavedEnding`** (AR 14 a), per contract, the exact union the ledger emits:
  `{ success, value }` by the contract's `output` codec; `{ failure, reason: tag, value }` by its error codec;
  `{ unknown, reason }` and `{ notSent, why }` by `ENDINGS`, with no value. A contract with no declared codec
  keeps today's canonical form and its fallback to unknown `Restored` (`record.ts:107`); see Q16.

### 6.8 A failure crossing cleanup

`failureOf(body, cleanups, overdue, primary)`. `judge` (`owners.ts:53`, called at `:212`) stays the one
classifier of an Exit, in its order: any interrupt is Interrupted, else any die is Died, else Failed. Every
reason it finds beside an interrupt that is not an interrupt is, together, one cleanup, the first one
(`besideOf`; today's `cleanupOf` keeps that Cause whole). The caller awaits each cleanup's Exit or lists it
as overdue, and never drops a race's loser. `cleanups` are in phase order (work, forget, services), and inside a
phase in the Owner tree's close order (children first), never in the order they happened to end.

"Cleanups" below includes the one `judge` found beside an interrupt.

| Body, by `judge`        | No cleanup failed, none overdue   | Otherwise                                                             |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------- |
| Done                    | the success                       | fail: `[cleanups..., overdue...]`                                     |
| Failed with a FlowError | the body, unchanged               | fail: `[its diagnostics..., cleanups..., overdue...]`                 |
| Failed with another     | fail: `[primary]`                 | fail: `[primary, cleanups..., overdue...]`                            |
| Died                    | fail: `[primary]`, classed Defect | fail: `[primary, cleanups..., overdue...]`                            |
| Interrupted             | the interruption, untouched       | the body's interrupts combined with fail: `[cleanups..., overdue...]` |

- **Count:** one `CleanupFailed` per failed cleanup and one `ReleaseOverdue` per overdue release, each at its
  own path. `Cause.combine` drops equal reasons, so the count is never read from a Cause, and no summary
  holds a number.
- **The error's `cause`:** `Cause.combine(b, c1, c2, ...)`, where `b` is the body's Cause for Failed and Died, a
  FlowError body's own `cause`, and nothing for Done and Interrupted. Body first, then the cleanups in the
  order above: Effect's own order for a finalizer (`causeCombine(exit.cause, finalizer)`). Every reason of
  every input is in it once. `evidence` is none; T100 adds the field.
- **Class:** each diagnostic is classed from its own Cause, not from the whole.
- **The interrupt row:** the result is `Exit.failCause(Cause.combine(interruptsOf(body), Cause.fail(error)))`, so
  `Cause.hasInterrupts` is still true and the FlowError is still found.
- Callers: `close.ts` (body `driver.ended`, `primary` a `Defect` at `dispose`), `run-promise.ts` (`primary`
  `RunFailed`), and an Owner's end.

### 6.9 Construction trust

- **The fault model:** mistakes, not attacks. A wrong value, a copy, another definition's token, a throwing
  getter and a second loaded copy of Flow are handled; a value built by hand on Flow's prototype is unsupported,
  as in Effect (the user's Q4 B).
- **One door.** Every public function is `door(name, args, run)`. An argument's schema is a Schema, and `run`
  gets the taken copy, or `Unread`, and `run` gets a value with no readable member. Too few arguments fail the
  Schema like any wrong value. A refused door returns nothing and registers nothing: it raises one `FlowError`.
- **`made`** is the only constructor of a value Flow hands out. Its face is deeply frozen data; a function
  anywhere in a face that no door registered is an `InvariantViolation` at construction. What the core calls
  (`textOfKey`, `call`, `make`; ET PD2) is off the face, under a second registered symbol that no enumeration
  shows. `made`, `madeOf` and `intake` are internal; `render` and `renderAll` (ET PD3) are T100's.
- **The brand** (Q4 B): `Symbol.for("flow-state/Made")` on one shared frozen prototype. A spread or a JSON round
  trip drops the prototype. `madeOf(kind, owner)(value)`, called on a lifted value:

  | `MadeTypeId in value` | Kind         | Owner                | Result                                 |
  | --------------------- | ------------ | -------------------- | -------------------------------------- |
  | the read throws       | n/a          | n/a                  | one `Defect` finding at the path       |
  | false                 | n/a          | n/a                  | `WrongKind`                            |
  | true                  | another kind | n/a                  | `WrongKind`                            |
  | true                  | this kind    | another definition's | `ForeignToken` (today's owner compare) |
  | true                  | this kind    | this one             | the internals                          |

- **`intake`** is lift then decode: one walk reads each own property once into a copy, catches a throwing
  getter or trap as one `Defect` finding, and never calls a function; one Schema decodes the copy. Today's
  `boundary.ts#admitted` reads `given[n]` again after `walk.is` (`boundary.ts:528-541`), so it is replaced, not
  reused. The same `intake` checks a lookup's input (W3), a commit's input and, with `output`, a call's value
  (W8). A contract's `staleTime` and `gcTime` are durations of zero or more, checked by its door's Schema.
- **`InvariantViolation`** from the core stops the Runtime, as today's `defect` does through the driver.
- **T98a** (before T113's `derive.ts` and T109): `door`, `made`, `madeOf`, the testing route, marks removed.
  **T98b** (first in P5): `intake` and one Schema per door. T100: the catalog, `failureOf`, the renderer.
  @task.V3.T98's text still says `WeakSet`; it needs the Q4 B wording when it is split.
- **`Flow.private`** means "left out of outside snapshots". It does not mean "not saved": Q12.

### 6.10 The entry store and a saved entry

A `resource({ persist: true })` saves `{ contract, key, value, at }` when data lands (AR's `CacheShape`); RO 8.7,
accepted, requires its `output`. `install` runs once per saved entry at boot or adoption:

| The saved entry              | Result                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| its key is already in memory | ignored (6.2's Install row)                                                             |
| does not decode by `output`  | starts missing; no quarantine (RO R17)                                                  |
| `now - at >= gcTime`         | starts missing; the record is deleted                                                   |
| otherwise                    | an unheld Idle entry: data `{ value, at, asked: none }`, `unheldSince := now`, an alarm |

`asked: none` is never fresh, so the first Ask starts a request and the view shows the data as stale. A clock
that moved back makes the age negative: the entry installs, still stale.

## 7. Algorithm

```
settled(call, result):                                  -- answers.ts
  if releasing.has(call): releasing.delete(call); clearAlarm(call); evidence Released; return
  match callHome.get(call):
    some(entry): entries.apply(entry, Settled(result))
    none:        lanes.settle(call, classify(result)) or defect

lookup(life, operation, raw, owner):                    -- entries.ts
  input = intake(operation.input)(raw)
  if failure: ledger.owe(Defect row to life, input: {}); evidence InvalidInput; return
  e = entryOf(operation.contract, keyText(input)) or create
  s = slots[life][operation]
  letGoKeptOf(s)
  if s and s.entry != e.id: leave(s)                    -- Superseded; the old entry is touched
  point(s, e)                                           -- First hold arrives if e was unheld
  apply(e, AskLookup(s))

apply(e, cue):                                          -- the table of 6.2, total over Request x currency
  cell = TABLE[cue._tag][phaseOf(e)]                    -- phaseOf: Idle | Current | Behind, derived
  for move of cell(e, cue, now): perform(move)          -- Start, Serve, Owe, Release, Remove, field writes
  maintain callHome, slotsOfEntry, placementsOfEntry    -- indexes, in the same step (AT section 11)

stepEnds():                                             -- once per step
  for e of touched entries with holds(e) = 0 and unheldSince none: apply(e, LastHoldLeft)

an ending's mail:                                       -- serve.ts
  row = ledger.tried(actor, id); none -> return
  payload = mapping.from(row.value, { input: row.input, key: pick(row.input, keyFields) })   -- callSlot
  throw   -> apply(Change.Refused { source: Ending{..}, failure, ending: some(row) })
  else    -> runTurn(...) -> Change.Turn | Change.Refused | Change.Unturned, each with the row
  -- AT's apply: C2, C3, C4 (ledger.afterTry), C5, C6 publish, C7

issuesOf(world, compiled, inc, now):
  [...outcomes(inc), ...scheduleIssues(inc), ...rows(owed[inc.actor]).filter(refusal),
   ...slotsOf(inc).flatMap(entryIssue), ...placementIssues(inc),
   ...keysHeldBy(inc).filter(k => releasingOf(k).some(overdue(now))).map(callIssue), ...recordIssues(inc)]

failureOf(body, cleanups, overdue, primary):            -- host/failures.ts
  j = judge(body); cs = [...toArray(besideOf(body) at body's path), ...cleanups]   -- every non-interrupt reason
  tail = [...cs.map(cleanupFailed), ...overdue.map(releaseOverdue)]
  match j.ending:
    Done              -> head = [];              b = empty
    Interrupted       -> head = [];              b = empty
    Failed(FlowError) -> head = e.diagnostics;   b = e.cause
    Failed, Died      -> head = [primary(body.cause)]; b = body.cause
  if tail is empty and j.ending is Done, Interrupted or Failed(FlowError): return body
  error = FlowError(head ++ tail, cause: combine(b, ...cs.map(c => c.cause)))
  return j.ending is Interrupted ? failCause(combine(interruptsOf(body.cause), fail(error))) : fail(error)
```

## 8. Invariants

Each is checked against section 2, not only against the rows. Each holds at the end of every step.

- **I1.** `again` only while Running and behind. (P3: at most one trailing request.)
- **I2.** A waiter implies Running; behind with a waiter implies `again`. (P5.)
- **I3.** Running implies a hold.
- **I4.** Every call the host has open for a read is in exactly one home: one entry's request or `releasing`.
- **I5.** For an entry that exists, `unheldSince` is some exactly when it has no hold.
- **I6.** At most one call per entry outside `releasing`. (P3.)
- **I7.** Landed data's `asked` never decreases, and no request asked before a Written lands after it. (P4.)
- **I8.** Each ask through a slot ends exactly once: one row, or one evidence line. Never two rows for one wait,
  and no row is queued for a life that is gone. (P5.)
- **I9.** A success row carries fresh data, a Written value, or the result of a request current at its settle.
  (P4.)
- **I10.** Quiescence: with no call open outside `releasing` and no cue pending, no slot waits. (P5.)
- **I11.** A call reads as overdue exactly while it is in `releasing` past the bound. (P8, P6.)
- **I12.** An unheld entry is removed by the first Collect due at or after `unheldSince + gcTime` unless a hold
  arrived; a held entry is removed only at Runtime ends.
- **I13.** A row in a live incarnation that is Kept has a refusal; a row that exists has an `Ending` issue
  exactly while its `refusal` is some. (P6.)
- **I14.** No `Published` follows an ending's turn before that row's move. (P7.)
- **I15.** At most one unheard unknown row per Attempt; no unknown row for an Attempt is added after its final
  row. (P2.)
- **I16.** An Attempt id minted in one boot is minted by no other. (P1.)
- **I17.** `failureOf`'s diagnostics are `head ++ cleanups ++ overdue`; its error's `cause` holds every reason
  of every input Cause once; an interrupted body's result still has its interrupt. (P9.)
- **I18.** Every code union is a subset of `Code`; a stored issue's source is a `StoredSource`. (P6.)
- **I19.** Every function reachable from a public value's face is a door's, and a door's body never holds an
  argument it did not take. (P10.)
- **I20.** The lane table is unchanged (`cells.ts`'s own table test).

## 9. Checks

**Executable models** (Sonnet sidecars; the scripts are in the lead's scratchpad, not in the repository).

- **Reads.** The entry table, the slot rules, releases and the dispatch, coded literally, with a fake host that
  settles in any order, late or never: 2 lives, 2 operations on one contract, 2 keys, placements, `staleTime`
  0 or 5, `gcTime` 0 or 10. First draft: 20,000 runs, 899,873 steps, I1 to I12 passed; two planted mutations
  (no Owe in Written; no Release at the last hold) were caught as I2, and as I3 and I4. With this text's one
  behaviour change (Written clears `again`): 80,000 runs over three seeds, I1 to I12 passed.
- **Reads, with steps.** The same model with a step of 1 to 3 cues and Last hold left judged at the step's end:
  40,000 runs, 1.8 million steps, I1 to I12 passed at every step's end. A key handed over inside one step kept
  its running call about 6,600 times per seed, with no Interrupt; the same cues in separate steps do interrupt.
- **Rows and `failureOf`.** On the draft: 234 `failureOf` combinations and 20,000 random row sequences found
  three places where 6.8's table and its pseudo-code disagreed (a FlowError body re-wrapped; the interrupt row;
  where the body's Cause goes) and one missing cell (an unknown after a final answer). On this text: 744
  combinations (12 bodies, 31 cleanup lists, 0 or 1 overdue) and 20,000 row sequences. The table and the
  pseudo-code agree everywhere; I13, I15 and I17 passed, except one body, an interrupt beside both a fail and a
  die, where the model took only the first reason as the cleanup and lost the die. `besideOf` now says every
  such reason; that one sentence was not re-run (section 17, H1).
- **Alphabet (reads):** lookup, refetch, cancel, freeze, end of a life, place, unplace, invalidate, written,
  clear, a tick, Collect due, the settle of any open call (success, failure, Interrupted), Runtime ends.
- **Oracle:** the fake host's own log (calls opened and settled, versions) and the rows; never the table.
- **Not in any model:** the data layer's holds, `install`, `intake`, doors, the issue view.

**The Story of the wrong ending.** None of the first six has a test today; each is red on today's code.

1. Two keys: A's `pay` ending is refused twice and Kept; B's is heard. The snapshot must still show A's issue.
   Cancel A: gone in that publish (W1, I13).
2. A poll every 3 seconds against a server that answers in 4: the machine must hear an answer (section 1).
3. Two actors look up one key; one ends: the call stays open. Both end: it is interrupted (W4).
4. A lookup, an invalidate, then the old answer: the machine hears the trailing request's answer, not the old one.
5. A fake ignores the abort of a read whose key the machine then looks up again: no issue before the bound, one
   after, none once the call ends (I11). `ShopFakeSteadfast` does this for a write today; reads need the same.
6. `dispose()` with two failing cleanups whose errors are equal: two `CleanupFailed` diagnostics, one reason.
7. A reload, then a new payment: its idempotency key differs from every key the server saw (I16). This should
   pass today; no test states it.

**Planted faults:** an issue cleared by another key's ending; a refusal kept after its row closes; publish
before the row moves; a behind result that lands; a join when behind; two calls for one entry; no release at the
last hold; overdue early or kept after the end; a second unknown row for one Attempt; an Attempt id without the
seed; a lookup input unchecked; a timeout mapped as a failure; a cleanup's Cause squashed; a race's loser
dropped; a function on a made face; a body that reads the raw argument again. Faults that target deleted code
go with it: `newer-lookup-unsuperseded` (`rule-faults.ts:163`).

## 10. Cost

Sizes: W waiters of one entry, S slots and placements of one life, Q rows of one identity.

| Operation                            | Today                                              | After                                                    |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| lookup, refetch, cancel              | O(all reads): `lanes.ts:125-133`                   | O(1): `slots[life][operation]`, `entries[contract][key]` |
| the end of a life                    | O(all reads): `incarnations.ts:301-302`            | O(S)                                                     |
| a settled read                       | O(1) plus a drop                                   | O(W): one row per waiter                                 |
| invalidate or clear by a partial key | n/a                                                | O(entries of that contract)                              |
| `issuesOf`                           | a stored list                                      | O(Q + S), plus the releasing calls of held keys          |
| disposal                             | `reads` replaced (`disposal.ts:85`); all lanes     | O(lives x S) through `End`; lanes unchanged              |
| owed rows at a start or end          | O(Q²): one `setRows` per row (`ledger.ts:328-411`) | O(Q): one write per pass                                 |

Indexes, each written by the owner of its fact in the same step and checked by AT's `indexDrift`:
`callHome` (call to entry), `slotsOfEntry`, `placementsOfEntry`, `releasingOfEntry`, and the two nested maps of
4.3. Holds are the sum of two set sizes and the data layer's count. Hot-path allocations: an Ask of a fresh entry
allocates one row; a join allocates nothing. The lane queue's spread per enqueue (`lane-moves.ts:230`) and per
dequeue (`:189`) stays: O(queue), and the bench decides.

## 11. Fit to today's code

@review.code-audit agrees on L2 (`IssueSource.Creation`), L4 (marks to `Made`) and L5 (`CleanupOverdue`). Its
section 3 keeps "lanes and ledger"; this design keeps the lane table and changes three ledger functions. Its
section 4 rows outside this area (the edge flags, `Quarantine`, the four `settle`s) are not decided here.

| Code                                                               | Verdict | What and who calls it                                                                                  |
| ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `core/cells.ts`, `core/lane-moves.ts`                              | keep    | I20. `Answer` and `owedOrRecorded` pass the head's `input` to `ledger.owe`                             |
| `core/lanes.ts#commit`, `#settle`, `#answer`, `#everyLane`         | keep    | callers `serve.ts:123`, `answers.ts:74, 79`, `disposal.ts:70, 103`; a lane's `At` names AT's subject   |
| `core/lanes.ts#lookup`, `#interruptReads`, cancel's Read arm       | delete  | `entries.ts`; callers: the turn's members (`lookup`, `cancel`)                                         |
| `core/answers.ts#settled`                                          | change  | the dispatch of 6.1; `#settledRead` deleted; `#classify` kept; caller `step.ts:148`                    |
| `core/ledger.ts#owe`                                               | change  | `input`; one unknown per Attempt; nine call sites (`lanes.ts`, `lane-moves.ts`, `answers.ts`, `start`) |
| `core/ledger.ts#tryOne`, `#afterTry`, `#refused`                   | change  | split into `tried` and `afterTry(row, heard)`; the caller moves from `serve.ts:444` to AT's row C4     |
| `core/ledger.ts#start`                                             | change  | `Origin.HeldAtStart` goes (`:68, 140, 378`); rows written once per pass; caller `incarnations.ts:201`  |
| `core/ledger.ts#live`, `#close`, `#wait`, `#suspend`, `#letGoKept` | keep    | callers `disposal.ts:68`, `incarnations.ts:318, 335`, `lanes.ts:208, 257`; a read slot calls `letGo`   |
| `core/serve.ts#serveEnding`, `#endingSource` (`:71, 411`)          | change  | the mapper's context; returns a change; no publish; `endingSource` builds `IssueSource.Ending`         |
| `core/world.ts` `Read`, `reads`, `IssueSource`                     | change  | `entries`, `slots`, `placements`, `releasing`; the source union of 4.3                                 |
| `core/incarnations.ts:301-302` (`retire`'s loop), `:42` `CREATION` | delete  | `entries.end(life)` from AT's `End`; creation's refusal is AS's                                        |
| `core/disposal.ts:85`                                              | delete  | `entries.runtimeEnds()`                                                                                |
| `core/life.ts`, `core/frozen.ts`, `core/same.ts`                   | keep    | no change; key text uses AS's `selectionCodec`, not `sameValue` (callers not swept, H3)                |
| `core/defect.ts`                                                   | change  | raises `InvariantViolation`                                                                            |
| `core/boundary.ts#admitted` (528-541)                              | rewrite | `intake`'s lift; `walkerOf` kept for the decode                                                        |
| `contract.ts#Ending`, `#resource`, `#trusted`                      | change  | `MapperContext`; no `concurrency` on a read; `key` is the input; `output`; the cast goes               |
| `compiled-parts.ts:74` (`concurrency: bound.concurrency`)          | change  | a write's only                                                                                         |
| `handles.ts#readHandle`                                            | change  | gains `refetch`; `#erase` kept                                                                         |
| `operation-checks.ts`                                              | keep    | plus a read's key covering its input, until the type says it                                           |
| `error.ts`                                                         | change  | `CATALOG`, one `classify`, `code` a getter                                                             |
| `entry.ts`, `construction.ts#isMarker`, `machine.ts:273`           | change  | `door`, `made`, `madeOf`; marks go                                                                     |
| `host/driver.ts#call`, `#resultOf`, `Lookup`                       | change  | a lookup forks under `work`; `Died` keeps its Cause; a write's timeout is Unknown; `output` decode     |
| `host/close.ts`                                                    | change  | `failureOf`; `cleanupFailed` (93-104), `CleanupOverdue` and the count deleted; `unsettledOf` kept      |
| `host/run-promise.ts#runFailed`                                    | change  | `failureOf` with `primary` `RunFailed`                                                                 |
| `host/owners/owners.ts#judge`, `#waitAtMost`                       | keep    | the one classifier; callers `owners.ts:212`, `close.ts:239, 251`, `failureOf`                          |
| `host/owners/schedule-steps.ts:27`                                 | change  | returns the Exit; no `Cause.squash`                                                                    |
| `host/edge.ts`                                                     | keep    | the store's edge; no read state                                                                        |
| `host/print.ts#shown`                                              | change  | a throwing `toJSON` is caught (`print.ts:46`)                                                          |
| `host/snapshot.ts#issueOf`, `DIAGNOSTIC_OF` (`:140, 150, 154`)     | change  | read `issuesOf` and `CATALOG`                                                                          |

Tests that pin a changed behaviour, beyond those named above: `close.test.ts:192-204` (the codes of a dispose
with a forget); `cleanups.test.ts:435-491` (a defect plus a cleanup failure, Q6); `rules/commits.ts:146-155`
(a replaced lookup's evidence). T99's rules (unbound lanes, consumers before providers, `RuntimeDisposed`) are
untouched.

## 12. Principles and fixtures

| Principle                           | Held or traded                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One owner per state                 | Held: `entries.ts` for the three read states; the ledger for rows; `failureOf` for the crossing          |
| Store facts, derive views           | Held: no stored overdue, timer id, waiter position, issue or count. `again`, `waiting` and `unheldSince` |
|                                     | are facts (a want, a wait, a time), each with one writer; I1, I2 and I5 tie them to the rest             |
| Explicit states                     | Held: `Request`, `Heard`, `Refusal`; currency is derived and named                                       |
| Total tables                        | Held: 6.2 has no empty cell; "not reachable" cells are I3 and the dispatch                               |
| Survives a reload                   | Held: 6.6 and 6.10; positions and calls are never saved                                                  |
| Same rule at every scope            | Held: a slot is keyed by a life (root, instance, fragment); holders are AT's                             |
| One equality and one codec per fact | Held: key text by AS's `selectionCodec`                                                                  |
| A throw changes only its own check  | Held: 4.2                                                                                                |
| Simple                              | Held, by cutting: `Trigger`, `landedAt`, `waiting.after`, the trailing input, the release table's states |
| Effect at the edges                 | Held: timeout, retry, interruption and Cause combination are Effect's                                    |
| Types derive from their source      | Held as stated in 4.3; not compiled (section 17)                                                         |
| Cheap operations                    | Held: section 10                                                                                         |
| General                             | Checked below                                                                                            |

Against the fixtures (read by a sidecar; the shop's writes and reads re-read):

- **shop pay:** section 1. `voidAuthorization` has no timeout; its lost answer is unknown, as today.
- **transfers:** `balance` is keyed by `account`, its whole input. `transfer`'s 30 second deadline is step 2.
- **sync, lanes:** `remoteHead` with a fake that cancels over the connection in `Effect.onInterrupt` is the
  failing release of step 6.
- **sign-in:** `me`'s value holds a refresh token that lands in `Flow.private` memory (Q12).
- **command-palette, home, player, session:** writes only; the lane is unchanged. `home`'s schedule guard reads
  a write's row (`O.setTarget.get`), which stays a lane read.
- Every read in the fixtures sets `staleTime: 0, gcTime: 0` and keys by its whole input: an entry is shared
  only while a call runs and is removed with its last hold. The catalog's step 4 (`subscribe`, `refetch`,
  `invalidate`, `setData`, `clear`) is what the rest of the table is for.

## 13. Seams (composition)

- **Offers** `entries` (the three read states), `issuesOf` with `IssueSource` and `StoredSource`, `CATALOG` and
  `ENDINGS`, `SavedEnding` and the rename table, `failureOf`, `door`, `made`, `intake`.
- **Cluster 1 (taken):** `selectionCodec` is the key text and the equality of a read's key; a schedule's issue
  source is `Schedule`; the branded `SlotName`. RT5 was not located and is not answered.
- **Cluster 2 (taken, with one request):** reads keyed by life (`slots` is AT's `readsOf` index); lanes keyed by
  subject (a lane's `At` names it; no cell changes); `Freeze` and `End` call `entries.freeze` and `entries.end`
  from row C4; placements unplaced at `Freeze` and placed at `Thaw`; `issuesOf` reads `outcomes`; H3 is
  `StoredSource.Slot`; the list repair's report code is a catalog row. **Request:** the three cells of 6.5 (Q13).
- **Cluster 3 (answers to AR 14):** (a) 6.7's `SavedEnding`; (b) to (d) 6.5, accepted; (e) 6.10; (f) 6.5: the
  rule exists, and two tabs are T28's; (g) hydrate against restore is not answered here (section 17).
- **Cluster 5 (handed):**
  - the proof that a mapper's `(value, { input, key })` infers from the contract through `outcomes`;
  - `Bound<"read">` without `concurrency`, a `resource`'s `K` equal to its input's fields, and
    `Cause.TimeoutError` excluded from a `transaction`'s `E`;
  - the door's public types from `derive.ts`, the surface walk over both routes, and the `throw` lint (ET-4);
  - the run rule "a published snapshot's issues equal `issuesOf` of inspection's state" (RO R2);
  - the generator of section 9 and an abort-ignoring fake for reads; the Story clock driving the two alarms;
  - `flow explain` and inspection showing `releasing`, entries and a row's refusal;
  - the host publishing when the release alarm fires, and calling `stepEnds` once per step.
- **Tasks:** @task.V3.T21's acceptance still says `{ value, input, key, attempt }`; the user's decision is
  `(value, { input, key })`. No Task's scope is changed here.

Where each hole is answered:

| Hole                        | Where                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| RO-1, RO-2                  | 6.1, 6.2 (Runtime ends; the dispatch), Q4                                                  |
| RO-3, M8                    | 6.4                                                                                        |
| RO-4, problem 11            | 6.5 "Row before publish", Q13                                                              |
| RO-5                        | 4.3 `Option<Position>`, 6.10                                                               |
| RO-6                        | `Trigger` cut (Q2); no `waiting.after` (4.3); collect is an alarm on `unheldSince` (6.2)   |
| RO-7                        | Q17 (retries); 4.2 (the mapper); `InvalidInput` (6.3); 6.4; one `issues-of.ts` (section 5) |
| ET-1, problem 14            | 6.8, Q6                                                                                    |
| ET-2                        | 6.7                                                                                        |
| ET-3, X-1's share           | 6.7's rename table, handed to AR's format plan                                             |
| ET-4                        | section 3's debt; cluster 5's lint                                                         |
| ET-5                        | 6.9 (the brand follows Q4 B); `run-promise.ts` keeps its Cause and calls `failureOf`       |
| X-5, X-6                    | key text by `selectionCodec`; 6.7's last bullet                                            |
| M6, M13, M15                | 6.9 (T98a, T98b); `intake`, `MadeKind`, no new `settle`; no format number is named here    |
| @review.complexity-sweep F1 | section 10                                                                                 |

## 14. Questions for the user

Recommendation first. Every departure from RO, ET, a Plan, the code or an accepted answer is here.

1. **A read's key is its whole input.** Departs from `resource({ input, key })`.
   - A (recommend): for a `resource`, `key` orders the input's fields for partial-key matching and must name
     every field. Trace B: two lookups with `{ account, currency }` and key `["account"]` share one entry; the
     second gets the first currency's answer as a success.
   - B: keep a partial key and store the input on the entry; equal keys with different inputs then race.

   ```ts
   // before (existing): resource({ input: { account, currency }, key: ["account"], ... })   // compiles
   // after: a type error on `key`: it omits `currency`
   ```
2. **No `Trigger` cue.** Departs from RO 3.2 and @plan.Operations.O2 ("focus regained and connection restored
   refetch"). A request starts by itself only at a placement, an invalidate and a clear; a refetch on focus or
   on an interval is a schedule that runs `O.x.refetch()`, as Pay's `UNSURE` does. Alternative: a host occasion
   (focus, online) as a new input and a new row.
3. **One position.** Departs from RO 3.2 (`landedAt`, "Land if it may"). A result that went behind never lands.
   Cost: one answer is thrown away when an invalidate arrives mid-flight and nobody waits; and invalidations
   that never pause for one round trip starve the waiters. Alternative: RO's two positions, which lands stale
   data that views can show.
4. **A life's end and a disposal owe waiters nothing.** Departs from RO R11, T21's comment of 2026-11-16 and
   @plan.Operations.O2 ("the Interrupted ending a freeze or an actor's end parks"). Trace A: each waiter gets an
   `Interrupted` row that closes at once as evidence, since its life is gone. Trace B: the slots leave and the
   calls are released. A freeze still parks one `Interrupted` row per waiting lookup. R11 becomes "disposal
   interrupts every running read".
5. **`ReleaseOverdue` is an issue only for incarnations that hold the call's key.** RO's `by: ActorId` names the
   actor whose leaving caused the release, which is usually gone. A released call nobody holds shows in
   inspection, evidence and `dispose()`. Alternative: also show it to the actor that cancelled, while it lives.
   Reads and, later, sessions only; a write's `Cancelling` head is the lane's (RO 8.6 as recommended).
6. **`failureOf`: one failed `FlowError` per crossing, one diagnostic per cleanup.** Departs from the code
   (`close.ts:282-296` makes a defect plus a cleanup failure a `Die` holding the error) and picks ET 3.5 over
   ET section 1. The defect is in `cause` and its diagnostic is classed Defect. Alternative: keep the `Die`.
7. **RO 8.1, issues as views:** as proposed, with the source `Ending { operation, key, attempt }`.
8. **RO 8.3, an invalid lookup input ends the read as `Defect`:** as proposed; evidence is `InvalidInput`.
9. **RO 8.4, a write's `Cause.TimeoutError` is unknown and a type error:** as proposed.
10. **ET PD1 and PD4:** as proposed. PD1's rename of saved text is one format step in AR's plan.
11. **Where a made value's internals live under Q4 B.** This design puts them under a second registered symbol
    on the value, off the face, so two loaded copies of Flow read each other's values, as Q4 B promises. A
    `WeakMap` beside the brand (ET's text) would refuse a second copy's values. Confirm the first.
12. **`Flow.private` is saved in clear text** (AR H6). A (recommend): keep it; `private` means "not in outside
    snapshots", and a value that must not be stored comes from host context. B: `Flow.private` is never saved,
    and sign-in loses its session on reload. C: a per-field `persist: false`.
13. **Three cells of AT 6.6 change:** row C4 calls the ledger for `Refused`, `Unturned` and an ending's `Turn`,
    and row C2 writes no outcome for a refused ending. Without it the issue is keyed by source again (W1).
14. **AR's "a final answer replaces an unheard unknown":** accept it (6.5). Trace without: Pay hears `PayUnsure`
    after the truth is known, re-enters `UNSURE` and polls for an answer it is about to get.
15. **Written data is fresh and answers waiters.** Open in RO ("whether `setData`'s data is stale").
    Alternative: written data is stale, and every `setData` is followed by a request.
16. **A persisted write declares its `output` and error Schemas.** RO 8.7 (accepted) covers a persisted
    `resource`; this extends it to a `transaction`'s saved endings. Today an ending that cannot be saved becomes
    unknown `Restored` (`record.ts:107`): a success turns into "unsure" on reload. A (recommend): required when
    the app persists. B: keep the fallback.
17. **Retries follow the user's Q9; RO 3.5's example does not.** Inside `commit`, `Effect.retry` is immediate
    only (`times`, `while`), one Attempt and one call; a retry after a delay is a machine schedule that runs
    `O.x.retry`. RO 3.5's `Schedule.exponential` inside the Effect is dropped. No type can check what a commit's
    Effect does, so this is guidance, not a rule of the core.
18. **A read whose mapper throws.** @plan.Operations.O2: it "ends as that Defect, with the store's UserClosure
    issue".
    - A (recommend): one rule for every row. The row is refused, tried once more and Kept with its issue, and
      the slot's next lookup or cancel lets it go (6.3). Trace: a mapper bug leaves the machine in its loading
      state with the issue naming the mapper's slot, until it asks again.
    - B (the Plan): the refused row is replaced by a `Defect` row, so the machine hears its `Defect` mapping. A
      mapper bug and a `lookup` bug then look the same to the machine, and a `Defect` mapper that throws needs
      the rule of A anyway.
19. **`gcTime: 0` removes the entry in the step its last hold leaves** (6.2), which is the Plan's "next turn
    boundary". Confirm that a step is that boundary; the alternative is the end of the drain.

## 15. Process notes

- **What went wrong here before.** Reads were built as "one call per incarnation" beside the lane, and each
  review added a field (the slot's position, the overdue flag, the collect timer) to answer one sequence.
  RO's table was never run; an adversary broke four of this design's own first cells in five minutes, and a
  model found three disagreements between a table and its pseudo-code. The errors design listed names without
  asking which state each names, so three names survived for one fact.
- **Order of work.** The row first (`input`, `refusal`, the three cells of 6.5): it is small and red today on
  Story 1. Then `CATALOG`, mechanical and type-driven. Then entries, model first: port the scratchpad model's
  generator into `tests/generated` before `entries.ts` exists. `failureOf` any time after the catalog, from its
  exhaustive table. Doors before `derive.ts`.
- **First failing checks.** Stories 1, 2 and 6 of section 9; the four inverted restore tests of 6.5.
- **Where a review pays.** One on the entry table against the generator's oracles, before code. One on the
  hostile table for doors. None per field.
- **Fixtures.** No fixture shares an entry in time (`staleTime: 0` everywhere), and no Story has a read that
  ignores an abort: the catalog's step 4 fixtures come before the entries Task, or its table is tested by the
  generator alone.
- **Sidecars.** Research sidecars were quick and mostly right on what exists; they were wrong on line numbers
  about one time in six, so every cited line was re-checked by a second one. The adversary and the two models
  paid for themselves; give the adversary the whole text, not only the tables.

## 16. Sidecar log

Fourteen sidecars: ten Haiku (five research at medium, two adversaries and two checkers at high, one test survey
at medium) and four Sonnet model runs. None wrote outside the scratchpad. Each finding was re-checked in the code or
the text before use.

| Sidecar      | Finding                                                                                      | Result   | Why                                                                            |
| ------------ | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| writers      | reads are scanned by `interruptReads` and `retire`; `tryOne` publishes inside `hear`         | accepted | re-read `lanes.ts:125-133`, `ledger.ts:279-293`, `serve.ts:371-420`            |
| writers      | no `waiting.after`, overdue or release state exists in `src/`                                | accepted | they are RO's, not the code's                                                  |
| errors       | `failureOf` does not exist; the nearest folds are `judge` and `classify`                     | accepted | `owners.ts:53`, `error.ts:80-86`                                               |
| errors       | two classification rules; the summary counts Causes                                          | accepted | `close.ts:93-104` re-read                                                      |
| fixtures     | every read keys by its whole input, with `staleTime: 0`                                      | accepted | grounds Q1; reads re-read                                                      |
| fixtures     | `GitFakeCancelsAbandoned` exists                                                             | changed  | the test survey found no use of it; section 12 names the pattern only          |
| prior art    | Effect's Cause is a flat, deduped list; a finalizer's Cause is combined after the body's     | accepted | grounds 6.8's count and order; not re-read in `node_modules`                   |
| prior art    | TanStack removes a query only when unobserved and idle; a refetch joins or cancels           | changed  | join kept (the Plan's R5); cancel-and-refetch is Invalidate here               |
| trust        | no `Made` brand and no `Symbol.for` in `src/`; marks checked by presence                     | accepted | R2 3.1 read for the brand's shape                                              |
| adversary 1  | Clear on Running reads the request after Release                                             | accepted | the cell reads `w` first                                                       |
| adversary 1  | Runtime ends removes an entry a waiter points at                                             | changed  | lives end first; said in 6.2                                                   |
| adversary 1  | two inputs with one key share an answer                                                      | accepted | Q1: the key is the input                                                       |
| adversary 1  | a refetch joins a request started before it                                                  | rejected | that request started after the asker's last answer; "it changed" is Invalidate |
| adversary 1  | the collect alarm is not re-armed; Written leaves `again`; a refetch on a waiting slot       | accepted | 6.2's cells and 6.3's first sentence                                           |
| adversary 1  | a row outlives its life                                                                      | rejected | the ledger closes a life's rows at `End` (AT 6.5)                              |
| adversary 2  | a released call is in no snapshot once its last holder leaves                                | accepted | 6.4 and P8 reworded; `EntryId` is a name; Q5                                   |
| adversary 2  | a released call's failing cleanup is dropped                                                 | changed  | the Owner hears it, as today (6.1); `cleanups.test.ts:502` pins that           |
| adversary 2  | I17 against the dedupe; a FlowError body loses its cause; the interrupt row                  | accepted | 6.8 and section 7 rewritten                                                    |
| adversary 2  | `next` could repeat; P2 forbids an unknown then its answer                                   | accepted | 4.3's `Position`; P2 reworded                                                  |
| adversary 2  | a cancel lets a Kept unknown go while "the answer is still owed"                             | rejected | two states: a held head's unknown is dropped, a head on the wire is answered   |
| adversary 2  | a fixed Story seed repeats Attempt ids after a reload                                        | rejected | the Story seed holds the tab's open count (`testing/run.ts:132`)               |
| adversary 2  | `madeOf`'s read can throw; a nested function on a face; two calls share one source           | accepted | 6.9's table and deep check; 6.4's one issue per key                            |
| adversary 2  | `Entry.last` shown to a late joiner                                                          | changed  | kept as shared entry state; H10                                                |
| adversary 2  | install on an existing entry; a clock moved back deletes saved data                          | accepted | 6.10                                                                           |
| code check   | nine wrong or shifted line citations; `unsettledOf` is in `close.ts`                         | accepted | each fixed; four re-read                                                       |
| code check   | today's Attempt id already holds the boot seed                                               | accepted | `tx.ts:188-191`; 4.3 and 6.5 corrected                                         |
| completeness | Q9 was misdescribed; Plan O1 and O2 sentences contradicted with no question                  | accepted | Q17 rewritten; Q4 widened; Q18 and Q19 added; "end of the step" adopted        |
| completeness | R2's Q6 is departed from at a life's `End`                                                   | rejected | "a parked row closes as evidence" is what 6.3 and AT 6.5 say                   |
| completeness | T100's "phase order"; `MissingService`; PD2 and PD3; `admit` has a fourth meaning            | accepted | 6.8's order; 6.5; 6.9; `intake`                                                |
| test survey  | the tests and faults that pin changed behaviour; no test for Stories 1 to 6                  | accepted | cited where they apply; not opened by the lead                                 |
| model, reads | 20,000 runs on the draft, then 80,000 on this text's change: I1 to I12 passed                | accepted | 13 readings listed; four are now text                                          |
| model, rows  | three table against pseudo-code disagreements; one missing cell; "fail wins over die"        | changed  | the first four fixed; the last is its reading, not `judge`'s order             |
| model, rows  | on this text: 744 combinations agree with the table; one body lost a die beside an interrupt | accepted | `besideOf` takes every non-interrupt reason; H1                                |
| model, steps | a step of 1 to 3 cues, holds judged at its end: I1 to I12 passed; hand-over keeps the call   | accepted | 6.2's step-end rule; its one waste is in H1                                    |

## 17. Open holes

- **H1. The models are narrower than the text. Blocks Spec for the parts named.** `besideOf` (an interrupt
  beside two other reasons) was fixed after the last run and not re-run. The step model found that Clear on a
  Running entry that has lost its holds mid-step starts a call from `again` which the step's end then releases
  (about 150 times in 900,000 steps): wasteful, not wrong, and not fixed. The data layer's holds, `install`,
  `intake`, the issue view and I14 are in no model. Why open: one run.
- **H2. The types were not compiled. Blocks build.** `MapperContext` through `outcomes`, the `resource` key
  rule and the excluded `TimeoutError` are stated; cluster 5 owns the proof.
- **H3. Not every source was read by the lead. Blocks Spec until checked.** @review.code-audit and
  @review.case-studies were read through sidecars and at 3.3a and 4.1; the four T21 Tasks were not found; the
  tests were read through a survey. Callers of `life.ts`, `frozen.ts`, `same.ts` and `operation-checks.ts` were
  not swept. Plan sentences found uncovered and not designed: `value` firing by `Equal.equals`,
  `InvalidWrite` (@plan.Operations.O2, O3), a placement "released within the disposal bound" (T21).
- **H4. Placements are RO 3.3 unchanged and unattacked. Blocks Spec for the placements Task.** Streams and
  sessions have no design; `releasing` is shaped to take them.
- **H5. Hydrate against restore (AR 14 g, DL-2) is not answered. Blocks Spec for @task.V3.T115.**
- **H6. `CleanupFailed` as a lasting issue. Minor.** T99's quarantine of a ref (`driver.ts:81`) is host state;
  whether the snapshot shows it through `issuesOf` or beside it was not traced.
- **H7. `persist: true` with `gcTime: 0` saves an entry that never installs. Minor.** A construction finding,
  or another bound for a saved entry's age; not decided.
- **H8. The door table was attacked once, on paper. Blocks Spec for T98a.** ET's hostile table stands as its
  check. Where internals live (Q11) decides whether the surface walk must skip one symbol.
- **H9. Starvation under endless invalidation. Minor.** Stated in Q3; no bound is designed.
- **H10. An entry's `last` is shown to a slot that joined after the failure. Minor.** 6.7 treats it as shared
  entry state; a per-slot fact would be one more field.
- **H11. Who publishes for the release alarm, and the public event a view sends for `refetch`, are cluster 5's
  and have no design. Blocks build.**
