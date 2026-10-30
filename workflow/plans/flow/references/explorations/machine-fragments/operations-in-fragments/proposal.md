# Proposal: operations owned by fragments (revision 2)

**Status: proposal.** F1–F7 are decided by the owner ([decisions.md](decisions.md), 2026-10-30) and marked
*decided (Fn)* where they appear. Everything else is **proposed**, including every refinement of a decided rule that
revision 2 makes; section 9 lists what still needs the owner. Revision 1 (commit `00678be6`) is prior art; this
revision keeps what worked and fixes [reviews/review-1.md](reviews/review-1.md)'s findings at their root. No other
file is edited. No type spike was built; every code sample is a working draft and was not type-checked.

It builds on [../machine-design.md](../machine-design.md) as merged (short name **MD**; decisions OD1–OD26 in
[../merged/operations/decisions.md](../merged/operations/decisions.md)). [exploration.md](exploration.md) (**EX**) is
older prior art. Streams use merge 6's syntax ([../merge-6-streams/proposal.md](../merge-6-streams/proposal.md),
**M6**, accepted, not merged). Review 1 is **RV1**; its findings are cited as H1, M3, L2, and its root causes as
RV1-R1 to RV1-R4.

Marks in code: `// NEW` (a word that does not exist), `// NEW MEANING` (an existing word in a new place),
`// RENAMED`, `// existing`, `// user-defined`. **Revision 2 adds no new word.** One existing word gains a new
place only if the owner accepts Q12 (`cancel` in `whenAbandoned`). A line with no mark uses only words marked earlier
in the same block, or user-defined names.

Rules are **FO0–FO11** ("fragment operations").

## 0. In short

- **The design in one sentence.** A fragment declares `operations` as a definition does and is the only thing that
  may act on them; its write lanes stay the Runtime's lanes, identified by (actor identity, contract id, key); each
  lane records the **subject** of the incarnation that created it (an `.each` copy's key, or nothing for a root or
  resumable trait), and its endings go to the live incarnation with that subject, or are parked until one starts
  (OD19–OD22 one level down).
- **Decided:** F1 opt-in, traits first; F2 identity unchanged, `SharedContract` per actor; F3 parked endings go to
  the next incarnation; F4 v1 scope; F5 hosts read lanes; F6 a removed copy's hold is a stated limit; F7 subroutine
  writes in phase 2, fragment Stories, no entry hook, `cancel` in `whenAbandoned` deferred.
- **New words: none.** The subject is a concept, recorded by the Runtime.
- **Owner questions (section 9):** Q11 allow `resetOn` on a writing root trait, now that the reset value can be the
  subject (amends F4); Q12 allow `cancel` in `whenAbandoned` as "release when this incarnation ends" (amends F6 and
  reverses F7's deferral); Q13 whether `Flow.entry` fires on a thaw (recommended: no).
- **Honest judgement.** A first use is larger by lines in every case, and by characters in all but the autosave
  (4.5). Every further host is 57–83 % smaller by characters. The gain is a reconcile policy written and tested once;
  the cost is a write that outlives its fragment is handled only when its subject comes back, unless Q12 lets the
  fragment release it.

## Revision 2: what changed, by root cause

| Root cause | Findings | Change |
| --- | --- | --- |
| **The incarnation's subject was implicit and recorded per Attempt** (RV1-R1) | H1, M4, M8, M1 at runtime | FO3 names the **subject** and records it **on the lane** when the lane is created. Members from an incarnation of another subject are declined, with existing endings and evidence. Delivery is by the lane's subject. FO5's per-Attempt copy key is gone. A subjectless lane from a host-only version is adopted by key equality (2.5, M4) |
| **Lifecycle verbs defined "one level down" by analogy** (RV1-R2) | H2, M3, L3, M6 | FO4 states what freeze releases and what thaw re-places. FO6 states that the creating turn's own raises come before adopted endings, with a documented `idle` default. FO8 is said to be vacuous for `.each` and gains a structural warning |
| **The summary did not carry what the host's environment needs** (RV1-R3) | M2, M5, L4 | `Fragment.O` exposes write lanes only; reads go through the instance path. FO9 carries the contracts' Effect requirements. A fragment's `keys` read its own rows |
| **FO0 checked one placement, not the chain** | M1 | FO0 reads every placement from the actor's root, and no subroutine on the path |
| **The worst friction: a thing that changes in the actor's life** (M7 with F6) | M7, M8, RV1-R4 | The cause is **F6 together with F7's deferral**: an ending incarnation has no way to say "my writes end with me", so every host keeps busy predecessors in membership and stops them by raising events. F4's `resetOn` ban is a second, smaller cause, needed only while subjects were not recorded. Both go to the owner as Q12 and Q11, not worked around |
| **Wiring every author repeats** (RV1-R4; open-items item 15) | friction table | 2.8 audits each piece: absorb, keep, or owner question |
| **Example errors** | M9, L1, L2, L5, L6 | 4.1 keeps the user's text through an adopted `Conflict`; 4.2 takes `Reconnect` only when offline, and the ticket's feed is `.resumable()`; comments name the released-landing limit; FO2 says a host may ask through public events |
| **Two 4.5 readings** | RV1 section 4 | "A first use is larger" holds by lines, not by characters for 4.1; the like's further host is measured against a written host-only page (4.4), saving 35 % of lines, not 63 % |

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
| The write lane (`pending`, `uncertain`, `waiting`, `retryCount`) | the Runtime, per (actor identity, contract id, key) | read with `Fragment.O.x.get(s, k)` | identity unchanged (F2); the lane also records its **subject** (FO3) |
| The subject | the copy's key under `.each` (host data); nothing for a root or resumable trait | the placement | **new concept**, persisted on the lane record |
| A read's or a stream's lane | the incarnation that placed or looked it up | `s.operations.<instance>.<name>` | scoped to the incarnation (FO4) |
| The services the contracts need | Effect's `R` of each contract's function | the fragment's type and summary | carried to the host (FO9, M5) |
| Shared record data | the store (merge 4) | `Issue.get(s, key, shape)` | no |
| What the host learns | the fragment's callbacks, exits and public memory | the host's filling | as today |

### 1.2 When a fragment should own I/O

A fragment should own an operation when **all** of these hold:

1. **The policy is the feature.** What the fragment does with endings (coalesce edits, re-send an unknown with a
   budget, catch up after a gap, roll a like back) is the reusable thing, used in two or more hosts.
2. **The facts are its own.** The workflow facts the endings produce live and die with the fragment, and the host
   needs only a few of them.
3. **Each write's key is decided by the incarnation's subject** (FO3): the actor for a root trait, the copy's key
   under `.each`. A follow-author button on each post is wrong (two posts, one author, one lane); a follow button over
   distinct authors is right.
4. **The host does not need a late result at once.** If the host must react wherever the user has gone (a payment
   that lands after Back moves the user to the receipt), the host owns that operation.

It should not when any fails: a screen used once; a saga across steps; bulk work over a membership (MD 2.7.13's
per-key fan-out limit); host data many writes share.

### 1.3 What must hold

| # | Requirement | Source | Answered by |
| --- | --- | --- | --- |
| Q-a | One write in flight per server thing per actor identity, whichever fragment writes it | D9, rule 21 | FO3 (decided, F2) |
| Q-b | A sent Attempt's ending is always delivered, **to something that can act on it, about the same thing** | OD5 principle 2, rule 17 | FO3 subject, FO5, FO6 |
| Q-c | Every hold has an owner, checkable from the fragment and the host's summaries | OD6, rule 45 | FO7, FO8 |
| Q-d | The host cannot reach inside, and no operation has two owners | rule 4 | FO2 (decided, F5) |
| Q-e | A lane survives its fragment and its actor, with no orphan route | OD19 | FO5 (decided, F3) |
| Q-f | Lane records decode without the machine | rule 46, OD22 | FO3: no instance path; the subject is a string |
| Q-g | A host is checked against its fragments' summaries only, **types included** | rule 10 | FO9 |
| Q-h | One graph, one Runtime, one lane space | MD 1 | FO3, FO5 |
| Q-i | A fragment's I/O is tested alone, against a fixture | rule 11 | FO10 (decided, F7) |
| Q-j | Optional: a fragment without `operations` costs nothing | owner | FO1 (decided, F1) |
| Q-k | **Freeze and thaw leave no read silently dead** | RV1 H2 | FO4 |
| Q-l | **Upgrading a host-only write to a fragment loses no persisted lane** | RV1 M4 | 2.5 |

## 2. The design

### 2.1 Thinking about the whole system first

1. **One lane space** (decided, F2). The Runtime's write lanes, their table (2.7.13), persistence (rule 46), parked
   endings (OD22), `runtime.unsettledWrites()`, Inspection and SSR keep keying by (actor identity, contract id, key).
2. **Binding moves one level down, identity does not.** "Binding actor" becomes "binding incarnation" (2.4).
3. **"Which thing is this incarnation about" must be a recorded fact, not a claim about placement kinds** (RV1-R1).
   Revision 1 inferred it from the placement and wrote the copy key on each Attempt, so two copies could share one
   lane while each Attempt named a different copy (H1). A lane is the server thing; the subject is "whose workflow
   handles it". Recording the subject on the lane makes one owner per lane true by construction, enforces F4 at
   runtime, and gives phase 2 a direct admission rule for `resetOn` and node traits (a reset value is a subject).
4. **Every lifecycle verb a fragment has must be stated, not inherited.** An actor has no freeze, no same-turn
   raise into a newborn, and no `when`; a fragment has all three (RV1-R2). Each gets a row (2.4).
5. **What ends a write's workflow is the author's decision, and today it has no place to be written** (M7). For a
   document, a closed doc's save should wait for the doc to return; for an avatar pick or a comment draft, the
   subject never returns. The merged design deliberately has no quiet release (OD6). So the release must be
   *declared* by the fragment, at the moment its incarnation ends. That is Q12, the root fix for F6's friction.
6. **The host's environment is part of the contract** (RV1-R3). A fragment that needs `DocsApi` must make every host
   need it, in types, or a host Story compiles and dies at its first commit.
7. **The host graph hides I/O** (stated, revision 1). `flow graph`, `flow explain` and Inspection draw it from the
   summary.

### 2.2 The rules

**FO0. Scope in v1** (decided, F4; refined, M1). A fragment may own a write operation that maps anything only if
**every placement from the actor's root to it** is a root trait (a trait at the root of the definition, or at the root
of such a trait), an `.each` copy, or a `.resumable()` trait without `resetOn`, and **no subroutine is on the path**.
Elsewhere a fragment may own reads, streams and bare writes. A violation is a construction error (rule 12). Q11 would
admit `resetOn` on a root or resumable trait whose reset value is a string.

**FO1. A fragment may declare `operations`** (decided, F1). Same shape and meaning as a definition's (rules 13,
39–43, 47), after `memory` and `traits`. Its endings map onto its own `internalEvents`, which now come from its
schedules or its operations' endings (amends rule 2). It reads no context and sends to no actor. A fragment's domain
write registers the domain for its actor. A fragment without `operations` is unchanged (amends rule 3).

**FO2. Only the fragment acts; the host reads and asks** (decided, F5; refined, M2, L6). Acting members (`commit`,
`lookup`, `subscribe`, `retry`, `cancel`, `refetch`) are typed only in the declaring fragment's body. `Fragment.O`
exposes **only its write operations' reads**: `get(s, k?)` in views, and `get`, `idle`, `retryable` in a host's guards
and `updateMemory`. They are unambiguous because a write operation is unique per actor (FO3). A fragment's reads and
streams, which may be placed twice (they are exempt from `SharedContract`), are read only through the instance path,
`s.operations.<instance>.<name>`. A host that wants a fragment to stop or retry asks through the fragment's public
`events` or `hostEvents` (a `Cancel`); that is intended, and the fragment decides.

**FO3. Lane identity is unchanged; each lane records its subject** (identity decided, F2; subject proposed,
RV1-R1).

- A write lane is (actor identity, contract id, key). `SharedContract` counts every write operation of the
  definition and of every fragment placement in its tree.
- An incarnation's **subject** is the copy's key under `.each`, and nothing for a root or `.resumable()` trait (and,
  under Q11, the reset value). When a commit creates a lane (`Idle` → `InFlight`), the lane records the committing
  incarnation's subject. The subject stays until the lane is `Idle` again, and is persisted with the lane record.
- A member from an incarnation whose subject differs from the lane's is **declined**, with existing words: a
  `commit` ends `NotSent { why: "Rejected" }` (so under `.each`, rule 20 requires `NotSent` mapped on every mapped
  write); a `retry` is evidence `NothingToResend` (this incarnation has nothing on that lane); a `cancel` does
  nothing, with evidence, as in `Idle`. `idle` denies by the lane's real state (`InFlight` or `Uncertain`), so a
  button that `check()`s shows the truth. `get` reads the real row: the thing is busy, whoever owns it.
- **Authoring rule.** Under `.each`, the write's key should be decided by the copy's key. `flow check` cannot see it
  (the key comes from a closure); a Story sees the decline, and Inspection lists it.
- **Two placements of one writing fragment** are a `SharedContract` error. The pattern (M8): fold the extra
  placement into the `.each` membership and render it from its copy (`E.follow.key(userId)`), or split the screen
  into two actors (two plain writes to one thing are then unordered; domain writes stay ordered by the record queue).
  Phase 2 may let one fragment's placements share an operation when their subjects differ.

**FO4. Reads live and die with the incarnation; freeze releases them, thaw places them again** (refined, H2). A
fragment's one-off read lane is (actor, operation, incarnation); its live placements are the incarnation's, and an
`activities` list in a trait body is placed for the incarnation's life, switched by `when`. Ending the incarnation
releases them (rule 42, M6 rule 44). **Freezing** a `.resumable()` trait releases its placements and its one-off
reads; a released lookup's settlement is `Superseded` evidence. **Thawing** places its `activities` again from the
thawed memory, as entering a state does, so a stream resumes from the fragment's own position. A fragment has no thaw
event (Q13 keeps `Flow.entry`'s meaning): a fragment that waits on a lookup arms a schedule for it, and a frozen
schedule that is overdue fires once on return (rule 1). 4.2's `resync` is that schedule.

**FO5. Writes outlive the incarnation; their endings go to the subject** (decided, F3; restated with the subject).
A lane's **binding incarnation** is the live incarnation at its operation's placement **whose subject is the lane's**;
for a host operation it is the actor. At admission, rule 14's owner test runs inside the binding incarnation (owner
alive → current; an ended activation of it → late inside the fragment; never an activation of it → current from its
active leaf). With no binding incarnation (the node left, the copy removed, the trait frozen), the ending's lane and
store effects apply as today (rule 27), and the ending is parked raw on the lane record (OD22) for that subject.

**FO6. A starting incarnation adopts its subject's lanes** (decided, F3; order refined, M3). When an incarnation
starts at a placement (an entry, a copy added for a key, a thaw, the actor's rebind or restore), it receives, per lane
whose subject is its own: the parked endings in saved order, then a held head's `unknown { Restored }` once, then an
in-flight Attempt's ending when it lands. A thaw is the same incarnation and receives its parked endings only. **These
run as follow-up turns at the head of the mailbox after the starting turn commits, after any pending reset (rule 1),
and before any later event addressed to the incarnation.** The starting turn's own raises into the new incarnation
(rule 9: a source may add a key and raise into it) run before them, in the starting turn. **Documented default:** a
fragment that commits on its creation guards that commit with `O.x.idle(own)`, so a creating raise that meets an
adopted hold is a denied transition, not a `NotSent` the user sees.

**FO7. Adopted endings are handled inside the fragment.** Rule 20's adopted endings (OD22) and rule 45's
`UnresolvedHold` run on the fragment's body alone, over its new-incarnation arrival set (a trait: its own `on`; a
subroutine: its default leaf and every leaf reachable from it). A handler reads what it needs from the event, which
matters more here than for an actor, because a fragment incarnation ends far more often (M9: 4.1 carries the user's
text in `Conflict`). A fragment exit on a branch that keeps a hold is reported by the same check.

**FO8. A host that ends a holding placement must be able to start it again** (refined, L3, M6).

- For a node or `.resumable()` placement: every host transition that can end or freeze the incarnation of a
  placement whose summary lists a holding write is an `UnresolvedHold` arrival; the owner is the next incarnation
  there; pass if a transition that starts one is reachable from the target, warning otherwise.
- For `.each` that reachability check is vacuous (any write of the field may re-add the key), so it is replaced by a
  **structural** warning, by analogy with rule 16's `idle` warning: a host transition that writes an `.each` field
  whose fragment holds (and, under Q12, does not release on leave), with no `Fragment.O.x.idle` token in its guard, is
  an `UnresolvedHold` warning. A host that reads lanes in `updateMemory` (4.4's keep-busy line) is not a token, so
  it still gets the warning, and accepts it or guards with `idle`.
- At runtime, removing a copy whose subject has a non-`Idle` lane is listed by Inspection as an **unplaced** lane.

**FO9. Summaries carry operations and requirements** (refined, M5). A fragment's summary records, per operation:
contract id, kind, verb, concurrency, key fields, mapped events, whether it holds, and (under Q12) whether it releases
on leave. The fragment's type carries the union of its contracts' Effect requirements (`R`), so a host machine's `R`
includes it and `story.machine(host, { fixtures })` or the app's Layer that misses `DocsApi` is a type error, as
Effect does everywhere. Hosts are checked against summaries only.

**FO10. Stories** (decided, F7). `story.machine(fragment, { id, fixtures })`; `.leave()` and `.enter(input)` on
traits; `Story.ending(Autosave.O.save, …)` (*Story reads: merge 3*). The walks to keep as Stories: two copies on one
lane, the second declined (H1); freeze during a catch-up, thaw, the overdue `resync` re-looks-up (H2); a creating raise
meeting an adopted hold (M3); a copy removed during a save that gets a 412, re-added, the adopted `Conflict` keeps the
user's text (M9); an upgrade from a host-only lane (M4).

**FO11. A fragment's rows** (refined, L4). `s.operations.<instance>.<name>` is `undefined` while the incarnation is
inactive, a keyed list of copies under `.each` (rule N1). A write row there lists the lanes whose subject is the
incarnation's. Inside the fragment, `operations` (in guards, `updateMemory`, and a keyed schedule's `keys`) is the
fragment's own rows, keyed as the host's are.

### 2.3 Lifecycle: where every piece goes

| What happens | Reads and streams | A write on the wire or waiting | A held unknown | Delivered to |
| --- | --- | --- | --- | --- |
| Root trait, actor alive | live | runs | held | the trait; never a gap |
| `.each` copy removed | released | runs (Runtime-owned) | held, unplaced | parked for the subject; a new copy for the key adopts (FO6); never: stays until the actor ends (decided, F6), or released at once under Q12 |
| `.each` copy added in a turn that also raises into it | the raise runs in the starting turn | — | — | the raise first, then adopted endings (FO6) |
| Two copies, one lane (H1) | own | the first subject's; the second's commit ends `NotSent { Rejected }` (FO3) | the first subject's | the first subject's copy only |
| `.resumable()` frozen | released (lookups `Superseded`) | runs | held | parked; at thaw, the same incarnation; `activities` placed again from its memory (FO4) |
| `resetOn` reset (Q11) | released, re-placed | runs | held | the incarnation whose reset value is the lane's subject; a return to that value adopts |
| Node trait left, subroutine left (phase 2) | released | runs | held, unplaced | the next incarnation with the same subject; FO8 at the host |
| Actor disposed | released | unchanged (OD19) | unchanged | the identity's next incarnation, then its subject's placement; parked for a persisted identity, evidence otherwise (OD21) |
| Rebind or restore | re-placed per state | delivered when it lands | `unknown { Restored }` once | the placement's incarnation with the lane's subject, if active; else parked |
| Runtime disposal, SSR | as MD | as MD | as MD | as MD |

Store and cache effects never wait: a domain write's prediction, confirmation, rollback and marks apply at settlement
(rule 27), and `writes` is on the operation (OD26).

### 2.4 The write lane: the table applies unchanged; binding, subject and freeze rows change

The lane's states (`Idle`, `InFlight`, `Held`, `W`), its 16 rows and both policy tables (2.7.13) are unchanged.
Delta:

| Row | Before (MD 2.7.13) | After (proposed) |
| --- | --- | --- |
| **lane created** (`commit` in `Idle`) | mint an Attempt → `InFlight` | as before, and the lane records the committing incarnation's subject |
| **member from another subject** (new) | — | `commit`: ends `NotSent { Rejected }`, delivered to the asking incarnation, lane unchanged; `retry`: evidence `NothingToResend`; `cancel`: nothing, with evidence; `idle`: denies by the lane's state; `get`: the real row |
| **lane becomes `Idle`** | the lane is removed | as before; the subject goes with it |
| **dispose** | the binding actor ends | the binding incarnation ends: the actor is disposed, or the incarnation with the lane's subject ends. Cells unchanged |
| **freeze** (new) | — | as dispose for writes; the incarnation's placements and lookups are released (FO4) |
| **rebind** | an incarnation of the same identity starts | an incarnation starts at the placement **with the lane's subject**. Cells unchanged |
| **thaw** (new) | — | the frozen incarnation resumes: its `activities` are placed again; parked endings delivered; no `unknown { Restored }`; `W` stays |
| **parking condition** | parked if the identity has a saved record, else evidence | also parked while the actor is alive and no incarnation has the lane's subject; when the actor is disposed, the existing rule decides (OD21) |
| **delivery order** | before any external event of a new actor incarnation | follow-up turns after the starting turn (whose own raises come first), after pending resets, before any later event addressed to the incarnation (FO6) |
| **release on leave** (Q12 only) | — | the incarnation ends with `O.x.cancel(own)` in `whenAbandoned`: in `Held`, released now (`Released`); waiting, never sent: `NotSent { Cancelled }`, evidence; on the wire: interrupted, and the ending that lands with no incarnation of that subject is applied and then released instead of parked (an unknown is `Released` evidence). Every queued commit (`W`, all of that subject, FO3) ends `NotSent { Cancelled }`, evidence, so the lane becomes `Idle` instead of promoting work nobody owns |

Every other row is unchanged. OD25's parked `Held` row reads "no binding incarnation" for "no live actor".

### 2.5 Persistence and rebind

- **A lane record names no instance path** (decided by F2's consequence). The operation is found by contract id.
- **The lane record carries its subject** (a string: a copy's key; under Q11, a reset value that must be a string).
  The per-Attempt copy key of revision 1 is gone.
- **Upgrading a host-only write to an `.each` fragment** (M4). A lane written before the fragment existed has no
  subject. When an `.each` placement adopts it, its subject is the lane's key value if the contract's key is one field
  (4.1: `key: ["docId"]`, so a held save of `d1` goes to copy `d1`); otherwise it goes to `orphaned` (P19), stated. A
  subjectless lane adopted by a root trait needs nothing: the root has no subject.
- Parked endings of an unplaced subject are on the lane record (OD22), captured, and listed by Inspection and
  `runtime.unsettledWrites()`.
- A version that removes the fragment's operation sends the lane to `orphaned` (P19).

### 2.6 Static analysis, the single graph, `flow check`

- **One graph.** A fragment's operations are nodes under its placement. `flow graph` and `flow explain` draw them from
  the summary (`docs  SaveDue → commits save (docs/save, reject, one lane per docId, subject = copy key)`). Inspection
  lists every lane with its operation path and subject, and marks a lane with no binding incarnation **unplaced**.
- **`flow check` adds no finding name.** `SharedContract` widens (F2). `UnresolvedHold` and rule 20's adopted-ending
  check run inside each fragment (FO7) and gain FO8's arrivals and structural warning at the host. Rule 20's `NotSent`
  list gains "an `.each` fragment's mapped write (`Rejected`, another subject)". An acting member of a fragment used
  outside it, and an FO0 violation, are construction errors (rule 12).
- **Typing.** `Fragment.O` is typed from the declaration and has only write operations' reads. Members are branded
  with their fragment. The fragment's `R` reaches the host (FO9).

### 2.7 Keywords

| Word | Status |
| --- | --- |
| `operations` in a trait or subroutine declaration | existing key, NEW MEANING (decided, F1) |
| `O` in a fragment body | existing, NEW MEANING |
| `Fragment.O.<write>.get`, `.idle`, `.retryable` outside the fragment | existing, NEW MEANING (decided, F5); write operations only (FO2) |
| `activities` in a trait body | existing, NEW MEANING (FO4) |
| `s.operations.<instance>.<name>` | existing path pattern, NEW MEANING (decided, F5) |
| `fixtures`, `.enter`, `.leave` on a fragment Story | existing, NEW MEANING (decided, F7) |
| `resetOn` on a trait that owns a mapped write | existing; allowed only under **Q11** |
| `O.x.cancel` in `whenAbandoned` | existing, NEW MEANING only under **Q12** |
| subject, binding incarnation, unplaced lane | concepts, not words |

### 2.8 Wiring every author repeats (open-items item 15)

Each piece from RV1's friction table, judged: **absorb** when every app writes it the same way, **keep** when it is a
real app decision, **owner** when absorbing it changes a decision.

| Wiring | Where it appears | Same in every app? | Decision |
| --- | --- | --- | --- |
| Keep busy keys in `.each` membership (4.4's `Listed` line) | like, follow, avatar | yes, word for word | **owner (Q12)**: with release on leave, a fragment whose subject may not return releases instead, and the line goes. Returning subjects keep F6's line only when they must keep reconciling while gone |
| Stop a predecessor by raising its `Cancel` (avatar) | upload | yes | **owner (Q12)**: `whenAbandoned: [O.put.cancel(own)]` in the fragment replaces it in every host |
| A list of one so a root trait can change its thing | editor switching documents, avatar | yes | **owner (Q11)**: `resetOn`, with the reset value as the subject |
| The retry-budget triplet (`retryable` else `cancel` and notify; a schedule that `retry`s) | every write | the shape, not the budget, delay or give-up reaction | **keep**: it is exactly what a fragment is for; written once per fragment, not per host. A generic reconcile fragment cannot be written (rule 13's exhaustive `failure`) |
| A second `cancel` after `unknown { Cancelled }` to release a user's stop | upload | no: a tombstone clean-up needs the hold (MD 2.7.7) | **keep** (merged design's decision); "release on user cancel" stays in `revisit.md` |
| A 0 ms `Flow.entry` schedule to commit on creation | upload | yes, but once per fragment | **keep** (F7: no entry hook); FO6's `idle` default makes it safe |
| Mirroring status from endings into memory for a row | upload, autosave | partly: `pending`, `uncertain`, `progress` are rows already; reasons are app data | **keep**; the row covers the shared part |
| Drafts pruned against the list's ids (rule 33) | comments | the shape; what a draft is differs | **keep** |
| View-minted client ids (`crypto.randomUUID()`) | comments | yes | **keep for now**: a key must exist before the commit (rule 39), and a turn has no randomness source (MD 7 item 12) |
| `writes` invalidation of a thread's list on each post | comments | no: which list is app data | **keep** |
| Toast callbacks with fixed text | like, follow | no | **keep** |

## 3. Why these and not the alternatives

| Choice | Taken | Rejected, and why |
| --- | --- | --- |
| Lane identity | unchanged (decided, F2) | the placement in the identity: two writes to one thing at once (D9), records tied to the machine's shape |
| Who handles a lane | its subject, recorded on the lane (FO3) | **the committing copy on each Attempt** (revision 1): two copies share a lane and deadlock (H1). **Lanes per subject**: two writes to one thing at once, against F2 |
| A member from another subject | declined with `Rejected`, `NothingToResend`, evidence | **allowed** (revision 1): a copy re-sends another copy's write and sees none of its endings (H1 step 5). **A new reason or finding**: a new word for a case the existing ones describe |
| Late endings | parked, delivered to the next incarnation with the subject (decided, F3) | a host port (EX), evidence, a lingering tail incarnation |
| Holds after the subject ends | held (decided, F6); released only if the fragment declares it (Q12) | **quiet release**: OD6 forbids. **Flow keeps the copy alive**: hidden membership, rejected in F6 |
| Freeze and reads | release at freeze, place again at thaw (FO4) | **keep reads placed while frozen**: a stream's deliveries would need a buffer for a trait that cannot react |
| `Flow.entry` on thaw | not fired (Q13) | **fire it**: changes a decided word's meaning for one case that a frozen schedule already covers |
| `Fragment.O` for reads | not offered (FO2) | **offered**: ambiguous when a read is placed twice (M2) |

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
form it waits for a copy with its subject (`d1`) to come back (FO6), since Autosave deliberately has no
`whenAbandoned` release. `Close` is guarded in both forms, so a user cannot strand a save; a disposed workspace can,
and the reopened copy then adopts the save, including a `Conflict` that still carries the user's text (M9, FO10's
walk). **Subject:** the copy's key is the document id and the contract's key is `["docId"]`, so each lane's subject
is its own document (FO3), and a lane left by the host-only form above is adopted by key after the upgrade (2.5).

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
`at`, and an overdue `resync` fires once, FO4. Without `.resumable()`, every visit would start again from
`{ epoch: "", after: 0 }` and fetch the whole history, which `merge` dedupes but does not avoid: L2).

```ts
// ticket.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { LiveFeed } from "./livefeed.trait"

export const Ticket = definition({
  id: "Support/Ticket",
  states: ["DETAILS", { DISCUSSION: Flow.state({ traits: { chat: LiveFeed.resumable() } }) }],   // existing: Flow.state, .resumable(); thaw re-places the feed from `at` (FO4)
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
unchanged; `key: ["id"]`, `latest`. The copy's key is the issue id, so each lane's subject is its own issue (FO3).
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
        Listed: { target: "self", updateMemory: ({ memory, operations, event }) => ({ issueIds: [...event.ids, ...memory.issueIds.filter((id) => !event.ids.includes(id) && busy(LikeButton.O.set.get(operations, { id })))] }) },   // NEW MEANING: a host read (FO2); keeps a copy whose like is unresolved (F6; Q12 would remove this line)
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
| 4.2 Live feed (root; node, resumable) | 94 / 4,353 | 77 + 22 = 99 / 5,673 | +5 lines, +30 % chars | ticket 26 / 940 vs 94 / 4,353 | 78 % |
| 4.3 Checkout (subroutine, phase 2) | 108 / 5,208 | 95 + 27 = 122 / 5,597 | +14 lines, +7 % chars | 27 / 897 vs 108 / 5,208 | 83 % |
| 4.4 Like (`.each`; root) | 54 / 2,305 | 37 + 44 = 81 / 3,317 | +27 lines, +44 % chars | issue page 20 / 610 vs 31 / 1,409 (written, 4.4) | 57 % (35 % of lines) |

Reading it (corrected from revision 1, RV1 section 4):

- **A first use is larger by lines in every case, and by characters in every case but the autosave**, whose before
  writes long one-line handlers that look short by lines.
- **A further host is much smaller** where the fragment carries real policy (feed, checkout, autosave). Where it
  carries little (a single like button), the saving is about a third of the lines, not the 63 % revision 1 implied.
- **`.each` hosts save least** (the board: 54 → 44 lines), because `.each` needs membership in memory and, under F6,
  the keep-busy line. Q12 would remove that line.
- **What the lines hide:** in the before, each host writes its own `unknown` handling and late handlers; in the after,
  they are written and tested once (FO10).

## 5. Tested against very different cases

| Case | Shape | Verdict under v1 (FO0) | Strain |
| --- | --- | --- | --- |
| Search as you type | trait: debounce + `lookup` | fits anywhere (a read) | leaving releases the lookup |
| Infinite pager | trait: `subscribe.each` over loaded pages | fits anywhere | page cache is the resource's |
| Presence heartbeat | trait: stream + a bare `ping` write | fits anywhere | none |
| Notification bell on every screen | root trait: stream + `markSeen` (`latest`, key `[]`) | fits | two screens are two identities, unordered for a plain write (MD 2.7.13) |
| Comment composer per thread | `.each` by thread id: `post` keyed `["clientId"]` | fits | one subject, many lanes: each lane records the thread as its subject, exact |
| Follow author on each post | `.each` by post id, key `["userId"]` | **declined at runtime** (FO3, H1) | two posts by one author share a lane; the second copy's commit ends `NotSent { Rejected }`. Write it over distinct authors |
| Follow in a header plus a suggestions list | two placements of one writing trait | `SharedContract` | fold the header into the list's membership (FO3, M8) |
| Comments panel on a tab | node trait with two mapped writes | fits as `.resumable()` (FO4) | thaw re-places its list subscription |
| Avatar upload (input arrives later) | root trait whose thing changes | fits as `.each` of one or two | **worst friction** (M7): the host keeps a busy predecessor and raises its `Cancel`; Q12 (and Q11) remove both |
| Editor that switches documents | root trait with `resetOn: docId` | **not in v1** (F4) | `.each` over a one-element list; Q11 admits `resetOn`, with the reset value as the subject |
| Cart quantity stepper per line | `.each`: a domain write | fits (the like again) | bulk "clear cart" is MD's per-key fan-out limit |
| Upload a file (step), two-factor verify (step) | subroutines | **phase 2** (decided, F7) | cross-thing adoption is closed by the subject (a reset value or an entry's input as subject is phase 2's rule) |
| Booking saga | host | stays in the host | must refund a late charge at once (1.2 item 4) |
| "Submit with retry" over any contract | EX's `CommitWithRetry` | rejected | `failure` is exhaustive per contract (rule 13) |

## 6. What OD19–OD22 solved from EX's list

| EX item | Status now | Why |
| --- | --- | --- |
| The orphaned ending, `whenOrphaned`, the widened `orphaned`, `UnreconciledOrphan` | **solved, removed** | OD19 (Runtime-owned lanes), OD21 (parked, delivered to the next incarnation), OD22 (parked raw, mapped at delivery); one level down, FO5 and FO6 (decided, F3) |
| Lanes identified by placement | **changed** | OD20's identity; the placement and the subject say where delivery goes (FO3, FO5) |
| No `.resumable()` beside a write | **solved** | parked endings wait for the thaw; FO4 states what the thaw re-places |
| Persistence by placement path | **solved** | OD20's records decode by contract `input` pick; the lane adds only its subject (2.5) |
| Incarnation counters for every placement | **not needed** | activation identity for the owner test; the subject for delivery |
| EX's rule-15 clause | **not needed** | no host turn runs for a fragment's ending |
| "Ending a life never cancels a write" | **solved** for writes by OD19; reads by FO4 |
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
3. **2.2.2**, last sentence: "Fragments may not declare `operations`, `activities`, …" → "Fragments may not declare
   `context`, `onContext`, `send` or persistence; a trait body may hold `activities` (FO1, FO4)".
4. **2.3**, row "Running I/O and mapping endings": add "or a fragment's declaration and body (FO1)".
5. **2.6 key order**: a machine or fragment body gains `activities` before `schedules`.
6. **Rule 1**, `.resumable()`: add "Freezing releases the trait's placements and lookups; thawing places its
   `activities` again from its memory; a call ending for a frozen trait is parked and delivered at the thaw (FO4)".
7. **Rule 2**: `internalEvents` of a fragment also come from its operations' endings.
8. **Rule 3**: replaced by FO1 and FO0.
9. **Rule 4**: the host reads a fragment's write lanes and asks through its public events; it cannot act (FO2).
10. **Rule 8**: call endings go "to the binding incarnation, or parked for the lane's subject (FO5)".
11. **Rule 9**: add "a lane created by a copy's commit records the copy's key as its subject (FO3)". "The Attempt
    carries no copy key" stays true.
12. **Rule 10**: summaries record operations and the contracts' requirements (FO9).
13. **Rule 11**: `story.machine(fragment, { id, fixtures })`; `.enter` and `.leave` on traits (FO10).
14. **Rule 12**: construction errors add an acting member used outside its fragment, and FO0's chain rule.
15. **Rule 14**: the owner test runs inside the binding incarnation; the parked case (FO5).
16. **Rule 17**: "to a live incarnation of its identity or to its saved record" → "…of its identity with the lane's
    subject, or parked for it (FO5)".
17. **Rule 20**: adopted endings over the declaring fragment's arrival set (FO7); the `NotSent` list adds an `.each`
    fragment's mapped write (`Rejected`, FO3).
18. **Rule 21**: "binding actor" → "binding incarnation"; the lane records a subject; members from another subject
    are declined (FO3, 2.4).
19. **Rule 40**: `SharedContract` counts every write operation in the actor's placement tree (decided, F2).
20. **Rule 42**: a fragment's one-off read lane is (actor, operation, incarnation), released with it and at freeze
    (FO4).
21. **Rule 44**: add FO6 (adoption by subject, follow-up turns after the starting turn's raises, thaw).
22. **Rule 45**: add FO8's arrivals and its structural `.each` warning.
23. **Rule 46**: "A lane record names no instance path and carries its subject; a subjectless lane adopted by an
    `.each` placement takes its one-field key value as subject, else goes to `orphaned` (2.5)".
24. **2.5 step 1**: the owner test runs in the binding incarnation; an ending with none is parked. **Step 5**: a
    member from another subject is declined (2.4). **Step 6**: after pending resets, queue FO6's deliveries.
25. **2.7.13**: the "Owner" paragraph reads "binding incarnation"; the rows of 2.4 above.
26. **2.7.14** item 2: arrivals inside a fragment (FO7); new item 5: FO8.
27. **2.7.16**: `SharedContract` and `UnresolvedHold` widened; `flow explain` prints fragment operations and their
    subject; no new finding names.
28. **3.6 Keywords**: the new meanings of 2.7.
29. **Section 5**: Machines O1 (fragments declare operations; `Fragment.O`), Runtime O3/V4 (binding incarnation;
    subjects), Persistence O2/O6 (the subject on the lane record; parking in a live actor), Testing O1 (fragment
    Stories), Inspection O1 (subjects, unplaced lanes), CommandLine O5 (amendments 14, 17, 22, 27), React O4 (views
    read `Fragment.O.x.get`), EntityDomains O1 (a fragment's domain write registers its domain).
30. **Section 6**: delete "Fragment I/O" and "Nested request relays"; "Operations in fragments" points here.
31. **Merge 3** (not merged): fragment Stories have `fixtures` (FO10).
32. **Merge 6** (not merged): a trait body's `activities` places a stream for the incarnation's life; freeze releases
    it and thaw re-places it (FO4).
33. **Under Q11 only:** rule 1's `resetOn` and FO0 admit a writing root or resumable trait whose reset value is a
    string, recorded as the subject. **Under Q12 only:** rule 6's `whenAbandoned` may list `O.x.cancel(k)`, with
    2.4's "release on leave" row; MD section 6 "deliberately left out" loses nothing (it never listed it).

## 8. Risks

1. **Late results reach the user late (phase 2).** A subroutine or node trait that is left holds its result until a
   new incarnation with the same subject starts (4.3). F4 keeps this out of v1.
2. **A subject that never returns strands its hold** (decided as a stated limit, F6). The `.each` warning (FO8) and
   Inspection make it visible; Q12 lets the fragment release instead. Until then, a domain write's record queue
   blocks other actors' writes to that record (MD 2.7.13).
3. **The subject rule is not static.** Whether a write's key is decided by the copy's key is a closure, so `flow
   check` cannot see a follow-author-per-post mistake; the runtime decline and Stories do.
4. **`.each` now requires `NotSent` mapped on every mapped write** (the subject decline). That is honest (the decline
   is an ending) but adds a mapping some authors did not need under `latest`.
5. **The host graph hides I/O.** `flow graph`, `flow explain` and Inspection must show summaries well.
6. **Parked endings in a live actor accumulate** for subjects that never return (bounded by distinct keys).
7. **Typing** is unspiked: `Fragment.O`, branded members, rows under `.each`, the fragment's `R` reaching the host,
   `operations: ({ E })` ordering.
8. **`SharedContract` per actor is stricter** (decided, F2): two placements of one writing trait need folding (FO3).

## 9. Open questions for the owner

Q1–Q10 are answered (F1–F7) and removed. Answer as `Q11 A`. Each is proposed.

### Round 4: the friction at its root

**Q11. A root trait whose thing changes during the actor's life** (amends F4). F4 bans `resetOn` on a writing trait
because a reset's new incarnation would receive the old thing's endings. With the subject recorded on the lane (FO3),
that can no longer happen: the reset value is the subject, and the old thing's lanes wait for an incarnation with that
value.

- A. Allow `resetOn` on a root or `.resumable()` trait that owns mapped writes, when the reset value is a string; it
  is the incarnation's subject.
- B. Keep F4: such a trait is written as `.each` over a one-element list.

```ts
// before (F4): an editor that switches documents keeps a list of one
memory: { current: Flow.initial(Schema.Array(OpenDoc), []) },                         // user-defined: a list of one
traits: { draft: Autosave.each({ of: "current", by: "docId", max: 1 }) },            // existing: .each
Switch: { target: "self", guard: [Autosave.O.save.idle(({ memory }) => ({ docId: memory.current[0]?.docId ?? "" }))], updateMemory: ({ event }) => ({ current: [event] }) },

// after (A): one document, reset when it changes
memory: { doc: Flow.initial(Schema.NullOr(OpenDoc), null) },                         // user-defined
traits: { draft: Autosave },                                                           // existing: a root trait
// machine: the filling, at the root
traits: { draft: { resetOn: ({ memory }) => memory.doc?.docId ?? "", input: ({ memory }) => ({ docId: memory.doc?.docId ?? "", body: memory.doc?.body ?? "", etag: memory.doc?.etag ?? "" }) } },   // existing: resetOn; NEW MEANING: its value is the subject (FO3)
Switch: { target: "self", guard: [Autosave.O.save.idle(({ memory }) => ({ docId: memory.doc?.docId ?? "" }))], updateMemory: ({ event }) => ({ doc: event }) },
```

Added: nothing but the rule. Dropped: the list of one and its `[0]` reads. A return to document A adopts A's parked
save. Recommendation: **A**. It is safe because of FO3, removes an artifice every such host repeats, and is phase 2's
rule for node traits too. B is right if you prefer F4's scope until a type spike.

**Q12. What ends a write's workflow when its incarnation ends** (the root of M7 with F6; amends F6, reverses F7's
deferral of `cancel` in `whenAbandoned`). Today an ending incarnation cannot say "my writes end with me", so every
host whose subjects do not return keeps busy predecessors in membership and stops them by raising events.

- A. A fragment may list `O.x.cancel(k)` in `whenAbandoned`: when the incarnation is removed, left or reset (not
  frozen, not on actor disposal), that lane is **released on leave** (2.4's row). A held unknown is released at once;
  one on the wire is interrupted and released when it lands; never-sent and queued commits end `NotSent { Cancelled }`, so nothing is sent for a subject that has gone. The
  released write may still land unseen (OD20's stated limit). Without it, F6 holds as decided.
- B. Keep F6 and F7: hosts keep busy keys and raise `Cancel`.

```ts
// before (F6): the avatar host keeps a busy predecessor and stops it by an event (RV1's upload.ts, 50 lines)
traits: { avatar: Upload.each({ of: "avatar", by: "ref", max: 2 }) },
Choose: [
  { target: "self", guard: ({ memory }) => memory.avatar.length > 0 || deny("NoPrevious"),
    updateMemory: ({ memory, operations, event }) => ({ avatar: [...memory.avatar.filter((a) => busy(Upload.O.put.get(operations, a))), event] }),
    raise: [E.avatar.Cancel.from(({ memory }) => ({ key: memory.avatar[memory.avatar.length - 1]!.ref }))] },
  { target: "self", updateMemory: ({ event }) => ({ avatar: [event] }) },
],

// after (A): the fragment says it once; every host just replaces its list
// in upload.trait.ts
whenAbandoned: [O.put.cancel(({ memory }) => ({ ref: memory.ref }))],                 // existing: whenAbandoned, cancel; NEW MEANING: release on leave
// in the avatar host
traits: { avatar: Upload.each({ of: "avatar", by: "ref", max: 1 }) },
Choose: { target: "self", updateMemory: ({ event }) => ({ avatar: [event] }) },
```

The same change removes 4.4's keep-busy line: a like whose issue leaves the board is released, and the store keeps the
issue's `uncertain` mark (rule 32: `Released` keeps the mark), so the record queue no longer waits on it.
Added: one new place for an existing word (`cancel` in `whenAbandoned`), one row in 2.4, one summary flag (FO9).
Dropped: the keep-busy line, the predecessor raise, `max: 2`, and FO8's `.each` warning for fragments that release.
Recommendation: **A**. Release is declared, so OD6's "no quiet release" holds; a document's autosave simply does not
list it and keeps its save for the document's return (4.1).

**Q13. Does `Flow.entry` fire on a thaw?** (H2)

- A. No. A frozen schedule that is overdue fires once on return (rule 1), and thaw re-places `activities` (FO4); a
  fragment that waits on a lookup arms a schedule for it.
- B. Yes: `armOn: [Flow.entry]` also starts on thaw.

```ts
// A (4.2): the catch-up's safety timer is armed by the gap, so an overdue tick re-looks-up after a thaw
resync: { schedule: "5 seconds", armOn: [E.Missed, E.CatchUpFailed], send: E.ResyncDue },
// B: also start on thaw
resync: { schedule: "5 seconds", armOn: [Flow.entry, E.Missed, E.CatchUpFailed], send: E.ResyncDue },   // NEW MEANING: Flow.entry on thaw
```

Recommendation: **A**: B changes a decided word's meaning for a case that A covers.

**For `revisit.md` (proposed, not written there):** the subject as phase 2's admission rule for node traits and
subroutines (an entry's input as subject); one fragment's placements sharing an operation when subjects differ (M8);
"release on user cancel" so `unknown { Cancelled }` needs no second `cancel`; per-copy fan-out of write members.
