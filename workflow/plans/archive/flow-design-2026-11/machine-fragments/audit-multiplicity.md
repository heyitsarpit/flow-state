# Audit: multiplicity, identity and existence

Written 2026-10-31. Scope: [machine-design.md](../../../flow/references/explorations/machine-fragments/machine-design.md) (MD), [merged/entities.md](../../../flow/references/explorations/machine-fragments/merged/entities.md)
(M4, accepted), [merged/stories](../../../flow/references/explorations/machine-fragments/merged/stories/proposal.md) (M3, revision 3), [merged/streams](../../../flow/references/explorations/machine-fragments/merged/streams/proposal.md)
(M6, accepted), [merged/entity-analysis](../../../flow/references/explorations/machine-fragments/merged/entity-analysis/proposal.md) (M5, read only), and the plans
`Operations` (Op), `Machines` (Mc), `EntityDomains` (EP), `Testing` (T), `Persistence` (Ps), `Runtime` (Rt) and
`references/design/multi-tab.md` (MT), all under `workflow/plans/flow/`. Citations are section or rule numbers, so they
survive the edits this audit made.

## 0. Why

Seven recent bugs share one root: a concept was designed for exactly one of something, and each proposal's reviewers
inherited the assumption. A lane tracked one "current" Attempt while `allow` keeps several; `.each` copies shared a
lane; a join assumed the record exists on both sides; settlement assumed one record per write; field paths assumed
one segment; a stream activity assumed one session; tabs assumed one fake server each. The last five are fixed (M5
3.3 and A9, M6 rule 47, M3 rule 11). This audit asks the same three questions of every handle, read, action, event,
record and evidence item, and fixes what it finds.

## 1. The general rules introduced

Three rules, added to the design as **N1–N3** (MD 2.4, after rule 25). Each finding below is an instance of one.

- **N1. One reference, one thing; many is a keyed list.** A declaration that can have several instances at once
  publishes them as a list in key order, each entry with `key` (`.each` copies, keyed schedules, keyed activities,
  call lanes). A read names its entry by key; a reference that can match several entries says in its name or its
  type how it aggregates (`idle` and a lane's `pending`: any outstanding Attempt; `cancel`: every outstanding
  Attempt; a row's `outstanding`: how many).
- **N2. A per-call reference names one Attempt.** `retry`, a lane's `retryCount` and a lane's `progress` address the
  lane's one **addressable Attempt**. They exist only where the transaction's `concurrency` guarantees at most one:
  `reject` (the only one), `latest` and `cancel` (the newest start). Under `allow` and `serialize` they are type
  errors: give each call its own key (a draft id, an upload ref, a client message id) and declare `reject`, so one
  lane is one call. Every Attempt carries what started it (its lane key, its starting commit value and, from a
  `.each` copy, the copy's key and incarnation), and every ending reads those from the Attempt, never from the
  transition that retried it. Every mapper receives `laneKey`.
- **N3. Existence is explicit, and every delivery to something gone has one rule.** A read of something that may not
  exist returns `undefined` when it does not (a lane never started or evicted, a copy, a record), never a default
  that looks like an existing thing. Call endings are never dropped: they route by owner (rules 8, 14, 17, 20). Raises
  and timers addressed to a dead copy are dropped with evidence (rule 9). A released stream session's deliveries are
  discarded with evidence (M6 rule 44). Anything the store keeps for an Attempt (a prediction, an uncertain mark)
  holds its record.

Why rules and not cases: correctness first (each closes a family, and a type error or a `flow check` finding enforces
it); fewer concepts (one keyed-list shape everywhere, one aggregation statement per reference); locality (an
Attempt's origin lives on the Attempt; lane state lives on the actor's snapshot); a standard upfront contract
(`concurrency`, already required, decides which per-call members exist).

## 2. The matrix

Cells: **D** defined, **U** undefined, **W** wrong, then the citation; "→ Fn" names the finding in section 3.
Cardinality is how many exist at one moment; identity is whether every reference names exactly one, or says how it
aggregates; existence and lifetime covers before creation, after deletion or eviction, after restore, after the owner
state is left, and across tabs. The state is the one **before** this audit's edits.

### 2.1 Calls

| # | Row | Cardinality | Identity | Existence and lifetime |
| --- | --- | --- | --- | --- |
| 1 | Lane (actor, transaction, key) | **D** one per key per actor, across commit values (rule 21, C8, D9) | **W** holds "the current Attempt" while `allow`, `serialize`, `latest` and `cancel` keep several (rule 21; 2.7.8) → F1 | **D** created at a start, evicted once settled with nothing retained (D11), kept with an unknown (M4 9.6.4), persists with its actor (C17), per tab (T O7) |
| 2 | Attempt | **D** one per start; several per lane at once outside `reject` (2.7.8) | **W** no reference names one Attempt except the mapper's `attempt`; `retry`, `retryCount` name "the current" (rule 21) → F1 | **D** start to admitted ending (rule 21); acknowledged before invocation (P15); restored `Restored` or `NotSent` (2.7.12); `orphaned` across versions (P19) |
| 3 | Commit value (handle) | **D** many per transaction share one lane (D9) | **W** "the lane remembers which commit value started the current Attempt": per lane, so the starter of an older outstanding Attempt is lost (rule 21) → F1 | **D** inert, no lifetime (2.7.3) |
| 4 | Lane `pending` | **D** one per lane | **D** any outstanding Attempt (rule 21) | **W** a view or Story cannot reach it (built in the machine body, M3 3.14); a never-started and an evicted lane read as a fresh one, so a wrong key is silent (D11) → F9 |
| 5 | `idle(key)` guard | **D** | **D** the guard form of any outstanding (rule 16, D5) | **D** |
| 6 | `retryCount` | **W** one number for a lane that may hold several Attempts → F1 | **W** "the current Attempt" (rule 21) → F1 | **D** 0 when there is none (rule 21) |
| 7 | `retry(key)` | **W** one target among several → F1 | **W** re-sends the newest start, not the Attempt whose ending asked; from another copy, the ending's copy is unstated → F1, F4 | **D** `NothingToResend` when none (rule 16) |
| 8 | `cancel(key)` | **U** "interrupt the lane's write" (2.7.3), singular, against Op O7's "queued and running commits" → F2 | **U** which of several → F2 | **D** per Attempt, rule 24 |
| 9 | Retry of an outstanding Attempt | **D** | **D** | **U** `Rejected` is stated only under `reject` (rule 16); under `latest` the addressable Attempt can be waiting → F3 |
| 10 | Streaming-write `progress` (M6 rule 48) | **W** "the current Attempt's last progress"; the upload walk is `allow` (M6 7.5) → F1 | **W** → F1 | **D** cleared at admission, never persisted (rule 48) |
| 11 | Lane key | **D** one record per lane (Op O1) | **U** `key` is the lane key in 2.7.2 (`attempt.key`) and the copy key in rule 9's mappers; a `NothingToResend` ending names no key (MD 7 item 6) → F5 | **D** |
| 12 | Mapper context | **D** one per ending | **U** no lane key on declined starts and `NothingToResend` (M4 maps the draft to `null`); the copy key's source on a retry → F4, F5 | **D** `input?`, `attempt?` (D17) |
| 13 | `superseded` | **D** | **D** a newer Attempt on the same key (2.7.2) | **D** |
| 14 | Declined start (`Rejected`, `Overloaded`) | **D** one ending each (rule 17) | **D** owned by the asking transition (rule 16) | **D** no Attempt (D17) |
| 15 | Owner and late routing | **D** one owner activation per start or retry (rule 14) | **D** | **D** nearest surviving ancestor (rule 14) |
| 16 | A call started in a `.each` copy's filling | **D** | **U** retried from the host or another copy: which copy's `key` its mapper gets → F4 | **W** rule 9 drops deliveries to a dead incarnation; rules 8 and 17 deliver every ending (MD 7 item 15) → F4 |
| 17 | Resource call value `read.fetch` | **U** two fetches join one request (2.7.9, Op O2) → F6 | **U** how many endings, to which owner → F6 | **D** routed like a write (rule 14) |
| 18 | `orphaned` | **D** | **D** names its Attempt by argument (P19) | **D** recorded open (MD 7 item 16) |

### 2.2 Fragments, schedules and activities

| # | Row | Cardinality | Identity | Existence and lifetime |
| --- | --- | --- | --- | --- |
| 19 | Trait instance | **D** one per name per actor (2.3) | **D** unique instance names (2.3) | **D** rule 1 |
| 20 | Subroutine | **D** one per state | **D** the state's name (2.1) | **D** fresh on entry (rule 1) |
| 21 | `.each` copies | **D** at most `max` (rule 9) | **D** string keys, incarnations | **D** final list, persisted with counters (rule 9) |
| 22 | Raise into one copy | **D** | **D** `key` in the mapper's result (rule 9) | **D** absent key: dropped or refused (rule 9) |
| 23 | Raise into every copy; several copies writing the list | **U** not expressible ([merged/each.md](../../../flow/references/explorations/machine-fragments/merged/each.md) section 4, items 3 and 4) → F13 | **D** | **D** |
| 24 | Named schedule | **D** one per node incarnation | **D** its path (2.1) | **D** P7, P11 |
| 25 | Keyed schedule | **D** one timer per key (rule 23) | **U** duplicate keys in the `keys` result → F7 | **U** restore of per-key timers is unstated (section 5's Persistence O2 row) → F7 |
| 26 | Schedules of copies | **D** | **D** `s.schedules.<name>[i]` (2.1) | **D** |
| 27 | Activity | **U** one per name: a per-key or per-copy subscription cannot be written (MD 7 item 0) → F8 | **D** | **D** Mc O6 |
| 28 | Stream session | **D** one per activity; `DuplicateSession` (M6 rule 47) | **D** | **D** released: discarded (M6 rule 44) |
| 29 | Sessions of one `listen` entry | **U** two actors in one Runtime open two sessions on one entry and key (Op O4: "Equal keys in different actors have independent sessions") → F10 | **U** M6 4.1.7's "exactly one consumer" names the store as one consumer of two sessions → F10 | **U** a gap from one session while the other is continuous → F10 |
| 30 | Stream lane `connection` | **D** | **D** | **D** M6 4.1.5 |
| 31 | Turn parts (state changers, memory keys) | **D** one state changer, disjoint keys (2.5 step 5) | **D** | **D** |

### 2.3 Entity domains

| # | Row | Cardinality | Identity | Existence and lifetime |
| --- | --- | --- | --- | --- |
| 32 | Record | **D** one per entity key per Runtime (EP O1) | **D** | **U** `Entity.get` on a tombstoned record: `undefined` "if the record is absent" (EP O2) or the typed `Deleted` (EP O1) → F11 |
| 33 | Prediction | **D** stacked per record; one Attempt over many records (EP O1) | **D** per record and Attempt (M4 E3; M5 A9) | **U** a patch over a record the store does not hold, or deleted beneath it → F12 |
| 34 | Uncertain mark | **D** per record and Attempt (rule 32) | **D** | **U** whether a mark holds its record against collection → F12 |
| 35 | Record queue | **D** per record, FIFO across actors (EP O1, rule 29) | **W** a retry joins behind its own Attempt's first send, held until the forced repair settles, so one Attempt id is two members; M3 joins members by id → F14 | **D** per Runtime (M3 3.12) |
| 36 | Answer | **D** one per descriptor and input per Runtime (Op O2) | **D** | **D** gcTime (Op O2) |
| 37 | Join (delta to answers) | **D** | **D** | **D** a side that does not exist is a definite no (M5 3.3; the create and delete fix) |
| 38 | Nested field paths | **D** | **D** dot paths matched by prefix (M5 3.3; the nested-path fix) | **D** |
| 39 | Settlement of a multi-record write | **D** | **D** per record (M5 A9; the "another record's prediction" fix) | **D** |
| 40 | Drafts (`creating`) | **D** | **D** `draftId` (rule 33) | **D** |
| 41 | `.each` string keys against record keys | **D** | **U** recorded open (M4 9.6.3, MD 7 item 0) | **D** |

### 2.4 Stories, tabs and persistence

| # | Row | Cardinality | Identity | Existence and lifetime |
| --- | --- | --- | --- | --- |
| 42 | Story checkpoint | **D** named, per run (T O4) | **D** | **D** |
| 43 | Frame | **D** per command or publication (M3 rule 14) | **D** one cause | **D** `TabClosed` (M3 rule 14) |
| 44 | Fixture | **D** one per id per run (M3 rule 7) | **D** | **D** run-scoped, shared by tabs (M3 rule 11; the fake-server fix) |
| 45 | `ending` evidence | **D** one per admitted ending | **D** by operation and `attempt.id` (M3 3.6) | **D** |
| 46 | `checkpoint.pending` Attempt entries | **D** one per outstanding Attempt (M3 3.6) | **D** | **D** |
| 47 | Lanes read by views and Stories | **D** | **W** reachable only through a commit value built in the body (M3 3.14); Q40's A moves commit values out of the machine, B reads any snapshot with any descriptor → F9 | **U** never started and evicted read as fresh → F9 |
| 48 | `calls` and `lives` | **D** | **D** key and life (M3 rules 5, 6) | **D** cumulative per cut |
| 49 | Tab and Runtime | **D** one Runtime per tab (T O7) | **D** `tab` on evidence (M3 3.4) | **D** a closed tab's evidence stays |
| 50 | Attempt ids | **D** | **D** seeded per tab and open count (M3 3.6, MT 8.4) | **D** never reused after reload (Ps O6) |
| 51 | A persisted actor in two tabs | **D** one writer; another tab runs without persistence (Ps O7) | **D** | **D** no cross-tab exactly-once, stated (Ps O6) |
| 52 | Lanes in a capture | **D** with the actor (C17, rule 38) | **W** restore under a multi-Attempt lane leaves several restored unknowns and one "current" → F1 | **D** |
| 53 | `.each` copies in a capture | **D** | **D** by key with counters (rule 9) | **D** |

### 2.5 Totals

159 cells over 53 rows: **125 defined, 20 undefined, 14 wrong**.

| | Defined | Undefined | Wrong |
| --- | --- | --- | --- |
| Calls (18 rows) | 35 | 8 | 11 |
| Fragments, schedules, activities (13 rows) | 32 | 7 | 0 |
| Entity domains (10 rows) | 25 | 4 | 1 |
| Stories, tabs, persistence (12 rows) | 33 | 1 | 2 |

(The wrong cell in entity domains is row 35; Stories' are rows 47 and 52. The calls group holds 11 of the 14 wrong
cells: the lane and its per-call members are where the single-thing assumption lived.)

## 3. Findings

Each finding: the failing sequence, the fix, and where it was applied. "Revision" means a passage marked
"Revision (multiplicity audit, 2026-10-31)".

### F1. Per-call members on a lane with several Attempts (rows 1–3, 6, 7, 10, 52) — wrong

**Sequence.** A chat `send` transaction keyed by `{ conversationId }`, `concurrency: "allow"`.

1. The user sends m1: Attempt A1, the lane's current Attempt.
2. The user sends m2: A2 replaces A1 as current (rule 21: "replaced by a start").
3. A1's response is lost: `unknown`. Its handler runs `send.retry(conv)`: Flow re-sends **A2**, m2, which is still in
   flight, under A2's id. m1 is never reconciled; m2 is sent twice concurrently.
4. A guard `send.retryCount(g, conv) < 3` reads A2's count while deciding about A1.
5. A2 succeeds: the lane clears its current Attempt (rule 21). A1's later reconcile ends `NothingToResend`; a charge
   that may have landed is reported as nothing to resend.

The same happens under `serialize` (the current Attempt is the last queued, not yet sent), under `cancel` and `latest`
(the older Attempt is superseded, which is the intended meaning there, but nothing said so), with M6's
`x.progress(s, key)` (the upload walk, M6 7.5, is `allow` keyed by `ref`: picking one file twice shows the second
upload's bar and loses the first's), and after a restore (several Attempts restore `unknown`, one is "current").

**Fix (N2).** A lane has an addressable Attempt only where concurrency guarantees one: under `reject` the only one,
under `latest` and `cancel` the newest start (an older one is superseded: its mapper reads `superseded: true`, and a
newer write's success resolves it, as the like example already does). Per-call members exist only there: `retry`,
and the lane row's `retryCount` and `progress`, are type errors under `allow` and `serialize`. A call that needs its
own status, retry or progress gets its own key and `reject`. Each Attempt, not the lane, remembers its starting
commit value (D9 kept, per Attempt).

**Flexibility.** Concurrent sends with per-message status, several uploads, and bulk writes with per-item retry all
become expressible and correct: each call keyed by its own id (2.7.11 already keys batches per item). "Anything in
flight in this conversation" is the aggregate over those lanes, read from `s.calls` (F9). What is lost: `retry` inside
one `serialize` lane (F15).

**Applied.** MD rules 21 and N2, 2.7.3 (member table, keys), 2.7.8 (a column per mode), 2.7.11 (`reject` per item),
2.7.12, C7, C8, D20. M4 3.1: `createIssue` is `reject` (it retried under `allow`). M6 7.5: `upload` is `reject`; rule 48
and 4.1.8 say progress exists only on one-addressable lanes.

### F2. `cancel(key)` with several outstanding Attempts (row 8) — undefined

**Sequence.** `serialize`: A1 running, A2 and A3 queued. `ops.cancel(key)`. MD 2.7.3 says "interrupt the lane's
write"; Op O7 says it cancels "this actor's queued and running commits for a key"; rule 24 is written for one.

**Fix (N1).** `cancel(key)` aggregates: it cancels **every** outstanding Attempt of the lane, and each ends once by
rule 24 (`NotSent { why: "Cancelled" }` before invocation, `unknown(Cancelled)` after). The name says so in the member
table. **Applied.** MD rule 24, 2.7.3.

### F3. A retry while the addressable Attempt is outstanding (row 9) — undefined

**Sequence.** `latest`: A1 in flight, A2 waiting. A1's unknown arrives (`superseded: true`); a careless handler runs
`like.retry(key)`. The addressable Attempt is A2, which is waiting. Rule 16 states `Rejected` for a retry on a pending
lane only in its `reject` sentence.

**Fix.** In every mode, a retry whose addressable Attempt is outstanding invokes nothing and ends
`NotSent { why: "Rejected" }`: one Attempt never has two sends at once (rule 18 reads a send history in order).
**Applied.** MD rule 16.

### F4. Calls started in `.each` copies (rows 7, 12, 16) — wrong and undefined

**Sequence (wrong).** Sign-in places `Lockout.each({ of: "struck" })`. A copy's filling starts a commit for challenge
c1; c1 unlocks and its key leaves the list before the ending's turn. Rule 9: "a delivery … to a dead incarnation is
dropped with evidence". Rules 8 and 17: every ending is delivered once. MD 7 item 15 left it undecided.

**Sequence (undefined).** Copy c1 starts A1 with a key that lacks the copy (`{}`); the host's `CheckAgain` retries it.
Its mapper's `key` (the copy key, rule 9): the retrier's copy (none), or c1?

**Fix (N2, N3).** Settle item 15 as recommended: rules 8, 14, 17 and 20 govern call endings, which are never dropped;
an Attempt carries the copy's key and incarnation it was started under; its ending's mapper receives that `key`; the
handler's raise into a copy that is gone follows rule 9 (dropped with evidence in a delivery turn). Two copies whose
lane key lacks the copy share one lane, which is the server promise of `reject` (D9); `flow check` warns from Story
traces when Attempts started under two copies of one placement are on one lane at once (`SharedCopyLane`), and the
per-copy read in `s.calls` needs a key field that names the copy. **Applied.** MD rule 9, 2.7.2, 2.7.3, section 4 (L2,
L6), section 7 item 15 (closed), C18, C20, D21; M3 3.4 and rule 8 (`copy` on `ending` entries).

### F5. One name, two keys; endings that name no lane (rows 11, 12) — undefined

**Sequence.** M4's list: `Retry` on a draft whose create already succeeded runs `create.retry(drafted)`, which ends
`NothingToResend`. Its mapper has no `input` and no `attempt` (D17), so `CreateFailed.draftId` is `null` and the
handler cannot say which draft (M4 3.1). Separately, `key` in a mapper means the copy key (rule 9) while the lane's key
is `attempt.key` (2.7.2), which is absent exactly when it is needed.

**Fix.** Every mapper context gains **`laneKey`**, the lane's key record, always present, because the start's or
retry's key select always ran (closes MD 7 item 6). `key` stays the copy key only. **Applied.** MD 2.7.2, 2.7.3, C6,
section 7 item 6 (closed), D21; M4 3.1 (`CreateFailed.draftId` is no longer nullable).

### F6. `read.fetch` joining a running request (row 17) — undefined

**Sequence.** READING polls with `read.fetch(key)` on `PollTick`; the root handles `Refresh` with `read.fetch(key)`.
Both run while one request is in flight; Op O2 joins them. Does each get an ending? If only one does, the other
state waits with nothing pending (the silent decline D5 removed for writes); if both, which owner did the request's
ending belong to?

**Fix.** Each `fetch` action is its own call: one ending per action, owned by its own transition (rule 14), even when
the request below is shared. **Applied.** MD 2.7.9, C5.

### F7. Keyed schedules: duplicate keys and restore (row 25) — undefined

**Sequence.** `keys: ({ memory }) => memory.rows.map((r) => r.ownerId)` returns `["a", "a"]`: one timer or two? A
reload: Persistence O2 restores "schedule deadlines"; per key?

**Fix (N1).** A duplicate key keeps its first position, with `listRepair` evidence (rule 9's repair, never a refusal);
per-key timers persist by key with their `dueAt`, and on restore the after list of the restored memory wins, as for
copies. **Applied.** MD rule 23, section 5 (Persistence O2 row).

### F8. One subscription per key (row 27) — undefined, a flexibility gap

**Sequence.** A watchlist shows a live quote per row; sign-in's challenges would each want a status stream. An
activity is named, so one name holds one subscription (MD 7 item 0; [merged/each.md](../../../flow/references/explorations/machine-fragments/merged/each.md) 4 item 1).

**Fix (N1).** An activity may declare `keys`, as a schedule does: one subscription or session per key of the after
list, started when a key appears and released when it leaves; `s.activities.<name>` is a keyed list; params and
mappers receive `key`. Two keys whose params project one descriptor key are M6 rule 47's `DuplicateSession` for the
later key. **Applied.** MD 2.7.10, rule 23, section 5 (C19, Machines O6), section 7 item 0; M6 rule 47 and M6-D7.
Needs the owner (new surface).

### F9. How views and Stories read a lane (rows 4, 47) — wrong; the lane-read decision

**Sequence (wrong).** A view needs "Saving…" (`like.pending(s, { id })`, M4 2); a Story needs a lane at a frame
(M3 3.12). Both need the commit value, which is built inside `machine(Def, ({ O }) => …)` and unreachable. M3's Q40
proposed exporting commit values (A) or a descriptor read (B).

**Sequence (undefined).** `pay.pending(s, { intentId: memory.selectedId })` where the start used `event.intentId`: the
lane never exists under that key, and the read says `false`, the same as "settled".

**Decision: (2), lanes are plain snapshot data, `s.calls`, beside `s.activities`.**

```ts
s.calls.Stripe.confirm          // keyed transaction: a keyed list, in start order, of the lanes that exist
// → [{ key: { intentId: "pi_1" }, pending: true, retryCount: 0 }]       reject, latest, cancel: one addressable Attempt
s.calls.Chat.send               // allow or serialize: no per-call fields (N2)
// → [{ key: { conversationId: "c1" }, outstanding: 2 }]
s.calls.Accounts.create         // unkeyed transaction: one row, or undefined
// → { pending: false, retryCount: 1 }
s.calls.Assistant.generate[0].progress   // a streaming write's progress (M6 rule 48)

useView(list, (s) => s.calls.Issues.setLike.find((l) => l.key.id === id)?.pending ?? false)    // "Saving…"
guard: ({ calls, memory }) => (calls.Stripe.confirm.find((l) => l.key.intentId === memory.intentId)?.retryCount ?? 0) < 5 || deny("ChecksLeft")
guard: [pay.idle(key)]          // the guard stays on the commit value: one standard code, InFlight
```

- A row exists while the lane does: something outstanding, or (one-addressable modes) a failed or unknown Attempt
  retained for `retry`. A lane never started, or evicted, has no row (N3). Under `allow` and `serialize` nothing is
  retained, so a lane is evicted as soon as nothing is outstanding, and its row is `{ key, outstanding }`.
- The row carries no Attempt, no input and no last ending, as rule 21 and D6 require.
- The commit value keeps `retry`, `cancel` (actions) and `idle` (the guard, D5). Its `pending` and `retryCount` reads
  go: one fact, one place.
- Guards receive `calls` (Mc O4's list gains it); `check()` on an old snapshot reads that snapshot's own rows (Mc O8);
  a Story frame carries them; playback renders them.

**Reasons.**

- **Correctness.** A wrong-actor read is a type error: `calls` is typed by the snapshot's own definition, so a
  snapshot of an actor that does not declare the operation has no such field (B's silent `false`). Absence is
  `undefined`, so a never-started or wrongly keyed lane is visible as absence, not as "idle". "This call" and
  "anything on this key" are told apart by the row's type (N2). Views, guards, `check()` and Stories read the same
  published value, so they cannot disagree.
- **Locality.** Lane state is a fact about the actor, so it lives on the actor's snapshot, next to the activity lanes
  that Op O6 already puts there. The commit value stays where its select is typed, in the machine body (A moved it out
  and lost that, and made every view module import machine internals).
- **Fewer concepts.** No `Definition.O`, no descriptor read, no `Machine.lanes` namespace: the same keyed-list shape as
  copies and keyed schedules, read with `find`.
- **Rejected.** (A) exported commit values: breaks locality and select typing. (B) `O.x.pending(s, key)`: silent
  wrong-actor and never-started reads, and it restores the descriptor read C7 removed. (C) `Machine.lanes.x.pending(s,
  key)`: correct, but a namespace and a call where data suffices. Keeping `pay.pending` as sugar beside `s.calls`: two
  spellings of one fact.
- **Cost.** A keyed read is a `find` over plain data instead of a call. That is the spelling copies and keyed
  schedules already use.

**Applied.** MD rule 21, 2.1, 2.5, 2.6, 2.7.3, 2.7.5, 2.7.6, section 5 (C7, C8, Machines O4, Machines O8), 3.6,
D18, D19. M3 2, 3.6, 3.12, 3.13, 3.14, rules 8 and 17, 6.1, 6.4, Q21, Q40, keywords. M4 2, 3.1. M6 4.1.8, 7.4, 7.5,
rule 48, 6.1, keywords.

### F10. Two sessions of one `listen` entry (row 29) — undefined

**Sequence.** The ticket queue and a ticket detail panel are two actors in one Runtime; each subscribes
`O.Tickets.events({ workspaceId: "w1" })`. Op O4 gives each its own session: two sockets. Every push is applied twice
(harmless: saves are whole-field and deletes idempotent, M6 4.2). The detail panel's socket drops and reopens
`Unproven`: every covered answer refetches although the queue's session stayed continuous. Without versions, the
lagging session's older duplicate repositions a field until a contest refetches it.

**Fix.** M6 rule 49 states it: each live session of a `listen` entry is its own source; any session's gap lowers the
frontiers it covers; `flow check` warns (`DuplicateListen`) when two actors' activities can hold sessions of one
`listen` entry on one key in one Runtime, and the recipe is one owning actor while others read the store. Whether
Flow should instead share one session per Runtime, as resources share requests (Op O2), is for the owner (section 5).
**Applied.** M6 rule 49, 4.2, M6-D6.

### F11. A deleted record read at a cut (row 32) — undefined

**Sequence.** A Story asserts that a delete landed: `Entity.get(cut, { id: "i1" })`. EP O2 returns `undefined` for an
absent record; EP O1 says a reference to a deleted record reads a typed `Deleted`. A tombstone is neither absent nor
present, so "deleted" and "never loaded" may read the same. **Fix (recommended, not applied: an EP decision).**
`Entity.get` returns `Deleted` while the tombstone lives and `undefined` after it is collected. M3 3.12 notes the
question. Needs the owner.

### F12. Predictions and marks without a base (rows 33, 34) — undefined

**Sequence.** `Delete(i1)` (A) heads i1's record queue; `Edit(i1)` (B) joins behind it. A succeeds: i1 is a tombstone.
B's patch is replayed over a base that does not exist; M5's field function `(beneath, input)` would be called with
nothing beneath. The same happens for a rename of a record opened by a deep link before any read held it.
Separately: a record whose uncertain mark remains can be collected once nothing reads it, losing the mark.

**Fix (N3).** A patch over a record the store does not hold shows nothing (the record reads absent); its prediction
stays with its Attempt for queue and settlement, and its field functions are not called until a base exists. An
uncertain mark holds its record, as a prediction does. **Applied.** M4 rules 30 and 32, E18. Merge 5 needs one
sentence (section 4).

### F13. Raising into every copy; several copies writing their list (row 23) — undefined, a flexibility gap

"Acknowledge all" cannot be one raise, and two copies' callbacks that each remove themselves in one turn overlap
(2.5 step 5). **Not applied:** no case in the design needs it yet ([merged/each.md](../../../flow/references/explorations/machine-fragments/merged/each.md) 4). The N1 form
would be an aggregate address, `E.<name>.all.Event()`, and list edits (`remove: [key]`) that compose. Left to the
owner, unchanged in MD 7 item 0.

### F14. Record-queue members named by Attempt id (row 35) — wrong

**Sequence.** An unknown Attempt A holds i1's queue until its forced repair settles (rule 30). The handler of A's
ending retries it at once: the retry joins the tail (rule 31). `Entity.queue(cut, { id: "i1" })` now lists A twice,
and M3 joins a member to its `pending` and `ending` entries "by id". **Fix.** A queue member is one send:
`{ attempt: { id, retryCount } }`, as `ending` entries already are. **Applied.** M3 3.12 and rule 16.

### F15. `retry` inside one `serialize` lane — a flexibility cost of F1

An ordered op log (one lane per document, `serialize`) cannot retry one unknown op by key. That is honest: re-sending
an op after later ops were sent reorders the log, which is a reconcile decision. **Not applied:** an Attempt-addressed
retry (`ops.retry.of(({ event }) => event.attempt)`, with the Attempt reference carried in the event) would restore it.
Left to the owner (section 5).

## 4. What merge 5 needs

Merge 5 was not edited (another agent holds it). These are its changes, for when it next opens:

1. **A9 (replay), 3.4, and the EP O1 (EDP:64-70) amendment:** "A field's function is called only over a record the
   store holds. A patch over an absent record (never held, or deleted beneath it) shows nothing, stays with its Attempt
   for queue and settlement, and is called when a base arrives" (F12, M4 rule 30 as revised).
2. **3.7 `flow explain`:** the commit line should print the lane's cardinality from `concurrency`
   (`one addressable Attempt per lane` or `outstanding count only`), and the lane key, so an agent sees whether
   `retry` exists (N2).
3. **The rule 34 sentence for `many` keys** (6.4, merge 4 row): add "such a write's lane key is declared or `{}`; with
   `allow` or `serialize`, `retry` is a type error (N2), so a bulk write that must be retried declares a per-call key
   and `reject`".
4. **3.3, first sighting:** say "per Runtime" (each tab's store sees a record for the first time on its own; MT 8.1).
5. **Citations.** This audit's edits shifted M4's lines. The other merges' line citations into MD, M4 and M3 were
   re-pointed mechanically from the diff; M5's were not, and need these replacements: `M4:74` → `M4:75`,
   `M4:125-128` → `M4:128-131`, `M4:127` → `M4:130`, `M4:303-306` → `M4:306-309`, `M4:606-608` → `M4:614-616`,
   `M4:624-625` → `M4:632-633`, `M4:650` → `M4:658`, `M4:884-887` → `M4:892-895`.
6. **3.8 migration table, merge 4 row:** M4 3.1's `createIssue` is now `reject` and `CreateFailed.draftId` is not
   nullable (E17); nothing in M5 depends on either, but the "only change anywhere" sentence should still hold after
   M5 is re-checked against the revised list.

## 5. Decisions that need the owner

1. **The lane-read decision (F9)** is applied as (2). It supersedes the read half of D4 and D6 (D18) and D11's read
   sentence (D19). Confirm.
2. **Per-call members by concurrency (N2, F1)**: `retry`, `retryCount` and `progress` are type errors under `allow`
   and `serialize`. Confirm, and say whether an Attempt-addressed retry for `serialize` (F15) is wanted later.
3. **`.each` call endings (F4)** close MD 7 item 15 with its own recommendation. Confirm.
4. **`laneKey` in every mapper (F5)** closes MD 7 item 6. Confirm the name.
5. **Keyed activities (F8)** are new surface (MD 2.7.10, M6-D7). Confirm or defer.
6. **`listen` with two sessions (F10)**: the warning is applied; sharing one session per Runtime is not. Choose.
7. **A deleted record at a cut (F11)**: an EntityDomains decision, recommended `Deleted` then `undefined`.
8. **Raise into every copy (F13)**: still open.

Accepted decisions this audit superseded, each recorded in its document's decisions section:

| Document | Old | New | What changed |
| --- | --- | --- | --- |
| MD | D4 (members `pending`, `retryCount`) | D18 | the reads move to `s.calls`; the commit value keeps `retry`, `cancel`, `idle` |
| MD | D6 (lane read through the commit value) | D18 | the same two facts, as snapshot data |
| MD | D9 ("the lane remembers its starter") | D20 | each Attempt remembers its starter |
| MD | D11 (an evicted lane reads as fresh) | D19 | an absent lane has no row; `allow` and `serialize` lanes evict when nothing is outstanding |
| M4 | E2, E7 (`x.retry(key)` the one re-send) | E17 | only where a lane has one addressable Attempt (N2) |
| M6 | M6-D4 (progress a read, `x.progress(g \| s, key)`) | M6-D5 | the read is the `s.calls` row's `progress`, on one-addressable lanes only |

New decisions that supersede nothing: MD D21 (copy-started calls, `laneKey`), M4 E18 (absent bases, marks hold
records), M6-D6 (`listen` sessions), M6-D7 (keyed activities and `DuplicateSession`). Merge 3 is not accepted; its Q21
and Q40 are revised in place.
