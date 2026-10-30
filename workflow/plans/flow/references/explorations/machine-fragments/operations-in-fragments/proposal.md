# Proposal: operations owned by fragments

**Status: proposal. Nothing here is decided or accepted.** Written 2026-10-30 for the owner's idea: a trait or a
subroutine owns its operations completely, and exposes only what it chooses through its existing ports. It is
optional, it starts with traits, and it pays off when one feature is reused (a feed on five screens). This file
edits no plan and no other proposal. No type spike was built; every code sample is a working draft and was not
type-checked.

It builds on [../machine-design.md](../machine-design.md) as it stands after merges 1, 2, 4, 5 and operations in the
definition (short name **MD**; decisions OD1–OD26 in [../merged/operations/decisions.md](../merged/operations/decisions.md)).
[exploration.md](exploration.md) (short name **EX**) is prior art: it was written before Runtime-owned lanes, lane
identity, parked endings and the delivery rules, and this proposal re-derives each of its problems instead of
revising it (section 6 says which ones OD19–OD22 removed). Streams use merge 6's syntax
([../merge-6-streams/proposal.md](../merge-6-streams/proposal.md), **M6**, accepted, not yet merged).

Marks in code: `// NEW` (a word that does not exist), `// NEW MEANING` (an existing word in a new place),
`// RENAMED`, `// existing`, `// user-defined`. **This proposal adds no new word**; it gives six existing words a new
place (3.6). A line with no mark uses only words marked earlier in the same block, or user-defined names.

Rules proposed here are numbered **FO0–FO10** ("fragment operations"), to keep them apart from EX's F1–F10.

## 0. In short

- **The design in one sentence.** A fragment declares `operations` exactly as a definition does and is the only
  thing that may act on them; its write lanes stay the Runtime's lanes, identified as today by (actor identity,
  contract id, key), and their endings are delivered to whichever incarnation is alive at the operation's placement,
  or parked on the lane record until one is (OD19–OD22, one level down).
- **New words: none.** Six existing words get a new place: `operations` and `O` in a fragment, `activities` in a
  trait body, `Fragment.O` read from outside (only `get`, `idle`, `retryable`), `s.operations.<instance>.<name>`,
  and `fixtures`, `.enter`, `.leave` on fragment Stories.
- **What it drops from EX:** the orphan route (`whenOrphaned`, the widened contract `orphaned`, `UnreconciledOrphan`),
  `.public()`, the `.resumable()` ban, the subroutine `start` hook, placement-owned lane identity, incarnation
  counters for every placement, and EX's rule-15 clause.
- **v1 scope (recommended, Q4):** a fragment may own writes that map endings only where its incarnations are about
  one thing: a root trait, an `.each` copy, or a `.resumable()` trait, without `resetOn`. Reads, streams and bare
  writes may be owned anywhere. Subroutines that own writes (the checkout in 4.3) are phase 2.
- **Honest judgement.** A first use is not smaller than the host-only form; every further host is about 50–75 % smaller
  (4.5). The gain is that the reconcile policy is written and tested once, and a host cannot misroute an `unknown`.
  The cost is that a write which outlives its fragment is handled only when the fragment comes back (4.3, 7).

## 1. The problem and the requirements

### 1.1 Where the data comes from

Start at the wire. Nothing in the first five rows changes; the rest says who now holds what.

| Value | Real source | Written in | Changes here |
| --- | --- | --- | --- |
| Request, response, status, body | `fetch`, XHR, `WebSocket`, an SDK (Stripe.js, a socket client) | an Effect service (`DocsApi`, `StripeApi`, `ChatSocket`, `IssuesApi`) whose Layer is the swap point (OD11) | no |
| Cancel | `AbortController`: Flow interrupts the commit's fiber, which aborts the `signal` the adapter passed to `fetch` | the contract's function | no |
| Idempotency key | `attempt.id`, minted by Flow, put on the wire by the commit author (rule 19) | the contract | no |
| Classification | `Outcome.success / failure / unknown` beside the status it reads | the contract (2.7.1) | no |
| Which server thing | the contract's `key`, a list of `input` fields (OD4, OD15) | the contract | no |
| Which event an ending becomes | the operation's `outcomes` | **the fragment's declaration** | moved from the host |
| The input of one commit | the commit's select over the after memory and event (rule 22) | **the fragment's transition** | moved from the host |
| The write lane (`pending`, `uncertain`, `waiting`, `retryCount`) | the Runtime, per (actor identity, contract id, key) | unchanged; read with `Fragment.O.x.get(s, k)` | **identity unchanged**; binding moves from the actor to the incarnation (2.4) |
| A read's or a stream's lane | the incarnation that placed or looked it up | `s.operations.<instance>.<name>` | scoped to the incarnation (FO4) |
| Shared record data | the store (merge 4) | `Issue.get(s, key, shape)` | no |
| What the host learns | the fragment's callbacks and exits, payloads it shapes | the host's filling | as today |

### 1.2 When a fragment should own I/O

A fragment should own an operation when **all** of these hold:

1. **The policy is the feature.** What the fragment does with endings (coalesce edits, re-send an unknown with a
   budget, catch up after a gap, roll a like back) is the reusable thing, and it is used in two or more hosts.
2. **The facts are its own.** The workflow facts the endings produce (a doc's etag, a feed's watermark) live and die
   with the fragment, and the host needs only a few of them, as callbacks, exits or public memory.
3. **Its incarnations are about one thing** (FO0): the actor, a copy's key, or one resumable life. Then a write that
   outlives an incarnation reaches the right next one.
4. **The host does not need a late result at once.** If the host must react to an ending wherever the user has gone
   (a payment that lands after Back must move the user to the receipt), the host owns that operation.

It should not when any fails: a screen used once (the host form is smaller, 4.5); a saga that decides across steps;
membership driven by bulk work (MD 2.7.13's per-key fan-out limit); host data that many writes share.

### 1.3 What must hold

| # | Requirement | Source | Answered by |
| --- | --- | --- | --- |
| Q-a | **One write in flight per server thing per actor identity**, whichever fragment writes it | D9, rule 21 | FO3 |
| Q-b | **A sent Attempt's ending is always delivered**, to something that can act on it | OD5 principle 2, rule 17 | FO5, FO6 |
| Q-c | **Every hold has an owner**, checkable from the fragment and the host's summaries | OD6, rule 45 | FO7, FO8 |
| Q-d | **The host cannot reach inside**, and no operation has two owners | rule 4; EX R5 ("the split") | FO2 |
| Q-e | **A lane survives its fragment and its actor**, with no orphan route | OD19 | FO5 |
| Q-f | **Lane records decode without the machine**, so a version change cannot lose them | rule 46, OD22 | FO3 (no instance path in identity) |
| Q-g | **A host is checked against its fragments' summaries only** | rule 10 | FO9 |
| Q-h | **One graph, one Runtime, one lane space**: no hidden second machine, no second lane store | MD 1, T1 | FO3, FO5 |
| Q-i | **A fragment's I/O is tested alone**, against a fixture | rule 11, principle 10 | FO10 |
| Q-j | **Optional**: a fragment without `operations` costs nothing | owner | FO1 |

The rest of section 1 states each area's question; section 2 answers it.

- **Lane identity per fragment instance.** A trait on a state node is a new incarnation on every entry; `.each`
  copies are one incarnation per key; a subroutine is fresh on every entry. Is the lane per instance, per
  incarnation, or per thing? If per instance or incarnation, two placements of one autosave over one document send
  two saves at once (Q-a fails), and a reload cannot find the lane without the machine's shape (Q-f fails).
- **Lifecycle.** The incarnation that committed can end while its write is on the wire or held: its node is left,
  its copy removed, the subroutine exits or is abandoned, the trait is frozen or reset, the actor is disposed. Where
  does the ending go, and who owns the hold?
- **Persistence and rebind.** What does a lane record need to name so that a restored actor, or a fresh one of the
  same identity, delivers each parked ending to the right fragment?
- **Delivery to the fragment or the host.** The host cannot handle a fragment's events (rule 4). Does a late ending
  go to the host, the fragment, or nowhere?
- **Static analysis and the single graph.** What does a fragment's summary record so that `flow check` can verify
  a host without the fragment's body, and `flow graph` can draw the I/O?
- **Stories.** A fragment Story has no services today (merge 3 says "because fragments have no I/O").
- **`flow check`.** `UnresolvedHold` (rule 45) and rule 20's adopted endings (OD22) are computed over an
  operation's arrival set; what is the arrival set of a fragment's operation, and what does the host add?

## 2. The design

### 2.1 Thinking about the whole system first

Before any rule, what each choice does to the rest of Flow:

1. **Keep one lane space.** The Runtime's write lanes, their table (2.7.13), persistence (rule 46), parked endings
   (OD22), `runtime.unsettledWrites()`, Inspection and SSR all key by (actor identity, contract id, key). Adding the
   instance path or an incarnation to that identity would change every one of them, would let two placements write
   one thing at once, and would make a lane record depend on the machine's shape. So identity does not change (FO3).
2. **Generalize binding, not identity.** Today a lane is bound to an actor; disposal unbinds it and the next
   incarnation of the identity rebinds it (OD19–OD21). A fragment's incarnation ending is the same event one level
   down. So "binding actor" becomes "binding incarnation", and every row of the table that mentions binding reads
   the same (2.4). This is the whole Runtime change.
3. **Keep one owner per operation.** The host never maps, starts, re-sends or cancels a fragment's operation, and
   the fragment never touches the host's. So the split EX's R5 warned about cannot be written, and the
   `unknown`-misrouting bug (MD 1: "a host handler can still start a new write from an `uncertain` event") cannot be
   written in a host that uses the fragment.
4. **Reads are not writes.** Reads change nothing on the server, are not persisted (rule 42) and are released by
   leaving (M6 rule 44). So a fragment's reads simply live and die with its incarnation (FO4). Only writes need the
   lifecycle machinery.
5. **The cost lands on readability of the host.** A host that places an autosave no longer shows its I/O states.
   `flow graph`, `flow explain` and Inspection must draw them from the summary (FO9). This is the price of reuse,
   stated, not hidden.
6. **Types.** A fragment's `operations: ({ E }) => …` has the definition's typing risk (MD 2.7.16: `E` first). A
   fragment's handles must be branded with their declaring fragment, so a host's `actions` reject them. Not spiked.

### 2.2 The rules (proposed)

**FO0. Scope in v1** (owner question Q4). A fragment may own a write operation that maps anything only if its
placement's incarnations are about one thing: a trait at the root of its definition (or at the root of such a
trait), an `.each` copy (the thing is the copy's key), or a `.resumable()` trait; and the placement has no
`resetOn`. Elsewhere (a non-resumable trait on a state node, a subroutine) a fragment may own reads, streams and
bare writes (a bare write delivers nothing, rule 40). A violation is a construction error (rule 12). Phase 2 lifts
the restriction under FO5–FO8 unchanged (Q7).

**FO1. A fragment may declare `operations`.** Same shape and meaning as a definition's (rules 13, 39–43, 47), in the
declaration after `memory` and `traits` (MD 2.6's key order already lists it). Its endings map onto the fragment's own
`internalEvents`, which now come from its schedules or its operations' endings (amends rule 2). It still reads no
context and sends to no actor. A fragment that registers a domain write registers the domain for its actor, so
`Entity.get` reads its records. A fragment without `operations` is unchanged (amends rule 3 and 2.2.2's last sentence).

**FO2. Only the fragment acts; anyone may read.** Members that start, re-send, stop or re-request work (`commit`,
`lookup`, `subscribe`, `retry`, `cancel`, `refetch`) exist only in the declaring fragment's body; written anywhere
else they are a type error and a construction error. The fragment exports its handles as `Fragment.O`, as a
definition exports `O`. Outside it, only reads exist: `Fragment.O.x.get(s, k?)` in views, and `get`, `idle` and
`retryable` in the host's guards and `updateMemory`. Its rows appear under its instance, as its schedules do:
`s.operations.<instance>.<name>`, `undefined` while the incarnation is inactive, a keyed list of copies under `.each`
(rule N1). A write row listed there shows the lanes this incarnation has an Attempt or a parked ending in; `get` is
total and Runtime-wide for the actor, so a lane is readable even when no incarnation lists it (amends rule 4).

**FO3. Lane identity is unchanged; one write operation per write contract per actor.** A write lane is (actor
identity, contract id, key), as rule 21 says. `SharedContract` (rule 40) now counts every write operation of the
definition **and of every fragment placement in its tree**; a fragment placed once counts once, with or without
`.each`. So every lane has exactly one operation, one mapping and one placement, all found by contract id after a
rebind or a reload, as `writes` is (OD26). An Attempt committed in an `.each` copy also records that copy's key.
Reads and streams stay exempt. A trait that owns a write is placed once per actor: on a node that covers every place
it is needed, or with `.each`.

**FO4. Reads live and die with the incarnation.** A fragment's one-off read lane is (actor, operation, incarnation);
its live placements are the incarnation's, and an `activities` list in a trait body is placed for the incarnation's
life, switched by `when`. Ending the incarnation releases them, exactly as leaving a state releases a state's
(rule 42, M6 rule 44): nothing is delivered afterwards.

**FO5. Writes outlive the incarnation; their endings go to the placement.** A write lane's **binding incarnation**
is the live incarnation at its operation's placement (with the Attempt's copy key under `.each`); for a host
operation it is the actor, as before. At admission, rule 14's one owner test runs inside the binding incarnation:
the owner activation alive → current; an ended activation of this incarnation → late, from its nearest surviving
ancestor inside the fragment (rule 15 applies inside); never an activation of this incarnation (a reset, a re-entry,
a re-added copy, a rebind) → current, from the incarnation's active leaf. With no binding incarnation (its node was
left, its copy removed, the subroutine ended, the trait frozen), the ending's lane effects and store effects apply
as today (rule 27), and the ending is **parked raw on its lane record** (OD22) for that placement and copy key.

**FO6. A starting incarnation adopts its placement's lanes.** When an incarnation starts at a placement (an entry, a
re-added copy key, a thaw, or the actor's own rebind or restore), it receives, as follow-up turns at the head of the
mailbox right after the turn that started it (after any pending reset, rule 1) and before any other event addressed
to it: the placement's parked endings in saved order, mapped through the current `outcomes`; then, per lane in
creation order, a held head's `unknown { Restored }` exactly once; then an in-flight Attempt's ending when it lands.
A thaw is the same incarnation, which saw its holds: it receives its parked endings only. This is rule 44 one level
down.

**FO7. Adopted endings are handled inside the fragment.** Rule 20's adopted endings (OD22) and rule 45's
`UnresolvedHold` (2.7.14) run on the fragment's body alone, over the fragment's **new-incarnation arrival set**: for a
trait, its own `on`; for a subroutine, its default leaf and every leaf reachable from it, with 2.7.14's stopping rules.
So a fragment that owns a holding write handles its endings at its root and reads what it needs from the event,
which rule 44 already asks of a definition. A fragment exit taken on a branch that keeps a hold is a branch with no
reachable owner, reported by the same check.

**FO8. A host that ends a holding placement must be able to start it again.** At the host, `UnresolvedHold` gains
one kind of arrival: every host transition that can end the incarnation at a placement whose summary lists a holding
write (it exits the placement's node or a frozen trait's node, abandons the subroutine, or writes the `.each` field).
The owner is the next incarnation there. Pass if a transition that starts one is reachable from the target; warning
otherwise, as for any owner that exists but cannot be reached (rule 45). Closures over-approximate, so a host that
writes an `.each` field anywhere passes; that gap is stated (Q6).

**FO9. Summaries carry operations.** A fragment's summary (rule 10) records, per operation: contract id, kind, the
verb used, concurrency, key fields, the events it maps, and whether it holds (a mapped write on `reject`, `latest` or
`serialize`). A host is checked against summaries only (FO3, FO8). Swapping a fragment for one with the same summary
still cannot break its host; a summary with a different operation is a different contract.

**FO10. Stories.** `story.machine(fragment, { id, fixtures })` provides services as it does for a machine (merge 3
names it `story.trait` / `story.subroutine`); `.leave()` and `.enter(input)` apply to traits as well as subroutines,
so a Story walks the gap and the adoption; `Story.ending(Autosave.O.save, …)` drives an ending (*Story reads:
merge 3*). The 33 lane cells stay in Flow's policy suite (2.7.13); the binding rows of 2.4 join it.

### 2.3 Lifecycle: where every piece goes

| What happens | Reads and streams | A write on the wire or waiting | A held unknown | Its ending, or the hold, is delivered to |
| --- | --- | --- | --- | --- |
| Root trait, actor alive | live | runs | held | the trait (current); never a gap |
| `resetOn` reset (phase 2 only, FO0) | released, re-placed for the new incarnation | runs | held | the new incarnation (FO5, "never an activation of this incarnation") and `unknown { Restored }` for each hold (FO6) |
| `.each` copy removed | released | runs (Runtime-owned) | held, unplaced | parked for the key; the next copy of that key adopts (FO6); never one: stays until the actor ends (7, Q6) |
| `.resumable()` trait frozen | released | runs | held | parked; delivered at thaw to the same incarnation, no `unknown { Restored }` (FO6) |
| Node-placed trait left (phase 2) | released | runs | held, unplaced | the node's next incarnation (FO6); `UnresolvedHold` warning at the host if the node cannot be re-entered (FO8) |
| Subroutine takes an exit (phase 2) | released | the fragment's own check: an exit on a hold-keeping branch is reported (FO7) | as left | as left |
| Subroutine abandoned (phase 2) | released | runs | held, unplaced | the next entry (FO6), checked by FO8 |
| Actor disposed | released | unchanged (OD19): the Runtime keeps it | unchanged | the identity's next incarnation's placement; parked for a persisted identity, evidence otherwise (OD21) |
| Rebind or restore | re-placed per state | the restored incarnation's placement receives it when it lands | `unknown { Restored }` once (2.7.13) | the placement's incarnation if it is active in the restored state, else parked there (FO5) |
| Runtime disposal, SSR | as MD | as MD (2.7.13's rows) | as MD | as MD; nothing new |

**Store and cache effects never wait.** A domain write's prediction, confirmation, rollback and marks apply at
settlement (rule 27), and a plain write's `writes` invalidations are on the operation (OD26), found by contract id. So
a like confirms or rolls back in every view even while its copy is gone; only the fragment's own reaction waits.

### 2.4 The write lane: the table applies unchanged

The lane's states (`Idle`, `InFlight`, `Held`, `W`), its 16 rows and both policy tables (2.7.13) apply unchanged:
nothing about what a member, an ending or a Runtime step does to a lane depends on who is bound. What changes is what
"bound" means. Delta, in the table's terms:

| Row | Before (MD 2.7.13) | After (proposed) |
| --- | --- | --- |
| **dispose** | the binding actor ends | the binding **incarnation** ends: the actor is disposed, or the fragment incarnation at the operation's placement ends (its node left, its copy removed, the subroutine ended). Cells unchanged: `InFlight` keeps running, `Held` keeps its hold and `W` |
| **freeze** (new row, an instance of dispose) | — | a `.resumable()` trait is frozen: as dispose |
| **rebind** | an incarnation of the same identity starts | an incarnation starts **at the same placement and copy key** of the same identity (an entry, a re-added key, a reset, or the actor's own rebind). Cells unchanged: parked endings first, then the hold as `unknown { Restored }` once, `W` stays |
| **thaw** (new row) | — | the frozen incarnation resumes: parked endings are delivered; no `unknown { Restored }` (it saw the hold); `W` stays |
| **parking condition** | parked "if the identity has a saved record"; else evidence | also parked while the **actor is alive** and the placement has no incarnation. When the actor is disposed, the existing rule decides: kept for a persisted identity, evidence otherwise (OD21) |
| **delivery order** | before any external event of a new actor incarnation | before any event addressed to the new fragment incarnation, as follow-up turns after its starting turn (FO6) |

Every other row (commit, retry, cancel, idle, retryable, invoked, storage refused, success, failure, unknown,
interrupt, restore, Runtime disposal, SSR hydration) is unchanged. The `cancel`/`allow` table's `HeldThisTurn` and
the parked `Held` state (OD25) apply to a fragment's lane as they are: "no live actor" reads "no binding incarnation".

### 2.5 Persistence and rebind

- **A lane record names no instance path.** Identity is (actor identity, contract id, key) and the operation is found
  by contract id (FO3), so renaming an instance, moving a trait to another node or into another fragment changes
  nothing persisted, as renaming an operation already does (2.7.15).
- **An Attempt committed in an `.each` copy carries the copy's key** (a string, host data, decodable without the
  machine). This brings back, for fragment-owned commits only, the copy key that C20 deleted for host operations.
- **Parked endings of an unplaced placement** are already on the lane record (OD22); a lane holding only a parked
  ending is non-`Idle`, so it is captured, listed by `runtime.unsettledWrites()` and by Inspection.
- **A version that removes the fragment's operation** sends the lane to `orphaned` (P19), as for a removed host
  operation. A version that changes a placement between single and `.each`, so the Attempt's copy key no longer fits,
  does the same (stated).

### 2.6 Static analysis, the single graph, `flow check`

- **One graph.** A fragment's operations are nodes under its placement in the actor's graph. `flow graph` draws them
  from the summary; `flow explain` prints `docs  SaveDue → commits save (docs/save, reject, one lane per docId)`.
  Inspection lists every lane by identity with its operation path, and marks a lane with no binding incarnation
  **unplaced** (a concept beside "unbound", not a word in the API).
- **`flow check` adds no finding name.** `SharedContract` widens (FO3). `UnresolvedHold` and rule 20's adopted-ending
  check run inside each fragment (FO7) and gain the placement arrival at the host (FO8). `VerbMismatch`,
  `DuplicatePlacement`, `KeyRequired`, `KeyOmitsInput` and rule 20's `NotSent` list apply inside fragments unchanged.
  An acting member of a fragment used outside it, and an FO0 violation, are construction errors (rule 12).
- **Typing.** `Fragment.O` is typed from the declaration, like a definition's `O`. Key-less members in an ending's
  handler (OD8) are typed per fragment. A fragment's members are branded with the fragment, so a host's `actions`
  list rejects them.

### 2.7 Keywords

| Word | Status |
| --- | --- |
| `operations` in a trait or subroutine declaration | existing key, **NEW MEANING** (FO1) |
| `O` in a fragment body | existing, **NEW MEANING**: this fragment's handles |
| `Fragment.O` (`Autosave.O.save.get`, `.idle`, `.retryable`) outside the fragment | existing, **NEW MEANING**: reads only (FO2) |
| `activities` in a trait body | existing, **NEW MEANING**: placed for the incarnation's life (FO4) |
| `s.operations.<instance>.<name>` | existing path pattern (`s.schedules.<instance>.<name>`), **NEW MEANING** |
| `fixtures`, `.enter`, `.leave` on a fragment Story | existing, **NEW MEANING** (FO10) |
| `internalEvents` | existing; also an operation's endings in a fragment (FO1) |
| `outcomes`, `commit`, `lookup`, `subscribe`, `retry`, `cancel`, `idle`, `retryable`, `get`, `refetch`, `Flow.uncertain`, `.each`, `.resumable()`, `whenAbandoned`, `SharedContract`, `UnresolvedHold` | existing, unchanged |
| binding incarnation, unplaced lane, placement adoption | concepts, not words |

**Added:** FO0–FO10; the copy key on an `.each` copy's Attempt; the dispose, freeze, rebind and thaw readings of
2.4. **Dropped (from EX):** `whenOrphaned`, the `orphaned({ attempt, ending })` widening, `UnreconciledOrphan`,
`ExitWithCallInFlight`, `NoCancelPath`, `SharedRecord`, `.public()`, the `.resumable()` ban (EX F8), `start` on
subroutines (EX F10), lanes identified by placement (EX F3), incarnation counters for every placement, EX's
rule-15 clause; **from MD:** rule 3's blanket ban, 2.2.2's "Fragments may not declare operations, activities",
section 6's "Fragment I/O" bullet.

## 3. Why these and not the alternatives

| Choice | Taken | Rejected, and why |
| --- | --- | --- |
| Lane identity | unchanged (FO3) | **placement in the identity** (EX F3): two placements of one thing send two writes at once (D9 broken); lane records depend on the machine's shape (rule 46); a moved trait orphans its lanes |
| Late endings | the placement's next incarnation (FO5, FO6) | **a host port** (EX `whenOrphaned`, IM's `onOrphaned`): the host gets an ending it cannot act on (no `O`), wiring returns, and ownership splits. **Evidence** (TanStack Query's component callbacks after unmount): loses a success the next incarnation needs (a payment, an etag); OD21 already chose parking for the actor. **A lingering tail incarnation** (EX option C): a hidden second machine with no timers |
| Holds after the fragment ends | stay held, owned by the next incarnation (FO6), checked (FO8) | **release on leave**: a quiet release (OD6 forbids). **Keep the copy alive while it holds**: hidden membership, the draining the operations merge rejected (Q6) |
| Row visibility | readable, like schedules (FO2) | **private unless `.public()`**: a new word; rows are status, never wiring, and the host still cannot act |
| Entry work in a subroutine | a `Flow.entry` schedule or a user event | **`start`** (EX F10): a new word; none of the four cases needs it |
| Frozen traits | parked, delivered at thaw (2.4) | **banned** (EX F8): was needed only because nothing could hold an ending; OD22's parked endings do |

## 4. Before and after

Each case shows its contracts once (shared, not counted), then the host-only form ("before", MD's style, every
operation on the host) and the fragment form ("after"), each with definition, machine and fragment in full. Line
totals are in 4.5.

### 4.1 Autosave, used by several documents (`.each`)

Behaviour: edits are debounced 800 ms; one save per document in flight; edits during a save are coalesced and the
newest body goes next with the etag the save returned (a queued `latest` commit would carry a stale etag, so the
contract is `reject` and the fragment coalesces); a 412 is a conflict the user resolves with "keep mine"; an unknown
is re-sent as the same write every 2 s, three times, then released. Closing a document is refused while it is dirty
or its save is unresolved.

Where the data comes from: the picker loads a document with `GET /docs/:id` (a `docs/get` resource, the same in both
forms) and sends `Open` with its body and etag; `DocsApi.put` wraps `fetch("PUT /docs/:id", { headers: { "If-Match",
"Idempotency-Key": attempt.id }, signal })`.

```ts
// docs.contracts.ts (shared by both forms; not counted)
import { Context, Effect, Schema } from "effect"
import { Outcome, transaction } from "flow-state"

export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", { serverEtag: Schema.String }) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

export class DocsApi extends Context.Service<DocsApi, {                             // user-defined: wraps fetch; Stories fake it
  put(p: { docId: string; body: string; ifMatch: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; etag: string }, NoResponse>
}>()("docs/DocsApi") {}

export const saveDoc = transaction({                                                 // existing
  id: "docs/save",
  input: { docId: Schema.String, body: Schema.String, etag: Schema.String },         // existing (OD12, OD14)
  output: { etag: Schema.String },
  key: ["docId"],                                                                    // existing (OD4, OD15): one lane per document
  concurrency: "reject",                                                             // the caller coalesces
  commit: (input, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* DocsApi.use((api) => api.put({ docId: input.docId, body: input.body, ifMatch: input.etag }, { idempotencyKey: attempt.id, signal })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status === 200) return { etag: res.etag }
    if (res.status === 412) return yield* Outcome.failure(new Conflict({ serverEtag: res.etag }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Refused({ status: res.status }))
  }),
})
```

**Before: the host owns the save** (MD 2.7.10's keyed schedules and 2.7.5's reconcile keys).

```ts
// workspace.definition.ts (before)
import { definition, Flow } from "flow-state"                                        // existing
import { Schema } from "effect"
import { saveDoc } from "./docs.contracts"

export const MAX_RESENDS = 3                                                          // user-defined
const Status = Schema.Literals(["clean", "dirty", "saving", "unsure", "conflict", "stalled"])
const Doc = Schema.Struct({                                                           // user-defined: one open document and its save state
  docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String,
  status: Status, rev: Schema.Int, sentRev: Schema.Int, serverEtag: Schema.NullOr(Schema.String),
})

export const Workspace = definition({                                                // existing
  id: "Docs/Workspace",
  states: ["READY"],
  events: {
    Open: { docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String },
    Edited: { docId: Schema.String, body: Schema.String },
    Close: { docId: Schema.String },
    KeepMine: { docId: Schema.String },
  },
  internalEvents: {                                                                   // existing
    SaveDue: { docId: Schema.String }, ResendDue: { docId: Schema.String },
    Saved: { docId: Schema.String, etag: Schema.String },
    Conflict: { docId: Schema.String, serverEtag: Schema.String },
    Refused: { docId: Schema.String },
    SaveUnsure: Flow.uncertain({ docId: Schema.String }),                             // existing: Flow.uncertain
  },
  memory: { open: Flow.initial(Schema.Array(Doc), []) },                              // existing: Flow.initial
  operations: ({ E }) => ({                                                           // existing
    save: saveDoc.outcomes({                                                          // existing: outcomes
      success: E.Saved.from((v, { key }) => ({ docId: key.docId, etag: v.etag })),   // existing: the mapper's key
      failure: {
        Conflict: E.Conflict.from((r, { key }) => ({ docId: key.docId, serverEtag: r.serverEtag })),
        Refused: E.Refused.from((_r, { key }) => ({ docId: key.docId })),
        NotSent: E.Refused.from((_r, { key }) => ({ docId: key.docId })),
      },
      unknown: E.SaveUnsure.from((_r, { key }) => ({ docId: key.docId })),
    }),
  }),
})
```

```ts
// workspace.machine.ts (before)
import { deny, machine } from "flow-state"                                           // existing
import { MAX_RESENDS, Workspace } from "./workspace.definition"

type Memory = typeof Workspace.Memory.Type
type Doc = Memory["open"][number]
const doc = (m: Memory, docId: string) => m.open.find((d) => d.docId === docId)      // user-defined helpers
const edit = (m: Memory, docId: string, f: (d: Doc) => Partial<Doc>) => ({ open: m.open.map((d) => (d.docId === docId ? { ...d, ...f(d) } : d)) })
const statusIs = (status: Doc["status"]) => ({ memory, event }: { memory: Memory; event: { docId: string } }) => doc(memory, event.docId)?.status === status || deny("WrongStatus")

export const WorkspaceMachine = machine(Workspace, ({ S, E, O }) => {                 // existing
  const named = ({ event }: { event: { docId: string } }) => event                    // the event carries the key's field (OD4)
  const send = O.save.commit(({ memory, event }) => { const d = doc(memory, event.docId)!; return { docId: d.docId, body: d.body, etag: d.etag } })   // existing: commit; after memory (rule 22)
  return {
    default: S.READY,
    schedules: {
      settle: {                                                                       // existing: keys, restartOn (rule 23)
        keys: ({ memory }) => memory.open.filter((d) => d.status === "dirty").map((d) => ({ docId: d.docId })),
        restartOn: ({ key, memory }) => doc(memory, key.docId)?.rev,
        schedule: "800 millis",
        send: E.SaveDue.from(({ key }) => ({ docId: key.docId })),
      },
      resend: {                                                                       // one timer per held lane, open or closed (2.7.5)
        keys: ({ operations }) => operations.save.filter((l) => l.uncertain).map((l) => l.key),
        schedule: "2 seconds",
        send: E.ResendDue.from(({ key }) => ({ docId: key.docId })),
      },
    },
    on: {
      Open: { target: "self", guard: ({ memory, event }) => doc(memory, event.docId) === undefined || deny("AlreadyOpen"), updateMemory: ({ memory, event }) => ({ open: [...memory.open, { ...event, status: "clean", rev: 0, sentRev: 0, serverEtag: null }] }) },
      Edited: { target: "self", guard: ({ memory, event }) => doc(memory, event.docId) !== undefined || deny("NotOpen"), updateMemory: ({ memory, event }) => edit(memory, event.docId, (d) => ({ body: event.body, rev: d.rev + 1, status: d.status === "clean" || d.status === "stalled" ? "dirty" : d.status })) },
      SaveDue: [
        { target: "self", guard: [statusIs("dirty"), O.save.idle(named)], updateMemory: ({ memory, event }) => edit(memory, event.docId, (d) => ({ status: "saving", sentRev: d.rev })), actions: [send] },   // existing: idle
        { target: "self" },
      ],
      Saved: [
        { target: "self", guard: ({ memory, event }) => { const d = doc(memory, event.docId); return (d !== undefined && d.rev > d.sentRev) || deny("NoNewEdits") }, updateMemory: ({ memory, event }) => edit(memory, event.docId, (d) => ({ etag: event.etag, sentRev: d.rev })), actions: [send] },
        { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ etag: event.etag, status: "clean" })) },   // a closed document: nothing to edit
      ],
      Conflict: { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ status: "conflict", serverEtag: event.serverEtag })) },
      Refused: { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ status: "stalled" })) },
      SaveUnsure: { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ status: "unsure" })) },
      ResendDue: [
        { target: "self", guard: [O.save.retryable(named, { times: MAX_RESENDS })], updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ status: "saving" })), actions: [O.save.retry(named)] },   // existing: retryable, retry
        { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, () => ({ status: "stalled" })), actions: [O.save.cancel(named)] },   // existing: cancel; give up, release (OD7)
      ],
      Close: { target: "self", guard: [O.save.idle(named), ({ memory, event }) => doc(memory, event.docId)?.status !== "dirty" || deny("Unsaved")], updateMemory: ({ memory, event }) => ({ open: memory.open.filter((d) => d.docId !== event.docId) }) },
      KeepMine: { target: "self", guard: [statusIs("conflict")], updateMemory: ({ memory, event }) => edit(memory, event.docId, (d) => ({ etag: d.serverEtag ?? d.etag, serverEtag: null, status: "dirty" })) },
    },
    states: { READY: {} },
  }
})
// view: useView(ws, (s) => Workspace.O.save.get(s, { docId }).pending)  and  send(Workspace.E.Edited({ docId, body }))
```

**After: the fragment.**

```ts
// autosave.trait.ts
import { deny, Flow, trait } from "flow-state"                                       // existing
import { Schema } from "effect"
import { saveDoc } from "./docs.contracts"

export const MAX_RESENDS = 3                                                          // user-defined

export const Autosave = trait(                                                        // existing: trait; user-defined: Autosave
  {
    id: "Autosave",
    events: { Edited: { body: Schema.String } },                                     // existing: events; the editor view sends it
    hostEvents: { Overwrite: {} },                                                   // existing: hostEvents; the host keeps this version after a conflict
    internalEvents: {                                                                // existing; NEW MEANING: also this fragment's operations' endings (FO1)
      SaveDue: {}, ResendDue: {},
      Saved: { etag: Schema.String }, Conflict: { serverEtag: Schema.String }, Refused: {},
      SaveUnsure: Flow.uncertain({}),                                                // existing: Flow.uncertain
    },
    callbacks: { onStalled: Flow.optional(Flow.Callback({})) },                     // existing: callbacks, Flow.optional, Flow.Callback
    memory: {
      docId: Flow.input(Schema.String), body: Flow.input(Schema.String), etag: Flow.input(Schema.String),   // existing: Flow.input
      status: Flow.initial(Schema.Literals(["clean", "dirty", "saving", "unsure", "conflict", "stalled"]), "clean"),
      serverEtag: Flow.initial(Schema.NullOr(Schema.String), null),
      rev: Flow.private(Flow.initial(Schema.Int, 0)),                                // existing: Flow.private; edits seen
      sentRev: Flow.private(Flow.initial(Schema.Int, 0)),                            // edits in the last commit
    },
    operations: ({ E }) => ({                                                        // existing key; NEW MEANING: in a fragment (FO1)
      save: saveDoc.outcomes({                                                       // existing: outcomes; user-defined: save
        success: E.Saved.from((v) => ({ etag: v.etag })),
        failure: { Conflict: E.Conflict.from((r) => ({ serverEtag: r.serverEtag })), Refused: E.Refused, NotSent: E.Refused },
        unknown: E.SaveUnsure,
      }),
    }),
  },
  ({ E, O, callbacks }) => {                                                         // NEW MEANING: O, this fragment's own handles (FO2)
    const own = ({ memory }: { memory: { docId: string } }) => ({ docId: memory.docId })   // user-defined: this document's lane
    const send = O.save.commit(({ memory }) => ({ docId: memory.docId, body: memory.body, etag: memory.etag }))   // existing: commit; after memory (rule 22)
    return {
      schedules: {
        settle: { schedule: "800 millis", armOn: [E.Edited, E.Overwrite], send: E.SaveDue },   // existing: armOn; a debounce
        resend: { schedule: "2 seconds", armOn: [E.SaveUnsure], send: E.ResendDue },
      },
      on: {
        Edited: { target: "self", updateMemory: ({ memory, event }) => ({ body: event.body, rev: memory.rev + 1, status: memory.status === "clean" || memory.status === "stalled" ? "dirty" : memory.status }) },
        SaveDue: [
          { target: "self", guard: [({ memory }) => memory.status === "dirty" || deny("NotDirty"), O.save.idle(own)], updateMemory: ({ memory }) => ({ status: "saving", sentRev: memory.rev }), actions: [send] },   // existing: idle
          { target: "self" },
        ],
        Saved: [                                                                     // current, or adopted by a reopened copy (FO6)
          { target: "self", guard: ({ memory }) => memory.rev > memory.sentRev || deny("NoNewEdits"), updateMemory: ({ memory, event }) => ({ etag: event.etag, sentRev: memory.rev }), actions: [send] },
          { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "clean" }) },
        ],
        Conflict: { target: "self", updateMemory: ({ event }) => ({ status: "conflict", serverEtag: event.serverEtag }) },
        Refused: { target: "self", updateMemory: () => ({ status: "stalled" }), notify: [callbacks.onStalled] },
        SaveUnsure: { target: "self", updateMemory: () => ({ status: "unsure" }) },  // Held; `resend` arms
        ResendDue: [
          { target: "self", guard: [O.save.retryable(own, { times: MAX_RESENDS })], updateMemory: () => ({ status: "saving" }), actions: [O.save.retry(own)] },   // existing: retryable, retry; the same Attempt
          { target: "self", updateMemory: () => ({ status: "stalled" }), actions: [O.save.cancel(own)], notify: [callbacks.onStalled] },   // existing: cancel; give up, release (OD7)
        ],
        Overwrite: { target: "self", updateMemory: ({ memory }) => ({ etag: memory.serverEtag ?? memory.etag, serverEtag: null, status: "dirty" }) },
      },
    }
  },
)
```

**After: the host** (it decides only when a document opens and closes, and what "keep mine" means).

```ts
// workspace.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Autosave } from "./autosave.trait"

const OpenDoc = Schema.Struct({ docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String })   // user-defined: what GET /docs/:id returned

export const Workspace = definition({
  id: "Docs/Workspace",
  states: ["READY"],
  events: {
    Open: { docId: Schema.String, title: Schema.String, body: Schema.String, etag: Schema.String },
    Close: { docId: Schema.String },
    KeepMine: { docId: Schema.String },
  },
  memory: { open: Flow.initial(Schema.Array(OpenDoc), []) },
  traits: { docs: Autosave.each({ of: "open", by: "docId", max: 20 }) },             // existing: .each, of, by, max; one copy per open document
})
```

```ts
// workspace.machine.ts (after)
import { deny, machine } from "flow-state"
import { Autosave } from "./autosave.trait"
import { Workspace } from "./workspace.definition"

type Memory = typeof Workspace.Memory.Type
const copy = (m: Memory, docId: string) => m.docs.find((d) => d.key === docId)       // user-defined: a copy's public memory (rule 9)

export const WorkspaceMachine = machine(Workspace, ({ S, E }) => ({
  default: S.READY,
  traits: { docs: { input: ({ item }) => ({ docId: item.docId, body: item.body, etag: item.etag }) } },   // existing: one filling for every copy; onStalled left out
  on: {
    Open: { target: "self", guard: ({ memory, event }) => !memory.open.some((d) => d.docId === event.docId) || deny("AlreadyOpen"), updateMemory: ({ memory, event }) => ({ open: [...memory.open, event] }) },
    Close: {
      target: "self",
      guard: [Autosave.O.save.idle(({ event }) => event), ({ memory, event }) => copy(memory, event.docId)?.status !== "dirty" || deny("Unsaved")],   // NEW MEANING: the host reads the fragment's lane (FO2)
      updateMemory: ({ memory, event }) => ({ open: memory.open.filter((d) => d.docId !== event.docId) }),
    },
    KeepMine: {
      target: "self",
      guard: ({ memory, event }) => copy(memory, event.docId)?.status === "conflict" || deny("NoConflict"),
      raise: [E.docs.Overwrite.from(({ event }) => ({ key: event.docId }))],         // existing: a raise into one copy
    },
  },
  states: { READY: {} },
}))
// view: useView(ws, (s) => Autosave.O.save.get(s, { docId }).pending)   // NEW MEANING: Fragment.O read from a view
//       send(Workspace.E.docs.key(docId).Edited({ body }))
```

**Added for the host:** nothing it must write about I/O; it may read `Autosave.O.save` (`idle`, `get`).
**Dropped from the host:** six internal events, the save operation, `status`/`rev`/`sentRev`/`serverEtag` per
document, both keyed schedules, eight handlers and the `doc`/`edit` helpers. **Changed behaviour:** in the host-only
form, a document closed after the user forced it (not possible here: `Close` is guarded) would keep being reconciled
by the `resend` keys over every lane; in the fragment form a closed document's held save waits for the copy to come
back (FO6). `Close` is guarded in both forms, so neither strands a save.

### 4.2 A live feed, placed on several screens

Behaviour (M6's chat room, its feed half): subscribe from the watermark; a gap starts a catch-up read page by page; a
dropped session backs off 1, 2, 4, 8, 16 s, five times, then goes offline until the host says reconnect; signing out
tells the host. Messages are public memory.

Where the data comes from: `Chat.messages` is M6 4.1.1's stream (a `WebSocket` opened by `Socket.makeWebSocket`,
`Session.reconnect` inside the contract), `Chat.since` its `fetch` page read; both imported unchanged from
`chat.contracts.ts` (M6 4.1.1). The feed owns only reads, so FO0 allows it on any node.

**Before: the host owns the feed** (M6's `Room`, without its post outbox).

```ts
// room.definition.ts (before)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Chat, Message } from "./chat.contracts"

const Position = Schema.Struct({ epoch: Schema.String, after: Schema.Number })        // user-defined: a resume position

export const Room = definition({
  id: "Chat/Room",
  states: [{ LIVE: ["SYNCED", "OWED"] }, "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Reconnect: {} },
  internalEvents: {
    Message: { message: Message },
    Missed: { epoch: Schema.NullOr(Schema.String) },
    CaughtUp: { epoch: Schema.String, messages: Schema.Array(Message), through: Schema.Number, complete: Schema.Boolean },
    CatchUpFailed: {}, ResyncTick: {}, FeedEnded: {}, FeedLost: {}, SignedOut: {}, RetryFeed: {},
  },
  memory: {
    roomId: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    at: Flow.initial(Position, { epoch: "", after: 0 }),
    feedTries: Flow.initial(Schema.Int, 0),
  },
  operations: ({ E }) => ({
    feed: Chat.messages.outcomes({                                                    // existing (M6): value, gap, complete, failure
      value: E.Message.from((m) => ({ message: m })),
      gap: { Reset: E.Missed.from((r) => ({ epoch: r.epoch })), Unproven: E.Missed.from(() => ({ epoch: null })) },
      complete: E.FeedEnded,
      failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
    }),
    catchUp: Chat.since.outcomes({
      success: E.CaughtUp.from((p) => p),
      failure: { ChatDown: E.CatchUpFailed, Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
    }),
  }),
})
```

```ts
// room.machine.ts (before)
import { deny, machine } from "flow-state"
import { Duration, Schedule } from "effect"
import type { Message } from "./chat.contracts"
import { Room } from "./room.definition"

type Memory = typeof Room.Memory.Type
type Page = { readonly epoch: string; readonly messages: ReadonlyArray<Message>; readonly through: number }
const merge = (m: Memory, xs: ReadonlyArray<Message>) => ({ messages: [...m.messages, ...xs.filter((x) => !m.messages.some((h) => h.epoch === x.epoch && h.seq === x.seq))] })
const advance = (m: Memory, x: Message) => ({ ...merge(m, [x]), at: { epoch: x.epoch, after: x.seq }, feedTries: 0 })
const paged = (m: Memory, p: Page) => ({ ...merge(m, p.messages), at: { epoch: p.epoch, after: p.through } })

export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const from = ({ memory }: { memory: Memory }) => ({ roomId: memory.roomId, epoch: memory.at.epoch, after: memory.at.after })
  const catchUp = O.catchUp.lookup(from)                                             // existing: lookup
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => paged(memory, event) },   // late, after LIVE was left
      CatchUpFailed: { target: "self" },
    },
    states: {
      LIVE: {
        default: S.LIVE.SYNCED,
        activities: [O.feed.subscribe(from)],                                        // existing: activities, subscribe
        on: {
          Missed: { target: S.LIVE.OWED, updateMemory: ({ memory, event }) => (event.epoch === null || event.epoch === memory.at.epoch ? {} : { at: { epoch: event.epoch, after: 0 } }), actions: [catchUp] },
          SignedOut: S.SIGNED_OUT,
          FeedEnded: S.LOST,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
        },
        states: {
          SYNCED: { on: { Message: { target: "self", updateMemory: ({ memory, event }) => advance(memory, event.message) } } },
          OWED: {
            schedules: { resync: { schedule: Schedule.spaced("5 seconds"), send: E.ResyncTick } },
            on: {
              Message: { target: "self", updateMemory: ({ memory, event }) => merge(memory, [event.message]) },
              CaughtUp: [
                { target: S.LIVE.SYNCED, guard: ({ event }) => event.complete || deny("MorePages"), updateMemory: ({ memory, event }) => paged(memory, event) },
                { target: "self", updateMemory: ({ memory, event }) => paged(memory, event), actions: [catchUp] },
              ],
              ResyncTick: [{ target: "self", guard: [O.catchUp.idle], actions: [catchUp] }, { target: "self" }],
            },
          },
        },
      },
      LOST: {
        schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
        on: { RetryFeed: S.LIVE },
      },
      SIGNED_OUT: {},
      OFFLINE: { on: { Reconnect: { target: S.LIVE, updateMemory: () => ({ feedTries: 0 }) } } },
    },
  }
})
// view: useView(room, (s) => s.memory.messages)  and  useView(room, (s) => s.operations.feed?._tag === "Live")
```

**After: the fragment.** A trait has no states, so LIVE/SYNCED/OWED/LOST/OFFLINE become a memory `status`, and the
placement's `when` is the reconnect switch: false releases the session, true opens one from `at`.

```ts
// livefeed.trait.ts
import { deny, Flow, trait } from "flow-state"
import { Duration, Schema } from "effect"
import { Chat, Message } from "./chat.contracts"

const Position = Schema.Struct({ epoch: Schema.String, after: Schema.Number })
type Feed = { readonly messages: ReadonlyArray<Message>; readonly at: typeof Position.Type }
type Page = { readonly epoch: string; readonly messages: ReadonlyArray<Message>; readonly through: number }
const merge = (m: Feed, xs: ReadonlyArray<Message>) => ({ messages: [...m.messages, ...xs.filter((x) => !m.messages.some((h) => h.epoch === x.epoch && h.seq === x.seq))] })
const advance = (m: Feed, x: Message) => ({ ...merge(m, [x]), at: { epoch: x.epoch, after: x.seq }, tries: 0 })
const paged = (m: Feed, p: Page) => ({ ...merge(m, p.messages), at: { epoch: p.epoch, after: p.through } })

export const LiveFeed = trait(                                                        // user-defined: LiveFeed
  {
    id: "LiveFeed",
    hostEvents: { Reconnect: {} },
    internalEvents: {                                                                // NEW MEANING: an operation's endings (FO1)
      Message: { message: Message },
      Missed: { epoch: Schema.NullOr(Schema.String) },
      CaughtUp: { epoch: Schema.String, messages: Schema.Array(Message), through: Schema.Number, complete: Schema.Boolean },
      CatchUpFailed: {}, ResyncDue: {}, FeedEnded: {}, FeedLost: {}, SignedOut: {}, RetryFeed: {},
    },
    callbacks: { onSignedOut: Flow.Callback({}), onOffline: Flow.optional(Flow.Callback({})) },
    memory: {
      roomId: Flow.input(Schema.String),
      messages: Flow.initial(Schema.Array(Message), []),
      at: Flow.initial(Position, { epoch: "", after: 0 }),
      status: Flow.initial(Schema.Literals(["synced", "owed", "lost", "offline", "signedOut"]), "synced"),
      tries: Flow.private(Flow.initial(Schema.Int, 0)),
    },
    operations: ({ E }) => ({                                                        // NEW MEANING: in a fragment; reads only, so any node (FO0)
      feed: Chat.messages.outcomes({
        value: E.Message.from((m) => ({ message: m })),
        gap: { Reset: E.Missed.from((r) => ({ epoch: r.epoch })), Unproven: E.Missed.from(() => ({ epoch: null })) },
        complete: E.FeedEnded,
        failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
      }),
      catchUp: Chat.since.outcomes({
        success: E.CaughtUp.from((p) => p),
        failure: { ChatDown: E.CatchUpFailed, Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
      }),
    }),
  },
  ({ E, O, callbacks }) => {                                                         // NEW MEANING: O in a fragment body
    const from = ({ memory }: { memory: { roomId: string; at: typeof Position.Type } }) => ({ roomId: memory.roomId, epoch: memory.at.epoch, after: memory.at.after })
    const catchUp = O.catchUp.lookup(from)
    return {
      activities: [O.feed.subscribe(from, { when: ({ memory }) => memory.status === "synced" || memory.status === "owed" })],   // NEW MEANING: activities in a trait body (FO4)
      schedules: {
        retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.tries), armOn: [E.FeedLost, E.FeedEnded], send: E.RetryFeed },
        resync: { schedule: "5 seconds", armOn: [E.Missed, E.CatchUpFailed], send: E.ResyncDue },
      },
      on: {
        Message: [
          { target: "self", guard: ({ memory }) => memory.status === "synced" || deny("Owed"), updateMemory: ({ memory, event }) => advance(memory, event.message) },
          { target: "self", updateMemory: ({ memory, event }) => merge(memory, [event.message]) },   // owed: kept; `at` stays below the hole
        ],
        Missed: { target: "self", updateMemory: ({ memory, event }) => ({ status: "owed", ...(event.epoch === null || event.epoch === memory.at.epoch ? {} : { at: { epoch: event.epoch, after: 0 } }) }), actions: [catchUp] },
        CaughtUp: [
          { target: "self", guard: ({ memory, event }) => (memory.status === "owed" && event.complete) || deny("MorePages"), updateMemory: ({ memory, event }) => ({ ...paged(memory, event), status: "synced" }) },
          { target: "self", guard: ({ memory }) => memory.status === "owed" || deny("NotOwed"), updateMemory: ({ memory, event }) => paged(memory, event), actions: [catchUp] },
          { target: "self", updateMemory: ({ memory, event }) => paged(memory, event) },
        ],
        CatchUpFailed: { target: "self" },                                           // `resync` arms
        ResyncDue: [{ target: "self", guard: [({ memory }) => memory.status === "owed" || deny("NotOwed"), O.catchUp.idle], actions: [catchUp] }, { target: "self" }],
        FeedEnded: { target: "self", updateMemory: () => ({ status: "lost" }) },
        FeedLost: [
          { target: "self", guard: ({ memory }) => memory.tries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ status: "lost", tries: memory.tries + 1 }) },
          { target: "self", updateMemory: () => ({ status: "offline" }), notify: [callbacks.onOffline] },
        ],
        RetryFeed: [{ target: "self", guard: ({ memory }) => memory.status === "lost" || deny("NotLost"), updateMemory: () => ({ status: "synced" }) }, { target: "self" }],
        Reconnect: { target: "self", updateMemory: () => ({ status: "synced", tries: 0 }) },
        SignedOut: { target: "self", updateMemory: () => ({ status: "signedOut" }), notify: [callbacks.onSignedOut] },
      },
    }
  },
)
```

**After: the first host** (the chat screen, the trait at the root).

```ts
// room.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LiveFeed } from "./livefeed.trait"

export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "SIGNED_OUT"],
  events: { Reconnect: {} },
  memory: { roomId: Flow.input(Schema.String) },
  traits: { chat: LiveFeed },                                                        // existing: a root trait
})
```

```ts
// room.machine.ts (after)
import { machine } from "flow-state"
import { Room } from "./room.definition"

export const RoomMachine = machine(Room, ({ S, E }) => ({
  default: S.LIVE,
  traits: { chat: { input: ({ memory }) => ({ roomId: memory.roomId }), callbacks: { onSignedOut: S.SIGNED_OUT } } },   // a root trait's callback may target anything (rule 6)
  on: { Reconnect: { target: "self", raise: [E.chat.Reconnect] } },
  states: { LIVE: {}, SIGNED_OUT: {} },
}))
// view: useView(room, (s) => s.memory.chat.messages)  and  useView(room, (s) => s.operations.chat.feed?._tag === "Live")   // NEW MEANING: rows under the instance
```

**After: a second host** (a support ticket whose discussion tab is the same feed, on a node: leaving the tab
releases the session and the catch-up, FO4).

```ts
// ticket.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LiveFeed } from "./livefeed.trait"

export const Ticket = definition({
  id: "Support/Ticket",
  states: ["DETAILS", { DISCUSSION: Flow.state({ traits: { chat: LiveFeed } }) }],   // existing: Flow.state, a leaf with traits
  events: { ShowDetails: {}, ShowDiscussion: {}, Reconnect: {} },
  memory: { roomId: Flow.input(Schema.String), signedOut: Flow.initial(Schema.Boolean, false) },
})
```

```ts
// ticket.machine.ts
import { machine } from "flow-state"
import { Ticket } from "./ticket.definition"

export const TicketMachine = machine(Ticket, ({ S, E }) => ({
  default: S.DETAILS,
  on: { ShowDetails: S.DETAILS, ShowDiscussion: S.DISCUSSION },
  states: {
    DETAILS: {},
    DISCUSSION: {
      traits: { chat: { input: ({ memory }) => ({ roomId: memory.roomId }), callbacks: { onSignedOut: { updateMemory: () => ({ signedOut: true }) } } } },   // a node trait's callback stays on its node (rule 6)
      on: { Reconnect: { target: "self", raise: [E.chat.Reconnect] } },
    },
  },
}))
```

**Added:** `activities` in a trait body; `when` as the reconnect switch (the before used states for the same thing).
**Dropped from each host:** ten internal events, three memory fields, two operations, `merge`/`advance`/`paged`, five
states and both schedules. **Cost:** the before draws LIVE/OWED/LOST/OFFLINE in the host's graph; the after hides them
in a memory `status`, so `flow graph` must show the trait's summary, and the trait's ticks (`resync`, `retry`) are no
longer bound to a state (both are one-shot and guarded).

### 4.3 Checkout, a subroutine with a payment write (phase 2)

Behaviour (MD 2.7.3–2.7.9's checkout, reduced to one card payment): `Pay` confirms the intent; `Busy` waits and tries
again as a new write, three times; an unknown is re-sent as the same write every 3 s, five times, then the intent is
read every 2 s, ten times, then "stuck" with a manual check; a read that answers releases the held write. `Back`
leaves checkout at any time.

Where the data comes from: `Stripe.confirm` and `Stripe.intent` are MD 2.7.3's contracts, unchanged
(`StripeApi.confirm` wraps `fetch("POST /v1/payment_intents/:id/confirm", { headers: { "Idempotency-Key":
attempt.id }, signal })`; `key: []`, `reject`). The cart actor's identity is the cart (Runtime O3: actor id = cart
id), so `key: []` is one payment lane per cart, and every checkout incarnation in this actor is about the same
intent: re-entry adopts exactly (1.2 item 3).

**This case is phase 2** (FO0: a subroutine's incarnations are fresh on every entry). It is written with FO5–FO8
unchanged, to show what lifting FO0 costs.

**Before: the host owns the payment.**

```ts
// cart.definition.ts (before)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { IntentStatus, Stripe } from "./checkout.contracts"

export const Cart = definition({
  id: "Shop/Cart",
  states: ["BROWSING", { CHECKOUT: ["CARD", "PAYING", "WAITING", "UNSURE", "READING", "STUCK"] }, "RECEIPT"],
  events: { GoToCheckout: {}, Back: {}, Pay: { paymentMethodId: Schema.String }, Cancel: {}, CheckAgain: {} },
  internalEvents: {
    Intent: { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) },
    Declined: { code: Schema.String }, Busy: { retryAfterMs: Schema.optional(Schema.Number) },
    Refused: {}, TryLater: {}, ReadFailed: {},
    Unsure: Flow.uncertain({}),
    RetryNow: {}, CheckTick: {}, PollTick: { n: Schema.Int },
  },
  memory: {
    intentId: Flow.input(Schema.String),
    chargeId: Flow.initial(Schema.NullOr(Schema.String), null),
    paymentMethodId: Flow.initial(Schema.String, ""),
    busyTries: Flow.initial(Schema.Int, 0),
    retryInMs: Flow.initial(Schema.Int, 0),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => {
    const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
    return {
      pay: Stripe.confirm.outcomes({
        success: intent,
        failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), TooManyAttempts: E.Refused, Rejected: E.Refused, NotSent: E.TryLater },
        unknown: E.Unsure,
      }),
      read: Stripe.intent.outcomes({ success: intent, failure: E.ReadFailed }),
    }
  },
})
```

```ts
// cart.machine.ts (before)
import { deny, machine } from "flow-state"
import { Duration, Schedule } from "effect"
import { Cart } from "./cart.definition"

const MAX_BUSY = 3
const MAX_RESENDS = 5
const MAX_POLLS = 10

export const CartMachine = machine(Cart, ({ S, E, O }) => {
  const thisIntent = ({ memory }) => ({ intentId: memory.intentId })
  const charge = O.pay.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }))
  const paid = { target: S.RECEIPT, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded"), updateMemory: ({ event }) => ({ chargeId: event.chargeId ?? null }), actions: [O.pay.cancel] }   // a read answered: release a held pay
  const failed = { target: "self", guard: ({ event }) => event.status === "requires_payment_method" || deny("Pending"), actions: [O.pay.cancel] }
  const toCard = (error: string) => ({ target: S.CHECKOUT.CARD, updateMemory: () => ({ error }) })
  const toRead = { target: S.CHECKOUT.READING, actions: [O.read.lookup(thisIntent)] }
  return {
    default: S.BROWSING,
    on: {
      // late, after Back, or adopted in any leaf by a new incarnation of the cart (rule 44): the host moves the user to the receipt
      Intent: [paid, failed, { target: "self" }],
      Unsure: { target: "self", actions: [O.read.lookup(thisIntent)] },             // reconcile in the background; never drop a charge
      Declined: { target: "self" }, Busy: { target: "self" }, Refused: { target: "self" }, TryLater: { target: "self" }, ReadFailed: { target: "self" },
      Back: { target: S.BROWSING, guard: [S.CHECKOUT] },
    },
    states: {
      BROWSING: { on: { GoToCheckout: S.CHECKOUT } },
      CHECKOUT: {
        default: S.CHECKOUT.CARD,
        states: {
          CARD: {
            on: {
              Pay: { target: S.CHECKOUT.PAYING, guard: [O.pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, busyTries: 0, error: null }), actions: [charge] },
              Cancel: { target: S.BROWSING, guard: [O.pay.idle] },
            },
          },
          PAYING: {
            on: {
              Intent: [paid, toRead],
              Declined: toCard("Your card was declined"),
              Busy: [
                { target: S.CHECKOUT.WAITING, guard: ({ memory }) => memory.busyTries < MAX_BUSY || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
                toCard("Payments are busy. Try again shortly."),
              ],
              Refused: toCard("The payment was refused"),
              TryLater: toCard("Not sent. Try again"),
              Unsure: S.CHECKOUT.UNSURE,
            },
          },
          WAITING: {
            schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
            on: { RetryNow: [{ target: S.CHECKOUT.PAYING, guard: [O.pay.idle], actions: [charge] }, toCard("Payments are busy. Try again shortly.")] },
          },
          UNSURE: {
            schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
            on: { CheckTick: [{ target: S.CHECKOUT.PAYING, guard: [O.pay.retryable({ times: MAX_RESENDS })], actions: [O.pay.retry] }, toRead] },
          },
          READING: {
            schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
            on: {
              PollTick: [{ target: S.CHECKOUT.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [O.read.lookup(thisIntent)] }],
              Intent: [paid, { ...failed, ...toCard("The payment did not go through") }, { target: "self" }],
              ReadFailed: { target: "self" },
            },
          },
          STUCK: { on: { CheckAgain: toRead } },
        },
      },
      RECEIPT: {},
    },
  }
})
```

**After: the subroutine.**

```ts
// checkout.subroutine.ts
import { deny, Flow, subroutine } from "flow-state"
import { Duration, Schedule, Schema } from "effect"
import { IntentStatus, Stripe } from "./checkout.contracts"

const MAX_BUSY = 3
const MAX_RESENDS = 5
const MAX_POLLS = 10

export const Checkout = subroutine(                                                   // existing: subroutine; user-defined: Checkout
  {
    id: "Checkout",
    states: ["CARD", "PAYING", "WAITING", "UNSURE", "READING", "STUCK"],
    events: { Pay: { paymentMethodId: Schema.String }, Cancel: {}, CheckAgain: {} },
    internalEvents: {                                                                // NEW MEANING: an operation's endings (FO1)
      Intent: { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) },
      Declined: { code: Schema.String }, Busy: { retryAfterMs: Schema.optional(Schema.Number) },
      Refused: {}, TryLater: {}, ReadFailed: {},
      Unsure: Flow.uncertain({}),
      RetryNow: {}, CheckTick: {}, PollTick: { n: Schema.Int },
    },
    exits: { Paid: Flow.Exit({ chargeId: Schema.String }), Cancelled: Flow.Exit({}) },   // existing: exits, Flow.Exit
    memory: {
      intentId: Flow.input(Schema.String),
      paymentMethodId: Flow.private(Flow.initial(Schema.String, "")),
      busyTries: Flow.private(Flow.initial(Schema.Int, 0)),
      retryInMs: Flow.private(Flow.initial(Schema.Int, 0)),
      error: Flow.initial(Schema.NullOr(Schema.String), null),
    },
    operations: ({ E }) => {                                                         // NEW MEANING: in a subroutine (phase 2, FO0)
      const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
      return {
        pay: Stripe.confirm.outcomes({
          success: intent,
          failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), TooManyAttempts: E.Refused, Rejected: E.Refused, NotSent: E.TryLater },
          unknown: E.Unsure,
        }),
        read: Stripe.intent.outcomes({ success: intent, failure: E.ReadFailed }),
      }
    },
  },
  ({ S, E, O, exits }) => {                                                          // NEW MEANING: O in a fragment body
    const thisIntent = ({ memory }) => ({ intentId: memory.intentId })
    const charge = O.pay.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }))
    const paid = { ...exits.Paid.from(({ event }) => ({ chargeId: event.chargeId ?? "" })), guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded"), actions: [O.pay.cancel] }   // existing: exits.X.from
    const failed = { guard: ({ event }) => event.status === "requires_payment_method" || deny("Pending"), actions: [O.pay.cancel] }
    const toCard = (error: string) => ({ target: S.CARD, updateMemory: () => ({ error }) })
    const toRead = { target: S.READING, actions: [O.read.lookup(thisIntent)] }
    return {
      default: S.CARD,
      on: {
        // adopted by the next entry after Back (FO6), current from the active leaf: handled at the subroutine's root (FO7)
        Intent: [paid, { ...failed, ...toCard("The payment did not go through") }, { target: "self" }],
        Unsure: S.UNSURE,
        Declined: toCard("Your card was declined"), Busy: toCard("Payments are busy. Try again shortly."),
        Refused: toCard("The payment was refused"), TryLater: toCard("Not sent. Try again"), ReadFailed: { target: "self" },
      },
      states: {
        CARD: {
          on: {
            Pay: { target: S.PAYING, guard: [O.pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId, busyTries: 0, error: null }), actions: [charge] },
            Cancel: { ...exits.Cancelled, guard: [O.pay.idle] },                     // never exit with a payment unresolved (FO7)
          },
        },
        PAYING: {
          on: {
            Intent: [paid, toRead],
            Busy: [
              { target: S.WAITING, guard: ({ memory }) => memory.busyTries < MAX_BUSY || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
              toCard("Payments are busy. Try again shortly."),
            ],
            Unsure: S.UNSURE,
          },
        },
        WAITING: {
          schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
          on: { RetryNow: [{ target: S.PAYING, guard: [O.pay.idle], actions: [charge] }, toCard("Payments are busy. Try again shortly.")] },
        },
        UNSURE: {
          schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
          on: { CheckTick: [{ target: S.PAYING, guard: [O.pay.retryable({ times: MAX_RESENDS })], actions: [O.pay.retry] }, toRead] },
        },
        READING: {
          schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
          on: {
            PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [O.read.lookup(thisIntent)] }],
            Intent: [paid, { ...failed, ...toCard("The payment did not go through") }, { target: "self" }],
            ReadFailed: { target: "self" },
          },
        },
        STUCK: { on: { CheckAgain: toRead } },
      },
    }
  },
)
```

**After: the host.**

```ts
// cart.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Checkout } from "./checkout.subroutine"

export const Cart = definition({
  id: "Shop/Cart",
  states: ["BROWSING", { CHECKOUT: Checkout }, "RECEIPT"],                            // existing: a subroutine placed as a state
  events: { GoToCheckout: {}, Back: {} },
  memory: { intentId: Flow.input(Schema.String), chargeId: Flow.initial(Schema.NullOr(Schema.String), null) },
})
```

```ts
// cart.machine.ts (after)
import { machine } from "flow-state"
import { Cart } from "./cart.definition"

export const CartMachine = machine(Cart, ({ S }) => ({
  default: S.BROWSING,
  on: { Back: { target: S.BROWSING, guard: [S.CHECKOUT] } },                          // abandons CHECKOUT; a payment on the wire keeps running (FO5); FO8 passes: BROWSING reaches CHECKOUT
  states: {
    BROWSING: { on: { GoToCheckout: S.CHECKOUT } },
    CHECKOUT: {
      input: ({ memory }) => ({ intentId: memory.intentId }),
      exits: { Paid: { target: S.RECEIPT, updateMemory: ({ payload }) => ({ chargeId: payload.chargeId }) }, Cancelled: S.BROWSING },
    },
    RECEIPT: {},
  },
}))
// view: useView(cart, (s) => Checkout.O.pay.get(s).pending || Checkout.O.pay.get(s).uncertain)   // "a payment is still being confirmed: return to checkout"
```

**Dropped from the host:** five events, ten internal events, four memory fields, both operations, six states, three
schedules and every root late handler. **Added:** nothing it must write; it may read `Checkout.O.pay`.
**Changed behaviour, the main cost of phase 2:** in the before, a payment that lands after `Back` moves the user to
`RECEIPT` from wherever they are (the host's root `Intent`). In the after, the host cannot see the ending (rule 4),
so it is parked and the user sees "paid" only on the next entry to checkout; until then the view can only say "a
payment is still being confirmed" from the lane row. A host that must react at once keeps `pay` (1.2 item 4).

### 4.4 A like button over an entity-domain write (`.each`)

Behaviour (MD 2.8.2's like): the view sends the value it wants; `latest` queues one newer toggle behind a held one;
the store predicts, confirms and rolls back; an unknown is re-sent as the same write every 3 s, three times, then
released with a toast; a missing issue refetches the list.

Where the data comes from: `Issues.setLike` and `Issues.list` are MD 2.8.2's domain entries over `issues.contracts.ts`
(`IssuesApi.send("PUT", "/issues/:id/like", …, { idempotencyKey: attempt.id, signal })` and the project list read),
unchanged; `key: ["id"]`, `latest`. The copy's key is the issue id, so a copy and its lane are about the same issue.

**Before: the host owns the like.**

```ts
// board.definition.ts (before)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Board = definition({
  id: "Issues/Board",
  states: ["READY"],
  events: { Toggle: { id: Schema.String, liked: Schema.Boolean }, Dismiss: {} },
  internalEvents: {
    Settled: {}, IssueGone: {}, Failed: { message: Schema.String },
    LikeUnsure: Flow.uncertain({ id: Schema.String }),
    ReconcileLike: { id: Schema.String },
  },
  memory: { projectId: Flow.input(Schema.String), toast: Flow.initial(Schema.NullOr(Schema.String), null) },
  operations: ({ E }) => ({
    issues: Issues.list,                                                             // existing: bare; the view reads rows from the lane
    like: Issues.setLike.outcomes({
      success: E.Settled,
      failure: { Gone: E.IssueGone, Refused: E.Failed.from(() => ({ message: "Couldn't update the like" })), NotSent: E.Failed.from(() => ({ message: "Couldn't update the like" })) },
      unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })),
    }),
  }),
})
```

```ts
// board.machine.ts (before)
import { machine } from "flow-state"
import { Board, MAX_LIKE_RESENDS } from "./board.definition"

export const BoardMachine = machine(Board, ({ S, E, O }) => {
  const named = ({ event }: { event: { id: string } }) => event
  return {
    default: S.READY,
    states: {
      READY: {
        activities: [O.issues.subscribe(({ memory }) => ({ projectId: memory.projectId }))],
        schedules: { reconcile: { keys: ({ operations }) => operations.like.filter((l) => l.uncertain).map((l) => l.key), schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key.id })) } },
        on: {
          Toggle: { target: "self", actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))] },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [O.issues.refetch] },
          Failed: { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) },
          LikeUnsure: [
            { target: "self", guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] },
            { target: "self", updateMemory: () => ({ toast: "Couldn't confirm your like" }), actions: [O.like.cancel] },
          ],
          ReconcileLike: { target: "self", actions: [O.like.retry(named)] },
          Dismiss: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
// view: useView(board, (s) => Board.O.like.get(s, { id }).pending)  and  send(Board.E.Toggle({ id, liked: !row.data.liked }))
```

**After: the fragment.**

```ts
// likebutton.trait.ts
import { Flow, trait } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const LikeButton = trait(                                                      // user-defined: LikeButton
  {
    id: "LikeButton",
    events: { Toggle: { liked: Schema.Boolean } },
    internalEvents: { Settled: {}, Gone: {}, Failed: {}, LikeUnsure: Flow.uncertain({}), ReconcileDue: {} },   // NEW MEANING: endings (FO1)
    callbacks: { onGone: Flow.Callback({}), onFailed: Flow.optional(Flow.Callback({ message: Schema.String })) },
    memory: { id: Flow.input(Schema.String) },
    operations: ({ E }) => ({                                                        // NEW MEANING: in a fragment; registers the Issues domain for its actor (FO1)
      set: Issues.setLike.outcomes({ success: E.Settled, failure: { Gone: E.Gone, Refused: E.Failed, NotSent: E.Failed }, unknown: E.LikeUnsure }),
    }),
  },
  ({ E, O, callbacks }) => {
    const own = ({ memory }: { memory: { id: string } }) => ({ id: memory.id })
    const failed = (message: string) => callbacks.onFailed.from(() => ({ message }))
    return {
      schedules: { reconcile: { schedule: "3 seconds", armOn: [E.LikeUnsure], send: E.ReconcileDue } },
      on: {
        Toggle: { target: "self", actions: [O.set.commit(({ memory, event }) => ({ id: memory.id, liked: event.liked }))] },   // a toggle while unsure waits behind the hold (OD5)
        Settled: { target: "self" },
        Gone: { target: "self", notify: [callbacks.onGone] },
        Failed: { target: "self", notify: [failed("Couldn't update the like")] },
        LikeUnsure: [
          { target: "self", guard: [O.set.retryable({ times: MAX_LIKE_RESENDS })] },   // key-less: this ending's Attempt (OD8); `reconcile` re-sends
          { target: "self", actions: [O.set.cancel], notify: [failed("Couldn't confirm your like")] },   // give up: release; a waiting toggle is then sent
        ],
        ReconcileDue: { target: "self", actions: [O.set.retry(own)] },              // the same request, no new prediction (rule 31)
      },
    }
  },
)
```

**After: the first host** (the board places one copy per listed issue).

```ts
// board.definition.ts (after)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"
import { LikeButton } from "./likebutton.trait"

export const Board = definition({
  id: "Issues/Board",
  states: ["READY"],
  events: { Dismiss: {} },
  internalEvents: { Listed: { ids: Schema.Array(Schema.String) } },
  memory: {
    projectId: Flow.input(Schema.String),
    issueIds: Flow.initial(Schema.Array(Schema.String), []),                         // membership is host data (rule 9)
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  traits: { likes: LikeButton.each({ of: "issueIds", max: 500 }) },                  // existing: .each
  operations: ({ E }) => ({ issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }) }),
})
```

```ts
// board.machine.ts (after)
import { machine } from "flow-state"
import { LikeButton } from "./likebutton.trait"
import { Board } from "./board.definition"

const busy = (row: { pending: boolean; uncertain: boolean; waiting: boolean }) => row.pending || row.uncertain || row.waiting

export const BoardMachine = machine(Board, ({ S, O }) => ({
  default: S.READY,
  traits: {
    likes: {
      input: ({ key }) => ({ id: key }),
      callbacks: { onGone: { actions: [O.issues.refetch] }, onFailed: { updateMemory: ({ payload }) => ({ toast: payload.message }) } },
    },
  },
  states: {
    READY: {
      activities: [O.issues.subscribe(({ memory }) => ({ projectId: memory.projectId }))],
      on: {
        Listed: { target: "self", updateMemory: ({ memory, operations, event }) => ({ issueIds: [...event.ids, ...memory.issueIds.filter((id) => !event.ids.includes(id) && busy(LikeButton.O.set.get(operations, { id })))] }) },   // NEW MEANING: a host read (FO2); keeps a copy whose like is unresolved (Q6)
        Dismiss: { target: "self", updateMemory: () => ({ toast: null }) },
      },
    },
  },
}))
// view: useView(board, (s) => LikeButton.O.set.get(s, { id }).pending)  and  send(Board.E.likes.key(id).Toggle({ liked: !row.data.liked }))
```

**After: a second host** (an issue page with one like button, at the root).

```ts
// issuepage.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LikeButton } from "./likebutton.trait"

export const IssuePage = definition({
  id: "Issues/IssuePage",
  states: ["SHOWING", "GONE"],
  memory: { issueId: Flow.input(Schema.String) },
  traits: { like: LikeButton },
})
```

```ts
// issuepage.machine.ts
import { machine } from "flow-state"
import { IssuePage } from "./issuepage.definition"

export const IssuePageMachine = machine(IssuePage, ({ S }) => ({
  default: S.SHOWING,
  traits: { like: { input: ({ memory }) => ({ id: memory.issueId }), callbacks: { onGone: S.GONE } } },   // onFailed left out (optional)
  states: { SHOWING: {}, GONE: {} },
}))
```

**Dropped from each host:** `Toggle` with its id, five internal events, the like operation, the keyed reconcile
schedule and six handlers. **Added to the board:** `issueIds` and `Listed` (membership must be memory for `.each`),
and the one line that keeps a copy alive while its like is unresolved. **What does not change:** store effects
(predictions, rollback, `uncertain` marks, the record queue) apply at settlement whether a copy exists or not
(rule 27); two screens liking one issue are two actor identities, ordered by the record queue (rule 29).

### 4.5 Line totals

Measured by script over the blocks above: every line of each definition, machine and fragment block, comments
included; contracts and view comments excluded.

| Case | Before: host only | After: fragment | After: first host | First use | Further host, after | Further host, before | Saved per further host |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 Autosave (`.each`) | 93 | 63 | 44 | 107 (+14) | 44 | 93 | 49 (53 %) |
| 4.2 Live feed (root, node) | 94 | 77 | 22 | 99 (+5) | 26 (ticket) | 94 | 68 (72 %) |
| 4.3 Checkout (subroutine, phase 2) | 108 | 95 | 27 | 122 (+14) | 27 | 108 | 81 (75 %) |
| 4.4 Like (`.each`, root) | 54 | 37 | 44 | 81 (+27) | 20 (issue page) | 54 | at most 34 (63 %) |

"Further host, before" assumes each further host-only screen repeats its first host's block; for the feed's ticket
and the like's issue page that is an upper bound (a single-like page writes the like without the keyed schedule).

Reading it:

- **A first use is larger** in every case (fragment plus host against the host-only form), as EX and every earlier
  comparison found ("extract a fragment on the second use", principles section 1).
- **Every further host is much smaller.** The feed on five screens is one trait and five short hosts.
- **`.each` hosts save less.** The board saves only 10 lines (54 → 44), because `.each` needs membership in memory
  (`issueIds`, `Listed`) that the host-only form read from the list's lane, plus 4.4's keep-busy line. The like pays
  off on the pages that place it once (54 → 20).
- **What the lines hide:** in the before, each host writes its own `unknown` handling and its own late handlers, and
  `flow check` must catch each one; in the after, they are written and tested once (FO10).

## 5. Tested against very different cases

| Case | Shape | Verdict under v1 (FO0) | Strain |
| --- | --- | --- | --- |
| Search as you type | trait: debounce + `lookup` | fits anywhere (a read) | none; leaving releases the lookup |
| Infinite pager | trait: `subscribe.each` over loaded pages | fits anywhere | page cache is the resource's |
| Presence heartbeat | trait: stream + a bare `ping` write | fits anywhere (bare write delivers nothing) | none |
| Notification bell on every screen | root trait: stream, a `markSeen` write (`latest`, key `[]`) | fits (root) | one write lane per screen actor; two screens are two identities, unordered for a plain write (MD 2.7.13 limit) |
| Comment composer per thread | trait `.each` by thread id: `post` (`reject`, key `["clientId"]`) | fits | the copy key (thread) is not the lane key (client message): copies have several lanes each; delivery by the Attempt's copy key is exact |
| Cart quantity stepper per line | trait `.each`: a domain write | fits (the like again) | bulk "clear cart" is MD 2.7.13's per-key fan-out limit |
| Upload a file (step) | subroutine: `put` with `progress`, `cancel`, a clean-up write | **phase 2** | re-entry for another file adopts the first file's lane (`key: ["ref"]` keeps lane handling right; memory reactions must compare `event.ref`, FO7); an `.each` trait keyed by ref is exact in v1 |
| Two-factor verify (step) | subroutine: `verify`, `resend` | **phase 2** | a late `WrongCode` after Back is a strike only on re-entry; the sign-in's strikes must survive, so the host keeps them (MD 3.1) |
| Editor that switches documents | root trait with `resetOn: docId` | **not in v1** (FO0 bans `resetOn`) | doc A's save would reach doc B's incarnation; write it as `.each` over a one-element list |
| Booking saga (hold, charge, refund) | host | stays in the host | decides across steps and must refund a late charge at once (1.2 item 4) |
| Generic "submit with retry" over any contract | would be EX's `CommitWithRetry` | rejected | `failure` is exhaustive per contract (rule 13); fragments are contract-specific |

## 6. What OD19–OD22 solved from EX's list

| EX item | Status now | Why |
| --- | --- | --- |
| R4, R8, F5, Q2: the orphaned ending, `whenOrphaned`, the contract's `orphaned({ ending })`, `UnreconciledOrphan` | **solved, removed** | OD19: the lane is the Runtime's and outlives its binder; OD21: endings with no binder are parked and delivered to the next incarnation from its active leaf; OD22: parked raw and mapped at delivery. One level down, that is FO5 and FO6. No host port, no off-actor handler |
| F3: lanes identified by (instance path, site, key) | **changed** | OD20 fixed identity as (actor identity, contract id, key); the placement is where delivery goes, not part of identity (FO3, FO5). EX's L7 (a re-entered fragment writing beside its predecessor's unknown) cannot happen: same thing, same lane |
| F8, Q4: no `.resumable()` beside a write | **solved, removed** | OD22's parked endings hold an ending until the thaw (2.4) |
| EX 2.4 "Restore / version change" and persistence by placement path | **solved** | OD20's lane records decode by contract `input` pick; the operation is found by contract id (FO3); only the `.each` copy key is added |
| Incarnation counters for every placement (EX 5) | **not needed** | the owner test uses activation identity, which Machines O5 already has; delivery uses the placement and copy key |
| EX's rule-15 clause (late host turns for orphans) | **not needed** | no host turn ever runs for a fragment's ending |
| F6 "ending a life never cancels a write" | **solved** for writes by OD19 (disposal drops and cancels nothing), generalized in 2.4; the read half is FO4 |
| Issue 8, `ExitWithCallInFlight` | **replaced** by FO7: an exit on a branch that keeps a hold is an `UnresolvedHold` inside the fragment |
| Rule 20 over the late set (EX 2.4) | **replaced** by OD22's adopted-ending rule over the fragment's arrival set (FO7) |
| Q3 `.public()` | not solved by OD19–OD22; answered by the schedules precedent (FO2, Q5) |
| Q5 `start` | dropped: none of the cases needs it (Q9) |
| R6 summaries, R7 Stories fixtures | still needed: FO9, FO10 |
| Q1 allow at all | still the owner's (Q1) |

## 7. What breaks or changes in the merged design

Exact amendments to MD if accepted (none is applied; each waits for the owner's yes):

1. **Section 1**, fourth bullet: "Fragments are locked islands of logic with no I/O" → "…with no I/O of their own,
   unless they declare `operations` (FO1)"; and "the host runs every operation" → "the host runs every operation it
   declares".
2. **2.1 Reading**: add "a fragment's operations: `s.operations.<instance>.<name>`, a keyed list of copies under
   `.each`; write lanes by key with `Fragment.O.x.get(s, k)` (FO2)".
3. **2.2.2**, last sentence: "Fragments may not declare `operations`, `activities`, `context`, `onContext`, `send` or
   persistence" → "Fragments may not declare `context`, `onContext`, `send` or persistence; a trait body may hold
   `activities` (FO1, FO4)".
4. **2.3**, row "Running I/O and mapping endings": add "or a fragment's declaration and body, for its own
   operations (FO1)".
5. **2.6 key order**: machine or fragment body gains `activities` before `schedules`.
6. **Rule 1**, `.resumable()`: add "A call ending for a frozen trait is parked and delivered at the thaw (2.4)".
7. **Rule 2**: "`internalEvents` come only from the fragment's own schedules" → "…own schedules or its operations'
   endings"; "The host maps call endings onto its own events" → "Each operation maps its endings onto the events of
   the definition or fragment that declares it".
8. **Rule 3**: replaced by FO1 (and FO0 for v1).
9. **Rule 4**: add FO2's sentence: the host reads a fragment's lanes and cannot act on them.
10. **Rule 8**: the call-endings bullet adds "to the binding incarnation, or parked at its placement (FO5)".
11. **Rule 9**: "The Attempt carries no copy key" → "…for a host operation; an Attempt committed in a copy of a
    fragment that owns the operation carries the copy's key (FO3)".
12. **Rule 10**: summaries record operations (FO9).
13. **Rule 11**: `story.machine(fragment, { id, fixtures })`; `.enter` and `.leave` on traits (FO10).
14. **Rule 12**: construction errors add "an acting member of a fragment's operation used outside it" and "a
    fragment that owns a mapped write placed outside FO0".
15. **Rule 14**: "One owner test" runs inside the binding incarnation (FO5); add the parked case.
16. **Rule 17**: "to a live incarnation of its identity or to its saved record" → "…of its identity at its
    operation's placement, or parked there (FO5)".
17. **Rule 20**, adopted endings: "the operation's new-incarnation arrival set" is computed in the declaring
    fragment for a fragment's operation (FO7).
18. **Rule 21**: "the actor that commits is its binding actor" → "its binding incarnation is the actor, or the live
    incarnation at the operation's placement (FO5)".
19. **Rule 40**: `SharedContract` counts every write operation in the actor's placement tree (FO3).
20. **Rule 42**: a fragment's one-off read lane is (actor, operation, incarnation) and is released with it (FO4).
21. **Rule 44**: add FO6 (placement adoption, follow-up turns, thaw).
22. **Rule 45**: add FO8's host arrival.
23. **Rule 46**: "A lane record names no instance path; an `.each` copy's Attempt carries the copy key" (2.5).
24. **2.5 step 1**: the owner test runs in the binding incarnation; an ending with none is parked. Step 6: after
    pending resets, queue FO6's deliveries for each incarnation the turn started.
25. **2.7.13**: "Owner" paragraph reads "binding incarnation"; the dispose, rebind, freeze, thaw and parking rows of
    2.4 above.
26. **2.7.14** item 2: arrivals inside a fragment (FO7); new item 5: placement arrivals at the host (FO8).
27. **2.7.16**: `SharedContract` and `UnresolvedHold` widened; `flow explain` prints fragment operations; no new
    finding names.
28. **3.6 Keywords**: the six new meanings of 2.7.
29. **Section 5**: Machines O1 (fragments may declare operations; `Fragment.O`), Runtime O3/V4 (binding
    incarnation; adoption by placement), Persistence O2/O6 (the copy key; parking in a live actor), Testing O1
    (fragment Stories with fixtures), Inspection O1 (unplaced lanes), CommandLine O5 (amendments 14, 26, 27),
    React O4 (views read `Fragment.O.x.get`), EntityDomains O1 (a fragment's domain operation registers its domain
    for the actor).
30. **Section 6**: delete "Fragment I/O" and "Nested request relays"; "Operations in fragments (OD17 Q19)" points
    here.
31. **Merge 3** (not merged): "fragments have no I/O, so no `services` or `fixtures`" is replaced by FO10.
32. **Merge 6** (not merged): a trait body's `activities` places a stream for the incarnation's life; its sessions
    are the incarnation's (M6 4.4 already says sessions are not Runtime records).

## 8. Risks

1. **Late results reach the user late (phase 2).** A subroutine or node trait that is left holds its result until
   it comes back (4.3). The host cannot react sooner without owning the operation. FO0 keeps this out of v1.
2. **A copy that never returns strands its hold.** Under `.each`, FO8 cannot see membership (closures), so a held
   write whose copy is gone waits until the key is added again or the actor ends. Meanwhile a domain write's record
   queue blocks other actors' writes to that record (MD 2.7.13's cross-actor limit, now reachable without disposal).
   The board's one-line pattern (4.4) prevents it; nothing checks that a host wrote it (Q6).
3. **Cross-thing adoption (phase 2).** A subroutine or node trait whose entries are about different things receives
   a previous thing's ending. Lane handling stays right (keys and OD8's key-less members name the ending's Attempt);
   memory and payload reactions must compare the event's key. This is rule 44's discipline, unchecked.
4. **The host graph hides I/O.** Reading the host no longer shows the feed's LOST or the checkout's UNSURE.
   `flow graph`, `flow explain` and Inspection must show summaries well, or agents and readers lose the picture.
5. **Parked endings in a live actor accumulate** for placements that never return (bounded by distinct keys). Shown
   by Inspection and `runtime.unsettledWrites()`.
6. **Typing.** `Fragment.O` read in a host, branded members rejected in a host's `actions`, rows under `.each`
   copies, and the `operations: ({ E })` ordering are untested; a type spike is the next step.
7. **`SharedContract` per actor is stricter.** A write-owning trait cannot be placed twice by name in one actor;
   authors place it higher or use `.each`. A false error is possible where two placements are never active together.

## 9. Open questions for the owner

Answer as `Q1 A`. Every item is proposed; nothing is decided until answered.

### Round 1: direction

**Q1. Allow fragments to own operations?**

- A. Yes, opt-in, traits first (this proposal).
- B. No: keep rule 3 and MD section 6.

```ts
// before (MD; 4.1 in full): Workspace declares the save, and its machine holds two keyed schedules and eight handlers
operations: ({ E }) => ({ save: saveDoc.outcomes({ success: E.Saved.from((v, { key }) => ({ docId: key.docId, etag: v.etag })), failure: { Conflict: E.Conflict.from((r, { key }) => ({ docId: key.docId, serverEtag: r.serverEtag })), Refused: E.Refused.from((_r, { key }) => ({ docId: key.docId })), NotSent: E.Refused.from((_r, { key }) => ({ docId: key.docId })) }, unknown: E.SaveUnsure.from((_r, { key }) => ({ docId: key.docId })) }) }),
// after (A; 4.1 in full): Workspace places the trait, which declares the save
traits: { docs: Autosave.each({ of: "open", by: "docId", max: 20 }) },   // existing: .each
```

Recommendation: **A**, because the feed and autosave recur on many screens and every further host is about 50–75 %
smaller (4.5); B is right if most screens are used once.

**Q2. Lane identity for a fragment's write.**

- A. Unchanged, (actor identity, contract id, key); `SharedContract` widened to one write operation per contract per
  actor (FO3).
- B. Add the placement: (actor identity, placement path, contract id, key).

```ts
// A: two autosave placements over one document share one lane: one save in flight (D9)
// B: they get two lanes: two saves of one document at once, and lane records name an instance path
```

Recommendation: **A**: it keeps one lane space, D9, and records that decode without the machine.

**Q3. Where a write's ending goes after its fragment incarnation ends.**

- A. Parked on the lane record and delivered to the next incarnation at the placement (FO5, FO6).
- B. Success and failure become evidence (TanStack Query's component callbacks); only holds are adopted.
- C. A host port per write (EX's `whenOrphaned`, falling back to the contract's `orphaned`).

```ts
// A: a reopened copy receives Saved { etag } and updates its etag
Saved: [
  { target: "self", guard: ({ memory }) => memory.rev > memory.sentRev || deny("NoNewEdits"), updateMemory: ({ memory, event }) => ({ etag: event.etag, sentRev: memory.rev }), actions: [send] },
  { target: "self", updateMemory: ({ event }) => ({ etag: event.etag, status: "clean" }) },
],
// C: the host fills a port it cannot act on
save: saveDoc.outcomes({ success: E.Saved.from((v) => ({ etag: v.etag })), failure: { Conflict: E.Conflict.from((r) => ({ serverEtag: r.serverEtag })), Refused: E.Refused, NotSent: E.Refused }, unknown: E.SaveUnsure })
  .whenOrphaned(callbacks.onLateEnding.from((ending, { input }) => ({ docId: input.docId, saved: ending._tag === "Success" }))),   // NEW (EX)
```

Recommendation: **A**: it is OD19–OD22 one level down, adds no word, and loses no fact.

### Round 2: scope

**Q4. Which placements may own mapped writes in v1.**

- A. Every trait placement (root, node, `.each`, `.resumable()`, with `resetOn`).
- B. Placements whose incarnations are about one thing: root, `.each`, `.resumable()`, no `resetOn` (FO0).
- C. Everything, subroutines included.

```ts
// B allows
traits: { docs: Autosave.each({ of: "open", by: "docId", max: 20 }) }
// B refuses (a construction error; its finding name, if one is wanted, is a new word for you to choose)
{ DISCUSSION: Flow.state({ traits: { draft: Autosave } }) }   // a node trait with a mapped write
```

Recommendation: **B**: no cross-thing adoption and no host-invisible late result in v1; reads stay allowed anywhere.

**Q5. Can a host read a fragment's lanes?**

- A. Yes, like schedules: `s.operations.<instance>.<name>`, `Fragment.O.x.get`, `idle` and `retryable` in guards;
  acting is a type error (FO2).
- B. Private unless the fragment marks the operation.

```ts
// A
Close: { target: "self", guard: [Autosave.O.save.idle(({ event }) => event)], updateMemory: ({ memory, event }) => ({ open: memory.open.filter((d) => d.docId !== event.docId) }) },   // NEW MEANING
// B
save: saveDoc.outcomes({ success: E.Saved.from((v) => ({ etag: v.etag })), failure: { Conflict: E.Conflict.from((r) => ({ serverEtag: r.serverEtag })), Refused: E.Refused, NotSent: E.Refused }, unknown: E.SaveUnsure }).public(),   // NEW (EX)
```

Recommendation: **A**: rows are status, not wiring, and the host still cannot act; no new word.

**Q6. A held write whose `.each` copy is removed.**

- A. Stated limit; the host keeps busy keys in membership (4.4's one line) when it matters.
- B. Flow keeps a copy alive while it holds work.
- C. Ban mapped writes under `.each`.

```ts
// A (host code, no new word)
issueIds: [...event.ids, ...memory.issueIds.filter((id) => !event.ids.includes(id) && busy(LikeButton.O.set.get(operations, { id })))]
// B: no code; membership silently differs from `issueIds`
```

Recommendation: **A**. B is the hidden membership and draining the operations merge rejected; C loses the like and
autosave cases.

### Round 3: smaller items

**Q7. Subroutines that own writes (phase 2).**

- A. Later, under FO5–FO8 unchanged, after a Sonnet stress test of 4.3 and an upload step.
- B. Never: subroutines own reads, streams and bare writes only.

Recommendation: **A**, keeping 1.2 item 4 as the guidance (a host that needs a late result now keeps the write).

**Q8. Fragment Stories.**

- A. `story.machine(fragment, { id, fixtures })`, `.enter` and `.leave` on traits too (FO10).
- B. Fragments with operations are tested only inside a host Story.

```ts
story.machine(Autosave, { id: "Autosave/unsure-then-saved", fixtures: FakeDocs({ script: [{ drop: true }, { status: 200 }] }) })   // NEW MEANING: fixtures
  .send(Autosave.E.Edited({ body: "a" })).advance("1 second").leave().enter({ docId: "d1", body: "a", etag: "e1" }).advance("3 seconds")
```

Recommendation: **A**: it is what makes the policy tested once.

**Q9. Work on a subroutine's entry.**

- A. No hook: a `Flow.entry` schedule or a user event.
- B. Revive `start: [O.x.commit(select)]` (EX F10).

Recommendation: **A**: no case needs B, and B is a new word.

**Q10. `cancel` in `whenAbandoned`** (stop an upload when its step is abandoned).

- A. Defer to `revisit.md`; abandonment never stops a write (OD19's rule, one level down).
- B. Allow `O.x.cancel` in `whenAbandoned` now.

Recommendation: **A**: a cancelled write is still `unknown { Cancelled }` and held, so B saves nothing in v1.

**For `revisit.md` (proposed, not written there):** Q10's `cancel` on abandonment; a finding name for FO0 if wanted;
per-copy fan-out of write members (MD 2.7.13's limit, unchanged).
