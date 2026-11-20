# Saved records as one design (proposed, 2026-11-20; revised after review and hole-poking)

**Status:** the user accepted every recommendation (2026-11-20); see advisor-holes-2026-11-20.md, answers 7 to 10.

**Bottom line (proposed):** a saved record is a projection of the compiled release, never a hand-written shape. Each
persisted machine gets its record Schemas built from Compiled: literal unions of its own state, slot, schedule and
contract names, branded ids, its memory Schema. A record's key is a Schema too (kind, machine, identity version,
name), so identity and version live only in the key. The content is decoded in two grains: the envelope and the
facts that carry meaning (state, a lane's input) strictly, and each entry of a collection (a slot's `seen`, a
schedule, a memory field, an owed row) on its own, so one stale entry never hides the others. Renames are **not**
part of this design: a rename stays remove plus add (the user's 2026-11-09 decision), and `previously` is open
question 2. The freedom removed: **a saved fact whose meaning is checked by anything other than a Schema built from
the current Compiled** (hand checks after a shape-only decode, per-Task format steps, re-key steps).

Answers question 4 of `advisor-questions-2026-11-20.md`. Unblocks @task.V3.T92, then @task.V3.T56. This file owns
the lane and owed record shapes that `fragment-lifetimes-2026-11-20.md` and `machine-calls-2026-11-20.md` add to.

## The class and its freedom

Three symptoms, one cause. T20 hit its failure limit because `record.ts` decodes `machine`, `name`, `operation`
and `lane` as `Schema.String` and then checks meaning by hand (`identityIn`, `keyNamesItself`, `rowOf`); each review
found one more unchecked field (code:packages/flow-state-v3/src/core/record.ts#decodeRecords). Formats 4 and 5 each
added fields with their own chained step (code:packages/flow-state-v3/src/core/actor-record.ts#decodeActor). A slot
a release adds fires once on reload because `seen` lacks it. All three come from the record being a second
definition beside Compiled, which each Task extends and nothing compares to the release that reads it.

## Where the data comes from

IndexedDB (`layerIndexedDb()`, host) or `Fake.storage` gives `key -> text`. The host reads bytes only. In the core,
at the boot: every key is parsed by `RecordKey` (kind, machine, version tag; no machine code needed). For a machine
the app has loaded, `decodeCanonical` (@spec.Codec.R3) then gives JSON and the machine's record Schema gives branded
values; nothing after that checks again. For a lazy entry the content stays undecoded bytes until adoption
(@plan.LazyFeatures.O3), where the same content decode runs; an Owing lazy identity hears nothing before then, as
O3 already says. Every decode goes through the one shared helper (below).

## The structure

1. **Record Schemas from Compiled.** `recordSchemas(compiled)` (NEW, core) builds per machine: `StateName` =
   `Literals(state paths)` branded; `SlotName`, `ScheduleName`, `ContractId` likewise; `ActorName` = the machine's
   name Schema, never `~`. `actor-record.ts` and `record.ts` keep no `Schema.String` for an identifier.
2. **The key is a Schema.** `kind/machine@tag/name`, then for a lane `|contract|keyText`. Encode escapes `%`, `/`,
   `|` and `@` in every segment but the last; decode splits, unescapes, then reads `name` by `ActorName` and
   `keyText` by the contract's key fields, and must encode back to the same text. `tag` is the identity version
   (@spec.Actors.R11). A key whose tag is not the current one is never decoded further: it is listed by its key
   (OldVersionActor, UnboundLane) and blocks nothing, because no current key equals it. This replaces
   @spec.Restore.R6's re-key step, LaneRekeyed and LaneRekeyCollision, and a reverted release finds its records.
3. **Each fact once.** Identity and version live only in the key (content drops `machine`, `name`). A lane is
   (identity with its version, contract id, key), as @spec.Restore.R8 and @spec.WriteAhead.R5 say; the operation's
   name is derived from the contract (one write per contract, SharedContract) and is not saved, so an operation
   rename needs no step and R8's OpRenamed goes. `seen` stays (a fact: what the actor last heard).
4. **Two grains of decode.** Strict (the record fails): format, key, `state`, a lane's head and input. Per entry
   (the entry is dropped or kept as bytes, reported, the rest read): each `seen` slot, each schedule, each memory
   field, each owed row. Excess keys are refused in the strict part only.
5. **Closed on encode.** A save writes a key per declared slot, schedule of an active state and memory field. On
   decode a missing field takes its default (@spec.Compile.R8) and a missing slot a silent baseline.
6. **One Flow format, no steps.** The format is unreleased (T92's Risk), so formats 1 to 4 and their steps
   (~250 lines) are deleted. A later Flow-format change is a `Schema.decodeTo` from the old encoded form, part of
   the same Schema. A newer format is quarantined, never reset (a downgrade keeps the bytes).

## The lane and owed records (one shape for all five proposals)

```ts
// NEW: head.phase (replaces inFlight), subject, releasing, ContractId in the key   existing: the rest
const LaneRecord = Schema.Struct({
  format: Format,
  head: Schema.NullOr(Schema.Struct({ attempt: AttemptId, input: contract.input, retryCount: Schema.Number,
    phase: Schema.Literals(["InFlight", "Held"]) })),   // one tag; machine-calls Q1 would add "Waiting"
  queue: Schema.Array(contract.input),                   // encoded inputs, as today
  displaced: Schema.Array(AttemptId),
  subject: SubjectPath,                                  // @spec.WriteAhead.R5: the creating subject path
  releasing: Schema.Boolean,                             // @spec.WriteAhead.R5: the releasing mark
});
// owed/<identity>: { format, rows: Array<Json> }; each row decodes alone:
const OwedRow = Schema.Struct({ contract: ContractId, key: Schema.NullOr(KeyText), attempt: Schema.NullOr(AttemptId),
  channel: Channel, reason: Reason, value: Schema.Json, kept: Schema.Boolean,
  subject: SubjectPath, incarnation: Schema.NullOr(Counter) });  // NEW: whom the row is parked for
```

A row that does not decode (its contract is gone, its value is bad) is kept as bytes in its place, reported at each
boot (OwedRowUnreadable, **proposed name**) and removed only by `forget`; the other rows are heard in owed order. A
row's `subject` is the address it is parked for (fragment-lifetimes); it is saved on the row because a lane's
record goes when the lane is Idle. A row for an incarnation-held ending (a frozen lookup's `Interrupted`) also
names its incarnation by the saved counter (@plan.Persistence.O2), never by an id (@spec.Restore.R1 re-ids), so
every parked ending is an owed row and there is one order.

## The shared decode helper

`decodeExit(schema)` (NEW, core; **proposed name**) runs `Schema.decodeUnknownExit` and returns
`Result<Type, Refused | Threw>`; it takes no copy and maps nothing. Each boundary maps the failure itself: a record
to its `ReadFailure` (quarantine, reset or dropped entry), a public call to a FlowError with that entry's code
(raw-throws), a call input to a decline (machine-calls). `decodeBy`'s `Result.try` around the throwing adapter goes.
User code that runs with no caller (a Schema's decode, a `resetOn` re-taken at restore, a schedule's delay at a
wake) follows one rule: a throw is a `Defect` issue naming the place, and the identity is treated as
@spec.Restore.R1 treats a quarantined actor record: not woken, lanes unbound, rows Waiting, bytes kept.

## Sub-ask 1: can context bindings be derived and not saved?

**Only the default part.** A binding is the app entry's default plus what a ref gave
(code:packages/flow-state-v3/src/host/wiring.ts#slotProvider). The default is declared data, so it is derived at
every start and never saved; a release that changes it rebinds, and the saved `seen` gives the one wave of
@spec.Actors.R9. What a ref gave is a fact no boot can derive (`conflictingCart` binds the `main` cart to
`guestShopper`; six fixture overrides and three tests use it), so the record saves only those overrides, each
decoded as the `ActorName` of the slot's declared provider machine. A forged binding then fails the decode or names
a real identity of the right machine, which nothing can tell from a true one (as @spec.Restore.R5 says of owed
rows). The saved binding is read only where the host passes no wiring: the boot's owing wake and an ending's wake
(code:packages/flow-state-v3/src/core/incarnations.ts, lines 133-151). Moving overrides to the entry as a function
of identity would remove the field but is a public API change and runs user code at the boot (question 1).

## Sub-ask 2: the release model (no renames)

Endings live in lane and owed records, never in actor records (@spec.Codec.R5), so the rule splits by what can be
lost.

- **Add:** a state is never saved; a slot absent from `seen` takes a silent baseline; a field takes its default; a
  contract has nothing saved; a schedule added to an active state is question 3.
- **Remove:** a saved state the release lacks resets the actor record (@spec.Restore.R7); a slot's `seen` and a
  schedule's timer are dropped and reported; a field is dropped with FieldDropped and the record rewritten at that
  boot; a contract's held lane is quarantined (@spec.Restore.R8) and its owed rows kept as bytes.
- **Schema change:** a slot's `seen` is dropped (silent baseline); a schedule key that fails drops its timer; a
  memory field that fails resets the record (R7); a lane input that fails quarantines the lane.
- **Undecodable** (any other strict failure, a newer format, non-canonical text): quarantined, bytes kept until
  the identity's first save (@spec.Restore.R5). So reset and quarantine stay two outcomes, picked by where the
  decode failed, with no shape stamp.

The invariant (**proposed** Restore I21): *for every Attempt acknowledged before a boot, after it exactly one of:
its ending is heard once, it stays held and reported at each boot, or `forget` removed it with HoldForgotten; and
no ending is heard for an Attempt not in a saved lane or owed record.* An actor record reset never touches lanes
or rows (already I13).

**Changes from today:** an undeclared `seen` slot is reported, not dropped silently; a `seen` value that fails its
Schema drops that slot, not the record; owed rows decode per row; a lane's key names its contract, not its
operation; the identity version sits in every key; `context` saves overrides only and `graph` is derived.

## How each part is shown, and cost

- **Run rule over every Story** (extends @spec.Codec.T6): every stored record decodes by the current app's
  Schemas; decoding its re-encoding gives the same value; a record read with nothing dropped re-encodes byte for
  byte. Catches a field written outside the Schema.
- **Generated corrupt-one-field test** (T92's): from each fixture's saved records, change one leaf; each result is
  quarantined, reset, a dropped entry or provably the same restore. No field list to forget.
- **Generated release sweep** (NEW): per fixture, derive releases that add or remove one name of each kind or bump
  the identity version, boot each over the old store, and check I21 plus "added slot is silent". Planted faults: an
  owed record lost to one retired contract; an added slot that fires; an old-version lane that blocks a commit.
- **Key round trip:** a property test that `RecordKey` decodes every key `encode` writes, with `%`, `/`, `|`, `@`
  in each segment and `|` in the key text.
- **Lint:** no `Schema.String` and no `startsWith` on record keys in `src/core/record*.ts` (existing `no-id-text`).
- **Cost:** one Schema build per machine at compile; boot decode unmeasured (bench before T58); every stored key
  changes once (unreleased format).

## Fixtures checked (by reading, not run)

- **shop `Checkout/Pay`:** renaming op `pay` keeps its lane (same contract); removing contract `void` with a held
  lane quarantines it, and its owed row stays as bytes while `charge`'s row is heard; a slot added to CheckoutFlow
  is silent; `conflictingCart`'s override is saved and read back.
- **home `Home/Room`:** keyed schedule `poll` keeps its timers by key Schema; dropping memory `checks` reports
  FieldDropped; removing `HEATING` resets only records in it, the `setTarget` lane kept.
- **sign-in `Auth/TrustedDevice`:** removing `reverify` drops its timer; a state rename resets (today's rule).
- **session (Badge→Team→Session→Org):** guest overrides are saved; a changed default gives one wave.
- **transfers `Bank/StandingOrder`:** read op `balance` saves no lane; a forged read-contract lane key fails
  `RecordKey` (write contracts only).

## Prior art

- Effect Schema 4.1.4 (installed), run in scratchpad `q4/probe.ts`: `Literals(...).pipe(brand)` refuses an unknown
  state; a `Struct` ignores excess keys by default and refuses them with `onExcessProperty: "error"`.
- Spike `holes/key.ts` (run, real `actorKey`): the stored key is `Pay/{"a":"b%7Cc%2Fd"}`, so a
  `TemplateLiteralParser` alone returns escaped text; the key Schema needs the unescape step. The earlier `q4/key.ts`
  parsed a format the code does not write and is withdrawn.
- XState: persisted snapshots are restored as-is with no check against the machine; the bug class here.
- TanStack Query persist: one app-wide `buster` drops everything (rejected in revisit.md). TanStack DB decodes rows
  through the collection's schema at load. Neither maps renames. (From memory; no local copy.)

## Open questions

1. **Context overrides.** (user; public API) A: save only what a ref gave, derive defaults (recommended: no API
   change, no user code at the boot, the static graph of @spec.Compile.R16 keeps every edge). B: move overrides to
   the entry as declared data plus a name function (`{ shopper: { machine: Shopper, name: ({ owner }) => owner } }`)
   and drop ref-level `{ context }`; nothing saved, but `conflictingCart` and three tests are rewritten.
2. **Renames.** (user; reopens the 2026-11-09 decision) A: none now; rename = remove + add (recommended: this design
   alone unblocks T92, and no fixture carries memory across a rename). B: `previously: "WAITING"` beside a state,
   slot, schedule or field, a sibling's old name or a list of them. B needs three rules this file does not build:
   every mapped record is rewritten at the boot (at adoption if lazy), a listed old name may not be reused while
   listed, and a move between parents is still remove + add.
3. **A schedule added to an active state.** (user) A: armed at the identity's wake, its delay evaluated then
   (recommended; stated limit: no entry time is saved, so a constant Duration counts from the wake, and only a
   delay read from memory, like wizard's `heldUntil`, lands where the release meant). B: idle until the state is
   entered again.
4. **Machine id and entry renames.** (user) A: a stated limit: the old records are orphans, discarded with their
   lanes quarantined (@spec.Restore.R8) (recommended until question 2 is B). B: `previously` on the machine id.

## Uncovered

- Not run: any fixture, gate or bench; the release table is by reading. `decodeExit` in the core was not checked
  against lint-bomb's core rules.
- Whether authored ids may hold `/`, `|` or `@` (@spec.Compile.R12 bans only controls); the key escapes every
  segment so the answer does not matter.
- How inherited overrides (a provider ref's own) are saved: on the consumer, as `overridesBy` computes them, is
  assumed; T92 checks it against `graph`.
- `Flow.private` fields (sign-in `refreshToken`): whether saved, and how a removed private field is reported.
- Fragment incarnations and `.history` in records (T56's routed item).
- A key fingerprint change (@spec.Restore.R6, OldVersionLane) beyond noting it stays a content check.

## Revision log

Review = the Sonnet review; Hole and HQ = `advisor-holes-2026-11-20.md` §1 holes and questions. No sidecars were
started for the revision; every item was checked against the code and Specs directly.

- Review 1: fixed. Per-entry decode for `seen`, schedules and memory; strict only for format, key, state, lane.
- Review 2: fixed. Closed on encode only; a missing field takes its default.
- Review 3, 4: fixed. Lanes are keyed by contract id as R8 says; the operation is derived, OpRenamed goes.
- Review 5, 6: fixed. Overrides are saved, defaults derived; the entry function moved to question 1 B.
- Review 7: left to the user (question 2 B allows a list).
- Review 8: fixed. Quarantine (R5) and reset (R7) both stay; a newer format is quarantined.
- Review 9: fixed. Both listed under "Changes from today".
- Review 10: fixed. `decodeExit`; `subject`, `releasing` and `phase` have places; no stored `sent`.
- Hole 1, HQ3: fixed. Owed rows decode per row; an unreadable row is kept as bytes.
- Hole 2, HQ2: left to the user (question 2 B's rewrite and no-reuse rules); no dormant mapping exists under A.
- Hole 3: fixed. Keys parse at the boot, content at adoption for lazy entries.
- Hole 4: fixed. The key Schema escapes and unescapes; the `q4/key.ts` claim is withdrawn.
- Hole 5: fixed. The version tag is a key segment; old-version records are listed by key, never decoded or re-keyed.
- Hole 6, HQ5: left to the user (question 4).
- Hole 7: left to the user (question 2 B: siblings only).
- Hole 8: fixed in the text (no saved entry time); the choice is question 3.
- Hole 9, HQ4: fixed by recommending saved overrides; the function form is question 1 B with the boot rule above.
- Hole 10: fixed. The run rule compares decodes; byte equality only for records read with nothing dropped.
- HQ1: adopted as the design's shape (renames out); the user confirms in question 2.
