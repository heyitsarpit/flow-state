# Proposal: server interaction declared once, as named operations

Status: **proposed; five owner decisions applied** (OD1–OD5; OD2a confirms `subscribe` for both live kinds). Written 2026-10-30 from the owner's direction (call state belongs
to a named use site declared on the definition, under the existing keyword `operations`). The owner has decided OD1
to OD5 ([decisions.md](decisions.md)); text that applies them is marked **decided (ODn)**. Every other rule,
shape and name below is a proposal for the owner to accept, change or reject in the rounds of section 11. Nothing
here edits a `.plan` file or another proposal. No type spike was built (owner's scope change); section 4 is a note on
what the types must express.

**Revision 2 (2026-10-31).** Answered [reviews/review-1.md](reviews/review-1.md) by root cause
([reviews/review-1-response.md](reviews/review-1-response.md)). Superseded in part by revision 3.

**Revision 3 (2026-10-31).** Answers [reviews/review-2.md](reviews/review-2.md); each finding, its cause and its
resolution are in [reviews/review-2-response.md](reviews/review-2-response.md). Both reviewers found revision 2 not yet
sound, and most of its new concepts served rare cases. Revision 3 redesigns at the causes (0.1) and **removes
concepts** (0.2: 14 new words and 4 modes in revision 2, 3 new words and no modes now):

1. **The contract's `key` names one server thing, for every contract kind.** Resources and streams already have it;
   transactions keep it. An operation has one lane per key, **created by work**; a start derives its key from its
   input. Revision 2's `.each` operations, their two sources, `of`, `by`, `max`, `at`, membership, draining and the
   release rules are gone. Per-field autosave, per-document loads and per-row writes over plain rows all work.
   `latest` and `cancel` transactions must declare `key` ("newest of what").
2. **Replaced work is not delivered.** A `latest` write that a newer start on the same key replaced, and a one-off
   read that a newer start of the same operation replaced, end as evidence and never reach a handler. The
   `superseded:` key, the `superseded` flag and every stale guard are gone.
3. **Lanes are the actor's workflow; shared data stays in the store** (merge 4's split, restored). Record `pending`,
   `Inactive { data }` and store-driven lane release are gone. Views read a lane by key with `O.x.get(s, key)`, as
   they read a record with `Entity.get(s, key)`.
4. **One write operation per write contract** (a declaration error otherwise), so persistence binds by (contract,
   key) without names: `.joins` and `.was` are gone.
5. **Names**: `outcomes` (the design's existing word, already used for streams by merge 6) instead of `.emits`;
   `params` and `each` place live work; `.live()` is gone (mapping `success` makes a read one-off, mapping `value` or
   nothing makes it live). Contracts live in `*.contracts.ts`.

Items 1, 2 and 5 are partly superseded by revision 4.

**Revision 4 (2026-10-30).** Applies the owner's decisions in [decisions.md](decisions.md), prompted by
[reviews/review-3.md](reviews/review-3.md). Revision 3 had made one declaration uniform and then forced one rule on
every kind; review 3 showed where that broke (K2, hidden modes (a) and (b), one replacement rule for reads and writes).

1. **Decided (OD1).** `retryable(n, k?)` becomes `retryable({ times: n })`, or `retryable(selectKey, { times: n })`
   for a keyed lane, after Effect's `Effect.retry({ times })`. `times` counts re-sends after the first send, which is
   what `retryCount` counts. The denials stay `RetryLimit { retryCount }` and `NothingToResend`.
2. **Decided (OD2).** The machine's verbs are the contract's own function names (OPS O2, O3): `O.pay.commit(select)`
   for a write and `O.read.lookup(select)` for a one-off read, both in `actions`; `O.feed.subscribe(select)` in
   `activities` for a live read or a stream. Revision 3's `start` and `params` are dropped. **The verb decides one-off
   or live**; the mapping must agree with it, and a mismatch is a declaration error (3.2). This removes review 3's
   hidden mode (a).
3. **Decided (OD3).** Only the declaration is unified: every kind is declared by name under `operations`, mapped with
   `.outcomes`, used through `O`. Lanes, rows and rules are stated **per kind** (transaction, resource, stream) in
   3.3, 3.4, 3.7 and 3.8. Proposed rules that follow from OD3 are marked **proposed, follows from OD3**: one-off reads
   have one lane per operation (review 3's K2 fix), a resource row is OPS O6's lane for either verb, and the
   replacement rule is split into a write rule and a read rule.
4. **Not decided, left open** (section 11, round 7): review 3's K1 (only a never-sent start is replaceable; a retained
   unknown holds its lane) and K3 (field-list keys; key-less members in an ending's handler). Their findings (H1, H2,
   H3, M1, M2, M4, M5, M7) still apply to this revision. (Revision 5 applies both.)

**Revision 5 (2026-10-30).** Applies OD4 and OD5 ([decisions.md](decisions.md)), review 3's K3 and K1, which revision 4
left open as Q25 and Q24.

1. **Decided (OD4).** A contract's `key` is a list of top-level input fields, `key: ["docId", "field"]`, like
   `primaryKey`, with a Schema (the input's pick). A domain write defaults to its entity's primary key, and S4 is
   checked at the operation (fixes R3 M4: kanban 9.4 type-checks). Members and `get` take any value carrying the key's
   fields, so views pass the item they render (`O.move.get(s, card)`). In an ending's handler `retry`, `retryable` and
   `cancel` take no key and address that ending's Attempt: every `thisX` selector in ending handlers is gone (keys stay
   where a user event names a thing). Limit: no derived or nested keys (3.3). Fixes R3 M5 (restore decodes keys) and
   reduces M7.
2. **Decided (OD5).** Only a never-sent commit is replaceable; a sent Attempt's ending is always delivered; a retained
   unknown holds its lane under `latest` and `reject` until `retry` resolves it or `cancel` releases it; the
   addressable Attempt is the oldest unresolved sent one; under `cancel` concurrency an Attempt interrupted by a newer
   commit is evidence only; the write row gains `uncertain` (3.8.1). Fixes R3 H1 (8.2 shows the late landing gone),
   H2, H3, M1 and M2 (5.3's `memory.likeUnsure` mirror is gone), and review 3's mode (c).
3. **Proposed, follows from OD4 or OD5** (marked where they land): `cancel` empties its lane in every state (3.5;
   replaced in revision 6 by OD7);
   `idle` denies `Uncertain`; `serialize` holds too, `allow` does not; `KeyRequired` for a key-less member outside its
   operation's ending; keyed schedules use key records and may read `operations` (L1, 3.12); a domain write's default
   key applies only when the input carries every primary-key field. New open questions: Q27, Q28, Q29 (section 11).

**Revision 6 (2026-10-30).** Applies [reviews/review-4.md](reviews/review-4.md) and the owner's OD6, OD7, OD8
([decisions.md](decisions.md)). Review 4 found OD5 applied in 3.8.1 but not carried into the cases or the members
around it. By cause:

1. **K4, the hold had no owner of its end. Decided (OD6).** The hold stays the default. `flow check` reports
   `UnresolvedHold` when a path can leave a write's unknown neither retried nor cancelled, read from tokens (3.8.1
   rule 7). The write row gains `waiting`. Every case is re-walked: sign-in 5.2 releases its unknowns (H1), kanban 9.4
   releases after its toast (H2), 8.2 and 9.3 guard `Loaded` with `idle` (M1), 5.4 shows and retries unsure posts (L4).
2. **K5, `cancel` named a lane while `retry` names an Attempt. Decided (OD7).** `cancel` acts on the oldest
   unresolved sent Attempt; after release the waiting commit is sent; it never silently drops one. A never-sent
   commit it ends gets MD rule 24's `NotSent { why: "Cancelled" }` (proposed). Closes H3 in 5.3, 8.4 and `serialize`.
3. **K6, a key-less member's address depended on runtime origin. Decided (OD8).** Unkeyed: always its one lane;
   keyed: only in a handler of an event that operation alone maps; else `KeyRequired`. 5.3 and 8.4 split `Unsure` per
   operation; 5.1's `answered` keeps working (H4). Proposed: `SharedEnding` (info); ending events are not raised or
   scheduled, and Stories drive endings through the operation (M2).
4. **K7 and K8 (proposed or open).** The one-off read row holds its entry (M4, proposed). A write that maps anything
   must map `unknown` (M7, proposed; removes a mode). The domain default's entity as data is Q30 (M3). The hold's
   limits are stated: one actor, two tabs (Q31), `If-Match` with waiting writes and `basedOn` at invocation (Q32),
   throttling as a memory queue (M6). Lows L1–L6 are applied where they land.

**Revision 7 (2026-10-30).** Applies OD9, OD10 ([decisions.md](decisions.md)) and [reviews/review-5.md](reviews/review-5.md).

1. **Decided (OD9).** Section 11's round 1 is accepted, all A: Q2, Q4, Q6, Q7, Q21, Q22, Q23, Q26. They leave
   section 11 and are marked decided where stated (3.1, 3.3, 3.4, 3.8.2, 3.10, 3.13).
2. **Decided (OD10).** Reviews 3, 4 and 5 found their Highs in one place: what a write lane does under each member
   and ending in each condition. Revision 7 stops patching prose and states **the write lane as a state machine**
   (3.8.1): states `Idle`, `InFlight`, `Held`, each with an optional waiting part; a 10 × 3 table of every member and
   ending against every state; per-policy notes; the flags `pending`, `uncertain`, `waiting` as functions of the
   state; `UnresolvedHold` as a check over that graph. The cells are proposed; the form is decided. It closes R5 H1
   (an interrupted Attempt is `Held`, so nothing newer is sent while it may land), H2 (`uncertain` is false during a
   re-send, so 5.3's reconcile re-arms), K9 (key-less members act on their ending's own Attempt), K10 (flags), K11
   (`UnresolvedHold`'s false negative behind `idle` and false positive on terminal states) and M4 (`serialize`'s
   head is addressable; amends MD N2).
3. **Proposed, from review 5.** K12: the hold is per lane, stated; `basedOn` rebases across the lane's own writes
   (Q32 A); the one-off row carries its entry's `key` (M7); a partial-key `idle` for "every lane of this draft" is Q34.
   M6: 5.2 re-sends a verify before releasing. Rule audit: 17 → 14 author rules; `UnmappedUnknown` folded into
   `UnresolvedHold`, `SharedEnding` cut, the `cancel`-concurrency exception dropped (`cancel` and `allow` no longer
   hold), S15 simplified. Every write example is re-walked against the table (5.7), and review 5's wizard is 9.6.

**Revision 8 (2026-10-30).** Applies OD11–OD17 ([decisions.md](decisions.md)) and
[reviews/review-6.md](reviews/review-6.md). By root cause:

1. **The table had no time inside a turn (R6 K13). Decided (OD16).** Cells apply in step 5, in action order; a queued
   commit is promoted at once; `keys`, `when` and published rows read the after lanes; the hidden `Idle + W` state is
   gone. Closes R6 H1 (force save sent the older text last) and H2 (5.3's reconcile timer never re-armed).
2. **`UnresolvedHold` ignored commits already queued (R6 K14). Decided (OD16).** The terminal pass applies only
   under `reject`, and every budgeted owner needs a later alternative (R6 M2). Closes H3 (8.2's `CloseAnyway`
   stranding "ABC"); 8.2's CLOSED now releases.
3. **One reference stood for several things (R6 K15). Decided (OD16).** Queued commits are `W`, counted by
   `outstanding` on `serialize`; a record's mark and a lane's `uncertain` are told apart, with merge 4 rule 32 amended
   (proposed, M6); "stopped" vs "dropped" unknowns are tags (Q36). `cancel` and `allow` get their own short table
   (`HeldThisTurn`, M3). Key-less members name their ending's Attempt, then the lane's (M1).
4. **The amendments were not inventoried (R6 K16). Decided (OD16).** 3.8.1 lists every MD and merge 4 rule the table
   changes (M8); the `basedOn` rebase is scoped to domain writes, with committed bases and released predecessors
   stated (M7, Q32). Work over a dynamic key set is a stated cut (M9). Lows L1–L6 applied.
5. **Contract shape. Decided (OD11–OD15).** Every kind has exactly `input` and `output` (fields record or Schema;
   `result` renamed; no `params`; mapper `{ input }`); `key` is a required list of `input` fields on resources and
   transactions, `[]` for one, with no domain default; functions stay inline; no Rpc inside, a `fromRpc` adapter
   later. Every contract in the examples is updated. Q3, Q27 and Q30 are answered. Streams' key is Q38 (proposed:
   required).
6. **Decided (OD17).** Q12–Q19 (persistence by contract and key, `restartOn` per key, `DuplicatePlacement`, the names
   `outcomes`/`get`/`O`, mappings on the definition, cache verbs on the contract, `*.contracts.ts`, fragments
   deferred) leave section 11 and are marked decided where stated.

Short names for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| AU | `references/explorations/machine-fragments/audit-multiplicity.md` |
| IM | `references/explorations/machine-fragments/calls-object/impact.md` |
| TS | `references/explorations/machine-fragments/calls-object/type-spike/RESULTS.md` |
| M3, M4, M5, M6 | `references/explorations/machine-fragments/merge-N-*/proposal.md` |
| OPS, MCH, EDP, PER | `Operations.plan`, `Machines.plan`, `EntityDomains.plan`, `Persistence.plan` |
| DD | `references/dispatch-desk/` |
| R1, R2, R3 | `operations-in-definition/reviews/review-1.md`, `review-2.md`, `review-3.md` |
| OD | `operations-in-definition/decisions.md` |

Marks used in code: `// NEW`, `// RENAMED`, `// REMOVED`, `// NEW MEANING` (an existing word whose meaning changes),
`// existing`, `// user-defined`. A line with no mark is unchanged from the design.

## 0. The answer in short

**Should everything go under `operations`?** **Decided (OD3): yes for the declaration, no for the behaviour.** Every kind
of server interaction (a write, a one-off read, a live read, a stream, a domain write, a `listen`) is declared once,
by name, under `operations`, with its results mapped to this definition's events by `outcomes`. How each kind runs
stays its own:

- **a write** is committed from a transition's `actions`: `O.pay.commit(select)`;
- **a one-off read** is looked up from a transition's `actions`: `O.read.lookup(select)`;
- **live work** (live reads, streams, `listen`) runs while a state is active: a state's `activities` becomes a list of
  placements, `activities: [O.feed.subscribe(select)]`, or `O.quotes.subscribe.each(select)` for one session per key.

The three verbs are the contract's own function names (OPS O2, O3), **decided (OD2)**: the verb a machine uses says
which kind of work it is, and the verb, not the mapping, decides one-off or live.

Reasons, in the owner's order of priority:

1. **Correctness.** Each kind has its own identity rule, stated once (3.3, proposed): a write lane is (actor,
   operation, contract key), where the key is the contract's list of input fields naming which server thing a write
   is about (decided, OD4), picked from the input at every commit, so it cannot disagree with what is sent; a one-off
   read has one lane per operation; a live read or stream has one lane per placement, or per key under `each`.
   Replaced work is never delivered as if current, by a rule per kind (3.8); for writes, only a never-sent commit is
   replaceable, a sent Attempt's ending is always delivered, and an unknown holds its lane until resolved or released
   (decided, OD5). Two write operations on one contract are a declaration error, so D9's guarantee is checkable.
2. **Readable at a glance.** A definition lists everything the actor does with servers and what each result means;
   the machine is behaviour only; a view reads `s.operations.pay.pending` or `O.like.get(s, issue).pending`, passing
   the item it renders; an ending's handler names no key.
3. **Static analysis and agents.** `flow check`, `flow explain`, Inspection and the merge 5 join read one record per
   definition; rows are typed from the definition alone; the verb at each use is a token, so tools read one-off or
   live without reading a closure.

What it costs (section 7): `s.calls` and `s.activities` become `s.operations`; `activities` becomes a list; one-off
reads of one operation lose "two fetches, two endings" (MD 2.7.9); a bare write's results are evidence only; a write
that ends unknown holds newer writes on its key until it is resolved or released (OD5), and a machine that settles an
unknown by a read must release it with `cancel` (5.1); every unknown handler must end its hold, retried or
cancelled, which `flow check` enforces (`UnresolvedHold`, OD6); a write lane's behaviour is one table an author
must know (3.8.1, OD10); the hold orders one lane, not the actor (K12); keys must be top-level input fields (OD4); about 150
document edits, fewer than revision 3 counted because `commit`, `lookup` and `subscribe` keep their names.

### 0.1 Root causes

Revision 3 groups R2's findings by cause. Four are causes revision 2 fixed only partly (C1′–C4′, re-stated);
two are new (C7, C8). The decision in the last column replaces revision 2's for that cause.

| # | Root cause | Findings it explains (R2) | Decision that removes it |
| --- | --- | --- | --- |
| C2′ | **The identity of a server thing was removed instead of placed.** Revision 2 fixed C2 (identity stated twice) by deleting the transaction `key`, then had to rebuild per-thing lanes from entities or memory lists, which do not cover every case and add lifetimes of their own. | C-H1 (plain writes over non-entity rows: per-field autosave drops an edit); A-H1 (no per-member live read); A-H4 (the member spelled several times); A-M3 (starting before the member joins); C-M4 (draining); C-M6 (`.joins` on `.each`) | **The contract's `key` names the server thing** (3.3). Revision 3 made it the lane for every kind; revision 4 states it per kind (OD3, R3 K2): write lanes per (operation, key), created by work, the key derived from the commit's input; `latest` and `cancel` require `key`; for reads the key stays the cache entry (OPS O1), and the lane is the operation (one-off) or the placement (live), with `subscribe.each` placing one session per key |
| C4′ | **Replaced work was still delivered as if current.** Revision 2 moved superseded results to a mapping key, but kept delivering a plain unknown, and reads had no notion of replacement. | C-H2 (a superseded unknown reaches the main handler, whose `retry` acts on the newer write); A-H2 (one-off reads unordered, a hand-written stale guard); A-H3 (`superseded:` required, yet bare operations exist) | **Replaced work is not delivered** (3.8), by a rule per kind since revision 4: since revision 5 (OD5), only a never-sent `latest` commit is replaceable, and an unknown holds its lane, so `retry` acts on its own Attempt (3.8.1); a one-off read operation delivers only its latest lookup (3.8.2); live work has no replacement rule (3.8.3) |
| C1′ | **Lane state was attached to data with a different lifetime.** Revision 2 fixed C1 (lanes apart from data) by putting `pending` on records and rows on list items, which tied the actor's workflow to shared or foreign lifetimes. | C-H3 (record `pending` misses many-record writes, absent records, other actors); C-M3 (store events mutating a lane outside a turn; deleted records filling the cap); C-M5 (`Inactive { data }` across params); C-M4 (draining) | **Lanes are the actor's workflow and change only in its turns** (3.4, 3.7): shared data stays in the store (`predicted`, `uncertain`, M4 rule 26); views join by key with `O.x.get(s, key)`; an inactive placement is `undefined`; continuity across params is OPS O6's `placeholder` |
| C3′ | **Persisted identity used a chosen name where a stable one existed.** | C-M1 (`retryCount` resets on reload); C-M2 (joined lanes, per-Attempt binding, `.was` clashes, shape mismatch) | **Persist by (contract id, key)**, with each Attempt's `retryCount` (3.10); unique because a definition has one write operation per contract |
| C7 | **New** — **rare cases got their own concepts.** | the vocabulary count (about 8 words and 2 modes for rare cases: `.joins`, `.was`, `Inactive`, the 64 cap, draining); A-M1 (`.joins`: one row, two names) | **Rare cases use existing tools** (0.2): a second kind of start is a second `commit` with its own select and a memory flag the handler reads; releasing an unresolved unknown is `cancel`; a rename needs nothing |
| C8 | **New** — **per-key time and file names were left unspecified.** | A-M4 (keyed-schedule re-arm); A-M2 (`*.operations.ts` holds contracts); names (`with`, `emits`, `joins`, `was`) | `restartOn` evaluated per key on a keyed schedule (3.12); `*.contracts.ts`; `outcomes` (3.1); revision 3's `params` and `start` replaced by the contract's own verbs (OD2) |

What revisions 1 and 2 got right is kept: the declaration on the definition, the commit or lookup in the transition
with its own select, routing by state (rule 14), N2, `retryable` (now `retryable({ times })`, OD1), one write operation
per contract as a checkable guarantee, deferring fragment I/O, and activities as placements.

**Revision 4's cause.** One more cause sits under review 3's K2 and hidden modes (a) and (b): **C9, a uniform
declaration was read as a uniform behaviour.** Revision 3 had one key rule, one "bare" meaning and one replacement
rule for every kind, so the key meant the lane for writes and the cache entry for reads, "bare" meant "view-read" for
reads and "evidence only" for writes, and mapping `success` silently made a read one-off. OD3 removes it: the
declaration stays uniform; identity, rows and replacement are stated per kind; OD2 makes the verb, not the mapping,
say how the work runs.

**Revision 8's causes** are review 6's K13–K16 (the table had no time in a turn; the hold check looked only
forward; one reference for several things; amendments not listed), all applied as definitions with no new word
(OD16), plus the contract shape (OD11–OD15). **Revision 7's causes** are review 5's K9–K12, and one beneath them (OD10): **the write lane's behaviour lived in
prose spread over 3.5, 3.7 and 3.8.1**, so each fix was a sentence that met the others only in the next review. K9
(the addressable Attempt defined by state, key-less members by ending), K10 (flags defined against states that change
during a re-send), K11 (`UnresolvedHold` ignoring Flow's own guards) and K12 (the hold ordering a lane while the text
said the actor) all follow from that. The fix is one table (3.8.1).

**Revision 6's causes** are review 4's K4–K8: the hold had no owner of its end (OD6), `cancel` named a lane while
`retry` named an Attempt (OD7), a key-less member's address depended on runtime origin (OD8), some per-kind rules
read closures or the store (K7), and the hold assumed one writer and dependent writes (K8). See the Revision 6
paragraph above for each fix.

**Revision 5's causes** are review 3's K1 and K3, now decided. **K1 (OD5): replacement was defined by start order,
not by what reached the server**, so a sent write's ending could vanish and a newer write could pass an unresolved
one; the fix is the hold (3.8.1). **K3 (OD4): the key was a closure**, which no tool could read, had no Schema, could
not be derived from an item, and was checked before the domain default existed; the fix is a field list (3.3).

### 0.2 Concepts, before and after

Counted against the design as it stands (MD with merges 3–6). A **word** is a new keyword or method, including a new
method on an old word; a **mode** is a second way to use one thing whose rules differ; a **rule** is a per-kind or
per-case rule an author must know. Revision 3's column is review 3's honest recount (R3, "Concept count"), not
revision 3's own claim of 3 words and no modes.

| | Revision 2 | Revision 3 (R3's recount) | Revision 4 | Revision 5 | Revision 6 (R4's method) | Revision 7 (R5's method) |
| --- | --- | --- | --- | --- | --- | --- |
| New words | `.emits`, `.live()`, `.each` on an operation, `.joins`, `.was`, `start`, `with`, `at`, `retryable`, `superseded:`, `Inactive`, record `pending`, `get`, `RetainedReleased` (14) | `start`, `retryable`, `get`, `.outcomes()`, `.params()`, `.each()` (6) | `retryable({ times })`, `get(s, k?)` on an operation, `.outcomes()`, `.each` on `subscribe` (4). Only `retryable` is wholly new: `get` is OPS O6's `descriptor.get(snapshot, params)` moved to the operation (by key, not params, and now also over write lanes); `outcomes` is the existing commit and activity option, now a method; `each` is an existing word (`.each` traits) on a new receiver | the same 4. The key's field list is a NEW MEANING of `key`, and the row's `uncertain` is M4's word in a new place; neither is a new word. Not counted as words in any column: the denial `Uncertain` and the finding `KeyRequired` (both proposed) | 4, the same. Q27 A would add `params` on a resource (5). Codes authors meet but don't write: `Uncertain`, `KeyRequired`, `VerbMismatch`, `Released`, `UnresolvedHold`, `UnmappedUnknown`, `SharedEnding` | **6**: R5's recount of revision 6 is right; `waiting` (a row field authors read) and `Story.ending` (a Story driver) are words. Q34 A would add none (a partial key on an existing member) |
| Existing words kept | | | `commit`, `lookup`, `subscribe` (OPS O2, O3: the verbs the design already has), `refetch`, `retry`, `cancel`, `idle` | the same, plus `uncertain` (M4) on the write row | the same, plus `waiting` on the write row (OD6) | the same |
| Modes | `.each` over an entity / over a memory list; joined / unjoined; live / one-off resource (4) | (a) one-off or live decided by the mapped key; (b) bare means view-read for reads, evidence-only for writes; (c) `cancel(k)` interrupts or releases by lane state (3) | (c) only (1). (a) is gone: the verb decides, a mismatch is an error (OD2). (b) is gone: bare means "maps nothing" for every kind, and the verb says how the work runs. (c) is review 3's K1, then open (Q24; decided in revision 5 as OD5) | **none** (0). (c) is gone: `cancel` empties its lane in every state, and a newer commit never releases an unknown (OD5), except under `cancel` concurrency (3.8.1 rule 5; R4 L2). Borderline, stated: a key-less member on a keyed operation means "this ending's lane"; anywhere else it is an error (`KeyRequired`), so it never silently means another lane | **0, honestly.** R4 found 2 in revision 5: key-less addressing by runtime origin (removed by OD8: the token decides) and "whether a write holds depends on its mapping" (removed by `UnmappedUnknown`: only bare or not decides) | **0.** R5's borderline (`cancel` with three effects by lane state) is now three cells of one table, each keeping "nothing newer while an older write is unknown"; an effect per state is what `retry` has too, not a mode |
| Rules | draining; retained-unknown release on leave, on mark clear, past 64; the persistence rebind ladder; `superseded` channel exceptions | 6, hidden: row shape by kind; `get` idle or `undefined`; replacement scope per key, per operation or none; the key derived three ways; `key` with two meanings; `restartOn` per key, `armOn` banned | 8, each written in 3.13: lane identity per kind (S3, with the key's meaning per kind); rows per kind (S12); `get` idle or `undefined` per kind (S12); replacement per kind (S5); verb agrees with mapping (S11); `cancel` on a one-off read (S13); the key derived three ways (unchanged, K3 open); `restartOn` per key (3.12) | 10, each in 3.13: the 8 of revision 4, with the key's source now data (a field list, the entity's primary key, or `[]`) and `restartOn` keys as records (S14); plus **the hold** (S7: an unknown holds its write lane) and **key-less members in an ending's handler** (S2, OD4) | **17**, each checkable from tokens except 9 (until Q30): 1 lane identity per kind; 2 rows per kind (with `waiting`, a held one-off entry, `get` idle or `undefined`); 3 replacement per kind; 4 verb agrees with mapping, one verb per operation; 5 `cancel`: one Attempt on a write, the wait on a read; 6 the hold per policy (`latest`, `reject`, `serialize` hold, `allow` does not, `cancel` concurrency releases on a newer commit); 7 `idle`'s two denials; 8 key-less addressing (OD8); 9 the domain default's conditions; 10 keyed schedules use key records; 11 `restartOn` per key, `armOn` banned; 12 bare never holds, a mapped holding write maps `unknown`; 13 one-off lanes not persisted; 14 S4 at the operation; 15 S6; 16 every hold has an owner (`UnresolvedHold`); 17 ending events come only from endings. R4 counted about 16 for revision 5; OD7 and OD8 shorten 5 and 8, and 16 and 17 are new | **14** (R5's audit, 3.13 tags [1]–[14]): lane identity (with key records); rows (flags by state); replacement; verb agrees; `cancel` (one Attempt on a write, the wait on a read); the hold per policy (with `idle`); key-less addressing; keys (declared, primary key, or `[]`, checked at the operation); `restartOn` per key; bare never holds; one-off lanes not persisted; one write operation per contract; every hold has an owner (with unmapped unknowns); mapped events only from endings. The write lane's 30 cells are one definition, not rules |
| Removed from the design | `laneKey`, `SharedCopyLane`, lane eviction, the Attempt's copy key and starter, `s.calls`, `s.activities`, `keys` on activities | the same | the same; and revision 3's `start` and `params` | the same; and closure keys, the `thisX` selectors in ending handlers, `memory.likeUnsure`-style mirrors, "a newer commit releases an unknown" | the same; and "`cancel` empties its lane", runtime-origin addressing, shared unknown events where handlers act on lanes | the same; and `UnmappedUnknown`, `SharedEnding`, the `cancel`-concurrency release, "delivered once and not retained" |

The rules count rises from 6 to 8 in revision 4 because two are new (S11, S13) and none is hidden any more; the words
fall from 6 to 4 and the modes from 3 to 1. Revision 5 keeps 4 words, removes the last mode and adds two rules (the
hold and key-less members in endings); what an author writes shrinks: no key closures, no key selectors in ending
handlers, no mirrored id lists.

Revision 6 (review 4's method: count rules an author must hold, not just new syntax): 4 words, 0 modes, 17 rules.
Revision 5's own claim of 10 rules undercounted; the honest figure was about 16 with 2 modes. The count rises because
the hold's consequences are now written down instead of left to the author, and both modes are gone.

Revision 7 (review 5's method): **6 words, 0 modes, 14 rules**, plus the write-lane table as one definition (OD10).
Every rule is checkable from tokens except the domain default's entity (Q30). The table is larger than any one
rule it replaces, but an author reads one table instead of six paragraphs, and a Story suite can visit each cell.

Revision 8 (review 6's method): **7 words, 0 modes, 14 rules**. The words are revision 7's six plus the one-off row's
`key`, a field authors read (R6). Not counted: `input` and `output` on every kind (renames and existing words in new
places, OD12), `outstanding` (MD's word, kept), `HeldThisTurn` (a table label, not written by authors). Q36 A would add
none (a per-tag record, as `failure` already has). The modes stay 0: R6 M1's spelling difference is gone. The rules
stay 14: S4 is simpler (no default, no conditions), and OD16's timing is a definition of when the table applies, not
a rule an author holds.

## 1. Requirements

| # | Requirement | Source |
| --- | --- | --- |
| R1 | **One reference, one thing.** Every read, guard and action names exactly one lane, or says how it aggregates. | AU N1 |
| R2 | **Per-call members name one Attempt** (`retry`, `retryCount`, `progress` only where a lane holds at most one addressable Attempt). | AU N2 |
| R3 | **Existence is explicit.** | AU N3 |
| R4 | **Every ending that can matter is delivered once, to an owner that can handle it**; work the contract declares replaceable is not. | MD rules 8, 17; R2 C-H2 |
| R5 | **The input is typed where the work starts.** | TS (b) |
| R6 | **Results map to events with full payload mappers.** | MD rule 13 |
| R7 | **Declared once**; no trigger in the declaration; **one identity per server thing**, stated by the contract. | owner; R2 C-H1 |
| R8 | **Locality**: the identity of a server thing sits on the contract that talks to it. | AGENTS |
| R9 | **No leaked wiring**: no mirrored id lists, no counters in events, no internal key records in views. | AGENTS |
| R10 | **One runtime, one graph**; `flow check` reads declarations and tokens, never closures. | AGENTS |
| R11 | **Views, `check()` and Stories read the same published data**, typed from the definition. | MD D18 |
| R12 | **The store's split stays**: the store owns shared data; the lane owns this actor's workflow. | M4 rule 26 |
| R13 | **Streams keep their three layers.** | M6 |
| R14 | **Persistence survives refactors** and keeps retry budgets. | MD C17; R2 C-M1 |
| R15 | **Fewer concepts**; cut scope for correctness. | owner |
| R16 | **Views never look up a lane by an internal record or a `find`**; they read by the author's own key through a typed, total accessor. | owner's bug list |
| R17 | **Guarantees are checkable at declaration.** | R1 high 3 |

## 2. Where the data comes from

| Step | Real source | Where it is written | Changes here |
| --- | --- | --- | --- |
| Request and response | `fetch`, an SDK, `XMLHttpRequest`, a `WebSocket` | an Effect service (`StripeApi`, `ChatSocket`) | no |
| Cancel | `AbortController`: Flow interrupts the fiber, which aborts the `signal` the commit passed to `fetch` | the commit | no |
| Classification | `Outcome.success / failure / unknown`; a stream's `Session.*` signals | the contract | no |
| Idempotency | `attempt.id`, put on the wire by the commit | the contract | no |
| **Which server thing a call is about** | the contract's `key`, a list of input fields (OD4), required on every contract, `[]` for one (OD15) | the contract (`*.contracts.ts`) or the domain | **kept**; for a write, now the lane's identity; for a read, still the cache entry (OPS O1) |
| Which event a result becomes | the operation's `outcomes` mappers | the definition's `operations` | **moved** from the machine body |
| The input of one commit or lookup | its select over after memory and event | the transition: `O.pay.commit(select)`, `O.read.lookup(select)` | **moved** (the select only; the verbs are the design's) |
| Lane state | Flow, per (operation, key) | `s.operations.<name>`, `O.<name>.get(s, key)` | **renamed** from `s.calls`, `s.activities` |
| Shared record data | the store | `Entity.get(s, key)` (`predicted`, `uncertain`) | no |

The path for one payment (files in 5.1): `StripeApi.confirm(input, { idempotencyKey, signal })` wraps `fetch`; the
contract `Stripe.confirm` classifies the response with `Outcome`; the operation `pay` maps each ending to an event with
`outcomes`; `Pay` lists `O.pay.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId:
event.paymentMethodId }))`; the view reads `s.operations.pay.pending`.

## 3. The model

### 3.1 Vocabulary

| Concept | Name | Mark |
| --- | --- | --- |
| A module-level `transaction`, `resource`, `stream`, or a domain entry | **contract**, in `*.contracts.ts` | new term for an existing thing; decided (OD17, Q18); RENAMED file suffix (was `*.operations.ts`) |
| Which server thing a call is about | the contract's `key: ["field", ...]` | existing (OPS O1), NEW MEANING: a field list (OD4); for transactions, NEW MEANING: the lane's identity; for resources and streams, unchanged: the cache entry or session identity |
| A named entry of a definition's `operations` | **operation** | existing word, NEW MEANING |
| What results become | `.outcomes({ ... })` on a contract | existing word (the commit and activity option), now a method; the names `outcomes`, `get`, `O`: decided (OD17, Q15) |
| Commit a write | `O.x.commit(select)` in `actions` | existing (OPS O3); outcomes move to the operation. **Decided (OD2)** |
| Look up a one-off read | `O.x.lookup(select)` in `actions` | existing (OPS O2); outcomes move to the operation. **Decided (OD2)** |
| Place live work while a state is active | `activities: [O.x.subscribe(select, { when? })]` | existing (OPS O2, O4: the activity verb and the stream's own function name). **Decided (OD2)**. `activities` NEW MEANING (a list) |
| Place one session per key | `activities: [O.x.subscribe.each(select)]`, the select returning a list of params | `each` existing word (`.each` traits), NEW on `subscribe`; replaces `keys` on activities. **Proposed** spelling (see below) |
| Members | `retry`, `cancel`, `idle`, `refetch` existing; `retryable({ times })` NEW (**decided, OD1**); members that name a write lane take a key selector when the contract has key fields | |
| Read a lane in a view | `O.x.get(s, key?)` | existing word: OPS O6's `descriptor.get(snapshot, params)`, moved to the operation and taking the lane's key; like `Entity.get(s, key)` and `S.X.is(s)` |
| Handles | `O`, in the machine and exported by the definition | NEW MEANING (was the module record) |
| Raw rows | `s.operations.x`; guards and selects receive `operations` | NEW path |

**`subscribe.each` or `each`** (decided, OD9). Revision 4 writes one session per key as `O.docs.subscribe.each(select)`,
not `O.docs.each(select)`. Reason: OD2 makes the verb say how work runs, so every live placement keeps the word
`subscribe`, and a search for `subscribe` finds them all; `each` then reads as a variant of `subscribe`, not a fourth
verb. Cost: five more characters. **Decided (OD9, Q22).**

### 3.2 What an operation is

An operation binds one contract to this definition's events. It holds **no select, trigger, params or key**, and
**no verb**: the machine's verb says how it runs (decided, OD2).

```ts
// Excerpts from 5.1, 5.3 and 9.1
operations: ({ E }) => ({                                                       // existing keyword, NEW MEANING
  pay: Stripe.confirm.outcomes({                                                // user-defined: pay; existing word outcomes, now a method
    success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })),
    failure: { CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })), Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), TooManyAttempts: E.TooManyAttempts, Rejected: E.Refused, NotSent: E.TryLater },
    unknown: E.Unsure,
  }),
  read: Stripe.intent.outcomes({ success: E.Intent.from((v) => ({ status: v.status, chargeId: v.chargeId })), failure: E.ReadFailed }),   // maps success: the machine must use lookup
  issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }),   // maps value: the machine must use subscribe
  like: Issues.setLike.outcomes({ success: E.Settled, failure: { Gone: E.IssueGone, Refused: E.Failed.from(() => ({ message: "Could not update" })), NotSent: E.Failed.from(() => ({ message: "Could not update" })) }, unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })) }),   // keyed by the domain's .predicts: one lane per Issue
  typing: ChatTyping.typing,                                                    // bare: maps nothing; the machine subscribes
}),
```

Per kind (OD3: the declaration is one shape, the rest is per kind):

| Contract kind | Verb in the machine | `outcomes` keys | Other members | Row |
| --- | --- | --- | --- | --- |
| transaction, domain write | `O.x.commit(select)` in `actions` | `success`, `failure`, `unknown` | `retry(k?)`, `cancel(k?)` in `actions`; `idle(k?)`, `retryable(k?, { times })` in `guard` | per contract key: `{ pending, uncertain, waiting, retryCount, progress? }`, the flags defined by lane state (3.8.1, OD10); under `allow`, `{ pending, outstanding }` (no hold) |
| resource, domain read, used one-off | `O.x.lookup(select)` in `actions` | `success`, `failure` | `idle`, `cancel` (proposed, S13) | one per operation: OPS O6's resource lane for the entry its latest lookup named, `undefined` before the first lookup (proposed, S12) |
| resource, domain read, used live | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `failure` | `refetch(k?)` | OPS O6's resource lane per placement, per key under `each`; `undefined` while not placed |
| stream, domain `listen` | `O.x.subscribe(select)` or `O.x.subscribe.each(select)` in `activities` | `value`, `gap`, `complete`, `failure` (M6 rule 50) | none | M6 4.1.5's stream lane per placement, per key under `each`; `undefined` while not placed |

**The verb and the mapping must agree** (proposed, follows from OD2). A resource operation that maps `success` can
only be looked up; one that maps `value` can only be subscribed; one that maps neither (bare, or `failure` only) may
use either verb, but **one operation uses one verb**: a definition whose machine both looks up and subscribes the same
operation is a declaration error (`VerbMismatch`), as is `lookup` on an operation mapping `value` or `subscribe` on
one mapping `success`. On a typed handle these are type errors first (4); `flow check` reports them from the tokens
for untyped code and Inspection. Deleting a `success` mapper now breaks the `lookup` that needed it, loudly, instead
of turning it into a placement (review 3's mode (a)). Transactions have only `commit`, streams only `subscribe`.

Proposed, follows from OD5: **a bare write's unknown is not retained.** No handler sees it, so nothing could retry
or release it, and under the hold it would block its lane for good (9.1's `latest` ping). It ends as evidence and the
lane is free; a bare write is fire-and-forget by declaration.

Proposed (R4 M7, removes R4's mode 2): **a write that maps anything must map `unknown`** when its policy holds
(`reject`, `latest`, `serialize`); otherwise `UnresolvedHold` reports it (3.8.1, case 1; revision 6's separate
`UnmappedUnknown` is folded in, R5 audit). So whether a write holds depends only on "bare or not", never on which
keys are mapped. `cancel` and `allow` do not hold, so there it is not required.

A **bare** operation (`typing: ChatTyping.typing`, `ping: ChatTyping.ping`) maps nothing, for every kind: none of its
results becomes an event. What happens to them is the kind's own rule, not a second meaning of "bare": a write's
results are evidence only (S10), and a read's or stream's data is in its lane for views. Declaring a write bare is the
explicit ignore, as `{ target: "self" }` is for a late event (D13). `flow check` lists bare writes as info.

### 3.3 Lane identity, per kind

**Each kind states its own identity** (OD3). The contract's `key` keeps OPS O1's meaning, "which server thing", for
every kind; what a lane is per differs:

| Kind | A lane is | The contract's `key` is | Status |
| --- | --- | --- | --- |
| write (`commit`) | (actor, operation, contract key of the input) | the lane's identity: one write in flight per thing (D9) | **decided (OD9, Q2)** |
| one-off read (`lookup`) | (actor, operation): **one lane per operation** | the cache entry the lookup reads (OPS O1, O2), not the lane | proposed, follows from OD3 (R3 K2); its delivery rule decided (OD9, Q6) |
| live read or stream (`subscribe`) | (actor, placement); under `subscribe.each`, (actor, placement, key) | the entry or session (OPS O1, O4); under `each`, also the session's key | proposed (revision 3, kept) |

Why one lane per one-off read operation: a one-off read operation shows one thing (a search box's results, a
reconcile read's answer). With lanes per cache key, as revision 3 implied, "only the latest lookup is delivered" was
per operation while the row and `get` were per key, so a lazy tree lost node A's children when node B expanded, and a
search view read a keyed lane as a plain row (R3 H4, M3). With one lane per operation the delivery scope, the row and
`cancel` are the same thing. A per-thing one-off read (a tree's nodes, one card's details) is a live
`subscribe.each` over the things shown, or one operation per independent read.

**The contract's shape** (decided, OD11–OD15). Every kind (transaction, resource, stream) has exactly two flat
schemas, **`input`** and **`output`** (OD12; `result` is renamed `output`, and there is no `params` schema), each a
fields record (`{ q: Schema.String }`, wrapped as `Schema.Struct`) or a full Schema for unions and classes (OD14).
Errors stay `Schema.TaggedError` classes typed through the function's Effect. The function stays inline (`commit`,
`lookup`, `subscribe`) and calls user services whose Layer is the swap point (OD11). Effect RPC is not inside the
contract (OD13): `Rpc` is unstable in 4.0.5 and brings wire machinery Flow does not need. A later, opt-in
`resource.fromRpc` / `transaction.fromRpc` adapter would take an existing `Rpc` for its two schemas and map a
client error to `unknown`, when a real app needs it.

Consequences, stated (proposed where not in an OD): **persistence** decodes every lane's and persisted entry's key
with `input`'s pick, and a persisted resource's data with `output` (OPS O1's "persisted resources require result"
reads `output`); **SSR** transfers `output`-decoded data (ServerRendering O3's "without result" becomes "without
`output`"); **merge 6** streams gain `input` with the resume position outside the key, so M6 4.1.1's `messages` is
`input: { roomId, after }, key: ["roomId"]`; **merge 4** domain reads and writes take `input`/`output` from their
contract, and `.predicts` reads `input`; **Stories** build fake contracts with the same two schemas; **`flow check`**
reads `key` against `input`'s fields as data. OPS O1 is rewritten around `input`, `output` and a required `key`.

**The key is a field list of `input`** (decided, OD4, OD12; R3 K3), like an entity's `primaryKey`: `key: ["docId"]`,
and a composite key lists every field, `key: ["docId", "field"]`. **`key` is required on resources and transactions,
with no default** (decided, OD15): one lane or one cache entry is written `key: []`. Proposed for streams (OD15
leaves them open): required as well, `key: []` for one session, because a stream's key is its session identity (OPS
O4) and the same rule on every kind is one rule; a resume position such as `after` is an ordinary input field outside
the key (OD12). Consequences:

- **It has a Schema**: `input`'s pick of those fields, for every kind, so a persisted lane's or entry's key decodes on
  restore (R3 M5) and Inspection prints it without running code. Review 5's Q27 (a read's key Schema) is answered by
  OD12: every kind has `input`.
- **`flow check` and Inspection read it** (R10): a list of names is data, not a closure.
- **The key record has one meaning everywhere**: the pick of those fields, `{ docId: "d1" }`, in a mapper's `key`, a
  lane's `key`, a keyed list's rows and (proposed, L1) a keyed schedule's `key` (3.12).
- **Any value that carries the fields names the lane** (OD4): `O.post.get(s, msg)`, `O.save.idle(({ event }) => event)`.
  Flow picks the fields; extra fields are ignored; a missing field is a type error.
- **The limit** (OD4): no derived or nested keys. `key: (i) => ({ id: i.card.id })` or a key computed from two fields
  cannot be written; the input must be reshaped so the key is top-level fields (`{ cardId, ... }`). OPS O1's other
  rules (canonical values, size bounds, `InvalidKey`) still apply to the picked values.

For writes:

- **It is stated once**, on the contract, and picked at every commit. A commit cannot name a lane that disagrees
  with what it sends. Nothing in a definition or machine spells it, except where a member must name a lane without an
  input (`retry`, `cancel`, `idle`, `retryable`, `get`). Where they may omit the key is fixed by tokens, never by
  where an event came from at runtime (decided, OD8): **on an unkeyed operation** a key-less member always names its
  one lane, in any handler; **on a keyed operation** it may stand only in a handler of an event that this operation
  alone maps, and names that ending's Attempt; anywhere else it is `KeyRequired`. Elsewhere members take a selector
  returning any value that carries the key's fields, usually the user event that names the thing. An event shared by
  several keyed operations whose handler acts on lanes is split per operation (5.3: `RenameUnsure`, `RemoveUnsure`).
  Revision 5's "acts only if this turn's ending is X's" is removed (R4 H4: either reading broke a case).
- **Lanes are created by work** (the first commit for a key) and **removed when they hold nothing** (no outstanding
  Attempt and no retained unknown). No membership list, no draining, no `max`. An unused key has no lane, and
  `O.x.get(s, key)` returns the idle row for it, which is true: nothing is in flight for that thing.
- **An unkeyed contract** (`key: []`) has one lane per operation; its row is plain:
  `s.operations.pay.pending`.
- **Every transaction states its key** (OD15), so "`latest` and `cancel` need one" is no longer a separate rule:
  "only the newest matters" has its "of what" written on every contract. `key: []` on a `latest` write says "one
  thing", explicitly. R3 M4 (domain writes failing an early check) is gone with the default.
- **Domain writes state their key too** (decided, OD15). Revision 5's primary-key default and M4 rule 34's
  `.predicts` default are gone: `setLike` writes `key: ["id"]`. M4 rule 34's warning becomes "a declared key that is
  not the predicted record's primary key" (proposed). R4 M3 (the default's entity read from a closure) and Q30 go
  with the default.
- **Routing is unchanged** (MD rule 14): a commit or lookup is owned, for current-or-late routing, by the state
  activation its transition names.

Per-field autosave, the case that broke revision 2 (R2 C-H1):

```ts
// settings.contracts.ts
export const saveField = transaction({
  id: "settings/save-field",
  input: { docId: Schema.String, field: Schema.Literals(["title", "description", "tags"]), value: Schema.String },   // OD14: a fields record
  key: ["docId", "field"],                                                     // NEW MEANING (OD4): key is a field list; one lane per field: title, description and tags never supersede each other
  concurrency: "latest",
  commit: (i, { attempt, signal }) => SettingsApi.use((api) => api.patch(i, { idempotencyKey: attempt.id, signal })),
})
// in the machine: one commit, the key comes from the input
FieldEdited: { target: "self", actions: [O.save.commit(({ memory, event }) => ({ docId: memory.docId, field: event.field, value: event.value }))] },   // existing: commit
```

### 3.4 Rows and how views read them

Rows are per kind (OD3; S12, proposed):

- **Unkeyed write operation**: `s.operations.pay` is the row: `{ pending, uncertain, waiting, retryCount,
  progress? }`. The flags are functions of the lane's state (decided, OD10; table in 3.8.1): **`pending`** is
  `InFlight` (NEW MEANING against MD rule 21, which counted a waiting start); **`uncertain`** (OD5, M4's word) is
  `Held`, so a view shows "not confirmed" and a schedule's `keys` can read it (R3 M2), and it is false during a
  re-send; **`waiting`** (OD6) is "a never-sent commit exists", so a view can say "your newer edit waits" and a guard
  can keep a live answer from overwriting it (8.2's `Loaded`).
- **Keyed write operation**: `s.operations.like` is a keyed list (MD N1) of the lanes that exist, each
  `{ key, ...row }`, in creation order, for Stories and Inspection. Views read one lane with
  **`O.like.get(s, issue)`**, passing the item they render (decided, OD4): any value carrying the key's fields, so a
  view never builds a key record. Total: the idle row when the key has no lane. A value missing a field is a type
  error (AU F9's failure). R3 M7 is reduced less than revision 5 said (R4 L5): TypeScript is structural, so any
  record with an `id`, of any entity, type-checks against `["id"]` and reads idle. Branded keys would close it; not
  proposed.
- **In callbacks** (proposed, R4 M1): `O.x.get(operations, k)` reads a lane in a guard or `updateMemory` as in a view,
  so no callback writes `operations.save.find(...)` (R16).
- **One-off read operation** (*decided, OD9* (Q21)): `s.operations.read` is one row: OPS O6's resource lane
  (`Pending`, `Ready`, `Refreshing`, `Failure`, ...) of the entry its latest lookup named, and `undefined` before the
  first lookup and after `cancel`. Proposed (R4 M4): **the operation holds that entry** until its next lookup or
  `cancel`, as a placement holds its entry, so `gcTime` cannot empty the row of an idle search box; the data shown is
  still the store's current confirmed data (another actor's refetch of `{ q }` updates it, as for any held read). A one-off
  read and a live read of one resource therefore have the same row type, so the definition can type the row without
  knowing the verb (4). "A lookup of mine is running" is `_tag` `Pending` or `Refreshing`. Revision 3's `{ pending }`
  is dropped: OPS O6's `pending` already means "live optimistic values", and a second meaning on one row would be a
  hidden mode. Proposed (R5 M7): the row also carries **`key`**, the key record of the entry it holds, as keyed write
  rows do, so a guard can tell which input the row answers (`operations.name?.key.name === memory.name`) without a
  memory mirror (9.6). No new word. Proposed (R6 L3): an unkeyed live placement's row carries `key` too, so a one-off
  and a live read of one resource still have the same row type.
- **Live operation**: `s.operations.feed` is the placement's lane, `undefined` while not placed (OPS O6); under
  `subscribe.each`, a keyed list read with `O.load.get(s, { docId })`, `undefined` for a key not placed.
- **Why a join and not rows on items** (revision 2's choice, R2 C-H3, C-M3): the items a view renders (an answer's
  rows, memory drafts, the store's records) and the lanes with work are different sets with different lifetimes: a
  deleted issue can still be saving, a never-edited row has no work. Any attachment needs a membership rule and its
  edge cases. A typed accessor by the thing's own key needs none.
- **The record keeps its shared state**: `Issue.get(s, key)` returns `{ data, predicted, uncertain, unconfirmed }` as
  in M4; `predicted` already shows "an unconfirmed write is applied", for every actor and every write, many-record
  ones included. "This actor is saving this one" is the lane.

```tsx
const paying = useView(checkout, (s) => s.operations.pay.pending)                          // unkeyed write
const saving = useView(list, (s) => List.O.like.get(s, issue).pending)                     // keyed write: the item the view renders (OD4)
const unsure = useView(list, (s) => List.O.like.get(s, issue).uncertain)                    // NEW (OD5): this actor's write is unknown
const row = useView(list, (s) => Issue.get(s, { id }, Issue.pick("title", "liked")))         // shared: predicted, uncertain
const hits = useView(search, (s) => s.operations.results?.data?.hits ?? [])                  // one-off read: one lane per operation
```

### 3.5 Members

- **`commit(select)`** (existing, OPS O3; decided, OD2) runs the select on the turn's after memory and event (rule
  22), picks the key, mints an Attempt, and invokes the contract under its `concurrency` on that key's lane. A busy
  `reject` lane, or one holding an unknown (OD5), ends the commit `NotSent { why: "Rejected" }` and the transition
  runs (rule 16).
- **`lookup(select)`** (existing, OPS O2; decided, OD2) runs the select, joins or starts the entry's lookup (OPS O2:
  fresh data settles with no request), and points the operation's one lane at that entry. A newer lookup of the same
  operation releases the older one's delivery (3.8.2).
- **`subscribe(select, { when? })`** and **`subscribe.each(select, { when? })`** (existing verb, OPS O2, O4; decided,
  OD2; `.each` proposed) place a live operation; `each`'s select returns a list of params, one session per distinct
  key, repaired like `.each` keys (rule 23). `when` may hold state tokens. OPS O2's `subscribe` options
  (`placeholder`) stay on the placement.
- **`retry(k?)`**, **`cancel(k?)`**, **`idle(k?)`** on a write, as in MD 2.7.3, on the lane `k` names; `k` returns any
  value carrying the key's fields. **Key-less addressing** (decided, OD8): on an unkeyed operation `k` is always
  omitted and names the one lane; on a keyed operation `retry`, `retryable` and `cancel` may omit it only in a handler
  of an event that operation alone maps, and then address that ending's Attempt; anywhere else a key-less member of a
  keyed operation is `KeyRequired`, a type and `flow check` error. `idle` and `get` always take a key on a keyed
  operation. A key-less member in an ending acts on that ending's own Attempt (3.8.1, R5 K9). Revision 6's
  `SharedEnding` info is cut (R5 L4): it fired only on the intended use.
- **Mapped events come only from endings** (proposed, simplified per R5 L3). An event an `outcomes` maps is never a
  schedule's `send`, a `raise` or a view's `send`; `outcomes` map only `internalEvents`. `flow check` reads all three.
  Stories drive endings through the operation (`Story.ending(O.like, "unknown", { id })`); on a lane with nothing on
  the wire it is a Story error.
- **`retry`, `cancel`, `idle`, `retryable` on a write do exactly what the write-lane table in 3.8.1 says** (decided,
  OD10), per state; the bullets below are summaries. The addressable Attempt is the one sent Attempt the lane holds
  in `InFlight` or `Held` (the head under `serialize`).
- **`retry`** re-sends a `Held` Attempt with its id and input unchanged (M4 rule 31); in `Idle` or `InFlight` it sends
  nothing. A failed Attempt is resolved and not re-sendable (R5 L5; amends MD rule 21).
- **`idle(k?)`** passes in `Idle`; it denies `InFlight` in `InFlight` and `Uncertain` in `Held`. Proposed.
- **`retryable({ times })`**, **`retryable(k, { times })`** (decided, OD1): passes in `Held` while `retryCount <
  times` (re-sends after the first send, as `Effect.retry({ times })` counts); denies `RetryLimit { retryCount }`,
  `InFlight`, or `NothingToResend` by state. `check()` reports the same denial. Budgets never travel through events.
  Writes only.
- **`cancel` addresses one Attempt, the same one as `retry`** (decided, OD7). In `InFlight` it interrupts an invoked
  Attempt; the lane stays `InFlight` until the interrupt's ending is admitted, and that `unknown { Cancelled }` is
  **retained**, so the lane becomes `Held` and nothing newer is sent while the request may still land (R5 H1, R6 L1).
  An Attempt promoted this turn and not yet invoked ends `NotSent { why: "Cancelled" }`, delivered (MD rule 24). In
  `Held` it releases the Attempt (`Released`) and the queued commit is promoted at once (OD16). In `Idle` it does
  nothing. So `[O.x.cancel, O.x.cancel]` in one `Held` turn releases, then ends the just-promoted commit, visibly (R5
  M5). Mode (c) stays gone: one address, an effect per state, as `retry` has.
- **`cancel` on a one-off read** (proposed, follows from OD3; S13) releases the operation's lookup: nothing is
  delivered, the row becomes `undefined`, and the shared request continues only if another holder needs it (OPS O2:
  "Releasing one owner preserves shared work"). OPS O7's "resources have no cancel action" stays true of the entry:
  this cancels this operation's wait, not the cache. `idle` on a one-off read passes while no lookup of the operation
  is waiting.
- **`refetch(k?)`** re-requests the entry a live placement holds (OPS O2).
- **Mapper context**: writes `(value, { input, attempt, progress, key })`; reads and streams `(value, { input, key })`
  (RENAMED, OD12: was `{ params }`).
  `key` is always the contract's key record of the call that ended, the pick of its key fields; it identifies the lane
  for a write and the entry or session for a read or stream (3.3). MD 2.7.10's keyed-activity `key` and (proposed,
  L1) a keyed schedule's `key` are the same record. `laneKey` and `superseded` are gone.

### 3.6 The contract: concurrency, `key`, one write operation per contract

- `concurrency` stays required on the transaction and governs each lane.
- `key` stays optional (OPS O1), is a field list (OD4), is **required under `latest` and `cancel`** (declared or the
  domain default, checked at the operation), and is now what a write lane is per.
  Revision 2 removed it to delete the K-rule; with lanes per key there is no K-rule to delete: different keys are
  different lanes. For reads it keeps OPS O1's meaning only (3.3).
- **Two write operations on one write contract** in one definition are a declaration error (`SharedContract`). D9's
  "one write in flight per key" holds by construction. Revision 2's `.joins` is removed (R2 A-M1, C-M6): a second kind
  of start is a second `commit` of the same operation with its own select; when the handlers must tell them apart,
  the starting transition records it in memory (9.2's `method`; R3 M6: correct for an unkeyed lane, a known limit for
  concurrent starts on different keys). Reads and streams are exempt: two reads never charge twice, and two sessions on
  one key end `DuplicateSession` (M6 rule 47).

### 3.7 Lifetime

Per kind (OD3):

| Lane | Lives | An ending after it is gone |
| --- | --- | --- |
| a write lane | from its first commit while it has outstanding work or a retained unknown | cannot happen: the lane outlives its work |
| a one-off read lane (proposed) | from the operation's first lookup until `cancel`, or the actor ends; it holds its entry until the next lookup or `cancel` (R4 M4) | a released lookup's settlement is evidence only (3.8.2) |
| a placement's session | the state activation | a released session's delivery is discarded (M6 rule 44) |

- A lane's **status** changes **only in this actor's turns**: at a commit or lookup (step 6), at an ending's admission
  (step 1), and at a `cancel` (R5 L7: status, not data). No store event and no other actor touches it (R2 C-M3). A
  one-off read row's data is the held entry's current confirmed data, so another actor's refetch changes the data,
  not the status.
- A write's retained unknown stays until its retry succeeds or fails, or `cancel` releases it (decided, OD5); a newer
  commit no longer replaces it, except under `cancel` concurrency (3.8.1). While it stays it holds its lane, and the
  row's `uncertain` is true. Each is a real unresolved write the UI may show; there is no cap (R2 C-M3: a cap would
  hide one).
- **An inactive placement is `undefined`** (OPS O6, unchanged). Revision 2's `Inactive { data }` is removed (R2 C-M5:
  it kept data across different params). Continuity across params is OPS O6's `placeholder({ previous })`, which the
  author asks for explicitly.
- `DuplicatePlacement` (decided, OD17, Q14): one operation placed on two states that can be active together is a construction error unless
  state tokens in their `when` arrays make them exclusive (closures are not read, R10).

### 3.8 Replaced work is not delivered, per kind

Revision 3 stated one rule for writes and reads. Under OD3 each kind has its own: writes follow OD5 (3.8.1), the read
rule is scoped to the one-off read lane (3.8.2), and live work has none (3.8.3).

#### 3.8.1 Writes: only a never-sent commit is replaceable (decided, OD5)

Revision 3 dropped the ending of a sent `latest` Attempt as if it had never been sent, and let a newer commit go out
while an older unknown was unresolved. Review 3 showed both produce silent wrong state (R3 K1: H1 the late landing,
H2 lost facts, H3 the wrong retry under `cancel`, M1 a second charge under `reject`). The principles (decided, OD5):

1. **A never-sent commit is replaceable**; the replaced one ends as evidence `Superseded` (`NotSent { why:
   "Superseded" }` for a domain write, M4 rule 29) and no handler sees it.
2. **A sent Attempt's ending is always delivered**: success, failure and unknown, each mapped once (R3 H2).
3. **A retained unknown holds its lane** until `retry` resolves it or `cancel` releases it. **The hold is the
   default** (decided, OD6): no quiet release and no automatic retry (MD rule 25).
4. **`cancel` acts on the same one Attempt as `retry`**; after it is released, the waiting commit is sent; `cancel`
   never silently drops a waiting commit (decided, OD7).

Revisions 5 and 6 stated how a lane behaves under each member and ending in prose, and each prose patch opened the
next hole (R4 H1–H4, R5 H1, H2). Revision 7 states the write lane once, as a state machine (decided, OD10), and every
other sentence about write lanes in this proposal is a reading of the table below.

##### The write lane (decided, OD10; cells proposed; timing decided, OD16)

**States.** A write lane is in one of three states, each with an optional waiting part `W`:

| State | Meaning |
| --- | --- |
| `Idle` | no sent Attempt is unresolved, and `W` is empty |
| `InFlight` | one Attempt (the **addressable Attempt**) is on the wire, or promoted this turn and not yet invoked: a first send or a re-send |
| `Held` | one sent Attempt's last ending was unknown, and it is not on the wire: a retained unknown |

`W` holds the **queued commits** behind the addressable Attempt (one name for one thing, OD16): none under `reject`;
at most one under `latest`; a FIFO of at most 64 under `serialize` (OPS O3). `Idle` never has `W`.

**When cells apply** (decided, OD16; R6 K13). A turn computes **after lanes** the way MD 2.5 computes after memory:
in step 5, after the selects, the turn's members are applied to each lane **in action order**, using the table.
**Promotion is immediate**: whenever a lane leaves `InFlight` or `Held` with `W` non-empty, `W`'s head becomes the
addressable Attempt, `InFlight` and not yet invoked. Step 6 publishes the after lanes, then invokes every Attempt
promoted or minted this turn. Guards read the pre-turn lanes with the turn's own ending admitted (MD rule 22);
effect-only reads (`keys`, `when`, activity inputs) and the published rows read the after lanes. Revision 7's
"`Idle + W` inside a turn" and "promote at step 6" are removed: there is no hidden state, and the three columns are
exact (R6: six states collapse to three).

**Flags, as functions of the state** (decided, OD10; R5 K10). Each is true in exactly one condition, with no "because":

| Flag | True when | Mark |
| --- | --- | --- |
| `pending` | `InFlight` | NEW MEANING against MD rule 21, which counted a waiting `latest` start as pending; a queued commit is now `waiting`, not `pending` |
| `uncertain` | `Held` | M4's word, for this lane; false during a re-send (`InFlight`), so a keyed schedule over `uncertain` re-arms on every unknown, because `keys` read the after lanes (5.3, R5 H2, R6 H2) |
| `waiting` | `W` is not empty | independent of the other two, so it does not flicker during a re-send |
| `outstanding` | the number of queued commits | `serialize` rows only, MD's existing word, kept (R6 L4): "17 queued" needs no memory |
| `retryCount` | the addressable Attempt's re-sends; 0 in `Idle` | kept across `Held` → `InFlight` and persisted (3.10) |

A view that wants "not confirmed" to stay on during a re-send reads `uncertain || retryCount > 0`.

**Transitions** for a lane under `reject`, `latest` or `serialize`, the three policies that hold. "Delivered" is a
mapped event in a later turn; "evidence" is never mapped; "→ promote" means `W`'s head becomes `InFlight` at once.

| Row | `Idle` | `InFlight` | `Held` |
| --- | --- | --- | --- |
| **`commit`** | mint an Attempt → `InFlight` (invoked after publish) | `reject`: ends `NotSent { Rejected }`, delivered, state unchanged; `latest`: becomes `W`, a previous `W` ends `Superseded` (evidence); `serialize`: appended to `W`, past 64 `NotSent { Overloaded }` | as `InFlight`: the hold refuses (`reject`) or queues (`latest`, `serialize`); nothing is sent |
| **`retry`** | nothing to address: evidence `NothingToResend` | the Attempt is on the wire: evidence `InFlight`, no re-send | re-send the addressable Attempt with its id and input (M4 rule 31), `retryCount + 1` → `InFlight` |
| **`cancel`** | nothing | invoked: interrupt it; **the lane stays `InFlight` until the interrupt's ending is admitted**, which is `unknown { Cancelled }` (→ `Held`), or the real ending if the request had already settled (R6 L1; MD rule 24, C11). Promoted and not yet invoked: it ends `NotSent { Cancelled }`, delivered (MD rule 24's before-invocation case) → promote | release the addressable Attempt (evidence `Released`) → promote, or `Idle` |
| **`idle`** (guard) | passes | denies `InFlight` | denies `Uncertain` |
| **`retryable({ times })`** (guard) | denies `NothingToResend` | denies `InFlight` | passes if `retryCount < times`, else denies `RetryLimit { retryCount }` |
| **success** | cannot occur | delivered → promote, or `Idle` | cannot occur (nothing on the wire) |
| **failure** | cannot occur | delivered → promote, or `Idle`; the failed Attempt is resolved, so a later `retry` is `NothingToResend` (R5 L5, amends MD rule 19: commit anew) | cannot occur |
| **unknown** (incl. `StillUnknown`) | cannot occur | delivered → `Held` | cannot occur |
| **interrupt** (adapter-reported, or after a `cancel`) | cannot occur | delivered as `unknown` → `Held` (OPS O3: after invocation, interruption reports unknown) | cannot occur |
| **restore** (Persistence O6) | stays `Idle` (`W` never exists there, so is never persisted there; R6 L2) | an Attempt whose send was acknowledged restores as `unknown { Restored }`, delivered → `Held`, `retryCount` kept; one never acknowledged ends `NotSent { Restored }`; each `W` entry ends `NotSent { Restored }`, delivered (MD C2) | stays `Held`, **not delivered again** (R5 L6); "acknowledged" is per Attempt, so a `Held` Attempt whose re-send was not acknowledged stays `Held`, never "never sent" (R6 L2); `W` as in `InFlight` |

That is 10 rows by 3 states, 30 cells; 8 are "cannot occur", which is itself a checkable claim (an ending only
exists for an Attempt on the wire; the interrupt cells stay unreachable because the lane stays `InFlight` until the
interrupt's ending is admitted). Every cell names one address, the addressable Attempt or the commit being made,
and one next state.

Documented default, not a rule (R6 L6): re-send an unknown on a timer (5.1's `UNSURE`, 5.3's reconcile), not in the
unknown's own handler; offline, `fetch` fails at once, so an immediate 3-send budget is spent in milliseconds and the
release follows. 8.2, 8.4 and 9.4 re-send at once for brevity.

**Key-less members in an ending** (decided, OD8; R5 K9; R6 M1, proposed): a key-less `retry`, `retryable` or
`cancel` in a handler of an event its operation alone maps names **that ending's own Attempt; once that Attempt is
resolved or released, it names the lane's addressable one**. So `[O.x.cancel, O.x.cancel]` in an unknown's handler
releases the ending's Attempt (→ promote) and then ends the promoted, not yet invoked commit with
`NotSent { Cancelled }`, exactly as `[O.x.cancel(named), O.x.cancel(named)]` would: the spelling no longer changes
the effect. In a `NotSent` ending there is no Attempt (MD rule 16), so a key-less member there does nothing (R6 L5).

**The two policies that do not hold** (proposed; R6 M3). Under `cancel` and `allow` an unknown is held only for its
own turn, so the table gains one state, named **`HeldThisTurn`** here (a table label, not an author word):

| Row | `Idle` | `InFlight` | `HeldThisTurn` (its own ending's turn only) |
| --- | --- | --- | --- |
| **`commit`** | mint → `InFlight` | `cancel`: interrupt the one on the wire (its ending is evidence only, R3 H3), mint → `InFlight`; `allow`: mint another, independent | mint → `InFlight`; the held one becomes evidence |
| **`retry`** | `NothingToResend` | evidence `InFlight` | re-send it, same id → `InFlight` |
| **`cancel`** | nothing | as the holding table | release it (`Released`) |
| **unknown** | cannot occur | delivered → `HeldThisTurn` | cannot occur |
| **turn end** | | | → `Idle`; the unknown is evidence (R5 L2) |

So `uncertain` is never true in a published snapshot under `cancel` and `allow`, and their rows are
`{ pending, retryCount, progress? }` (`cancel`) and `{ pending, outstanding }` (`allow`), with no `uncertain` or
`waiting` (R6 L4). Under `allow`, `retry` and `cancel` exist only key-less in an ending's own handler (MD N2 stands
elsewhere). A `retry(k)` from a later user event gives `NothingToResend`.

**Per concurrency policy** (proposed):

| Policy | Holds | `W` | Addressable Attempt | Notes |
| --- | --- | --- | --- | --- |
| `reject` | yes | none | the one sent Attempt | a commit while `InFlight` or `Held` ends `NotSent { Rejected }` |
| `latest` | yes | one queued commit | the one sent Attempt | the table as written |
| `serialize` | yes | queued commits, FIFO ≤ 64 | **the head** | amends MD N2 and C18: `retry`, `retryable` and `retryCount` exist on a `serialize` lane, for its head. The queued commits are not addressable: a per-item "cancel photo 9" from a user event cannot be written on one unkeyed lane, and `O.put.cancel` there names the head (R6 M4, Q35). "Drop the whole queue" has no member (`revisit.md`) |
| `cancel` | no | none | the one sent Attempt, for its own ending's turn | `HeldThisTurn` above |
| `allow` | no | none | in an ending's turn, that ending's Attempt (key-less, OD8) | `HeldThisTurn` above |

**One name per distinct thing** (decided, OD16; R6 K15):

- **Queued commits** of a lane are `W`; the row counts them in `outstanding` (`serialize`) or shows `waiting`. The
  head is the addressable Attempt; nothing else in `W` is addressable.
- **A record's mark and a lane's `uncertain`** are two things. `Issue.get(s, k).uncertain` is the store's mark on the
  record (M4); `O.like.get(s, k).uncertain` is this lane holding an unknown. Several lanes can write one record (a like
  and a rename of issue 1). Proposed amendment to merge 4 rule 32 (R6 M6): **a write's success clears the record's
  marks only of Attempts whose lanes are resolved or released**, so a rename's success no longer clears the mark of a
  like the actor is still re-sending.
- **"The user stopped it" and "the connection dropped"** are both `unknown`, with different tags: `Cancelled` is
  Flow's tag for an interrupt after `cancel`; a transport failure is the contract's own tag (`NoResponse`,
  `ServerError`). Proposed (R6 M5, Q36): `outcomes.unknown` may map per tag, as `failure` does, so a handler for
  "stopped" can release while one for "dropped" re-sends, and `UnresolvedHold` reads both from tokens. The pattern
  either way: where a user can stop a write, its "stopped" handler releases; re-sending what the user stopped could
  make a transfer the user cancelled.

**Merge 4.** A queued `latest` commit applies its prediction at commit and joins the record queue (rules 28, 29), so
the record shows it with `waiting: true`. `Superseded` and `NotSent { Cancelled | Rejected | Restored }` remove its
prediction without repair (rule 30). `Released` keeps the record's mark (rule 32, as amended above). Rule 30's
record-queue hold and the lane hold agree: neither sends past an unknown. A re-sent `serialize` head joins its record
queues again (rule 31) behind any other lane's queued write on the same record; the server dedups by id.

**Stories and tests.** A Story reaches the cells its machine's transitions allow: `commit`, `retry`, `cancel` by
sending the user events that hold them; endings with `Story.ending(O.x, "success" | "failure" | "unknown", key?)`;
interrupt as `Story.ending(O.x, "interrupt")`; restore with the Story's reload. `Story.ending` on a lane with nothing
on the wire is a Story error, which is the "cannot occur" cells. All 22 reachable cells per holding policy, and the
unacknowledged-restore cell (a crash between acknowledgement and invocation, which a between-turn reload cannot
produce), belong to **a policy suite in Flow's own tests**, not to an app's Stories (R6 L2). Three walks are Stories
with no other events between steps: 8.2's force save (R6 H1), 5.3's three re-sends offline (R6 H2), 8.2's
`CloseAnyway` during an outage (R6 H3).

**Amendments to MD and merge 4** (decided to be listed, OD16; R6 K16, M8). The table changes these rules; each is a
sentence an implementer would otherwise follow:

| Rule | Was | Now |
| --- | --- | --- |
| MD N2, C18 | `retry` only where a lane has one addressable Attempt; a type error under `serialize` | the `serialize` head is addressable (`retry`, `retryable`, `retryCount`) |
| MD rule 16 | a retry of an outstanding Attempt ends `NotSent { Rejected }`, delivered | evidence `InFlight`; nothing delivered |
| MD rule 17 | every start and every retry delivers exactly one ending | every commit and every **sent** retry; a declined retry (`InFlight`, `NothingToResend`) is evidence |
| MD rule 19 | `pay.retry` after a definite failure sends the same id | a failed Attempt is resolved; commit anew (R5 L5; revision 7 cited rule 21 by mistake) |
| MD rule 21 | a waiting `latest` start counts as `pending` | `pending` is `InFlight` only; queued work is `waiting` |
| MD rule 23 | keyed schedule keys are strings, evaluated in step 5 on after memory | key records, read on after memory and after lanes (3.12) |
| MD rule 24, C7 | `cancel` cancels every outstanding Attempt of the key | `cancel` acts on the addressable Attempt only (OD7); queued commits are sent after a release |
| MD C11 | an interrupted Attempt's unknown is delivered; the lane is pending until its turn | unchanged, and the unknown is now retained (`Held`) |
| MD 2.5 step 5 | effect-only reads on after memory | and on after lanes; the table's cells apply in action order (OD16) |
| MD line 818 | `NotSent.why` lists `NothingToResend` | `NothingToResend` is evidence of a declined retry, not a `NotSent` ending |
| M4 rule 29 | `.cancel(key)` follows rule 24 | follows the table's `cancel` row |
| M4 rule 31 | `retry` only under `reject`, `latest`, `cancel` | also on a `serialize` head |
| M4 rule 32 | a later write's success clears every mark on the record | only marks of Attempts whose lanes are resolved or released (proposed, R6 M6) |
| M4 rule 34 | a one-record domain write's key defaults to the record's key | no default; every write states `key` (OD15) |

Consequence worth stating: a user's "Retry" in `Idle` now gives no ending, so a UI must not wait for one (9.3's
`RetrySave`).

##### `UnresolvedHold` over the graph (decided, OD6 and OD10; spec proposed)

For a write operation X on `reject`, `latest` or `serialize`:

1. If X maps anything but not `unknown`, that is `UnresolvedHold` (error): the table reaches `Held` with no handler.
   This replaces revision 6's separate `UnmappedUnknown`. A bare X never holds (S10).
2. Otherwise let U be the event X maps `unknown` to. For each leaf where U can arrive (its owner by rule 14, and
   ancestors for late endings) and each branch of U's handler that keeps the hold (no `X.retry`, no `X.cancel`, or a
   `X.retry` behind `X.retryable` whose fallback branch keeps the hold), search the state graph from the branch's
   target by state tokens:
   - **pass under `reject` only** if no transition holding `X.commit` is reachable (5.1's `LEFT`; R5 M1 false
     positive). Under `latest` and `serialize` a queued commit may already be in `W` when the hold starts, so an
     owner is always required (decided, OD16: the check sees commits already waiting; R6 H3, K14);
   - **pass** if a non-ending transition holding `X.retry(k)` or `X.cancel(k)` is reachable **without passing a
     transition guarded by `X.idle`**, which the table says denies `Uncertain` while `Held` (R5 M1 false negative),
     and, **for every owner, not only U's branches**, an owner guarded by `X.retryable` counts only if the same event
     has a later alternative that reaches an owner (R6 M2);
   - else **error** if no such member exists in the definition, **warning** if one exists but is unreachable.
3. Closures are over-approximated (any closure guard may pass); Flow's own token guards are not: `X.idle` blocks,
   `X.retryable` blocks once its budget is spent. A `cancel(k)` on a keyed X counts for any key (the key is a
   closure), which is stated as inherent. Also inherent, stated (R6): a closure guard that reads
   `O.x.get(operations, k).uncertain` is `idle` written by hand and is not seen as blocking (false negative); an owner
   path through `X.idle(k)` for a different key is treated as blocked (rare false positive).

On 5.2 as revision 5 wrote it (no `cancel` in `CodeUnchecked`), revision 6's spec passed, because `Submit` →
VERIFYING was reachable; with rule 2's `idle` refinement, `Submit` is guarded by `O.verify.idle` and is blocked, so
the hold is an error, which is exactly review 4's H1 deadlock. On 5.1, `Leave` → `LEFT` now passes (no `pay` commit
is reachable from LEFT, and `pay` is `reject`, so nothing can be queued), where revision 6 warned. On 8.2 as
revision 7 wrote it, `CloseAnyway` during an outage left "ABC" queued behind a hold CLOSED could not end, and the
check passed; now it is an error, and 8.2's CLOSED releases (8.2, revision 8 walk).

What this replaces and removes: revision 3's `Superseded` for sent Attempts; "a newer commit releases a retained
unknown"; and, still, the `superseded` mapper flag, revision 2's `superseded:` key and every
`event.superseded || deny("Latest")` guard. The `Superseded` evidence kind stays, for never-sent commits.

**The late-landing race is gone** for any contract that sends `attempt.id` as an idempotency key: nothing newer is
sent while an older write is unknown, and the only re-send of it carries its own id, so the server answers what it
did, and a late copy of the first request is a no-op there (8.2 shows the steps). What is left is stated: a write the
machine **releases** with `cancel` may still land later, unseen; and a server that ignores idempotency keys cannot be
fenced by any client ordering. For those, a version precondition is an optional layer on top (see the limits below): the contract sends
`basedOn` as `If-Match` and maps `412` to a failure. It is a contract-level choice, not a replacement for the hold
(OD5).

**Limits, stated** (proposed, R4 K8, R5 K12). **The hold orders one lane, not the actor.**

- **Across operations and keys.** Two lanes are unordered, even in one actor. In review 5's wizard (9.6), PROFILE's
  save can be held while `submit`, another operation, is sent; the server then finalizes the old profile. The author
  must guard the dependent write on the other lanes. Today that is a closure over `O.save.get(operations, k)` per key;
  an aggregate `idle` over an operation's lanes is open as Q34.
- **Across actors.** Two tabs are two actors (Persistence O7): tab 1's "A" is held, tab 2 saves "X", and an hour later
  tab 1's retry applies "A" over "X" if the original never reached the server. Flow cannot order writers it does not
  see; cross-actor ordering is the server's (a version precondition) or a shared actor's. Open as Q31.
- **`basedOn` and `If-Match`** (proposed, R5 M2; answers Q32's direction). A waiting commit's input is fixed when it
  is committed (rule 22). Revision 6 proposed computing `basedOn` at send time, which makes `If-Match` pass against
  the very writers it should refuse (a tab 2 version that reached this store while "AB" waited, but the user never
  saw). Instead, **rebase across this lane's own writes only**: a waiting commit made on base b takes the version
  returned by the write it waited for, if that write's **committed** base was also b, **transitively** along the
  queue (R6 M7: under `serialize`, W2 behind a rebased W1 compares with W1's committed base); otherwise it keeps b,
  and a 412 is the right answer. A **released** predecessor returns no version, so the queued commit keeps b: if the
  released write did land, the user's newer edit is refused by their own write, which is stated, not hidden. The lane
  knows its own Attempts' bases and results, so no closure is read. **Scoped to domain writes** (proposed, R6 M7),
  where merge 4 already knows `basedOn` and the version: M4 rule 31's "same `basedOn`" for a retry is unchanged. A
  plain transaction declares neither a base field nor a version field, so it gets no rebase; it compares versions in
  its own commit function. Q32 stays open for the owner, with this as A.
- **Work over a dynamic set of keys in one turn** (R6 M9) cannot be written: an action list holds a fixed number of
  members, and `commit`, `retry` and `cancel` have no per-key form (archive selected threads, flush N held notes on
  reconnect, retry all unsure, cancel all uploads). The pattern is a bulk contract: one request over the set, one
  `serialize` lane (review 6's sketch 9, `archived: boolean` with Undo queued behind it). Per-key fan-out of write
  members goes to `revisit.md` with these four cases; no word now.
- **Independent work one at a time.** Under unkeyed `serialize`, one unknown holds every later write (photo 3 holds
  photos 4–20); `allow` neither throttles nor holds. A throttle of independent writes is a memory queue in the
  machine (commit the next file on `Uploaded`). Stated as a cut, for `revisit.md` (R4 M6).

**Prior art.** RxJS uses `concatMap` (queue, never drop sent work) rather than `switchMap` (cancel the previous) for
writes, because switching drops results the server already acted on. TanStack Query's mutation `scope` runs
mutations with the same scope id in order, one at a time. Replicache and Firestore keep an ordered queue of pending
writes per client and replay them in order until the server confirms each. Stripe's guidance for an unknown result is
to retry the same request with the same idempotency key until the outcome is known, never to send a new one. HTTP's
`If-Match` (RFC 9110 conditional requests) adds a version check on top, for servers that need to refuse stale writes
on their own.

#### 3.8.2 One-off reads: one lane, latest lookup delivered (decided, OD9: Q6)

A one-off read operation has one lane (3.3). A lookup releases the previous lookup of the same operation; the
released lookup's settlement is evidence `Superseded`, and only the latest lookup's result is delivered (R2 A-H2). A
search box needs no stale guard; clearing the box is `O.results.cancel`, with no key (R3 H4). This replaces MD
2.7.9's "each fetch is its own call with one ending" and OPS O2's "each finite lookup settles once" for lookups
through one operation: two lookups of one operation from two states deliver the latest, and a state waiting for a
read still receives it, because a current ending routes from the active leaf. Two independent reads that must both
arrive are two operations, or a `subscribe.each` placement.

Reads need no version rule: a lookup changes nothing on the server, and OPS O2's ordering already stops an older
request from overwriting newer data in the entry.

#### 3.8.3 Live reads and streams: no replacement rule (unchanged)

OPS O2 and O4 already say it: a placement that changes identity releases its session before opening another, and a
released session cannot publish later (M6 rule 44). Nothing new is needed.

### 3.9 Fragments: defer (decided, OD17, Q19: to their own exploration)

Traits and subroutines keep "no I/O" (MD rule 3); none of the cases needs fragment operations. For `revisit.md`.

### 3.10 Persistence

Per kind (OD3):

- **A write lane** is stored (decided, OD17, Q12) under **(contract id, key)**, with its Attempts, each with its `retryCount` (R2 C-M1). On
  restore it binds to the definition's operation on that contract, of which there is exactly one (3.6). The key is
  stored as its record and decoded with the input Schema's pick of the key fields (OD4; closes R3 M5). A restored
  unknown (OPS O3: "work with an acknowledged Attempt restores as unknown") holds its lane again (OD5), so a reload
  cannot send a newer write ahead of it; the flags are derived from the restored state, not stored. The table's
  restore row is the whole rule (OD10): an in-flight acknowledged Attempt is delivered as `unknown { Restored }`; a
  `Held` one stays held and is **not** delivered again, so 8.2's first `SaveUnsure` branch does not re-send after
  every reload (R5 L6). A persisted waiting commit was never
  sent, so restore does not replay it; it ends `NotSent { why: "Restored" }` (MD C2, R4 L1), and an autosave that
  should re-send it re-arms on that ending (8.2).
- **A live placement** re-opens from its params, and M6 rule 51 restores the data (OPS O4, Persistence O4).
- **A one-off read lane is not persisted.** OPS has no restore for finite lookups and the
  lane holds no workflow fact the server does not: on restore the row is `undefined` and nothing is delivered, so a
  state that was waiting for a lookup must look up again (5.1's `READING` does, on its next poll). **Decided (OD9,
  Q26).**
- A write lane whose contract no longer has an operation, or whose key no longer decodes under the contract's key
  Schema, goes to `orphaned` (P19). Changing a contract's key fields is therefore a persistence break, as changing
  an entity's `primaryKey` is.
- So renaming an operation (`pay` to `charge`) changes nothing persisted: R1's double charge cannot occur, with no
  alias. Revision 2's `.was`, the rebind ladder and `Rebound` are removed.

### 3.11 Views, `check()`, Stories, `flow check`, `flow explain`

- Stories: `ending` evidence names `operation`, `contract`, the verb (`commit`, `lookup`, `subscribe`) and `key`;
  `Superseded` is an evidence kind, for a never-sent `latest` commit or a released lookup; `Released` (proposed) for
  an unknown `cancel` released. Stories drive endings with `Story.ending` (proposed), so a Story can visit each of
  the write-lane table's 22 reachable cells per holding policy (3.8.1); a suite that does is the table's test. 8.2's
  race and 5.3's three re-sends are Stories by steps. M3 3.14 becomes "read `snapshot.operations` or `O.x.get`".
- `flow check`: errors `SharedContract`, `DuplicatePlacement`, `VerbMismatch` (3.2, proposed), `KeyRequired` (3.5,
  decided, OD8), `UnresolvedHold` (3.8.1, decided, OD6 and OD10, a check over the write-lane graph from tokens; a warning when only
  unreachable; it also covers a holding write that maps anything but `unknown`), a mapped event used as a schedule's
  `send`, a `raise` or a view's `send` (3.5, proposed); a `latest` or `cancel` write without a key at the operation (OD4: after the domain default; a type error
  first), a key field that is not a top-level input field; warning `UnusedOperation`; info: bare writes. Field-list
  keys are data, so `flow check` and Inspection print every lane's key without running code (R10). Rule 20's `NotSent`
  requirement is read per operation. `SharedCopyLane` is deleted. Because the verb at each use is a token, the
  one-off or live kind of every resource operation is read from the machine without reading a mapping or a closure.
- `flow explain`: `Toggle  READY → READY; commits like (Issues.setLike, latest, one lane per Issue key)`;
  `SearchDue  READY → READY; looks up results (Search.query, one lane)`; `READY subscribes issues (Issues.list)`.

### 3.12 Keyed schedules: re-arm per key (`restartOn` per key decided, OD17, Q13)

R2 A-M4: a per-document autosave needs a debounce per key. Proposed: on a keyed schedule (rule 23), **`restartOn` is
evaluated per key**, `({ key, memory }) => value`, and restarts that key's timer when its value changes; `armOn` on a
keyed schedule is a construction error (an event names no key). No new word.

Proposed (review 3's L1, follows from OD4): a keyed schedule's `keys` return key records, like a lane's key
(`({ docId: d.docId })`), and `key` in `restartOn` and `send` is that record, so `key` has one meaning in mappers,
lanes and schedules. `keys` may read `operations` as well as `memory`, so a reconcile schedule keys on the lanes that
hold an unknown (5.3: `operations.like.filter((l) => l.uncertain).map((l) => l.key)`), with no mirrored list in
memory (R3 M2). This changes MD rule 23's string keys.

### 3.13 Proposed rules

Status per rule: **decided (ODn)** or **proposed**. Revision 7 applies review 5's rule audit (17 → 14 author rules,
0.2): rules are merged where an author holds them as one thing, and the write lane's behaviour is no longer a set of
rules but one table (3.8.1, decided, OD10). The tag after each rule is its number in 0.2's count; untagged rules are
structure, not something an author must remember.

- **S0. A contract has `input`, `output` and its function** inline (`commit`, `lookup`, `subscribe`), on every
  kind; each schema a fields record or a full Schema; no `params`; no Rpc inside. *Decided (OD11–OD14).*
- **S1. An operation is declared once** under `operations: ({ E }) => ({ ... })`: a contract with `.outcomes(...)`, or
  bare. It holds no select, trigger, params, key or verb. *Decided (OD3).*
- **S2. Operations are used through `O`, with the contract's own verbs**: `commit(select)` for a write and
  `lookup(select)` for a one-off read, in `actions`; `subscribe(select)` and `subscribe.each(select)` for live work,
  in `activities`; `retry`, `cancel`, `refetch` in `actions`; `idle`, `retryable({ times })` and
  `retryable(k, { times })` in `guard`; `get(s, key?)` in views and callbacks. *Decided (OD1, OD2, OD9 for
  `subscribe.each`); `get` in callbacks proposed.*
- **S3. Lane identity, per kind** [1]: a write lane is (actor, operation, contract key of the input), created by
  work and removed when empty; a one-off read has one lane per operation; a live operation has one lane per
  placement, or per key under `subscribe.each`. The contract's `key`, a list of top-level input fields, names the
  server thing for every kind; its record has one meaning everywhere: mappers, lanes, rows and keyed schedules
  (merges revision 6's S14). No derived or nested keys. A lane's status changes only in the actor's turns. *Decided
  (OD4; OD9 for write lanes per key, Q2); one lane per one-off read and key records on schedules proposed.*
- **S4. Keys** [8]: every resource and transaction states `key`, a list of `input` fields; `[]` is one lane or entry;
  no default, domain writes included. *Decided (OD4, OD15); streams the same, proposed (OD15 leaves them open).*
- **S5. Replaced work is not delivered, per kind** [3]: for writes, only a never-sent commit is replaceable and a sent
  Attempt's ending is always delivered (*decided, OD5*); a one-off read operation delivers only its latest lookup
  (*decided, OD9*, Q6); live work has no replacement rule beyond OPS O4.
- **S6. One write operation per write contract** in a definition (`SharedContract`) [12]. *Decided (OD9, Q4).*
- **S7. The write lane is the table in 3.8.1** [5, 6]: states `Idle`, `InFlight`, `Held`, each with an optional
  waiting part; every member and ending per state; `reject`, `latest` and `serialize` hold, `cancel` and `allow` do
  not; `idle` passes only in `Idle` without a waiting commit; `cancel` acts on the same one Attempt as `retry` and
  never silently drops a waiting commit; cells apply in step 5 in action order, a queued commit is promoted at once,
  and `keys` and published rows read the after lanes; `cancel` and `allow` hold an unknown for its own turn only
  (`HeldThisTurn`). *Decided (OD5, OD6, OD7, OD10, OD16); the cells, the `serialize` head being addressable (amends
  MD N2) and `HeldThisTurn` proposed.*
- **S8. Key-less addressing** [7]: on an unkeyed operation, always its one lane; on a keyed operation, only in a
  handler of an event that operation alone maps, acting on that ending's own Attempt, then, once it is resolved, on
  the lane's addressable one; in a `NotSent` ending, nothing; anywhere else `KeyRequired`. *Decided (OD8); the
  ending's-Attempt-then-lane reading proposed (R5 K9, R6 M1).*
- **S9. Persistence**: write lanes persist by (contract id, key) with each Attempt's `retryCount`, and restore per
  the table's last row; **one-off read lanes are not persisted** [11]. *Decided (OD9, Q26; OD17, Q12).*
- **S10. One active placement** per live operation, unless state tokens make placements exclusive. *Decided (OD17,
  Q14).*
- **S11. A bare write never holds** [10]: its results are evidence only and its unknown is not retained. *Decided
  (OD9, Q7) for evidence; "never holds" proposed.*
- **S12. The verb agrees with the mapping** [4]: `VerbMismatch` otherwise; one operation uses one verb. *Decided
  (OD9, Q23).*
- **S13. Rows per kind** [2]: a write row `{ pending, uncertain, waiting, retryCount, progress? }`, each flag a
  function of the lane's state (`pending` NEW MEANING against MD rule 21), idle through `get` when the key has no
  lane; a resource row is OPS O6's lane for either verb (*decided, OD9*, Q21), held until the next lookup or
  `cancel`, with the `key` of its entry (proposed); a stream row is M6's lane. `cancel` on a one-off read releases its
  lookup (*decided, OD9*, Q23; amends OPS O7). *Flags decided (OD5, OD6, OD10).*
- **S14. Every hold has an owner** [13]: `UnresolvedHold`, a check over the write lane's graph from tokens (3.8.1),
  including a holding write that maps anything but `unknown`; it sees commits already queued, so the terminal pass
  applies only under `reject`. *Decided (OD6, OD10, OD16); the spec proposed.*
- **S15. Mapped events come only from endings** [14]: never a schedule's `send`, a `raise` or a view's `send`;
  `outcomes` map only `internalEvents`; Stories use `Story.ending`. *Proposed (R5 L3).*
- **S16. `restartOn` per key**, `armOn` banned, on keyed schedules [9]. *Decided (OD17, Q13).*

Revision 8: S4 loses its default and its conditions (OD15); the rule count stays 14.

Cut in revision 7 (R5 audit): `UnmappedUnknown` (folded into S14), `SharedEnding` (R5 L4), the `cancel`-concurrency
exception (that policy no longer holds), `idle`'s denials as a separate rule (in S7), key records on schedules and S4
at the operation as separate rules (in S3, S4).

## 4. Typing note (no spike)

- **The `operations` callback needs `E` first.** `events` and `internalEvents` are plain literals; nothing in
  `operations` reads `memory`. Fallback: `definition({ ... }).operations(fn)`.
- **`commit(select)` and `lookup(select)`** are contextually typed by the transition's `Action<Ev>` element type; one
  built outside a transition reads memory only or is wrapped in `Definition.handler(path, h)`.
- **Keyed or not, from the contract** (writes): the key's field list, a tuple of literal field names checked against
  the input's keys (`ReadonlyArray<keyof I>`), decides whether members take a selector and whether the row is plain
  or a keyed list; `[]` is unkeyed. The key record is `Pick<I, K[number]>`; members and `get` accept any
  `{ readonly [F in K[number]]: I[F] }`, so passing an item is a plain structural check (OD4). A one-off read's row is
  never keyed (3.3). `key` is required (OD15) and typed as a tuple of `input`'s field names; `latest` and `cancel` without a
  key are type errors at the operation, where the domain is known.
- **Key-less members in an ending's handler** need the handler's event to be known as that operation's ending: the
  definition's `outcomes` record which events each operation maps, so `O.move.retry` without a key type-checks only
  in handlers of events that operation alone maps (`KeyRequired` otherwise, OD8). Risk: the handler type must carry its event's
  origin; if TypeScript cannot narrow it in shared handler consts, `flow check` is the fallback.
- **The handle per kind, the verb at the use** (OD2, OD3): a transaction operation's handle has `commit` and the
  write members; a stream's has `subscribe` and `subscribe.each`; a resource's has `lookup`, `subscribe`,
  `subscribe.each`, `refetch`, `idle`, `cancel`. S11 narrows a resource handle by its mapping: mapping `success` drops
  `subscribe`, mapping `value` drops `lookup`, so a mismatch is a type error. "One operation, one verb" for a bare or
  failure-only resource is not typed (it spans transitions); `flow check` reports it from the tokens.
- **Rows typed from the definition alone**: possible because a resource row is OPS O6's lane for either verb (S12);
  were one-off rows `{ pending }`, as in revision 3, a bare resource's row type would depend on the machine's verb,
  which the definition cannot see (the rejected alternative to Q21, decided as OD9).
- **`get(s, key?)`** is typed by the contract's key fields for writes (returns the row) and by the `each` key for live
  placements (returns `Lane | undefined`); a one-off read and an unkeyed placement take no key.
- **Watch**: no excess-property check on returned literals (TS (j)); errors collapse onto callback heads (TS shape 2).

## 5. Porting: the cases in full

Each case shows the contracts, the definition, the machine and the view, before and after. The sign-in's fragments
(`Field`, `Countdown`, `Lockout`) do no I/O and are untouched: MD:1361-1457 as written. Before blocks are verbatim and
keep their old file names.

### 5.1 Checkout with 3-D Secure (also R1's fifth app)

**Contracts.** The adapter and the contracts are unchanged except the file name and `key`, which the transactions
keep or drop by need: `confirm` and `handleNextAction` are `reject` with one intent per actor, so they need no key.

```ts
// stripe-api.ts: the adapter. Production wraps fetch to api.stripe.com; Stories provide FakeStripe.
import { Context, Effect, Schema } from "effect"

export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}

export interface StripeResponse {
  readonly ok: boolean
  readonly status: number
  readonly intent: { readonly status: IntentStatusType; readonly chargeId?: string }
  readonly declineCode?: string
  readonly retryAfterMs?: number
  readonly code?: string
}
export type IntentStatusType = "requires_payment_method" | "requires_action" | "processing" | "succeeded" | "canceled"

export class StripeApi extends Context.Service<StripeApi, {
  confirm(input: { intentId: string; paymentMethodId: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<StripeResponse, NoResponse>
  handleNextAction(input: { intentId: string }, o: { signal: AbortSignal }): Effect.Effect<StripeResponse, NoResponse>   // stripe.js handleNextAction: opens the bank's page
  retrieve(input: { intentId: string }, o: { signal: AbortSignal }): Effect.Effect<StripeResponse, NoResponse>
}>()("shop/StripeApi") {}
```

```ts
// checkout.contracts.ts                                                      RENAMED file (was checkout.operations.ts)
import { Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"
import { StripeApi, type StripeResponse } from "./stripe-api"

export const IntentStatus = Schema.Literals(["requires_payment_method", "requires_action", "processing", "succeeded", "canceled"])
const Intent = Schema.Struct({ status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) })

export class CardDeclined extends Schema.TaggedError<CardDeclined>()("CardDeclined", { declineCode: Schema.String }) {}
export class Busy extends Schema.TaggedError<Busy>()("Busy", { retryAfterMs: Schema.optional(Schema.Number) }) {}
export class TooManyAttempts extends Schema.TaggedError<TooManyAttempts>()("TooManyAttempts", {}) {}
export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", { code: Schema.String }) {}
export class AuthFailed extends Schema.TaggedError<AuthFailed>()("AuthFailed", {}) {}
export class ChallengeDismissed extends Schema.TaggedError<ChallengeDismissed>()("ChallengeDismissed", {}) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class ReadFailed extends Schema.TaggedError<ReadFailed>()("ReadFailed", { status: Schema.Number }) {}

const toIntent = (res: StripeResponse) => ({ status: res.intent.status, chargeId: res.intent.chargeId })

export const Stripe = {
  confirm: transaction({
    id: "Stripe.confirm",
    input: Schema.Struct({ intentId: Schema.String, paymentMethodId: Schema.String }),
    output: Intent,                                      // RENAMED (OD12): result → output
    key: [],                                             // NEW (OD15): key required; [] = one lane, one intent per checkout actor (3.3)
    concurrency: "reject",
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const api = yield* StripeApi
      const res = yield* api.confirm(input, { idempotencyKey: attempt.id, signal }).pipe(
        Effect.retry({ while: (e) => e._tag === "NoResponse", times: 1 }),
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.ok) return yield* Outcome.success(toIntent(res))
      if (res.status === 402) return yield* Outcome.failure(new CardDeclined({ declineCode: res.declineCode ?? "generic_decline" }))
      if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
      if (res.status === 409) return yield* Outcome.failure(new TooManyAttempts({}))
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Rejected({ code: res.code ?? "unknown" }))
    }),
  }),
  handleNextAction: transaction({
    id: "Stripe.handleNextAction",
    input: Schema.Struct({ intentId: Schema.String }),
    output: Intent,
    key: [],
    concurrency: "reject",
    commit: (input, { signal }) => Effect.gen(function* () {
      const api = yield* StripeApi
      const res = yield* api.handleNextAction(input, { signal }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.ok) return yield* Outcome.success(toIntent(res))
      if (res.status === 401) return yield* Outcome.failure(new AuthFailed({}))
      if (res.status === 499) return yield* Outcome.failure(new ChallengeDismissed({}))
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Rejected({ code: res.code ?? "unknown" }))
    }),
  }),
  intent: resource({
    id: "Stripe.intent",
    input: { intentId: Schema.String },                  // NEW (OD12, OD14): every kind has input; a fields record is wrapped as Schema.Struct
    output: Intent,                                      // RENAMED (OD12): result → output
    key: ["intentId"],                                   // NEW MEANING (OD4): key is a field list of input
    staleTime: "0 millis",                               // a reconcile read: always ask
    gcTime: "1 minute",
    lookup: (input, { signal }) => Effect.gen(function* () {
      const api = yield* StripeApi
      const res = yield* api.retrieve(input, { signal }).pipe(Effect.mapError(() => new ReadFailed({ status: 0 })))
      if (!res.ok) return yield* new ReadFailed({ status: res.status })
      return toIntent(res)
    }),
  }),
}
```

**Before** (merge 2's rewrite, brought to the design's current reads: `s.calls` rows, D18, `pay.idle(key)`):

```ts
// checkout.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { IntentStatus, Stripe } from "./checkout.operations"

const Done = { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) }

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CARD", "PAYING", "WAITING", "CHALLENGING", "READING", "UNSURE", "STUCK", "DONE", "LEFT"],
  events: { Pay: { paymentMethodId: Schema.String }, EditCart: { amountCents: Schema.Int }, CheckNow: {}, Leave: {} },
  internalEvents: {
    Intent: Done,
    Declined: { code: Schema.String, paymentMethodId: Schema.String },
    Busy: { retryAfterMs: Schema.optional(Schema.Number) },
    TooManyAttempts: {}, Refused: {}, TryLater: {},
    AuthFailed: {}, Dismissed: {}, ReadFailed: {},
    Unsure: Flow.uncertain({}), ChallengeUnsure: Flow.uncertain({}),
    Slow: {}, TookTooLong: {}, RetryNow: {}, ChallengeTimedOut: {}, CheckTick: {}, PollTick: { n: Schema.Int },
  },
  memory: {
    intentId: Flow.input(Schema.String),
    amountCents: Flow.input(Schema.Int),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    slow: Flow.initial(Schema.Boolean, false),
    declines: Flow.initial(Schema.Int, 0),
    blockedPaymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    retryInMs: Flow.initial(Schema.Int, 0),
    busyTries: Flow.initial(Schema.Int, 0),
    chargeId: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Stripe },
})

// checkout.machine.ts
import { deny, machine } from "flow-state"
import { Duration, Schedule } from "effect"
import { Checkout } from "./checkout.definition"

const MAX_DECLINES = 5
const MAX_CHECKS = 6
const MAX_POLLS = 10
const RETRYABLE_CODES = new Set(["try_again_later", "processing_error"])
const MESSAGES: Record<string, string> = { insufficient_funds: "Insufficient funds", expired_card: "Card expired" }
const declineMessage = (code: string) => `Your card was declined (${MESSAGES[code] ?? "declined"})`

export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {
  const key = ({ memory }) => ({ intentId: memory.intentId })
  const lane = (calls, intentId: string) => calls.Stripe.confirm.find((l) => l.key.intentId === intentId)
  const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
  const pay = O.Stripe.confirm.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), {
    outcomes: {
      success: intent,
      failure: {
        CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })),
        Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
        TooManyAttempts: E.TooManyAttempts,
        Rejected: E.Refused,
        NotSent: E.TryLater,
      },
      unknown: E.Unsure,
    },
  })
  const challenge = O.Stripe.handleNextAction.commit(key, {
    outcomes: {
      success: intent,
      failure: { AuthFailed: E.AuthFailed, ChallengeDismissed: E.Dismissed, Rejected: E.Refused, NotSent: E.TryLater },
      unknown: E.ChallengeUnsure,
    },
  })
  const read = O.Stripe.intent.lookup(key, { outcomes: { success: intent, failure: E.ReadFailed } })

  const toCard = (error: string) => ({ target: S.CARD, updateMemory: () => ({ error }) })
  const toRead = { target: S.READING, actions: [read.fetch(key)] }
  const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded"), updateMemory: ({ event }) => ({ chargeId: event.chargeId ?? null }) }
  const checkAgain = [
    { target: S.STUCK, guard: ({ calls, memory }) => (lane(calls, memory.intentId)?.retryCount ?? 0) >= MAX_CHECKS || deny("ChecksLeft") },
    { target: S.PAYING, updateMemory: () => ({ slow: false, error: null }), actions: [pay.retry(key)] },
    { target: "self" },
  ]

  return {
    default: S.CARD,
    on: {
      Leave: {
        target: S.LEFT,
        guard: [
          ({ state }) => !(S.DONE.is(state) || S.LEFT.is(state)) || deny("NothingToLeave"),
          ({ state }) => !S.UNSURE.is(state) || deny("StillChecking"),
        ],
      },
      Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
      Unsure: { target: "self", actions: [read.fetch(key)] },
      ChallengeUnsure: { target: "self", actions: [read.fetch(key)] },
      Declined: { target: "self" }, Busy: { target: "self" }, TooManyAttempts: { target: "self" }, Refused: { target: "self" }, TryLater: { target: "self" },
      AuthFailed: { target: "self" }, Dismissed: { target: "self" }, ReadFailed: { target: "self" },
    },
    states: {
      CARD: {
        on: {
          EditCart: { target: "self", updateMemory: ({ event }) => ({ amountCents: event.amountCents }) },
          Pay: {
            target: S.PAYING,
            guard: [
              ({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"),
              ({ memory, event }) => event.paymentMethodId !== memory.blockedPaymentMethodId || deny("SameCardDeclined"),
              pay.idle(key),
            ],
            updateMemory: () => ({ error: null, slow: false, busyTries: 0 }),
            actions: [pay],
          },
        },
      },
      PAYING: {
        schedules: { slow: { schedule: "10 seconds", send: E.Slow }, giveUp: { schedule: "60 seconds", send: E.TookTooLong } },
        on: {
          Slow: { target: "self", updateMemory: () => ({ slow: true }) },
          TookTooLong: { target: "self", actions: [pay.cancel(key)] },
          Intent: [paid, { target: S.CHALLENGING, guard: ({ event }) => event.status === "requires_action" || deny("NoActionNeeded"), actions: [challenge] }, toRead],
          Declined: {
            target: S.CARD,
            updateMemory: ({ event, memory }) => ({
              error: declineMessage(event.code),
              blockedPaymentMethodId: RETRYABLE_CODES.has(event.code) ? null : event.paymentMethodId,
              declines: memory.declines + 1,
            }),
          },
          Busy: [
            { target: S.WAITING, guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
            toCard("Stripe is busy. Try again shortly."),
          ],
          TooManyAttempts: toCard("Too many attempts. Wait a moment and try again."),
          Refused: toCard("We couldn't process this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          Unsure: S.UNSURE,
        },
      },
      WAITING: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
        on: { RetryNow: [{ target: S.PAYING, guard: [pay.idle(key)], actions: [pay] }, { target: "self" }] },
      },
      CHALLENGING: {
        schedules: { expire: { schedule: "5 minutes", send: E.ChallengeTimedOut } },
        on: {
          ChallengeTimedOut: { target: "self", actions: [challenge.cancel(key)] },
          Intent: [paid, toRead],
          AuthFailed: toCard("Authentication failed. Use another payment method."),
          Dismissed: toCard("Verification was cancelled. Try again or use another card."),
          Refused: toCard("We couldn't verify this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          ChallengeUnsure: toRead,
        },
      },
      READING: {
        schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
        on: {
          PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [read.fetch(key)] }],
          Intent: [
            paid,
            { ...toCard("The payment did not go through. Try again."), guard: ({ event }) => ["requires_payment_method", "requires_action", "canceled"].includes(event.status) || deny("StillProcessing") },
            { target: "self" },
          ],
          ReadFailed: { target: "self" },
        },
      },
      UNSURE: {
        schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
        on: { CheckTick: checkAgain, CheckNow: checkAgain },
      },
      STUCK: { on: { CheckNow: toRead } },
      DONE: {},
      LEFT: {},
    },
  }
})

// view
const paying = useView(checkout, (s) => s.calls.Stripe.confirm.find((l) => l.key.intentId === intentId)?.pending ?? false)
```

**After:**

```ts
// checkout.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { IntentStatus, Stripe } from "./checkout.contracts"                     // RENAMED file: *.contracts.ts

const Done = { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) }

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CARD", "PAYING", "WAITING", "CHALLENGING", "READING", "UNSURE", "STUCK", "DONE", "LEFT"],
  events: { Pay: { paymentMethodId: Schema.String }, EditCart: { amountCents: Schema.Int }, CheckNow: {}, Leave: {} },
  internalEvents: {
    Intent: Done,
    Declined: { code: Schema.String, paymentMethodId: Schema.String },
    Busy: { retryAfterMs: Schema.optional(Schema.Number) },
    TooManyAttempts: {}, Refused: {}, TryLater: {},
    AuthFailed: {}, Dismissed: {}, ReadFailed: {},
    Unsure: Flow.uncertain({}), ChallengeUnsure: Flow.uncertain({}),
    Slow: {}, TookTooLong: {}, RetryNow: {}, ChallengeTimedOut: {}, CheckTick: {}, PollTick: { n: Schema.Int },
  },
  memory: {
    intentId: Flow.input(Schema.String),
    amountCents: Flow.input(Schema.Int),
    paymentMethodId: Flow.initial(Schema.String, ""),                           // user-defined, NEW field: RetryNow's start reads it
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    slow: Flow.initial(Schema.Boolean, false),
    declines: Flow.initial(Schema.Int, 0),
    blockedPaymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    retryInMs: Flow.initial(Schema.Int, 0),
    busyTries: Flow.initial(Schema.Int, 0),
    chargeId: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => {                                                      // existing keyword, NEW MEANING: named operations
    const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
    return {
      pay: Stripe.confirm.outcomes({                                            // user-defined: pay; existing word outcomes, now a method
        success: intent,
        failure: {
          CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })),
          Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
          TooManyAttempts: E.TooManyAttempts,
          Rejected: E.Refused,
          NotSent: E.TryLater,
        },
        unknown: E.Unsure,
      }),
      challenge: Stripe.handleNextAction.outcomes({
        success: intent,
        failure: { AuthFailed: E.AuthFailed, ChallengeDismissed: E.Dismissed, Rejected: E.Refused, NotSent: E.TryLater },
        unknown: E.ChallengeUnsure,
      }),
      read: Stripe.intent.outcomes({ success: intent, failure: E.ReadFailed }),   // maps success: the machine looks it up (S11); only its latest lookup is delivered
    }
  },
})
```

```ts
// checkout.machine.ts
import { deny, machine } from "flow-state"
import { Duration, Schedule } from "effect"
import { Checkout } from "./checkout.definition"

const MAX_DECLINES = 5
const MAX_CHECKS = 6
const MAX_POLLS = 10
const RETRYABLE_CODES = new Set(["try_again_later", "processing_error"])
const MESSAGES: Record<string, string> = { insufficient_funds: "Insufficient funds", expired_card: "Card expired" }
const declineMessage = (code: string) => `Your card was declined (${MESSAGES[code] ?? "declined"})`

export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {              // O: NEW MEANING, this definition's operations
  const thisIntent = ({ memory }) => ({ intentId: memory.intentId })            // user-defined: an input select
  const toCard = (error: string) => ({ target: S.CARD, updateMemory: () => ({ error }) })
  const toRead = { target: S.READING, actions: [O.read.lookup(thisIntent)] }    // existing: lookup (OPS O2), a one-off read
  const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded"), updateMemory: ({ event }) => ({ chargeId: event.chargeId ?? null }) }
  const checkAgain = [
    { target: S.PAYING, guard: [O.pay.retryable({ times: MAX_CHECKS })], updateMemory: () => ({ slow: false, error: null }), actions: [O.pay.retry] },   // NEW: retryable({ times }) (OD1)
    { target: S.STUCK },
  ]
  const answered = [O.pay.cancel, O.challenge.cancel]                           // existing: cancel; releases an unknown the read has answered, so the lanes stop holding (OD5)

  return {
    default: S.CARD,
    on: {
      Leave: {
        target: S.LEFT,
        guard: [
          ({ state }) => !(S.DONE.is(state) || S.LEFT.is(state)) || deny("NothingToLeave"),
          ({ state }) => !S.UNSURE.is(state) || deny("StillChecking"),
        ],
      },
      Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
      Unsure: { target: "self", actions: [O.read.lookup(thisIntent)] },          // existing: lookup; one lane per operation (3.3)
      ChallengeUnsure: { target: "self", actions: [O.read.lookup(thisIntent)] },
      Declined: { target: "self" }, Busy: { target: "self" }, TooManyAttempts: { target: "self" }, Refused: { target: "self" }, TryLater: { target: "self" },
      AuthFailed: { target: "self" }, Dismissed: { target: "self" }, ReadFailed: { target: "self" },
    },
    states: {
      CARD: {
        on: {
          EditCart: { target: "self", updateMemory: ({ event }) => ({ amountCents: event.amountCents }) },
          Pay: {
            target: S.PAYING,
            guard: [
              ({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"),
              ({ memory, event }) => event.paymentMethodId !== memory.blockedPaymentMethodId || deny("SameCardDeclined"),
              O.pay.idle,                                                        // existing: idle; unkeyed, no selector
            ],
            updateMemory: ({ event }) => ({ error: null, slow: false, busyTries: 0, paymentMethodId: event.paymentMethodId }),
            actions: [O.pay.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))],
          },
        },
      },
      PAYING: {
        schedules: { slow: { schedule: "10 seconds", send: E.Slow }, giveUp: { schedule: "60 seconds", send: E.TookTooLong } },
        on: {
          Slow: { target: "self", updateMemory: () => ({ slow: true }) },
          TookTooLong: { target: "self", actions: [O.pay.cancel] },
          Intent: [paid, { target: S.CHALLENGING, guard: ({ event }) => event.status === "requires_action" || deny("NoActionNeeded"), actions: [O.challenge.commit(thisIntent)] }, toRead],
          Declined: {
            target: S.CARD,
            updateMemory: ({ event, memory }) => ({
              error: declineMessage(event.code),
              blockedPaymentMethodId: RETRYABLE_CODES.has(event.code) ? null : event.paymentMethodId,
              declines: memory.declines + 1,
            }),
          },
          Busy: [
            { target: S.WAITING, guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
            toCard("Stripe is busy. Try again shortly."),
          ],
          TooManyAttempts: toCard("Too many attempts. Wait a moment and try again."),
          Refused: toCard("We couldn't process this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          Unsure: S.UNSURE,
        },
      },
      WAITING: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
        on: {
          RetryNow: [
            { target: S.PAYING, guard: [O.pay.idle], actions: [O.pay.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }))] },
            { target: "self" },
          ],
        },
      },
      CHALLENGING: {
        schedules: { expire: { schedule: "5 minutes", send: E.ChallengeTimedOut } },
        on: {
          ChallengeTimedOut: { target: "self", actions: [O.challenge.cancel] },
          Intent: [paid, toRead],
          AuthFailed: toCard("Authentication failed. Use another payment method."),
          Dismissed: toCard("Verification was cancelled. Try again or use another card."),
          Refused: toCard("We couldn't verify this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          ChallengeUnsure: toRead,
        },
      },
      READING: {
        schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
        on: {
          PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [O.read.lookup(thisIntent)] }],   // a slow poll is released by the next: only the latest answer arrives (3.8.2)
          Intent: [
            { ...paid, actions: answered },
            { ...toCard("The payment did not go through. Try again."), guard: ({ event }) => ["requires_payment_method", "requires_action", "canceled"].includes(event.status) || deny("StillProcessing"), actions: answered },   // without the release, the next Pay is denied (OD5)
            { target: "self" },
          ],
          ReadFailed: { target: "self" },
        },
      },
      UNSURE: {
        schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },
        on: { CheckTick: checkAgain, CheckNow: checkAgain },
      },
      STUCK: { on: { CheckNow: toRead } },
      DONE: {},
      LEFT: {},
    },
  }
})
```

```tsx
// PayButton.tsx
const paying = useView(checkout, (s) => s.operations.pay.pending)                // unkeyed: plain row
const checks = useView(checkout, (s) => s.operations.pay.retryCount)              // survives reload (3.10)
const unsure = useView(checkout, (s) => s.operations.pay.uncertain)               // NEW (OD5): true while the lane holds an unknown
const canCheck = useView(checkout, (s) => check(s, E.CheckNow())._tag === "Allowed")   // RetryLimit at the budget
```

**Added:** three operations, `.outcomes` as a method, `retryable({ times })`, memory `paymentMethodId`. **Kept:**
`commit` and `lookup`, now on the operation (`O.pay.commit`, `O.read.lookup`) instead of the module path, with no
`outcomes` option. **Dropped:** `O.Stripe.*` paths, the `outcomes` options, `read.fetch(key)`, the `key` and `lane`
helpers, the `find` and `?? 0` reads, the transactions' `key`s (not needed: one intent per actor). Lines: definition
+22, machine -22.

**Revision 5 (OD5).** A retained unknown now holds `pay`'s `reject` lane, so no path from `UNSURE` back to `CARD` can
send a second charge (R3 M1). `Pay`'s `O.pay.idle` denies `Uncertain` (proposed, 3.5), and a commit without that
guard would end `NotSent { why: "Rejected" }`, until the unknown is resolved or released. `READING` answers the
question by a read, not by `retry`, so its `Intent` branches release both lanes with `cancel` (`answered`). That one
line is what a reconcile-by-read machine pays for the hold.

**Revision 6 (R4 H4, OD8).** `pay` and `challenge` are unkeyed, so `O.pay.cancel` and `O.challenge.cancel` name
their one lane in any handler, including READING's `Intent`, which is `read`'s ending. Walk: `pay` ends unknown →
UNSURE checks 6 times → STUCK → `CheckNow` → READING → the read answers `requires_payment_method` → `answered`
releases `pay`'s unknown (OD7) and does nothing on `challenge` (nothing to address) → CARD → `Pay`'s `idle` passes.
Revision 6 reported `SharedEnding` (info) here, on the intended use; revision 7 cuts that code (R5 L4). `UnresolvedHold` passes: STUCK → READING reaches `answered` by tokens.

### 5.2 Two-factor sign-in (writes owned by states, late endings, one verify per challenge)

**Before** (MD 3.1, verbatim):

```ts
// signin.definition.ts
import { definition, deny, Flow } from "flow-state";
import { Schema } from "effect";
// verifyCode and resendCode: keyed by challengeId, concurrency "reject". The commits classify
// WrongCode, Expired and Throttled as failures, with Outcome, where they read the response.
import { Auth } from "./auth.operations";
import { Countdown, Field, Lockout } from "./fragments";

export const LIMIT = 3;

const sixDigits = (v: string) => /^\d{6}$/.test(v) || deny("CodeFormat", { length: 6 });

export const SignIn = definition({
  id: "Auth/SignIn",
  states: [
    "PASSWORD",
    {
      TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"], {
        traits: {
          // Fresh on every entry to TWO_FACTOR: Back drops the typed code.
          code: Field(Schema.String, { validate: sixDigits }),
          // Resumable: Back and return do not reset the 30 seconds; an overdue cooldown ends on return.
          resendCooldown: Countdown({ length: "30 seconds" }).resumable(),
        },
      }),
    },
    "SIGNED_IN",
  ],
  events: {
    PasswordAccepted: { challengeId: Schema.String }, // the password step's stub
    Submit: {},
    Resend: {},
    BackToPassword: {},
  },
  internalEvents: {
    CodeAccepted: {},
    CodeWrong: { challengeId: Schema.String },     // the call's own challenge, from its input
    CodeExpired: {},
    CodeUnchecked: Flow.uncertain({}),             // the only kind of event `unknown:` may target
    ResendSent: {},
    ResendRefused: {},
    ResendUnsure: Flow.uncertain({}),
    StopWaiting: {},                               // VERIFYING's soft timeout
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    struck: Flow.private(Flow.initial(Schema.Array(Schema.String), [])), // challenges with a strike
  },
  traits: {
    // One per struck challenge, at the root: strikes and lockouts survive Back (rule 9).
    challenges: Lockout({ limit: LIMIT, length: "5 minutes" }).each({ of: "struck", max: 20 }),
  },
  operations: { Auth },
});
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state";
import { LIMIT, SignIn } from "./signin.definition";

type Memory = typeof SignIn.Memory.Type;
const strikesOf = (memory: Memory, key: string) => memory.challenges.find((c) => c.key === key)?.strikes ?? 0;

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const strike = E.challenges.Strike.from(({ event }) => ({ key: event.challengeId }));
  const isCurrent = ({ key, memory }) => key === memory.challengeId || deny("OtherChallenge");
  // A challenge gets its Lockout copy at its first strike, and loses it when it unlocks.
  const union = (ids: ReadonlyArray<string>, id: string) => (ids.includes(id) ? ids : [...ids, id]);
  const forget = ({ memory, key }) => ({ struck: memory.struck.filter((id) => id !== key) });
  const challenge = ({ memory }) => ({ challengeId: memory.challengeId }); // the lane: one per challenge

  // Owned by VERIFYING, the state Submit enters (rule 14). If VERIFYING was left (Back, or the soft
  // timeout) when an ending's turn is admitted, the same event routes from TWO_FACTOR, or the root.
  const verify = O.Auth.verifyCode.commit(
    ({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }),
    {
      outcomes: {
        success: E.CodeAccepted,
        failure: {
          WrongCode: E.CodeWrong.from((_, { input }) => ({ challengeId: input.challengeId })),
          Expired: E.CodeExpired,
          NotSent: E.CodeUnchecked,                // `reject` (rule 20)
        },
        unknown: E.CodeUnchecked,                  // StillUnknown arrives here too (rule 18)
      },
    },
  );
  // Owned by TWO_FACTOR ("self" on its handler): moving ENTERING → LOCKED_OUT does not make it late.
  const resend = O.Auth.resendCode.commit(({ memory }) => ({ challengeId: memory.challengeId }), {
    outcomes: {
      success: E.ResendSent,
      failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused },
      unknown: E.ResendUnsure,                     // the code may be on its way
    },
  });

  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) });

  return {
    default: S.PASSWORD,

    traits: {
      challenges: {
        // Root-trait callbacks may move the host anywhere (rule 6).
        callbacks: {
          // A late third strike while this challenge's code is being entered: lock now.
          onLocked: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: [S.TWO_FACTOR.ENTERING, isCurrent],
              updateMemory: () => ({ error: null }),
              raise: [E.code.Reset],
            },
            { target: "self" },
          ],
          // Unlocked with zero strikes: the copy is no longer needed, so forget its key.
          onUnlocked: [
            { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, isCurrent], updateMemory: (g) => ({ ...forget(g), error: null }) },
            { target: "self", updateMemory: forget },
          ],
        },
      },
    },

    // Late endings (rule 14): every one that can occur is handled here (rule 20).
    on: {
      CodeWrong: [
        {
          // Strikes its own challenge, current or not, re-adding its key first. The strike reaches the
          // copy this turn creates (rule 9).
          target: "self",
          guard: ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
          updateMemory: ({ memory, event }) => ({ struck: union(memory.struck, event.challengeId) }),
          raise: [strike],
        },
        { target: "self" },                        // signed in: nothing re-adds a copy
      ],
      CodeAccepted: { target: "self" },            // the user was already told "couldn't check"
      CodeExpired: { target: "self" },
      CodeUnchecked: { target: "self" },
      ResendSent: { target: "self" }, ResendRefused: { target: "self" }, ResendUnsure: { target: "self" },
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, memory }) => strikesOf(memory, event.challengeId) >= LIMIT || deny("NotLocked"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        traits: {                                     // filled where they are placed
          code: {
            input: () => ({ value: "" }),
            guards: { canEdit: ({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut") },
          },
          resendCooldown: {},
        },
        on: {
          BackToPassword: S.PASSWORD,
          Resend: {
            target: "self",
            guard: [
              ({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"),
              ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
            ],
            actions: [resend],
            raise: [E.resendCooldown.Start],
          },
          ResendSent: { target: "self" },
          ResendUnsure: { target: "self" },
          ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error ?? true, // forwards the field's own reason, e.g. CodeFormat
                  ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"),
                  verify.idle(challenge),                    // InFlight until the last verify's ending is handled
                ],
                updateMemory: () => ({ error: null }),
                actions: [verify],
              },
            },
          },
          VERIFYING: {
            // A soft timeout: stop waiting, keep listening. The real ending then arrives late (2.7.6).
            schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },
            on: {
              StopWaiting: toEntering("Couldn't check the code, try again"),
              CodeAccepted: {
                target: S.SIGNED_IN,
                updateMemory: () => ({ struck: [] }), // every lockout is forgotten
              },
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ event, memory }) => strikesOf(memory, event.challengeId) + 1 >= LIMIT || deny("TriesLeft"),
                  updateMemory: ({ event, memory }) => ({ error: null, struck: union(memory.struck, event.challengeId) }),
                  raise: [E.code.Reset, strike],
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ event, memory }) => ({
                    error: `Wrong code, ${LIMIT - strikesOf(memory, event.challengeId) - 1} tries left`,
                    struck: union(memory.struck, event.challengeId),
                  }),
                  raise: [E.code.Reset, strike],
                },
              ],
              CodeExpired: toEntering("Code expired, send a new one"),
              CodeUnchecked: toEntering("Couldn't check the code, try again"),
            },
          },
          LOCKED_OUT: {}, // Submit is Unhandled; typing is refused by canEdit; Resend falls through
        },
      },

      SIGNED_IN: {},
    },
  };
});
```

**After.** `Auth.verifyCode` keeps its key, now written `key: ["challengeId"]` (OD4), so a late verify of c1 never blocks
c2, exactly as before, with no list in memory. The fragments are unchanged.

```ts
// signin.definition.ts
import { definition, deny, Flow } from "flow-state"
import { Schema } from "effect"
// verifyCode: key challengeId, concurrency "reject"; resendCode: concurrency "reject", no key. The commits classify
// WrongCode, Expired and Throttled as failures, with Outcome, where they read the response.
import { Auth } from "./auth.contracts"                                         // RENAMED file
import { Countdown, Field, Lockout } from "./fragments"

export const LIMIT = 3

const sixDigits = (v: string) => /^\d{6}$/.test(v) || deny("CodeFormat", { length: 6 })

export const SignIn = definition({
  id: "Auth/SignIn",
  states: [
    "PASSWORD",
    {
      TWO_FACTOR: Flow.state(["ENTERING", "VERIFYING", "LOCKED_OUT"], {
        traits: {
          code: Field(Schema.String, { validate: sixDigits }),
          resendCooldown: Countdown({ length: "30 seconds" }).resumable(),
        },
      }),
    },
    "SIGNED_IN",
  ],
  events: {
    PasswordAccepted: { challengeId: Schema.String },
    Submit: {},
    Resend: {},
    BackToPassword: {},
  },
  internalEvents: {
    CodeAccepted: {},
    CodeWrong: { challengeId: Schema.String },
    CodeExpired: {},
    CodeUnchecked: Flow.uncertain({}),
    ResendSent: {},
    ResendRefused: {},
    ResendUnsure: Flow.uncertain({}),
    StopWaiting: {},
  },
  memory: {
    challengeId: Flow.initial(Schema.String, ""),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    struck: Flow.private(Flow.initial(Schema.Array(Schema.String), [])),
  },
  traits: {
    challenges: Lockout({ limit: LIMIT, length: "5 minutes" }).each({ of: "struck", max: 20 }),
  },
  operations: ({ E }) => ({                                                     // existing keyword, NEW MEANING
    verify: Auth.verifyCode.outcomes({                                          // user-defined: verify; one lane per challenge (the contract's key)
      success: E.CodeAccepted,
      failure: {
        WrongCode: E.CodeWrong.from((_, { key }) => ({ challengeId: key.challengeId })),   // key: the lane's challenge
        Expired: E.CodeExpired,
        NotSent: E.CodeUnchecked,
      },
      unknown: E.CodeUnchecked,
    }),
    resend: Auth.resendCode.outcomes({
      success: E.ResendSent,
      failure: { Throttled: E.ResendRefused, NotSent: E.ResendRefused },
      unknown: E.ResendUnsure,
    }),
  }),
})
```

```ts
// signin.machine.ts
import { deny, machine } from "flow-state"
import { LIMIT, SignIn } from "./signin.definition"

type Memory = typeof SignIn.Memory.Type
const strikesOf = (memory: Memory, key: string) => memory.challenges.find((c) => c.key === key)?.strikes ?? 0

export const SignInMachine = machine(SignIn, ({ S, E, O }) => {                  // O: NEW MEANING
  const strike = E.challenges.Strike.from(({ event }) => ({ key: event.challengeId }))
  const isCurrent = ({ key, memory }) => key === memory.challengeId || deny("OtherChallenge")
  const union = (ids: ReadonlyArray<string>, id: string) => (ids.includes(id) ? ids : [...ids, id])
  const forget = ({ memory, key }) => ({ struck: memory.struck.filter((id) => id !== key) })
  const toEntering = (error: string) => ({ target: S.TWO_FACTOR.ENTERING, updateMemory: () => ({ error }) })
  const thisChallenge = ({ memory }) => ({ challengeId: memory.challengeId })   // user-defined: a key selector (was the lane-key const)

  return {
    default: S.PASSWORD,

    traits: {
      challenges: {
        callbacks: {
          onLocked: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: [S.TWO_FACTOR.ENTERING, isCurrent],
              updateMemory: () => ({ error: null }),
              raise: [E.code.Reset],
            },
            { target: "self" },
          ],
          onUnlocked: [
            { target: S.TWO_FACTOR.ENTERING, guard: [S.TWO_FACTOR.LOCKED_OUT, isCurrent], updateMemory: (g) => ({ ...forget(g), error: null }) },
            { target: "self", updateMemory: forget },
          ],
        },
      },
    },

    on: {
      CodeWrong: [
        {
          target: "self",
          guard: ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
          updateMemory: ({ memory, event }) => ({ struck: union(memory.struck, event.challengeId) }),
          raise: [strike],
        },
        { target: "self" },
      ],
      CodeAccepted: { target: "self" },
      CodeExpired: { target: "self" },
      CodeUnchecked: [
        { target: "self", guard: [O.verify.retryable({ times: 2 })], actions: [O.verify.retry] },   // R5 M6: re-send the same id first; the server answers what it did with the code
        { target: "self", actions: [O.verify.cancel] },                        // then release (OD6, R4 H1); key-less: verify alone maps CodeUnchecked (OD8)
      ],
      ResendSent: { target: "self" }, ResendRefused: { target: "self" }, ResendUnsure: { target: "self", actions: [O.resend.cancel] },   // resending is safe to repeat: release, else every Resend ends Rejected
    },

    states: {
      PASSWORD: {
        on: {
          PasswordAccepted: [
            {
              target: S.TWO_FACTOR.LOCKED_OUT,
              guard: ({ event, memory }) => strikesOf(memory, event.challengeId) >= LIMIT || deny("NotLocked"),
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
            {
              target: S.TWO_FACTOR,
              updateMemory: ({ event }) => ({ challengeId: event.challengeId, error: null }),
            },
          ],
        },
      },

      TWO_FACTOR: {
        default: S.TWO_FACTOR.ENTERING,
        traits: {
          code: {
            input: () => ({ value: "" }),
            guards: { canEdit: ({ state }) => !S.TWO_FACTOR.LOCKED_OUT.is(state) || deny("LockedOut") },
          },
          resendCooldown: {},
        },
        on: {
          BackToPassword: S.PASSWORD,
          Resend: {
            target: "self",
            guard: [
              ({ state }) => !S.TWO_FACTOR.VERIFYING.is(state) || deny("Checking"),
              ({ schedules }) => schedules.resendCooldown.done === undefined || deny("CoolingDown"),
            ],
            actions: [O.resend.commit(({ memory }) => ({ challengeId: memory.challengeId }))],   // existing: commit (OPS O3)
            raise: [E.resendCooldown.Start],
          },
          ResendSent: { target: "self" },
          ResendUnsure: { target: "self", actions: [O.resend.cancel] },
          ResendRefused: { target: "self", updateMemory: () => ({ error: "Too many requests, try again later" }) },
        },
        states: {
          ENTERING: {
            on: {
              Submit: {
                target: S.TWO_FACTOR.VERIFYING,
                guard: [
                  ({ memory }) => memory.code.error ?? true,
                  ({ memory }) => strikesOf(memory, memory.challengeId) < LIMIT || deny("NoTriesLeft"),
                  O.verify.idle(thisChallenge),                                  // existing: idle(key); InFlight per challenge
                ],
                updateMemory: () => ({ error: null }),
                actions: [O.verify.commit(({ memory }) => ({ challengeId: memory.challengeId, code: memory.code.value }))],   // the key comes from the input
              },
            },
          },
          VERIFYING: {
            schedules: { gaveUp: { schedule: "15 seconds", send: E.StopWaiting } },
            on: {
              StopWaiting: toEntering("Couldn't check the code, try again"),
              CodeAccepted: {
                target: S.SIGNED_IN,
                updateMemory: () => ({ struck: [] }),
              },
              CodeWrong: [
                {
                  target: S.TWO_FACTOR.LOCKED_OUT,
                  guard: ({ event, memory }) => strikesOf(memory, event.challengeId) + 1 >= LIMIT || deny("TriesLeft"),
                  updateMemory: ({ event, memory }) => ({ error: null, struck: union(memory.struck, event.challengeId) }),
                  raise: [E.code.Reset, strike],
                },
                {
                  target: S.TWO_FACTOR.ENTERING,
                  updateMemory: ({ event, memory }) => ({
                    error: `Wrong code, ${LIMIT - strikesOf(memory, event.challengeId) - 1} tries left`,
                    struck: union(memory.struck, event.challengeId),
                  }),
                  raise: [E.code.Reset, strike],
                },
              ],
              CodeExpired: toEntering("Code expired, send a new one"),
              CodeUnchecked: [
                { target: "self", guard: [O.verify.retryable({ times: 2 })], actions: [O.verify.retry] },   // Held → InFlight, same id (3.8.1); a consumed code answers "accepted", not WrongCode (R5 M6)
                { ...toEntering("Couldn't check the code, try again"), actions: [O.verify.cancel] },   // Held → Idle: released, so Submit's idle passes
              ],
            },
          },
          LOCKED_OUT: {},
        },
      },

      SIGNED_IN: {},
    },
  }
})
```

The view (MD 3.1's `TwoFactorStep.tsx`) is unchanged: it reads only `check()` verdicts.

**Revision 7 (R5 M6, the table).** Releasing at once could strike a correct code: if the unknown verify succeeded,
the server consumed the code, and the same code re-submitted answers `WrongCode`. Now `CodeUnchecked` re-sends the
same Attempt twice (`Held` → `InFlight`, the server answers what it did), then releases. `NotSent { Rejected }` also
maps to `CodeUnchecked`; it is delivered without changing the state (table, `commit` row), and its key-less members
act on the rejected commit's own Attempt, which is not addressable: `retryable` denies `NothingToResend` and `cancel`
does nothing, so the real hold is left to its own ending (R5 K9). `Submit`'s `idle` guard keeps that case from
arising. Walk: verify ends unknown → `Held` → retry → `InFlight` (`pending`)
→ `success` → `CodeAccepted` → SIGNED_IN; or two more unknowns → release → ENTERING. `UnresolvedHold`: the fallback
branch cancels, so the retry counts (3.8.1 rule 2).

**Revision 6 (R4 H1).** Under OD5 a `verify` unknown held the challenge's `reject` lane, so the next `Submit` was
denied `Uncertain` for the rest of the challenge, and a `resend` unknown made every later `Resend` end `Rejected`,
shown as "Too many requests". Now each unknown handler releases its own Attempt: a code check holds no server fact
worth waiting for, and a resend is safe to repeat. Walk: verify c1 ends unknown → `CodeUnchecked` in VERIFYING goes
to ENTERING and cancels → the lane is free → `Submit` sends a new verify. A late unknown after `StopWaiting` reaches
the root handler, which cancels too. `UnresolvedHold` passes.

**Added:** two operations. **Kept:** `commit`, now `O.verify.commit` and `O.resend.commit`. **Dropped:** two commit
values with their `outcomes` options, the `Auth` record in `operations`; revision 2's `seen` list. Lines: definition +16, machine -20.

### 5.3 The Issues list (merge 4: domain writes per record, drafts)

**Contracts and domain.** As revision 2, with `createIssue` keeping `draftId` in its input and `key` (the device's
identity of a pending create; the commit does not send it). The three predicting writes take their key from
`.predicts` (M4 rule 34). File renamed `issues.contracts.ts`.

```ts
// issues-api.ts: the adapter, wrapping fetch to /api/projects/:id/issues
import { Context, Effect, Schema } from "effect"

export class IssueRow extends Schema.Class<IssueRow>("IssueRow")({
  id: Schema.String, projectId: Schema.String, number: Schema.Int, title: Schema.String, liked: Schema.Boolean, likes: Schema.Int,
}) {}
export const IssuesPage = Schema.Struct({ issues: Schema.Array(IssueRow) })
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}

export class IssuesApi extends Context.Service<IssuesApi, {
  list(p: { projectId: string }, o: { signal: AbortSignal }): Effect.Effect<{ status: number; page?: typeof IssuesPage.Type }, NoResponse>
  send(method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body: unknown, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; row?: IssueRow; message?: string }, NoResponse>
}>()("issues/IssuesApi") {}
```

```ts
// issues.contracts.ts (plain structs; no entity imports, EDP O1)
import { Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"
import { IssueRow, IssuesApi, IssuesPage } from "./issues-api"

export class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class Invalid extends Schema.TaggedError<Invalid>()("Invalid", { message: Schema.String }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class ListFailed extends Schema.TaggedError<ListFailed>()("ListFailed", { status: Schema.Number }) {}

const send = (method: "PUT" | "PATCH" | "DELETE" | "POST", path: string, body: unknown, attemptId: string, signal: AbortSignal) =>
  IssuesApi.use((api) => api.send(method, path, body, { idempotencyKey: attemptId, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
const settle = (res: { status: number }) => Effect.gen(function* () {
  if (res.status === 404) return yield* Outcome.failure(new Gone({}))
  if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
  return yield* Outcome.failure(new Refused({ status: res.status }))
})

export const issuesInProject = resource({
  id: "issues/in-project", input: { projectId: Schema.String }, output: IssuesPage, key: ["projectId"], staleTime: "30 seconds", gcTime: "5 minutes",   // OD12: input/output; OD4: key names input fields
  lookup: (i, { signal }) => Effect.gen(function* () {
    const res = yield* (yield* IssuesApi).list(i, { signal }).pipe(Effect.mapError(() => new ListFailed({ status: 0 })))
    if (res.page === undefined) return yield* new ListFailed({ status: res.status })
    return res.page
  }),
})
export const setLike = transaction({
  id: "issues/set-like", input: Schema.Struct({ id: Schema.String, liked: Schema.Boolean }), output: IssueRow, key: ["id"], concurrency: "latest",   // NEW (OD15): stated, no domain default
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("PUT", `/issues/${i.id}/like`, { liked: i.liked }, attempt.id, signal)
    if (res.status === 200 && res.row !== undefined) return res.row
    return yield* settle(res)
  }),
})
export const renameIssue = transaction({
  id: "issues/rename", input: Schema.Struct({ id: Schema.String, title: Schema.String }), output: IssueRow, key: ["id"], concurrency: "latest",
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("PATCH", `/issues/${i.id}`, { title: i.title }, attempt.id, signal)
    if (res.status === 200 && res.row !== undefined) return res.row
    return yield* settle(res)
  }),
})
export const removeIssue = transaction({
  id: "issues/remove", input: Schema.Struct({ id: Schema.String }), key: ["id"], concurrency: "reject",   // no output: void (Q37)
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("DELETE", `/issues/${i.id}`, {}, attempt.id, signal)
    if (res.status === 204) return
    return yield* settle(res)
  }),
})
export const createIssue = transaction({
  id: "issues/create", input: Schema.Struct({ draftId: Schema.String, projectId: Schema.String, title: Schema.String }), output: IssueRow,
  key: ["draftId"],                                                            // NEW MEANING (OD4): key is a field list; one lane per draft (predicts nothing, so it is declared)
  concurrency: "reject",
  commit: (i, { attempt, signal }) => Effect.gen(function* () {
    const res = yield* send("POST", `/projects/${i.projectId}/issues`, { title: i.title }, attempt.id, signal)   // draftId stays on the device
    if (res.status === 201 && res.row !== undefined) return res.row
    if (res.status === 422) return yield* Outcome.failure(new Invalid({ message: res.message ?? "invalid" }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Refused({ status: res.status }))
  }),
})
```

```ts
// issues.domain.ts (merge 4; the predicts read input.id)
import { asc, desc, domain, entity, eq, read, write } from "flow-state"
import { IssueRow } from "./issues-api"
import { createIssue, issuesInProject, removeIssue, renameIssue, setLike } from "./issues.contracts"

export const Issue = entity({ id: "issues/Issue", fields: IssueRow.fields, primaryKey: ["id"] })
export const Issues = domain("issues", {
  list: read(issuesInProject)
    .list(Issue, ({ result }) => result.issues)
    .where(({ input, record }) => eq(record.projectId, input.projectId))
    .orderBy(({ record }) => [desc(record.number), asc(record.id)]),
  setLike: write(setLike).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, {
    liked: input.liked,
    likes: (i) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1),
  })),
  rename: write(renameIssue).one(Issue).predicts(({ input }) => Issue.patch({ id: input.id }, { title: input.title })),
  remove: write(removeIssue).predicts(({ input }) => Issue.delete({ id: input.id })),
  create: write(createIssue).one(Issue),
})
```

**Before** (M4 3.1's definition and machine, verbatim):

```ts
// ───────────────────────────────────────────────── list.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Draft = Schema.Struct({            // workflow, not entity data: a create the list does not hold yet (E9)
  draftId: Schema.String,                       // the view's key and the create's lane; never sent
  title: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),             // the real id once Created; the view hides the draft once the list holds it
  discarded: Schema.Boolean,                    // discarded while it may land: deleted once Created
})
export type Draft = typeof Draft.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String, liked: Schema.Boolean },   // the view sends the value it wants, read from the record
    Edit: { id: Schema.String, title: Schema.String },
    Delete: { id: Schema.String },
    Open: { id: Schema.String },
    Create: { draftId: Schema.String, title: Schema.String },
    Retry: { draftId: Schema.String },
    Discard: { draftId: Schema.String },
  },
  internalEvents: {
    Listed: { ids: Schema.Array(Schema.String) },
    Settled: {}, IssueGone: {},
    Failed: { message: Schema.String, superseded: Schema.Boolean },
    Unsure: Flow.uncertain({ message: Schema.String, superseded: Schema.Boolean }),
    LikeUnsure: Flow.uncertain({ id: Schema.String, superseded: Schema.Boolean }),
    Created: { draftId: Schema.String, id: Schema.String },
    CreateFailed: { draftId: Schema.String, message: Schema.String },   // Revision (multiplicity audit, 2026-10-31): a NothingToResend names its draft through laneKey (design D21)
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
  memory: {                                                        // workflow only: no row, title, like or rollback (E1)
    projectId: Flow.input(Schema.String),
    creating: Flow.initial(Schema.Array(Draft), []),
    likeUnsure: Flow.initial(Schema.Array(Schema.String), []),     // the keyed schedule's keys
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Issues },
})

// ───────────────────────────────────────────────── list.machine.ts
type Memory = typeof List.Memory.Type
const draft = (m: Memory, draftId: string) => m.creating.find((d) => d.draftId === draftId)
const editDraft = (m: Memory, draftId: string, f: (d: Draft) => Draft) => ({ creating: m.creating.map((d) => (d.draftId === draftId ? f(d) : d)) })
const dropDraft = (m: Memory, draftId: string) => ({ creating: m.creating.filter((d) => d.draftId !== draftId) })
const without = (ids: ReadonlyArray<string>, id: string) => ids.filter((x) => x !== id)

export const ListMachine = machine(List, ({ S, E, O }) => {
  const issue = ({ event }) => ({ id: event.id })                  // the lane key is the record key (E10)
  const drafted = ({ event }) => ({ draftId: event.draftId })
  const fail = (message: string) => E.Failed.from((_r, { superseded }) => ({ message, superseded }))
  const unsure = (message: string) => E.Unsure.from((_r, { superseded }) => ({ message, superseded }))

  // B1: the store predicts liked and likes; `latest` coalesces inside the record queue (E5)
  const like = O.Issues.setLike.commit(({ event }) => ({ key: { id: event.id }, liked: event.liked }), {
    outcomes: {
      success: E.Settled,                                          // the store confirms; memory has nothing to write
      failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },   // NotSent: Superseded or Overloaded (E11)
      unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.key.id, superseded })),
    },
  })
  const rename = O.Issues.rename.commit(({ event }) => ({ key: { id: event.id }, title: event.title }), {
    outcomes: { success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") }, unknown: unsure("Couldn't confirm the title") },
  })
  const remove = O.Issues.remove.commit(({ event }) => ({ key: { id: event.id } }), {   // Delete, and Created for a discarded draft
    outcomes: { success: E.Settled, failure: { Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") }, unknown: unsure("Couldn't confirm the delete") },
  })
  // B2: Create and Retry both start it; the select reads the draft from the after memory (rule 22)
  const create = O.Issues.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: draft(memory, event.draftId)?.title ?? "" }), {
    outcomes: {
      success: E.Created.from((v, { input }) => ({ draftId: input.draftId, id: v.id })),
      failure: {
        Invalid: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: r.message })),
        Refused: E.CreateFailed.from((r, { input }) => ({ draftId: input.draftId, message: `Refused (${r.status})` })),
        NotSent: E.CreateFailed.from((r, { laneKey }) => ({ draftId: laneKey.draftId, message: `Not sent (${r.why})` })),   // laneKey: always present
      },
      unknown: E.CreateUnsure.from((_r, { input }) => ({ draftId: input.draftId })),
    },
  })
  const reload = O.Issues.list.refetch(({ memory }) => ({ projectId: memory.projectId }))   // a failure repairs nothing (C4): ask again
  const draftIs = (pred: (d: Draft) => boolean, code: string) => ({ memory, event }) => { const d = draft(memory, event.draftId); return (d !== undefined && pred(d)) || deny(code) }
  const toastUnlessSuperseded = [
    { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // a newer write on the lane decides
    { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) },
  ]

  return {
    default: S.READY,
    states: {
      READY: {
        activities: {   // value sees confirmed data only (EDP O1); the event carries ids, never rows
          issues: O.Issues.list.subscribe(({ memory }) => ({ projectId: memory.projectId }), { outcomes: { value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) } }),
        },
        schedules: {
          reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) },
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.Failed, E.Unsure, E.LikeUnsure] },
        },
        on: {
          // ───────────── B1 likes, rename, remove: the store predicts, confirms, rolls back and marks uncertain (E1)
          Toggle: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like] },   // a newer write replaces the reconcile
          Edit: { guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), target: "self", actions: [rename] },
          Delete: { guard: [remove.idle(issue)], target: "self", updateMemory: ({ memory, event }) => ({ selectedId: memory.selectedId === event.id ? null : memory.selectedId }), actions: [remove] },
          Open: { guard: ({ activities, event }) => activities.issues?.data?.issues.some((i) => i.id === event.id) || deny("NoSuchRow"), target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [reload] },
          Failed: toastUnlessSuperseded,
          Unsure: toastUnlessSuperseded,                             // the record reads uncertain until a later write or a retry succeeds (E3)
          LikeUnsure: [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // the newer write's success clears it (E3)
            { target: "self", guard: ({ calls, event }) => (calls.Issues.setLike.find((l) => l.key.id === event.id)?.retryCount ?? 0) < MAX_LIKE_RESENDS || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.id), event.id] }) },   // setLike is latest: one addressable Attempt (design rule N2)
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id), toast: "Couldn't confirm your like" }) },
          ],
          ReconcileLike: { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like.retry(issue)] },   // the same request, no new prediction (E7)

          // ───────────── B2: create as a draft, shown apart from the list (E9)
          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => draft(memory, event.draftId) === undefined || deny("DuplicateDraft")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ creating: [...memory.creating, { draftId: event.draftId, title: event.title, status: "sending", failure: null, id: null, discarded: false }] }),
            actions: [create],
          },
          Created: [
            { guard: draftIs((d) => d.discarded, "NotDiscarded"), target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId), actions: [remove] },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },
          CreateFailed: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "failed", failure: event.message })) },
          ],
          CreateUnsure: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded"), ({ calls, event }) => (calls.Issues.create.find((l) => l.key.draftId === event.draftId)?.retryCount ?? 0) < 3 || deny("GaveUp")], target: "self", actions: [create.retry(drafted)] },   // find out, so a landed create is deleted
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "unsure" })) },
          ],
          Retry: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending", failure: null })), actions: [create] },   // a new write (rule 19)
            { guard: [draftIs((d) => d.status === "unsure", "NothingToRetry"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending" })), actions: [create.retry(drafted)] },   // the same Attempt
          ],
          Discard: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { guard: [draftIs((d) => d.status === "unsure", "NotUnsure"), create.idle(drafted)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })), actions: [create.retry(drafted)] },
            { guard: [draftIs((d) => d.status === "sending", "NotSending")], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })) },
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
```

```tsx
// view (M4 3.1)
const rows = useView(list, (s) => s.activities.issues?.data?.issues ?? [])
const saving = useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)
```

**After:**

```ts
// list.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./issues.domain"

export const MAX_LIKE_RESENDS = 3

export const Draft = Schema.Struct({
  draftId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(["sending", "failed", "unsure", "created"]),
  failure: Schema.NullOr(Schema.String),
  id: Schema.NullOr(Schema.String),
  discarded: Schema.Boolean,
})
export type Draft = typeof Draft.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String, liked: Schema.Boolean },
    Edit: { id: Schema.String, title: Schema.String },
    Delete: { id: Schema.String },
    Open: { id: Schema.String },
    Create: { draftId: Schema.String, title: Schema.String },
    Retry: { draftId: Schema.String },
    Discard: { draftId: Schema.String },
  },
  internalEvents: {
    Listed: { ids: Schema.Array(Schema.String) },
    Settled: {}, IssueGone: {},
    Failed: { message: Schema.String },                                         // CHANGED: no superseded field (3.8.1)
    RenameUnsure: Flow.uncertain({ message: Schema.String }), RemoveUnsure: Flow.uncertain({ message: Schema.String }),   // CHANGED (OD8): one unknown event per keyed operation whose handler acts on its lane
    LikeUnsure: Flow.uncertain({ id: Schema.String }),                          // CHANGED: no superseded field
    Created: { draftId: Schema.String, id: Schema.String },
    CreateFailed: { draftId: Schema.String, message: Schema.String },
    CreateUnsure: Flow.uncertain({ draftId: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
  memory: {
    projectId: Flow.input(Schema.String),
    creating: Flow.initial(Schema.Array(Draft), []),
    // REMOVED (OD5): likeUnsure, the mirrored id list (R3 M2); the reconcile schedule reads the lanes' `uncertain`
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => {                                                      // existing keyword, NEW MEANING
    const fail = (message: string) => E.Failed.from(() => ({ message }))
    const unsure = (event: typeof E.RenameUnsure | typeof E.RemoveUnsure, message: string) => event.from(() => ({ message }))
    return {
      issues: Issues.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.issues.map((i) => i.id) })) }),   // maps value: the machine subscribes (S11)
      like: Issues.setLike.outcomes({                                           // one lane per Issue, created by work (key: ["id"], stated on the contract, OD15)
        success: E.Settled,
        failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") },   // a replaced toggle never arrives here (3.8.1)
        unknown: E.LikeUnsure.from((_r, { key }) => ({ id: key.id })),
      }),
      rename: Issues.rename.outcomes({
        success: E.Settled,
        failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") },
        unknown: unsure(E.RenameUnsure, "Couldn't confirm the title"),
      }),
      remove: Issues.remove.outcomes({
        success: E.Settled,
        failure: { Gone: E.Settled, Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") },
        unknown: unsure(E.RemoveUnsure, "Couldn't confirm the delete"),
      }),
      create: Issues.create.outcomes({                                          // one lane per draft (the contract's key)
        success: E.Created.from((v, { key }) => ({ draftId: key.draftId, id: v.id })),
        failure: {
          Invalid: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: r.message })),
          Refused: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: `Refused (${r.status})` })),
          NotSent: E.CreateFailed.from((r, { key }) => ({ draftId: key.draftId, message: `Not sent (${r.why})` })),   // key: always present (was laneKey)
        },
        unknown: E.CreateUnsure.from((_r, { key }) => ({ draftId: key.draftId })),
      }),
    }
  },
})
```

```ts
// list.machine.ts
import { deny, machine } from "flow-state"
import { List, MAX_LIKE_RESENDS, type Draft } from "./list.definition"

type Memory = typeof List.Memory.Type
const draft = (m: Memory, draftId: string) => m.creating.find((d) => d.draftId === draftId)
const editDraft = (m: Memory, draftId: string, f: (d: Draft) => Draft) => ({ creating: m.creating.map((d) => (d.draftId === draftId ? f(d) : d)) })
const dropDraft = (m: Memory, draftId: string) => ({ creating: m.creating.filter((d) => d.draftId !== draftId) })

export const ListMachine = machine(List, ({ S, E, O }) => {                      // O: NEW MEANING
  const named = ({ event }) => event                                            // user-defined: a user event names the thing; it carries the key's fields (OD4)
  const draftIs = (pred: (d: Draft) => boolean, code: string) => ({ memory, event }) => { const d = draft(memory, event.draftId); return (d !== undefined && pred(d)) || deny(code) }
  const toast = { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) }

  return {
    default: S.READY,
    states: {
      READY: {
        activities: [O.issues.subscribe(({ memory }) => ({ projectId: memory.projectId }))],   // NEW MEANING: a list; existing: subscribe (OPS O2)
        schedules: {
          reconcile: { keys: ({ operations }) => operations.like.filter((l) => l.uncertain).map((l) => l.key), schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key.id })) },   // NEW (OD5): uncertain on the row; key: the lane's key record (L1, 3.12)
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.Failed, E.RenameUnsure, E.RemoveUnsure, E.LikeUnsure] },
        },
        on: {
          Toggle: {
            target: "self",                                                     // a toggle while unsure waits behind the held lane (OD5); no mirror to update
            actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))],   // existing: commit; the key is derived
          },
          Edit: {
            guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"),
            target: "self",
            actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))],
          },
          Delete: {
            guard: [O.remove.idle(named)],                                      // existing: idle(key); the event carries `id` (OD4)
            target: "self",
            updateMemory: ({ memory, event }) => ({ selectedId: memory.selectedId === event.id ? null : memory.selectedId }),
            actions: [O.remove.commit(({ event }) => ({ id: event.id }))],
          },
          Open: { guard: ({ operations, event }) => operations.issues?.data?.issues.some((i) => i.id === event.id) || deny("NoSuchRow"), target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
          Settled: { target: "self" },
          IssueGone: { target: "self", actions: [O.issues.refetch] },
          Failed: toast,
          RenameUnsure: { ...toast, actions: [O.rename.cancel] },              // give up: release this Attempt; a rename that waited behind it is then sent (OD7)
          RemoveUnsure: { ...toast, actions: [O.remove.cancel] },              // key-less: rename and remove each alone map their event (OD8)
          LikeUnsure: [
            { target: "self", guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] },   // NEW: retryable (OD1); no key: this ending's Attempt (OD4); the reconcile schedule re-sends it
            { target: "self", updateMemory: () => ({ toast: "Couldn't confirm your like" }), actions: [O.like.cancel] },   // gave up: release this Attempt (OD7); an unlike that waited is then sent, not dropped (R4 H3)
          ],
          ReconcileLike: { target: "self", actions: [O.like.retry(named)] },   // not an ending: the event names the Issue

          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => draft(memory, event.draftId) === undefined || deny("DuplicateDraft")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ creating: [...memory.creating, { draftId: event.draftId, title: event.title, status: "sending", failure: null, id: null, discarded: false }] }),
            actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: event.title }))],   // the key comes from the input
          },
          Created: [
            { guard: draftIs((d) => d.discarded, "NotDiscarded"), target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId), actions: [O.remove.commit(({ event }) => ({ id: event.id }))] },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "created", id: event.id })) },
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ creating: memory.creating.filter((d) => d.id === null || !event.ids.includes(d.id)) }) },
          CreateFailed: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "failed", failure: event.message })) },
          ],
          CreateUnsure: [
            { guard: [draftIs((d) => d.discarded, "NotDiscarded"), O.create.retryable({ times: 3 })], target: "self", actions: [O.create.retry] },   // an ending: no key (OD4)
            { target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "unsure" })) },
          ],
          Retry: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending", failure: null })), actions: [O.create.commit(({ memory, event }) => ({ draftId: event.draftId, projectId: memory.projectId, title: draft(memory, event.draftId)?.title ?? "" }))] },   // a second start, its own select
            { guard: [draftIs((d) => d.status === "unsure", "NothingToRetry"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, status: "sending" })), actions: [O.create.retry(named)] },
          ],
          Discard: [
            { guard: [draftIs((d) => d.status === "failed", "NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropDraft(memory, event.draftId) },
            { guard: [draftIs((d) => d.status === "unsure", "NotUnsure"), O.create.idle(named)], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })), actions: [O.create.retry(named)] },
            { guard: [draftIs((d) => d.status === "sending", "NotSending")], target: "self", updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, (d) => ({ ...d, discarded: true })) },
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
        },
      },
    },
  }
})
```

```tsx
// IssueList.tsx
const { O } = List                                                              // NEW: the definition exports O, as it exports S and E
const rows = useView(list, (s) => s.operations.issues?.data?.issues ?? [])      // NEW path; undefined while not placed (OPS O6)
const drafts = useView(list, (s) => s.memory.creating.filter((d) => !d.discarded))
{rows.map((r) => <IssueRow key={r.id} issue={r} />)}
{drafts.map((d) => <DraftRow key={d.draftId} title={d.title} status={d.status} />)}   // status lives in memory: the handlers write it

// IssueRow.tsx
const row = useView(list, (s) => Issue.get(s, { id: issue.id }, Issue.pick("title", "liked", "likes")))   // shared: data, predicted, uncertain
const saving = useView(list, (s) => O.like.get(s, issue).pending || O.rename.get(s, issue).pending)   // NEW: get(s, item): the item carries `id` (OD4)
<LikeButton liked={row.data.liked} count={row.data.likes} unsure={row.uncertain} saving={saving} onClick={() => send(E.Toggle({ id: issue.id, liked: !row.data.liked }))} />
```

**What changed.**

| Before | After | Why |
| --- | --- | --- |
| four commit values in the body | five operations in the definition; `O.like.commit(select)` in the body | R7, R11; OD2 |
| `{ key: { id } }` inputs; `issue`, `drafted` consts | `{ id }` inputs; the key is the contract's field list (`["id"]`, OD15); user events passed as they are (`named`) | R7; OD4 |
| `calls.Issues.setLike.find((l) => l.key.id === event.id)?.retryCount ?? 0` | `O.like.retryable({ times: MAX_LIKE_RESENDS })`, no key in the ending's handler | R9; OD4 |
| `superseded` in three events, two guards | nothing: a toggle that was never sent is replaced silently; a sent one is delivered (3.8.1) | OD5 |
| `memory.likeUnsure`, kept by hand in `Toggle`, `LikeUnsure` and `ReconcileLike` | the schedule's `keys` read the lanes' `uncertain` | R9; OD5 (R3 M2) |
| `laneKey.draftId` | `key.draftId` | one meaning of `key` |
| `s.calls.Issues.setLike.find(...)?.pending ?? false` | `O.like.get(s, issue).pending` | R16; OD4 |
| `O.Issues.list.subscribe(select, { outcomes })` in the `activities` record | `activities: [O.issues.subscribe(select)]` | same verb (OD2); outcomes on the operation |
| `reload = O.Issues.list.refetch(select)` | `O.issues.refetch` | the placement names the entry |

Lines: definition 49 → 72 (+23), machine 109 → 86 (-23), view +1. Net about +1.

**Revision 6 (R4 H3, H4).** `cancel` addresses one Attempt and then sends what waited (OD7), and the shared `Unsure`
is split into `RenameUnsure` and `RemoveUnsure` (OD8: a key-less keyed member stands only in its own operation's
event). Walk H3: a like ends unknown → the user unlikes, and the unlike waits (`waiting: true`, its prediction shown)
→ the reconcile schedule re-sends the like 3 times → `LikeUnsure`'s last branch cancels → the like is released → the
unlike is sent and settles → the heart shows what the user last chose. In revision 5 the unlike ended silently. The
same holds for a rename that waited behind an unknown rename. `UnresolvedHold` passes for all four writes.

**Revision 8 (R6 H2), the reconcile offline, with no other events.** The like ends unknown → `Held`; the `{ id }` key
appears in `keys`, and the timer is armed. `ReconcileLike` runs `retry` → in step 5 the after lane is `InFlight`, and
`keys` read the after lanes, so the key leaves in that same turn. The re-send ends unknown at once (offline) → `Held`
→ the key re-appears → the timer is armed again. After the third unknown, `LikeUnsure`'s fallback cancels → the
queued unlike is promoted and sent. In revision 7, `keys` read the pre-turn lane, the key never left, and the timer
never re-armed on a quiet page. The like's mark on the Issue record is no longer cleared by a rename's success while
the like is still being re-sent (merge 4 rule 32, as amended in 3.8.1, proposed).

### 5.4 A stream: the chat room (live feed, catch-up read, per-message send)

**Contracts** (M6 4.1.1's `messages`, a catch-up read and a send; `post` gains `key: ["clientId"]` (OD4),
one lane per message; file renamed `chat.contracts.ts`):

```ts
// chat.contracts.ts                                                          RENAMED file (was chat.operations.ts)
import { Context, Effect, Schedule, Schema, Stream } from "effect"
import { Outcome, resource, Session, stream, transaction } from "flow-state"

export class Message extends Schema.Class<Message>("Message")({ seq: Schema.Number, clientId: Schema.String, author: Schema.String, text: Schema.String }) {}
export class Dropped extends Schema.TaggedError<Dropped>()("Dropped", { code: Schema.Number }) {}
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}
export class HistoryExpired extends Schema.TaggedError<HistoryExpired>()("HistoryExpired", {}) {}
export class Overflow extends Schema.TaggedError<Overflow>()("Overflow", {}) {}
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

// The WebSocket adapter: sends { resume: after }, maps "resumed" to Session.resumed() and "reset" to
// Session.gap(new HistoryExpired()); a bounded queue overflows into Session.gap(new Overflow()); close 4401 fails
// SignedOut, any other close fails Dropped (M6 7.1).
export class ChatSocket extends Context.Service<ChatSocket, {
  messages(p: { roomId: string; after: number }): Stream.Stream<Message | Session.Signal<Dropped, HistoryExpired | Overflow>, Dropped | SignedOut>
}>()("chat/ChatSocket") {}
export class ChatHttp extends Context.Service<ChatHttp, {
  since(p: { roomId: string; after: number }, o: { signal: AbortSignal }): Effect.Effect<ReadonlyArray<Message>>
  post(p: { roomId: string; clientId: string; text: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; seq: number }, NoResponse>
}>()("chat/ChatHttp") {}

const backoff = Schedule.exponential("500 millis").pipe(Schedule.both(Schedule.recurs(8)))

export const Chat = {
  messages: stream({
    id: "chat/messages",
    input: { roomId: Schema.String, after: Schema.Number },                    // NEW (OD12): the resume position `after` is an ordinary input field outside the key
    output: Message,                                                           // RENAMED (OD12): result → output
    key: ["roomId"],                                                           // the session is per room (streams: key required, proposed, 3.3)
    delivers: "every",
    subscribe: (input) => Session.reconnect({
      connect: (from) => ChatSocket.use((s) => s.messages({ roomId: input.roomId, after: from ?? input.after })),
      position: (m) => m.seq,
      schedule: backoff,
      while: (e) => e._tag === "Dropped",
    }),
  }),
  since: resource({
    id: "chat/since", input: { roomId: Schema.String, after: Schema.Number }, output: Schema.Array(Message), key: ["roomId", "after"], staleTime: "0 millis", gcTime: "0 millis",   // composite key: every field
    lookup: (input, { signal }) => ChatHttp.use((h) => h.since(input, { signal })),
  }),
  post: transaction({
    id: "chat/post",
    input: Schema.Struct({ roomId: Schema.String, clientId: Schema.String, text: Schema.String }),
    output: { seq: Schema.Number },                                            // OD14: a fields record
    key: ["clientId"],                                                         // NEW MEANING (OD4): key is a field list; one lane per message
    concurrency: "reject",
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const res = yield* ChatHttp.use((h) => h.post(input, { idempotencyKey: attempt.id, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 201) return { seq: res.seq }
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Refused({ status: res.status }))
    }),
  }),
}
```

**Before** (M6 7.1 with 4.3.1 and 4.3.4 filled in, and a per-message send under the design's current lanes):

```ts
// room.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Chat, Message } from "./chat.operations"

export const Outgoing = Schema.Struct({ clientId: Schema.String, text: Schema.String, status: Schema.Literals(["sending", "failed", "unsure"]) })

export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { clientId: Schema.String, text: Schema.String }, Resend: { clientId: Schema.String } },
  internalEvents: {
    Message: { message: Message },
    Missed: { reason: Schema.String },
    CaughtUp: { messages: Schema.Array(Message) }, CatchUpFailed: {},
    SignedOut: {}, FeedLost: {}, RetryFeed: {},
    Posted: { clientId: Schema.String },
    PostFailed: { clientId: Schema.String },
    PostUnsure: Flow.uncertain({ clientId: Schema.String, resends: Schema.Int }),
  },
  memory: {
    roomId: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    lastSeq: Flow.initial(Schema.Number, 0),
    feedTries: Flow.initial(Schema.Int, 0),
    outbox: Flow.initial(Schema.Array(Outgoing), []),
  },
  operations: { Chat },
})

// room.machine.ts
import { deny, machine } from "flow-state"
import { Duration } from "effect"
import { Room } from "./room.definition"

type Memory = typeof Room.Memory.Type
const hasSeq = (m: Memory, seq: number) => m.messages.some((x) => x.seq === seq)
const mergeBySeq = (m: Memory, incoming: ReadonlyArray<Memory["messages"][number]>) => {
  const all = [...m.messages, ...incoming.filter((x) => !hasSeq(m, x.seq))].sort((a, b) => a.seq - b.seq)
  return { messages: all, lastSeq: all.length === 0 ? m.lastSeq : all[all.length - 1].seq }
}
const mark = (m: Memory, clientId: string, status: "sending" | "failed" | "unsure") => ({ outbox: m.outbox.map((o) => (o.clientId === clientId ? { ...o, status } : o)) })
const unqueue = (m: Memory, clientId: string) => ({ outbox: m.outbox.filter((o) => o.clientId !== clientId) })

export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const message = ({ event }) => ({ clientId: event.clientId })
  const catchUp = O.Chat.since.lookup(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }), {
    outcomes: { success: E.CaughtUp.from((v) => ({ messages: v })), failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed } },
  })
  const post = O.Chat.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: event.clientId, text: memory.outbox.find((o) => o.clientId === event.clientId)?.text ?? "" }), {
    outcomes: {
      success: E.Posted.from((_v, { input }) => ({ clientId: input.clientId })),
      failure: { Refused: E.PostFailed.from((_r, { laneKey }) => ({ clientId: laneKey.clientId })), NotSent: E.PostFailed.from((_r, { laneKey }) => ({ clientId: laneKey.clientId })) },
      unknown: E.PostUnsure.from((_r, { input, attempt }) => ({ clientId: input.clientId, resends: attempt.retryCount })),
    },
  })
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => mergeBySeq(memory, event.messages) },
      CatchUpFailed: { target: "self" },
      Posted: { target: "self", updateMemory: ({ memory, event }) => unqueue(memory, event.clientId) },
      PostFailed: { target: "self", updateMemory: ({ memory, event }) => mark(memory, event.clientId, "failed") },
      PostUnsure: [
        { target: "self", guard: ({ event }) => event.resends < 3 || deny("GaveUp"), actions: [post.retry(message)] },
        { target: "self", updateMemory: ({ memory, event }) => mark(memory, event.clientId, "unsure") },
      ],
      Resend: { target: "self", guard: [({ memory, event }) => memory.outbox.some((o) => o.clientId === event.clientId && o.status === "failed") || deny("NotFailed"), post.idle(message)], updateMemory: ({ memory, event }) => mark(memory, event.clientId, "sending"), actions: [post] },
    },
    states: {
      LIVE: {
        activities: {
          feed: O.Chat.messages.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }), {
            outcomes: {
              value: E.Message.from((m) => ({ message: m })),
              gap: E.Missed.from((r) => ({ reason: r._tag })),
              failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
            },
          }),
        },
        on: {
          Message: [
            { target: "self", guard: ({ memory, event }) => !hasSeq(memory, event.message.seq) || deny("Seen"), updateMemory: ({ memory, event }) => mergeBySeq(memory, [event.message]) },
            { target: "self" },
          ],
          Missed: { target: "self", actions: [catchUp.fetch(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }))] },
          SignedOut: S.SIGNED_OUT,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
          Send: {
            target: "self",
            guard: ({ activities }) => activities.feed?.connection === "Open" || deny("Offline"),
            updateMemory: ({ memory, event }) => ({ outbox: [...memory.outbox, { clientId: event.clientId, text: event.text, status: "sending" }] }),
            actions: [post],
          },
        },
      },
      LOST: {
        schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
        on: { RetryFeed: S.LIVE },
      },
      SIGNED_OUT: {},
      OFFLINE: {},
    },
  }
})

// views
const live = useView(room, (s) => s.activities.feed?.connection === "Open")
const sending = useView(room, (s) => s.calls.Chat.post.find((l) => l.key.clientId === clientId)?.pending ?? false)
```

**After:**

```ts
// room.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Chat, Message } from "./chat.contracts"                               // RENAMED file

export const Outgoing = Schema.Struct({ clientId: Schema.String, text: Schema.String, status: Schema.Literals(["sending", "failed", "unsure"]) })

export const Room = definition({
  id: "Chat/Room",
  states: ["LIVE", "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { clientId: Schema.String, text: Schema.String }, Resend: { clientId: Schema.String } },
  internalEvents: {
    Message: { message: Message },
    Missed: { reason: Schema.String, after: Schema.Number },
    CaughtUp: { messages: Schema.Array(Message) }, CatchUpFailed: {},
    SignedOut: {}, FeedLost: {}, RetryFeed: {},
    Posted: { clientId: Schema.String },
    PostFailed: { clientId: Schema.String },
    PostUnsure: Flow.uncertain({ clientId: Schema.String }),                    // CHANGED: no resends
  },
  memory: {
    roomId: Flow.input(Schema.String),
    messages: Flow.initial(Schema.Array(Message), []),
    lastSeq: Flow.initial(Schema.Number, 0),
    feedTries: Flow.initial(Schema.Int, 0),
    outbox: Flow.initial(Schema.Array(Outgoing), []),
  },
  operations: ({ E }) => ({                                                     // existing keyword, NEW MEANING
    feed: Chat.messages.outcomes({                                              // a stream: live by nature
      value: E.Message.from((m) => ({ message: m })),
      gap: E.Missed.from((r, { input }) => ({ reason: r._tag, after: input.after })),   // RENAMED (OD12): mapper { params } → { input }
      failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
    }),
    catchUp: Chat.since.outcomes({                                              // maps success: looked up (S11); a newer catch-up releases an older one (3.8.2)
      success: E.CaughtUp.from((v) => ({ messages: v })),
      failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
    }),
    post: Chat.post.outcomes({                                                  // one lane per message (the contract's key)
      success: E.Posted.from((_v, { key }) => ({ clientId: key.clientId })),
      failure: { Refused: E.PostFailed.from((_r, { key }) => ({ clientId: key.clientId })), NotSent: E.PostFailed.from((_r, { key }) => ({ clientId: key.clientId })) },
      unknown: E.PostUnsure.from((_r, { key }) => ({ clientId: key.clientId })),
    }),
  }),
})
```

```ts
// room.machine.ts
import { deny, machine } from "flow-state"
import { Duration } from "effect"
import { Room } from "./room.definition"

type Memory = typeof Room.Memory.Type
const hasSeq = (m: Memory, seq: number) => m.messages.some((x) => x.seq === seq)
const mergeBySeq = (m: Memory, incoming: ReadonlyArray<Memory["messages"][number]>) => {
  const all = [...m.messages, ...incoming.filter((x) => !hasSeq(m, x.seq))].sort((a, b) => a.seq - b.seq)
  return { messages: all, lastSeq: all.length === 0 ? m.lastSeq : all[all.length - 1].seq }
}
const mark = (m: Memory, clientId: string, status: "sending" | "failed" | "unsure") => ({ outbox: m.outbox.map((o) => (o.clientId === clientId ? { ...o, status } : o)) })
const unqueue = (m: Memory, clientId: string) => ({ outbox: m.outbox.filter((o) => o.clientId !== clientId) })

export const RoomMachine = machine(Room, ({ S, E, O }) => {                      // O: NEW MEANING
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => mergeBySeq(memory, event.messages) },
      CatchUpFailed: { target: "self" },
      Posted: { target: "self", updateMemory: ({ memory, event }) => unqueue(memory, event.clientId) },
      PostFailed: { target: "self", updateMemory: ({ memory, event }) => mark(memory, event.clientId, "failed") },
      PostUnsure: [
        { target: "self", guard: [O.post.retryable({ times: 3 })], actions: [O.post.retry] },   // NEW: retryable (OD1); no key: this ending's Attempt (OD4)
        { target: "self", updateMemory: ({ memory, event }) => mark(memory, event.clientId, "unsure") },
      ],
      Resend: [
        { target: "self", guard: ({ memory, event }) => memory.outbox.some((o) => o.clientId === event.clientId && o.status === "unsure") || deny("NotUnsure"), updateMemory: ({ memory, event }) => mark(memory, event.clientId, "sending"), actions: [O.post.retry(({ event }) => event)] },   // R4 L4: an unconfirmed post is re-sent with its own id; this ends the hold (OD6)
        {
        target: "self",
        guard: [({ memory, event }) => memory.outbox.some((o) => o.clientId === event.clientId && o.status === "failed") || deny("NotFailed"), O.post.idle(({ event }) => event)],   // a user event names the message: it carries `clientId` (OD4)
        updateMemory: ({ memory, event }) => mark(memory, event.clientId, "sending"),
        actions: [O.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: event.clientId, text: memory.outbox.find((o) => o.clientId === event.clientId)?.text ?? "" }))],
        },
      ],
    },
    states: {
      LIVE: {
        activities: [O.feed.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }))],   // existing: subscribe (the stream's own function name)
        on: {
          Message: [
            { target: "self", guard: ({ memory, event }) => !hasSeq(memory, event.message.seq) || deny("Seen"), updateMemory: ({ memory, event }) => mergeBySeq(memory, [event.message]) },
            { target: "self" },
          ],
          Missed: { target: "self", actions: [O.catchUp.lookup(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq }))] },
          SignedOut: S.SIGNED_OUT,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
          Send: {
            target: "self",
            guard: ({ operations }) => operations.feed?.connection === "Open" || deny("Offline"),
            updateMemory: ({ memory, event }) => ({ outbox: [...memory.outbox, { clientId: event.clientId, text: event.text, status: "sending" }] }),
            actions: [O.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: event.clientId, text: event.text }))],   // the key comes from the input
          },
        },
      },
      LOST: {
        schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
        on: { RetryFeed: S.LIVE },
      },
      SIGNED_OUT: {},
      OFFLINE: {},
    },
  }
})
```

```tsx
// Room.tsx
const live = useView(room, (s) => s.operations.feed?.connection === "Open")     // undefined while not placed
const outbox = useView(room, (s) => s.memory.outbox)                            // the status the handlers wrote: no lane read needed
{outbox.map((o) => <Bubble key={o.clientId} text={o.text} sending={o.status === "sending"} failed={o.status === "failed"} unsure={o.status === "unsure"} onRetry={() => room.send(E.Resend({ clientId: o.clientId }))} />)}   // R4 L4: unsure is shown and retryable
```

**Added:** three operations, `retryable({ times })`, `input` in the gap mapper (was `params`, OD12). **Kept:** `commit`, `lookup` and
`subscribe` (M6's own verbs), now on the operations. **Dropped:** the `activities` record, `O.Chat.*`, the `outcomes`
options, `laneKey`, `resends`, the `find` in the view. M6 7.1's walk and Story change only their reads.

### 5.5 Size, and where one call is written

| Case | Definition | Machine | View | Net |
| --- | --- | --- | --- | --- |
| Checkout (5.1) | +22 | -22 | 0 | 0 |
| Sign-in (5.2) | +16 | -20 | 0 | -4 |
| Issues list (5.3) | +23 | -23 | +1 | +1 |
| Chat room (5.4) | +12 | -13 | 0 | -1 |

R2 found operations take 42–47% of a definition and read well up to three to five operations. Definitions grow by
the mappings that leave the machine; totals stay even. Three places per call stay on purpose: the contract (how, and
which thing), the operation (what results mean here), the commit, lookup or placement (when, with what input). Mappings beside the
contract, imported, would need events in a module of their own (a circular type otherwise); not now (decided, OD17, Q16).

### 5.6 Rule by rule, decision by decision

Dispositions: **R** rewrite, **S** small edit, **D** deleted, **A** added.

**MD rules.**

| Item | Disp | What |
| --- | --- | --- |
| 1 Typing bullet | S | a commit's or lookup's select is written in, and typed by, its transition |
| 2 last paragraph | S | the host maps results in its definition's `operations` |
| 9 fillings revision paragraph | R | copies own no lanes; `SharedCopyLane` and the Attempt's copy key go |
| 9 incarnations sentence | S | item 15 reference goes |
| 13 | R | "a commit value maps" → "an operation's `outcomes` maps"; context `key` (the lane's contract key) replaces `laneKey`; `superseded` goes |
| 14 | S | "a commit, lookup or retry of an operation" |
| 16 | S | `O.pay.idle(k?)` |
| 17 | R | every commit and lookup ends once; a replaced `latest` Attempt and a released one-off lookup end as evidence only, by a rule per kind (S5) |
| 20 | S | read per operation; bare writes exempt (S10) |
| 21 | R | write lanes per (actor, operation, key), created by work; one-off reads one lane per operation; live per placement (S3) |
| 22 | S | key selects stay (they now select a lane of an operation) |
| 23 | R | keyed activities become `subscribe.each` placements; `restartOn` per key; keys are records and `keys` may read `operations` (3.12, S14) |
| 24 | S | `cancel` acts on the addressable Attempt (interrupts or releases it), then the waiting commit is sent; a never-sent one it ends gets `NotSent { why: "Cancelled" }` (OD7, S7a) |
| 21 addendum | R | a retained unknown holds its lane under `latest` and `reject`; the addressable Attempt is the oldest unresolved sent one (OD5) |
| N1 | S | keyed operations publish a keyed list and `get(s, key)` |
| N2 | S | "its own key" (unchanged wording; the key is the contract's) |
| N3 | S | a declared unkeyed operation always has a row; a keyed one has the idle row by `get` |
| S1–S13 | A | 3.13 |

**MD sections.** 2.1 (S); 2.2 line 292 (S); 2.3 "Running I/O" row (R), shared guard (S); 2.5 (S); 2.6 (S); 2.7 intro
(S); 2.7.2 (S: rows for key, copy key, `laneKey`); 2.7.3 member table (R), "Keys are optional" (S: required under
`latest` and `cancel`), "Lanes belong to the transaction and key" (R: to the operation and key); 2.7.4 (S); 2.7.5 (R);
2.7.6 (S); 2.7.7 (S); 2.7.8 (R: superseded results not delivered); 2.7.9 (R: a one-off read operation has one lane and delivers its latest lookup);
2.7.10 keyed activities (R: `subscribe.each`); 2.7.11 (S); 2.7.12 (S); 3.1 (R); 3.2 (S); 3.4 pin (S: `idle(key)` spelling); 3.6
(S); section 4 rows (S ×6); section 5 Machines O1 (R), O1 typing (S), O4 (S), O6 (A), O8 (S), Persistence O2 (R),
CommandLine O5 (S), C5 (R), C6 (S), C7 (S), C8 (R), C10 (R), C11 (S), C12 (S), C17 (S), C18 (R), C19 (R), C20 (D);
section 7 items 0 (S), 6 (D), 15 (D); "Changes after review" (S).

**MD decisions.**

| Decision | Disp | What happens |
| --- | --- | --- |
| D1 | S | the mapping moves to the definition; "a `calls` definition category" partly reversed |
| D4 | R | the operation is the handle, used through `O` |
| D5, D6 | S | spellings |
| D7 keys optional | S | optional, but required under `latest` and `cancel` |
| D9 | R | one write operation per contract: a declaration error otherwise |
| D11 | R | lanes are removed when they hold nothing; `get` returns the idle row |
| D18 | R | `s.operations` and `O.x.get(s, key)` |
| D19 | R | an absent keyed lane reads idle through `get` (true for lanes by work) |
| D20 | S | starter clause goes |
| D21 | D | moot |

**Change count per document** (re-run for revision 3; not re-run for revision 4, which lowers it: MD, M3, M4 and M6
keep `commit`, `lookup` and `subscribe`, so the edits that renamed them to `start` and `params` go, and MD 2.7.3 and
2.7.9 gain per-kind wording).

| Doc | Rewrite | Small | Deleted | Added | Total |
| --- | --- | --- | --- | --- | --- |
| MD | 26 | 50 | 4 | 11 (S1–S10, Machines O6 row; revision 4 adds S11–S13) | 91 |
| M3 | 5 (3.6 entries and lanes, 3.14, rule 17, Q21, Q40) | 9 | 0 | 0 | 14 |
| M4 | 3 (3.1, section 2's view, E17) | 9 (rule 31, E2/E7, E10 wording, 3.4's `latest` superseded handling, glossary) | 1 (6.4) | 0 | 13 |
| M5 | 0 | 4 | 0 | 0 | 4 |
| M6 | 5 (4.3.1, rule 47 and placements, 7.1, 7.5, M6-D7) | 17 | 0 | 0 | 22 |
| AU | 0 | 1 | 0 | 0 | 1 |
| **All** | **39** | **90** | **5** | **11** | **145** |

Plans (through MD section 5): Operations O1 (`key` required under `latest`/`cancel`), O2 (a one-off read operation
has one lane and delivers its latest lookup; `cancel` on it), O3, O4, O6, O7; Machines O1, O4, O6, O8; Testing O3; Persistence O2, O4; Inspection O1; CommandLine
O5; React: about 16 outcome rows. DD: four files. Revision 2 counted 164; revision 3 keeps transaction keys and M4's
rule 34, so M4, M5 and Operations O1 change less.

Revision 5 adds, not re-counted: Operations O1 (`key(params)` becomes a field list, for every kind), O3 (the hold;
the addressable Attempt; `cancel` concurrency's interrupted Attempt is evidence only), O7 (`cancel` releases a
retained unknown); M4 rule 34 (the primary-key default, checked at the operation), rule 30 (the actor lane holds as
the record queue does; unchanged text), rule 32 (unchanged: under the hold a later write from the same lane cannot
clear a mark the actor still retries); M6 4.1.1 (`key: ["roomId"]`); MD rule 23 (key records); Persistence O6 (a
restored unknown holds its lane).

### 5.7 Every write example against the write-lane table (revision 7)

Each walk names the table's cells (3.8.1) in order. Code changes in revision 7 are only in 5.2, 8.2's comment and
9.6; everything else already matched the table.

| Case | Walk | `UnresolvedHold` |
| --- | --- | --- |
| 5.1 checkout | `Pay`: `Idle` → `InFlight`. unknown → `Held` (`Unsure` → UNSURE). `CheckTick`: `retryable` passes in `Held` → `retry` → `InFlight` → success → `Idle` → DONE. `TookTooLong`: `cancel` in `InFlight` interrupts → `unknown { Cancelled }` → `Held` → UNSURE re-sends the same id (R4 L3's wasted step is gone). READING's `answered`: `pay.cancel` in `Held` releases; `challenge.cancel` in `Idle` does nothing. `Pay` while `Held`: `idle` denies `Uncertain`. | passes; `Leave` → LEFT passes (no `pay` commit reachable), where revision 6 warned |
| 5.2 sign-in | verify unknown → `Held`; `CodeUnchecked` re-sends twice, then releases → ENTERING; `Submit`'s `idle` passes in `Idle`. resend unknown → `Held` → `ResendUnsure` releases. | passes; revision 5's version (no release) is now an error, because `Submit` is guarded by `verify.idle` (3.8.1 rule 2) |
| 5.3 Issues | like unknown → `Held` (`uncertain`; the reconcile key appears) → `ReconcileLike` `retry` → `InFlight` (`uncertain` false, key leaves) → unknown → `Held` (key re-appears, timer re-armed) ... after 3, `LikeUnsure`'s fallback cancels → `Idle` → the waiting unlike is promoted (R5 H2 closed). `RenameUnsure`, `RemoveUnsure`: `cancel` in `Held` → promote. `CreateUnsure`: re-send, or the user's `Retry` names the draft. | passes (the reconcile schedule is reachable, and its fallback cancels) |
| 8.1 uploads | `Cancel`: `put.cancel(event)` in `InFlight` interrupts → `UploadUnsure` in `Held`: key-less `put.cancel` now releases a real retained unknown (it was a no-op in revision 6) and `clean` is committed. `CleanUnsure`: re-send ×5, then release. | passes |
| 8.2 editor | see 8.2's revision 7 walk: `CloseAnyway` in `InFlight` → `Held` → re-send → `Idle` → "ABC" promoted. `Loaded`'s `idle` guard denies in `InFlight`, `Held` and with `W`. | passes; CLOSED is terminal for `save` |
| 8.4 todos | `DoneUnsure`, `RenameUnsure`, `RemoveUnsure`: release in `Held` → promote. `ClearUnsure` (unkeyed) releases `clear` only. `AddUnsure`: re-send ×3, then release. | passes |
| 9.2 saved card | `SaveUnsure` (`reject`, unkeyed): `cancel` in `Held` → `Idle`; the next `SaveCard`'s `idle` passes. `pay` as 5.1. | passes |
| 9.3 workspace | per document, as 8.2. `RetrySave` (user event, named key): `Held` → `InFlight`; `InFlight` → evidence `InFlight`; `Idle` → evidence `NothingToResend`. | passes |
| 9.4 kanban | `MoveUnsure`: re-send ×3 (`InFlight` each), then `cancel` in `Held` → the next drag in `W` is promoted. `LabelUnsure` the same. `RebalanceUnsure`: release, then refetch. | passes |
| 9.6 wizard | see 9.6. | passes |

## 6. What it fixes

The audit's cells (AU 2.5), as verified by R1: of 14 wrong cells, **5** become defined by construction (rows 3, 4,
the copy half of row 7, 16, 47), 8 were already fixed by N2 and are re-expressed, 1 is unaffected (row 35). Of 20
undefined cells, **5** become defined (rows 11, 12, 16, 41 (string `.each` keys against record keys: now the
contract's record key) and 47), 6 were already fixed and are re-expressed (8 ×2, 9, 17 ×2, 27), 9 are unaffected.
Revision 3 also fixes R2's six high findings (C-H1–H3, A-H1–H4), none of which the audit listed. Revision 4 fixes
R3's H4 and M3 (one lane per one-off read operation) and hidden modes (a) and (b). Revision 5 fixes R3's H1, H2, H3,
M1, M2 (OD5) and M4, M5 (OD4), and reduces M7; review 3's mode (c) is gone.

| Bug | After revision 5 |
| --- | --- |
| Keyed lookups in views | `s.operations.pay.pending`; `O.like.get(s, issue)`: the item the view renders, typed by the key's fields, total, no `find`, no `?? false` |
| Wrong-write retries (F1, R2 C-H2) | N2 at one lane, and replaced `latest` work is never delivered, and an unknown holds its lane, so `retry` in a handler acts on that ending's Attempt, with no key; under `cancel` concurrency an interrupted Attempt is evidence only (OD5, R3 H3) |
| `.each` copies sharing a lane | copies own no lanes |
| Two uses of one operation colliding | one write operation per contract (an error otherwise) |
| Never-started reads | an unkeyed write always has a row; `get` returns the idle row for a write key, which is true for lanes by work; a one-off read row is `undefined` until its first lookup |
| Select typed outside its transition | the select is written at the commit or lookup |
| Where commit values live | the definition |
| Per-field autosave drops an edit (R2 C-H1) | one lane per field: the contract's key |
| Out-of-order search results (R2 A-H2) | a one-off read operation delivers its latest lookup |
| Old hits under a cleared search box (R3 H4) | `O.results.cancel`, no key: one lane per one-off read operation |
| A late "A" overwrites the saved "AB" (R3 H1) | "AB" waits while "A" is unknown; `retry` with "A"'s id settles it first (8.2) |
| A replaced save's version 5 is lost (R3 H2) | sent Attempts are always delivered |
| A second charge after `UNSURE` (R3 M1) | the unknown holds `pay`'s `reject` lane |
| Mirrored id list for a reconcile schedule (R3 M2) | `uncertain` on the row; `keys` read the lanes |
| `latest` domain writes fail the key check (R3 M4) | every write states its key (OD15) |
| A lazy tree loses node A's children (R3 M3) | per-thing reads are `subscribe.each`; one-off delivery, row and `cancel` share one lane |
| Deleting a `success` mapper silently turns a read live (R3 mode (a)) | the verb decides; a mismatch is `VerbMismatch` |

## 7. Breaks and creates

Status: **resolved**, **reduced**, **open** (a question in section 11), **accepted**, **withdrawn** (the concept that
caused it is gone).

| # | What | Status | Answer |
| --- | --- | --- | --- |
| B1 | D9 only a warning | resolved | one write operation per contract (S6) |
| B2 | per-row lanes needed an id list | resolved | lanes per key, by work |
| B3 | a member removed while busy | withdrawn | no membership |
| B4 | per-key behaviour became per-operation | resolved | lanes per (operation, key) |
| B5 | the K-rule | withdrawn | different keys are different lanes |
| B6 | names as persisted identity | resolved | (contract id, key) (S8) |
| B7 | `s.calls`, `s.activities` → `s.operations`; `activities` a list; `O` changes meaning | accepted | Q4; Q1 answered by OD3 |
| B8 | D1 partly reversed | open | Q20 |
| B9 | cache verbs need a home | resolved | contract-level values in `actions` (decided, OD17, Q17) |
| B10 | definitions grow | reduced | totals even (5.5) |
| B11 | per-start mappings | resolved | a second `commit`, and a memory flag (9.2); R3 M6's limit for concurrent keyed starts is noted in 3.6 |
| B12 | `DuplicatePlacement` is a construction error | reduced | token-disjoint `when` allowed |
| B13 | typing risk | open | builder fallback (4) |
| B14 | bulk starts ("like all selected") | open | unchanged gap (AU F13) |
| B15 | on-demand lanes for plain writes over server rows | resolved | lanes per key, by work (R2 C-H1) |
| B16 | `reject` per key | resolved | the contract's key (5.2) |
| B17 | stream mapper `params`; `key` meaning | resolved | `params` kept in the mapper context; `key` is the contract key of the call, which a lane is per only for writes (3.3) |
| B18 | per-start outcomes | resolved | as B11 |
| B19 | placements and `when` | resolved for tokens | closures cannot be checked |
| B20 | a removed member's unknown | withdrawn | no membership; a retained unknown stays until success, a newer start, or `cancel` (S7) |
| B21 | same-turn removal and drain | withdrawn | no draining |
| B22 | membership lag | withdrawn | no membership |
| B23 | one call across three places | accepted | by design (5.5) |
| B24 | transactions lose `key` (revision 2) | withdrawn | keys kept |
| B25 | `.each({ of: Entity })` required | withdrawn | M4 rule 34 supplies the key |
| B26 | `superseded:` required | withdrawn | replaced work is not delivered |
| B27 | the 64 cap | withdrawn | no cap; `cancel` releases |
| B28 | joined operations' starter | withdrawn | `.joins` removed |
| B29 | `outcomes` → `.emits` | withdrawn | `outcomes` kept |
| B30 | a plain `latest` write's replaced unknown is not delivered; it may land after the newer one unseen | resolved | OD5: sent Attempts are delivered and an unknown holds its lane; only a write released with `cancel` may still land unseen (`If-Match` is the optional layer, 3.8.1) |
| B31 | MD 2.7.9's "two fetches, two endings" and OPS O2's "each finite lookup settles once" are replaced for lookups through one operation: it delivers the latest lookup | accepted | two independent reads are two operations or a `subscribe.each` placement (3.8.2) |
| B32 | views of keyed operations call `O.x.get(s, key)` (a function over the snapshot, like `Entity.get`, and OPS O6's `descriptor.get`) | accepted | Q8 |
| B33 | `latest` and `cancel` writes without a key become type errors | resolved | OD15: every write states `key`; was: checked at the operation, after the entity's primary-key default |
| B34 | a bare write's failures and unknowns are evidence only, not issues | resolved | decided (OD9, Q7) |
| B35 | `restartOn` per key, and `armOn` banned, on keyed schedules (Machines O5) | accepted | 3.12 |
| B36 | **new in revision 4**: revision 3's `start` and `params` are dropped; `commit`, `lookup`, `subscribe` stay as the design has them (OD2) | resolved | decided; M3, M4, M6 and every case keep their verbs, so fewer edits than revision 3 |
| B37 | **new**: `retryable(n, k?)` becomes `retryable({ times })` / `retryable(k, { times })` (OD1) | resolved | decided |
| B38 | **new**: a resource operation uses one verb, which must agree with its mapping (`VerbMismatch`, S11) | resolved | decided (OD9, Q23) |
| B39 | **new**: a one-off read row is OPS O6's resource lane, not `{ pending }` (S12); "my lookup is running" reads `_tag` | resolved | decided (OD9, Q21) |
| B40 | **new**: `cancel` on a one-off read (S13); OPS O7's "resources have no cancel action" gains "except an operation's own wait" | resolved | decided (OD9, Q23) |
| B41 | **new**: one-off read lanes are not persisted; a state waiting for a lookup must look up again after restore | resolved | decided (OD9, Q26) |
| B42 | **new**: per-thing one-off reads (a lazy tree) must be `subscribe.each` or separate operations | accepted | follows from one lane per one-off read operation (3.3) |
| B43 | **new in revision 5**: every contract's `key` becomes a field list; derived or nested keys need the input reshaped (OPS O1's `key(params)` projector goes) | accepted | decided (OD4); every contract in OPS, M3, M4, M6 and DD gains a one-line edit |
| B44 | **new**: M4 rule 34's `.predicts` default becomes the entity's primary key; an input that names the record differently (`cardId`) needs a declared key or a reshaped input | withdrawn | OD15: no domain default; every write states `key` |
| B45 | **new**: a resource's or stream's key has no Schema (no `input` in OPS O1) | resolved | OD12: every kind has `input`; the key Schema is its pick |
| B46 | **new**: a write that ends unknown holds newer writes on its key; a machine that settles it by a read must `cancel` it (5.1); a stuck unknown blocks the lane until retried or released | accepted | decided (OD5); the UI shows `uncertain` (8.2, 9.3) |
| B47 | **new**: revision 5's "`cancel` empties its lane"; `idle` denies `Uncertain`, `serialize` holds and `allow` does not | resolved in part | OD7: `cancel` acts on one Attempt and the waiting commit is sent; the rest open, Q28 |
| B48 | **new**: key-less members outside their operation's ending are `KeyRequired`; keyed schedules use key records and may read `operations` (MD rule 23) | resolved in part | OD8 decides `KeyRequired`; schedules open, Q29 |
| B49 | **new in revision 6**: `flow check` errors `UnresolvedHold`; every unknown handler of a holding write must retry or cancel, or reach a transition that does (OD6) | accepted | decided; 5.2, 8.4, 9.2, 9.4 and 8.1 gain a `cancel`; 5.4 gains an unsure resend |
| B50 | **new**: the write row gains `waiting` (OD6) | accepted | decided |
| B51 | **new**: an event shared by several keyed operations whose handler acts on lanes is split per operation (OD8) | accepted | decided; 5.3, 8.4 |
| B52 | **new**: a write on a holding policy that maps anything must map `unknown` (`UnmappedUnknown`) | withdrawn | folded into `UnresolvedHold`'s first case (revision 7, R5 audit) |
| B53 | **new**: a one-off read operation holds its entry until the next lookup or `cancel`; mapped ending events may not be raised or scheduled; Stories use `Story.ending` | open | Q33 |
| B54 | **new**: the domain default's entity is not readable by tools (R4 M3) | withdrawn | OD15: no domain default, so no entity to read |
| B55 | **new**: the hold orders one actor's writes only (two tabs); `If-Match` refuses waiting writes unless the version is read at send time | open | Q31, Q32 |
| B56 | **new**: independent writes one at a time cannot be declared; a memory queue does it | accepted | stated cut, for `revisit.md` (R4 M6) |
| B57 | **new in revision 7**: the write lane is one state machine; every write sentence elsewhere reads it (3.8.1) | accepted | decided (OD10); MD 2.7.3, 2.7.8 and rules 16, 21, 24 are rewritten against it |
| B58 | **new**: `pending` means `InFlight` only, not "a waiting start" (NEW MEANING against MD rule 21) | accepted | decided with the flags (OD10); a view that showed "saving" for waiting work reads `pending \|\| waiting` |
| B59 | **new**: an interrupted Attempt is `Held` like any unknown; a user-facing stop no longer sends the next write at once | accepted | closes R5 H1; a stop on a `latest` lane costs one re-send before the newest write goes |
| B60 | **new**: a failed Attempt is resolved and cannot be re-sent; commit anew (amends MD rule 21) | accepted | R5 L5 |
| B61 | **new**: under `serialize` the head is addressable (`retry`, `retryable`, `retryCount`; amends MD N2); `cancel` and `allow` do not hold | open | Q28 |
| B62 | **new**: the one-off row carries its entry's `key`; a partial-key `idle` covers every lane of a draft | open | Q33, Q34 |
| B63 | **new**: `basedOn` rebases across the lane's own writes only | open | Q32 |
| B64 | **new**: `outcomes` map only `internalEvents`; a mapped event is never sent by a view, a schedule or `raise` | accepted | S15 (R5 L3); no case does it |
| B65 | **new in revision 8**: every contract kind has exactly `input` and `output` (`result` renamed; resources and streams gain `input`; no `params`; mapper `{ params }` → `{ input }`) | accepted | decided (OD12, OD14); every contract in OPS, M3, M4, M6, DD and this proposal gains a line or a rename |
| B66 | **new**: `key` required on resources and transactions, `[]` for one; domain writes state theirs | accepted | decided (OD15); streams proposed the same (Q38) |
| B67 | **new**: a write lane's cells apply in step 5 in action order; queued commits are promoted at once; `keys` and published rows read after lanes | accepted | decided (OD16); MD 2.5 step 5 amended (3.8.1's list) |
| B68 | **new**: `UnresolvedHold`'s terminal pass only under `reject`; every owner behind `retryable` needs a later alternative | accepted | decided (OD16); 8.2 gains CLOSED's release |
| B69 | **new**: a write's success clears a record's marks only of Attempts whose lanes are resolved or released (merge 4 rule 32) | open | proposed (R6 M6); part of Q28 |
| B70 | **new**: the `basedOn` rebase is scoped to domain writes; plain transactions compare versions themselves | open | Q32 |
| B71 | **new**: per-item stops on a `serialize` queue cannot be written; `unknown` by tag; `progress` and void `output` against "exactly two schemas"; a stream's key | open | Q35, Q36, Q37, Q38 |
| B72 | **new**: work over a dynamic set of keys in one turn has no member; a bulk contract is the pattern | accepted | stated cut, for `revisit.md` (R6 M9) |

Totals: 72 breaks. 21 resolved (B1, B2, B4, B6, B9, B11, B15–B19, B30, B33, B34, B36–B41, B45), 2 resolved in part
(B47, B48), 2 reduced (B10, B12), 11 open (B8, B13, B14, B53, B55, B61, B62, B63, B69, B70, B71), 22
accepted (B7, B23, B31, B32, B35, B42, B43, B46, B49–B51, B56–B60, B64–B68, B72), 14 withdrawn with the concept that
caused them (B3, B5, B20–B22, B24–B29, B44, B52, B54). "Accepted" means the proposal accepts the cost; the owner has not.

## 8. R1's five authoring apps, revision 4

### 8.1 Upload with progress and cancel

```ts
// uploads.contracts.ts
import { Context, Effect, Schema, Stream } from "effect"
import { Outcome, transaction } from "flow-state"

export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}
export class TooLarge extends Schema.TaggedError<TooLarge>()("TooLarge", { limit: Schema.Number }) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

// The XHR adapter: xhr.upload.onprogress becomes Progress elements; load becomes Done; error and abort fail NoResponse.
// It reads the File from its own registry by ref, so a File never enters memory.
export class UploadApi extends Context.Service<UploadApi, {
  put(p: { ref: string; folderId: string }, o: { idempotencyKey: string; signal: AbortSignal }): Stream.Stream<{ _tag: "Progress"; loaded: number; total: number | null } | { _tag: "Done"; status: number; fileId?: string }, NoResponse>
  discard(p: { ref: string; uploadKey: string }, o: { signal: AbortSignal }): Effect.Effect<{ status: number }, NoResponse>
}>()("files/UploadApi") {}

export const Uploads = {
  put: transaction({
    id: "files/put",
    input: Schema.Struct({ ref: Schema.String, folderId: Schema.String }),
    output: { fileId: Schema.String },
    progress: Schema.Struct({ loaded: Schema.Number, total: Schema.NullOr(Schema.Number) }),
    key: ["ref"],                                                              // NEW MEANING (OD4): key is a field list; one lane per picked file
    concurrency: "reject",
    commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {
      let done: { status: number; fileId?: string } | undefined
      yield* UploadApi.use((u) => u.put(input, { idempotencyKey: attempt.id, signal })).pipe(
        Stream.runForEach((e) => (e._tag === "Progress" ? progress({ loaded: e.loaded, total: e.total }) : Effect.sync(() => { done = e }))),
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (done === undefined) return yield* Outcome.unknown(new ServerError({ status: 0 }))
      if (done.status === 201 && done.fileId !== undefined) return { fileId: done.fileId }
      if (done.status === 413) return yield* Outcome.failure(new TooLarge({ limit: 100_000_000 }))
      if (done.status >= 500) return yield* Outcome.unknown(new ServerError({ status: done.status }))
      return yield* Outcome.failure(new Refused({ status: done.status }))
    }),
  }),
  discard: transaction({                                                        // a tombstone by the upload's Attempt id (MD 2.7.7)
    id: "files/discard",
    input: Schema.Struct({ ref: Schema.String, uploadKey: Schema.String }),
    key: ["ref"],
    concurrency: "reject",
    commit: (input, { signal }) => Effect.gen(function* () {
      const res = yield* UploadApi.use((u) => u.discard(input, { signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 204 || res.status === 404) return
      return yield* Outcome.unknown(new ServerError({ status: res.status }))
    }),
  }),
}
```

```ts
// files.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Uploads } from "./uploads.contracts"

export const Upload = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  status: Schema.Literals(["sending", "done", "failed", "cleaning", "unsure"]),
  message: Schema.NullOr(Schema.String),
})

export const Files = definition({
  id: "Files/Uploads",
  states: ["READY"],
  events: { Picked: { ref: Schema.String, name: Schema.String }, Cancel: { ref: Schema.String }, Dismiss: { ref: Schema.String } },
  internalEvents: {
    Uploaded: { ref: Schema.String },
    UploadFailed: { ref: Schema.String, message: Schema.String },
    UploadUnsure: Flow.uncertain({ ref: Schema.String, uploadKey: Schema.String }),
    Cleaned: { ref: Schema.String },
    CleanUnsure: Flow.uncertain({ ref: Schema.String }),
  },
  memory: {
    folderId: Flow.input(Schema.String),
    uploads: Flow.initial(Schema.Array(Upload), []),                            // workflow: what the user picked
  },
  operations: ({ E }) => ({
    put: Uploads.put.outcomes({
      success: E.Uploaded.from((_v, { key }) => ({ ref: key.ref })),
      failure: {
        TooLarge: E.UploadFailed.from((r, { key }) => ({ ref: key.ref, message: `Larger than ${r.limit} bytes` })),
        Refused: E.UploadFailed.from((r, { key }) => ({ ref: key.ref, message: `Refused (${r.status})` })),
        NotSent: E.UploadFailed.from((_r, { key }) => ({ ref: key.ref, message: "Not sent" })),
      },
      unknown: E.UploadUnsure.from((_r, { key, attempt }) => ({ ref: key.ref, uploadKey: attempt.id })),   // Cancelled after invocation arrives here
    }),
    clean: Uploads.discard.outcomes({
      success: E.Cleaned.from((_v, { key }) => ({ ref: key.ref })),
      failure: { NotSent: E.CleanUnsure.from((_r, { key }) => ({ ref: key.ref })) },
      unknown: E.CleanUnsure.from((_r, { key }) => ({ ref: key.ref })),
    }),
  }),
})
```

```ts
// files.machine.ts
import { deny, machine } from "flow-state"
import { Files } from "./files.definition"

type Memory = typeof Files.Memory.Type
const set = (m: Memory, ref: string, patch: Partial<Memory["uploads"][number]>) => ({ uploads: m.uploads.map((u) => (u.ref === ref ? { ...u, ...patch } : u)) })
const drop = (m: Memory, ref: string) => ({ uploads: m.uploads.filter((u) => u.ref !== ref) })

export const FilesMachine = machine(Files, ({ S, O }) => {
  return {
    default: S.READY,
    on: {
      Picked: {
        target: "self",
        guard: ({ memory, event }) => !memory.uploads.some((u) => u.ref === event.ref) || deny("AlreadyPicked"),
        updateMemory: ({ memory, event }) => ({ uploads: [...memory.uploads, { ref: event.ref, name: event.name, status: "sending", message: null }] }),
        actions: [O.put.commit(({ memory, event }) => ({ ref: event.ref, folderId: memory.folderId }))],   // the key comes from the input
      },
      Cancel: { target: "self", guard: ({ memory, event }) => memory.uploads.some((u) => u.ref === event.ref && u.status === "sending") || deny("NotSending"), actions: [O.put.cancel(({ event }) => event)] },   // a user event names the file (OD4)
      Uploaded: { target: "self", updateMemory: ({ memory, event }) => set(memory, event.ref, { status: "done" }) },
      UploadFailed: { target: "self", updateMemory: ({ memory, event }) => set(memory, event.ref, { status: "failed", message: event.message }) },
      UploadUnsure: { target: "self", updateMemory: ({ memory, event }) => set(memory, event.ref, { status: "cleaning" }), actions: [O.put.cancel, O.clean.commit(({ event }) => ({ ref: event.ref, uploadKey: event.uploadKey }))] },   // an ending: cancel with no key releases this upload's unknown (OD4, OD5); the tombstone takes over
      Cleaned: { target: "self", updateMemory: ({ memory, event }) => drop(memory, event.ref) },
      CleanUnsure: [
        { target: "self", guard: [O.clean.retryable({ times: 5 })], actions: [O.clean.retry] },   // an ending: no key (OD4)
        { target: "self", updateMemory: ({ memory, event }) => set(memory, event.ref, { status: "unsure", message: "We couldn't confirm the upload was discarded." }), actions: [O.clean.cancel] },   // give up: release, so Dismiss's idle guard passes (OD5)
      ],
      Dismiss: { target: "self", guard: [O.put.idle(({ event }) => event), O.clean.idle(({ event }) => event)], updateMemory: ({ memory, event }) => drop(memory, event.ref) },
    },
    states: { READY: {} },
  }
})
```

```tsx
// UploadList.tsx
const { O } = Files
const uploads = useView(files, (s) => s.memory.uploads)
{uploads.map((u) => <UploadRow key={u.ref} upload={u} />)}
// UploadRow.tsx
const lane = useView(files, (s) => O.put.get(s, upload))                        // the item it renders carries `ref` (OD4); { pending, uncertain, retryCount, progress }
<UploadBar name={upload.name} loaded={lane.progress?.loaded ?? 0} total={lane.progress?.total ?? null} status={upload.status} onCancel={lane.pending ? () => files.send(E.Cancel({ ref: upload.ref })) : undefined} />
```

### 8.2 Autosave editor (one document per actor)

```ts
// docs.contracts.ts
import { Context, Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"

export const Doc = Schema.Struct({ id: Schema.String, text: Schema.String, version: Schema.Int })
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class LoadFailed extends Schema.TaggedError<LoadFailed>()("LoadFailed", { status: Schema.Number }) {}

export class DocsApi extends Context.Service<DocsApi, {
  get(p: { docId: string }, o: { signal: AbortSignal }): Effect.Effect<{ status: number; doc?: typeof Doc.Type }, NoResponse>
  put(p: { docId: string; text: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; version: number }, NoResponse>
}>()("docs/DocsApi") {}

export const Docs = {
  doc: resource({
    id: "docs/doc", input: { docId: Schema.String }, output: Doc, key: ["docId"], staleTime: "1 minute", gcTime: "5 minutes",   // OD12: input/output on every kind
    lookup: (input, { signal }) => Effect.gen(function* () {
      const res = yield* DocsApi.use((a) => a.get(input, { signal })).pipe(Effect.mapError(() => new LoadFailed({ status: 0 })))
      if (res.doc === undefined) return yield* new LoadFailed({ status: res.status })
      return res.doc
    }),
  }),
  save: transaction({
    id: "docs/save", input: { docId: Schema.String, text: Schema.String }, output: { version: Schema.Int },   // OD14: fields records
    key: ["docId"],                                                            // required: latest is "newest per document"; NEW MEANING (OD4): key is a field list
    concurrency: "latest",
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const res = yield* DocsApi.use((a) => a.put(input, { idempotencyKey: attempt.id, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 200) return { version: res.version }
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Refused({ status: res.status }))
    }),
  }),
}
```

```ts
// editor.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Docs } from "./docs.contracts"

export const Editor = definition({
  id: "Docs/Editor",
  states: ["LOADING", "EDITING", "CLOSED"],
  events: { Typed: { text: Schema.String }, SaveNow: {}, ForceSave: {}, RetrySave: {}, Close: {}, CloseAnyway: {} },   // user-defined, NEW events: ForceSave, RetrySave, CloseAnyway
  internalEvents: {
    Loaded: { text: Schema.String, version: Schema.Int },
    Saved: { version: Schema.Int },
    SaveFailed: { message: Schema.String },
    SaveUnsure: Flow.uncertain({}),
    AutosaveDue: {},
  },
  memory: {
    docId: Flow.input(Schema.String),
    draft: Flow.initial(Schema.String, ""),
    version: Flow.initial(Schema.Int, 0),
    dirty: Flow.initial(Schema.Boolean, false),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    doc: Docs.doc.outcomes({ value: E.Loaded.from((d) => ({ text: d.text, version: d.version })) }),   // maps value: the machine subscribes (S11)
    save: Docs.save.outcomes({                                                  // a sent save is always delivered; only a never-sent waiting save is replaced (3.8.1, OD5)
      success: E.Saved.from((v) => ({ version: v.version })),
      failure: { Refused: E.SaveFailed.from((r) => ({ message: `Refused (${r.status})` })), NotSent: E.SaveFailed.from((r) => ({ message: `Not sent (${r.why})` })) },
      unknown: E.SaveUnsure,
    }),
  }),
})
```

```ts
// editor.machine.ts
import { deny, machine } from "flow-state"
import { Editor } from "./editor.definition"

export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  const thisDoc = ({ memory }) => ({ docId: memory.docId })                     // user-defined: a key selector
  const save = O.save.commit(({ memory }) => ({ docId: memory.docId, text: memory.draft }))   // existing: commit; memory only, shared by two triggers
  return {
    default: S.LOADING,
    activities: [O.doc.subscribe(thisDoc)],                                     // existing: subscribe; placed at the root
    on: {
      Saved: { target: "self", updateMemory: ({ event }) => ({ version: event.version, error: null }) },
      SaveFailed: { target: "self", updateMemory: ({ event }) => ({ error: event.message, dirty: true }) },
      SaveUnsure: [
        { target: "self", guard: [O.save.retryable({ times: 3 })], actions: [O.save.retry] },   // an ending: no key (OD4); the same Attempt id, so the server answers what it did
        { target: "self", updateMemory: () => ({ error: "We couldn't confirm your last save. Newer edits wait for it." }) },   // no cancel: the unknown keeps holding the lane (OD5)
      ],
      RetrySave: { target: "self", actions: [O.save.retry(thisDoc)] },          // a user event: the key is named; NothingToResend if it resolved meanwhile
    },
    states: {
      LOADING: { on: { Loaded: { target: S.EDITING, updateMemory: ({ event }) => ({ draft: event.text, version: event.version }) } } },
      EDITING: {
        schedules: { autosave: { schedule: "800 millis", send: E.AutosaveDue, armOn: [E.Typed, E.SaveFailed], disarmOn: [E.SaveNow] } },   // re-arm after a failure or a restore's NotSent (R4 L1)
        on: {
          Typed: { target: "self", updateMemory: ({ event }) => ({ draft: event.text, dirty: true }) },
          AutosaveDue: { target: "self", guard: ({ memory }) => memory.dirty || deny("Clean"), updateMemory: () => ({ dirty: false }), actions: [save] },
          SaveNow: { target: "self", guard: ({ memory }) => memory.dirty || deny("Clean"), updateMemory: () => ({ dirty: false }), actions: [save] },
          ForceSave: { target: "self", updateMemory: () => ({ dirty: false }), actions: [O.save.cancel(thisDoc), save] },   // "discard the unsure save and save now": in action order, cancel releases and promotes the queued text, then save queues behind it (OD16, R6 H1)
          Loaded: [
            { target: "self", guard: [O.save.idle(thisDoc), ({ memory, event }) => (!memory.dirty && event.version > memory.version) || deny("Editing")], updateMemory: ({ event }) => ({ draft: event.text, version: event.version }) },   // idle: a held or waiting save keeps the live answer out of the draft (R4 M1)
            { target: "self" },
          ],
          Close: { target: S.CLOSED, guard: [O.save.idle(thisDoc), ({ memory }) => !memory.dirty || deny("Unsaved")] },   // denied Uncertain while the server is unreachable: intended (R4 L6)
          CloseAnyway: { target: S.CLOSED, actions: [O.save.cancel(thisDoc)] },   // Held: release, the waiting text is sent; InFlight: interrupt → Held, and the root SaveUnsure re-sends the same id before the waiting text goes (3.8.1, R5 H1)
        },
      },
      CLOSED: {
        on: { SaveUnsure: [{ target: "self", guard: [O.save.retryable({ times: 3 })], actions: [O.save.retry] }, { target: "self", actions: [O.save.cancel] }] },   // R6 H3: nothing in CLOSED can end a hold later, so the last unknown releases and the queued text is sent
      },
    },
  }
})
```

```tsx
// EditorPage.tsx
const { O } = Editor
const save = useView(editor, (s) => O.save.get(s, { docId }))                    // keyed: the page's own docId
const dirty = useView(editor, (s) => s.memory.dirty)
useBeforeUnload(save.pending || save.uncertain || dirty)
<StatusLine text={save.uncertain ? (save.waiting ? "Not confirmed; your newer edit waits" : "Not confirmed") : save.pending ? "Saving…" : dirty ? "Edited" : "Saved"} onRetry={save.uncertain ? () => editor.send(E.RetrySave()) : undefined} />   // NEW (OD5): uncertain on the row
```

The `Replaced` event of revision 2 is gone. A single-document actor pays one key selector for `latest`'s required
key (B33); with OD4 it is `thisDoc`, used only where no ending is in scope (`Close`, `RetrySave`, the placement).

**R3 H1, the late-landing race, under OD5.** `Docs.save` is `latest`, keyed by `docId`, and sends `attempt.id` as the
idempotency key.

| Step | Revision 4 | Revision 5 |
| --- | --- | --- |
| "A" is sent; the user types; "AB" waits | same | same |
| "A" ends unknown | not delivered; "AB" is sent at once | delivered as `SaveUnsure`; the lane holds, "AB" keeps waiting (a newer "ABC" replaces it, never sent) |
| the machine retries | (nothing to retry) | `retry` re-sends "A" with the same id; the server answers what it did: `Saved { version: 5 }` (H2: version 5 is recorded) |
| "AB" | succeeds, page shows "Saved" | is sent only now, on top of version 5: `Saved { version: 6 }` |
| "A"'s first request arrives late at the server | overwrites "AB"; the next `Loaded` puts "A" back in the draft | the server has seen that id and does nothing (idempotency) |

The race is gone because nothing newer is sent while "A" is unknown, and the only re-send of "A" carries its own id.
What it costs: while "A" stays unknown past the budget, newer edits wait and the page says "Not confirmed" with a
retry button; `Close` is denied (`O.save.idle` denies `Uncertain`). A server that ignores idempotency keys still needs
a version precondition (`If-Match`, 3.8.1) to fence a late request; Flow cannot do that for it, and that version must be read when the save is sent, not when it is committed (3.8.1, limits).

**Revision 6 (R4 M1, L1, L6).** Walk M1: "A" ends unknown → the user types, "AB" waits (`waiting: true`) → the live
`doc` pushes version 5 ("A") → `Loaded`'s first branch is denied by `O.save.idle` (`Uncertain`), so the draft keeps
"AB" → the retry settles "A", "AB" is sent and saved as 6 → the next `Loaded` (6) applies. Without the guard, the
draft fell back to "A" and a later "AC" replaced the waiting "AB". After a reload mid-flight, the waiting "AB" ends
`NotSent { why: "Restored" }`, mapped to `SaveFailed`, which re-arms the autosave (L1). `Close` stays denied while the
save is unconfirmed (intended); `CloseAnyway` releases it and the newest text is still sent (L6, OD7). 9.3 guards
`Loaded` the same way per document.

**Revision 7, against the table (R5 H1).** "AB" `InFlight`, "ABC" in `W`; `Close` is denied `InFlight`; `CloseAnyway`
cancels → "AB" is interrupted and its `unknown { Cancelled }` makes the lane `Held` (not `Idle`), so "ABC" is not sent
→ the root `SaveUnsure` re-sends "AB" with its own id → the server answers → "ABC" is promoted at once (OD16) and
saved. Revision 6 sent "ABC" at once, and a slower "AB" could land after it. If all re-sends end unknown, the lane
stays `Held` in CLOSED; `UnresolvedHold` passes, because no `save` commit is reachable from CLOSED. The status line
shows "Saving…" during a re-send (`pending`), since `uncertain` is false then; a view that wants "not confirmed" to
stay reads `retryCount > 0`.

**Revision 8, against the table with OD16's timing.**

- **Force save (R6 H1).** "AB" `Held`, "ABC" queued. `ForceSave` runs `[cancel, save]` in step 5, in order: `cancel`
  releases "AB" → "ABC" is promoted (`InFlight`, not yet invoked); `save` ("ABCD") meets the `InFlight` cell → queued.
  Step 6 publishes and invokes "ABC"; when it settles, "ABCD" is promoted and sent. The document ends "ABCD".
  Revision 7's step-6 promotion sent "ABCD" first and "ABC" after it.
- **`CloseAnyway` during an outage (R6 H3).** "AB" `InFlight`, "ABC" queued → `cancel` interrupts; the lane stays
  `InFlight` until `unknown { Cancelled }` is admitted → `Held` → CLOSED. CLOSED's `SaveUnsure` re-sends three times,
  then releases → "ABC" is promoted and sent; if the server is still down it ends unknown, and CLOSED's handler
  re-sends and finally releases it too (the stated residual: a released write may land later). `UnresolvedHold` now
  requires that owner under `latest`; without CLOSED's handler the check is an error.
- **The published row** after `SaveNow` shows `pending: true` in the same turn, because rows read the after lanes
  (merge 4 rule 28: a start publishes with its turn).

### 8.3 A dashboard with three live reads and a refresh

```ts
// metrics.contracts.ts
import { Context, Effect, Schema } from "effect"
import { resource } from "flow-state"

export const Range = Schema.Literals(["24h", "7d", "30d"])
export const Series = Schema.Struct({ total: Schema.Number, points: Schema.Array(Schema.Struct({ at: Schema.Number, value: Schema.Number })) })
export class MetricsDown extends Schema.TaggedError<MetricsDown>()("MetricsDown", { status: Schema.Number }) {}

export class MetricsApi extends Context.Service<MetricsApi, {
  series(metric: "revenue" | "signups" | "errors", p: { teamId: string; range: typeof Range.Type }, o: { signal: AbortSignal }): Effect.Effect<typeof Series.Type, MetricsDown>
}>()("dash/MetricsApi") {}

const metric = (name: "revenue" | "signups" | "errors") => resource({
  id: `dash/${name}`, input: { teamId: Schema.String, range: Range }, output: Series, key: ["teamId", "range"], staleTime: "1 minute", gcTime: "10 minutes",   // composite key: every field
  lookup: (input, { signal }) => MetricsApi.use((m) => m.series(name, input, { signal })),
})
export const Metrics = { revenue: metric("revenue"), signups: metric("signups"), errors: metric("errors") }
```

```ts
// dashboard.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Metrics, Range } from "./metrics.contracts"

export const Dashboard = definition({
  id: "Dash/Overview",
  states: ["VIEWING"],
  events: { RangeChanged: { range: Range }, Refresh: {} },
  internalEvents: { ErrorsDown: { status: Schema.Number } },
  memory: {
    teamId: Flow.input(Schema.String),
    range: Flow.initial(Range, "7d"),
    banner: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    revenue: Metrics.revenue,                                                   // bare: maps nothing; live because the machine subscribes
    signups: Metrics.signups,
    errors: Metrics.errors.outcomes({ failure: E.ErrorsDown.from((e) => ({ status: e.status })) }),   // failure only: either verb agrees; the machine's subscribe makes it live
  }),
})
```

```ts
// dashboard.machine.ts
import { deny, machine } from "flow-state"
import { Dashboard } from "./dashboard.definition"

export const DashboardMachine = machine(Dashboard, ({ S, O }) => {
  const scope = ({ memory }) => ({ teamId: memory.teamId, range: memory.range })
  return {
    default: S.VIEWING,
    states: {
      VIEWING: {
        activities: [O.revenue.subscribe(scope), O.signups.subscribe(scope), O.errors.subscribe(scope)],   // existing: subscribe
        on: {
          RangeChanged: { target: "self", updateMemory: ({ event }) => ({ range: event.range, banner: null }) },
          Refresh: {
            target: "self",
            guard: ({ operations }) => ![operations.revenue, operations.signups, operations.errors].some((o) => o?._tag === "Refreshing" || o?._tag === "Pending") || deny("Loading"),
            actions: [O.revenue.refetch, O.signups.refetch, O.errors.refetch],
          },
          ErrorsDown: { target: "self", updateMemory: ({ event }) => ({ banner: `Error metrics are unavailable (${event.status}).` }) },
        },
      },
    },
  }
})
```

```tsx
// Overview.tsx
const tiles = useView(dash, (s) => [["Revenue", s.operations.revenue], ["Sign-ups", s.operations.signups], ["Errors", s.operations.errors]] as const)
{tiles.map(([label, lane]) => <Tile key={label} label={label} total={lane?.data?.total} loading={lane?._tag === "Pending"} refreshing={lane?._tag === "Refreshing"} failed={lane?._tag === "Failure"} />)}
const canRefresh = useView(dash, (s) => check(s, E.Refresh())._tag === "Allowed")
```

A range change keeps the old totals visible only if the author adds `placeholder` to the placement,
`O.revenue.subscribe(scope, { placeholder })` (OPS O2, O6);
by default the tile shows `Pending` for the new range, which is honest.

### 8.4 A todo list with an entity domain

```ts
// todos.contracts.ts
import { Context, Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"

export class TodoRow extends Schema.Class<TodoRow>("TodoRow")({ id: Schema.String, listId: Schema.String, title: Schema.String, done: Schema.Boolean, position: Schema.Int }) {}
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class ListFailed extends Schema.TaggedError<ListFailed>()("ListFailed", { status: Schema.Number }) {}

export class TodosApi extends Context.Service<TodosApi, {
  list(p: { listId: string }, o: { signal: AbortSignal }): Effect.Effect<{ status: number; todos?: ReadonlyArray<TodoRow> }, NoResponse>
  send(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; row?: TodoRow }, NoResponse>
}>()("todos/TodosApi") {}

const call = (method: "POST" | "PATCH" | "DELETE", path: string, body: unknown, attemptId: string, signal: AbortSignal) => Effect.gen(function* () {
  const res = yield* TodosApi.use((a) => a.send(method, path, body, { idempotencyKey: attemptId, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
  if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
  if (res.status >= 400) return yield* Outcome.failure(new Refused({ status: res.status }))
  return res
})

export const todosInList = resource({
  id: "todos/in-list", input: { listId: Schema.String }, output: { todos: Schema.Array(TodoRow) }, key: ["listId"], staleTime: "30 seconds", gcTime: "5 minutes",
  lookup: (input, { signal }) => Effect.gen(function* () {
    const res = yield* TodosApi.use((a) => a.list(input, { signal })).pipe(Effect.mapError(() => new ListFailed({ status: 0 })))
    if (res.todos === undefined) return yield* new ListFailed({ status: res.status })
    return { todos: res.todos }
  }),
})
export const setDone = transaction({ id: "todos/set-done", input: Schema.Struct({ id: Schema.String, done: Schema.Boolean }), key: ["id"], concurrency: "latest",   // NEW (OD15): stated
  commit: (i, { attempt, signal }) => call("PATCH", `/todos/${i.id}`, { done: i.done }, attempt.id, signal).pipe(Effect.asVoid) })
export const renameTodo = transaction({ id: "todos/rename", input: Schema.Struct({ id: Schema.String, title: Schema.String }), key: ["id"], concurrency: "latest",
  commit: (i, { attempt, signal }) => call("PATCH", `/todos/${i.id}`, { title: i.title }, attempt.id, signal).pipe(Effect.asVoid) })
export const deleteTodo = transaction({ id: "todos/delete", input: Schema.Struct({ id: Schema.String }), key: ["id"], concurrency: "reject",
  commit: (i, { attempt, signal }) => call("DELETE", `/todos/${i.id}`, {}, attempt.id, signal).pipe(Effect.asVoid) })
export const addTodo = transaction({ id: "todos/add", input: Schema.Struct({ draftId: Schema.String, listId: Schema.String, title: Schema.String }), output: TodoRow,
  key: ["draftId"], concurrency: "reject",
  commit: (i, { attempt, signal }) => call("POST", `/lists/${i.listId}/todos`, { title: i.title }, attempt.id, signal).pipe(
    Effect.flatMap((res) => (res.row !== undefined ? Effect.succeed(res.row) : Outcome.unknown(new ServerError({ status: res.status }))))) })
export const clearCompleted = transaction({ id: "todos/clear-completed", input: Schema.Struct({ listId: Schema.String, ids: Schema.Array(Schema.String) }), key: [], concurrency: "reject",   // NEW (OD15): [] = one clear at a time
  commit: (i, { attempt, signal }) => call("DELETE", `/lists/${i.listId}/todos?done=true`, { ids: i.ids }, attempt.id, signal).pipe(Effect.asVoid) })
```

```ts
// todos.domain.ts
import { asc, domain, entity, eq, read, write } from "flow-state"
import { addTodo, clearCompleted, deleteTodo, renameTodo, setDone, TodoRow, todosInList } from "./todos.contracts"

export const Todo = entity({ id: "todos/Todo", fields: TodoRow.fields, primaryKey: ["id"] })
export const Todos = domain("todos", {
  list: read(todosInList).list(Todo, ({ result }) => result.todos).where(({ input, record }) => eq(record.listId, input.listId)).orderBy(({ record }) => [asc(record.position), asc(record.id)]),
  setDone: write(setDone).predicts(({ input }) => Todo.patch({ id: input.id }, { done: input.done })),
  rename: write(renameTodo).predicts(({ input }) => Todo.patch({ id: input.id }, { title: input.title })),
  remove: write(deleteTodo).predicts(({ input }) => Todo.delete({ id: input.id })),
  add: write(addTodo).one(Todo),
  clearCompleted: write(clearCompleted).predicts(({ input }) => Todo.delete({ id: input.ids })),   // many records (M5's array key)
})
```

```ts
// todos.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Todos } from "./todos.domain"

export const Adding = Schema.Struct({ draftId: Schema.String, title: Schema.String, id: Schema.NullOr(Schema.String), failed: Schema.Boolean })

export const TodoList = definition({
  id: "Todos/List",
  states: ["READY"],
  events: {
    Add: { draftId: Schema.String, title: Schema.String },
    Toggle: { id: Schema.String, done: Schema.Boolean },
    Rename: { id: Schema.String, title: Schema.String },
    Remove: { id: Schema.String },
    ClearCompleted: {},
  },
  internalEvents: {
    Listed: { ids: Schema.Array(Schema.String) },
    Settled: {},
    Failed: { message: Schema.String },
    DoneUnsure: Flow.uncertain({ message: Schema.String }), RenameUnsure: Flow.uncertain({ message: Schema.String }), RemoveUnsure: Flow.uncertain({ message: Schema.String }), ClearUnsure: Flow.uncertain({ message: Schema.String }),   // CHANGED (OD8): split per operation
    Added: { draftId: Schema.String, id: Schema.String },
    AddFailed: { draftId: Schema.String },
    AddUnsure: Flow.uncertain({ draftId: Schema.String }),
  },
  memory: {
    listId: Flow.input(Schema.String),
    adding: Flow.initial(Schema.Array(Adding), []),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => {
    const fail = (message: string) => E.Failed.from(() => ({ message }))
    const unsure = (event: typeof E.DoneUnsure, message: string) => event.from(() => ({ message }))   // the four unknown events share one shape
    return {
      todos: Todos.list.outcomes({ value: E.Listed.from((v) => ({ ids: v.todos.map((t) => t.id) })) }),
      done: Todos.setDone.outcomes({ success: E.Settled, failure: fail("Couldn't update"), unknown: unsure(E.DoneUnsure, "Couldn't confirm") }),   // one event for every failure tag
      rename: Todos.rename.outcomes({ success: E.Settled, failure: fail("Couldn't rename"), unknown: unsure(E.RenameUnsure, "Couldn't confirm the name") }),
      remove: Todos.remove.outcomes({ success: E.Settled, failure: fail("Couldn't delete"), unknown: unsure(E.RemoveUnsure, "Couldn't confirm the delete") }),
      add: Todos.add.outcomes({
        success: E.Added.from((v, { key }) => ({ draftId: key.draftId, id: v.id })),
        failure: E.AddFailed.from((_r, { key }) => ({ draftId: key.draftId })),
        unknown: E.AddUnsure.from((_r, { key }) => ({ draftId: key.draftId })),
      }),
      clear: Todos.clearCompleted.outcomes({ success: E.Settled, failure: fail("Couldn't clear"), unknown: unsure(E.ClearUnsure, "Couldn't confirm the clear") }),
    }
  },
})
```

```ts
// todos.machine.ts
import { deny, machine } from "flow-state"
import { TodoList } from "./todos.definition"

type Memory = typeof TodoList.Memory.Type
const setAdding = (m: Memory, draftId: string, patch: Partial<Memory["adding"][number]>) => ({ adding: m.adding.map((a) => (a.draftId === draftId ? { ...a, ...patch } : a)) })

export const TodoListMachine = machine(TodoList, ({ S, O }) => {
  const toast = { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) }
  return {
    default: S.READY,
    states: {
      READY: {
        activities: [O.todos.subscribe(({ memory }) => ({ listId: memory.listId }))],
        on: {
          Add: {
            target: "self",
            guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"),
            updateMemory: ({ memory, event }) => ({ adding: [...memory.adding, { draftId: event.draftId, title: event.title, id: null, failed: false }] }),
            actions: [O.add.commit(({ memory, event }) => ({ draftId: event.draftId, listId: memory.listId, title: event.title }))],
          },
          Toggle: { target: "self", actions: [O.done.commit(({ event }) => ({ id: event.id, done: event.done }))] },
          Rename: { target: "self", guard: ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))] },
          Remove: { target: "self", guard: [O.remove.idle(({ event }) => event)], actions: [O.remove.commit(({ event }) => ({ id: event.id }))] },
          ClearCompleted: {
            target: "self",
            guard: [O.clear.idle, ({ operations }) => (operations.todos?.data?.todos.some((t) => t.done) ?? false) || deny("NothingDone")],
            actions: [O.clear.commit(({ memory, operations }) => ({ listId: memory.listId, ids: (operations.todos?.data?.todos ?? []).filter((t) => t.done).map((t) => t.id) }))],
          },
          Added: { target: "self", updateMemory: ({ memory, event }) => setAdding(memory, event.draftId, { id: event.id }) },
          AddFailed: { target: "self", updateMemory: ({ memory, event }) => setAdding(memory, event.draftId, { failed: true }) },
          AddUnsure: [
            { target: "self", guard: [O.add.retryable({ times: 3 })], actions: [O.add.retry] },   // an ending: no key (OD4)
            { target: "self", updateMemory: ({ memory, event }) => setAdding(memory, event.draftId, { failed: true }), actions: [O.add.cancel] },   // release: nothing else retries this draft (UnresolvedHold, OD6)
          ],
          Listed: { target: "self", updateMemory: ({ memory, event }) => ({ adding: memory.adding.filter((a) => a.id === null || !event.ids.includes(a.id)) }) },
          Settled: { target: "self" },
          Failed: toast,
          DoneUnsure: { ...toast, actions: [O.done.cancel] },                  // each releases its own Attempt (OD7, OD8); a write that waited is sent
          RenameUnsure: { ...toast, actions: [O.rename.cancel] },
          RemoveUnsure: { ...toast, actions: [O.remove.cancel] },
          ClearUnsure: { ...toast, actions: [O.clear.cancel] },                // unkeyed: names its one lane; its own event, so a done unknown never cancels a clear (R4 H4)
        },
      },
    },
  }
})
```

```tsx
// TodoList.tsx
const { O } = TodoList
const todos = useView(list, (s) => s.operations.todos?.data?.todos ?? [])
const adding = useView(list, (s) => s.memory.adding)
const clearing = useView(list, (s) => s.operations.clear.pending)               // unkeyed: plain row
{todos.map((t) => <TodoRow key={t.id} todo={t} />)}
{adding.map((a) => <PendingTodo key={a.draftId} title={a.title} failed={a.failed} />)}

// TodoRow.tsx
const record = useView(list, (s) => Todo.get(s, { id: todo.id }, Todo.pick("title", "done")))   // shared: predicted, uncertain
const writing = useView(list, (s) => O.done.get(s, todo).pending || O.rename.get(s, todo).pending)   // get(s, item) (OD4)
<Checkbox checked={record.data.done} dim={writing || record.predicted} unsure={record.uncertain} onChange={(done) => list.send(E.Toggle({ id: todo.id, done }))} />
```

"Clear completed" deletes many records: each shows `predicted` (hidden, per M4) for every actor, and this actor's
`clear` row shows the button busy. Revision 2's record `pending` could not show either (R2 C-H3).

**Revision 6 (R4 H3, H4).** The shared `Unsure` is split per operation, and each handler releases only its own
Attempt. Walk H4: a `done` toggle ends unknown while `clearCompleted` is in flight → `DoneUnsure` releases `done`'s
Attempt only; `clear` keeps flying and settles on its own. In revision 5, `O.clear.cancel` in the shared handler
interrupted it, turned it into an unknown and forced a repair of every predicted record. Walk H3: a rename that
waited behind an unknown rename is sent once `RenameUnsure` releases the older one, never dropped. `AddUnsure`'s last
branch now releases too, since nothing else retries a draft.

### 8.5 Payment with 3-D Secure

Section 5.1.

## 9. R2's five authoring apps, and review 5's wizard

R2's sketches are in the session scratchpad (`ops-review-2/`). Each is rewritten, with what changed. Revision 4
changes only the verbs (`commit`, `lookup`, `subscribe`), `retryable`'s options, and 9.5's clear.

### 9.1 Chat additions: others typing, my typing ping

```ts
// chat.contracts.ts (additions to 5.4's)
export const Typing = Schema.Struct({ names: Schema.Array(Schema.String), at: Schema.Number })
export class TypingApi extends Context.Service<TypingApi, {
  who(p: { roomId: string }, o: { signal: AbortSignal }): Effect.Effect<typeof Typing.Type>
  ping(p: { roomId: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number }, NoResponse>
}>()("chat/TypingApi") {}

export const ChatTyping = {
  typing: resource({ id: "chat/typing", input: { roomId: Schema.String }, output: Typing, key: ["roomId"], staleTime: "2 seconds", gcTime: "10 seconds",
    lookup: (input, { signal }) => TypingApi.use((t) => t.who(input, { signal })) }),
  ping: transaction({ id: "chat/typing-ping", input: Schema.Struct({ roomId: Schema.String }), key: ["roomId"], concurrency: "latest",   // key required by latest; NEW MEANING (OD4): key is a field list
    commit: (i, { attempt, signal }) => TypingApi.use((t) => t.ping(i, { idempotencyKey: attempt.id, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)), Effect.asVoid) }),
}
```

```ts
// room.definition.ts, operations (additions to 5.4's)
typing: ChatTyping.typing,                                                      // bare: maps nothing; the machine subscribes
ping: ChatTyping.ping,                                                          // bare write: results are evidence only (S10)

// room.machine.ts, inside LIVE (additions)
activities: [O.feed.subscribe(({ memory }) => ({ roomId: memory.roomId, after: memory.lastSeq })), O.typing.subscribe(({ memory }) => ({ roomId: memory.roomId }))],
on: {
  Typed: { target: "self", actions: [O.ping.commit(({ memory }) => ({ roomId: memory.roomId }))] },   // latest: a burst of pings keeps one in flight, one waiting
}

// TypingLine.tsx
const who = useView(room, (s) => s.operations.typing?.data?.names ?? [])         // undefined while not placed: no Inactive branch
```

What changed: R2's two guesses are answered by rules: a bare `latest` write needs no `superseded:` (there is none),
and its unknowns are evidence and never hold the lane (S10, OD5). The `idle` throttle is unnecessary: `latest` keeps at most one waiting.
Expiry of stale names is the server's (`at` in the answer) or a `staleTime` refetch; not a Flow concept.

### 9.2 Save a card, then pay; or pay with a saved card

```ts
// checkout.contracts.ts (addition to 5.1's)
export class CardRefused extends Schema.TaggedError<CardRefused>()("CardRefused", { code: Schema.String }) {}
export const attach = transaction({
  id: "Stripe.attach",
  input: { token: Schema.String },
  output: { id: Schema.String },
  key: [],
  concurrency: "reject",
  commit: (input, { attempt, signal }) => Effect.gen(function* () {
    const api = yield* StripeApi
    const res = yield* api.attach(input, { idempotencyKey: attempt.id, signal }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.ok && res.paymentMethodId !== undefined) return { id: res.paymentMethodId }
    if (res.status === 402) return yield* Outcome.failure(new CardRefused({ code: res.code ?? "refused" }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.failure(new Rejected({ code: res.code ?? "unknown" }))
  }),
})
// StripeApi gains: attach(input: { token: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<StripeResponse & { paymentMethodId?: string }, NoResponse>
```

```ts
// checkout.definition.ts: only the parts that differ from 5.1 (a delta of a 200-line definition)
events: { Pay: { paymentMethodId: Schema.String }, SaveCard: { token: Schema.String }, PaySaved: { paymentMethodId: Schema.String }, EditCart: { amountCents: Schema.Int }, CheckNow: {}, Leave: {} },
internalEvents: { CardSaved: { paymentMethodId: Schema.String }, CardRefused: {}, SaveUnsure: Flow.uncertain({}) },   // added beside 5.1's
memory: { method: Flow.initial(Schema.Literals(["new", "saved"]), "new") },     // user-defined, NEW field: which kind of start
operations: ({ E }) => {
  const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
  return {
    save: Stripe.attach.outcomes({ success: E.CardSaved.from((v) => ({ paymentMethodId: v.id })), failure: { CardRefused: E.CardRefused, Rejected: E.Refused, NotSent: E.TryLater }, unknown: E.SaveUnsure }),
    pay: Stripe.confirm.outcomes({                                              // one operation for both kinds of pay: D9 holds
      success: intent,
      failure: { CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })), Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })), TooManyAttempts: E.TooManyAttempts, Rejected: E.Refused, NotSent: E.TryLater },
      unknown: E.Unsure,
    }),
    challenge: Stripe.handleNextAction.outcomes({ success: intent, failure: { AuthFailed: E.AuthFailed, ChallengeDismissed: E.Dismissed, Rejected: E.Refused, NotSent: E.TryLater }, unknown: E.ChallengeUnsure }),
    read: Stripe.intent.outcomes({ success: intent, failure: E.ReadFailed }),
  }
},

// checkout.machine.ts, the changed transitions
const payWith = O.pay.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))
CARD: {
  on: {
    SaveCard: { target: S.SAVING, guard: [O.save.idle], updateMemory: () => ({ method: "new" }), actions: [O.save.commit(({ event }) => ({ token: event.token }))] },
    PaySaved: { target: S.PAYING, guard: [O.pay.idle], updateMemory: () => ({ method: "saved" }), actions: [payWith] },
  },
},
SAVING: { on: { CardSaved: { target: S.PAYING, guard: [O.pay.idle], actions: [payWith] }, CardRefused: toCard("This card was refused."), SaveUnsure: { ...toCard("We couldn't confirm the card was saved. Try again."), actions: [O.save.cancel] },   // release: else the next SaveCard is denied Uncertain (OD5) TryLater: toCard("We couldn't reach the payment service.") } },
PAYING: {
  on: {
    Declined: [
      { target: S.CARD, guard: ({ memory }) => memory.method === "saved" || deny("NewCard"), updateMemory: () => ({ error: "Your saved card was declined. Add another." }) },
      { target: S.CARD, updateMemory: ({ event }) => ({ error: declineMessage(event.code) }) },
    ],
  },
},
UNSURE: { on: { CheckTick: [{ target: S.PAYING, guard: [O.pay.retryable({ times: 6 })], actions: [O.pay.retry] }, { target: S.STUCK }] } },   // one name, one lane: no ambiguity

// view
const paying = useView(checkout, (s) => s.operations.pay.pending)
```

(`SAVING` is added to 5.1's `states`; the 5.1 transitions not listed are unchanged.) What changed: no `.joins`, no
second name for one row; the difference between the starts is a memory flag the `Declined` handler reads (policy in
the machine); `retry` has one name.

### 9.3 A workspace of open documents: one load and one save per document

```ts
// workspace.definition.ts (contracts: Docs from 8.2)
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Docs } from "./docs.contracts"

export const OpenDoc = Schema.Struct({ docId: Schema.String, text: Schema.String, version: Schema.Int, dirty: Schema.Boolean, error: Schema.NullOr(Schema.String) })

export const Workspace = definition({
  id: "Docs/Workspace",
  states: ["OPEN"],
  events: { OpenDoc: { docId: Schema.String }, Typed: { docId: Schema.String, text: Schema.String }, RetrySave: { docId: Schema.String }, Close: { docId: Schema.String } },   // user-defined, NEW event: RetrySave
  internalEvents: {
    Loaded: { docId: Schema.String, text: Schema.String, version: Schema.Int },
    LoadFailed: { docId: Schema.String },
    Saved: { docId: Schema.String, version: Schema.Int },
    SaveFailed: { docId: Schema.String, message: Schema.String },
    SaveUnsure: Flow.uncertain({ docId: Schema.String }),
    AutosaveDue: { docId: Schema.String },
  },
  memory: { open: Flow.initial(Schema.Array(OpenDoc), []) },
  operations: ({ E }) => ({
    load: Docs.doc.outcomes({                                                   // maps value: subscribed once per open document with subscribe.each
      value: E.Loaded.from((d, { key }) => ({ docId: key.docId, text: d.text, version: d.version })),
      failure: E.LoadFailed.from((_e, { key }) => ({ docId: key.docId })),
    }),
    save: Docs.save.outcomes({                                                  // one lane per document (the contract's key)
      success: E.Saved.from((v, { key }) => ({ docId: key.docId, version: v.version })),
      failure: { Refused: E.SaveFailed.from((r, { key }) => ({ docId: key.docId, message: `Refused (${r.status})` })), NotSent: E.SaveFailed.from((r, { key }) => ({ docId: key.docId, message: `Not sent (${r.why})` })) },
      unknown: E.SaveUnsure.from((_r, { key }) => ({ docId: key.docId })),
    }),
  }),
})
```

```ts
// workspace.machine.ts
import { deny, machine } from "flow-state"
import { Workspace } from "./workspace.definition"

type Memory = typeof Workspace.Memory.Type
const patch = (m: Memory, docId: string, f: (d: Memory["open"][number]) => Partial<Memory["open"][number]>) => ({ open: m.open.map((d) => (d.docId === docId ? { ...d, ...f(d) } : d)) })

export const WorkspaceMachine = machine(Workspace, ({ S, E, O }) => {
  const named = ({ event }) => event                                            // user-defined: user events carry `docId` (OD4)
  return {
    default: S.OPEN,
    states: {
      OPEN: {
        activities: [O.load.subscribe.each(({ memory }) => memory.open.map((d) => ({ docId: d.docId })))],   // existing: subscribe; NEW (proposed): .each, one session per open document
        schedules: {
          autosave: {
            keys: ({ memory }) => memory.open.filter((d) => d.dirty).map((d) => ({ docId: d.docId })),   // NEW MEANING (proposed, L1): a key record, as a lane's key
            restartOn: ({ key, memory }) => memory.open.find((d) => d.docId === key.docId)?.text,   // NEW: restartOn per key (3.12): a debounce per document
            schedule: "800 millis",
            send: E.AutosaveDue.from(({ key }) => ({ docId: key.docId })),
          },
        },
        on: {
          OpenDoc: {
            target: "self",
            guard: ({ memory, event }) => !memory.open.some((d) => d.docId === event.docId) || deny("AlreadyOpen"),
            updateMemory: ({ memory, event }) => ({ open: [...memory.open, { docId: event.docId, text: "", version: 0, dirty: false, error: null }] }),   // its load starts with the placement
          },
          Loaded: [
            { target: "self", guard: [O.save.idle(named)], updateMemory: ({ memory, event }) => patch(memory, event.docId, (d) => (d.dirty ? {} : { text: event.text, version: event.version })) },   // R4 M1: not while this document's save is held or waiting
            { target: "self" },
          ],
          LoadFailed: { target: "self", updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ error: "Couldn't load" })) },
          Typed: { target: "self", updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ text: event.text, dirty: true })) },
          AutosaveDue: {
            target: "self",
            updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ dirty: false })),
            actions: [O.save.commit(({ memory, event }) => ({ docId: event.docId, text: memory.open.find((d) => d.docId === event.docId)?.text ?? "" }))],
          },
          Saved: { target: "self", updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ version: event.version, error: null })) },
          SaveFailed: { target: "self", updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ error: event.message, dirty: true })) },
          SaveUnsure: [
            { target: "self", guard: [O.save.retryable({ times: 3 })], actions: [O.save.retry] },   // an ending: no key (OD4)
            { target: "self", updateMemory: ({ memory, event }) => patch(memory, event.docId, () => ({ error: "Not confirmed" })) },   // no cancel: the lane holds; this document's newer saves wait (OD5)
          ],
          RetrySave: { target: "self", actions: [O.save.retry(named)] },        // a user event names the document; NothingToResend if it resolved meanwhile
          Close: {
            target: "self",
            guard: [O.save.idle(named), ({ memory, event }) => !memory.open.find((d) => d.docId === event.docId)?.dirty || deny("Unsaved")],
            updateMemory: ({ memory, event }) => ({ open: memory.open.filter((d) => d.docId !== event.docId) }),   // its load session is released
          },
        },
      },
    },
  }
})
```

```tsx
// Tabs.tsx
const { O } = Workspace
const open = useView(ws, (s) => s.memory.open)
{open.map((d) => <Tab key={d.docId} doc={d} />)}
// Tab.tsx: receives `doc`, the item it renders
const save = useView(ws, (s) => O.save.get(s, doc))                             // get(s, item) (OD4); a never-saved doc reads idle: true
const loading = useView(ws, (s) => O.load.get(s, doc)?._tag === "Pending")       // the each key; undefined only if not placed
<TabTitle dirty={doc.dirty} error={doc.error} unsure={save.uncertain} onRetry={save.uncertain ? () => ws.send(E.RetrySave({ docId: doc.docId })) : undefined} />   // NEW (OD5): uncertain
```

What changed: R2's per-member live read (A-H1) is `subscribe.each`; revision 5 removes `thisDoc` (endings address their
own Attempt, user events carry `docId`), and the per-document `latest` race is closed as in 8.2: a document's newer
save waits behind its unknown, and the other documents are unaffected (lanes per key); the `Replaced` event that could not name its document is
gone; the "never saved, so no row" gap is closed by `get`'s idle row; the keyed debounce is `restartOn` per key.

### 9.4 Kanban: moving and labelling cards, rebalancing a column

```ts
// board.contracts.ts
import { Context, Effect, Schema } from "effect"
import { Outcome, resource, transaction } from "flow-state"

export class CardRow extends Schema.Class<CardRow>("CardRow")({ id: Schema.String, boardId: Schema.String, columnId: Schema.String, position: Schema.Number, title: Schema.String, label: Schema.NullOr(Schema.String) }) {}
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", { cause: Schema.Defect() }) {}
export class Gone extends Schema.TaggedError<Gone>()("Gone", {}) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}
export class BoardDown extends Schema.TaggedError<BoardDown>()("BoardDown", { status: Schema.Number }) {}

export class BoardApi extends Context.Service<BoardApi, {
  cards(p: { boardId: string }, o: { signal: AbortSignal }): Effect.Effect<ReadonlyArray<CardRow>, BoardDown>
  send(method: "PATCH" | "POST", path: string, body: unknown, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number }, NoResponse>
}>()("kanban/BoardApi") {}

const write = (method: "PATCH" | "POST", path: string, body: unknown, attemptId: string, signal: AbortSignal) => Effect.gen(function* () {
  const res = yield* BoardApi.use((b) => b.send(method, path, body, { idempotencyKey: attemptId, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
  if (res.status === 404) return yield* Outcome.failure(new Gone({}))
  if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
  if (res.status >= 400) return yield* Outcome.failure(new Refused({ status: res.status }))
})

export const boardCards = resource({ id: "kanban/cards", input: { boardId: Schema.String }, output: { cards: Schema.Array(CardRow) }, key: ["boardId"], staleTime: "30 seconds", gcTime: "5 minutes",
  lookup: (input, { signal }) => BoardApi.use((b) => b.cards(input, { signal })).pipe(Effect.map((cards) => ({ cards }))) })
export const moveCard = transaction({ id: "kanban/move", input: Schema.Struct({ id: Schema.String, columnId: Schema.String, position: Schema.Number }), key: ["id"], concurrency: "latest",   // NEW (OD15): stated; was the domain default (R4 M3 gone)
  commit: (i, { attempt, signal }) => write("PATCH", `/cards/${i.id}`, { columnId: i.columnId, position: i.position }, attempt.id, signal) })
export const setLabel = transaction({ id: "kanban/label", input: Schema.Struct({ id: Schema.String, label: Schema.String }), key: ["id"], concurrency: "latest",
  commit: (i, { attempt, signal }) => write("PATCH", `/cards/${i.id}`, { label: i.label }, attempt.id, signal) })
export const rebalance = transaction({ id: "kanban/rebalance", input: Schema.Struct({ boardId: Schema.String, columnId: Schema.String, ids: Schema.Array(Schema.String) }),
  key: ["columnId"], concurrency: "reject",                                    // one rebalance per column at a time; NEW MEANING (OD4): key is a field list
  commit: (i, { attempt, signal }) => write("POST", `/boards/${i.boardId}/columns/${i.columnId}/rebalance`, { ids: i.ids }, attempt.id, signal) })
```

```ts
// board.domain.ts
import { asc, domain, entity, eq, read, write } from "flow-state"
import { boardCards, CardRow, moveCard, rebalance, setLabel } from "./board.contracts"

export const Card = entity({ id: "kanban/Card", fields: CardRow.fields, primaryKey: ["id"] })
export const Board = domain("kanban", {
  list: read(boardCards).list(Card, ({ result }) => result.cards).where(({ input, record }) => eq(record.boardId, input.boardId)).orderBy(({ record }) => [asc(record.columnId), asc(record.position)]),
  moveCard: write(moveCard).predicts(({ input }) => Card.patch({ id: input.id }, { columnId: input.columnId, position: input.position })),
  setLabel: write(setLabel).predicts(({ input }) => Card.patch({ id: input.id }, { label: input.label })),
  rebalance: write(rebalance),                                                  // positions arrive by refetch
})
```

```ts
// kanban.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Board } from "./board.domain"

export const Kanban = definition({
  id: "Kanban/Board",
  states: ["READY"],
  events: { Drop: { cardId: Schema.String, columnId: Schema.String, position: Schema.Number }, Label: { cardId: Schema.String, label: Schema.String }, Rebalance: { columnId: Schema.String } },
  internalEvents: { Settled: {}, Rebalanced: {}, CardGone: {}, MoveUnsure: Flow.uncertain({ cardId: Schema.String }), LabelUnsure: Flow.uncertain({}), RebalanceUnsure: Flow.uncertain({}), Failed: { message: Schema.String } },
  memory: { boardId: Flow.input(Schema.String), toast: Flow.initial(Schema.NullOr(Schema.String), null) },
  operations: ({ E }) => ({
    cards: Board.list.outcomes({ failure: E.Failed.from(() => ({ message: "Board offline" })) }),   // failure only: live because the machine subscribes
    move: Board.moveCard.outcomes({
      success: E.Settled,
      failure: { Gone: E.CardGone, Refused: E.Failed.from(() => ({ message: "Could not move" })), NotSent: E.Failed.from(() => ({ message: "Could not move" })) },
      unknown: E.MoveUnsure.from((_r, { key }) => ({ cardId: key.id })),
    }),
    label: Board.setLabel.outcomes({ success: E.Settled, failure: E.Failed.from(() => ({ message: "Label failed" })), unknown: E.LabelUnsure }),
    rebalance: Board.rebalance.outcomes({ success: E.Rebalanced, failure: E.Failed.from(() => ({ message: "Reorder failed" })), unknown: E.RebalanceUnsure }),   // unknown may target only Flow.uncertain events (rule 13); R2's sketch mapped it to a plain event
  }),
})
```

```ts
// kanban.machine.ts
import { machine } from "flow-state"
import { Kanban } from "./kanban.definition"

export const KanbanMachine = machine(Kanban, ({ S, O }) => {
  const toastOf = (message: string) => ({ target: "self", updateMemory: () => ({ toast: message }) })
  return {
    default: S.READY,
    states: {
      READY: {
        activities: [O.cards.subscribe(({ memory }) => ({ boardId: memory.boardId }))],
        on: {
          Drop: { target: "self", actions: [O.move.commit(({ event }) => ({ id: event.cardId, columnId: event.columnId, position: event.position }))] },   // a quick second drag replaces the first
          Label: { target: "self", actions: [O.label.commit(({ event }) => ({ id: event.cardId, label: event.label }))] },
          Rebalance: {
            target: "self",
            guard: [O.rebalance.idle(({ event }) => event)],   // the event carries `columnId` (OD4)
            actions: [O.rebalance.commit(({ memory, event, operations }) => ({ boardId: memory.boardId, columnId: event.columnId, ids: (operations.cards?.data?.cards ?? []).filter((c) => c.columnId === event.columnId).map((c) => c.id) }))],
          },
          Rebalanced: { target: "self", actions: [O.cards.refetch] },
          MoveUnsure: [{ target: "self", guard: [O.move.retryable({ times: 3 })], actions: [O.move.retry] }, { ...toastOf("Move unconfirmed"), actions: [O.move.cancel] }],   // R4 H2: release, so the card's next drag is sent   // an ending: no key (OD4)
          LabelUnsure: [{ target: "self", guard: [O.label.retryable({ times: 3 })], actions: [O.label.retry] }, { ...toastOf("Label unconfirmed"), actions: [O.label.cancel] }],   // R3: LabelUnsure names no card, and now needs none
          RebalanceUnsure: { target: "self", updateMemory: () => ({ toast: "Reorder unconfirmed" }), actions: [O.rebalance.cancel, O.cards.refetch] },   // the refetch answers it; release, else the column's next Rebalance is denied Uncertain
          CardGone: { target: "self", actions: [O.cards.refetch] },
          Failed: { target: "self", updateMemory: ({ event }) => ({ toast: event.message }) },
          Settled: { target: "self" },
        },
      },
    },
  }
})
```

```tsx
// CardView.tsx: receives `card`, the row the board renders
const { O } = Kanban
const record = useView(board, (s) => Card.get(s, { id: card.id }, Card.pick("title", "columnId", "position")))   // shared: predicted, uncertain
const unsure = useView(board, (s) => O.move.get(s, card).uncertain)            // R4 H2: a held move shows as unconfirmed, not "moving"
const moving = useView(board, (s) => O.move.get(s, card).pending)               // get(s, item): `move`'s key is ["id"], stated (OD15)
```

What changed: `moveCard` and `setLabel` state `key: ["id"]` (OD15; revision 5 defaulted it to `Card`'s primary key,
and R3 M4's early check and R4 M3's closure-read entity both went with that default). The machine names no card in
an ending's handler (`thisCard` is gone), and the view passes the card it renders. One limit stays: the `Drop`
event's `cardId` does not match the key field `id`, so a user-event member would need
`({ event }) => ({ id: event.cardId })` (none is written here). Per column rebalancing comes from the contract's key.

**Revision 6 (R4 H2).** Walk: c1's move ends unknown → re-sent 3 times → the toast branch now cancels → the lane is
free, so the next drag of c1 is sent at once. In revision 5 the next drag waited forever with its prediction shown and
`pending: true`, and `CardView` showed "moving". `label` and `rebalance` release the same way, and `CardView` reads
`uncertain`. `UnresolvedHold` would have reported all three as errors.

### 9.5 Search as you type

```ts
// search.contracts.ts
import { Context, Effect, Schema } from "effect"
import { resource } from "flow-state"

export const Hit = Schema.Struct({ id: Schema.String, title: Schema.String })
export class SearchDown extends Schema.TaggedError<SearchDown>()("SearchDown", { status: Schema.Number }) {}
export class SearchApi extends Context.Service<SearchApi, {
  query(p: { q: string }, o: { signal: AbortSignal }): Effect.Effect<{ hits: ReadonlyArray<typeof Hit.Type> }, SearchDown>
}>()("search/SearchApi") {}

export const Search = {
  query: resource({ id: "search/query", input: { q: Schema.String }, output: { hits: Schema.Array(Hit) }, key: ["q"], staleTime: "30 seconds", gcTime: "2 minutes",   // OD12, OD14
    lookup: (input, { signal }) => SearchApi.use((s) => s.query(input, { signal })) }),   // signal: a released request is aborted
}
```

```ts
// search.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Hit, Search } from "./search.contracts"

export const SearchBox = definition({
  id: "Search/Box",
  states: ["READY"],
  events: { Typed: { q: Schema.String } },
  internalEvents: { SearchDue: {}, Found: { hits: Schema.Array(Hit) }, SearchFailed: {} },
  memory: { q: Flow.initial(Schema.String, ""), hits: Flow.initial(Schema.Array(Hit), []) },
  operations: ({ E }) => ({
    results: Search.query.outcomes({ success: E.Found.from((v) => ({ hits: v.hits })), failure: E.SearchFailed }),   // maps success: looked up (S11); one lane, only the latest lookup is delivered (3.8.2)
  }),
})
```

```ts
// search.machine.ts
import { deny, machine } from "flow-state"
import { SearchBox } from "./search.definition"

export const SearchMachine = machine(SearchBox, ({ S, E, O }) => ({
  default: S.READY,
  states: {
    READY: {
      schedules: { debounce: { schedule: "250 millis", send: E.SearchDue, armOn: [E.Typed] } },
      on: {
        Typed: [
          { target: "self", guard: ({ event }) => event.q.trim().length > 1 || deny("TooShort"), updateMemory: ({ event }) => ({ q: event.q }) },
          { target: "self", updateMemory: ({ event }) => ({ q: event.q, hits: [] }), actions: [O.results.cancel] },   // an empty query clears the hits; existing word cancel, NEW on a one-off read (S13, proposed): no key, one lane
        ],
        SearchDue: { target: "self", guard: ({ memory }) => memory.q.trim().length > 1 || deny("TooShort"), actions: [O.results.lookup(({ memory }) => ({ q: memory.q }))] },   // existing: lookup
        Found: { target: "self", updateMemory: ({ event }) => ({ hits: event.hits }) },   // no stale guard: an older query's answer is never delivered
        SearchFailed: { target: "self" },
      },
    },
  },
}))
```

```tsx
// SearchBox.tsx
const hits = useView(search, (s) => s.memory.hits)
const searching = useView(search, (s) => { const r = s.operations.results; return r?._tag === "Pending" || r?._tag === "Refreshing" })   // OPS O6's lane (S12): one row, no key
```

What changed: version A of R2's sketch is correct by default (3.8.2), and, with one lane per one-off read operation,
clearing the box cancels the waiting lookup with no key (R3 H4: revision 3 delivered "ab"'s hits under an empty box,
and its `s.operations.results.pending` read a keyed lane as a plain row). Version B (a placement re-keyed by
`subscribe`'s params) also works and shows no old hits for an empty query, because an inactive placement is
`undefined`.

### 9.6 Onboarding wizard (review 5's sketch 7)

Steps ACCOUNT → PROFILE → PLAN → REVIEW. Each step is saved to a server draft on Next (`latest`, keyed by draft and
step); a one-off lookup checks the account name while the user types; the final `reject` submit must not
double-submit. Contracts follow review 5's sketch (`ops-review-5/7-onboarding-wizard.ts`), brought to OD12–OD15;
`classify`, `OnbApi`, `Values`, `StepSet` are the sketch's helpers:

```ts
// onboarding.contracts.ts (review 5's sketch, with revision 8's contract shape: input/output, key required)
const Step = Schema.Literals(["account", "profile", "plan"])
export const Onboarding = {
  start: transaction({
    id: "onb/start", input: { email: Schema.String }, output: { draftId: Schema.String }, key: [],   // OD12, OD15
    concurrency: "reject",
    commit: (i, { attempt, signal }) => OnbApi.use((a) => a.start(i, { idempotencyKey: attempt.id, signal })).pipe(classify),
  }),
  saveStep: transaction({
    id: "onb/save-step",
    input: Schema.Struct({ draftId: Schema.String, step: Step, values: Schema.Record({ key: Schema.String, value: Schema.String }) }),
    key: ["draftId", "step"],                                                   // NEW MEANING (OD4): one lane per step
    concurrency: "latest",
    commit: (i, { attempt, signal }) => OnbApi.use((a) => a.saveStep(i, { idempotencyKey: attempt.id, signal })).pipe(classify),
  }),
  nameFree: resource({ id: "onb/name-free", input: { name: Schema.String }, output: { available: Schema.Boolean }, key: ["name"], staleTime: "10 seconds", gcTime: "1 minute", lookup: (input, { signal }) => OnbApi.use((a) => a.nameFree(input, { signal })) }),
  submit: transaction({
    id: "onb/submit", input: Schema.Struct({ draftId: Schema.String }), key: ["draftId"], concurrency: "reject",
    commit: (i, { attempt, signal }) => OnbApi.use((a) => a.submit(i, { idempotencyKey: attempt.id, signal })).pipe(classify),
  }),
  status: resource({ id: "onb/status", input: { draftId: Schema.String }, output: { state: Schema.Literals(["draft", "submitted"]) }, key: ["draftId"], staleTime: "0 millis", gcTime: "0 millis", lookup: (input, { signal }) => OnbApi.use((a) => a.status(input, { signal })) }),
}
```

```ts
// onboarding.definition.ts
export const Wizard = definition({
  id: "Onboarding/Wizard",
  states: ["EMAIL", "STARTING", "ACCOUNT", "PROFILE", "PLAN", "REVIEW", "SUBMITTING", "UNSURE", "CHECKING", "DONE"],
  events: { Start: { email: Schema.String }, Edit: { field: Schema.String, value: Schema.String }, Next: {}, Back: {}, Submit: {}, CheckStatus: {} },
  internalEvents: {
    Started: { draftId: Schema.String }, StartFailed: { message: Schema.String }, StartUnsure: Flow.uncertain({}),
    StepSaved: { step: Step }, StepFailed: { step: Step, message: Schema.String }, StepUnsure: Flow.uncertain({ step: Step }),
    NameChecked: {}, NameCheckFailed: {}, NameDue: {},
    Submitted: {}, SubmitFailed: { message: Schema.String }, SubmitUnsure: Flow.uncertain({}),
    Status: { state: Schema.Literals(["draft", "submitted"]) }, StatusFailed: {},
  },
  memory: {
    email: Flow.initial(Schema.String, ""),
    draftId: Flow.initial(Schema.String, ""),
    values: Flow.initial(Values, { account: {}, profile: {}, plan: {} }),
    unsaved: Flow.initial(StepSet, { account: false, profile: false, plan: false }),   // workflow: edits not yet committed
    // REMOVED (R5 M7): checkedName, the mirror of which name the read answered; the one-off row carries its key
    error: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: ({ E }) => ({
    start: Onboarding.start.outcomes({ success: E.Started.from((v) => ({ draftId: v.draftId })), failure: E.StartFailed.from(() => ({ message: "Couldn't start" })), unknown: E.StartUnsure }),
    save: Onboarding.saveStep.outcomes({
      success: E.StepSaved.from((_v, { key }) => ({ step: key.step })),
      failure: E.StepFailed.from((_r, { key }) => ({ step: key.step, message: "Couldn't save this step" })),
      unknown: E.StepUnsure.from((_r, { key }) => ({ step: key.step })),     // the key copied for memory bookkeeping (stated friction)
    }),
    name: Onboarding.nameFree.outcomes({ success: E.NameChecked, failure: E.NameCheckFailed }),   // maps success: looked up (S12)
    submit: Onboarding.submit.outcomes({ success: E.Submitted, failure: E.SubmitFailed.from(() => ({ message: "Couldn't submit" })), unknown: E.SubmitUnsure }),
    status: Onboarding.status.outcomes({ success: E.Status.from((v) => ({ state: v.state })), failure: E.StatusFailed }),
  }),
})
```

```ts
// onboarding.machine.ts
export const WizardMachine = machine(Wizard, ({ S, E, O }) => {
  const stepOf = (state) => (S.ACCOUNT.is(state) ? "account" : S.PROFILE.is(state) ? "profile" : "plan")
  const saveCurrent = O.save.commit(({ memory, state }) => ({ draftId: memory.draftId, step: stepOf(state), values: memory.values[stepOf(state)] }))   // existing: commit; the key is two sources (stated friction)
  const next = (target) => ({ target, updateMemory: ({ memory, state }) => ({ unsaved: { ...memory.unsaved, [stepOf(state)]: false } }), actions: [saveCurrent] })
  const thisDraft = ({ memory }) => ({ draftId: memory.draftId })               // user-defined: a key selector, no ending in scope
  const nothingUnsaved = ({ memory }) => !Object.values(memory.unsaved).some(Boolean) || deny("StepsUnsaved")
  const checkNow = { target: S.CHECKING, actions: [O.status.lookup(thisDraft)] }
  return {
    default: S.EMAIL,
    on: {
      Edit: { target: "self", updateMemory: ({ memory, event, state }) => ({ values: { ...memory.values, [stepOf(state)]: { ...memory.values[stepOf(state)], [event.field]: event.value } }, unsaved: { ...memory.unsaved, [stepOf(state)]: true } }) },
      StepSaved: { target: "self" },
      StepFailed: { target: "self", updateMemory: ({ memory, event }) => ({ unsaved: { ...memory.unsaved, [event.step]: true }, error: event.message }) },   // also NotSent { Restored } after a reload
      StepUnsure: [
        { target: "self", guard: [O.save.retryable({ times: 2 })], actions: [O.save.retry] },   // key-less: save alone maps StepUnsure (OD8); Held → InFlight
        { target: "self", updateMemory: ({ memory, event }) => ({ unsaved: { ...memory.unsaved, [event.step]: true } }), actions: [O.save.cancel] },   // Held → Idle; a waiting edit of this step is then sent (OD7)
      ],
    },
    states: {
      EMAIL: { on: { Start: { target: S.STARTING, guard: [O.start.idle], updateMemory: ({ event }) => ({ email: event.email }), actions: [O.start.commit(({ event }) => ({ email: event.email }))] } } },
      STARTING: {
        on: {
          Started: { target: S.ACCOUNT, updateMemory: ({ event }) => ({ draftId: event.draftId }) },
          StartFailed: { target: S.EMAIL, updateMemory: ({ event }) => ({ error: event.message }) },
          StartUnsure: [{ target: "self", guard: [O.start.retryable({ times: 3 })], actions: [O.start.retry] }, { target: S.EMAIL, updateMemory: () => ({ error: "Couldn't start, try again" }), actions: [O.start.cancel] }],   // a released start may leave an orphan draft (stated residual)
        },
      },
      ACCOUNT: {
        schedules: { nameDue: { schedule: "300 millis", send: E.NameDue, armOn: [E.Edit] } },
        on: {
          NameDue: { target: "self", actions: [O.name.lookup(({ memory }) => ({ name: memory.values.account.name ?? "" }))] },   // existing: lookup; only the latest is delivered (OD9)
          NameChecked: { target: "self" },
          NameCheckFailed: { target: "self" },
          Next: {
            ...next(S.PROFILE),
            guard: ({ operations, memory }) => {
              const row = operations.name                                       // OPS O6's lane, held, with `key` (R5 M7, proposed)
              return (row?.key.name === memory.values.account.name && row._tag === "Ready" && row.data.available) || deny("NameUnchecked")   // the row says which name it answered
            },
          },
        },
      },
      PROFILE: { on: { Next: next(S.PLAN), Back: S.ACCOUNT } },
      PLAN: { on: { Next: next(S.REVIEW), Back: S.PROFILE } },
      REVIEW: {
        on: {
          Back: S.PLAN,
          Submit: {
            target: S.SUBMITTING,
            guard: [nothingUnsaved, O.save.idle(thisDraft), O.submit.idle(thisDraft)],   // O.save.idle with a partial key: every step lane of this draft (Q34 A, proposed)
            actions: [O.submit.commit(thisDraft)],
          },
        },
      },
      SUBMITTING: {
        on: {
          Submitted: S.DONE,
          SubmitFailed: { target: S.REVIEW, updateMemory: ({ event }) => ({ error: event.message }) },
          SubmitUnsure: [{ target: "self", guard: [O.submit.retryable({ times: 3 })], actions: [O.submit.retry] }, { target: S.UNSURE }],
        },
      },
      UNSURE: { on: { CheckStatus: checkNow } },
      CHECKING: {
        on: {
          Status: [
            { target: S.DONE, guard: ({ event }) => event.state === "submitted" || deny("NotSubmitted"), actions: [O.submit.cancel(thisDraft)] },   // the read answered: release (keyed, so the key is named: Status is status's ending)
            { target: S.REVIEW, updateMemory: () => ({ error: "Not submitted yet. Try again." }), actions: [O.submit.cancel(thisDraft)] },
          ],
          StatusFailed: S.UNSURE,
        },
      },
      DONE: {},
    },
  }
})
```

```tsx
// StepNav.tsx
const { O } = Wizard
const profile = useView(wiz, (s) => O.save.get(s, { draftId, step: "profile" }))   // a key record built in the view: no item carries both fields
<StepDot unsure={profile.uncertain} waiting={profile.waiting} saving={profile.pending} />   // each flag one lane state (3.8.1)
const canSubmit = useView(wiz, (s) => check(s, E.Submit())._tag === "Allowed")
```

**Review 5's two hacks.** (2) `checkedName` is gone: the held one-off row carries `key`, so `Next` compares it with
memory and a stale `Ready` for the previous name is refused (R5 M7; proposed). (1) "every step's save is confirmed"
is `O.save.idle(thisDraft)` with a **partial key**, every lane whose key matches `{ draftId }`, as OPS O1's
`invalidate` already matches partial keys. That is not in the table; it is Q34 (proposed A). Without it, the closure
over three `O.save.get(operations, ...)` reads stays, and the table does not remove it: the hold is per lane (3.8.1,
limits).

**Walks against the table.** Fast Back/Next: p1 `InFlight`, p2 in `W`, p3 replaces p2 (`Superseded`, evidence).
PROFILE save unknown: `Held`; `StepUnsure` re-sends twice (`InFlight` each time; `uncertain` false, `pending` true),
then releases → p2 promoted. `Submit` while a step is `Held` or `InFlight`: `O.save.idle(thisDraft)` denies, so the
old profile cannot be finalized (R5 M3). Submit unknown: `Held` → three re-sends with the same id → UNSURE →
`CheckStatus` → CHECKING → `Status` releases with the named key. Reload mid-hold: an in-flight re-send restores as
`unknown { Restored }` with its `retryCount`; a waiting step edit ends `NotSent { Restored }` → `StepFailed` → the
step is unsaved and `Submit` is denied until the user passes it again (stated). `UnresolvedHold` passes for all five
operations; from DONE no `submit` commit is reachable.

## 10. Real-world cases and alternatives

### 10.1 Cases

| # | Case | Operations | Read | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Checkout with 3-D Secure (5.1) | `pay`, `challenge`, one-off `read` | plain rows | fits |
| 2 | Two-factor sign-in (5.2) | `verify` keyed by challenge | `check()` | fits, as the design today |
| 3 | Issues list (5.3) | domain writes keyed by `.predicts`, drafts keyed by `draftId`, a live list | `get`, records | fits |
| 4 | Chat room (5.4) | stream, one-off catch-up, `post` keyed by `clientId` | memory status | fits |
| 5 | LLM answer (M6 7.4) | `generate` keyed by conversation, `progress` | `O.generate.get(s, key).progress` | fits |
| 6 | Uploads (8.1) | `put`, `clean` keyed by `ref` | `get(...).progress` | fits |
| 7 | Autosave editor (8.2) | `save` (`latest`, keyed), `doc` live | `get` | fits; one key selector for a single document; R3 H1 closed by the hold (OD5) |
| 8 | Dashboard (8.3) | three bare live reads | lanes | fits |
| 9 | Todo list (8.4) | domain writes; a many-record unkeyed write | `get`, `predicted` | fits |
| 10 | Per-field settings autosave (3.3, R2 C-H1) | `save` keyed by (doc, field) | `get` | fits |
| 11 | Document workspace (9.3) | `load` via `subscribe.each`, `save` keyed | `get` | fits; the `latest` race closed per document (OD5) |
| 12 | Kanban (9.4) | domain writes with `key: ["id"]`, `rebalance` keyed by column | `get(s, card)`, records | fits; R3 M4 closed (OD4) |
| 13 | Search as you type (9.5) | one-off read, one lane | plain row | fits, no stale guard; clear is `cancel` |
| 14 | Stock watchlist (M6 7.3) | `quotes` stream via `subscribe.each` | `get` | fits; replaces `keys` on activities |
| 15 | Live presence, typing (M6 7.2, 9.1) | bare streams and reads | lanes | fits |
| 16 | Dispatch-desk queue and editor (DD) | live reads with `refetch`, `listen`, domain writes | lanes, records | fits |
| 17 | Booking saga (MD 2.7.7) | five writes | plain rows | fits |
| 18 | Per-item archive (MD 2.7.11) | `archive` keyed by item | `get` | fits; "archive all" still one start per item (B14) |
| 19 | Supabase, Firebase, OpenAI, Vercel AI SDKs (M6 7.7) | streams, writes with `progress` | lanes | fits |
| 20 | One editor actor switching documents | `save` keyed by `docId` | `get` | fits by the contract's key; revision 2 needed a declaration |
| 21 | Lazy tree: expand node A, then node B (R3 M3) | children via `subscribe.each` over expanded nodes | `get` by node | fits; a one-off read would keep only the latest node (3.3) |
| 22 | Prefetch on hover (warm the cache, map nothing) | a bare resource looked up | `undefined` until hovered | fits: bare may use `lookup` (S11) |

### 10.2 Alternatives considered

| Alternative | Why not (proposed) |
| --- | --- |
| A. Today's model (lanes per actor, transaction, key; commit values in the body) | lookups by internal key records and transaction paths; two uses collide; select typing |
| B. Call sites in the machine body (IM) | rows type only through the body |
| C. Declare on the definition, fill in the machine | repetition |
| D. A trigger on the definition | behaviour in the contract |
| E. String event names | weak mapping |
| F. Fragment operations | an orphan rule; deferred |
| G. Activities declared in the machine | two identity models (Q1 B) |
| H. Revision 2's `.each` operations over entities and memory lists | two modes, membership, draining, release rules; plain writes over server rows uncovered (R2 C-H1) |
| I. `.each({ by })` on the operation, as R2 C-H1 suggests | the identity of a server thing is a fact about the server, so it sits on the contract (R8), once for every definition; R2's form works but states it per use |
| J. `.single()` for single-thing `latest` operations (R2 C-H1) | `key: []` already says it, with no new word |
| K. `superseded:` with a full `{ success, failure, unknown }` set (R2 C-H2) | keeps a mapping nobody acts on correctly; replaced work is dropped instead, which also covers reads |
| L. `.overlap()` for reads (R2 A-H2) | a rare case; two operations or `subscribe.each` express it |
| M. One member handle per list, `O.at(...)` (R2 A-H4) | commits derive the key, so only `retry`, `cancel`, `idle`, `retryable` and `get` take one; a key-selector const covers them without a new word |
| N. Record `pending` from the store's queue entries (R2 C-H3) | correct, but a second place for workflow state; the lane plus the record's `predicted` already answer both questions |
| O. `.joins` with members on the primary only (R2 A-M1) | a concept for a rare case; a memory flag covers it |
| P. `.was`, `sharesLane`, `renamedFrom` | not needed once persistence binds by contract |
| Q. Keep `.emits` | `outcomes` is the design's word for the same mapping, streams included (M6 4.3.1) |
| R. Revision 3's `start` for every finite work and `params` for every placement | rejected by OD2: new words for things the design already names, and one word for a write and a read hid which kind runs |
| S. One-off or live decided by the mapped key (revision 3) | review 3's hidden mode (a): deleting a mapper changes behaviour silently; the verb decides instead (OD2) |
| T. One rule per concern across kinds (revision 3's key, bare, replacement) | rejected by OD3: the key meant the lane for writes and the entry for reads (R3 K2) |
| U. Lanes per cache key for one-off reads | delivery per operation and rows per key disagree (R3 M3, H4); one lane per operation, per-thing reads via `subscribe.each` |

## 11. Open questions for the owner

Nothing below is decided. Reply as `Q2 A`. Answered and removed: **Q1** (everything under `operations`, activities as
placements: OD3 for the declaration, OD2 for `subscribe` in `activities`) and, from **Q15**, the names `start`,
`params` and `retryable(n)` (OD2, OD1). Revision 5 removes **Q5** and **Q11** (answered by OD5: only a never-sent
commit is replaceable; `cancel` releases a retained unknown, with no cap), **Q8** (answered by OD4: `get` takes any
value carrying the key's fields), and **Q24**, **Q25** (review 3's K1 and K3, decided as OD5 and OD4). Revision 6
narrows **Q28** (OD7 decides `cancel`'s address) and **Q29** (OD8 decides key-less addressing). Revision 7 removes
**Q2, Q4, Q6, Q7, Q21, Q22, Q23, Q26** (decided, OD9). Revision 8 removes **Q12–Q19** (decided, OD17), **Q3** (OD15:
every resource and transaction states `key`), **Q27** (OD12: every kind has `input`, whose pick is the key Schema) and
**Q30** (OD15: no domain default, so no entity to infer). Question numbers are kept so section 7's references stay valid.

### Round 1: the identity of a call

### Round 3: reading lanes

- **Q9. Record `pending` removed**; records keep `predicted`. **A (recommended)** yes. B derive it from queue entries
  (alternative N).
- **Q10. Inactive placements are `undefined`**, with `placeholder` for continuity. **A (recommended)** yes. B
  `Inactive { data }`.

### Round 5: names, files, records

- **Q20. Decisions to record**: D1 amended; D4, D9, D11, D18, D19 rewritten; D21 deleted; new D22 (operations, with
  OD3's "declaration only"), D23 (lanes per kind), D24 (replaced work, per kind), D25 (activities as placements with
  `subscribe`, OD2), D26 (`retryable({ times })`, OD1), D27 (field-list keys, key-less
  members in endings, OD4), D28 (only a never-sent commit is replaceable; the hold; `uncertain`, OD5). **A** as
  listed, plus D29 (`UnresolvedHold`, `waiting`, OD6), D30 (`cancel` acts on one Attempt, OD7), D31 (key-less
  addressing, OD8), D32 (round 1 of section 11, OD9), D33 (the write lane as a state machine, OD10), D34 (contract shape, OD11–OD15),
  D35 (the table's timing and names, OD16), D36 (rounds 4 and 5, OD17). B only the decided ones now: D22, D25–D36.

### Round 7: rules that follow from OD4 to OD8

- **Q28. The write-lane table's cells** (3.8.1). The form (OD10) and the timing (OD16: step 5, action order,
  promote at once, after lanes) are decided; the cells are proposed, including `HeldThisTurn` for `cancel` and
  `allow`. **A
  (recommended)** accept the table as written, in particular: an interrupted Attempt is `Held` (R5 H1); `idle`
  passes only in `Idle`; a queued commit is promoted at once (OD16); `serialize` holds and its head is
  addressable (`retry`, `retryable`, `retryCount`; amends MD N2); `cancel` and `allow` do not hold (an unknown is
  addressable in its own handler, evidence after that turn); a failed Attempt is not re-sendable (amends MD rule 21).
  B `serialize` does not hold (photo 3's unknown would not block photos 4–20, R4 M6), at the price of a FIFO that
  sends past an unknown head. C keep MD N2 for `serialize` (then a held head can only be given up).
- **Q29. Keyed schedules use key records** (3.12). Key-less addressing is decided (OD8); the domain default is gone
  (OD15). **A (recommended)**: keyed schedules use key records, and `keys` may read `operations` (the after lanes,
  OD16) (L1, R3 M2). B keep string schedule keys (two meanings of `key`, R3 L1).
- **Q31. Two tabs** (R4 M5). The hold orders one lane; a second tab is another actor (Persistence O7). **A
  (recommended)** state it as a limit and leave cross-actor ordering to the server (a version precondition with
  Q32's rebase, so it refuses what the user did not see) or to one shared actor. B hold across tabs through persisted lanes (a cross-tab lock: a new mechanism
  with its own failure modes).
- **Q32. `basedOn` and `If-Match` after a hold** (3.8.1 limits; R5 M2). **A (recommended)** rebase across the
  lane's own writes only: a waiting commit made on base b takes the version returned by the write it waited for if
  that write's base was also b, else keeps b (a 412 is then right). B revision 6's "computed at invocation" (then
  `If-Match` passes against a tab 2 version the user never saw). C compute at commit (then `If-Match` refuses every
  write that waited behind a hold).

  ```ts
  // the lane: "A" committed on version 4 → Held → retry → Saved { version: 5 }; "AB" waited, committed on version 4
  // A: "AB" is sent with basedOn 5 (the version its predecessor on this lane returned, from the same base 4)
  // B: "AB" is sent with basedOn = the store's version at send, perhaps 6 from tab 2 → If-Match passes, "X" is lost
  // C: "AB" is sent with basedOn 4 → 412, though nothing but this lane's own write came between
  ```
- **Q33. Reviews 4 and 5's other proposed fixes**: the one-off read operation holding its entry and carrying its
  `key` (R4 M4, R5 M7), `O.x.get(operations, k)` in callbacks (R4 M1), and S15, mapped events only from endings with
  `Story.ending` (R4 M2, R5 L3). (`UnmappedUnknown` is folded into `UnresolvedHold`.) **A (recommended)** all three.
  B the row without `key` (then the wizard keeps a `checkedName` mirror, R9).
- **Q34. "Every lane of this draft is idle"** (R5 M3; 9.6). **A (recommended)** `idle` accepts a **partial key**,
  passing only when every existing lane whose key matches it is `Idle`, as OPS O1's `invalidate` matches
  partial keys; only `idle` takes one, `retry` and `cancel` still name one lane. B no member: a closure over
  `O.x.get(operations, k)` per key is the pattern, and the aggregate goes to `revisit.md` until a second case needs it.

  ```ts
  // before (B): three hand-built key records
  const allSaved = ({ operations, memory }) => STEPS.every((step) => { const l = O.save.get(operations, { draftId: memory.draftId, step }); return !l.pending && !l.uncertain && !l.waiting }) || deny("StepsUnsaved")
  // after (A): one partial key                                                   // NEW MEANING: idle over a partial key
  guard: [O.save.idle(({ memory }) => ({ draftId: memory.draftId }))]
  ```

### Round 8: from review 6 and the contract shape

- **Q35. Per-item work on a `serialize` queue** (R6 M4). Only the head is addressable; `O.put.cancel` from "cancel
  photo 9" names photo 4. **A (recommended)** state it in the policy row and require per-item stops to use a keyed
  design (one lane per file under `reject`, throttled by a memory queue) and, on `serialize`, allow key-less `retry`,
  `retryable` and `cancel` only in a handler of the head's own ending; this narrows OD8 for one policy, so it needs
  the owner. B keep OD8 as is and add only a `flow check` info when an unkeyed `serialize` member stands in a
  non-ending transition. C give the `serialize` row the head's key record (helps keyed `serialize` only).
- **Q36. `unknown` mapped per tag** (R6 M5, K15). **A (recommended)** `outcomes.unknown` may be a record by tag, as
  `failure` is: `{ Cancelled: E.Stopped, NoResponse: E.Unsure, ServerError: E.Unsure }`; `Cancelled` is Flow's tag for
  an interrupt after `cancel`. Then a "stopped" handler releases, a "dropped" one re-sends, and `UnresolvedHold`
  reads both. B one `unknown` event; the handler branches on the mapper's reason in a guard, which `flow check`
  cannot read.

  ```ts
  // before: one event for both causes; re-sending what the user stopped can make a cancelled transfer
  unknown: E.TransferUnsure,
  // after A                                                                     // NEW MEANING: unknown mapped per tag, as failure is
  unknown: { Cancelled: E.TransferStopped, NoResponse: E.TransferUnsure, ServerError: E.TransferUnsure },
  ```

- **Q37. Exactly two schemas** (OD12) against two existing fields. (1) A transaction with no result (`removeIssue`,
  `discard`): **A (recommended)** `output` may be omitted and means `Schema.Void`; B always write it. (2) The
  transaction's `progress` schema (8.1's upload, M6 7.4's `generate`) is a third schema. **A (recommended)** keep
  `progress` as the one named exception: it is not in or out but the commit's side channel, and OD12's "no third
  schema" was about `params`. B move progress into a stream-shaped `output`. C drop it (uploads lose progress bars).
- **Q38. A stream's key** (OD15 leaves streams open). **A (recommended)** required, as on resources and transactions,
  `key: []` for one session: one rule on every kind, and the key is the session identity (OPS O4). B optional,
  defaulting to `[]`.

## 12. Keywords

| Kind | Words |
| --- | --- |
| **New** | `retryable({ times })`, `retryable(k, { times })` (OD1); the denial `RetryLimit`; evidence `Superseded`; findings `SharedContract`, `DuplicatePlacement`, `VerbMismatch` (proposed), `KeyRequired` (proposed), `UnusedOperation`, `UnresolvedHold` (OD6, OD10: a check over the write-lane graph); the denial `Uncertain` (proposed); evidence `Released` (proposed); `Story.ending` (proposed); the write-lane states **`Idle`, `InFlight`, `Held`** (OD10; Inspection and Stories name them); concepts **contract**, **operation**, the **hold** (OD5) |
| **Existing words in new places** | `.outcomes(...)` as a method on a contract; `get(s, k?)` on an operation (OPS O6's `descriptor.get(snapshot, params)`, by key); `.each` on `subscribe` (proposed); `cancel` on a one-off read (proposed); `key` on transactions as the lane's identity; `uncertain` (M4's word) and `waiting` on the write row (OD5, OD6); key-less `retry`, `retryable`, `cancel` in an ending's handler (OD4); `restartOn` per key; `O` exported by the definition |
| **Existing verbs, kept (OD2)** | `commit(select)` (OPS O3), `lookup(select)` (OPS O2), `subscribe(select)` (OPS O2, O4; the stream's own function name), now on the operation and without an `outcomes` option |
| **Contract shape (OD11–OD15)** | `input` and `output` on every kind (RENAMED: `result` → `output`; NEW on resources and streams: `input`); the mapper's `{ input }` (RENAMED from `{ params }`); `key` required, `[]` for one (NEW MEANING); a fields record or a full Schema for each; `fromRpc` (later, opt-in) |
| **Table labels, not author words (OD16)** | `Idle`, `InFlight`, `Held`, `HeldThisTurn`; "queued commits" (`W`); "after lanes" |
| **New meaning** | `outstanding` on `serialize` rows only (MD's word, kept, R6 L4); `pending` on a write row: `InFlight` only, not a waiting start (OD10, against MD rule 21); `idle` over a partial key (proposed, Q34); `operations`; `O`; `activities` (a list); `key` on every contract: a list of top-level input fields (OD4); the mapper's, lane's and keyed schedule's `key`: one key record (L1, the schedule half proposed); `cancel`: acts on the same one Attempt as `retry`, then the waiting commit is sent (OD7); `Superseded`: never-sent commits only (OD5) |
| **Renamed** | `s.calls`, `s.activities` → `s.operations`; `read.fetch(key)` → `O.read.lookup(select)`; `O.Stripe.confirm.commit(select, { outcomes })` → `O.pay.commit(select)`; `*.operations.ts` → `*.contracts.ts` |
| **Existing, unchanged** | `retry`, `cancel`, `idle`, `refetch`, `concurrency`, `transaction`, `resource`, `stream`, `write`, `read`, `listen`, `placeholder`, `when`, `params` (mapper context), `NotSent`, `InFlight`, `attempt`, `input`, `progress` |
| **Removed** | from revision 6: `UnmappedUnknown` (into `UnresolvedHold`), `SharedEnding`, "an interrupted unknown is delivered once and not retained", "under `cancel` concurrency a newer commit releases a retained unknown"; from revision 5: "`cancel` empties its lane", "a key-less member acts only if this turn's ending is X's", the shared `Unsure` events of 5.3 and 8.4; from revision 4: closure keys `key: (i) => ...`, M4 rule 34's `.predicts` default, "a newer commit releases a retained unknown", `Superseded` for sent Attempts, key selectors in ending handlers; from revision 3: `start(select)`, `params(select)` as a placement, `retryable(n, k?)`, the one-off read row `{ pending }` (proposed, Q21); `laneKey`; `superseded` (context and key); the Attempt's copy key and starter; lane eviction as a concept; `s.calls`; `s.activities`; the `activities` record; `keys` on activities; `SharedCopyLane`; `operations: { Module }`; from revision 2: `.emits`, `.live()`, `.each` on operations with `of`/`by`/`max`, `.joins`, `.was`, `with`, `at`, `Inactive`, record `pending`, draining, the cap, `RetainedReleased`, `Rebound`, `EachRequired` |
| **User-defined** | operation names, key selectors where no ending is in scope (`thisDoc`, `named`), memory flags (`method`) |
