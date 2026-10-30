# Proposal: operations owned by fragments (revision 3)

**Status: proposal.** F1–F9 are decided by the owner ([decisions.md](decisions.md), 2026-10-30 and 2026-10-31) and
marked *decided (Fn)* where they appear. Everything else is **proposed**, including each refinement of a decided rule
made here. Revisions 1 and 2 (commits `00678be6`, `0f6b1a4a`) are prior art; this revision fixes
[reviews/review-2.md](reviews/review-2.md) (**RV2**) at its root, on top of [reviews/review-1.md](reviews/review-1.md)
(**RV1**). No other file is edited. No type spike was built; every code sample is a working draft and was not
type-checked.

It builds on [../machine-design.md](../machine-design.md) as merged (**MD**; decisions OD1–OD26 in
[../merged/operations/decisions.md](../merged/operations/decisions.md)). [exploration.md](exploration.md) (**EX**) is
older prior art. Streams use merge 6's syntax ([../merge-6-streams/proposal.md](../merge-6-streams/proposal.md),
**M6**, accepted, not merged).

Marks in code: `// NEW` (a word that does not exist), `// NEW MEANING` (an existing word in a new place),
`// RENAMED`, `// existing`, `// user-defined`. **No new word is added.** A line with no mark uses only words marked
earlier in the same block, or user-defined names.

Rules are **FO0–FO12** ("fragment operations").

## 0. In short

- **The design in one sentence.** A fragment declares `operations` as a definition does and is the only thing that
  may act on them; its write lanes stay the Runtime's lanes, identified by (actor identity, contract id, key); each
  lane records the **subject path** of the incarnation that created it (the copy keys and reset values from the
  actor's root down to the placement), and its endings go to the live incarnation with that path, or are parked until
  one starts (OD19–OD22 one level down).
- **Decided:** F1 opt-in, traits first; F2 identity unchanged, `SharedContract` per actor; F3 parked endings go to the
  next incarnation; F4 v1 scope, amended by F8 to admit `resetOn` with the reset value as a subject part; F5 hosts
  read lanes; F6 a removed copy's hold is a stated limit; F7 subroutine writes in phase 2, fragment Stories, no entry
  hook; F8 `Flow.entry` does not fire on thaw; F9 **release on leave**, `whenAbandoned: [O.put.cancel]`, a property of
  the subject's lanes, for work that is worthless once its subject is gone.
- **New words: none.** Decided new meanings: key-less `cancel` in `whenAbandoned` (F9), `resetOn` on a writing trait
  (F8). Concepts: subject path, binding incarnation, unplaced lane, releasing lane (2.9).
- **Owner questions: none left.** Section 9 lists what goes to `revisit.md`.
- **Honest judgement.** A first use is larger by lines in every case, and by characters in all but the autosave
  (4.5). Every further host is 57–83 % smaller by characters. The gain is a reconcile policy written and tested once;
  the cost is that a write which outlives its fragment is handled only when its subject comes back, unless the work
  is worthless without it (F9).

## Revision 3: what changed, by root cause

| Root cause (RV2) | Findings | Change |
| --- | --- | --- |
| **Release on leave was written as a member call, but it is a standing property of the subject's lanes** (RV2-R1) | H1 | FO12 (decided, F9): key-less `whenAbandoned: [O.put.cancel]`. When the incarnation ends, the Runtime marks **every lane of that operation with this subject path** as *releasing* on the lane record. The mark survives a reload, turns endings already parked for the subject into evidence, and makes every later ending be applied and released instead of parked. 2.4 gives the cells. No member select runs in the leaving turn, so rule 22 is not involved |
| **Release on leave was recommended where it loses user intent** | H3 | FO12's rule of thumb: only for work worthless once its subject is gone (a replaced avatar upload, a removed attachment, a discarded draft). Like and follow keep 4.4's keep-busy line (F6). 2.8, 4.4 and 4.5 corrected |
| **The subject was defined per placement kind, not per path** (RV2-R2) | H4, M1, M3, L3, L4, L5 | FO3: the subject is a **path**, one part per `.each` (its copy key) and per `resetOn` (its string reset value) from the actor's root to the placement. A writing root trait inside a copy has the copy's key as its subject (2.10's walk). The decline and the `NotSent` requirement apply to every placement with a non-empty path, not only `.each`. The authoring rule becomes "a write key belongs to one subject". The upgrade rule in 2.5 says which shapes adopt and which go to `orphaned` |
| **A freeze cut a lookup into evidence, against rule 17** (RV2-R3) | H2 | FO4: a lookup cut by a freeze **ends** `failure { Interrupted }`, parked and delivered at the thaw. Rule 37 already makes every read map `Interrupted`, so each fragment recovers without a thaw event (F8's Q13 A is then safe); the ending persists with the frozen slice, and a fragment waiting on a live lookup keeps a recurring schedule for reloads (RV3 H1). Rule 17 checked in FO4 |
| **`resetOn` had no `UnresolvedHold` case** | M2 | FO8 states it, with an `idle`-guard default and a Story walk |
| **Small gaps** | L1, L2, L6, L7 | FO6 lists a reset among starts; the other-subject row denies `retryable`; the upload sample lists `onIdle` beside its release; F8 and F9 are reflected throughout |

Revision 2's changes (by RV1's root causes) stay: the subject on the lane (H1), freeze and thaw rules (H2), the
creating turn's raises before adopted endings (M3), the upgrade rule (M4), the contracts' requirements in the summary
(M5), FO8's structural `.each` warning (M6), the M7 root cause sent to the owner (now F8, F9), `Fragment.O` for write
lanes only (M2), FO0's chain rule (M1), and the example fixes.

## 1. The problem and the requirements

### 1.1 Where the data comes from

| Value | Real source | Written in | Changes here |
| --- | --- | --- | --- |
| Request, response, status, body | `fetch`, XHR, `WebSocket`, an SDK (Stripe.js, a socket client) | an Effect service (`DocsApi`, `StripeApi`, `ChatSocket`, `IssuesApi`) whose Layer is the swap point (OD11) | no |
| Cancel | `AbortController`: Flow interrupts the commit's fiber, which aborts the `signal` the adapter passed to `fetch` | the contract's function | no |
| Idempotency key | `attempt.id`, minted by Flow, put on the wire by the commit author (rule 19) | the contract | no |
| Classification | `Outcome.success / failure / unknown` beside the status it reads | the contract (2.7.1) | no |
| Which server thing | the contract's `key`, a list of `input` fields (OD4, OD15) | the contract | no |
| Which event an ending becomes | the operation's `outcomes` | **the fragment's declaration** | moved from the host |
| The input of one commit | the commit's select over the after memory and event (rule 22) | **the fragment's transition** | moved from the host |
| The write lane (`pending`, `uncertain`, `waiting`, `retryCount`) | the Runtime, per (actor identity, contract id, key) | read with `Fragment.O.x.get(s, k)` | identity unchanged (F2) |
| The subject path | the copy keys (host data) and string reset values (host memory) from the actor's root down | the placements | recorded on the lane record when the lane is created (FO3) |
| The releasing mark | the fragment's `whenAbandoned: [O.x.cancel]`, when the incarnation ends | the Runtime, on the lane record | FO12 (decided, F9) |
| A read's or a stream's lane | the incarnation that placed or looked it up | `s.operations.<instance>.<name>` | scoped to the incarnation (FO4) |
| The services the contracts need | Effect's `R` of each contract's function | the fragment's type and summary | carried to the host (FO9) |
| Shared record data | the store (merge 4) | `Issue.get(s, key, shape)` | no |
| What the host learns | the fragment's callbacks, exits and public memory | the host's filling | as today |

### 1.2 When a fragment should own I/O

A fragment should own an operation when **all** of these hold:

1. **The policy is the feature.** What the fragment does with endings (coalesce edits, re-send an unknown with a
   budget, catch up after a gap, roll a like back) is the reusable thing, used in two or more hosts.
2. **The facts are its own.** The workflow facts the endings produce live and die with the fragment, and the host
   needs only a few of them.
3. **Each write key belongs to one subject** (FO3): decided by it (a document's `docId` under a copy keyed by
   `docId`) or unique within it (a comment's `clientId` under a thread). A follow-author button on each post fails
   this (two posts, one author, one lane); a follow button over distinct authors passes.
4. **The host does not need a late result at once.** If the host must react wherever the user has gone (a payment
   that lands after Back moves the user to the receipt), the host owns that operation.

It should not when any fails: a screen used once; a saga across steps; bulk work over a membership (MD 2.7.13's
per-key fan-out limit); host data many writes share.

### 1.3 What must hold

| # | Requirement | Source | Answered by |
| --- | --- | --- | --- |
| Q-a | One write in flight per server thing per actor identity, whichever fragment writes it | D9, rule 21 | FO3 (decided, F2) |
| Q-b | A sent Attempt's ending is always delivered, to something that can act on it, about the same thing | OD5 principle 2, rule 17 | FO3 subject path, FO5, FO6 |
| Q-c | Every hold has an owner, checkable from the fragment and the host's summaries | OD6, rule 45 | FO7, FO8 |
| Q-d | The host cannot reach inside, and no operation has two owners | rule 4 | FO2 (decided, F5) |
| Q-e | A lane survives its fragment and its actor, with no orphan route | OD19 | FO5 (decided, F3) |
| Q-f | Lane records decode without the machine | rule 46, OD22 | FO3: no instance path; the subject path is strings; the mark is a flag |
| Q-g | A host is checked against its fragments' summaries only, types included | rule 10 | FO9 |
| Q-h | One graph, one Runtime, one lane space | MD 1 | FO3, FO5 |
| Q-i | A fragment's I/O is tested alone, against a fixture | rule 11 | FO10 (decided, F7) |
| Q-j | Optional: a fragment without `operations` costs nothing | owner | FO1 (decided, F1) |
| Q-k | Freeze and thaw leave no wait without an ending | RV1 H2, RV2 H2 | FO4 |
| Q-l | Upgrading a host-only write to a fragment loses no persisted lane silently | RV1 M4, RV2 M3 | 2.5 |
| Q-m | **A declared release can never be lost** (by a reload, a parked ending, or many lanes), and is **declared only for worthless work** (guidance, checked by Stories, not by `flow check`) | RV2 H1, H3 | FO12 |

## 2. The design

### 2.1 Thinking about the whole system first

1. **One lane space** (decided, F2). Write lanes, their table (2.7.13), persistence (rule 46), parked endings (OD22),
   `runtime.unsettledWrites()`, Inspection and SSR keep keying by (actor identity, contract id, key).
2. **Binding moves one level down, identity does not.** "Binding actor" becomes "binding incarnation" (2.4).
3. **"Which thing is this incarnation about" is a recorded fact, and it is a path.** A placement's incarnations are
   told apart by every `.each` and `resetOn` above them, not only by their own placement (RV2-R2). So the subject is
   the path of those parts, recorded on the lane. One owner per lane is then true by construction, at any depth.
4. **Every lifecycle verb a fragment has is stated, and every wait it cuts ends in a delivery.** A freeze that turned
   a lookup into evidence left a fragment waiting with no event to wake it (RV2-R3). Each cut wait now ends, so no
   thaw event is needed (F8).
5. **What ends a write's workflow is declared on its lanes, not computed in a turn** (RV2-R1). A release must
   survive the turn that declares it: a reload, a parked ending, an Attempt still on the wire. So it is a mark on the
   lane record that the Runtime honours, as the hold itself is.
6. **A declared release is for worthless work only** (RV2 H3). Releasing interrupts an Attempt on the wire and drops
   queued commits; for user intent (a like, a follow) that is a lost write. The hold remains the default (OD6).
7. **The host's environment is part of the contract** (FO9) and **the host graph hides I/O** (stated): `flow graph`,
   `flow explain` and Inspection draw it from the summary.

### 2.2 The rules

**FO0. Scope in v1** (decided, F4, amended by F8; refined, RV1 M1, RV2 L3, L5). A fragment may own a write operation
that maps anything only if **every placement from the actor's root to it** is a root trait (a trait at the root of
the definition, or at the root of such a trait), an `.each` copy, or a `.resumable()` trait, any of which may carry
`resetOn`, and **no subroutine is on the path**. `.each` with `resetOn` is allowed (its path gains two parts). A
`resetOn` on such a placement must return a string, so it can be recorded and persisted: a non-string reset value is a
type error, whose remedy is a joined key (`[sort, status].join("|")`). Elsewhere a fragment may own reads, streams and
bare writes. A violation is a construction error (rule 12). Nested `.each` is out of scope (MD rule 9), so a path
holds at most one copy key.

**FO1. A fragment may declare `operations`** (decided, F1). Same shape and meaning as a definition's (rules 13,
39–43, 47), after `memory` and `traits`. Its endings map onto its own `internalEvents`, which now come from its
schedules or its operations' endings (amends rule 2). It reads no context and sends to no actor. A fragment's domain
write registers the domain for its actor. A fragment without `operations` is unchanged (amends rule 3).

**FO2. Only the fragment acts; the host reads and asks** (decided, F5). Acting members (`commit`, `lookup`,
`subscribe`, `retry`, `cancel`, `refetch`) are typed only in the declaring fragment's body. `Fragment.O` exposes only
its write operations' reads: `get(s, k?)` in views, and `get`, `idle`, `retryable` in a host's guards and
`updateMemory`; they are unambiguous because a write operation is unique per actor (FO3), and they read the operation
at any depth (the board reads `LikeButton.O.set` through `IssueRow`, 2.10). Reads and streams are read
through the instance path, `s.operations.<instance>.<name>`. A host that wants a fragment to stop or retry asks through
its public `events` or `hostEvents`; the fragment decides.

**FO3. Lane identity is unchanged; each lane records its subject path** (identity decided, F2; subject decided as a
concept by F8; path refined, RV2 H4).

- A write lane is (actor identity, contract id, key). `SharedContract` counts every write operation of the
  definition and of every fragment placement in its tree.
- An incarnation's **subject path** lists, from the actor's root down to its placement, one part for each `.each`
  (that copy's key) and one for each `resetOn` (its reset value), in order; any other placement adds nothing. A root
  trait at the actor's root has `[]`; a copy of `docs` has `["d1"]`; a root trait inside copy `X` has `["X"]`; a
  writing `.each` copy with `resetOn` has `[resetValue, copyKey]` in placement order.
- **A `resetOn` part is the incarnation's own reset value** (RV3 M2), recorded when the incarnation is created and
  persisted with its slice. On restore, if a writing placement's re-taken value differs from the recorded one (a
  pending reset was lost by the reload, MD rule 1), the trait is **reset** (its `whenAbandoned` runs), not silently
  re-baselined; so the path always matches the memory that commits.
- When a commit creates a lane (`Idle` → `InFlight`), the lane records the committing incarnation's path. It stays
  until the lane is `Idle` **with no parked ending**, and is persisted with the lane record as an array of strings.
- A member from an incarnation whose path differs from the lane's is **declined**, with existing words: a `commit`
  ends `NotSent { why: "Rejected" }`; a `retry` is evidence `NothingToResend`; a `cancel` does nothing, with
  evidence, as in `Idle`; `retryable` denies `NothingToResend`; `idle` denies by the lane's real state (`InFlight` or
  `Uncertain`); `get` reads the real row. **On every placement whose subject path is not empty, rule 20 requires
  `failure.NotSent` mapped on every mapped write**, since the decline can occur there.
- **Authoring rule: a write key belongs to one subject**, decided by it or unique within it (1.2 item 3). **What
  `flow check` can catch** (RV3 L10): only the case visible from summaries, a contract with `key: []` on a placement
  whose path is not empty (every subject on one lane), warned under the widened `SharedContract`. Beyond that the key
  comes from a closure, so a breach is seen only at runtime: the decline appears in Inspection, and a decline in a
  Story trace is a Story-derived warning, as MD does for list repairs.
- **Two placements of one writing fragment** are a `SharedContract` error; fold one into the other's `.each`
  membership, or split the screen into two actors (stated, RV1 M8).

**FO4. Reads live and die with the incarnation; a freeze ends what it cuts** (refined, RV1 H2, RV2 H2). A fragment's
one-off read lane is (actor, operation, incarnation); its live placements are the incarnation's, and an `activities`
list in a trait body is placed for the incarnation's life, switched by `when`.

- **Ending** the incarnation releases its placements and lookups; nothing is delivered later, because nothing is left
  to receive it (amends rule 17's evidence list: "a fragment's lookup whose incarnation ended").
- **Freezing** a `.resumable()` trait releases its placements, and **ends each of its lookups with `failure {
  Interrupted }`**: the ending is parked **with the frozen slice, which persists it** (Persistence O2, beside its
  frozen schedules), and delivered at the thaw, first among the parked endings (FO6). The shared request continues
  only if another holder needs it (OPS O2). A frozen trait **reset on return** has ended, so its parked
  `Interrupted` endings are evidence (RV3 L6).
- **A live incarnation's lookup is still not persisted** (OD9 Q26, rule 42). A fragment has no restore event, so a
  fragment that waits on a lookup keeps a **recurring** schedule that looks up again (4.2's `resync`,
  `Schedule.spaced`); a recurring schedule persists and ticks after a reload.
- **Thawing** places its `activities` again from the thawed memory, as entering a state does, so a stream resumes from
  the fragment's own position. `Flow.entry` does not fire on thaw (decided, F8).
- **Against rule 17:** every lookup still delivers exactly one ending; a freeze is not added to rule 17's evidence
  releases, it produces an ending. Rule 37 already requires every read operation to map `Interrupted`, so the
  fragment's handler for it (4.2's `CatchUpFailed`) runs at thaw. Against rule 42: only the latest lookup is
  delivered, and the interrupted one is the latest, since a frozen trait issues none; "one-off read lanes are not
  persisted" stays true of the lane, and gains one exception for the ending a freeze parks in its slice. Against rule
  46: no lane record is involved (a read has none), so rule 46 is unchanged; Persistence O2's frozen-slice contents
  gain the parked read endings (amendment 23).

**FO5. Writes outlive the incarnation; their endings go to the subject** (decided, F3). A lane's **binding
incarnation** is the live incarnation at its operation's placement whose subject path is the lane's; for a host
operation it is the actor. At admission, rule 14's owner test runs inside the binding incarnation. With no binding
incarnation (the node left, the copy removed, the trait frozen or reset to another value), the ending's lane and store
effects apply as today (rule 27), and the ending is parked raw on the lane record (OD22) for that path, unless the
lane is releasing (FO12).

**FO6. A starting incarnation adopts its subject's lanes** (decided, F3; refined, RV1 M3, RV2 L1). When an
incarnation starts at a placement (an entry, a copy added for a key, **a reset**, a thaw, the actor's rebind or
restore), it receives, per lane whose path is its own: the parked endings in saved order, then a held head's `unknown {
Restored }` once, then an in-flight Attempt's ending when it lands. A thaw is the same incarnation and receives its
parked endings only (its interrupted lookups first, FO4). These run as follow-up turns at the head of the mailbox
after the starting turn commits, after any pending reset (rule 1), and before any later event addressed to the
incarnation. The starting turn's own raises into the new incarnation run before them. **Documented default:** a
fragment that commits on its creation guards that commit with `O.x.idle(own)`.

**FO7. Adopted endings are handled inside the fragment.** Rule 20's adopted endings (OD22) and rule 45's
`UnresolvedHold` run on the fragment's body alone, over its new-incarnation arrival set (a trait: its own `on`). A
handler reads what it needs from the event (4.1 carries the user's text in `Conflict`). A fragment exit on a branch
that keeps a hold is reported by the same check. Release on leave is not an owner while the incarnation lives.

**FO8. A host that ends a holding placement must be able to start it again** (refined, RV1 L3, M6, RV2 M2). It applies
to every holding write operation that does **not** release on leave (FO12).

- **Node or `.resumable()` placement:** every host transition that can end or freeze the incarnation is an
  `UnresolvedHold` arrival; pass if a transition that starts the placement again is reachable, warning otherwise.
- **`.each`:** reachability is vacuous, so the check is structural: a host transition that writes the `.each` field
  with no `Fragment.O.x.idle` token in its guard is an `UnresolvedHold` warning. Reading lanes in `updateMemory` (4.4's
  keep-busy line) is not a token, so that host keeps the warning or guards with `idle`.
- **`resetOn`:** reachability is vacuous too (the next incarnation needs the same reset value, which closures decide).
  Documented default: the transition that changes the reset value guards with `Fragment.O.x.idle` for the current
  subject. Story walk: "A, B, A adopts A's save".
- At runtime, an incarnation that ends while its path has a non-`Idle` lane leaves an **unplaced** lane, listed by
  Inspection.

**FO9. Summaries carry operations and requirements** (refined, RV1 M5). Per operation: contract id, kind, verb,
concurrency, key fields, mapped events, whether it holds, and **whether it releases on leave** (FO12), including
its **children's** write operations, so `SharedContract` and FO8 work at a host above a nested writing trait (an
explicit exception to rule 10's "hides the level below" for these facts only). The fragment's
type carries the union of its contracts' Effect requirements (`R`), so a host or Story missing `DocsApi` is a type
error. Hosts are checked against summaries only.

**FO10. Stories** (decided, F7). `story.machine(fragment, { id, fixtures })`; `.leave()` and `.enter(input)` on traits;
`Story.ending(Autosave.O.save, …)` (*Story reads: merge 3*). Walks kept as Stories: two copies on one lane, the second
declined (RV1 H1); a freeze during a catch-up, thaw, `Interrupted` is delivered and `resync` looks up again (RV2 H2); a creating raise meeting
an adopted hold (RV1 M3); a copy removed during a save that gets a 412, re-added, the adopted `Conflict` keeps the
user's text (RV1 M9); an upgrade from a host-only lane (RV1 M4); a removed uploading copy, reload, nothing parked, no
unsettled write (RV2 H1); two rows of a nested writing trait, one removed, the other untouched (RV2 H4); "A, B, A"
under `resetOn` (RV2 M2); a reload while frozen during a catch-up, the parked `Interrupted` delivered at thaw, and a
reload while live and owed, `resync` looking up again (RV3 H1); a reload that loses a pending reset, the trait reset
on restore (RV3 M2).

**FO11. A fragment's rows** (refined, RV1 L4). `s.operations.<instance>.<name>` is `undefined` while the incarnation is
inactive, a keyed list of copies under `.each` (rule N1). A write row there lists the lanes whose path is the
incarnation's. Inside the fragment, `operations` (in guards, `updateMemory`, and a keyed schedule's `keys`) is the
fragment's own rows.

**FO12. Release on leave** (decided, F9; specified here, RV2 H1, H3). A fragment lists an operation key-less in
`whenAbandoned`:

```ts
whenAbandoned: [O.put.cancel, callbacks.onIdle],                                     // existing: whenAbandoned, cancel; NEW MEANING (F9): release this subject's lanes on leave; onIdle frees the host's slot (RV2 L6)
```

- **When:** the incarnation ends by removal, leaving or reset. Not on freeze (it has not ended), not on actor disposal
  (OD19: disposal drops nothing; the identity may return).
- **What:** every lane of that operation whose subject path is the ending incarnation's (one subject may own many
  lanes, as a thread owns one per `clientId`). It is a Runtime step in the leaving turn's step 5, reading no memory,
  so rule 22 does not apply and OD8's `KeyRequired` does not apply to `whenAbandoned`.
- **How:** each such lane is marked **releasing** on its lane record (persisted, like the subject), and the cells of
  2.4's releasing rows apply: a held lane is released now, never-sent and queued commits end `NotSent { Cancelled }` as
  evidence, an Attempt on the wire is interrupted, endings already parked for the path become evidence, and every
  later ending (a restore's `unknown { Restored }` included) is applied to the lane and the store and then released,
  never parked. An incarnation of the same path that starts before the lane is `Idle` clears the mark and adopts the
  lane (FO6).
- **Only for worthless work.** Release interrupts a write on the wire and drops queued ones, so a released write may
  never reach the server. Use it for work that is worthless once its subject is gone: a replaced avatar upload, a
  removed attachment, a discarded draft. **Never for user intent that must survive a list refresh:** a like or a
  follow keeps the hold and the host's keep-busy line (decided, F6, F9). The released write may also still land
  unseen (OD20's stated limit).
- `UnresolvedHold` inside the fragment is unchanged; at the host, FO8 does not apply to an operation that releases.

### 2.3 Lifecycle: where every piece goes

| What happens | Reads and streams | A write on the wire or waiting | A held unknown | Delivered to |
| --- | --- | --- | --- | --- |
| Root trait at the actor's root, actor alive | live | runs | held | the trait; never a gap |
| `.each` copy removed | released | runs (Runtime-owned) | held, unplaced | parked for the path; a new copy for the key adopts (FO6); never: stays until the actor ends (decided, F6) |
| A copy removed whose fragment releases on leave (FO12) | released | interrupted; its ending is released when it lands | released now | nothing: evidence |
| `.each` copy added in a turn that also raises into it | the raise runs first | — | — | the raise, then adopted endings (FO6) |
| Two copies, one lane | own | the first path's; another path's commit ends `NotSent { Rejected }` | the first path's | the first path's copy only |
| Writing root trait inside a copy (2.10) | own | the copy's path `["X"]` | `["X"]`'s | copy X's inner trait only |
| `.resumable()` frozen | placements released; lookups end `Interrupted`, parked with the slice (persisted) | runs | held | parked; at thaw the same incarnation, interrupted lookups first; `activities` placed again (FO4) |
| `resetOn` reset (F8) | released; placed again | runs | held | the incarnation with the old value, when it returns (FO6); with FO12, released |
| Node trait left, subroutine left (phase 2) | released | runs | held, unplaced | the next incarnation with the same path |
| Actor disposed | released | unchanged (OD19) | unchanged | the identity's next incarnation, then the path's placement; parked for a persisted identity, evidence otherwise (OD21); a releasing mark survives |
| Rebind or restore | placed per state | delivered when it lands, or released if marked | `unknown { Restored }` once, or released if marked | the incarnation with the lane's path, if active; else parked |
| Runtime disposal, SSR | as MD | as MD | as MD | as MD |

Store and cache effects never wait: a domain write's prediction, confirmation, rollback and marks apply at settlement
(rule 27), and `writes` is on the operation (OD26).

### 2.4 The write lane: the table applies unchanged; binding, subject, freeze and release rows change

The lane's states (`Idle`, `InFlight`, `Held`, `W`), its 16 rows and both policy tables (2.7.13) are unchanged.
Delta:

| Row | Before (MD 2.7.13) | After (proposed) |
| --- | --- | --- |
| **lane created** (`commit` in `Idle`) | mint an Attempt → `InFlight` | as before, and the lane records the committing incarnation's subject path |
| **member from another path** | — | `commit`: `NotSent { Rejected }`, delivered to the asking incarnation, lane unchanged; `retry`: evidence `NothingToResend`; `cancel`: nothing, with evidence; `retryable`: denies `NothingToResend`; `idle`: denies by the lane's state; `get`: the real row |
| **lane becomes `Idle`** | removed | removed once it also holds no parked ending; the path and any mark go with it |
| **dispose** | the binding actor ends | the binding incarnation ends: the actor is disposed, or the incarnation with the lane's path ends. Cells unchanged, except the parking row below |
| **freeze** | — | as dispose for writes; lookups end `Interrupted`, parked (FO4) |
| **rebind** | an incarnation of the same identity starts | an incarnation starts at the placement with the lane's path (an entry, a copy, a reset, the actor's rebind). Cells unchanged; a releasing mark is cleared |
| **thaw** | — | the frozen incarnation resumes: parked endings delivered (interrupted lookups first); `activities` placed again; no `unknown { Restored }`; `W` stays |
| **parking condition** | parked if the identity has a saved record, else evidence | also parked while the actor is alive and no incarnation has the lane's path, unless the lane is releasing; on actor disposal the existing rule decides (OD21) |
| **delivery order** | before any external event of a new actor incarnation | follow-up turns after the starting turn (whose own raises come first), after pending resets, before any later event addressed to the incarnation (FO6) |

**The releasing rows** (FO12; decided, F9). A lane is marked releasing when the incarnation with its path ends and the
operation is listed in that incarnation's `whenAbandoned`. Cells, by state at marking, then for later events:

| Row | `Idle` | `InFlight` | `Held` |
| --- | --- | --- | --- |
| **mark** (leaving turn, step 5) | nothing; a parked ending for the path becomes evidence and the record is removed | on the wire: interrupt (as `cancel`); waiting, never sent: ends `NotSent { Cancelled }`, evidence; a waiting re-send: released (`Released`); every `W` entry ends `NotSent { Cancelled }`, evidence; parked endings become evidence | released (`Released`), with merge 4's store row for `Released` (the record keeps its mark, its queue entry is withdrawn); every `W` entry ends `NotSent { Cancelled }`, evidence; parked endings become evidence |
| **an ending lands** (success, failure, unknown, interrupt) | cannot occur | applied to the lane and store (rule 27), then evidence; an unknown is `Released` evidence; the lane becomes `Idle` | cannot occur |
| **restore** (a reload, persisted identity) | nothing | the restore row's `unknown { Restored }` is applied, then `Released` evidence; nothing is delivered or parked | stays released (it already is) |
| **rebind** (an incarnation with the lane's path starts) | cannot occur | the mark is cleared; the lane is adopted (FO6) | cannot occur |
| **dispose, Runtime disposal** | — | the mark is captured with the lane record; the rows above apply when the ending lands or the record is restored | — |

**Under `cancel` and `allow`** (RV3 L4): a lane in `HeldThisTurn` or `Held (parked)` is released at marking, as
`Held` is; under `allow` the rows apply per Attempt. **Order and capture** (RV3 L5): in step 5 the marks apply after
every member of the turn, so a commit in a copy the same turn removes is marked too; the mark is captured no later
than the actor record that drops the incarnation, so a crash between the two captures cannot lose it.

Every other row is unchanged. OD25's parked `Held` row reads "no binding incarnation" for "no live actor". Inspection
lists a releasing lane as such.

### 2.5 Persistence and rebind

- **A lane record names no instance path.** The operation is found by contract id (FO3).
- **The lane record carries its subject path** (strings) **and its releasing mark** (a flag). Both decode without the
  machine.
- **A recorded path whose shape the placement cannot produce** (RV1 M4, RV2 M3): after a version that moves a write
  from the host into a fragment, adds or removes `resetOn`, or adds or removes a level of `.each`, a lane's recorded
  path no longer fits. It is adopted by key equality only when the placement's last subject part **is the contract's
  single key field**: for `.each`, `by` names that field (4.1: `by: "docId"`, `key: ["docId"]`, so a held save of `d1`
  becomes path `["d1"]`); for `resetOn`, the reset value is that field's value. Otherwise it goes to `orphaned` (P19),
  stated. A subjectless lane adopted by a root trait at the actor's root needs nothing (its path is `[]`).
  Membership of bare strings has no `by`, so it does not pass the test: after 4.4's upgrade (a board with bare-string
  `issueIds`), a held like from the host-only form goes to `orphaned`, stated (RV3 L3).
- Parked endings of an unplaced path are on the lane record (OD22), captured, and listed by Inspection and
  `runtime.unsettledWrites()`; a releasing lane leaves that list once its ending lands.
- A version that removes the fragment's operation sends the lane to `orphaned` (P19).

### 2.6 Static analysis, the single graph, `flow check`

- **One graph.** A fragment's operations are nodes under its placement; `flow graph` and `flow explain` draw them from
  the summary (`docs  SaveDue → commits save (docs/save, reject, one lane per docId, subject = copy key)`). Inspection
  lists every lane with its operation path, subject path, and whether it is **unplaced** or **releasing**.
- **`flow check` adds no finding name.** `SharedContract` widens (F2). `UnresolvedHold` and rule 20's adopted-ending
  check run inside each fragment (FO7) and gain FO8's arrivals and structural warning at the host. Rule 20's `NotSent`
  list gains "a mapped write on a placement whose subject path is not empty (`Rejected`)". An acting member used
  outside its fragment, an FO0 violation and a non-string `resetOn` on a writing placement are construction or type
  errors.
- **Typing.** `Fragment.O` is typed from the declaration and has only write operations' reads. Members are branded
  with their fragment. Key-less `O.x.cancel` type-checks in `whenAbandoned` on any write operation. The fragment's `R`
  reaches the host (FO9).

### 2.7 Keywords

| Word | Status |
| --- | --- |
| `operations` in a trait or subroutine declaration | existing key, NEW MEANING (decided, F1) |
| `O` in a fragment body | existing, NEW MEANING |
| `Fragment.O.<write>.get`, `.idle`, `.retryable` outside the fragment | existing, NEW MEANING (decided, F5); write operations only |
| `activities` in a trait body | existing, NEW MEANING (FO4) |
| `s.operations.<instance>.<name>` | existing path pattern, NEW MEANING (decided, F5) |
| `fixtures`, `.enter`, `.leave` on a fragment Story | existing, NEW MEANING (decided, F7) |
| `resetOn` on a trait that owns a mapped write | existing, NEW MEANING (decided, F8): its string value is a subject part |
| key-less `O.x.cancel` in `whenAbandoned` | existing, NEW MEANING (decided, F9): release on leave |

### 2.8 Wiring every author repeats (open-items item 15)

| Wiring | Where it appears | Same in every app? | Decision |
| --- | --- | --- | --- |
| Keep busy keys in `.each` membership (4.4's `Listed` line) | like, follow | yes, word for word | **keep** (decided, F6, F9): release on leave would drop user intent (RV2 H3). It is one line per host; FO8 warns where it is missing |
| Stop a predecessor by raising its `Cancel` (avatar) | upload | yes | **absorbed** (decided, F9): `whenAbandoned: [O.put.cancel]` in the fragment |
| A list of one so a root trait can change its thing | editor switching documents, avatar | yes | **absorbed** (decided, F8): `resetOn`, its value a subject part |
| The retry-budget triplet (`retryable` else `cancel` and notify; a schedule that `retry`s) | every write | the shape, not the budget, delay or give-up reaction | **keep**: it is what a fragment is for, written once per fragment. A generic reconcile fragment cannot be written (rule 13's exhaustive `failure`) |
| A second `cancel` after `unknown { Cancelled }` to release a user's stop | upload | no: a tombstone clean-up needs the hold (MD 2.7.7) | **keep**; "release on user cancel" goes to `revisit.md` |
| A 0 ms `Flow.entry` schedule to commit on creation | upload | yes, but once per fragment | **keep** (F7: no entry hook); FO6's `idle` default makes it safe |
| Mirroring status from endings into memory for a row | upload, autosave | partly: `pending`, `uncertain`, `progress` are rows already | **keep** |
| Drafts pruned against the list's ids (rule 33) | comments | the shape; what a draft is differs | **keep** |
| View-minted client ids | comments | yes | **keep for now**: a key must exist before the commit (rule 39), and a turn has no randomness source (MD 7 item 12) |
| `writes` invalidation of a thread's list on each post | comments | no | **keep** |
| Toast callbacks with fixed text | like, follow | no | **keep** |

### 2.9 Concept count

| Concept | What it is | Source |
| --- | --- | --- |
| **binding incarnation** | the live incarnation that receives a lane's endings; the actor for a host operation | FO5 |
| **subject path** | the copy keys and string reset values from the actor's root to a placement; recorded on each lane | FO3 (F8, RV2 H4) |
| **unplaced lane** | a non-`Idle` lane with no binding incarnation; its endings are parked | FO5, FO8 |
| **releasing lane** | a lane marked to apply and release every ending, never park | FO12 (F9) |

No new word; two decided new meanings (F8 `resetOn`, F9 key-less `cancel` in `whenAbandoned`); one changed ending (a
freeze-cut lookup ends `Interrupted`, FO4). That is the smallest set review 2 found covering F8 and F9.

### 2.10 The subject path, walked: a writing root trait inside an `.each` copy

```ts
// issuerow.trait.ts                                                                    // user-defined: IssueRow
export const IssueRow = trait(
  { id: "IssueRow", memory: { id: Flow.input(Schema.String) }, traits: { like: LikeButton } },   // existing: traits in a fragment; LikeButton at IssueRow's root
  () => ({ traits: { like: { input: ({ memory }) => ({ id: memory.id }) } } }),
)
// board.definition.ts
traits: { rows: IssueRow.each({ of: "issueIds", max: 500 }) },                             // existing: .each
```

FO0 admits it (an `.each` copy, then a root trait of that copy; no subroutine). The inner `like` incarnation's path is
`["X"]` in row X and `["Y"]` in row Y (FO3).

1. Row X's like ends unknown. The lane (board, `issues/set-like`, `{ id: X }`) records path `["X"]`.
2. A host without 4.4's keep-busy line removes X. Y is live at the same placement, but its path is `["Y"]`, so Y is
   not the binding incarnation. X's endings are parked for `["X"]` (FO5); FO8's structural warning fires on the
   host's `issueIds` write (it fires with the keep-busy line too, which is not a token).
3. Y's own toggles create or use the lane `{ id: Y }` with path `["Y"]`; a stray `retry` from Y on X's lane is
   `NothingToResend` (FO3). Y's rows list only `["Y"]`'s lanes (FO11).
4. X is re-added (a later list holds it): the copy X's inner `like` has path `["X"]`, adopts the
   lane, receives the parked unknown, and its `reconcile` re-sends it.

The same holds under `resetOn`: an Autosave at the root with `resetOn: docId` has path `["d1"]` while on `d1`, and
`["d2"]` after a switch; `d1`'s lanes wait for `["d1"]` (2.3).

## 3. Why these and not the alternatives

| Choice | Taken | Rejected, and why |
| --- | --- | --- |
| Lane identity | unchanged (decided, F2) | the placement in the identity: two writes to one thing at once (D9), records tied to the machine's shape |
| Who handles a lane | its subject path, recorded on the lane (FO3) | **the committing copy on each Attempt** (revision 1): two copies share a lane and deadlock (RV1 H1). **The subject of the placement alone** (revision 2): copies of a nested trait share "nothing" (RV2 H4). **Lanes per subject**: two writes to one thing at once |
| A member from another path | declined with `Rejected`, `NothingToResend`, evidence | allowed (revision 1): a copy re-sends another's write; a new reason: a word for what existing ones say |
| Late endings | parked, delivered to the next incarnation with the path (decided, F3) | a host port (EX), evidence, a lingering tail incarnation |
| Holds after the subject ends | held (decided, F6); released only when the fragment declares the work worthless (F9) | **quiet release**: OD6 forbids. **Flow keeps the copy alive**: hidden membership, rejected in F6. **Release for likes** (revision 2's guidance): loses the user's write (RV2 H3) |
| Release on leave | a mark on the subject's lanes, set by a Runtime step (F9) | **a keyed member in `whenAbandoned`** (revision 2): its select reads after memory (missing or the new incarnation's), names one lane of many, and is lost by a reload or a parked ending (RV2 H1). **Release without interrupting**: to `revisit.md` |
| A lookup cut by a freeze | ends `Interrupted`, delivered at thaw (FO4) | **`Superseded` evidence** (revision 2): a fragment waits forever, and it contradicts rule 17 (RV2 H2). **Keep reads placed while frozen**: deliveries would need a buffer for a trait that cannot react |
| `Flow.entry` on thaw | not fired (decided, F8) | fire it: a decided word's meaning changed for a case FO4 covers |
| `Fragment.O` for reads | not offered (FO2) | ambiguous when a read is placed twice (RV1 M2) |

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
    Conflict: { docId: Schema.String, serverEtag: Schema.String, mine: Schema.String },   // mine: the body the refused save carried (M9)
    Refused: { docId: Schema.String },
    SaveUnsure: Flow.uncertain({ docId: Schema.String }),                             // existing: Flow.uncertain
  },
  memory: { open: Flow.initial(Schema.Array(Doc), []) },                              // existing: Flow.initial
  operations: ({ E }) => ({                                                           // existing
    save: saveDoc.outcomes({                                                          // existing: outcomes
      success: E.Saved.from((v, { key }) => ({ docId: key.docId, etag: v.etag })),   // existing: the mapper's key
      failure: {
        Conflict: E.Conflict.from((r, { key, input }) => ({ docId: key.docId, serverEtag: r.serverEtag, mine: input.body })),
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
      Conflict: { target: "self", updateMemory: ({ memory, event }) => edit(memory, event.docId, (d) => ({ status: "conflict", serverEtag: event.serverEtag, body: d.rev > d.sentRev ? d.body : event.mine })) },
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
      Saved: { etag: Schema.String }, Conflict: { serverEtag: Schema.String, mine: Schema.String }, Refused: {},   // mine: the body the refused save carried (M9)
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
        failure: { Conflict: E.Conflict.from((r, { input }) => ({ serverEtag: r.serverEtag, mine: input.body })), Refused: E.Refused, NotSent: E.Refused },   // existing: the mapper's input
        unknown: E.SaveUnsure,
      }),
    }),
  },
  ({ E, O, callbacks }) => {                                                         // NEW MEANING: O, this fragment's own handles (FO2); no whenAbandoned: a closed document's save is kept for its return (FO6)
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
        Conflict: { target: "self", updateMemory: ({ memory, event }) => ({ status: "conflict", serverEtag: event.serverEtag, body: memory.rev > memory.sentRev ? memory.body : event.mine }) },   // adopted by a fresh copy: keeps the user's text from the event (M9)
        Refused: { target: "self", updateMemory: () => ({ status: "stalled" }), notify: [callbacks.onStalled] },
        SaveUnsure: { target: "self", updateMemory: () => ({ status: "unsure" }) },  // Held; `resend` arms
        ResendDue: [
          { target: "self", guard: [O.save.retryable(own, { times: MAX_RESENDS })], updateMemory: () => ({ status: "saving" }), actions: [O.save.retry(own)] },   // existing: retryable, retry; the same Attempt
          { target: "self", updateMemory: () => ({ status: "stalled" }), actions: [O.save.cancel(own)], notify: [callbacks.onStalled] },   // existing: cancel; give up, release (OD7); the released save may still land, and If-Match turns that into a Conflict (L5)
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
form, a held save of a closed document keeps being reconciled by the `resend` keys over every lane; in the fragment
form it waits for a copy with its subject path (`["d1"]`) to come back (FO6), since Autosave deliberately has no
`whenAbandoned` release: unsaved edits are user intent (FO12). `Close` is guarded in both forms, so a user cannot strand a save; a disposed workspace can,
and the reopened copy then adopts the save, including a `Conflict` that still carries the user's text (M9, FO10's
walk). **Subject:** the copy's key is the document id and the contract's key is `["docId"]`, so each lane's subject
path is its own document (FO3), and a lane left by the host-only form above is adopted by key after the upgrade (2.5).

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
import { Duration, Schedule, Schema } from "effect"
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
        resync: { schedule: Schedule.spaced("5 seconds"), armOn: [E.Missed], send: E.ResyncDue },   // existing: Schedule.spaced (Effect); recurring, so it persists and looks up again after a reload (FO4); ResyncDue is guarded by "owed" and idle
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
        CatchUpFailed: { target: "self" },                                           // the recurring `resync` looks up again
        ResyncDue: [{ target: "self", guard: [({ memory }) => memory.status === "owed" || deny("NotOwed"), O.catchUp.idle], actions: [catchUp] }, { target: "self" }],
        FeedEnded: { target: "self", updateMemory: () => ({ status: "lost" }) },
        FeedLost: [
          { target: "self", guard: ({ memory }) => memory.tries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ status: "lost", tries: memory.tries + 1 }) },
          { target: "self", updateMemory: () => ({ status: "offline" }), notify: [callbacks.onOffline] },
        ],
        RetryFeed: [{ target: "self", guard: ({ memory }) => memory.status === "lost" || deny("NotLost"), updateMemory: () => ({ status: "synced" }) }, { target: "self" }],
        Reconnect: [{ target: "self", guard: ({ memory }) => memory.status === "offline" || deny("NotOffline"), updateMemory: () => ({ status: "synced", tries: 0 }) }, { target: "self" }],   // only from offline, as the before's OFFLINE (L1)
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

**After: a second host** (a support ticket whose discussion tab is the same feed, on a node, `.resumable()`:
leaving the tab freezes it, releasing the session and any catch-up; coming back re-places the session from the frozen
`at`, and a catch-up the freeze cut arrives at the thaw as `Interrupted`, which maps to `CatchUpFailed`; the recurring
`resync` then looks up again, also after a reload, FO4. Without `.resumable()`, every visit would start again from
`{ epoch: "", after: 0 }` and fetch the whole history, which `merge` dedupes but does not avoid: L2).

```ts
// ticket.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LiveFeed } from "./livefeed.trait"

export const Ticket = definition({
  id: "Support/Ticket",
  states: ["DETAILS", { DISCUSSION: Flow.state({ traits: { chat: LiveFeed.resumable() } }) }],   // existing: Flow.state, .resumable(); thaw re-places the feed from `at`, a cut catch-up ends Interrupted (FO4)
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
unchanged; `key: ["id"]`, `latest`. The copy's key is the issue id, so each lane's subject path is its own issue (FO3).
A follow-author button per post would not be: RV1's H1, declined at runtime (section 5).

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
        Listed: { target: "self", updateMemory: ({ memory, operations, event }) => ({ issueIds: [...event.ids, ...memory.issueIds.filter((id) => !event.ids.includes(id) && busy(LikeButton.O.set.get(operations, { id })))] }) },   // NEW MEANING: a host read (FO2); keeps a copy whose like is unresolved (decided, F6, F9: a like is user intent, so it is never released on leave)
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

**Before, the second host** (the same page written host-only, so its saving is measured, not assumed; review 1's 4.5
correction).

```ts
// issuepage.definition.ts (before)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const IssuePage = definition({
  id: "Issues/IssuePage",
  states: ["SHOWING", "GONE"],
  events: { Toggle: { liked: Schema.Boolean } },
  internalEvents: { Settled: {}, Gone: {}, Failed: {}, LikeUnsure: Flow.uncertain({}), ReconcileDue: {} },
  memory: { issueId: Flow.input(Schema.String) },
  operations: ({ E }) => ({ like: Issues.setLike.outcomes({ success: E.Settled, failure: { Gone: E.Gone, Refused: E.Failed, NotSent: E.Failed }, unknown: E.LikeUnsure }) }),
})
```

```ts
// issuepage.machine.ts (before)
import { machine } from "flow-state"
import { IssuePage, MAX_LIKE_RESENDS } from "./issuepage.definition"

export const IssuePageMachine = machine(IssuePage, ({ S, E, O }) => ({
  default: S.SHOWING,
  schedules: { reconcile: { schedule: "3 seconds", armOn: [E.LikeUnsure], send: E.ReconcileDue } },
  on: {
    Toggle: { target: "self", actions: [O.like.commit(({ memory, event }) => ({ id: memory.issueId, liked: event.liked }))] },
    Settled: { target: "self" }, Failed: { target: "self" },
    Gone: S.GONE,
    LikeUnsure: [{ target: "self", guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] }, { target: "self", actions: [O.like.cancel] }],
    ReconcileDue: { target: "self", actions: [O.like.retry(({ memory }) => ({ id: memory.issueId }))] },
  },
  states: { SHOWING: {}, GONE: {} },
}))
```

**Dropped from each host:** `Toggle` with its id, five internal events, the like operation, the keyed reconcile
schedule and six handlers. **Added to the board:** `issueIds` and `Listed` (membership must be memory for `.each`),
and the one line that keeps a copy alive while its like is unresolved. **What does not change:** store effects
(predictions, rollback, `uncertain` marks, the record queue) apply at settlement whether a copy exists or not
(rule 27); two screens liking one issue are two actor identities, ordered by the record queue (rule 29).

### 4.5 Line and character totals

Measured by script over the blocks above: lines are every line of each definition, machine and fragment block,
comments included; characters are code only, without comment lines and trailing comments. Contracts and view comments
are excluded.

| Case | Before (lines / chars) | After: fragment + first host (lines / chars) | First use | Further host, after vs before (lines / chars) | Saved per further host (chars) |
| --- | --- | --- | --- | --- | --- |
| 4.1 Autosave (`.each`) | 93 / 5,769 | 63 + 44 = 107 / 5,273 | +14 lines, **−9 % chars** | 44 / 1,847 vs 93 / 5,769 | 68 % |
| 4.2 Live feed (root; node, resumable) | 94 / 4,353 | 77 + 22 = 99 / 5,683 | +5 lines, +30 % chars | ticket 26 / 940 vs 94 / 4,353 | 78 % |
| 4.3 Checkout (subroutine, phase 2) | 108 / 5,208 | 95 + 27 = 122 / 5,597 | +14 lines, +7 % chars | 27 / 897 vs 108 / 5,208 | 83 % |
| 4.4 Like (`.each`; root) | 54 / 2,305 | 37 + 44 = 81 / 3,317 | +27 lines, +44 % chars | issue page 20 / 610 vs 31 / 1,409 (written, 4.4) | 57 % (35 % of lines) |

Reading it (corrected from revision 1, RV1 section 4):

- **A first use is larger by lines in every case, and by characters in every case but the autosave**, whose before
  writes long one-line handlers that look short by lines.
- **A further host is much smaller** where the fragment carries real policy (feed, checkout, autosave). Where it
  carries little (a single like button), the saving is about a third of the lines, not the 63 % revision 1 implied.
- **`.each` hosts save least** (the board: 54 → 44 lines), because `.each` needs membership in memory and the
  keep-busy line, which likes and follows keep (decided, F6, F9: release on leave would lose the user's write).
- **What the lines hide:** in the before, each host writes its own `unknown` handling and late handlers; in the after,
  they are written and tested once (FO10).

## 5. Tested against very different cases

| Case | Shape | Verdict under v1 (FO0) | Strain |
| --- | --- | --- | --- |
| Search as you type | trait: debounce + `lookup` | fits anywhere (a read) | leaving releases the lookup |
| Infinite pager | trait: `subscribe.each` over loaded pages | fits anywhere | page cache is the resource's |
| Presence heartbeat | trait: stream + a bare `ping` write | fits anywhere | none |
| Notification bell on every screen | root trait: stream + `markSeen` (`latest`, key `[]`) | fits | two screens are two identities, unordered for a plain write (MD 2.7.13) |
| Comment composer per thread | `.each` by thread id: `post` keyed `["clientId"]` | fits | one subject, many lanes: each lane records path `[threadId]`. Sent posts are user intent: keep the hold and a keep-busy line (F6). Release on leave only if the thread itself is deleted, and then only if its posts are worthless (FO12) |
| Follow author on each post | `.each` by post id, key `["userId"]` | **declined at runtime** (FO3, H1) | two posts by one author share a lane; the second copy's commit ends `NotSent { Rejected }`. Write it over distinct authors |
| Follow in a header plus a suggestions list | two placements of one writing trait | `SharedContract` | fold the header into the list's membership (FO3, M8) |
| Comments panel on a tab | node trait with two mapped writes | fits as `.resumable()` (FO4) | thaw re-places its list subscription and delivers parked endings |
| Like inside a row fragment | a root trait inside `IssueRow.each` | fits | path `[issueId]`, inherited from the copy (2.10) |
| Avatar upload (input arrives later) | `Upload.each` of one, or a root trait with `resetOn: ref` | fits (decided, F8, F9) | `whenAbandoned: [O.put.cancel]`: a replaced upload is worthless, so it is released, and the host just replaces its list (RV1 M7 closed) |
| Editor that switches documents | root trait with `resetOn: docId` | fits (decided, F8) | path `[docId]`; with FO8's `idle` guard the switch waits until A's save settles; without it, A's save waits for A. Never released (user intent) |
| Cart quantity stepper per line | `.each`: a domain write | fits (the like again) | bulk "clear cart" is MD's per-key fan-out limit |
| Upload a file (step), two-factor verify (step) | subroutines | **phase 2** (decided, F7) | cross-thing adoption would be closed by a subject part per entry (an entry's input), phase 2's rule |
| Booking saga | host | stays in the host | must refund a late charge at once (1.2 item 4) |
| "Submit with retry" over any contract | EX's `CommitWithRetry` | rejected | `failure` is exhaustive per contract (rule 13) |

## 6. What OD19–OD22 solved from EX's list

| EX item | Status now | Why |
| --- | --- | --- |
| The orphaned ending, `whenOrphaned`, the widened `orphaned`, `UnreconciledOrphan` | **solved, removed** | OD19 (Runtime-owned lanes), OD21 (parked, delivered to the next incarnation), OD22 (parked raw, mapped at delivery); one level down, FO5 and FO6 (decided, F3) |
| Lanes identified by placement | **changed** | OD20's identity; the placement and the subject path say where delivery goes (FO3, FO5) |
| No `.resumable()` beside a write | **solved** | parked endings wait for the thaw; FO4 states what the thaw re-places |
| Persistence by placement path | **solved** | OD20's records decode by contract `input` pick; the lane adds only its subject path and releasing mark (2.5) |
| Incarnation counters for every placement | **not needed** | activation identity for the owner test; the subject path for delivery |
| EX's rule-15 clause | **not needed** | no host turn runs for a fragment's ending |
| "Ending a life never cancels a write" | **solved** for writes by OD19, unless the fragment declares release (F9); reads by FO4 |
| `ExitWithCallInFlight` | **replaced** by FO7 |
| Rule 20 over the late set | **replaced** by OD22's adopted-ending rule over the fragment's arrival set (FO7) |
| `.public()` | answered by the schedules precedent (decided, F5) |
| `start` | dropped (decided, F7) |
| Summaries, Stories fixtures | FO9, FO10 |

## 7. What breaks or changes in the merged design

Exact amendments to MD if accepted. None is applied; each waits for the owner's yes.

1. **Section 1**, fourth bullet: "Fragments are locked islands of logic with no I/O" → "…with no I/O of their own,
   unless they declare `operations` (FO1)".
2. **2.1 Reading**: add "a fragment's operations: `s.operations.<instance>.<name>` (FO11); write lanes by key with
   `Fragment.O.x.get(s, k)` (FO2)".
3. **2.2.1 `Flow.entry`**: add "not on a thaw (F8)".
4. **2.2.2**, last sentence: "Fragments may not declare `operations`, `activities`, …" → "Fragments may not declare
   `context`, `onContext`, `send` or persistence; a trait body may hold `activities` (FO1, FO4)".
5. **2.3**, row "Running I/O and mapping endings": add "or a fragment's declaration and body (FO1)".
6. **2.6 key order**: a machine or fragment body gains `activities` before `schedules`.
7. **Rule 1**: `.resumable()`: "Freezing releases the trait's placements and ends its lookups `failure { Interrupted
   }`, parked; thawing delivers its parked endings and places its `activities` again (FO4)". `resetOn`: "on a trait
   that owns a mapped write, the reset value is a string and a subject part, recorded with the slice; on restore a
   differing re-taken value resets the trait instead of re-baselining it (FO0, FO3); `whenAbandoned` with a release
   runs on reset (FO12)".
8. **Rule 2**: `internalEvents` of a fragment also come from its operations' endings.
9. **Rule 3**: replaced by FO1 and FO0.
10. **Rule 4**: the host reads a fragment's write lanes and asks through its public events; it cannot act (FO2).
11. **Rule 6**, `whenAbandoned`: "may list a write operation's key-less `O.x.cancel`, which releases that operation's
    lanes of this incarnation's subject path (FO12); it reads no memory, and `KeyRequired` does not apply".
12. **Rule 8**: call endings go "to the binding incarnation, or parked for the lane's subject path, or released if the
    lane is releasing (FO5, FO12)".
13. **Rule 9**: add "a lane created by a copy's commit records the copy's key as a part of its subject path (FO3)".
14. **Rule 10**: summaries record operations, the contracts' requirements and release on leave (FO9).
15. **Rule 11**: `story.machine(fragment, { id, fixtures })`; `.enter` and `.leave` on traits (FO10).
16. **Rule 12**: construction errors add an acting member used outside its fragment, FO0's chain rule and a
    non-string `resetOn` on a writing placement.
17. **Rule 14**: the owner test runs inside the binding incarnation; the parked case (FO5).
18. **Rule 17**: "to a live incarnation of its identity or to its saved record" → "…of its identity with the lane's
    subject path, or parked for it (FO5)"; evidence gains "a fragment's lookup whose incarnation ended" and "an
    ending of a releasing lane" (FO4, FO12). A freeze is not an evidence release: it ends the lookup (FO4).
19. **Rule 20**: adopted endings over the declaring fragment's arrival set (FO7); the `NotSent` list adds "a mapped
    write on a placement whose subject path is not empty (`Rejected`)" (FO3).
20. **Rule 21**: "binding actor" → "binding incarnation"; the lane records a subject path and may be releasing;
    members from another path are declined (FO3, 2.4).
21. **Rule 24**: add "a release on leave (FO12) acts on every lane of the subject path, by 2.4's releasing rows".
22. **Rule 40**: `SharedContract` counts every write operation in the actor's placement tree (decided, F2).
23. **Rules 37 and 42**: a fragment's one-off read lane is (actor, operation, incarnation); ending the incarnation
    releases it; a freeze ends it `failure { Interrupted }`, parked with the frozen slice and delivered at the thaw;
    rule 42's "one-off read lanes are not persisted" gains that one exception; **Persistence O2**: a frozen slice
    also persists its parked read endings. Rule 46 is unchanged (FO4).
24. **Rule 44**: add FO6 (adoption by subject path, starts include a reset, follow-up turns after the starting turn's
    raises, thaw; a releasing mark cleared by an incarnation of the path).
25. **Rule 45**: add FO8's arrivals, its structural `.each` warning and its `resetOn` default; none for an operation
    that releases on leave.
26. **Rule 46**: "A lane record names no instance path and carries its subject path and releasing mark; a recorded
    path the placement cannot produce is adopted by key equality only when the last part is the contract's single key
    field, else goes to `orphaned` (2.5)".
27. **2.5 step 1**: the owner test runs in the binding incarnation; an ending with none is parked or, if releasing,
    released. **Step 3**: leaving appends FO12's marks after `whenAbandoned`'s notifications. **Step 5**: a member from
    another path is declined; the marks' cells apply after every member. **Step 6**: "freeze resumable ones" adds
    "ending each of their lookups `failure { Interrupted }`, parked with the slice (FO4)"; after pending resets, queue
    FO6's deliveries.
28. **2.7.13**: the "Owner" paragraph reads "binding incarnation"; 2.4's delta and releasing rows.
29. **2.7.14** item 2: arrivals inside a fragment (FO7); new item 5: FO8.
30. **2.7.16**: `SharedContract` and `UnresolvedHold` widened; `flow explain` prints fragment operations and their
    subject; Inspection shows unplaced and releasing lanes; no new finding names.
31. **3.6 Keywords**: the new meanings of 2.7.
32. **Section 5**: Machines O1 (fragments declare operations; `Fragment.O`; `resetOn` and `whenAbandoned` as above),
    Machines O5 (`Flow.entry` not on thaw), Runtime O3/V4 (binding incarnation; subject paths; releasing marks),
    Persistence O2/O6 (the subject path and mark on the lane record; parking in a live actor), Testing O1 (fragment
    Stories), Inspection O1 (subject paths, unplaced and releasing lanes), CommandLine O5 (amendments 16, 19, 25,
    30), React O4 (views read `Fragment.O.x.get`), EntityDomains O1 (a fragment's domain write registers its
    domain; `Released` on a releasing lane keeps the record's mark).
33. **Section 6**: delete "Fragment I/O" and "Nested request relays"; "Operations in fragments" points here.
34. **Merge 3** (not merged): fragment Stories have `fixtures` (FO10).
35. **Merge 6** (not merged): a trait body's `activities` places a stream for the incarnation's life; freeze releases
    it and thaw places it again (FO4).

36. **Rule 16** (declines): add "under every concurrency, a commit from an incarnation whose subject path differs
    from the lane's ends `NotSent { why: "Rejected" }`; the transition runs (FO3)".
37. **Rule 41**: `activities` is a list of placements "in a state or a trait body (FO4)".
38. **Rule 43** (`KeyRequired`): add "except a key-less `O.x.cancel` in `whenAbandoned`, which names every lane of the
    incarnation's subject path (FO12)".
39. **Rule 23 and N1**: inside a fragment, `keys` and guards read the fragment's own rows; a write row under `.each`
    lists only the lanes of that copy's path (FO11).
40. **MD 2.1's lifecycle table**, row "On ending, except by an exit or a freeze": add "and releases the subject's lanes
    of every operation it lists (FO12)".
41. **`flow check`**: a contract with `key: []` on a writing placement whose path is not empty is a `SharedContract`
    warning (FO3, RV3 L10).

## 8. Risks

1. **Late results reach the user late (phase 2).** A subroutine or node trait that is left holds its result until a
   new incarnation with the same path starts (4.3). F4 keeps this out of v1.
2. **A subject that never returns strands its hold** (decided as a stated limit, F6). FO8's warnings and Inspection
   make it visible; release on leave covers worthless work (F9); user intent keeps the keep-busy line. Meanwhile a
   domain write's record queue blocks other actors' writes to that record (MD 2.7.13).
3. **Release on leave misused.** Listing a like's or a follow's operation in `whenAbandoned` drops writes on a list
   refresh. `flow check` cannot tell worthless from wanted; the guidance (FO12) and Stories are the defence.
4. **The subject rule is not static.** Whether a write key belongs to one subject is a closure, so `flow check`
   cannot see a follow-author-per-post mistake; the runtime decline and Stories do.
5. **Every placement with a non-empty path requires `NotSent` mapped** on its mapped writes (the decline), which adds
   a mapping some `latest` writes did not need.
6. **The host graph hides I/O.** `flow graph`, `flow explain` and Inspection must show summaries well.
7. **Parked endings in a live actor accumulate** for paths that never return (bounded by distinct keys; an age bound
   goes to `revisit.md`).
8. **Typing** is unspiked: `Fragment.O`, branded members, key-less `cancel` in `whenAbandoned`, rows under `.each`,
   the fragment's `R` reaching the host, `operations: ({ E })` ordering, string-only `resetOn` on writing placements.
9. **`SharedContract` per actor is stricter** (decided, F2): two placements of one writing trait need folding (FO3).

## 9. Open questions for the owner

None. Q1–Q13 are answered (F1–F9) and removed.

**For `revisit.md` (proposed, not written there):**

- The subject path as phase 2's admission rule for node traits and subroutines (an entry's input as a subject part).
- One fragment's placements sharing an operation when their paths differ (RV1 M8).
- "Release on user cancel", so `unknown { Cancelled }` needs no second `cancel`.
- Releasing without interrupting (let the request finish, release only the hold), if a real case needs it beside
  FO12's rule (RV2).
- An age bound on a parked ending whose path never returns (RV2; risk 7).
- Per-copy fan-out of write members (MD 2.7.13's limit, unchanged).
