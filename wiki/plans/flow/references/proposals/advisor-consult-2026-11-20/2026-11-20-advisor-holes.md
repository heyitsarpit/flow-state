---
review advisor-holes
status open 2026-11-20
---
# Holes in the five advisor answers (proposed, 2026-11-20)

**Bottom line (proposed):** a second adversarial layer over the five answers to @questions.advisor-questions,
after each file's Sonnet "Review findings". Each section lists only new holes (or ones worse than stated), the
questions still open, and a readiness line. Severity: **breaks** (loses, duplicates or invents an ending, record or
value), **gap** (the design is silent where it must decide), **minor**. No sidecars were started: each section's
reads were small enough to do directly. Nothing here is decided.

## 1. Saved records (@proposal.saved-records, Q4)

### Holes

1. **breaks: one retired operation hides every owed row of its identity.** Owed rows live in one record per identity
   (code:packages/flow-state-v3/src/core/record.ts#OwedJson, lines 48-60; `owedRecordKey` line 78). With rows'
   operation decoded as a closed `OperationName` literal, a release that removes `void` makes the whole owed record
   fail; @spec.Restore.R5 then reads none of its rows. Scenario: Pay owes `charge` Succeeded and `void` Failed; the
   release drops `void`; after reload `charge`'s ending is never heard. The proposal's "rows kept, OperationRetired"
   needs a per-row decode, which the "one Schema per kind" structure does not have.
2. **breaks: a mapped name stays in dormant bytes and aliases a later reuse.** `previously` maps at decode only;
   @spec.Restore.R1 keeps records as records until touched, so untouched bytes keep `WAITING` across releases.
   Release 2 renames `WAITING`→`RETRYING`; release 3 drops the `previously` and adds a new `WAITING`: every record
   untouched since release 1 restores into the new state with memory meant for the old one. The same holds for slots,
   fields and schedules. LazyFeatures makes it likely: unopened features' records are never decoded at boot
   (@plan.LazyFeatures.O3).
3. **gap: lazy entries cannot be decoded at boot.** The design's single boot decode by `RecordKey` needs each
   machine's `ActorName` Schema, but a lazy entry's machine (and its input Schema) loads only at adoption
   (@plan.LazyFeatures.O3, "dormant, undecoded"). The decode must split: kind and machine id at boot, identity and
   content at adoption, and say what an Owing lazy identity hears before adoption.
4. **gap: the key spike tested a format the code does not write.** `actorKey` is `machine/name` with `%`, `/`, `|`
   percent-escaped (code:packages/flow-state-v3/src/core/world.ts#actorKey); `q4/key.ts` parsed `actor/Checkout/Pay|…`
   with raw JSON. A parser over the real key returns the escaped text, not a name the name Schema reads, and a lane
   key's key text is not escaped and may hold `|` (spike below). `ActorName` needs an unescape transformation and
   the lane key a first-two-separators split, both part of the Schema.
5. **gap: identity versions fall through.** Identity lives only in the key and decodes by the current name Schema,
   so a record of an older identity version (@spec.Actors.R11) fails as corrupt and resets, where
   @spec.Restore.R6 wants OldVersionActor and a lane re-keyed to `key#identityTag`. The proposal must say where the
   version tag sits in `RecordKey` and what decodes an old name once its Schema is gone. No code does R6 yet (grep
   finds no `OldVersion` in `src/`), so this is the moment to fix the shape.
6. **gap: the most common rename is missing.** `previously` covers states, slots, schedules, fields and operations,
   not a machine id or an app entry; renaming `Pay` discards its actor records and quarantines its lanes
   (@spec.Restore.R8, last paragraph).
7. **gap: `previously` on a nested or placed state is undefined.** A local name cannot express moving `FRESH` from
   `TRUSTED` to `UNTRUSTED`, or renaming parent and child in one release; a fragment state appears at several paths.
8. **gap: an added schedule "armed at boot" has no start time.** Records keep no state-entry time, and timers are
   restored per incarnation at its wake (code:packages/flow-state-v3/src/core/schedule-restore.ts), possibly days
   after the boot. A Duration schedule added to an active state gets `wake + delay`; Q4's wizard case works only
   because `heldUntil` is memory.
9. **gap: the entry `context` function hides the graph and can throw at boot.** @spec.Compile.R16 lists each
   slot's provider statically; `({ owner }) => ({ shopper: actorRef(Shopper, owner) })` hides the provider machine
   from static inspection unless its type is read. It runs at a boot or ending wake, where no caller can take a throw
   (today's wiring raises: code:packages/flow-state-v3/src/host/wiring.ts#makeWiring), the raw-throws seam.
10. **minor: the byte-for-byte run rule fails every mapped record.** A record read through `previously`, or with a
    dropped entry, re-encodes differently; the rule must be "decode of the re-encoding equals the decode", plus a
    rewrite at boot (hole 2) to meet @spec.Codec.R3's canonical-text check.

### Open questions

1. **Ship strict Schemas without renames first?** (user) A: take `previously` now. B: build record Schemas, each
   fact once and closed encoding now; keep rename = remove + add (today) until a fixture needs memory carried.
   **Recommend B:** the user's 2026-11-09 decision (revisit.md, "Manual … record migration") reopens on a case, and
   the fixture rows here are hypothetical; B alone unblocks @task.V3.T92.
2. **How a rename leaves the bytes.** (implementer) A: rewrite every mapped record at the boot (at adoption for lazy
   ones), as R7 already does for FieldDropped. B: keep each `previously` forever and refuse reusing any listed name.
   **Recommend A,** plus B's refusal while the `previously` is still present.
3. **Owed and lane rows decode per row.** (implementer) A: per-row decode; an unknown operation's row is kept as
   bytes and reported. B: one Schema per record. **Recommend A** (hole 1).
4. **Entry context shape.** (user) A: function of identity. B: a declared provider machine plus a name function
   (`{ shopper: { machine: Shopper, name: ({ owner }) => owner } }`), so the static graph keeps the edge.
   **Recommend B,** if sub-ask 1's move is taken at all (Review finding 5 still stands).
5. **Machine and entry renames.** (user) A: `previously` on the machine id too. B: out of scope; stated limit.
   **Recommend B** until Q1 is settled.

**Spikes** (scratchpad `holes/`, outside the repo):

- Spike `holes/key.ts` (run): `actorKey({machine:"Pay", name:'{"a":"b|c/d"}'})` is `Pay/{"a":"b%7Cc%2Fd"}`; a
  `TemplateLiteralParser` returns that escaped text; the lane id keeps `|` inside its key text.

**Readiness:** ready after named fixes for the Schema half (holes 1, 3, 4, 5); the rename and binding halves need
the user's Q1 and Q4 first.

## 2. Raw throws (@proposal.raw-throws, Q7)

### Holes

1. **breaks: the plain copy destroys Effect values, and keeping them brings shape marks back.** Definitions and
   bodies hold Effect class values: `schedule: Duration.minutes(30)`
   (code:packages/flow-state-v3/fixtures/home/machines/room.ts, line 191), Schemas in `Flow.initial(Schema.Number, 20)`
   (same file, lines 47-51), `Option` values in fixture configs. A copy of own enumerable properties fails
   `Duration.isDuration`, `Option.isOption` and `Schema.isSchema` (spike below), so `machine` refuses Room. Keeping
   them by "Flow-made handles kept by identity" does not cover them (Flow did not make them), and recognising them
   needs Effect's TypeId symbols: a shape check, which a copied prototype forges (spike). Freedom 3 stays open here.
2. **gap: module-private membership refuses valid values across two copies of Flow.** Effect itself recognises its
   values by `Symbol.for` TypeIds so that two loaded copies agree; one `WeakMap<Made, Parts>` per module instance
   does not. A Vite SSR dedupe miss or a pnpm peer split loads Flow twice: `Flow.initial(...)` captured by one copy
   is refused by the other's `definition`. Today `~flow` string marks pass, and `~owner` is already a per-definition
   symbol (code:packages/flow-state-v3/src/definition.ts, line 492), so the new risk is the global `Made` set.
3. **gap: one Issue mapping flattens the codes.** "An Issue becomes `InvalidConfiguration`" fits construction; `send`
   refuses `InvalidEvent` and a provider ref `ForeignActorRef` (code:packages/flow-state-v3/src/error.ts, lines
   10-25). `entry(name, Args, run)` needs the code per entry, or per argument position, to keep @spec.Diagnostics'
   codes.
4. **gap: the shared decode helper cannot return Findings.** Q3 recommends `decodeAt(schema)` returning
   `Result<Type, Findings>` for the gate and the boot; a record's failure is a `ReadFailure` that quarantines or
   resets (code:packages/flow-state-v3/src/core/record-format.ts#decodeBy), never a finding at a user path. Share
   only "Exit to `Result<Type, Issue | Defect>`"; each boundary maps its own.
5. **minor: two decodes per event.** A gated `E.X(payload)` decodes, then `send` decodes again through its walker;
   the design should say which one is the boundary. The Exit adapter itself costs nothing extra (spike below).

### Open questions

1. **What the copy keeps.** (implementer) A: copy only plain objects and arrays (prototype `Object.prototype` or
   `null`); every other object is a leaf kept by identity, for the decode to judge. B: a Schema-guided copy.
   **Recommend A:** it needs no list of Effect types and still reads each getter once.
2. **How Flow recognises its own values.** (user, API judgement) A: module `WeakMap` (proposal). B: a
   `Symbol.for("flow-state/…")` TypeId on a shared prototype, as Effect does, plus the per-definition owner symbol.
   **Recommend B:** the class is reading undecoded fields, not forgery; B follows Effect and survives two copies.
3. **Refusal codes.** (implementer) A: `entry(name, Args, run, code)`. B: a code annotation on each `Args` member.
   **Recommend B:** the code sits next to the argument it describes.

**Spikes:**

- Spike `holes/copy.ts` (run): a plain copy of `Duration.minutes(30)`, `Option.some(1)` and `Schema.Number` fails
  each `is*` guard; an object given Duration's prototype passes `Duration.isDuration`.
- Spike `holes/exitcost.ts` (run): on a two-field Struct, `decodeUnknownExit` 0.78 µs, `Result` 0.86, `Sync` 0.86 per
  call; the Exit-only rule has no measurable cost. `decodeUnknownSync` throws on a throwing getter.

**Readiness:** ready after named fixes: the copy rule (hole 1), recognition across copies (hole 2), per-entry codes,
plus Review findings 1 and 4.

## 3. Fragment lifetimes (@proposal.fragment-lifetimes, Q2)

### Holes

1. **breaks: an address taken from writable input strands a lane.** The address is the creation input's text,
   taken once, and "input fields stay writable". ThreeDSecure starts with `intentId: X` (address X); a turn sets
   `intentId := Y`; `confirm` commits on key Y, so the lane records subject X (@plan.Runtime.O3, "creating subject
   path"). Leave, re-enter with input Y: the new incarnation's commits on Y are declined as "another subject path"
   (@plan.Machines.O1, the verdict rule), and Y's ending parks for address X, which never returns (item 25). The
   same happens under Q1 A when any incidental input field (a label, a `returnTo`) differs at re-entry.
2. **gap: "never restore (same incarnation)" contradicts @spec.Restore.R1** ("a new incarnation with new ids for …
   every fragment incarnation"). It matters once Review finding 2's fix binds incarnation-held endings to the
   incarnation id: a frozen slice's parked `Interrupted` saved under the old id has no owner after reload. Decide
   that a restore re-ids without a start event, and re-binds parked endings by address and position.
3. **gap: a subroutine's own exit with a write in flight leaves a parked ending forever.** `whenAbandoned` never runs
   on own exit, so nothing releases the lane; ThreeDSecure reaching `DONE` before `confirm` lands parks the ending
   for an address that recurs only if the same input is entered again, and the parent cannot address the lane (a
   member from another path is declined). This is item 25 made routine by item 21, not an edge case.
4. **gap: two parking places, no order.** A thaw delivers the frozen slice's parked `Interrupted` "first", and the
   start/thaw adopts lane endings parked in owed rows in saved order (@plan.Runtime.O3); nothing orders one against
   the other, so a Story that freezes during both a lookup and a write can replay differently across builds.
5. **minor: one Owner per copy.** Every `.each` copy start allocates a host Owner, work or not (kanban's nested
   cards). Create a fragment Owner on its first fork, and say so, before the bench's large tiers measure it.

### Open questions

1. **What the subject part is.** (user) A: whole creation input (proposal). B: declared subject fields, read-only
   for the incarnation's life. C: keep the ban. **Recommend B:** hole 1 shows A turns any input change or incidental
   field into a stranded lane; B makes the address one stable fact.
2. **Own exit with lanes held.** (user) A: own exit runs the key-less release like `whenAbandoned`. B: a subroutine
   may not exit while it holds a non-Idle lane (refused at construction for fire-and-forget writes). C: parked,
   reported (item 25). **Recommend A,** with evidence; B over-constrains a fire-and-forget write.
3. **Restore and incarnation ids.** (implementer) A: re-id, no start event, parked endings re-bound by address
   (keeps R1). B: keep ids across a reload (changes R1 and the mint). **Recommend A.**
4. **One ending order.** (implementer) A: one parked list per address, in the order the endings arrived, whichever
   holder parked them. B: frozen slice first, then owed rows. **Recommend A:** one fact, one order.

**Spikes:** none; the holes come from the Plans' lane rules (@plan.Runtime.O3, @plan.Operations.O7,
@plan.Persistence.O2) read against the proposal.

**Readiness:** ready after named fixes: the subject part (Q1, the user's), own exit (Q2), restore ids, plus Review
findings 2, 3 and 7; item 25 must be settled with item 21, as Review finding 6 says.

## 4. Body types (@proposal.body-types, Q1)

### Holes

1. **gap: returning `B` multiplies every declaration and breaks exact type tests.** The spikes return `Machine<D>`
   (Review finding 4). With a phantom `B` added to `Machine` and returned (what @plan.Rules.O3 needs), the emitted
   declarations grow from 5.9 KB to 36 KB for Room and from 5.6 KB to 64 KB for Stepper: the whole body, handler
   types included, is inlined wherever a machine is exported, and every `app`, `ActorRef` and hook type carries it.
   Check time does not move (1.23 s against 1.26 s), but 29 type assertions against `Machine<typeof X>` in
   `tests/types/` fail (spike below). Nothing in the proposal measured this.
2. **gap: Rules O1's accepted shape is not typeable, and T106 is next.** @plan.Rules.O1 promises `event` "typed as
   X's payload" for `{ check, on: E.X }`; spike 6 shows no body signature does it. So @task.V3.T106 either changes the
   user's accepted shape (`turn(...)`, Q2 A) or ships `event` untyped. The plan has to change before T106's type
   tests are written, not after.
3. **gap: `turn(...)` is a new public builder.** Q2 A adds a function to the public route; under raw-throws it is a
   gated `builder` returning `Captured`, decoded by `machine()`. Neither proposal says so; if T106 lands before T98
   (raw-throws' Q5), it is born bare.

### Open questions

1. **What `Machine`'s second parameter carries.** (implementer) A: the whole body `B`. B: only the rule names
   (`Machine<D, Names = never>`, read from `B["rules"]`). **Recommend B:** it gives Rules O3 its tokens, keeps
   declarations at today's size, and leaves `Machine<typeof X>` exact for machines without rules. Re-run spike 1.
2. **`event` from `on`.** (user; it edits @plan.Rules.O1) A: `turn({ on: E.Set, check })`. B: keyed by event, which
   also moves Rules O3's name-uniqueness check across a new level. C: an untyped `event`. **Recommend A,** built as a
   gated builder.
3. **Adopt the signature now?** (implementer) Yes, Q1 A, with Review findings 1 and 2 fixed and the stop list replaced
   by the shared brand (Review finding 3).

**Spikes:**

- Spike `holes/pkg2` (copy of `q1/pkg`; `Machine<D, B = unknown>` with a phantom `"~body"?: B`, `machine()` returns
  `Machine<D, B>`), checked with `holes/../tsconfig.b.json`: 35 errors against `q1/pkg`'s 6, the 29 new ones all
  TS2344 on `toEqualTypeOf<Machine<…>>`; check time 1.23 s vs 1.26 s; 5.08 M vs 5.02 M instantiations.
- Spike `holes/dts` (declaration emit of `room.ts` and `number-input/index.ts`): today's and `q1/pkg`'s outputs are
  byte-identical (5875 and 5628 bytes); `pkg2`'s are 36236 and 64467.

**Readiness:** ready to decide on the signature (Q1 A) with the named fixes; the second parameter's content is the
implementer's, and Q2 is the user's, needed before T106.

## 5. Machine calls (@proposal.machine-calls, Q5)

### Holes

1. **breaks: a live send and a restored re-send of one Attempt carry different bodies.** The walker is a check; the
   commit gets the caller's own object through a cast (code:packages/flow-state-v3/src/core/lanes.ts, line 169;
   code:packages/flow-state-v3/src/contract.ts#trusted), while the lane record saves the encoded text, which drops
   extra fields (spike below). A select returning `{ intentId, note }` sends `note` live; after a reload,
   `O.pay.retry` re-sends the same `attempt.id` without it. An idempotency-keyed API (Stripe refuses a reused key with
   other parameters) answers a definite error for a request that may have applied. §4 extends the same check-and-cast
   to lookups, which is raw-throws' freedom 2 at the call boundary.
2. **gap: a hidden in-function retry turns a definite failure into a held doubt on cancel.** `pay` answers `Busy`
   (nothing applied); during `Effect.retry`'s backoff the user cancels; the interruption wins, so the head ends
   `unknown { Cancelled }` and is retained Held (@plan.Operations.O7), blocking the lane though nothing may have
   landed. Review finding 6 covers a lost answer; this is the opposite direction, on the rule §1 recommends.
3. **gap: an invalid input on a live resource is not a lookup.** §4 ends a failed read `Defect` with an
   `InvalidInput` issue. A resource whose input follows a search box's memory is `""` (`NonEmpty`) while the user
   types: a Defect and an issue per keystroke, for correct code. A placement with no valid input is closer to
   `resetOn` returning null (not placed) than to a bug.
4. **gap: the never-sent wait (§2-B) has more exits than cancel and reload.** A `latest` replacement of a paused head
   (Operations O7 ends a replaced head `Superseded`, a doubt, though it was never sent), actor disposal ("invokes
   nothing new", O7: does the head send when the connection returns?), and `forget` each need a definite ending.

### Open questions

1. **What the call receives.** (implementer) A: the walker's decoded value, the same live and restored. B: today's
   check and cast. **Recommend A;** it closes hole 1 and is raw-throws' rule at the call boundary.
2. **Invalid input on a live resource.** (user) A: `Defect` and an issue (proposal). B: not placed, with evidence
   only; `Defect` stays for a one-off `lookup`. **Recommend B.**
3. **Hidden retries.** (user, doc rule) A: allowed only before anything may have applied, and a cancel during one
   ends doubtful (stated limit). B: no in-function retry; every visible or invisible re-send goes through
   `O.x.retry`. **Recommend A,** with the `flow check` hint the proposal names.
4. **Paused-head exits.** (implementer) A: every exit of a never-sent head ends `NotSent` with its reason
   (`Cancelled`, `Superseded`, `Disposed`, `Restored`). **Recommend A,** as one Phase tag (Review finding 3).

**Spikes:**

- Spike `holes/walk2.ts` (run, real `walkerOf`): `text({ intentId: "x", stray: 1, at: Date })` saves
  `{"at":"1970-01-01T00:00:00.000Z","intentId":"x"}`; the live commit receives the object with `stray`.

**Readiness:** §1 and §4 ready after holes 1 and 3; §2 and §3 wait on the user's Q1 and Q2, and on the lane record
(cross-proposal, seam 1).

## Cross-proposal seams, in the order to settle them

1. **Rules O1 and O3 against body types (now: @task.V3.T106 builds on them).** `event` from `on` needs `turn(...)`
   or another shape (§4 hole 2), and O3's "second parameter is the body's type" costs 6-11x declarations (§4 hole
   1); rule names only keep the tokens. Both are edits to an accepted Plan, so the user decides first.
2. **The lane record, one Schema.** Today the key is (identity, operation, key text)
   (code:packages/flow-state-v3/src/core/world.ts#laneId); @spec.Restore.R8 says (identity, contract, key);
   saved-records' `LaneKey` keeps the operation; @spec.WriteAhead.R5 requires the creating subject path and the
   releasing mark, not built; fragment-lifetimes adds parked endings by address; machine-calls adds a never-sent
   phase. One design lists all of them once, with identity version, before @task.V3.T92 or @task.V3.T109 writes one.
3. **One decode helper, three boundaries.** Records at the boot, public calls (raw-throws) and call inputs
   (machine-calls §5 hole 1) share "Exit to `Result<Type, Issue | Defect>`, then pass the decoded value"; each
   boundary maps failures to its own outcome (quarantine, FlowError, decline). Settle with T98.
4. **One brand for Flow-made values.** raw-throws' `Made` (run time) and body-types' `Exact` stop (types) must be the
   same mark; decide run-time recognition (§2 Q2: `Symbol.for` TypeId) and a phantom type brand together, before
   T98 and T109 add `.each`, `.resumable()` and `turn(...)`.
5. **User code that runs at a boot.** saved-records' entry `context` function and any restore-time callback run with
   no caller to refuse to; the gate does not cover them. Name their outcome (quarantine the record, report) with
   seam 3.

## Status after revision (proposed, 2026-11-20)

The five proposals were revised in place; each ends in a "Revision log" that answers every Review finding and
every hole above by number. Nothing is decided; no Plan, Spec, Task or code was edited.

| Proposal             | Verdict                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `saved-records`      | Ready to decide. Questions 7 to 10 choose options; the Schema half (unblocks T92) needs none.       |
| `raw-throws`         | Ready after question 5 (how `Made` is recognised); `Bare<T>` on the real types is T98's first step. |
| `fragment-lifetimes` | Ready after questions 11 and 12; the others have safe defaults.                                     |
| `body-types`         | Ready to decide; questions 1 and 2 edit @plan.Rules and come before @task.V3.T106.                  |
| `machine-calls`      | §1 and §4 ready to decide; §2 and §3 ready after questions 17 and 18.                               |

**Seams, each settled once (all proposed):**

1. Rules against body types: `turn({ on, check })` and `Machine<D, Names>` (questions 1 and 2; spike
   `fable/pkg3`).
2. The lane record: one Schema in `saved-records`: the key holds the identity version and the contract id (no
   operation); the content holds `head.phase` (not `inFlight`, no `sent`), `queue`, `displaced`, `subject` and
   `releasing`. Every parked ending is an owed row carrying its address, decoded per row.
3. One decode helper: `decodeExit(schema)` returning `Result<Type, Refused | Threw>`; a record, a public call and
   a call input each map the failure themselves, and each passes on only the decoded value.
4. One brand: `Made`, a symbol key, read only by a `Schema.declare` leaf at run time and by `Exact`'s `LeafOf` in
   types (question 5 picks how the key is made).
5. User code with no caller (a boot or a wake): a throw is a `Defect` issue and the identity is not woken, as
   @spec.Restore.R1 treats a quarantined actor record. Saved overrides (question 7 A) add no such code.

**Questions for the user, in the order to answer them** (recommendation in brackets):

1. body-types 1: `event` from a turns rule's `on`: `turn({ on: E.Set, check })`, key by event, or an untyped
   union? [`turn`; edits @plan.Rules.O1]
2. body-types 2: `Machine`'s second parameter: rule names only, or the whole body type? [names; edits Rules O3]
3. body-types 3: adopt `const B` with `Exact` as the one body signature? [yes]
4. raw-throws 3: does T98 land before T106 and T109, so `turn`, `.each` and `.resumable()` are born gated? [yes]
5. raw-throws 1: recognise `Made` by a module `WeakMap` or a `Symbol.for` key as Effect does? [`Symbol.for`]
6. raw-throws 2: gate the testing route in T98, or when it is exported? [in T98]
7. saved-records 1: context overrides: save what a ref gave, or move them to the entry and drop ref-level
   `{ context }`? [save them]
8. saved-records 2: renames: none now (rename = remove + add), or `previously`? [none now]
9. saved-records 3: a schedule added to an active state: armed at the wake, or idle until re-entry? [armed]
10. saved-records 4: machine id and entry renames: a stated limit, or `previously` on the id? [stated limit]
11. fragment-lifetimes 1: a node trait's or subroutine's subject: whole input, a new `subject` list, none, or
    `resetOn`? [`resetOn`]
12. fragment-lifetimes 2: own exit while holding a lane: park for the address, run the releases, or refuse at
    construction? [park, given 11 is `resetOn`]
13. fragment-lifetimes 3: item 22: keep `SharedContract`, or add the instance path to the lane key? [keep]
14. fragment-lifetimes 4: `whenAbandoned` with no reason, or with a `why`? [no reason]
15. fragment-lifetimes 5: a release past its bound: a warning issue on the D25 bound, quarantine, or a separate
    mid-life default? [warning on D25]
16. fragment-lifetimes 6: defer item 24 and close item 26? [yes]
17. machine-calls 1: offline wait: none, writes wait, or writes wait with an opt-out? [writes wait]
18. machine-calls 2: never-sent work on reload: never resume, resume all, or an opt-in outbox later? [never now]
19. machine-calls 3: an invalid input on a live resource: `Defect`, or not placed? [not placed]
20. machine-calls 4: hidden re-sends: immediate and applied-nothing only, or none? [immediate only]
21. machine-calls 5: a per-call deadline override: none, or an option on `O.x.commit`? [none]

**Answers (the user, 2026-11-20):** 1 A (`turn({ on, check })`; Rules O1 edited), 2 A (`Machine<D, Names>`; Rules
O3 edited), 3 A (`const B` with `Exact`). Questions 4 to 21: the user accepted every recommendation above
(4 yes, 5 `Symbol.for`, 6 in T98, 7 save what a ref gave, 8 no renames now, 9 armed at the wake, 10 stated limit,
11 `resetOn`, 12 park for the address, 13 keep `SharedContract`, 14 no reason, 15 warning on D25, 16 defer 24 and
close 26, 17 writes wait, 18 never resume now, 19 not placed, 20 immediate re-sends only, 21 no override).
