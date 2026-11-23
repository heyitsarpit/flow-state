---
proposal spec-saved-records
status superseded 2026-11-23 [@proposal.algo-records]
    proposed 2026-11-20
description Superseded by @proposal.algo-records; kept as prior art for one pure `Fate` judge per stored key.
---
# Saved records and releases: one judge, one fate

**Verdict: keep the decode pipeline and the format steps; replace the scattered "what if the definition changed"
lookups with one judge.** Every stored key gets exactly one `Fate` from one pure function of (key, text, compiled
app). The record's identity and version live in its key, its content holds only what the key does not determine,
the boot writes nothing, and a record that carries an ending (lane, owed) is never dropped or overwritten by a
release. Format 7 is the one bump this needs.

Everything here is **proposed**. Asks are in section 8. Serves @task.V3.T92 and @task.V3.T56; neighbour
@task.V3.T98 (public values). Sources: `code:packages/flow-state-v3/src/core/record.ts`, `actor-record.ts`,
`record-format.ts`, `persist.ts`, `world.ts`, `schedule-restore.ts`, `incarnations.ts`, `src/host/store.ts`;
`wiki/conventions/boundaries.md`; @plan.Persistence.O5; @spec.Restore.R5 to R8; `revisit.md` lines 22 to 30.

## 1. What exists

Paths are under `packages/flow-state-v3/src/`.

**Holds (reviewed, tested, keep):**

- `core/record.ts#decodeRecords`: one pass over the store in key order; canonical text (`codec.ts#decodeCanonical`,
  exact round trip), kind from the key prefix, format, identity, then the kind's decoder; any failure lands in
  `quarantined` and the bytes stay. The boot never fails on a record.
- `core/actor-record.ts`: per-format Schemas and pure steps 1 to 4 (`stepsTo`); baselines keyed by slot and event
  (T107's fix for the positional swap); `decodeBy` catches a throwing user Schema (`record-format.ts:33`).
- `core/schedule-restore.ts`: a saved timer is matched by name and keyed-ness; the current definition's `send`
  fires (the record no longer copies it).
- `host/store.ts`: `Store.load` returns text by key and `write` lands a batch whole; the store decodes nothing.
- `world.ts#Quarantine`: `Unreadable` and `Retired`, with exits by capture, dispose, cancel and forget.

**Wrong or missing (each verified in code):**

| #   | Finding                                                                                                    | Where                                            |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| W1  | Lane and owed records take `format: Format` (1 to 5) with no step: a bump re-reads old ones as current.    | `record.ts:36,49`                                |
| W2  | The saved `state` is copied and never checked against `compiled.states`; lookups tolerate absence.         | `actor-record.ts:336`, `tree.ts:8`               |
| W3  | A removed memory field is stripped silently (Schema's default `onExcessProperty: "ignore"`).               | `actor-record.ts:303`                            |
| W4  | A removed slot's `seen`, a removed schedule's timer and an unreadable key are dropped by `Option.toArray`. | `actor-record.ts:309`, `schedule-restore.ts:103` |
| W5  | Identity is stored in the key and in the content, then compared by hand. Six hand parses of key text.      | `record.ts:389-399`, `no-id-text` disables       |
| W6  | Brands are `Brand.nominal` applied after hand checks; no Schema is built from Compiled for identifiers.    | `world.ts:29-41`                                 |
| W7  | One owed row of a removed operation quarantines the whole owed record: other rows wait behind it.          | `record.ts:245`, `:445`                          |
| W8  | A quarantined owed record is overwritten by the next boot that derives an ending (rows lost).              | @task.V3.T56 comment 2026-11-16                  |
| W9  | No release code exists: no stamp, fingerprint, identity version, `OldVersion*`, `RecordShapeChanged`.      | grep, none                                       |
| W10 | A machine that is declared but not loaded reads as `readFailed("machine")`: quarantine, not "not now".     | `actor-record.ts:293`                            |
| W11 | Steps read the *current* definition (`stepFour` adds idle markers from today's state chain).               | `actor-record.ts:376-401`                        |
| W12 | `stepsTo` hand-chains each format (format 1 skips steps 2 and 3); nothing forces a row per kind.           | `actor-record.ts:348-370`                        |

**The freedom.** "This record names something the definition lacks" is decided at about twelve lookups, each with
its own default: trust (W2), strip (W3), drop (W4), quarantine the lot (W7). No lookup can tell *corrupt* (same
build, bad bytes) from *outdated* (another build) from *not loaded* (W10), so each picked one. In
policy-convergence's terms: one rule implemented many times, on top of a state (the key's fate) with several
writers (boot, capture, forget, cancel, dispose) and no table. T20, T92 and T107 each stopped on one instance.

## 2. State inventory

| State                               | Values                                  | Changed in one step by                              | Owner (proposed)           |
| ----------------------------------- | --------------------------------------- | --------------------------------------------------- | -------------------------- |
| S1 Stored text of a key             | absent, text                            | capture write, forget, cancel (Idle lane), dispose  | capture (`persist.ts`)     |
| S2 Fate of a key                    | `Live`, `Aside{reason}`, `Unverifiable` | boot, adopt, capture write, forget, cancel, dispose | `core/fate.ts` (new)       |
| S3 Format number                    | 1..`FORMAT`                             | a build                                             | `record-format.ts`         |
| S4 Version tag (identity, lane key) | text in the key                         | a build that changes a name or key Schema           | `core/record-key.ts` (new) |
| S5 Shape stamp                      | text in the envelope                    | a build that changes the saved shape                | `core/shape.ts` (new)      |

Not this concept's state: an incarnation's memory, a lane's phase, a timer's arming. They cross the seam as typed
values the judge has already decoded.

**Seams.**

| Neighbour            | I take                                                                                                                       | I give                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Typed machine        | `Compiled` (`states`, `fields`, `walk`, `identity`, `context`, `operations`); the app's declared machine ids, eager and lazy | `StateName`, `ActorName` brands built from it                                   |
| Fragments            | subject paths as members of `compiled.states` and of the name codec (the hook in T92's acceptance)                           | nothing new: a fragment's states are judged as states                           |
| Reads and operations | the lane key's segments (contract, key text) and `LaneBody`/`OwedRow` Schemas per operation                                  | `Fate` per lane key; `Restored` lanes typed; `Aside` holds by key               |
| Schedules (T118)     | the saved timer Schema of format 6 (`refused`, `restartOn` baseline)                                                         | decoded timers; names the definition lacks removed and listed in `dropped`      |
| Context slots        | the slot's JSON codec                                                                                                        | `seen: None` for a slot with nothing saved; what `None` means at bind is theirs |
| Data layer           | an entity or stream record kind registered as `{ prefix, steps, bodyOf, obligation }`                                        | the same envelope, judge and fate table                                         |
| Lazy features, T48   | "machine loaded" as an input                                                                                                 | `Unverifiable` keys, re-judged at adoption                                      |
| T98                  | nothing                                                                                                                      | nothing: a record is a source decoded once here; public arguments are T98's     |

## 3. The design

### 3.1 One envelope, identity and version in the key

Before (format 5/6, existing; the identity is said twice and compared by hand):

```
key   actor/cart/main
text  {"baselines":{},"context":{},"format":6,"graph":{},"machine":"cart","memory":{"lines":[]},
       "name":"main","schedules":[],"seen":{},"state":"open"}
key   lane/cart/main|addLine|{"sku":"a1"}
text  {"attempt":"a-7","displaced":[],"format":6,"inFlight":true,"input":{"qty":1,"sku":"a1"},
       "machine":"cart","name":"main","operation":"addLine","queue":[],"retryCount":0}
```

After (format 7, proposed):

```
key   actor/cart@k3f9/main                       // NEW: @k3f9, the identity version tag
text  {"body":{"baselines":{},"context":{},"memory":{"lines":[]},"schedules":[],"seen":{},"state":"open"},
       "format":7,"shape":"s81c"}                 // NEW: body, shape. DROPPED: machine, name
key   lane/cart@k3f9/main|addLine@q20b|{"sku":"a1"}   // NEW: @q20b, the key fingerprint tag
text  {"body":{"attempt":"a-7","displaced":[],"inFlight":true,"input":{"qty":1,"sku":"a1"},
       "queue":[],"retryCount":0},"format":7,"shape":"s81c"}   // DROPPED: machine, name, operation
```

- **Stored once.** A record's content holds nothing its key determines (T92 acceptance). The identity, the
  operation and both version tags are in the key only.
- **Version in the key (S4).** A build that changes a name Schema or a key Schema writes under a new key. An
  old-version record is simply a record at another tag: nothing is re-keyed at the boot, nothing is overwritten,
  and a revert finds its records where it left them. This removes `LaneRekeyed`, `LaneRekeyCollision` and the
  overwrite in `revisit.md:29` by structure. `graph` is open (section 7, O1).
- **Shape in the envelope (S5).** `shape` is the writer's saved-shape fingerprint for the machine. It picks only
  the *reason* a failing record is set aside (`Outdated` when it differs, `Unreadable` when equal). It never
  changes what happens to the bytes, so a fingerprint that misses a change or sees a false one is harmless.

### 3.2 One key codec, brands from Compiled

```ts
// NEW: core/record-key.ts. The only reader and writer of key text (replaces six hand parses).
type RecordKey = Data.TaggedEnum<{
  Actor: { actor: ActorRef };
  Owed: { actor: ActorRef };
  Lane: { actor: ActorRef; contract: ContractName; keyTag: Tag; keyText: KeyText };
}>;
type ActorRef = { machine: MachineId; idTag: Tag; name: ActorName };   // NEW brands: MachineId, Tag, KeyText

// Schema.String <-> RecordKey through decodeTo; decode accepts only what encode produces (round trip).
const RecordKeyText: Schema.Codec<RecordKey, string>;

// NEW: brands are Schemas with a real check, built once per machine. `Schema.brand` alone checks nothing.
const brandsOf = (c: Compiled) => ({
  StateName: Schema.Literals([...c.states.keys()]).pipe(Schema.brand("flow-state/StateName")),
  ActorName: nameCodec(c.identity).pipe(Schema.brand("flow-state/ActorName")),   // existing: identity walker
});
```

`world.ts#actorKey` and `laneId` become encoders of this codec; `restoredLaneId` and `restoredAttemptId` go: a
brand is made only by a Schema decode or by the mint.

### 3.3 Format steps: a total table per kind

```ts
// Before (existing): stepsTo, a switch with hand chains; lane and owed have none.
// After (proposed): one row per kind per format; step n takes format-n JSON to format n+1.
type Step = (json: Json, key: RecordKey) => Result.Result<Json, ReadFailure>;
const steps: { readonly [K in Kind]: { readonly [N in OlderFormat]: Step } } = { actor, lane, owed };
const toCurrent = (kind: Kind, from: Format) => (json: Json, key: RecordKey) =>
  Arr.range(from, FORMAT - 1).reduce((r, n) => Result.flatMap(r, (j) => steps[kind][n](j, key)), ok(json));
```

- `OlderFormat` is `1 | … | FORMAT-1` as a type: bumping `FORMAT` fails to compile until each kind has a row
  (identity where its shape did not move). Closes W1 and W12.
- **A step reads no definition** (closes W11). What it cannot derive from the record it leaves absent, and the
  judge's "absent" row decides, the same row a definition edit takes. `stepFour`'s idle markers move to the
  schedule concept's restore of "a schedule the record lacks".
- Step 6 to 7: move the content under `body`, check `machine`/`name`/`operation` against the key and drop them
  (a mismatch is `Unreadable("key")`), re-key under the current tags, `shape` absent. A record with no shape
  stamp is judged by decode alone and never read as `Outdated` (@plan.Persistence.O5, "never resets").

### 3.4 The judge

```ts
// NEW: core/fate.ts
type Fate = Data.TaggedEnum<{
  Live: { record: Typed; dropped: ReadonlyArray<Dropped>; dirty: boolean };
  Aside: { reason: Reason; obligation: boolean };
  Unverifiable: { machine: MachineId };
}>;
type Reason = Data.TaggedEnum<{
  Unreadable: { code: ReadFailure; detail: Option.Option<string> };   // existing
  Retired: { what: "machine" | "operation" };                        // existing, widened
  Outdated: { part: "state" | "memory" };                             // NEW: another shape, does not read
  OldVersion: {};                                                     // NEW: another idTag or keyTag
  Newer: { format: number };                                          // NEW: split out of Unreadable
}>;
const judge: (app: CompiledApp) => (keyText: string, text: string) => readonly [Option<RecordKey>, Fate];
```

One pipeline, each stage's failure a named reason:

1. key text by `RecordKeyText` (fails: `Unreadable("kind" | "key")`);
2. canonical JSON, then `format` (newer: `Newer`; null, fractional, string: `Unreadable("format")`);
3. machine: undeclared is `Retired("machine")`; declared and not loaded is `Unverifiable`, body unread;
4. tags against the compiled app's: another tag is `OldVersion`;
5. `toCurrent` steps;
6. the body, by the Schema `bodyOf(kind, compiled)` built from Compiled with `onExcessProperty: "error"`, each
   name a brand of 3.2, through the **reference table** below.

**Reference table: what a record names, against the definition.** `same` is "shape stamp equal". One row per cell;
no other code may look a record's name up in a definition.

| The record names                        | Present, reads | Present, does not read                                               | Absent from the definition                                               |
| --------------------------------------- | -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| state (leaf, history target)            | Live           | n/a                                                                  | same: `Unreadable`; else `Outdated(state)`                               |
| memory field                            | Live           | same: `Unreadable`; else `Outdated(memory)`                          | same: `Unreadable`; else dropped (`FieldDropped`), dirty                 |
| (definition's field the record lacks)   | n/a            | n/a                                                                  | the field's Schema decodes absence: Live, dirty; else `Outdated(memory)` |
| slot: binding, `seen`, baselines        | Live           | same: `Unreadable`; else that slot's entries dropped                 | same: `Unreadable`; else dropped                                         |
| schedule timer: name, key, pause reason | Live           | same: `Unreadable`; else that timer dropped                          | same: `Unreadable`; else dropped                                         |
| lane: contract                          | Live           | n/a                                                                  | `Retired("operation")`, hold kept                                        |
| lane: head's input                      | Live           | **Live, input unread**: the lane is Held and ends unknown `Restored` | n/a                                                                      |
| owed row: operation                     | Live           | the row kept verbatim, not delivered                                 | the row kept verbatim, not delivered (closes W7)                         |

- A rename is a removal plus an addition (the user's Q1, `revisit.md:23`): there is no rename map. A renamed
  state resets the actor to its initial state at the next ensure; its lanes and owed rows are untouched, so no
  ending is lost and none is invented.
- Nothing "restores into the nearest surviving parent": that would invent a position.
- An added state, slot or schedule has nothing saved; its owner starts it (schedules: full delay, T57's ruling;
  slots: section 7, O3).
- `Dropped` entries are listed once per boot per definition (`FieldDropped` and its like), not per record.

### 3.5 Fate over time: one table, one owner

`World.quarantined` becomes `World.aside: ReadonlyMap<RecordKey, Aside | Unverifiable>`, owned by `core/fate.ts`.
**The boot writes nothing; capture is the only writer of S1** besides the removals below. `dirty` marks a `Live`
record for the next capture.

| Fate \ input                                    | boot or adopt judges | capture writes the key             | forget identity          | cancel on the lane key | dispose        |
| ----------------------------------------------- | -------------------- | ---------------------------------- | ------------------------ | ---------------------- | -------------- |
| (no key)                                        | per judge            | Live                               | n/a                      | n/a                    | n/a            |
| Live                                            | n/a                  | Live                               | removed                  | the lane's own rule    | actor: removed |
| Aside, actor, `Unreadable`/`Outdated`/`Retired` | n/a                  | Live (the reset)                   | removed                  | n/a                    | removed        |
| Aside, actor, `Newer`                           | n/a                  | **withheld**, reported once        | removed                  | n/a                    | stays          |
| Aside, any, `OldVersion`                        | n/a                  | cannot happen (another key)        | removed                  | n/a                    | stays          |
| Aside, lane or owed (`obligation`)              | n/a                  | **withheld**, reported             | removed, `HoldForgotten` | Idle lane: removed     | stays          |
| Unverifiable                                    | adopt: per judge     | cannot happen (machine not loaded) | removed                  | n/a                    | stays          |

Rows come from: I1 (obligation rows never overwritten), I2 (boot writes nothing), R9 (`Newer` withheld), R10
(`Unverifiable` re-judged), the user's Q1 A (an outdated actor record is reset by the fresh actor's first save).

### 3.6 Reports (the public surface; no migration API)

There is no new authoring keyword. What an app sees, from where the data comes:

```ts
// existing: Store.load -> text by key.  existing: runtime.ready.  NEW or renamed: the issue names below.
const runtime = yield* Flow.runtime(app);          // user-defined: app
const issues = yield* runtime.ready;               // existing
// release B renamed state "open" to "editing" and dropped memory field "coupon" from machine "cart":
// [ RecordShapeChanged { machine: "cart", count: 1 },     // NEW: one per definition, with its count
//   FieldDropped       { machine: "cart", field: "coupon", count: 41 } ]   // NEW
// the same boot with one record's bytes damaged adds:
//   RecordUndecodable  { actor: cart/main, code: "memory" }                // existing
// a lazy machine "reports" not loaded yet adds nothing; inspection lists its keys as "unverifiable now".
```

## 4. Requirements and Invariants

| Id  | Rule                                                                                                         | Source                              | The check that fails on a wrong build                                         |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------- |
| R1  | Every stored key gets exactly one `Fate`; the boot never fails.                                              | `record.ts#decodeRecords`; T92      | any text under any key: `judge` returns, never throws                         |
| R2  | Content holds nothing its key determines.                                                                    | T92 acceptance                      | encode, then grep the body for machine, name, operation, tags                 |
| R3  | A decode accepts only what an encode produces, key included.                                                 | T92 comment 2026-11-19              | round trip on generated records; corrupt-one-field, key fields too            |
| R4  | Every identifier in a record is a brand made by a Schema built from Compiled.                                | boundaries.md:25 (user, 2026-11-18) | lint: no `Schema.String` for an identifier, no `Brand.nominal` in record code |
| R5  | Each kind has a step for each older format; a step reads no definition.                                      | @spec.Restore.R5; W1, W11           | type: `steps` total; format-n fixtures of each kind restore                   |
| R6  | A name the definition lacks takes its reference-table cell; no other lookup.                                 | W2 to W4                            | edit matrix (section 6); lint on tolerant lookups                             |
| R7  | Same shape and not reading is `Unreadable`; another shape is `Outdated` or dropped.                          | @plan.Persistence.O5 (Q1 A)         | same record judged under equal and differing stamps                           |
| R8  | Another identity or key tag is `OldVersion`: kept, never read into the current identity.                     | @plan.Persistence.O5 "Versions"     | name Schema edit: old record at old key, untouched after 2 boots              |
| R9  | A `Newer` record is never overwritten by an older build.                                                     | `revisit.md:29`; T56 "downgrade"    | A, B, A, B: B's record equal at the end                                       |
| R10 | Declared and not loaded is `Unverifiable`: body unread, bytes kept, re-judged at adoption.                   | T56 acceptance                      | lazy fixture: boot, list, adopt; fate equals an eager boot's                  |
| I1  | A release never loses or invents an ending: owed rows and held lanes before equal delivered plus held after. | D15; T56 false-pass line            | conservation oracle over every matrix cell                                    |
| I2  | The boot writes nothing to the store.                                                                        | 3.5                                 | a store fake that counts writes before the first capture                      |
| I3  | The shape stamp changes a reason, never a record's bytes or an ending.                                       | 3.1                                 | flip the stamp on every matrix cell: same store, same endings                 |
| I4  | Judging is idempotent: a second boot over an untouched store gives the same fates.                           | T20's double-reload gap             | boot twice, compare `aside` and endings                                       |
| I5  | An owed row is judged alone: one bad row holds back no other.                                                | W7                                  | owed `[ok, retired, ok]`: two delivered, one kept                             |

Tables: the reference table's rows are R6, R7 and I5; the fate table's are in 3.5.

## 5. Development strategy

**Split by state ownership (two Tasks, in this order):**

1. **T92: the codec (owns no state over time).** `record-key.ts`, brands, `bodyOf(kind, compiled)`, the step
   table, format 7, and `judge` stages 1, 2, 5 and the "same shape" column. Output: text in, typed record or a
   named failure out. It does not touch quarantine's entries or exits.
2. **T56: the fate (owns S2, S4, S5).** Tags and the shape fingerprint, `judge` stages 3 and 4 and the
   "another shape" columns, `World.aside` with the 3.5 table, withheld writes, `Unverifiable` and adoption.

Do not split T56 further: S2 has six writers and must be solved as one table. Move from T92 to T56 the quarantine
exits now listed in T92; move from T56 to T92 nothing.

**Order inside T92:** key codec and brands first (everything names keys), then the step table with format 6 to
7, then `bodyOf`. **Inside T56:** fingerprint spike, then tags in keys, then the fate table, then adoption.

**Risk and spikes (before any production code):**

- **Spike 1 (T56, highest risk): a stable Schema fingerprint.** Take 30 fixture Schemas; fingerprint through
  Effect's representation of a Schema's type and encoded sides; run under two module load orders and a minified
  build; list the edits it misses (a filter's predicate body). Pass: equal across runs; misses only harmless by
  I3 for `shape`. For tags (S4) a miss is a stated limit; write it down.
- **Spike 2 (T92): decode cost.** Build `bodyOf` once per machine; decode 10,000 records. If Schema decode of the
  envelope dominates, keep the envelope hand-read and the body by Schema.
- **Spike 3 (T92): `graph`.** Derive each provider's bindings from its own record; run T20's inverted Restore R5
  bindings test; keep `graph` only for providers that have no record (O1).

## 6. Testing strategy

- **Edit matrix (the generator).** Rows: each reference-table row. Columns: remove, rename, add, compatible
  Schema change, incompatible Schema change, reorder. Each cell: save under build A at a **non-default moment**
  (deep state, two keys of one operation in flight, a queued commit, owed rows of two operations, a timer mid-
  series and one held), boot under build B. Expected fate and endings come from sections 3.4 and 3.5, written as
  a table in the test, never read from the code.
- **Sequences.** For every cell also run A,B,B (I4), A,B,A,B (R9), and A,B then a capture then B (dirty records
  rewritten once, withheld keys untouched).
- **Conservation oracle (I1).** Count endings owed and lanes held before; after each boot assert delivered plus
  held plus kept-aside equals it, with no extra.
- **Corrupt-one-field** over the envelope, the body **and the key** (T92's sweep skipped keys), at depth past 64,
  for formats 1 to 7 of each kind (the sweep made no older-format records).
- **Hostile store fake.** Unordered keys, one identity's text under another's key, a key of no kind, a refused
  load after a landed write, text that parses and is not canonical.
- **Planted faults:** a tolerant lookup per reference row; a skipped step; a step reading Compiled; the boot
  writing; a capture over an obligation key; a capture over `Newer`; stamp compare inverted; `Unverifiable`
  treated as `Retired`; whole-record owed quarantine.
- **Guards:** the `steps` type; lint (`no-id-text` with zero disables outside `record-key.ts`; no optional lookup
  of `compiled.states`, `fields`, `context`, `operations` in restore code outside `fate.ts`); a surface test that
  record Schemas contain no bare `Schema.String` identifier. Inverted tests use an exact expected value, never
  `it.fails` (T118's finding).
- **Bench:** boot of 1,000 and 10,000 records, equal stamp and differing stamp; `bodyOf` build per machine; key
  codec per key.

## 7. Handoff for the Opus leads

**T92.** Read first: this file 3.1 to 3.4, `record.ts`, `actor-record.ts`, `record-format.ts`, branch
`t92-format-4` (prior art: identity in the key only), boundaries.md. Decided (if section 8 is accepted): the
envelope, the key codec, total steps, steps read no definition. First commit: R1 to R5 and I5 as failing checks,
format-6 fixtures of all three kinds, the corrupt-key sweep. Open, settle before code:

- **O1 `graph`:** saved or derived (Spike 3). Recommendation: derived where the provider has a record.
- **O2 lane head input that does not read:** the table says the lane still ends unknown `Restored`. Confirm with
  the reads-and-operations design that this ending needs no decoded input; if it does, the cell is `Aside`.

**T56.** Read first: 3.1, 3.4 to 3.6, @plan.Persistence.O5, `revisit.md:22-30`, Pending D31, T56's comments.
Decided (if accepted): tags in keys, the fate table, no boot writes. First commit: R6 to R10 and I1 to I4 as
failing checks through the edit matrix on two fixtures, with Spike 1's result attached. Open:

- **O3 a slot added by a release:** this design hands `seen: None`; whether it fires once is the context-slots
  design's, and T56's comment of 2026-11-20 records the conflict with Turn R22.
- **O4 Restore R3 "once" against I6 "once per incarnation"** (T56 comment 2026-11-18): settle before the matrix.
- **O5 the lane key's contract segment** follows D31 (keyed by contract): its text is the neighbour's.

## 8. Proposed decisions

**D1. Version tags live in the key; nothing is re-keyed.** [dropped: agent cleanup 2026-11-23] Replaces boot re-keying (`LaneRekeyed`,
`LaneRekeyCollision`) in @plan.Persistence.O5.
- Trace 1: release B changes the cart's name Schema. Today's plan: the boot re-keys the old lanes and B's fresh
  cart overwrites the old record at the same key; a revert to A finds B's record. Proposed: B writes under
  `cart@new`, A's records sit at `cart@old`; the revert reads them unchanged.
- Trace 2: two re-keys land on one target in one boot. Today: `LaneRekeyCollision`, the mover quarantined.
  Proposed: no move exists, so no collision.

**D2. Compatibility is decided by decode; the shape stamp only names the reason.** [dropped: agent cleanup 2026-11-23] Replaces the runner's ruling
that any structural Schema change resets the record.
- Trace 1: `mode: Literals("a","b")` gains `"c"`. Ruling: every cart is reset, drafts lost. Proposed: restored.
- Trace 2: `when` moves from an ISO string to epoch milliseconds. Both: the record does not read and is reset;
  proposed reports it once as `RecordShapeChanged`, not as 10,000 corrupt records.

**D3.** [dropped: agent cleanup 2026-11-23] A record that carries an ending, and a `Newer` record, are never overwritten; the write is withheld and
reported. Replaces the runner's ruling for owed records (W8) and answers `revisit.md:29`.
- Trace 1: a stale tab on build A boots after build B saved. Today: A's fresh actor overwrites B's record; the
  user's work in B is gone. Proposed: A runs that identity unsaved and says so; B's record stands.
- Trace 2: an owed record does not read; a new ending is owed for the identity. Today: it overwrites the record
  and the unread rows are lost. Proposed: the new ending is delivered live, its save withheld and reported.
  Price: that one ending is not durable until `forget` or a build that reads the record.

**D4. An owed row is judged alone** [dropped: agent cleanup 2026-11-23] (W7): a retired or unreadable row is kept verbatim and does not hold back
the others. Trace 1: rows `[paid, retired-op row, refunded]`: today none is delivered; proposed two are. Trace 2:
all rows read: no change.

**D5. Task boundary:** [answered: user 2026-11-21; as proposed, as prior art: @review.spec-cohesion-r2#second-wave-task-boundaries] T92 is the codec and owns no state; T56 owns the fate, quarantine's exits included.

Not proposed: a rename map or `version` hook (the user's Q1 stands; `revisit.md:23` names the reopen case).

## Sidecar log

Four Haiku sidecars at effort high, read-only. No adversary ran: the 30 minutes went to verification.

| Sidecar   | Finding                                                                    | Result                | Why                                                                                   |
| --------- | -------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Code map  | Lane and owed accept formats 1 to 5 with no step                           | accepted              | read `record.ts:36,49` and `record-format.ts:14`                                      |
| Code map  | Saved `state` never checked                                                | accepted              | read `actor-record.ts:336` (`state: r.state`)                                         |
| Code map  | No release, stamp or fingerprint code                                      | accepted              | own grep over `src`, no hits                                                          |
| Code map  | Removed field stripped by `onExcessProperty` default                       | accepted, not re-run  | matches Effect's documented default; T92 must pin it by test                          |
| Code map  | `inFlight` duplicates phase                                                | rejected              | restored lanes are all Held; the pre-crash phase is a fact, and it is the neighbour's |
| Code map  | `baselines` conditional on `seen` is a duplicate                           | rejected              | a compression with one rule; T107 reviewed it                                         |
| Plans     | Q1 A: per definition, no manual version; rename is drop plus add           | accepted              | read @plan.Persistence.O5 lines 254-268                                               |
| Plans     | Most O5 details are "the runner's ruling", not the user's                  | accepted              | read the same lines; D2 to D4 replace rulings, not user decisions                     |
| Plans     | D31 accepted: lanes keyed by contract                                      | accepted, not re-read | cited as the neighbour's seam (O5)                                                    |
| Plans     | "Unverifiable now" defined in no Plan or Spec                              | accepted              | defined here (R10)                                                                    |
| Reviews   | T92 sweep never corrupted the key or made older formats                    | accepted, not re-read | carried into section 6                                                                |
| Reviews   | T118 format 6 also saves the `restartOn` baseline                          | accepted, not re-read | a seam only; the timer Schema is T118's                                               |
| Reviews   | Failure-limit counting differs between Tasks                               | changed               | out of scope here; noted for the orchestrator only                                    |
| Prior art | `Schema.brand` adds no runtime check                                       | accepted              | hence `Literals(...).pipe(brand)` in 3.2; lead confirms on the installed version      |
| Prior art | Effect persistence has no payload versioning; `getMany` deletes what fails | accepted as contrast  | the opposite of I1; nothing to reuse                                                  |
| Prior art | XState, Temporal, redux-persist notes                                      | not used as evidence  | from the sidecar's memory, unverified                                                 |
