# Persistence redesign: capture on issue (2026-11-17, proposed)

**Bottom line:** steps should stop encoding records. Each step only marks which record keys changed. When the
edge issues a batch, one pure `Capture` step projects every dirty key from the current World through compiled
encoders. Those encoders are memoised by value reference, so an unchanged value is never encoded twice. A key stays
dirty until a batch carrying it lands. The record layout, the format and the `Store` contract stay as they are.

Measured on a prototype, against HEAD a829ebe3:

| Run | Before | After | Change |
| --- | --- | --- | --- |
| palette stress, per turn | 3.84 ms | 0.55 ms | −86 % |
| `session/long`, per turn | 0.191 ms | 0.147 ms | −23 % |
| `transfers/long`, per turn | 0.057 ms | 0.050–0.052 ms | −9 to −12 % |
| hide flush: 1,000 dirty actors (one field each) plus a 469 KB record | about 36 ms | about 3.2 ms | −91 % |

Stored bytes are identical at every checkpoint of 151 Stories.

Most of the gain comes from the memoised encoder, which needs no Spec change. Capture on issue adds 3 to 7 % on
Stories, where every step issues its own batch. It removes 95 % of encodes under bursts: palette stress encoded
5,007 records and wrote 245. It also gives withholding, hide and disposal one path. It changes @spec.WriteAhead,
listed below, and supersedes @plan.Pending.D28.

**The user decides:**

1. Whether memory and selected values are immutable by contract, with a deep freeze in dev and test. The memo is
   only correct if they are.
2. Whether to take the WriteAhead changes for capture on issue, or keep step-end projection with the memoised
   encoder only.

The per-field record layout, diff records and an append-only log were measured or reasoned through and are not
recommended (§3).

**Read first:** [the performance audit](performance-architecture-2026-11-17.md) (finding 3),
@plan.Pending.D27, @plan.Pending.D28, @spec.WriteAhead (R10, R12, R13, I11, I20 to I23), @plan.Persistence.O3.

## 1. Where the time goes today

Every step runs `project` (`src/core/persist.ts`) at its end. `project` encodes each touched record whole, which
takes four generic walks:

1. a depth walk;
2. a Schema encode;
3. the canonical JSON tree;
4. writing that tree out as text.

The edge's dirty map, keyed by record key, then keeps only the latest text per key. Counted on the prototype:

| Run | Records encoded | Records written | Batches |
| --- | --- | --- | --- |
| `transfers/long` | 206 | 206 | 113 |
| `session/long` | 665 | 665 | 180 |
| palette stress, 5 seeds | 5,007 | 245 | 174 |

Stories settle between steps, so they show no coalescing. Bursts do: palette stress encodes 20 records for every
one it writes, and its 469 KB command list is re-encoded at each step (13.6 ms) although it rarely changes.

## 2. The design

### Before and after

Before, every setter builds a record and every step encodes:

```ts
// src/core/persist.ts (today)
const saveActor = (actor: ActorId, due: Due = Due.Later()) => {
  const incarnation = incarnationOf(actor);
  tx.set({ ...tx.world(), records: withEntry(tx.world().records, actorKey(actor), recordOf(incarnation)) });
  touch(actor, (t) => ({ ...t, record: "kept", now: t.now || Due.$is("Now")(due) }));   // copies `touched`
};
// at every step's end
const project = () => { /* encodeActor, encodeLane, encodeOwed for every touched key */
  tx.command(Command.Persist({ writes, refused, due })); };
```

After, a setter only marks a key, and encoding happens once per issued batch:

```ts
// NEW: World.dirty   // NEW: Input.Capture   // NEW: Command.Write   // existing: Store.write
// a setter marks; nothing is built or encoded
const saveActor = (actor: ActorId, due: Due = Due.Later()) => {
  markDirty(actorRecordKey(actor.key));            // one Set add on the step's draft (audit finding 7)
  noteDue(due);                                     // the step's due and tickets are step facts
};
// at the step's end: when, not what
tx.command(Command.Persist({ due, tickets }));      // no `writes`

// the edge, when it issues (ticket, Now, interval, hide, previous batch answered):
driver.input(Input.Capture());
// the Capture step, pure: projects the current World
const capture = (world: World) => {
  const keys = [...world.dirty, ...world.unlanded];                 // dirty until landed
  const { batch, withheld, refused } = projectAll(world, keys);     // compiled, memoised encoders (D27)
  return { world: { ...world, dirty: withheld, unlanded: keysOf(batch) },
           commands: [Command.Write({ batch, refused })] };
};
```

Records keep their bytes. The record below is `transfers/long`'s, before and after:

```json
{"context":{},"format":3,"graph":{},"machine":"Bank/Transfers","memories":[],"memory":{"notice":"sent r26, nudged"},
"name":"acct-1","reactions":[],"schedules":[],"seen":{},"state":"READY"}
```

### The parts

1. **Dirty marks.** `World.dirty` is the set of record keys (`actor/`, `lane/`, `owed/`) whose World entry changed
   since a batch carrying them landed. Setters only add to it. These setters stop building anything per change:
   `saveActor`, `saveLane`, `saveOwed`, `removeActor`, and the owed mark for rows still in the mailbox.
   `World.records` keeps only ended and disposed identities, which the revive path needs (`step.ts`,
   `incarnations.ts#ensure`). A live identity's record is derived from its incarnation when needed.
2. **The step's return.** A step returns `Persist { due, tickets }`, both facts of the step. A step that mints a
   ticket also checks, through the memoised encoder, that its identity's actor record encodes. If it does not, the
   ticket is refused at once, as R13 asks today.
3. **Capture.** Capture is a new core input, admitted while Open and while Disposing. It projects
   `dirty ∪ unlanded` from the current World, applies the withholding rule (an identity whose actor record cannot
   encode keeps every key dirty and is reported `UnencodableValue` once), and returns `Write { batch, refused }`.
   Disposal's flush is a Capture.
4. **Edge.** The edge decides when to issue and nothing else: it keeps the due time, the tickets and whether
   anything is dirty, a flag the step reports. It still keeps one batch out (R12). A landed batch clears its keys
   from `unlanded`. A refused batch leaves them there, so the next Capture writes them again from the current World.
   This replaces today's put-back (WriteAhead realization).
5. **Encoders (D27).** There is one compiled, stack-safe encoder per Schema. It writes canonical text directly and
   is memoised by value reference per Schema node (`WeakMap`). It memoises successes only, so a failure path is
   never reused for a different parent. A record's text is built from a compiled template of its parts. Frames and
   memory copies are not memoised, because their text depends on sibling fields (§5, sidecar finding B3). The memo
   is not seeded at restore, since decoded text may not equal what the current encoder writes (B5).
6. **Hide.** The host's `visibilitychange` (hidden) and `pagehide` handlers input Capture synchronously, so
   `Store.write` opens its IndexedDB transaction inside the handler. When a batch is still out, nothing more can
   be issued, which is today's limit.

## 3. Candidates considered

- **Memoised compiled encoder, still projecting at each step's end.** palette −85 %, session −20 %, transfers −12 %.
  Adopted, as part 5.
- **Capture on issue (dirty marks, encode when the batch is issued).** a further −3 to −7 % on Stories; 95 % fewer
  encodes in bursts. Adopted, as parts 1 to 4.
- **D28: Later at issue, Awaited and Now still at step end.** two projection paths for one rule. Superseded: Awaited
  capture is issued at once anyway.
- **Per-field memory records (`actor/<id>` head plus one key per field).** palette writes 14.2 MB → 4.8 MB (−66 %);
  transfers and session −3 %. Not now: a bytes-only gain for big memory; costs format 4, more keys, assembly at restore.
- **Diff records (patches on a base).** Rejected: restore must replay patches and needs compaction; per-field keys
  already give diffs by key.
- **Append-only log with compaction in the core.** Rejected: IndexedDB's multi-put transaction is already atomic; a log
  belongs inside an adapter that lacks atomic batches.
- **A small intent entry for write-ahead instead of the actor record.** Rejected: I11 needs the actor record of the
  committing turn on disk with the lane, or restore re-commits; with the memo that record is cheap.

The per-field layout should be reopened if a browser bench shows that IndexedDB write time for large records
matters. It is the only lever left for write bytes.

## 4. Measurements

**Method.**

- **Prototype.** A `git archive` copy of a829ebe3 in a scratch directory, never the live tree. Each prototype is
  switched on by an environment flag:
  - `PROTO_MEMO`: field memo;
  - `PROTO_TEMPLATE`: compiled record template;
  - `PROTO_LAZY`: encode at issue;
  - `PROTO_DIRTY`: no per-change record build.
- **Encoder check.** Under `PROTO_CHECK`, the memoised encoder was compared byte for byte with today's on every
  Story. The only mismatches were 3 depth cases, where depth is counted from the field rather than the memory; D27
  lifts that limit.
- **Encode-at-issue check.** Stored bytes matched today's at every checkpoint of 151 Stories. The 3 depth Stories
  are excluded because the prototype does not withhold.
- **Timing.** Node 24.21; 300 to 400 runs after warm-up; the minimum of three interleaved runs. Another lead's
  tests shared the machine, so absolute numbers moved by about 5 % between rounds, and only the ratios within a
  round are reported.

**Per turn:**

| Run | Today | Memo and template | Plus capture on issue |
| --- | --- | --- | --- |
| `transfers/long` | 0.057 ms | 0.050 ms | 0.052 ms |
| `session/long` | 0.191 ms | 0.152 ms | 0.147 ms |
| palette stress, 5 seeds | 3.84 ms | 0.59 ms | 0.55 ms |

With `PROTO_DIRTY` on, a revive went through the empty `World.records`, which part 1 forbids. That changed the
digest of some other Stories, and palette ran one extra turn (4,918 against 4,917). `transfers/long` and
`session/long` kept identical bytes.

**Hide flush** (synchronous encode inside the handler):

| Dirty set | Today | Memoised |
| --- | --- | --- |
| palette's 469 KB record, unchanged list | 13.6 ms | 0.05 ms |
| the same record, first encode since boot | 14.6 ms | 14.6 ms |
| 1,000 actors, one changed string field each | 22.0 ms | 3.2 ms |

**Not measured:** IndexedDB commit time in Chromium and Safari, and how long a commit can still run after
`pagehide`.

## 5. Guarantees

Sidecar findings are cited as A (the crash attack) or B (invariants and memo): A1 to A6 and B1 to B12, logged in
§9.

- **No send before its intent is durable (R13, I15).** A ticket is answered by the batch that carries its lane key,
  which Capture issues at once (Awaited). Change: none; Capture must never answer a ticket with an empty batch (A1).
- **No lane or owed record outruns its actor record (I11).** One Capture projects every dirty key of one World, so the
  committing turn's actor record and lane go in one batch; a withheld identity holds back all its keys. Change: none.
- **The owed record lists exactly what is owed (I20).** Projected from the World at Capture, a step boundary. Change:
  "at every step's end" becomes "at every landed state".
- **A row leaves the owed record only with the actor record that heard it (I22).** Both are dirty and go in the same
  Capture. Change: none.
- **Each batch holds every dirty record (I23).** `dirty ∪ unlanded` in every Capture; a refused batch's keys are written
  again (A6, B2). Change: wording: "dirty until landed".
- **Restore from any crash point is consistent (I10, Restore).** Each landed batch is the projection of one whole-step
  World (I7); the bytes match today's on every Story. Change: none; a dependent's provider graph is read at Capture
  (B10), which is a consistent cut, not today's last-save cut.
- **No ending lost, doubled or made up.** A found no double send; a refused middle batch is rewritten whole; tickets
  keep today's answering. Change: see the A5 change below.
- **Hide flush fits what browsers allow.** Encoding is synchronous and small (3.2 ms for 1,000 dirty actors); the
  IndexedDB transaction opens inside the handler. Change: none; the loss window stays the interval.
- **Storage quota.** A refused batch keeps its keys dirty and retries after the interval, as today; record count and
  bytes are unchanged. Change: none.
- **Migration of old formats.** Format, layout and keys are unchanged; formats 1 and 2 decode through today's steps, and
  nothing is seeded from them (B5). Change: none.
- **Unencodable memory (R4).** Refused at once when a step mints a ticket (A4, B8); otherwise reported at Capture.
  Change: the report moves from the step's end to Capture.

**A5, a behaviour change to record.** Today, when a record becomes unencodable after a ticket's step but before
its batch is issued, the ticket still lands. Under capture on issue that ticket is refused (`StorageRefused`), and
nothing is sent. No ending is lost or made up, and the commit ends `NotSent` honestly.

**On hide:**

- No browser gives a numeric budget. Writes started in `pagehide` or `visibilitychange` handlers may never commit
  once the document is torn down ([W3C IndexedDB thread][idb]). Safari has open reports of these events not firing
  on close ([WebKit 263326][wk263326]), and Chrome added `IDBTransaction.commit()` for saving state before freezing
  ([blink-dev][commit]).
- So the design does all its CPU work synchronously in the handler, and the adapter calls `commit()` where it is
  available.
- R10's stated limit stays: on a tab close Safari may lose the last interval.

[idb]: https://lists.w3.org/Archives/Public/public-webapps-github/2025Oct/0646.html
[wk263326]: https://bugs.webkit.org/show_bug.cgi?id=263326
[commit]: https://groups.google.com/a/chromium.org/g/blink-dev/c/ulyuFI9aMig

## 6. Broad implications

- **WriteAhead:** the realization, R10 and I20 to I23 change (§7). R2 and R12 (the `Store` contract) stay.
- **Restore:** decoding and format are unchanged.
- **Codec:** canonical form is unchanged. D27's walkers must keep every check of today's walk (-0, non-finite,
  lone surrogate, sparse, not plain, cycle, key order) and report the root path (B11). The memo caches successes
  only.
- **WriteLanes:** "records are projected from what the step touched" becomes "marked by what the step touched,
  projected at Capture". Lane phases and `inFlight` bytes are unchanged (A, E1 and E2).
- **Actors:** a record is encoded at Capture, not in its end step. The revive path reads `World.records` for ended
  identities only (B1).
- **Turn:**
  - memory must be immutable;
  - `update` patches are merged shallowly, so a nested in-place push would be persisted stale (B4);
  - `Equal`'s identity cache already misbehaves on that today;
  - a dev and test deep freeze of committed memory and of `Selected.value` (B12) makes the contract checkable.
- **`Store` and adapters:** no contract change. IndexedDB: one readwrite transaction per batch, `commit()` when
  supported. localStorage has no multi-key atomicity, so its adapter writes each batch as one key and folds at
  load; that is the adapter's own log.
- **Test tooling:**
  - `src/core/persist.test.ts` is rewritten around Capture;
  - `tests/write-lanes/one-builder.test.ts` names Capture as the one `Write` builder;
  - 30 planted faults edit `persist.ts` (8), `record.ts` (10), `actor-record.ts` (4) and `edge.ts` (8); about 20
    need new find text, and their rules stay the same;
  - run rules that read `records.stored` keep working, because the bytes are unchanged;
  - the reload sweep is unchanged.

  New planted faults: a Capture that skips a dirty key, a refused batch whose keys are not rewritten, a memo hit
  on mutated memory (caught by the dev freeze), and a ticket answered by an empty batch.
- **Bench:** add the hide-flush cases (§4) and a burst Story where many steps fall within one interval. The
  palette stress Story gets back under its 60 s limit with no change to its samples.

## 7. Spec and Plan edits

These edits are proposed and none is applied. The lines come from a sidecar survey; one sidecar, and every
WriteAhead line here, was checked against the file.

**@spec.WriteAhead:**

- R10: "at its end each one whose entry changed is projected into its record" becomes "is marked dirty; records
  are projected when a batch is issued".
- R13: the step-end refusal becomes a refusal by the step that mints the ticket.
- I20: "At every step's end" becomes "At every landed state".
- I21: "written or removed in that step's write list" becomes "dirty until a batch carrying its record lands".
- I23: add "keys stay dirty until landed".
- The `owner Records` state line: "each step's touched lanes and identities, and its write list" becomes
  "the World's dirty and unlanded keys".
- The realization paragraphs on step-end projection, withholding and the `Persist` command are rewritten for
  Capture and `Write`.
- T15 to T17 are restated per landed state.

**Other Specs:**

- @spec.WriteLanes, "Records are projected from what the step touched": projected at Capture.
- @spec.Turn, "the step derives its writes from the records it touched": the step marks; Capture writes.
- @spec.Actors, "a persisted actor's record is encoded in that" step, and "Each later step that changes a record":
  encoded at Capture.
- @spec.Restore, "Memory that cannot encode skips its batch": decided at Capture.
- @spec.Codec, "then the identity is withheld whole": decided at Capture.

**Plans:**

- @plan.Persistence.O3: "An ended actor's record is encoded in its end step" becomes "marked in its end step and
  encoded at the next Capture". The flush on hide and disposal is a synchronous Capture.
- @plan.Pending: D28 is superseded by a new D29 holding this design. D27 gains "memoised by value reference;
  successes only".
- @plan.Inspection.O2: event kinds gain the `Write` command.

## 8. Interactions

- **D27 (the T9 lead).** Part 5 is D27's walker with two additions: it writes text directly, and it keeps a memo
  per Schema node keyed by reference. The comparator choice is unaffected. This design is built after T9, on its
  walkers. Without the memo, capture on issue alone gains only under bursts.
- **D28.** Superseded. Its gate, "built only if the bench … still shows Later projection as a top cost", is answered
  by §4: after the memo, projection is about 5 % of a Story run but still 20 encodes to 1 write under bursts.
- **D24.** With no record or list caps, per-step O(size) encoding was the scaling risk (4.6 ms per turn on
  palette). After this change, cost follows the changed fields per Capture, so T84's slow-work budgets should be
  measured after it.
- **D25.** The capture interval stays a named default of 5 s. The retry for a refused batch still derives from it.
  Nothing new is a literal.

## 9. Sidecar log

Four Haiku sidecars ran, all read-only:

- **A:** crash attack, effort high;
- **B:** invariants and memo, effort high;
- **C:** Spec and Plan lines, effort medium;
- **D:** test dependencies, effort medium.

Each finding was checked against the code and the prototype.

**A (crash attack)** found no double send. Its checks E1 to E6, which show the design equivalent to today, were
accepted.

- **A1, A2 (accepted, design fixed):** an edge gated on its own dirty map could answer a ticket with nothing
  written, or never issue. The edge now keeps a dirty flag and a due time, and every issue is a Capture.
- **A3 (accepted):** a hide during an out batch must not issue a second batch. The guard is kept, which is today's
  limit.
- **A4 (accepted):** a refusal must not wait behind an out batch. The minting step checks encodability.
- **A5 (accepted):** a behaviour change, recorded in §5.
- **A6 (accepted):** became "dirty until landed".

**B (invariants and memo):**

- **B1 (accepted):** `World.records` stays for ended identities.
- **B2:** the same as A6.
- **B3 (accepted):** frames and copies are not memoised.
- **B4 (accepted):** this is the user's decision on immutability.
- **B5 (accepted):** no seeding at restore.
- **B6 (accepted):** mailbox owed marks, and disposal through Capture.
- **B7 (accepted):** due and tickets stay step facts.
- **B8:** the same as A4.
- **B9 (accepted):** R8 and I9 (non-durable providers) have no code today and are out of scope.
- **B10 (accepted):** a consistent cut, recorded in §5.
- **B11 (accepted):** goes to D27.
- **B12 (accepted):** user Schemas must be pure; R4 already requires synchronous encoding without services.

**C (Spec and Plan lines)** was accepted and folded into §7; its line numbers were spot-checked in WriteAhead.

**D (test dependencies)** was accepted and folded into §6. One note: D wrote a working list to the scratch
directory, which was outside its read-only brief but harmless.
