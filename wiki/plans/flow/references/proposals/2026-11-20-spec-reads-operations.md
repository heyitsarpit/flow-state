---
proposal spec-reads-operations
status proposed 2026-11-20
---
# Reads and operations: design and Spec

**Verdict: keep the write lane, build reads as a second table beside it, and stop storing operation issues.**
The lane table (`cells.ts`) and the ledger hold and stay. Reads today are one unshared call per incarnation
and operation: shared entries, freshness, refetch, placements and persisted resources are unbuilt, and each is
one new state owner. An operation issue becomes a view of the state that causes it (an owed row, an entry, a
placement, a releasing call), so nothing can forget or outlive its cause.

Everything here is **proposed**. Asks are in section 8. Serves @task.V3.T21.

Sources: `code:packages/flow-state-v3/src/core/lanes.ts`, `lane-moves.ts`, `cells.ts`, `ledger.ts`, `serve.ts`,
`answers.ts`, `src/contract.ts`, `src/handles.ts`, `src/host/driver.ts`, `src/host/close.ts`;
@plan.Operations.O1, O2, O3, O6; @plan.Machines.O6; @plan.Runtime.O6; open-items 4, 9, 10; T21's comments.

## 1. What exists

**Holds (reviewed and tested; keep).**

- The write lane is one total table, `cells.ts#table`: 12 cues by Idle and 8 head phases, applied by
  `lane-moves.ts#makeMoves.apply`, which also derives the reports. One owner, one writer per lane.
- Declines before the table live in `lanes.ts#commit`: `Unencodable`, `NoPersistence`, a quarantined lane
  record, a Kept row on the key (let go under `cancel`).
- Every ending is one owed row from birth to close (`ledger.ts#Owed`); its delivery is `Queued`, `Retrying`,
  `Waiting` or `Kept`; only the ledger writes a row.
- The four policies (`reject`, `latest`, `serialize`, `cancel`) are four cues of the one table, not four code
  paths. Retry is the `O.x.retry` member and the `retryable({ times })` guard; nothing retries on its own.
- The host runs a call as an Effect under an Owner and reports one `CallResult` (`driver.ts#call`,
  `#resultOf`); a synchronous throw is a Defect; `cancel` reaches child Owners (`owners.ts:289-294`).

**Wrong.**

- **W1. Operation issues are stored by operation name** (`serve.ts:46`, `:280`; `world.ts#withIssue`). Any
  accepted ending of that name clears the issue: key A's refused ending is Kept and still blocks A, and B's
  ending erases its issue. A cancel that lets the row go leaves the issue standing. No test names
  `IssueSource.Operation`.
- **W2. A refusal publishes before the ledger moves its row** (`serve.ts#refusal`, `ledger.ts#afterTry`).
  Harmless while issues are stored; a derived issue would publish one turn late.
- **W3. A lookup's input has no run-time Schema check** (`contract.ts#trusted`, "checked by type only";
  `lanes.ts#lookup`). A commit's input is walked (`lanes.ts:169`); a read's reaches the user's function raw.
- **W4. A read's call runs under its incarnation's Owner** (`driver.ts:225-229`, `#ownerOf`). Fine unshared;
  with shared entries, actor A leaving interrupts the request B joined.
- **W5. Disposal empties `reads` and interrupts nothing** (`disposal.ts:85`). T21's routed comment from P2's
  close-out: a planted fault survived the suite.
- **W6. A mapper gets the value alone** (`contract.ts#Ending`, `context: unknown`). T21's acceptance wants
  `{ value, input, key, attempt }`, and a row holds no input to give.
- **W7. A read contract carries `concurrency: "reject"`** (`contract.ts:424`): a field with no meaning, read by
  `lanes.ts#policyOf` only to be ignored.
- **W8. A call's value is never decoded** (`driver.ts:63`): a wrong-shaped success reaches the mapper typed.

**Missing.** Entries shared by contract and key, freshness (`staleTime`, `gcTime` are declared and unread),
join and trailing requests, `refetch`, `subscribe` placements, rows for reads, `resource({ persist: true })`,
release within the disposal bound (`ReleaseOverdue` has no hit in the package; `CleanupOverdue` at
`close.ts:181` is the Runtime's close only), the boot check of listed services, `Flow.ignore` and `otherwise`.

## 2. State inventory

| State               | Lives in                                    | Owner                                   |
| ------------------- | ------------------------------------------- | --------------------------------------- |
| S1 Lane             | `world.lanes`, `world.displaced`            | `cells.ts#table` (existing)             |
| S2 Owed row         | `world.owed`                                | `ledger.ts` (existing; two new fields)  |
| S3 Entry            | `world.entries` (new)                       | `entry-cells.ts#table` (new)            |
| S4 Read slot        | `world.slots` (new; replaces `world.reads`) | the entry table's moves                 |
| S5 Placement        | `world.placements` (new)                    | `placements.ts#decide` (new)            |
| S6 Releasing call   | `world.releasing` (new)                     | the release table in `entries.ts` (new) |
| S7 Operation issues | nowhere: derived                            | `issues-of.ts` (new, a pure read)       |

Their states and the inputs that change each in one step:

- **S1:** Idle, or a head in 8 phases with a queue. Commit, retry, cancel, turn end, a store's answer, a call's
  answer, disposal start, the bound.
- **S2:** Queued, Retrying, Waiting, Kept, then closed. Owe, a try heard or refused, a start, suspend, let go.
- **S3:** request Idle or Running; data none or some; three positions. Lookup, refetch, placed, trigger,
  invalidate, written, clear, settled, last hold left, held again, collect due, disposal start.
- **S4:** unset, or pointing at an entry (waiting or served). Lookup, cancel, its entry's settle, incarnation
  end.
- **S5:** placed on a key or not; select last read or last failed. Each committed turn, `when`, exit, freeze,
  thaw.
- **S6:** releasing, overdue. An interrupt issued, the call's end, the release timer.

Reads and writes do not share lane state: `world.reads` and `world.lanes` are disjoint maps, and no cue of the
lane table reads a read. What they share is the ledger (both owe rows) and the dispatch of a settled call
(`answers.ts#settled`). Those are two seams, not one state, so the concept splits by owner (section 5).

**Seams.**

- **Typed machine.** I depend on `Ending.from`'s argument type and the `otherwise` and `Flow.ignore` types.
  I offer `MapperInput = { value, input, key, attempt: Option<AttemptHandle> }`, the `ReadFailure` tags
  `Defect` and `Interrupted`, and `Mapping.Ignore`, which closes a row Delivered with no turn.
- **Saved records.** I take `Fate` per lane key, typed `Restored` lanes and `Aside` holds by key, as that
  proposal gives them. I give the lane key's segments (contract id, key text; D31) and, per operation, the
  `LaneBody` and `OwedRow` Schemas; `OwedRow` gains `input` and never holds `refusal`. Open between us: the
  record kind for `persist: true` (`EntryRecord { contract, key, data, at }`) has no owner in either proposal.
- **Fragments.** I take `OwnedBy.Instance { id }`, `subjectOf` and the notice
  `Ended { id, subject, cause, releases }`. A read slot is keyed by (instance id, operation) and a placement
  by (instance id, its place in `activities`); `Ended` is the "exit" row of the placement table and the
  slot's drop.
- **Data layer.** I give the view `Entry<A> { data, updatedAt, fetching, writePending, stale }` (derived by
  `entryView`; `writePending` is the data layer's own hold), `younger(a, b)`, and `Position` (`asked` on a
  request, kept on the data it landed), minted by the runtime. I take `Refresh { entry, cause }` as the
  Refetch cue with no caller, the cues `Written`, `Invalidate` and `Clear` by contract and partial key, and
  its judge's call inside the Land move (`entities.accept`, before the ending is owed).
- **Schedule issues.** I depend on `Checked<A>` and `StoredIssue` from that proposal. I offer `issuesOf`, one
  section per concept; `IssueSource.Operation` leaves `StoredIssue`.
- **Host.** I depend on `Timer` commands and `Input.Fired`, as `Timer.Bound` works today. I add
  `Timer.Collect { entry }` and `Timer.Release { call }`, and fork every call under the Runtime's Owner.

## 3. The design

### 3.1 Issues are views (S7)

The freedom: a lasting condition (this ending is undelivered and was refused) is stored as a residue of the
event that began it, in one slot per operation name. Design it away by keeping the fact on the state that
lasts and reading issues from there.

```ts
// Before (existing): world.ts, serve.ts
type IssueSource = Event | Schedule | Operation { name } | Context | OnContext | Creation;
const endingSource = (row: Owed) => IssueSource.Operation({ name: row.operation });
// a refused ending turn:           withIssue(incarnation, { source, code, slot })
// any accepted turn of the source: withoutIssue(base, source)

// After (proposed)
// NEW: Refusal. Why a row's last try in this process was refused.
type Refusal = { readonly code: IssueCode; readonly slot: Option.Option<string> };

type Owed = {
  // existing: id, origin, actor, to, operation, attempt, lane, channel, reason, value, route, delivery
  readonly input: Values;                    // NEW: the call's input; key and mapper context derive from it
  readonly refusal: Option.Option<Refusal>;  // NEW: written only by the ledger's `refused`; never saved
};

// CHANGED: Heard's Refused carries its failure, so the ledger writes the row, then the turn publishes.
type Heard = Data.TaggedEnum<{ Unmapped: {}; Heard: {}; Refused: { refusal: Refusal } }>;

// NEW: issues-of.ts. The only place an operation issue is made.
const issuesOf = (world: World, machines: Machines, incarnation: Incarnation): ReadonlyArray<Issue> => [
  ...incarnation.issues,                                    // StoredIssue: never Schedule, never Operation
  ...rowIssues(rowsOf(world.owed, incarnation.actor)),      // one per row with a refusal
  ...entryIssues(world, machines, incarnation),             // Defect, unmapped failure
  ...placementIssues(world.placements, incarnation),        // select failed, SelectedNoKey
  ...releaseIssues(world.releasing, incarnation.actor),     // ReleaseOverdue
];
```

| Issue                                      | Read from                                      | Gone when                                |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| a refused ending (`InvalidTurn`, `Defect`) | `Owed.refusal` is some                         | the row closes: heard, let go, recorded  |
| a read's `Defect`                          | `Entry.last`, for an incarnation holding it    | the next applied ending; the hold leaves |
| an unmapped failure                        | `Entry.last` and the operation's `failure` map | as above                                 |
| `UserClosure`, `SelectedNoKey`             | `Placement.select` is `Failed`                 | its next clean run; the placement leaves |
| `ReleaseOverdue`                           | `Releasing.overdue`                            | the call ends                            |

The source names its cause: `IssueSource.Operation({ name, key, attempt })`, both options, shown as
`operation NAME KEY`. Two rows give two issues. A row read back Kept at boot has no refusal until its one try
at the start (`ledger.ts:354-358` adopts it to Retrying in that step); that try's refusal is fresh from the
definition that booted, so a slot path of an older definition is never shown.

Evidence stays as it is: `tx.refuse` still records the refusal as an event. Only the lasting copy moves.

### 3.2 Entries and read slots (S3, S4)

Where the data comes from: the app's own Effect service wrapping `fetch` (`fixtures/transfers/services.ts`,
`AccountsApi`). Flow never fetches; the contract's `lookup` is that service call.

```ts
// user-defined: AccountsApi, balance, E.BalanceRead, E.BalanceFailed     existing: resource, outcomes, lookup
// NEW: output, persist, refetch         existing but unread today: staleTime, gcTime
export const balance = resource({
  id: "Bank/balance",
  input: { account: Schema.String },
  output: Schema.Struct({ cents: Schema.Number }),   // NEW: decoded at the boundary; required with persist
  key: ["account"],
  services: [AccountsApi],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,                                      // NEW: the entry's confirmed data is saved
  lookup: (input) => AccountsApi.use((api) => api.balance(input)),
});

// in the definition
operations: {
  balance: balance.outcomes({
    success: E.BalanceRead,
    failure: { Unavailable: E.BalanceFailed, Defect: E.BalanceFailed, Interrupted: E.BalanceFailed },
  }),
},
// in handlers
actions: [O.balance.lookup(({ memory }) => ({ account: memory.from }))],
actions: [O.balance.refetch()],                       // NEW: the slot's entry; refetch(key) names another
```

State:

```ts
// Before (existing): one call per incarnation and operation, found by scanning; no key, no data
type Read = { call: CallId; actor: ActorId; incarnation: IncarnationId; operation: string; owner: OwnedBy };

// After (proposed)
// NEW
// NEW: Position. A place in the Runtime's one order, from the runtime's mint (shared with the data layer).
type Request = Data.TaggedEnum<{ Idle: {}; Running: { call: CallId; input: Values; asked: Position } }>;

// NEW: one per (contract id, key text), per Runtime.
type Entry = {
  readonly contract: string;
  readonly key: Values;
  readonly data: Option.Option<{ value: unknown; at: number; asked: Position }>;   // confirmed data only
  readonly staleAt: Position;   // the last invalidate, write or clear
  readonly landedAt: Position;  // the last write or clear
  readonly request: Request;
  readonly again: Option.Option<{ input: Values }>;   // the one trailing request
  readonly last: Option.Option<ReadFailure>;          // the last applied ending, when not a success
  readonly collect: Option.Option<TimerId>;           // armed only while nothing holds the entry
};

// NEW: one per (incarnation, operation, fragment path); absent is the row `undefined`.
type ReadSlot = { entry: EntryId; owner: OwnedBy; waiting: Option.Option<{ after: Position }> };
```

Derived, never stored:

- fresh: `data` is some, `data.asked > staleAt` and `now - data.at < staleTime`;
- a request is current: `request.asked > staleAt`; its result may land: `request.asked > landedAt`;
- the holds: the slots and placements that point at the entry, plus the data layer's;
- the row tag (Pending, Ready, Refreshing, Failure, Defect, Interrupted) from `data`, `request` and `last`.

Time passing writes nothing.

**The entry table** (owner `entry-cells.ts#table`, applied by `entries.ts#apply`; the shape of `cells.ts`):

| Cue             | Idle                                     | Running, current                    | Running, behind                               |
| --------------- | ---------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Lookup          | Serve if fresh, else Start and Wait      | Wait                                | Wait                                          |
| Refetch         | Start and Wait                           | Wait                                | Again and Wait after                          |
| Placed          | Start if missing or stale                | Stay                                | Stay                                          |
| Trigger         | Start if subscribed and missing or stale | Stay                                | Stay                                          |
| Invalidate      | Stale                                    | Stale                               | Stale                                         |
| Written         | Land write                               | Land write                          | Land write                                    |
| Clear           | Empty                                    | Empty, Interrupt, Restart if wanted | same                                          |
| Settled         | Impossible                               | Land, Owe all, Idle                 | Land if it may, Owe served, Restart if wanted |
| Last hold left  | Arm collect                              | Interrupt, Arm collect              | same                                          |
| Held again      | Disarm collect                           | Impossible                          | Impossible                                    |
| Collect due     | Remove                                   | Impossible                          | Impossible                                    |
| Disposal starts | Stay                                     | Interrupt, Owe all Interrupted      | same                                          |

The moves:

- **Serve:** owe the slot a success with the entry's data, now; no request.
- **Start:** mint a call, `Command.Lookup`, `request := Running { asked: next }`. An explicit request uses the
  caller's input; an automatic one the oldest live placement's (@plan.Operations.O2).
- **Wait:** the caller's slot waits (a `subscribe` operation has no slot and waits for nothing).
  **Wait after:** it waits for a request started after the running one.
- **Again:** `again := { input }`. It is some only while the request is behind: one running, one trailing.
- **Stale:** `staleAt := next`. **Land write:** data lands; `landedAt` and `staleAt := next`, so a running
  request falls behind and cannot land. **Empty:** data none, both positions next.
- **Land:** a success writes `data { value, at: now, asked: request.asked }` and clears `last`; any other
  ending sets `last` and keeps the data. **Land if it may:** only when `request.asked > landedAt`.
- **Owe all / Owe served:** each waiter (each whose `after` is before the request's `asked`) is owed one ending:
  the request's own when it landed; else a success with the current data when there is data.
- **Restart if wanted:** `again`, a waiter still waiting, or a placement with no data: Start; else Idle.
- **Interrupt:** `Command.Interrupt`; the call moves to `world.releasing` (3.4); the request is Idle.

A slot's own moves are this table's moves: a newer lookup repoints the slot (the old wait ends as evidence
Superseded, never owed); cancel or the incarnation's end drops it; both are Last hold left on the old entry
when no other hold remains. An unknown call's Settled is evidence only.

**The lookup's input** is walked as a commit's is (`operation.walk.input.text`, `keyTextOf`). A failure
changes nothing, runs no user function, and ends the read at once as `Defect` with evidence `InvalidKey`
(proposed, 8.3).

**The host** forks every call under the Runtime's Owner (`driver.ts:227` uses `work`): a request belongs to an
entry, not to an actor. A success is decoded by `output` when the contract has one; a decode failure is a
Defect.

### 3.3 Placements (S5)

A placement is `O.x.subscribe(select, { when? })` in a state's or trait's `activities` (@plan.Machines.O6).

```ts
// NEW
type Placement = {
  readonly path: string;                 // the fragments concept's placement path
  readonly operation: string;
  readonly activation: ActivationId;
  readonly select: Checked<Option.Option<{ key: string; input: Values }>>;   // Checked: schedule-issues
  readonly placed: Option.Option<EntryId>;
};
```

`placements.ts#decide(placement, occasion, reads)` is the one writer, one row per occasion:

| Occasion                       | `select`                              | `placed`                                                |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------- |
| entry, thaw                    | first run                             | the key's entry: cue Placed                             |
| a committed turn, same key     | `Read`                                | kept; no cue                                            |
| a committed turn, new key      | `Read`                                | the old hold leaves exactly once; the new entry: Placed |
| a committed turn, select threw | `Failed`, keeping the last            | kept                                                    |
| a committed turn, undefined    | `Failed` (`SelectedNoKey`), last none | released                                                |
| `when` false                   | unchanged                             | released                                                |
| exit, freeze, incarnation end  | removed                               | released                                                |

Streams (@plan.Operations.O4) reuse this record with a session where the entry is; they are not T21's.

### 3.4 Release within the bound (S6)

```ts
// NEW: every call the core interrupted and has not yet heard end. world.releasing: Map<CallId, Releasing>
type Releasing = { operation: string; key: Values; by: ActorId; since: number; overdue: boolean };
```

| Cue              | Not releasing               | Releasing                        | Overdue    |
| ---------------- | --------------------------- | -------------------------------- | ---------- |
| Interrupt issued | add; arm `Timer.Release`    | Impossible                       | Impossible |
| Settled          | routed to its lane or entry | remove; disarm                   | remove     |
| Release due      | Impossible                  | `overdue := true`; evidence once | Impossible |

The timer is at `since + disposalBound` (`defaults.ts:36`). A releasing call's result is evidence only. A
release never blocks the transition that asked for it (@plan.Machines.O6): a read's next request starts
without waiting, and a stream session will wait for its predecessor here (@plan.Runtime.O6). The Runtime's
own close keeps `CleanupOverdue`; this is the same rule one level down.

### 3.5 Timeout and retry live in the contract's Effect

Kept: the user's decision of 2026-11-12 (@plan.Operations.O3: no timeout ending; a deadline is the commit's
Effect). It answers open-item 4: timeout and retry describe the server, so they sit on the contract, written
with Effect, with no option on `O.x.commit` and no Flow scheduler.

```ts
// user-defined: PaymentsApi, Timeout, isTransient      existing: transaction, Outcome.unknown, attempt
export const pay = transaction({
  id: "Shop/pay",
  input: { order: Schema.String, cents: Schema.Number },
  key: ["order"],
  concurrency: "reject",
  services: [PaymentsApi],
  commit: (input, { attempt }) =>
    PaymentsApi.use((api) => api.pay(input, { idempotencyKey: attempt.id })).pipe(
      Effect.retry({ schedule: Schedule.exponential("200 millis"), times: 2, while: isTransient }),
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () => Effect.fail(Outcome.unknown(new Timeout())),   // it may have applied
      }),
    ),
});
```

- A retry inside the Effect re-sends one Attempt under one call: the lane sees one send and `retryCount`
  does not move. `O.x.retry` stays the only re-send the lane counts.
- A read's retry is the author's own `Effect.retry` in `lookup`; Flow starts none (@plan.Operations.O2).
- Proposed guard (8.4): a `Cause.TimeoutError` escaping a `transaction`'s commit is classified unknown and is a
  type error in its `E`, so a bare `Effect.timeout` cannot be mapped as a definite failure.
- Open-items 9 and 10 (offline as a wait, resuming never-sent work) stay deferred: each adds a lane phase
  before OnWire and a saved queue. Nothing here blocks them.

### 3.6 The operation contract's other changes

- Mapper context: `serve.ts` passes `{ value, input: row.input, key: pick(row.input, keyFields), attempt }`.
- `Bound<"read">` loses `concurrency`; `policyOf` loses its Read branch.
- A Compiled operation gains `services: ReadonlyArray<string>`; the host's boot fails `MissingService`, naming
  operation and service, when its Context lacks one (`Context.getOption`; no new machinery).

## 4. Requirements and Invariants

Each line: the rule; its source; the check that fails on a wrong build.

- **R1** An operation issue exists exactly while its cause does. T21's comment of 2026-11-20T15:33; W1.
  Two keys: A's ending Kept, B's accepted, A's issue still shown; cancel A, gone in that publish.
- **R2** A snapshot's issues equal `issuesOf` of the state inspection lists. This design. A run rule over
  every Story's publishes.
- **R3** Equal contract and key share one entry and at most one running call. @plan.Operations.O2. The fake
  server never sees two open calls for one contract and key.
- **R4** A fresh lookup starts no request and still delivers one success. O2. The server's call count is
  unchanged and one row is owed.
- **R5** Refetch joins a current request; otherwise exactly one trailing request runs. O2. A poll faster than
  the server: calls received are at most settles plus one, and the last data lands.
- **R6** A request started before data landed never replaces it; a cleared request never lands. O2, Reads
  I11. With versions at the fake server, confirmed data's version never decreases.
- **R7** Of several lookups through one slot only the latest's ending is delivered. O2, Reads I9. One row per
  slot per settle; the older is evidence Superseded.
- **R8** Every lookup ends exactly once: success, a failure tag, Defect or Interrupted. O2, Reads I20. After
  any step no slot waits on an Idle entry.
- **R9** A lookup's input is checked by its Schema before any call. T21's comment of 2026-11-19. Invalid
  input: no call at the fake server, one Defect ending, evidence `InvalidKey`.
- **R10** After the last hold leaves, a running call is interrupted and `gcTime` removes the entry. O2. Two
  actors, one leaves: the call stays open; both leave: interrupted; later use starts missing.
- **R11** Disposal interrupts every running read, and each waiter is owed Interrupted. T21's comment of
  2026-11-16. The planted fault that survived P2's suite.
- **R12** An interrupted call not ended within the disposal bound shows `ReleaseOverdue` until it ends.
  @plan.Runtime.O6, T21's acceptance. A fake that ignores abort: no issue before the bound, one after, none
  once it ends.
- **R13** A release never delays the turn that caused it. @plan.Machines.O6. The turn's publish precedes the
  fake's release.
- **R14** A mapper receives `{ value, input, key, attempt }`. T21's acceptance. A mapper returning `input`
  round-trips it, also for a displaced head and after a reload.
- **R15** Boot refuses an operation whose listed service is missing, by name. T21's acceptance. Making the
  Runtime fails `MissingService` naming both.
- **R16** A write's timeout is never a definite failure. @plan.Operations.O3. `Effect.timeout` in a commit is
  a type error; at run time the ending is unknown.
- **R17** A persisted entry restores stale; one that no longer decodes starts missing. @plan.Persistence.O4.
  Reload: data shown, one refetch on first use; edit `output`: no data and no quarantine.
- **I1** `again` is some only while the request is behind. The entry table. Generated sequences.
- **I2** `collect` is some exactly while the entry has no hold and no running request. The entry table.
  Generated sequences.
- **I3** In a live incarnation a Kept row has a refusal. `ledger.ts:354-358`. Generated sequences over origin,
  delivery and try outcome.
- **I4** No row, slot or placement names an incarnation that is gone. S4, S5. After every step.
- **I5** The lane table is unchanged by this work. `cells.ts`. Its existing table test.

Tables and their rows: the entry table's Lookup, Refetch, Placed and Trigger rows are R3 to R5; Invalidate,
Written, Clear and Settled are R6 to R8; the hold rows are R10 and I2; Disposal is R11. The release table is
R12 and R13. The placement table is @plan.Machines.O6 line by line. The issue table is R1 and R2.

## 5. Development strategy

**Split T21 by state owner into four Tasks, built in this order** (proposed, 8.2):

1. **Operation endings** (owner: the ledger's row). R1, R2, R9, R14, R15, R16; W2, W7. Small, and everything
   later owes rows, so the row's final shape (`input`, `refusal`) lands first.
2. **Entries and read slots** (owner: the entry table). R3 to R8, R10, R11. The large one.
3. **Placements and release** (owners: `placements.ts#decide`, the release table). R12, R13 and the placement
   table. Needs 2 and the fragments concept's placement path.
4. **Persisted resources** (owner: the entry record's restore). R17. Needs 2 and the saved-records concept.

**Risk and spike.** The risk is the entry table: join, trailing and ordering interact, and the three positions
are this design's guess at the smallest state that decides them. It was not run. Spike it before Task 2's
fixtures: write `entryCell(state, cue)` as a pure function in a scratchpad with a fake server that holds a
version per key and answers in any order, and run random sequences against two oracles, R5 (calls received)
and R6 (versions never decrease). If a rule needs a fourth fact, the table changes before any production
code. The model's sequence generator becomes the production test's.

Second risk: the publish order (W2). Settle it in Task 1's first commit with the two-key test.

## 6. Testing strategy

- **Sequence generator** (new, in `tests/generated`): actors (1 to 3) by keys (1 to 3) by the entry table's
  cues, with the fake server settling in any order. Oracles are R3 to R8, I1 and I2, read from what the fake
  server received and from its versions, never from the runtime's own reports (T21's stated false pass).
- **Dimensions earlier reviews missed**, each a named column of the generator:
  - several keys of one operation (W1) and several actors on one entry;
  - non-default starts: an entry restored stale, a slot whose entry was cleared, a row read back Kept;
  - sequences over time: invalidate between start and settle, a poll faster than the server;
  - restore after a definition edit: a refusing handler fixed, an `output` Schema changed, an operation gone;
  - hostile fakes: never settles, ignores abort, wrong shape, throws synchronously, settles after collection.
- **Table tests:** `entry-cells` and the release table are total by type, like `cells.ts`; each cell has one
  Story-level example, and the generator asserts the Impossible cells unreachable.
- **Planted faults:** an issue cleared by another key's ending; a refusal kept after its row closes; a join
  when the request is behind; a behind result that lands; two calls for one entry; no interrupt at the last
  hold or at disposal; `ReleaseOverdue` raised early or kept after the call ends; a lookup input unchecked; a
  timeout mapped as a failure.
- **The guard that keeps the freedom away:** `IssueSource.Operation` does not fit `StoredIssue` (a type test),
  and R2's run rule compares every published snapshot's issues with `issuesOf` recomputed from inspection's
  rows, entries, placements and releasing calls. A stored copy must diverge to matter, and then it fails.
- **Bench:** a fresh lookup (no call); a settle fanning out to 1,000 waiters; `issuesOf` with no refused row
  (memoised on the rows array, so a publish pays one comparison); 10,000 entries collected; the lane
  table's current numbers unchanged.

## 7. Handoff for the Opus leads

**Task 1, operation endings.**

- Read first: `serve.ts:36-70`, `:180-200`, `:270-285`; `ledger.ts#refused`, `#start`; `contract.ts#Ending`;
  section 3.1.
- Decided: `Refusal` on the row; `Heard`'s Refused carries it; `issuesOf`.
- Settle before code: 8.1, 8.3, 8.4, 8.5; the publish order.
- First commit: the two-key test, the cancel test and the lookup-input test, inverted (T21's routed comments
  ask for exactly this).

**Task 2, entries and slots.**

- Read first: `lanes.ts#lookup`, `answers.ts#settledRead`, `driver.ts:215-230`, `cells.ts` for the table's
  shape; section 3.2; @plan.Operations.O2.
- Decided: one entry table; positions from the runtime's mint; calls under the Runtime's Owner.
- Settle before code: the spike's result; whether `setData`'s data is stale (data layer).
- First commit: the generator with the fake server's oracles, red on today's unshared reads.

**Task 3, placements and release.**

- Read first: `disposal.ts:85-107`, `close.ts:181-260`, `owners.ts#cancel`; sections 3.3 and 3.4.
- Decided: a `Checked` select; the release table.
- Settle before code: the placement path (fragments); 8.6.
- First commit: the abort-ignoring fake's three-point test (before the bound, after it, after the end).

**Task 4, persisted resources.**

- Read first: `record.ts`, `persist.ts`; @plan.Persistence.O4; T21's comment of 2026-11-16T14:34.
- Decided: restores stale; undecodable starts missing.
- Settle before code: who owns the entry record kind and its format (saved records or data layer); 8.7.
- First commit: the reload and `output`-edit Stories, red.

Every Task: fixtures first. T21's fixture list stays whole, divided by which Task unlocks each row.

## 8. Proposed decisions

Each has two traces: the sequence under the alternative, then under the proposal.

1. **Operation issues are views of rows, entries, placements and releasing calls.** [open: 2026-11-21; recommend as proposed]
   Stored: A's `pay` ending is refused twice (Kept, A blocked); B's `pay` success is accepted; the snapshot
   shows no issue while A is blocked. Derived: the issue is A's row's refusal, shown until A's row closes.
2. **Split T21 into four Tasks by owner** [open: 2026-11-21; recommend as proposed] (reverses the 2026-11-20 breakdown note "not split").
   One Task: four tables under one review, and the issue fix waits on entries. Four: the row's shape lands
   first and each table has its own review. The note's reason, shared lane state, does not hold (section 2).
3. **An invalid lookup input ends the read as `Defect`; it does not refuse the turn.** [open: 2026-11-21; recommend as proposed]
   Refuse: the handler's memory update is lost with the turn, unlike a commit's `Unencodable` decline. End:
   the turn commits, the machine hears its `Defect` mapping and leaves its loading state.
4. **A `Cause.TimeoutError` from a write is unknown, and a type error in its `E`.** [open: 2026-11-21; recommend as proposed]
   Without: `Effect.timeout` types as the tag `TimeoutError`, the author maps it under `failure`, the user
   retries and pays twice. With: the type error points at `Outcome.unknown`; a stray one holds the lane.
5. **Mappers take one record `{ value, input, key, attempt }`** [open: 2026-11-21; recommend as proposed] (T21's acceptance), not
   `(value, { input, key })` (@plan.Operations.O2's text). Record: `E.Paid.from(({ value, input }) => ...)`.
   Pair: `E.Paid.from((value, { input }) => ...)`. The sources disagree; the typed-machine concept owns it.
6. **`ReleaseOverdue` covers every interrupted read call now and sessions later, not a write's Cancelling
   head.** Covering writes: a cancelled commit that ignores abort raises it while its lane already shows
   pending. Not covering: one signal per fact; the lane row is the write's.
7. **`persist: true` requires `output`.** [open: 2026-11-21; recommend as proposed] Without: entry data is saved by structural guess and restored
   unchecked. With: a compile error names the missing Schema, and restore decodes at the boundary.

Mine to make, reported here: calls run under the Runtime's Owner; `refusal` is not saved; an operation
issue's source carries key and attempt; `Bound<"read">` drops `concurrency`.

## Sidecar log

Five Haiku sidecars were asked at effort high. The host refused two at its concurrency limit (fixtures and
tests; prior art), so those angles are my own reading and are thinner: no survey of TanStack Query or
`codebases/ui-sdk` was made, and Effect's `timeoutOrElse` and `retry` were checked only for existence.

| Finding                                                | Result                     | Why                                  |
| ------------------------------------------------------ | -------------------------- | ------------------------------------ |
| History: `ReleaseOverdue` moved T57, T109, T21         | accepted                   | T21's comments confirm T21           |
| History: per-read state in three places (P4.task:3484) | accepted, unread at source | slot and entry replace it            |
| History: restored resource data owed here              | accepted                   | T21's comment of 2026-11-16          |
| Host: no call timeout anywhere                         | accepted                   | the user's decision; 3.5             |
| Host: `Command.Interrupt` misses child-Owner reads     | rejected                   | `owners.ts:293` recurses             |
| Host: reads and commits under different Owners         | changed                    | no bug today; wrong once shared (W4) |
| Host: a call's value is not decoded                    | accepted                   | W8                                   |
| Host: `owners.ts` parallels Scope and FiberMap         | not used                   | outside this concept                 |
| Plans: timeout decision, Operations.plan:162-164       | accepted                   | read at source                       |
| Plans: mapper shape `(value, { input, key })`          | accepted                   | read at source; conflicts (8.5)      |
| Plans: Persistence still names `OpRenamed`             | not verified               | passed to saved records              |
| Adversary: a shared request dies with its first actor  | accepted                   | W4                                   |
| Adversary: disposal interrupts no Runtime-owned read   | accepted                   | the Disposal row; R11                |
| Adversary: trailing start and stale settle unspecified | accepted                   | the Settled cells say both           |
| Adversary: a settle after the entry is collected       | accepted                   | the release table hears it           |
| Adversary: the ledger never publishes, so issues lag   | accepted                   | W2                                   |
| Adversary: a Kept row loses its issue over a restart   | changed                    | its start's try rewrites it          |
| Adversary: a retry changes the Attempt and re-raises   | rejected                   | a retry re-sends the same Attempt    |
