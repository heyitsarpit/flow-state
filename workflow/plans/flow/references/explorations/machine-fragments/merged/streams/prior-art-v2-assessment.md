# `proposal-v2.md` (revision 7.1) as prior art: an honest assessment

Status: **advice, written 2026-11-01. Nothing here is decided.** Verdicts are proposed. Requirement ids (G11, R4, ...)
are in [requirements-v3.md](requirements-v3.md).

## 1. Verdict in short

The core idea is good and worth keeping as prior art: an adapter tells Flow what only it can know, Flow keeps the rest
honest, and the row cannot show stale data by accident. The tables were checked hard, and the model's results are real
evidence. What is not good is the accumulated rim around three questions: "does this connection owe anything?",
"how do pages and a live socket join?", and "what does a latest-value feed do with fact words?".

| Hypothesis | Verdict | Basis |
| --- | --- | --- |
| (a) First registration uses three concepts for one question, patched across reviews 3, 4, 5 | **Confirmed.** One persisted fact is really needed; the rest is patch residue. One real case remains that a simpler rule must answer: a snapshot read with no position | Review history; existing surviving mutant; reasoning. New probes not finished (section 2) |
| (b) `buf`, `seen`, `tail`, `meet` may be unnecessary | **Half right.** `seen`, `tail` and P3 are unnecessary for correctness. `meet` is optional, a small efficiency gain. **`buf`, holding live items until the repair ends, is necessary.** At-least-once does not excuse removing it, because the failure is a hole, not a duplicate | Probe, run to completion (section 2) |

## 2. What I ran and did not run

Model copied to the scratchpad and patched with switches. The repo's model was not edited.

**An incident to report.** I ran up to five `bun main.ts` at once. At about 8 GB each this hung the owner's MacBook, and
the coordinator stopped them. I should have checked memory first and run them one at a time. After the coordinator's
message I started no more model runs. **So the three first-registration variants and `dropsock` below did not finish.**
Their rows say what they rest on instead.

| Variant | What changed | Finished? | Result (depth 9, bounded) |
| --- | --- | --- | --- |
| `base` | Nothing | yes | All pass; also printed the state `catchUp` case below |
| `nomeet` | Buffer kept and flushed whole; no meet, no `seen`, no `tail` | yes | **Only I13 fails** (a position emitted twice). I23 (no holes), I5, I21, I22, I4 pass |
| `meetonly` | Meet kept; no `seen`, no `tail` | yes | **Only I13 fails** |
| `nobuf` | Live items pass straight through during a repair, position advances | yes | **I23 fails** (a hole), I13 |
| `nobuflast` | Live items pass through; the adapter's position stays with the pages | yes | **I23 fails**: the machine's own cursor passes the hole |
| `dropsock` | Live items discarded during a repair | **no** | By reasoning: a hole between the last page and the first kept live item. Not run |
| `freshany` | `fresh` with no declared `from` | **no** | Existing result stands: this mutant is the one survivor in `mutations-output.txt` line 107, depth 8 |
| `freshany+neverignore` | Also no `initial` guard | **no** | Reasoning only (section 6) |
| `nofresh+ignoreinitial` | No `fresh`; handler ignores `initial` | **no** | Reasoning only (section 6) |

Under the `duptol` switch the hole check was loosened so a duplicate is not called a hole, which is the point being
tested; this is my reading of I23, not the model's text.

Limits. Bounded: positions up to 3, buffer 2, 9 inputs, one covering session. The model's server pages ascending and
registers at the signal. Nothing here says anything about real SDKs. Nothing was compiled against Effect by me. I read
`proposal.md` only through its outline, its alternatives list and comparison.md, not in full; I read the first review's
response only in part. I read the audit by searching for stream rows, and the desk's README by its gap and status rows.

Probe files: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s2a/`
(`patch.py`, `out-*.txt`, `sum-*.txt`).

## 3. What the owner may have liked, plainly

**A row that cannot lie.** `value` is empty unless current. To show stale data you must write the word `last`.

```ts
const row = useView(watch, (s) => s.operations.price)
row?.value                 // the price right now, or undefined
row?.last?.value           // the old price; you had to ask for it
row?.last?.at              // when it was last known true
row?.connection === "Live" // works in every phase, even when not placed
```

**A Wi-Fi blip is not your problem.** No machine state; the row dims and comes back.

```ts
LIVE: { activities: [O.messages.subscribe(({ memory }) => ({ roomId: memory.roomId }))] } // that's all
```

**The adapter says three plain things.**

```ts
Feed.live()                                  // the server is listening; nothing proven
Feed.live({ proof: "server replayed from 8:41" }) // you must write why
Feed.down(reason)                            // it dropped
```

**The meaning sits on the contract** (`delivers: "every" | "latest"`, S11), so removing a handler cannot change what a
feed means.

**A streaming write stays a write.**

```ts
commit: (input, { progress }) => /* ... */ progress({ text })  // no turn per token; callable from XHR callbacks
const text = useView(chat, (s) => s.operations.ask.progress?.text)
```

**Forgetting is a compile error.** An unhandled every-value feed does not type-check. **Stories run the real adapter**
over a fake socket. **Repair costs no machine state**, one `catchUp` option.

## 4. Signals (`Feed.live`, `Feed.down`, values, in-band)

- **Good, keep.** Order with values is automatic, which removes a whole class of race. A plain Stream still works
  (M6-D2). Maps onto every SDK studied, adding sources without concepts (Ably `attached/resumed`, Socket.IO `recovered`,
  Electric `up-to-date`, Phoenix join). The desk built socket, SDK and polling sources on them.
- **Not good.** Being items in the value stream is what creates the callback queue's signal groups and I25, and it means
  `Stream<A | Feed.Signal<D, P>>` appears in common service types. A `down` also sits behind up to `bufferSize` queued
  facts, so the row can read `Live` while those turns run (CMP 6.1; bounded, not a loss). Polling must write
  `Stream.prepend([Feed.live()])`, which means little for a poll (desk technicians; RV3 L5). The hello-to-signal
  translation is repeated per adapter (desk REVIEW item 16).
- **Costs.** 3 signal forms, `Feed.Signal` in types, a merge rule.
- **Earned?** Yes. Prevents FC31, FC55, FC64 and the status-eviction FC26. An out-of-band status channel would need its
  own ordering rule, not simpler. The group merge is the price (X10). Whether "status as a separate channel plus a
  sequence number" is simpler is an open design question, not settled here.

## 5. Two facts per connection, and `proof`

**Two facts.** Good, keep the idea (G8). Revision 2's one bit broke (RV1 M1, MDL F11, F13): a list could read fresh while
pages carrying deletes had not arrived. Cost: the answer enum has 8 values (`none, proven, fresh, pending, unproven,
lost, reset, abandoned`) that tooling shows. **Earned**, though `fresh` and `pending` are Flow's own, and `lost` and
`reset` could be one answer with an optional new position; `reset` differs only by `restartAt`.

**`proof`.** Good: a required string makes the claim visible and greppable (G5). Not good: any string passes. CMP 3.3
caught v2's own sample proving on a `hello` with no replay, and the two-sentence meaning (the span since the last value
delivered, plus "what follows is everything") is hard, and differs per kind. A state `proof` means something else
entirely ("the value I last confirmed is still current"), and one word covers both, with `own` guarding it. **Earned for
every-value feeds** (FC21, FC65 made visible, not prevented). **Doubtful on latest-value feeds**: only Electric uses it
there; the common cure for FC53 is a server re-sending state. Mostly the desk's own translator is the single place
`proof` is written, which suggests absorption.

## 6. `Feed.reconnect`

- **Good, keep.** The budget measured from registration (`resetAfter`, S5) really kills the flapping case (FC41, I12).
  Mirrors `Effect.retry({ schedule, while })`. Absorbs what every app repeats. Announcing every connection closes FC64.
- **Not good.** It is a 5-phase, 14-input, 32-cell state machine inside "adapter code", with its phase piped to
  Inspection (SR38 needs that pipe). Half of it is `catchUp`. Recipe S sometimes wraps it just for terminal failures, and
  sometimes not at all (desk Presence: no `Feed.reconnect` "because it would add a second retry"), so which to use is a
  real decision an author must learn. A raw socket still needs 22 lines of hello deadline, idle deadline, `highWaterMark`
  and classification, and the desk got this wrong (S-H1, unbounded). `while` and `schedule` repeat per contract.
- **Earned?** The core yes. Without `catchUp` it would be about 8 cells. The simpler rule for the budget does not exist:
  Effect's own `Stream.retry` reset is the bug (A25).

## 7. First registration: `fresh`, `registered`, `initial` (hypothesis a)

**The question is one: does this connection owe the consumer anything?**

| Round | Patch | What it fixed |
| --- | --- | --- |
| RV2 H1 | `fresh` | Every first load showed "may be missing" |
| RV3 H1, S8 | Needs a declared, empty `from` | Socket.IO and Ably lost across sessions |
| RV3 M1 | `Dropped × fresh` | Offline start showed a false notice; **this introduced RV4 H1a** |
| RV4 H1, S9 | `announced`, `initial`, `head` precondition | Quiet connection, drop, reconnect lost items |
| RV5 H1, S10 | `registered` persisted per slice; `initial = ¬registered`; `announced` gone | Same loss, across sessions |
| rev 7.1, MDL N1 | A value also sets `registered` | Same family |

Five patches, each correct, one regression, and the same root named three times. **This is what "design by convergence"
says to redo from scratch.**

**Cost.** Concepts: an adapter *offer* (`fresh`), a Flow *record* (`registered`), a *flag* for authors (`initial`), plus a
type rule (`from` with `position`), an author precondition (pass `head`, write defined cursors), and an author guard:

```ts
guard: ({ memory, event }) => (event.why === "Unproven" && event.initial && memory.messages.length === 0) || deny("HoldsOrRejoined")
```

That guard is an algorithm in author code (DG2), written per feed. The desk wrote it (`feed.machine.ts`) and it is the
line most likely to be wrong; mutants RV4 H1 and RV5 M2 are both versions of it.

**What is needed.** Walking the failures:

- One durable fact is really needed: "this memory has been listening on this key before". RV5 walk 2 shows it cannot be
  derived from the position, since a quiet feed has none. **Keep this fact** (unless the first connection yields a
  position, which many sources cannot give).
- With that fact, `from` undefined, and a registered start, Flow can decide alone. The declared-`from` rule then
  adds nothing: **its mutant survives in the model since revision 7** (depth 8, an existing result).
- `initial` exists for the no-`from` branch of that same rule. If the rule no longer needs a declared `from`, an initial
  unproven `missed` is not delivered under `Feed.reconnect` at all, and `initial` is left only for sources without it. I
  did not finish the probe of this (section 2); this is reasoning.

**The failing case a simpler form must answer.** A source with no positions, whose consumer read a snapshot first: a
Socket.IO room with a REST history. First registration ever, memory holds items, no `from`. A message posted between the
read and registration is lost. Today `initial && empty` catches it, since memory is not empty. "Never registered, so
fresh" would be silent loss (FC13). So a simpler rule needs the consumer to say "I read first" in some other way
(requirement G12). Also, **SSR**: see section 16.

**Verdict: confirmed.** Three concepts where one fact plus one stated exception should do. Did it earn its place? The
fact, yes. The rest prevented reviewed failures only because earlier patches were narrow. A designer gets the
requirements G10–G15 and P5, not these words.

## 8. `catchUp` and its merge (hypothesis b)

**Good, keep.** The ordering problem is real and not expressible as a signal. Repair costs no machine state: 77 lines
against A's 110, which carried `OWED`, `merge` and `advance` in author code (CMP 4). Retries with the socket open (FC23).
`Feed.CannotRepair` is a good idea (R10).

**Each piece, tested.**

| Piece | Prevents | Simpler form hits a failure? | Verdict |
| --- | --- | --- | --- |
| Registered before reading | FC51 | Yes: mutant I23 | Keep (R8) |
| **`buf`** | A live item passing the hole | **Yes.** `nobuf` and `nobuflast` fail I23. Trace: `server append, inner proof, inner live, server append, inner value`. Even if the adapter's position waits, **the machine's handler writes the cursor from that item**, then a reload resumes past the hole, silently | **Keep the behaviour (R4)** |
| Abandon without emitting | RV1 H1 | Yes: mutant I21, I23 | Keep |
| `meet` | Duplicates; pages read past need | `nomeet`: only I13 fails. No hole, no stuck repair in scope | Optional |
| `seen` | A late socket value after a page delivered it | `meetonly`: only I13. Trace: `inner live, server append, page ok, inner value` | **Cut for correctness** |
| `tail` | Same, with an empty buffer | Same | **Cut for correctness** |
| P3 | Only `seen` and `tail` | Falls away | **Cut** |
| P1 | Meet with `continueAt` | Falls away without meet, as far as reasoned | Likely cut |
| P0, oldest first | RV3 H3 | **Stays.** The hole is the position moving ahead of unread pages | Keep the requirement (R16), not necessarily the author obligation |
| P2, read sees up to registration | Replica lag hole | Stays: it is a true server contract | Keep, say it plainly |
| Empty-run rule | Infinite pager | Stays in some form (R11) | Keep the bound |

**Why at-least-once does not cover `buf`.** Hypothesis (b)'s reason is right for duplicates and wrong for order. A
consumer storing by id survives seeing an item twice. It cannot survive a cursor written past items it never saw. That
is FC22 and RV1 H1, and it is silent.

**What removing dedupe costs, honestly.**

- A consumer that is not idempotent (an unread counter, a toast per message) sees up to a buffer's worth of duplicates per
  repair. But these consumers are already wrong: replay across a reload duplicates too, and 2.7 says store by id.
- The list may briefly show an older version: pages deliver `8 (v1), 10 (edit to v2)`, then the flush repeats `8 (v1)`, for
  a few turns, then `10`. It settles correctly, and the cursor moves backward safely. A view may flicker.
- Extra reads with no meet. Worked by arithmetic, not run: gap 5,000 items, pages at 500/s, room at 100/s. With meet, the
  repair ends at the fixed registration point after 10 s, holding 1,000 items, just inside a 1,024 bound. Without, it chases
  the head: 5,000 / (500 − 100) = 12.5 s, 1,250 items: **overflow, then a repeat**. So meet has real but marginal value on
  busy rooms. It is also one rule; `seen` and `tail` are the bulk.

**What's not good otherwise.**

- The pager is bait. `Stream.paginate`'s step shape makes `Option.fromNullable(next)` the natural line. RV1 M5 predicted
  it and **the desk made the mistake (S-M3)**, plus an un-aborted request (S-M2). Two misuses in the one place it was used
  (COVERAGE T1).
- Four preconditions an author can't check, and a mismatch is either a hole (P0) or duplicates.
- `continueAt`'s meaning needed a review to define (RV3 M3).
- Hidden: the read has no lane, no row, no `Story.ending` (CMP 6.3). Reached Inspection only by a side channel.
- `catchUp` in the adapter can't be used by `listen`-style entries in a useful way, and repair of a full state is not
  possible (R20).
- **Is it earned?** The concept yes. The current 3.4 form carries more than correctness needs (`seen`, `tail`, P3). Note S3 is re-judgeable (S12).

**The merge principle's own history.** Revision 3's ring (bad), revision 4's meet (`MDL N2`), rev 4.1's `seen` on arrival.
Each fixes I13 only. All that work protected a guarantee (no dup within a session) no consumer may rely on anyway.

### `catchUp` on a `latest` feed

**Not forbidden, and unsafe.** 2.3 and 3.4 are kind-blind; the type allows it; the model runs it (`R+S[catchUp]/state`) and
passes, since no invariant compares a value with the server's head. Replaying the sequence
`server append, server append, inner live(), page ok (more)` on the base model prints:

```text
server head 2; phase CatchingUp; session Live, answer pending, confirmed true, last 1, heard 1
```

So value 1 from history reads as **current** (`row.value`) and is **heard by the machine**, while the server is at 2. A
price alert can fire on an old price, which is exactly what SR21 forbids. No review walked it. No sample does it, which is
why it survived; a mistaken agent could. It should be a type error. The wider point: `from`, `position`, `catchUp`,
`lost`, `restartAt` are every-value words reachable on a latest feed through one combinator. `reset` and `lost` on a state
feed do nothing visible. Requirement F6.

## 9. `Feed.callback`

- **Good, keep.** Bounded by default, synchronous `emit` from any SDK, `emit.fail`, `emit.end`, finalizers awaited, a no-op
  after release, and the awaited promise (desk typing: 400 messages on a 256 bound, no overflow; S7 Q20).
- **Not good.** An `emit` that returns a promise that may never resolve (full case) is a surprising contract, and
  most callers ignore it (`void emit(members)` in the desk). Its bound is per value on latest feeds too, where a latest-wins
  slot would never overflow. So a state feed can overflow and reconnect for no reason (RV2 s9 sets `bufferSize: 8`
  needlessly): this looks like a flaw that nobody listed. Nothing forces authors to use it: the desk's first adapter used
  `Stream.callback` (S-H1, limit FC34).
- **Earned?** Yes for the bound. The group merge is a cost of in-band signals.

## 10. Delivery

- **Good, keep.** One per turn in order; a state slot; one reconcile point (RV1 H2's fix is the most valuable state-feed
  idea: what's current and what's heard can't diverge). Outside the mailbox cap (FC32). `failure` waits behind the item in
  flight. A state ending's last value is shown, not heard.
- **Not good.** `Q`, `inFlight`, `slot`, `slotConn`, `queued`, `heard`, `reconcile`, are a lot of internal state, though
  no author sees it. The word "pump" collides with Stories (SC 11).
- **Earned?** Yes. All were found by running the model (MDL F1, F2, F3, F12).

## 11. The row

- **Good, keep.** The best part of the design. `connection` on every phase fixes a real compile failure (FC50). `value`
  absent unless current. `last { value, at }` as an age across clocks (RV1 M14). Fact rows have no `value`.
- **Not good.** The most natural view line, `row?.value ?? row?.last?.value`, is two reads and a dim check, in every view;
  desk badge logic repeats (REVIEW 17). A fact row's `last` has little use. `drop` exists on `Connecting` only, so
  "Connecting" and "Reconnecting" are told apart by a field, not a phase. Rows in keyed lanes were misread by the desk
  (S-H3), a general hazard. `value` confirmed during a repair is the section 8 hole.
- **Earned?** Yes.

## 12. `missed`

- **Good, keep.** Type-required, one line for smallest correct handling, delivered before anything newer. Principle 1
  (one interruption, one answer) ended a family of findings.
- **Not good.** Every app declares the same event schema and maps it (desk ×2; open-items 15). Handlers mostly write a
  notice. Ephemeral feeds are still forced to write it (`MayHaveMissed: { target: "self" }`, desk typing). `why` plus
  `initial` plus `restartAt` leaks the draft. `cursor: event.restartAt ?? memory.cursor` is an author line that exists
  only because of S4.
- **Earned?** The outcome yes. Its payload is bigger than needed. Hand-written `restartAt` storage is a failure waiting
  (FC46 "across sessions the handler stores it").

## 13. `failure` maps

- **Good.** Exhaustive by tag: `SignedOut` cannot be forgotten, and a new typed error is a compile error (rule 37's
  pattern). `Overflow` was a real gap (RV2 M1).
- **Not good. A real case:** desk `feed.definition.ts` has this block twice, `presence.definition.ts` twice more (5 keys),
  each mostly one event:

  ```ts
  failure: { SocketDropped: E.FeedEnded, SignedOut: E.SessionExpired, Closed: E.FeedEnded, Overflow: E.FeedEnded, Defect: E.FeedEnded, Interrupted: E.FeedEnded }
  ```

  The ticker's version repeats `.from((_e, { key }) => key)` five times. REVIEW items 13–14 name this "absorb". A reader
  sees six entries to find the one that matters.
- **Costs.** No new concept, six lines per feed: common-tier noise.
- **Earned?** Exhaustiveness earned its place; repetition did not. **A simpler rule:** Flow's four own reasons (`Closed`,
  `Overflow`, `Defect`, `Interrupted`) have no app-specific meaning in any desk case, so they could share one entry. **But
  a catch-all across the author's tags too would hide a new terminal error** (A9), so the safe cut is narrower than REVIEW's
  `rest:` suggests. No failure in the reviews needs those four to differ; I did not find a case where they do.

## 14. `listen`

- **Good, keep.** Principle 3: freshness as a function of the present and dated gaps ended MDL N1's family. Fails safely.
  First-live race handled. No record-queue entanglement. Machine handles endings only.
- **Not good.** Cannot keep a position, so every re-entry refetches even with a perfect server (RV1 M12). So the desk opens
  **two connections to one workspace socket**, one per contract, because the protocol has no channels and `listen` needs
  one contract while activity needs a cursor (README "`listen` keeps no position"). Two sessions on one key get applied
  twice, and one's gap lowers both (F10). A short transient fresh window (RV3 L6). A stale-set function over released
  sessions needs retained `lastGap`s.
- **Earned?** Yes, but one-feed-many-consumers is the unaddressed gap (E9).

## 15. Streaming writes

- **Good, keep as is.** The cleanest part: a transaction, a synchronous `progress(p)`, per Attempt, no turn, never
  persisted. 4 cells. Used twice in the desk without a design problem (S-H3 was a keyed-lane read). `upload` and `Stop` work.
- **Not good.** The commit body is 25 lines every LLM app writes (stall deadline, terminator, `Truncated`), and the
  nine-key `unknown` map (REVIEW items 2, 18). Streamed output that must drive a machine has to become a separate
  every-value feed.
- **Earned?** Yes.

## 16. Lifecycle, release, persistence, SSR

**Lifecycle and release.** Good: activation ownership with a real reason (a lane holds an obligation, a session only
interest). Release-before-restart. Not good: the identity and the wait were conflated (RV3 H2, then RV4 M1 regressed it),
now two named rules. `ReleaseOverdue` is unreachable from `Fake.webSocket` (2.10.9). Effect's socket finalizer doesn't wait.
**Earned**, stated plainly it's one rule: "no two live on one (slot); a successor waits for a closing one".

**Persistence.** Good: per-kind table, no baseline on facts (FC25), ages. Not good: S4 puts position writes in every
handler, plus the `head` and `event.cursor ?? memory.cursor` preconditions, written twice with the contract's `position`
(open-items 15's origin). **S4 is the root of several patches** and is worth re-judging: a position Flow advanced at the
same commit as the fact's turn would remove those lines. Its objection (Flow compares positions) does not apply to
*storing* one. Stated as a question, not a decision. Note a consumer's handler can write cursors out of order under
duplicates, which is safe.

**SSR. A gap I found by reading, not walked by a review:** 2.10's first table saves `registered` "with a persisted
actor". The SSR paragraph transfers "memory as memory" and a state row's `last` and `heard`; **`registered` is not
mentioned**. If memory holding items hydrates but `registered` does not, a positionless feed's first client start is
`fresh` with no `missed`. Items between capture and registration are lost silently. Positioned feeds with a cursor are
safe. The desk avoids it because its server never ensures a feed. Requirement P5.

## 17. `flow check`, Inspection

- **Good, keep.** Findings from tokens and data. One deliberately wrong file per finding in the desk. Bounded evidence.
- **Not good.** `UnprovenValues`, `RegistrationChurn` were not exercised by a real failure. Word count of read-only
  tooling is 15. Nothing checks a closure, so `Stream.callback`, wall-clock and bad pagers stay unseen (FC34, FC38, S-M3).
  `FeedUnhandled` gives type-level duplicates. Add a rule: every-value words on a latest-value feed (section 8).
- **Earned?** Yes.

## 18. Other parts worth keeping or dropping

| Part | View |
| --- | --- |
| Tables, invariants, mutants | Keep the method. It found 20+ real failures. **But its limits showed:** RV3–RV5 found Highs the model could not see, and F6 passes every invariant. A model proves agreement with itself. Say what it does not cover |
| Cursors out of scope | Honest, with a worked sample. RV2 says outbound is common; the desk's typing used an `allow` write and worked. Re-judge (U2) |
| Two recipes | True and useful, but a decision every SDK author faces. Keep as knowledge |
| Principle 2 | Drop, per section 8 |
| Concept count 24, 12 common | Honest. `Feed.Signal` in a common type and `from`, `position` as a common pair are the first candidates to fall |
| Costs named per case | Keep this discipline (FC66, FC68–74) |

## 19. Pattern across the reviews

- Revisions 3–7 added no words at first but kept adding *cases*: revision 7's Highs were in the same family as RV2 H1.
  Fixing one per round is what AGENTS warns about. The first-registration row in section 7 is the clearest example.
- Three things have been re-found repeatedly, so a new design should begin with them: (1) who owes what, and whose memory it
  belongs to; (2) who owns a transport object; (3) which guarantees a consumer really needs (no duplicates: no; no holes: yes).
- The desk found things no paper review did: an unbounded socket, Stories bypassing the adapter, misread keyed lanes, the
  pager mistake, two sockets per workspace. **Real code is the better test**, and Checkout's absence of streams is a
  useful control.
