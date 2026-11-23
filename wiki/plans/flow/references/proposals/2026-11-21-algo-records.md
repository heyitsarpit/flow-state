---
proposal algo-records
status proposed 2026-11-21
description Proposes the store as one value with one encoder and a two-stage judge, with identity only in the key.
---
# Saved records, the data layer and the saved format: the core algorithm (2026-11-21)

**Bottom line:** the store is one value with one encoder and one judge. The judge runs in two stages. Stage 1
reads structure and needs no definition: keys, text, format steps, one strict shape per kind and the one relation
that spans rows. Stage 2 resolves every name a record holds against the definition through one reference table.
Identity lives only in the key. Everything about one Attempt lives in one record, `work/<identity>`, so no check
spans records. Boot, lazy adoption and hydrate call the same `admit`. Everything here is proposed.

**Why now:** @task.V3.T20 and @task.V3.T92 stopped at the failure limit because the format could hold
contradictions and validity was the reader's list of checks (@review.case-studies section 2.3). Problems 12 and 13
of @review.algorithm-review and its section 2.5 holes are this cluster's.

**Read first:** @proposal.algorithm-round (principles, deliverable); @proposal.spec-saved-records (SR) and
@proposal.spec-data-layer (DL), which this design fills or departs from (section 15 lists each departure);
@proposal.algo-schedules (AS) sections 6.5 and 6.6; @proposal.algo-turn (AT) sections 4, 6.3, 6.5 and 14.

**Risk:** the executable model found four failing invariants in the first draft. The fixes are in this text, and
two re-runs followed (section 17). The last run found two more holes; their fixes are in this text and were not
run again (H13). What no check covered is in section 18.

## 1. Walkthrough: a payment saved mid-flight, reloaded under a new build

Build A of the shop fixture is paying: `Checkout/Pay` `checkout-1` is in `PAYING`, its `pay` Attempt is out, and
the `slow` timer is due at 9000. The store holds three records (format 6, proposed):

```
key   actor/Shop/Cart/{"owner":"main"}
text  {"body":{"graph":{},"instances":{},"memory":{"adding":"","errors":{},"lines":{"a1":2},"notice":"",
       "wanted":{}},"schedules":{},"slots":{"shopper":{"baselines":{},"provider":{"machine":"Shop/Shopper",
       "name":"main"},"seen":{"value":"Elif"}}},"state":"OPEN"},"format":6,"shape":"c41a"}
key   actor/Checkout/Pay/checkout-1
text  {"body":{"graph":{},"instances":{},"memory":{"busyTries":1,"cartId":"main","intentId":"pi_1",
       "totalCents":900},"schedules":{"slow":{"arming":{"_tag":"Due","armedAt":1000,"attempt":0,
       "dueAt":9000}}},"slots":{},"state":"PAYING"},"format":6,"shape":"s81c"}
key   work/Checkout/Pay/checkout-1
text  {"body":{"lanes":{"":{"Checkout/pay":{"{\"intentId\":\"pi_1\"}":{"displaced":[],"head":{"attempt":
       "att-3f-1","claims":[],"hold":"Out","rest":{"paymentMethodId":"pm_1"},"retryCount":0},
       "queue":[]}}}},"rows":[]},"format":6,"shape":"s81c"}
```

The tab dies. Build B loads: it renamed Pay's memory field `busyTries` to `tries` and dropped the `slow` schedule.

1. **Stage 1 (no definition).** Each key parses, each text is canonical, each envelope is `{body, format, shape}`,
   each body fits its kind's strict shape, and `att-3f-1` occurs once in the work record. Three records, two
   identities.
2. **Stage 2 (the reference table, section 6.4).**
   - Cart: every name reads. `Live`, not dirty. Nobody owes it anything, so it stays a record and sleeps.
   - Pay's position: `PAYING` reads. `busyTries` is absent from B: dropped, reported once as
     `FieldDropped { machine: "Checkout/Pay", field: "busyTries", count: 1 }`. `tries` is absent from the record:
     it takes its declared initial. `slow` is absent from B: its timer is dropped and never fires. `Live`, dirty.
   - Pay's work: the contract, the key text and `rest` read. The head is `Out` and no wire survived the reload,
     so the boot gives a Held head that owes one unknown `Restored` (section 6.6). `Live`, dirty.
3. **Start.** Pay has a `Live` position and is owed an ending, so the boot wakes it. Its `Start` delivers the
   unknown; the machine moves to `UNSURE` and arms `check`. The capture after that turn writes Pay's two records
   in one batch: the position without `busyTries` and `slow`, and the head as `Held` with no unknown left. A
   second reload tells nothing again.

What the user must see: the charge is never sent twice, the unknown is heard once, the renamed field's value is
gone (a rename is a removal and an addition; no migration API exists, `revisit.md:26`), and the cart is untouched.
Had B removed the `pay` operation instead, the lane would be carried byte for byte and reported, and a `forget` or
a build that declares `pay` again would be its exits.

## 2. Required properties, in user terms

- **P1. Nothing owed is lost.** An ending a write is owed (answered, unknown, not sent) is delivered to its
  actor, or stays in the store byte for byte until the user forgets the identity or cancels that lane. No build,
  format step or definition edit drops one. An unknown is not lost when its Attempt's final answer replaces it.
- **P2. Nothing is invented.** No actor hears an ending for an Attempt it never made. An ending whose handling
  was saved is never told again: the handling and the told mark land in one batch, so a crash keeps both or
  neither. No timer fires that the current definition lacks.
- **P3. A write is never sent twice by a reload.** A restored Attempt is held, never re-sent by the boot.
- **P4. A record never becomes another identity's.** A record is read only as the identity its key names.
- **P5. The app always boots.** No stored text, of any size or shape, fails `ready`, throws, or stops another
  record from loading.
- **P6. What is not understood is not destroyed.** A record from a newer build, a removed machine or a machine not
  yet loaded keeps its bytes.
- **P7. A definition edit has one stated effect per kind of name** (state, field, slot, schedule, operation), the
  same at every scope, and the app is told what was dropped.
- **P8. Nothing is saved that the definition does not save.** No key exists for a machine with `persist: false`
  or a local actor; no prediction is saved, so nothing unconfirmed reads as confirmed after a reload.

## 3. Problem classes

A family is **removed** only when a type or signature cannot express a member; otherwise it is handled at one
named point.

| #   | Family                                    | Known members                                                                                                                                                                                          | Handling                                                                                                                                                                                                                  |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | A fact stored twice can disagree          | identity in key and content (T20 review 2); lane key text against the head's input (review 3); one Attempt in a lane record and owed rows (T92 close 3); a claim row beside its lane (DL PD7); `graph` | **Removed** for identity (no `Shape` field holds it) and for an Attempt's unknown (a head has one slot for it). **One point** for the input: `rest` is read only merged with the key's fields (6.5). `graph` is debt (H2) |
| F2  | The reader accepts what no writer emits   | `recordFour` shapes (T92 routed); reason sets wider than writers; `Schema.String` identifiers; excess fields; empty containers; lane and owed formats 1 to 4 read by the format 5 Schema               | **One point:** each kind has one strict, normal-form `Shape` codec used in both directions, plus the round-trip run rule (I1, I2). Identifiers are brands with one constructor (**removed**: section 10)                  |
| F3  | Validity spans rows or records            | an ending then another row of one Attempt; a Held head beside its success; a head whose unknown is told twice across reloads (`restore.test.ts:98`)                                                    | **One point:** `attemptsOnce`, one filter in the work codec; every relation is inside one record, so stage 1 sees it. The told-twice member is **removed** (no second slot)                                               |
| F4  | A name the definition lacks               | state, field, slot, schedule, key, reason, selection, instance, operation, subject, entity, contract (SR-1, S-7, TM-2, W7, W10)                                                                        | **One point:** the reference table, total by type: a body map without a row does not compile (section 6.4)                                                                                                                |
| F5  | Format steps                              | X-1 (five designs, one number); lane and owed have no steps; `stepFour` reads the definition (SR-7); SR-4 (nobody deletes the old key)                                                                 | **One point:** one step table over whole identity groups, total by type; steps read no definition; the write of `work/X` removes the legacy keys it replaces in the same batch                                            |
| F6  | No fault model                            | "forged-but-valid" `it.fails` held for the user (Restore Q4)                                                                                                                                           | **Decided here** (section 4.1), as a question (Q1)                                                                                                                                                                        |
| F7  | Records the boot cannot judge yet or ever | lazy machine, removed machine, newer build, unknown kind                                                                                                                                               | **One point:** the fate table (section 6.3); reading structure needs no machine                                                                                                                                           |
| F8  | A second writer of the store              | the boot writing endings; `owedWrite` over a quarantined key (SR-6)                                                                                                                                    | **Removed:** `judge` returns no `StoreWrite`; `capture` is the only writer and filters by fate                                                                                                                            |
| F9  | Two paths that must agree                 | boot, adoption, hydrate (DL PD2, PD3)                                                                                                                                                                  | **One point:** `admit(source, texts)` then `install`                                                                                                                                                                      |

## 4. Model

### 4.1 The fault model

Who can have written a stored text, and what the boot may trust:

| Writer                                                              | In the model    | What the boot does                                                                                                                           |
| ------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| This build's encoder                                                | yes             | reads it: `Live`                                                                                                                             |
| An older format's encoder, before any newer one wrote               | yes             | steps it, then judges it as its own                                                                                                          |
| The same format under another definition (earlier or later release) | yes             | stage 2: the reference table                                                                                                                 |
| A newer format's encoder (a rollback to this build)                 | yes             | `Kept(Newer)` for the whole identity: never read, never written                                                                              |
| A lost suffix of batches (a crash before the acknowledgement)       | yes             | nothing to do: each batch is atomic (`host/store.ts:43-47`) and one capture is one batch, so every prefix is a store an encoder left         |
| A format 5 or older build writing after a format 6 build            | no              | formats 1 to 5 were never released; a group holding both `work` and legacy keys is kept, not read                                            |
| A second tab on another build                                       | no              | one Runtime writes a scope at a time (@review.spec-cohesion-r2 6a item 14)                                                                   |
| A torn batch, a hand edit, bit rot, another program                 | **safety only** | P5 and P6 hold: the text is judged like any other, and what does not decode is kept or reset by the fate table. No promise about its meaning |
| A text that decodes and was never written by Flow                   | **no**          | it is the user's data. No decode can tell it from a real record, and no test may require it                                                  |

A **valid store** is what `encodeStore` leaves over reachable Worlds, under builds in release order. Stage 1
accepts exactly the structural image; stage 2 judges leaves by the codecs that wrote them.

### 4.2 State inventory

| State                  | Values                                                                                       | Owner                  | Writers                                 | Readers                                          | Saved                          |
| ---------------------- | -------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------- | ------------------------------------------------ | ------------------------------ |
| S1 store text of a key | absent, text                                                                                 | `persist.ts` `capture` | capture, forget                         | `judge`                                          | it is the store                |
| S2 fate of a key       | section 6.3                                                                                  | `core/fate.ts` (new)   | boot, adopt, hydrate, forget            | capture, ensure, send, inspection                | no: re-derived each boot       |
| S3 `World.records`     | decoded positions not yet started                                                            | fate                   | boot, adopt; consumed by ensure         | ensure, `dehydrate`                              | no                             |
| S4 `World.dormant`     | per identity: the structured group, texts kept                                               | fate                   | boot, hydrate; consumed by adopt        | adopt, forget, the entity store (claims only)    | no                             |
| S5 carried parts       | per identity: verbatim JSON by place                                                         | fate                   | boot, adopt                             | the work encoder, cancel, forget                 | re-emitted in place            |
| S6 marks               | keys to write                                                                                | `persist.ts`           | setters, AT's `apply`, `install`        | capture                                          | no                             |
| S7 `FORMAT`            | 6                                                                                            | `record-format.ts`     | a build                                 | envelope codec, steps                            | in every envelope              |
| S8 shape stamp         | text per machine                                                                             | `core/shape.ts` (new)  | compile                                 | envelope encoder, report code, hydrate's refusal | in every envelope              |
| S9 a head's unknown    | absent, `{ ending, kept }`                                                                   | ledger (cluster 4)     | boot derivation, the wire, a heard turn | `Start`, the work encoder                        | yes, in the head               |
| S10 reports            | `FieldDropped`, `RecordShapeChanged`, `RecordUndecodable`, `ObligationCarried`, `RecordKept` | derived                | nobody                                  | evidence, CLI                                    | no (the user's derived issues) |

Not this cluster's state, but saved through it: memory, timers (AS 6.6), instances (AT 4.1), lanes and rows
(cluster 4), entries and entity records (DL). Each crosses as a typed value with a codec in `Compiled.saved`.
Marks follow AT's X-3: `apply` marks the position for any change inside the actor, instances included, and the
work record for any change to a lane or a subject-held row.

### 4.3 Callback inputs

The judge and the encoder run user code only inside Schemas.

| Callback                                                                                                        | Called by                       | Inputs                 | A throw or failure                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| a Schema's decode (memory field, name, input, key, selection, ending, slot value, entry `output`, entity field) | stage 2, per leaf               | that leaf's JSON only  | that leaf "does not read": its row of the reference table; `decodeBy` catches a throw (`record-format.ts:34-41`) |
| a Schema's encode (the same leaves)                                                                             | `encodeStore`, per changed leaf | that leaf's value only | `UnencodableValue`; the identity is withheld, as today (`persist.ts:410`)                                        |
| `reads.resume`, delays, `keys`, reasons                                                                         | never the judge                 | n/a                    | cluster 1's `wake` calls them after `install` (AS 6.5 rows 11, 12)                                               |

No callback here reads the clock, the mint, memory, context or props. The judge reads no clock either: an entry's
age against `gcTime` is the entry store's check when `install` hands it the entry (section 6.8).

### 4.4 Representation types

```ts
// NEW: core/record-key.ts. The only reader and writer of key text. Definition-free.
type RecordKey = Data.TaggedEnum<{
  Actor: { owner: OwnerText };                       // actor/<machine>/<escaped name>
  Work: { owner: OwnerText };                        // work/<machine>/<escaped name>     NEW kind
  Entry: { contract: string; keyText: string };      // entry/<contract>|<key text>       NEW kind (DL, RO)
  Entity: { entity: string; keyText: string };       // entity/<entity>|<key text>        NEW kind (DL)
  Legacy: { kind: "lane" | "owed"; owner: OwnerText; tail: string };   // read by step 5 only
}>;
// A name escapes "%", "/" and "|" (`world.ts:49-60`); a machine id does not. So: cut a legacy lane key at its
// first "|" (the tail follows), then split the owner at its last "/".
type OwnerText = { machine: string; nameText: string };

// NEW: one envelope for every kind. `shape` is absent only on a stepped record.
type Envelope<Body> = { format: typeof FORMAT; shape?: ShapeStamp; body: Body };

// NEW: the structural shapes. Strict structs in normal form: a lane entry holds something, a subject or
// contract map has an entry, a work body has a lane or a row. `rows`, `queue` and `displaced` may be empty.
// Every reference to the definition is a key of a named map.
type PositionShape = {
  state: string;
  memory: { [field: string]: Json };                 // no `Flow.input` field: the name holds it
  schedules: { [name: string]: TimerShape | ReadonlyArray<TimerShape> };   // keyed: a list in key-text order
  slots: { [slot: string]: SlotShape };              // CHANGED: was context + seen + baselines
  graph: { [owner: string]: { [slot: string]: ProviderShape } };   // existing: providers' own wiring (H2)
  instances: { [address: string]: InstanceShape };   // NEW (AT 14): by address; no id, no place
  bookmarks?: { [contract: string]: { [keyText: string]: Json } };   // reserved for streams (H5)
};
type ProviderShape = { machine: string; name: string };
type SlotShape = {
  provider?: ProviderShape;
  seen?: { value: Json };
  baselines: { [reaction: string]: { value?: Json } };
};
// AS 6.6, spelled once here. `selectionFailed`, `firing` and `Refused` are Flow's own shapes: stage 1 checks them.
type TimerShape = {
  key?: Json;
  selection?: string;                                // canonical text by `selectionCodec`
  selectionFailed?: { code: string; slot: string };
  reasons?: ReadonlyArray<string>;
  arming:
    | { _tag: "Idle" }
    | { _tag: "Refused"; code: string; slot: string }
    | { _tag: "Due"; armedAt: number; attempt: number; dueAt: number }
    | { _tag: "Held"; armedAt: number; attempt: number; left: number };
  firing?: { code: string; slot: string };
};
type InstanceShape = {
  status: "Live" | "Frozen";
  reset?: string;                                    // AT's `Anchor.reset` key text
  memory: { [field: string]: Json };
  schedules: PositionShape["schedules"];
};
type WorkShape = {                                   // never written with no lane and no row
  lanes: { [subject: string]: { [contract: string]: { [keyText: string]: LaneShape } } };   // "" is the root
  rows: ReadonlyArray<RowShape>;                     // final endings and declines not yet heard, in owed order
};
type LaneShape = {                                   // a head, or a non-empty queue or displaced list
  head?: HeadShape;
  displaced: ReadonlyArray<{ attempt: string; rest?: Json }>;   // out at capture, displaced by policy;
                                                     // `rest` absent only after step 5
  queue: ReadonlyArray<Json>;                        // each a `rest`
};
type HeadShape = {
  attempt: string;
  rest: Json;                                        // the input without its key fields
  retryCount: number;                                // a non-negative integer; the count the next send carries
  hold: "Out" | "Held";                              // Out: acknowledged, perhaps sent, no answer captured
  unknown?: { ending: Json; kept: boolean };         // the one unknown this head still owes; absent: none owed
  claims: ReadonlyArray<ClaimShape>;                 // DL: keys and field names, never a value
};
type ClaimShape = { entity: string; keyText: string; fields: ReadonlyArray<string>; basedOn?: Json };
type RowShape = {
  subject: string;
  contract: string;
  keyText?: string;                                  // absent only after step 5 (a format 5 row with no lane)
  attempt?: string;                                  // absent: a decline or a queued commit, which made none
  rest?: Json;                                       // the input an ending mapper is given; absent only after step 5
  ending: Json;                                      // cluster 4's `SavedEnding` of the contract
  kept: boolean;
};
type CacheShape =
  | { _tag: "Entry"; data: Json; at: number }
  | { _tag: "Held"; fields: { [name: string]: { value: Json; version?: Json } } }
  | { _tag: "Tombstone"; version?: Json };

// NEW: the typed side. Brands have one constructor each: a Schema decode built from Compiled, or the mint.
type ActorRef = { machine: MachineId; name: ActorName };
type Position = { state: StateName; memory: Values; schedules: Scheduled; slots: Slots; instances: Instances };
type Work = { lanes: ReadonlyArray<RestoredLane>; rows: ReadonlyArray<RestoredRow>; carried: Carried };
type Place =                                         // where a carried part sits in a WorkShape
  | { _tag: "Subject"; subject: string }
  | { _tag: "Contract"; subject: string; contract: string }
  | { _tag: "Lane"; subject: string; contract: string; keyText: string }
  | { _tag: "Row"; after: number };                  // the count of read rows before it: order among rows holds
type Carried = ReadonlyArray<{ place: Place; json: Json; why: "Retired" | "Unread" | "Waits" }>;

// NEW: core/fate.ts
type Fate = Data.TaggedEnum<{
  Live: { dropped: ReadonlyArray<Dropped>; dirty: boolean };
  Reset: { why: "Structure" | "State" | "Memory" };            // position only
  Kept: { why: "Foreign" | "Newer" | "Orphan" | "Name" | "Structure" };
  Dormant: {};                                                  // structure read; leaves wait for adoption
  Discard: {};                                                  // entry and entity only
}>;
type Source = Data.TaggedEnum<{ Boot: {}; Adopt: { entry: EntryId }; Hydrate: { token: Token } }>;
```

`ending` is saved by a codec per contract that is the union of exactly the endings a writer emits. That union is
cluster 4's (section 14); this design requires only that it exists and is one Schema.

`dirty` has one definition: the record's body, encoded again, differs from its stored body. Its causes are
exactly: a format step, a `Dropped` or `Starts` cell, and a derivation of table 6.6. A differing stamp alone is
not dirty; the stamp is rewritten when the record is next written.

## 5. Operations

```ts
// NEW. All pure; none throws; none reads a clock; none returns a StoreWrite.
const structure: (stored: ReadonlyMap<string, string>) => Structured;            // stage 1, definition-free
const admit: (app: CompiledApp, source: Source) => (s: Structured) => Admitted;  // stage 2, per loaded machine
const judge = (app, stored) => admit(app, Source.Boot())(structure(stored));
const install: (a: Admitted, source: Source) => void;                            // on a tx: World maps, marks, wakes
const encodeStore: (app: CompiledApp) => (w: World, marked: ReadonlySet<RecordKey>) => ReadonlyArray<StoreWrite>;

type Structured = {
  groups: ReadonlyMap<string, Group>;          // by owner text, in code-unit order
  cache: ReadonlyMap<string, CacheShape>;      // entry and entity records
  fates: ReadonlyMap<string, Fate>;            // keys stage 1 already settled: Kept, Reset, Discard
};
type Group = { owner: OwnerText; position: Option<PositionShape>; work: Option<WorkShape>;
  shape: Option<ShapeStamp>; steppedPosition: boolean; legacy: ReadonlyArray<string> };   // legacy: keys step 5 read
type Admitted = {
  records: ReadonlyMap<IdentityKey, Position>; work: ReadonlyMap<IdentityKey, Work>;
  dormant: ReadonlyMap<string, Group>; fates: ReadonlyMap<string, Fate>;
  entries: ReadonlyArray<SavedEntry>; entities: ReadonlyArray<SavedEntity>;
};
```

`capture` (existing, `persist.ts:444`) calls `encodeStore` for the marked keys and drops every key whose fate is
`Kept` or `Dormant` (a withheld write, reported once per boot). `forget` removes every key of the identity's
group, whatever its fate, in one batch. `dehydrate` is `encodeStore` over the chosen identities' positions, the
entries and the entity records; `hydrate` is the request gate, then `admit(app, Source.Hydrate(...))` over the
payload's texts, then `install` (section 6.7).

## 6. Rules: the tables

### 6.1 Stage 1: structure

Per key, in code-unit order. The first failing row gives the key its result, which only row 4 may replace. A key
is on the **position side** (`actor/`), the **work side** (`work/`, `lane/`, `owed/`) or the **cache side**.
`fail(side)` is `Reset(Structure)` for a position, `Kept(Structure)` for the work side, `Discard` for the cache.

| #   | Check                                                                                                    | Fails as                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | the key decodes by `RecordKey` and encodes back to the same text                                         | `Kept(Foreign)`                                  |
| 2   | the text is canonical JSON (`codec.ts:328` `decodeCanonical`: no BOM, no duplicate key, byte-equal back) | `fail(side)`                                     |
| 3   | `format` is an integer from 1 to `FORMAT`; a `work` key is 6; a legacy key is 1 to 5                     | above `FORMAT`: `Kept(Newer)`; else `fail(side)` |

Per group (one owner's keys), after every key has passed or failed rows 1 to 3:

| #   | Check                                                                                                                              | Fails as                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 4   | no key of the group is `Kept(Newer)`                                                                                               | every key of the group `Kept(Newer)`                      |
| 5   | **the work side is whole:** every work-side key passed rows 1 to 3, and the group does not hold both a `work` key and a legacy key | every work-side key `Kept(Structure)`                     |
| 6   | each side steps to `FORMAT` (section 6.2)                                                                                          | the position: `Reset(Structure)`; the work side: as row 5 |
| 7   | each body decodes by its kind's strict, normal-form `Shape` and encodes back to equal JSON                                         | as row 6                                                  |
| 8   | `attemptsOnce`: over the work body's heads, displaced lists and rows, no Attempt id occurs twice                                   | as row 5                                                  |

Rows 2, 3, 6 and 7 on a position never touch the work side, and rows 2, 3 and 5 to 8 on the work side never touch
the position. Row 4 is the one exception: a newer build's record means this build cannot tell what the identity
is owed, so nothing of it is read. Row 8 is the only relation in the format; it sits inside one record.

### 6.2 The format plan

One number, `FORMAT = 6`, for every kind. One table, total by type:

```ts
// CHANGED: was `stepsTo`, a switch for actor records only (`actor-record.ts:348-370`).
type RawGroup = { position?: Json; work?: Json; lanes: ReadonlyMap<string, Json>; owed?: Json };
type GroupStep = (g: RawGroup, owner: OwnerText) => Result.Result<RawGroup, "Position" | "Work">;
const steps: { readonly [N in OlderFormat]: GroupStep };   // OlderFormat = 1 | 2 | 3 | 4 | 5
```

- A step reads no definition (closes SR-7 and W11). What it cannot derive it leaves absent; the reference
  table's "the record lacks it" column then decides, as for a definition edit.
- A step's failure names its side; the other side goes on.
- Steps 1 to 4 keep today's actor steps and are the identity on lanes and owed rows, which is what the code does
  today by reading them with the current Schema (`record.ts:35, 48`).
- **Step 5 to 6 is the whole plan** (X-1). Nothing else bumps the number:

| From (format 5)                                                      | To (format 6)                                                                                                                                                 | Source             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `machine`, `name`, `operation` in content                            | compared with the key, then dropped; a mismatch fails the step                                                                                                | T92; F1            |
| content at the top level                                             | under `body`; `shape` absent                                                                                                                                  | SR 3.1             |
| `context`, `seen`, `baselines`                                       | `slots[slot]`; `graph` unchanged                                                                                                                              | locality           |
| `schedules: SavedTimer[]`                                            | `TimerShape` by AS 6.5 row 13: `dueAt` to `Due`, `left` to `Held`, neither to `Idle`; `key`, `armedAt`, `attempt` kept; `pausedBy` to `reasons`; no selection | cluster 1          |
| T118's baseline and `refused`                                        | `selection`, `arming: Refused` in the timer                                                                                                                   | AS 6.6             |
| `lane/<owner>\|<op>\|<keyText>` records and `owed/<owner>`           | one `work` body: `lanes[""][op][keyText]`, `rows`                                                                                                             | F1, F3             |
| a lane record with no head, queue or displaced                       | no lane; a work side left with nothing is no work record, and `install` marks its key so the capture removes the legacy keys                                  | normal form        |
| a head's or queued `input`                                           | `rest`: the input without the fields the key text's JSON object names; each such field must equal the key's                                                   | F1                 |
| `inFlight: true` (any phase but Held, `record.ts` `encodeLane`)      | `hold: "Out"`                                                                                                                                                 | F3                 |
| `inFlight: false`                                                    | `hold: "Held"`                                                                                                                                                | F3                 |
| an owed unknown row whose Attempt is a head                          | that head's `unknown`, with the row's `kept`; a second such row fails the step                                                                                | F3                 |
| a Held head with no such row                                         | `unknown: { ending: Restored, kept: false }`: format 5 cannot say "told", so it is told once more                                                             | P1 over P2 (Q9)    |
| an owed row whose Attempt is a head and whose channel is not unknown | the step fails                                                                                                                                                | T92 close review 3 |
| owed `reason` text                                                   | renamed by cluster 4's table (ET), given as data                                                                                                              | ET                 |
| other owed rows                                                      | `rows`, in order, with `subject: ""`; `keyText` from the row's lane id; no `rest`: format 5 saved no input with a row, so stage 2 carries it (Q9)             | RO, AT 14          |
| an owed row with no lane                                             | a row with `keyText` and `rest` absent; stage 2 carries it                                                                                                    | P1                 |
| a displaced Attempt id                                               | `{ attempt }` with no `rest` (format 5 saved none)                                                                                                            | P1                 |
| (nothing)                                                            | `instances: {}`, `claims: []`                                                                                                                                 | AT, DL             |

`refusal` is not saved (RO's call). **Only the write of `work/X` removes keys:** it removes the legacy keys the
group was stepped from, in its own batch (closes SR-4). No other write removes a key it does not replace. A
future step that moves facts out of a released format's key leaves that key as a stub of the new format, so a
rolled-back build sees `Newer` (H7). Tests that pin `"6"` as "newer" (`restore.test.ts:142`) pin `FORMAT + 1`.

### 6.3 Fates

Every key has exactly one fate after `admit`. The machine column is stage 2's first question.

| Fate              | When                                                                                                        | Bytes                           | Capture of the key                               | Ensure, send, wake                                                                                                                                           | Leaves by                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `Live`            | structure holds; the machine is loaded; position: its state and every field read                            | rewritten when dirty or changed | writes                                           | as any actor; woken by `install` when owed                                                                                                                   | a save; forget                                |
| `Reset`           | a position fails stage 1, or names a state the definition lacks, or holds a field that does not read        | kept until the first save       | writes: the fresh actor's first save replaces it | not woken; the next ensure starts fresh and then hears what its work side owes; reported `RecordUndecodable`, or `RecordShapeChanged` when the stamp differs | the first save; forget                        |
| `Kept(Newer)`     | any key of the group has a format above `FORMAT`                                                            | kept                            | withheld, reported once                          | the actor runs unsaved; nothing owed is delivered; a send that needs an acknowledgement ends `notSent StorageRefused`                                        | a build that reads it; forget                 |
| `Kept(Structure)` | the work side fails stage 1                                                                                 | kept                            | withheld                                         | the position is judged on its own; nothing owed is delivered; sends as for `Newer`                                                                           | forget                                        |
| `Kept(Orphan)`    | the machine is declared nowhere in the app                                                                  | kept                            | cannot happen: no ref names it                   | n/a                                                                                                                                                          | forget of the scope; a build that declares it |
| `Kept(Name)`      | the name text does not decode by the machine's name codec to an `ActorName` that encodes back; a local name | kept                            | cannot happen                                    | n/a                                                                                                                                                          | forget of the scope                           |
| `Kept(Foreign)`   | the key is not this format's                                                                                | kept                            | cannot happen                                    | n/a                                                                                                                                                          | forget of the scope                           |
| `Dormant`         | the machine is declared lazy and not adopted                                                                | kept, byte for byte             | cannot happen                                    | send dropped `NotAdopted` (DL R-L4)                                                                                                                          | adoption: judged then by this table           |
| `Discard`         | an entry or entity record that fails any stage, or names a removed contract or entity                       | removed by the next capture     | removes                                          | reads as absent                                                                                                                                              | the next capture                              |

`World.quarantined` becomes `World.kept: ReadonlyMap<string, Fate>`; `capture` is its only reader on the write
path (closes SR-6 at one point).

### 6.4 Stage 2: the reference table

Every map of a `Shape` is a reference to the definition and has exactly one row. The type forces it:

```ts
// NEW: adding a map to a Shape without a row here does not compile.
type RefRows = { readonly [M in RefMapsOf<PositionShape> | RefMapsOf<WorkShape> | RefMapsOf<CacheShape>]: RefRow };
type RefRow = { reads: "Read"; doesNotRead: Cell; lacksName: Cell; recordLacks: Cell; notLoaded: Cell };
type Cell = "Dropped" | "Carried" | "Starts" | "ResetRecord" | "Waits" | "Discard" | "Never";
```

One function, `resolve(row, saved, declared)`, walks a map against its declared names and codecs and applies the
row. No other code looks a saved name up in a definition. `Never` marks a cell the shape or the definition makes
unreachable; `resolve` treats reaching one as the row's `doesNotRead` cell. `Starts` means the owner named in
the cell begins that part as new.

| Map (the record names a…)                                 | Present, does not read                                    | Absent from the definition             | Definition has it, record lacks it                                  | Declared, not loaded |
| --------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| **Position**                                              |                                                           |                                        |                                                                     |                      |
| `state` (a leaf path)                                     | Never                                                     | ResetRecord                            | Never (strict shape)                                                | Never                |
| `memory` field                                            | ResetRecord                                               | Dropped, `FieldDropped`                | Starts: its declared initial                                        | Never                |
| `slots` entry (provider, `seen`)                          | Dropped: the slot starts unbound                          | Dropped                                | Starts: `seen` none, bound at the next ensure                       | Never                |
| `slots[].baselines` reaction                              | Dropped                                                   | Dropped                                | Starts: silent at restore                                           | Never                |
| `graph` owner, slot, provider                             | that entry Dropped                                        | Dropped                                | Starts: none                                                        | Never                |
| `schedules` name                                          | per timer, below                                          | Dropped (AS 6.5 row 1)                 | Starts (AS row 2)                                                   | Never                |
| a timer's `key`                                           | that timer Dropped (AS row 3)                             | Never (`keys` decides later, AS row 4) | Starts                                                              | Never                |
| a timer's `reasons` name                                  | Never (a name is text)                                    | that name Dropped (S-7, AS row 5)      | Starts: read fresh (AS row 6)                                       | Never                |
| a timer's `selection`                                     | Starts: `Unselected`, silent (AS row 7)                   | Starts: `Unselected`                   | Starts: `Unselected`                                                | Never                |
| `instances` address, `reset`                              | that instance Dropped (AT 6.3 `Dropped`)                  | Dropped                                | Starts: `reconcile` under `Begin` (AT 6.3)                          | **Waits**            |
| inside an instance: `memory`, `schedules`                 | the rows above; ResetRecord means "this instance Dropped" | as above                               | as above                                                            | Waits                |
| `bookmarks` contract, key                                 | Dropped                                                   | Dropped                                | Starts: none                                                        | Never                |
| **Work**                                                  |                                                           |                                        |                                                                     |                      |
| `lanes` subject                                           | Never (an address is text)                                | Carried                                | Never                                                               | **Waits**            |
| `lanes` contract                                          | Never                                                     | Carried (`Retired`)                    | Never                                                               | Never                |
| `lanes` key text                                          | the lane entry Carried                                    | Never                                  | Never                                                               | Never                |
| a head's, queued or displaced `rest`, merged with the key | the lane entry Carried                                    | Never                                  | a displaced `rest` absent: that entry stays in `displaced`, Carried | Never                |
| a head's `unknown.ending`                                 | the lane entry Carried                                    | Never                                  | Never                                                               | Never                |
| a row's subject, contract                                 | Never                                                     | that row Carried                       | Never                                                               | Waits                |
| a row's key text, `rest`, `ending`                        | that row Carried                                          | Never                                  | `keyText` or `rest` absent: that row Carried                        | Never                |
| `claims` entity, key, field, `basedOn`                    | that claim Dropped                                        | Dropped                                | Never                                                               | Never                |
| **Cache**                                                 |                                                           |                                        |                                                                     |                      |
| entry contract, key text, `data`                          | Discard                                                   | Discard                                | Never                                                               | Dormant              |
| entity name, key text                                     | Discard                                                   | Discard                                | Never                                                               | Dormant              |
| entity field                                              | that field Dropped                                        | Dropped                                | Starts: absent                                                      | Never                |

AS 6.5 rows 8 to 10 (an edited `restartOn`, a saved `firing`, `Refused`) need no row: those fields are structure
and are kept as saved. Rows 11 and 12 are `wake`'s. Three rules cover every row:

- **Position names are dropped; obligations are carried.** A position is where the actor was; losing part of it
  is a reset the app is told about (P7). An obligation is something the world still owes; it is never dropped
  (P1). This is SR's D4 and I5 ("an owed row is judged alone") as a property of the row.
- **Carried** means: the JSON stays at its `Place` and every later encode of the record writes it back unchanged;
  it is not delivered while it is carried; its lane key stays held, so a send on that key declines `notSent
  Rejected`; it is reported at each boot as `ObligationCarried { identity, why, count }`. Fates are re-derived at
  each boot, so a build that declares the name again reads it. A cancel naming that lane key, or `forget`,
  removes it.
- **Waits** is Carried with a second exit: adoption of the fragment or machine runs `resolve` again on that part.
- **Starts** uses a value the definition typed (a declared initial, an empty baseline), so it always encodes and
  reads back: a `Starts` cell never turns a record into `Reset`.

A name saved as evidence (a failure's `{ code, slot }`) is text and is never looked up.

### 6.5 Identity

- A record's identity is its key.
- Stage 2 decodes `nameText` by the machine's name codec to an `ActorName`; the value must encode back to the
  same text (`identity.ts:81-103`, kept). A local name has no decode.
- Every identity inside a body (`slots[].provider`, `graph`) is decoded the same way by the provider machine's
  codec. A body string never reaches `ensure`: `ensure` takes `ActorRef`, and `ActorName` has no cast
  (section 10).
- A memory field declared `Flow.input` is not saved; `inputOfName` gives it.
- A lane's input is read in one way: the key text's fields merged into `rest`, then decoded by the input codec.
  A `rest` that itself holds a key field does not read.
- There is no version tag in a key and nothing is re-keyed (departure from SR D1, Q4). A build that changes a
  name or key Schema finds the old text either readable (the same identity, by design) or not (`Kept(Name)`, or a
  Carried lane).

### 6.6 Lanes and rows across a reload

`admit` derives; it does not write. A derivation that changes a head, a queue or a displaced list makes the work
record dirty, and `install` marks it. The next capture writes the derived form (the `Held` head with its unknown,
the derived rows in `rows`), so a second boot derives nothing (I5).

| Saved                               | `admit` gives                                                       | Heard at | Then saved as                                  |
| ----------------------------------- | ------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| head `Out`, no `unknown`            | `Held`, `unknown: { Restored, kept: false }`                        | `Start`  | `Held`, no `unknown`; if refused, `kept: true` |
| head `Out` with `unknown`           | `Held`, that `unknown` (it covers the lost answer too)              | `Start`  | as above                                       |
| head `Held` with `unknown`          | unchanged; owed `Waiting`, or `Kept` when `kept`                    | `Start`  | as above                                       |
| head `Held`, no `unknown`           | unchanged; owes nothing                                             | n/a      | unchanged                                      |
| a queued `rest`                     | removed from `queue`; a row `notSent Restored` with that `rest`     | `Start`  | the row removed; if refused, `kept: true`      |
| a displaced Attempt with its `rest` | removed from `displaced`; a row unknown `Restored` with that `rest` | `Start`  | the row removed; if refused, `kept: true`      |
| a row                               | the row, `Waiting`, or `Kept` when `kept`                           | `Start`  | removed; if refused, `kept: true`              |
| a Carried part                      | nothing                                                             | n/a      | unchanged                                      |

Transitions after the boot that write the same state (cluster 4 owns the lane; these are the saved form's rules):

| Head state \ event    | the wire answers finally                                    | the wire answers unknown, or its answer is lost | a re-send is acknowledged | the unknown is heard | cancel or release             |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------- | -------------------- | ----------------------------- |
| `Out`, no `unknown`   | head removed; a final row added                             | `Held`, `unknown` set                           | impossible                | impossible           | the lane's own rule           |
| `Out` with `unknown`  | head removed; a final row added; **the unknown is dropped** | `Held`, the earlier `unknown` stays (one slot)  | impossible                | `Out`, no `unknown`  | the lane's own rule           |
| `Held` with `unknown` | impossible (nothing is out)                                 | impossible                                      | `Out`, `unknown` stays    | `Held`, no `unknown` | head removed, unknown dropped |
| `Held`, no `unknown`  | impossible                                                  | impossible                                      | `Out`                     | impossible           | head removed                  |

- An unknown says "this may have applied". A final answer for the same Attempt says whether it did, so it
  replaces an unknown not yet heard or kept. A second unknown for a head that still owes one adds nothing: the
  slot holds one (Q3).
- A `Held` head with nothing owed leaves by the lane's own exits: a re-send, a cancel or a release (cluster 4).
- Order at a `Start`: rows in saved order, then the rows derived from queues and displaced lists, then heads'
  unknowns, lanes in key order. This is today's order (`ledger.ts:338-378`) with one change: an unknown from the
  wire not yet heard at capture is told with the heads (Q3).
- "Heard" and its record change land in one batch with the turn's own position write: one capture is one
  `Store.write` and an identity's keys are never split across batches (`persist.ts` `byIdentity`,
  `write-ahead-scope.test.ts:28`).
- Life-held rows are never saved (AT 6.5). Only subject-held rows of persisted identities reach the encoder.
- `install` wakes an identity only when its position is `Live` and its work owes something after this table.
  With a position that is `Reset` or absent, what it is owed waits for the ensure that starts it, as a disposed
  identity's rows do today (`incarnations.ts:455-466`). Boot and adoption run the same `install`, so a lazy
  machine adopted later ends in the world an eager boot gives (DL I-L1).

### 6.7 Occasions that do not compare

**One rule: an install fires nothing.** Boot, adoption and hydrate put saved facts into the World without calling
a user callback other than a Schema decode, without an event, and without comparing a saved fact with a current
one. The differences they skip are compared once, by a named later occasion:

| Skipped difference                                        | Compared by                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| a saved `seen` against the provider's current value       | the subject's `Start` (the wave at `incarnations.ts:156-165`); for hydrate, the next publication (DL R-H3; H4) |
| a saved selection against a fresh `restartOn` read        | cluster 1's rule: `wake` changes no baseline; the owner raises `Context` after it (AS Q4, AT 6.7)              |
| a saved timer against the clock                           | `wake` (AS table Timing)                                                                                       |
| a saved instance against what the definition wants        | `reconcile` under `Begin` (AT 6.3)                                                                             |
| a restored entity field against a hydrated or fetched one | DL's judge, by its merge table; a restored field has no position (DL PD6)                                      |
| a saved entry's age against `staleTime` and `gcTime`      | the entry store, when `install` hands it the entry (RO)                                                        |

Sources differ only in precedence, one table. The merge of entity fields and entries stays DL's.

| Piece                              | A live incarnation exists                     | A restored record exists, not started | The identity is `Dormant`                                         | None       |
| ---------------------------------- | --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ---------- |
| position, `Source.Boot` or `Adopt` | impossible                                    | impossible                            | impossible                                                        | install    |
| position, `Source.Hydrate`         | keep the World's (DL PD3)                     | keep the saved (DL PD2 trace 2)       | the piece waits beside the saved text; at adoption the saved wins | install    |
| work, `Source.Hydrate`             | impossible: a payload has no work kind (type) | impossible                            | impossible                                                        | impossible |
| entry                              | DL `younger` by `at`                          | DL `younger`                          | waits                                                             | install    |
| entity field                       | DL merge table                                | DL merge table                        | n/a                                                               | install    |

A hydrate payload is DL's envelope `{ app, scope, token, omitted }` around record texts in this format. The
request gate (app, scope, token) is DL's and runs before `admit`.

### 6.8 The data layer's records

- **Entry** (`persist: true` requires `output`, the user's RO 8.7): `entry/<contract>|<keyText>`, body
  `{ data, at }`. `data` is by the contract's `output` codec. @task.V3.T92 owns the kind and codec; RO's entry
  store owns `at`, age and `gcTime`.
- **Entity record:** `entity/<entity>|<keyText>`, body `Held` or `Tombstone` (`CacheShape`). No position is
  saved (the mint restarts; DL PD6). No claim value and no prediction is saved (DL R-E8).
- **Claims** are in the head that made them (`ClaimShape`): entity, key text, field names and `basedOn`. `sent`
  is the head's `hold`. They are readable in stage 1 without the machine, so `World.dormant` shows a dormant
  identity's claims to the entity store (departure from DL PD7, Q7). The order of Attempts on one entity record
  across identities is not saved (H8).
- **Bookmarks** are a reserved map of the position (DL:53). Streams have no design (H5).
- A cache record carries no obligation: every failure is `Discard`, the only fate that removes bytes.

### 6.9 The definition fingerprint

One function, three uses. **The stamp never admits anything; decode does.**

```ts
// NEW: core/shape.ts
const signatureOf: (c: Compiled) => Json;       // canonical; sorted names; one `codecSig` per saved leaf
const shapeOf = (c: Compiled): ShapeStamp => digest(canonicalText(signatureOf(c)));   // pure, no host API
```

- `signatureOf` holds exactly what `Compiled.saved` holds: leaf state paths; memory fields; the name codec;
  slots with their provider machine id; schedules with key, reasons and selection; fragments by slot; operations
  with input, key fields and ending. It omits props, emits, events and guards (@task.V3.T115's digest rule).
- `codecSig` is the encoded side of a Schema as canonical JSON. How Effect's representation gives it stably under
  load order and minification is not spiked (H3).
- Uses: (a) the report code of a failing record: `RecordShapeChanged` when the stamp differs,
  `RecordUndecodable` when equal or absent; (b) hydrate may **refuse** a piece whose stamp differs before
  decoding it, because refusing a payload loses nothing (the client fetches); a piece whose stamp matches is
  still decoded and judged; a lazy machine's pieces wait and are compared at adoption; (c) `flow explain` across
  releases. A stored record is never refused by its stamp.
- No app-wide digest is stored. Where DL R-H2 needs one, it is the digest of the payload's
  `(machine id, shape)` pairs, computed the same way on both sides.

## 7. Algorithm

```
structure(stored):
  for (key, text) in stored, by code units:
    k = RecordKey.decode(key)                 else fates[key] = Kept(Foreign); continue
    json = decodeCanonical(text)              else failed[key] = side(k); continue
    n = formatOf(json, k)                     above FORMAT -> newer.add(ownerOf(k)); bad -> failed[key] = side(k)
    raw[ownerOf(k)].put(k, n, json)
  for (owner, keys) in raw and failed, grouped:
    if owner in newer: every key Kept(Newer); continue                       // row 4
    for each failed position key: Reset(Structure); each failed cache key: Discard
    workWhole = no failed work-side key and not (a work key and a legacy key)  // row 5
    if not workWhole: every work-side key Kept(Structure)
    g = fold steps over the sides still whole  // a side's failure: Reset(Structure) or every work-side key Kept
    position = PositionShape.decode(g.position) and encodes back   else Reset(Structure)
    work = WorkShape.decode(g.work) and encodes back and attemptsOnce   else every work-side key Kept(Structure)
    groups[owner] = { position, work, shape, steppedPosition, legacy }

admit(app, source)(s):
  for (owner, g) in s.groups:
    m = app.machine(owner.machine)            undeclared -> Kept(Orphan); lazy, not loaded -> dormant[owner] = g
    name = m.saved.name.decode(owner.nameText) and encodes back   else Kept(Name)
    position: resolve each PositionShape map by its RefRow against m.saved
              any ResetRecord -> Reset(why); else Live { dropped, dirty: steppedPosition or any Dropped or Starts }
    work:     resolve each WorkShape map; nothing resets; unread parts -> carried at their Place
              apply table 6.6; Live { dirty: stepped or any Dropped or any 6.6 derivation }
  for c in s.cache: resolve by the Cache rows; any failure -> Discard

install(a, source):                           // incarnations.ts `boot`, CHANGED; adoption calls it too
  World.records, lanes, rows, kept, dormant, carried <- a   // one replace per map; each identity's rows built once
  mark every key that is Live and dirty, and every Discard
  hand entries to the entry store and entity records to DL's judge, with the source
  for each identity with a Live position that is owed anything: ensure(actor, wake)
  // reports are derived from a.fates and carried, once per machine with a count

encodeStore(app)(world, marked):
  for key in marked, fate not Kept, not Dormant:
    body = the Shape of the World's value in normal form, leaves by m.saved encoders, carried JSON at its Place
    absent value (an ended actor, a work side with no lane, row or carried part) -> remove key
    else write key = canonicalText({ body, format: FORMAT, shape: shapeOf(m) })
    a work key also removes its group's legacy keys
```

`resolve` is one loop over a saved map's entries and one over the declared names the map lacks; the row gives the
cell for each. The walkers are iterative (`codec-faults.ts` `walker-on-call-stack`), so depth is bounded by the
text, not the call stack.

## 8. Invariants

Each cites the property it serves.

- **I1 Round trip.** For every reachable World `w`: `judge(encodeStore(w))` gives `w`'s saved facts, every fate
  `Live`, none dirty. (P1, P2)
- **I2 Image.** A `Live`, not dirty record's body encodes back to its stored body. (F2)
- **I3 Total.** `judge` returns for every map of strings, gives each key exactly one fate, reads no clock, and
  runs in time linear in the store's bytes plus `K log K`. (P5)
- **I4 Bytes kept.** A `Kept` or `Dormant` key's bytes never change, and a Carried part's JSON is written back
  unchanged, until a `forget` or a cancel of that lane. Saved data is removed only by: `Discard`; a first save
  over `Reset`; a `Dropped` cell; the removal of legacy keys by the `work` write that replaces them. (P1, P6)
- **I5 Idempotent.** Judging a store twice gives equal results. After every dirty key is captured, judging again
  gives the same typed values and nothing dirty. (P2)
- **I6 One Attempt, once.** In a `Live` work record each Attempt id is in exactly one of: a head, a displaced
  list, a row. A head has at most one unknown. (P2)
- **I7 Endings conserved.** For every structurally valid work record, what is owed after `admit` is exactly
  table 6.6 applied to its parts, plus its carried parts: none dropped, none added. (P1, P2)
- **I8 Identity once.** No `Shape` field repeats what the key holds. (P4; by type)
- **I9 No name from text.** Every `ActorRef` the World takes from the store came from a name codec decode. (P4)
- **I10 One writer.** `structure`, `admit` and `judge` return no `StoreWrite`. (F8; by type)
- **I11 Sides are independent.** No failure of a position changes the fate of its work side, and the reverse,
  except `Kept(Newer)`, which holds the whole group (6.1 row 4). (P1)
- **I12 Nothing unsaved leaks in.** `encodeStore` writes no key for a machine with `persist: false`, a local
  actor, a life-held row, or a prediction. (P8)

## 9. Checks

### 9.1 Levels

1. **Executable model** (scratch, not committed): `structure`, `admit` for a toy app, `encodeStore`, and I1 to
   I7, I11 and P2 over generated Worlds and mutated stores. Result in section 17.
2. **Run rule** (`tests/rules/records.ts`, extends `recordKinds`): after every Story step that captured, I2 on
   every key the Runtime wrote, and I1 against the World at the cut.
3. **Stories:** the named rows below, on the fixtures that persist (shop, transfers, home, session, wizard,
   lanes, sign-in, command-palette, cells).

### 9.2 The alphabet, derived from the format

Mutations are generated from the `Shape` types and the key grammar, not from past findings
(@review.case-studies 2.6 lesson 5):

- per key: delete; copy under another owner; swap the kind prefix; change the name text; a local name;
- per envelope: `format` plus one, zero, null, a string, fractional, absent; `shape` changed or absent; an extra
  field;
- per `Shape` node: delete a field; add a field; null; swap the type; empty a list or map;
- per relation: one Attempt id in two places (every pair of head, displaced, row); a `work` record beside legacy
  records, each also with a bad format; a lane entry with all three parts empty; a `rest` holding a key field;
- per reference row: the name absent from the definition; the leaf unreadable; the machine undeclared; the
  machine lazy;
- per sequence: capture, kill before or after the acknowledgement, reload, hear, reload.

Size: a toy app of two machines, two operations, one schedule, one slot and one fragment; Worlds of up to three
lanes and four rows; every single mutation and every pair on one identity.

### 9.3 The oracle

The fate table (6.3), the stage 1 rows (6.1) and the reference table (6.4) are the oracle: for a mutation, the
expected fate is the first failing row of 6.1 or the cell of 6.4. The check fails when the judge's fate differs,
when any key outside the expected set changes bytes after a capture, or when I1 to I7 or I11 fail.

### 9.4 Named rows and the Story of the wrong ending

| Story                                | Sets up                                                  | Wrong ending it must catch                                     |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| `shop/pay-across-builds` (section 1) | a held charge, a renamed field, a dropped schedule       | the charge re-sent; the unknown heard twice; `slow` firing     |
| `shop/told-once`                     | an unknown heard and saved, then two reloads             | a second `Restored` (today's `it.fails`, `restore.test.ts:98`) |
| `shop/answer-beside-hold`            | a work record with a head and a final row of one Attempt | both delivered (T92 close review 3)                            |
| `shop/guest-cart-key`                | main's records copied under another owner                | the guest reading main's cart as its own identity's content    |
| `shop/bound-to-local`                | a slot's provider named `~9`                             | a local actor started from the store (T20 review 4)            |
| `transfers/retired-wire`             | a lane whose operation is gone, beside two live rows     | the live rows not delivered, or the lane dropped (SR D4)       |
| `session/lazy-inbox`                 | a lazy machine's records, not adopted, owed an ending    | `ready` loading it; its bytes changing; adoption not waking it |
| `home/dropped-keyed-timer`           | a keyed timer whose key Schema changed                   | a firing for the old key                                       |
| `lanes/upgrade-5-to-6`               | format 5 lane and owed records, one with a bad row       | old keys left behind or removed while kept; an ending doubled  |
| `shop/newer-record`                  | `FORMAT + 1` on the work record                          | an overwrite; an ending told to a fresh actor                  |

`shop/guest-cart-key` cannot be refused by any decode when the copy is a valid record of the guest's machine and
name: that is "forged but valid" (4.1). The Story asserts only that nothing of main's identity is read from it.

### 9.5 Planted faults

`shape-not-strict`, `empty-lane-accepted`, `key-content-identity-restored`, `attempts-once-off`,
`unknown-slot-unsaved`, `carried-dropped-on-encode`, `carried-delivered`, `judge-writes`, `capture-ignores-fate`,
`step-reads-definition`, `legacy-keys-left`, `legacy-keys-removed-while-kept`, `position-failure-resets-work`,
`newer-work-read-alone`, `orphan-discarded`, `dormant-decoded-at-ready`, `adoption-does-not-wake`,
`name-not-encoded-back`, `rest-key-field-wins`, `ref-row-missing` (a compile failure), `stamp-admits`.

## 10. Types

- **Brands, one constructor each.** `MachineId`, `ActorName`, `StateName`, `ContractName`, `KeyText`,
  `AttemptId`, `SubjectAddress`, `ShapeStamp`: each is made only by a Schema decode built from `Compiled` or by
  the mint. `restoredLaneId` and `restoredAttemptId` (`world.ts:41`) are deleted. `brandedAs` on the T92 branch
  (`identity.ts:382-409` at `d92e802f`) is the cast this forbids.
- **Derived, not hand-written.** The typed side of `PositionShape` derives from the definition: `memory` from
  the declared fields, `schedules` from the declared schedules (AS's `Tracked`), `slots` from declared context,
  `instances` from fragment slots. Cluster 5 proves the derivation; this cluster states it.
- **`Compiled.saved`** (new, section 14): one struct holding every codec a record reads. It closes SR-2 and
  TM-2: a schedule's key and selection Schemas are in it.
- **Public types touched:** `Store`, `StoreWrite`, `StoreScope` unchanged. `persist: true` unchanged. The boot
  reports gain `ObligationCarried` and `RecordKept`; `LaneRekeyed` and `LaneRekeyCollision` never exist.
- **Casts and `unknown`s in the area:** `decodeBy(value: unknown)` (`record-format.ts:36`) stays, as the one
  entry of stored JSON. The `FLOW_STATE_ALLOW_UNKNOWN` sites in `record.ts` go with their functions. The six
  `no-id-text` suppressions in `record.ts` go: key text is read only in `record-key.ts`.

## 11. Cost

Sizes: `K` keys, `B` stored bytes, `b` bytes of one record, `L` lanes and `R` rows of one identity.

| Operation                | Cost                               | Notes                                                                                                                                    |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`              | `O(B + K log K)`                   | one parse and one re-encode per text, as today (`codec.ts:328`), plus one body re-encode for row 7; the sort is the store's key order    |
| `admit`                  | `O(B)` for loaded machines         | one `resolve` per map; a dormant group costs its structure only                                                                          |
| `install`'s rows         | `O(R)` per identity                | today `O(R²)`: `ledger.restore` replaces the list per row (`ledger.ts:395-412`, sweep F3)                                                |
| capture of a position    | `O(changed fields) + O(b)` to join | the per-field text memo stays (`actor-record.ts:170`, `boundary.ts:462`)                                                                 |
| capture of a work record | `O(changed lanes) + O(b)` to join  | **new cost:** a send in one lane rewrites the identity's whole work text; a per-lane text memo keeps the encode to the changed lane (Q2) |
| `shapeOf`                | once per machine at compile        |                                                                                                                                          |
| marks per step           | `O(touched identities)`            | today `markMailbox` scans every owed row while mail is queued (`persist.ts:345-351`, sweep F1): mark from the tx's touched rows instead  |
| saved timers             | `O(timers)`                        | today idle timers by states by schedules (`persist.ts:98-110`, sweep F2): AS saves `Tracked` as it stands                                |

Indexes built once at compile: `Compiled.saved`; declared names per reference map as a `Map`; `shapeOf`.
Hot-path allocations: one body object and one text per marked key; no per-row list copies. The body re-encode in
row 7 doubles the boot's encode work; the bench decides whether it runs in production or only under the run rule
(H9).

## 12. Fit to today's code

| Code                                                                                             | Verdict        | Why; callers                                                                                                            |
| ------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `codec.ts` `decodeCanonical`, `encodeCanonical`, `parseCanonical`                                | keep           | stage 1 row 2; `decodeCanonical`'s one caller is `record.ts:415`                                                        |
| `record-format.ts` `FORMAT`, `Format`                                                            | change         | 6; `Format` becomes `1..FORMAT` as a type for the step table                                                            |
| `record-format.ts` `decodeBy`, `textOf`, `reasonOf`                                              | keep           | the leaf decode; callers `record.ts`, `actor-record.ts`                                                                 |
| `record-format.ts` `ActorJson`, `actorOf`                                                        | delete         | identity is not in content                                                                                              |
| `record.ts` `decodeRecords`, `identityIn`, `rowOf`, `rowsRecord`, `laneRecord`, `keyNamesItself` | delete         | replaced by `structure` and `admit`; one caller, `incarnations.ts:424`                                                  |
| `record.ts` `encodeLane`, `encodeOwed`, `rowJson`                                                | change         | one work encoder; callers `persist.ts` `laneWrite`, `owedWrite`                                                         |
| `actor-record.ts` `encodeActor`, `decodeActor`                                                   | change         | the position codec over `PositionShape`; callers `persist.ts`, `record.ts`                                              |
| `actor-record.ts` `stepsTo`, steps 1 to 3                                                        | keep as rows   | rows of `steps`                                                                                                         |
| `actor-record.ts` `stepFour` (`:376-400`)                                                        | change         | reads the machine today; becomes definition-free (SR-7)                                                                 |
| `identity.ts` `decodeName`, `inputOfName`                                                        | keep           | the only maker of `ActorName`; callers `record.ts:393`, `incarnations.ts:259`                                           |
| `world.ts` `actorKey`, `laneId`, `restoredLaneId`, `restoredAttemptId`                           | change, delete | encoders of `RecordKey`; the two `restored*` casts go                                                                   |
| `world.ts` `Quarantine`, `World.quarantined`                                                     | change         | `Fate`, `World.kept`; @review.code-audit section 4 notes `Quarantine` names two things (`world.ts:524`, `driver.ts:79`) |
| `persist.ts` `capture`, `byIdentity`, `withhold`                                                 | change         | filters by fate; a `work` write removes its legacy keys                                                                 |
| `persist.ts` `markMailbox` (`:345-351`), `graphOf` (`:76-96`)                                    | change, keep   | section 11; `graph` stays (H2)                                                                                          |
| `persist.ts` `laneWrite`, `owedWrite`, `actorWrite`, `liveText`                                  | change         | two writes per identity; the memo stays                                                                                 |
| `ledger.ts` `restore`, `start` (`:338-412`)                                                      | change         | rows built once; the head's unknown from its slot; `Origin.HeldAtStart` goes (cluster 4)                                |
| `incarnations.ts` `boot` (`:423`), `reportUnbound`                                               | change         | `install`; `UnboundLane` stays a derived report                                                                         |
| `schedule-plan.ts` `savedTimersOf`, `schedule-restore.ts`                                        | change         | AS 6.5 and 6.6 through the reference rows                                                                               |
| `vocabulary.ts` `SavedTimer`, `ReadFailure`                                                      | change         | `TimerShape`; `ReadFailure` codes become fate reasons                                                                   |
| `host/store.ts`, `host/platform/indexeddb.ts`, `host/edge.ts` (one batch out)                    | keep           | the contract the fault model relies on                                                                                  |
| `host/close.ts` forget                                                                           | keep           | removes every key of the scope or identity                                                                              |
| `tests/rules/records.ts` `recordKinds`                                                           | change         | gains I1 and I2                                                                                                         |

@review.code-audit section 2 L9 counts 75 lines of record code to drop; this design deletes the hand checks of
`decodeRecords` (about 200 lines) and adds `record-key.ts`, `fate.ts`, `shape.ts`.

## 13. Principles and fixtures

| Principle                                 | Held or traded                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Classes, not instances                    | held: section 3                                                                                  |
| One owner per state, one writer per field | held: `capture` writes; `fate.ts` owns S2 to S5                                                  |
| Store facts, derive views                 | held: fates and reports are derived each boot; no app digest is stored. `graph` is the debt (H2) |
| Explicit states                           | held: `Fate`, `hold` with its `unknown` slot (table 6.6), `Cell`                                 |
| One decision per subject per occasion     | held: one fate per key per `admit`                                                               |
| Total tables                              | held: 6.1, 6.3, 6.4 by type; 6.6                                                                 |
| Survives a reload                         | held: I1                                                                                         |
| Same rule at every scope                  | held: instance rows reuse the position rows; lanes carry their subject                           |
| One equality and one codec per fact       | held: canonical text; `Compiled.saved`                                                           |
| A throw changes only its own check        | held: per leaf                                                                                   |
| General                                   | checked below                                                                                    |
| Simple                                    | traded once: the work record is rewritten whole (Q2) to remove the cross-record relation         |
| Effect at the edges                       | held: the core uses `Schema`, `Result`, `Option`, `Data` only                                    |
| Types derive from their source            | held, with H3 and cluster 5's proof owed                                                         |

Fixtures read against the design: **shop** (value-named carts, reject and latest lanes, Pay's three schedules, a
renewal Pay per subscription); **transfers** (NFC and NFD names stay two identities, since names are compared as
text; a schedule armed by an event only); **home** (keyed `poll`, `pausedBy`, a deadline from memory);
**session** (maps, sets and `Option` in memory; JSON 100,000 deep; 20 persisted machines; the lazy entries of
catalog step 15); **sign-in** (`Flow.private` is saved today, `flow.ts:32-35`; this design does not change
that, H6); **command-palette** (a 300,000-entry position: why the work side is a separate record); **sync**,
**player**, **number-input** (nothing saved: I12).

## 14. Seams

- **Offers** `structure`, `admit`, `install`, `Fate`, `RefRows`: the one admission path for boot, adoption and
  hydrate.
- **Offers** `RecordKey`, `Envelope`, the `Shape` types and `steps`: the one saved-format plan.
- **Offers** `shapeOf`: the one definition fingerprint.
- **Needs** `Compiled.saved` (cluster 5, typed machine): `{ name, states, memory, slots, schedules, fragments,
  operations }`, each leaf a codec. This contradicts "Compiled gains nothing" (TM:285); Q8.
- **Cluster 1 (taken):** `TimerShape` is AS 6.6's saved timer; AS 6.5 rows 1 to 7 are reference rows, rows 8 to
  10 are structure, row 13 is step 5, rows 11 and 12 stay `wake`'s. No table of cluster 1 changes.
- **Cluster 2 (taken):** `instances` by address with status, reset, memory and schedules, no id; lanes and rows
  carry `subject` inside the one `work` record instead of in two record keys (a change of place, not of rule);
  X-3's marks (4.2). **Answer to AT H4:** a lazy fragment's parts `Wait`; adoption calls
  `admit(Source.Adopt)` then `install` on them and hands AT's tenth `Change` the decoded instances. Adoption
  itself is not saved: it is re-derived from what is loaded. **Question to cluster 2:** AT 6.3's `Dropped` row
  must also cover "the instance's memory or reset value does not read".
- **Cluster 4 (handed):** (a) `SavedEnding` per contract, the exact union writers emit, with ET's rename table as
  data; (b) the in-memory lane should hold its head's unknown in one slot as `HeadShape` does, so the encoder is
  not a projection; until then the encoder requires "at most one unknown row for a head's Attempt"; (c) table
  6.6's second table, "a final answer replaces an unheard unknown", is theirs to accept; (d) `Origin.HeldAtStart`
  and the once-guard go; (e) the entry store's `at`, age and `gcTime`; (f) Attempt ids never reused across
  Runtimes (@task.V3.T28 owes it); (g) DL-2: whether hydrate's "no `onContext`" and restore's wave are one rule
  (H4).
- **Cluster 5 (handed):** the run rule for I1 and I2; the mutation generator of 9.2 as test tooling; the Story
  store's hostile fake producing 9.2's mutations; `flow explain` reading fates; the type proof that `RefRows` is
  total.
- **Tasks:** @task.V3.T92 builds sections 6.1, 6.2 and 6.4 to 6.6; @task.V3.T56 owns 6.3 and 6.9; @task.V3.T48
  owns `Dormant` and `Waits`; @task.V3.T115 owns `Source.Hydrate` and 6.7's precedence; @task.V3.T28 owns the
  store adapters. No Task's scope is changed here.

## 15. Questions for the user

Each is a departure from a concept proposal or an open choice. Each recommends A.

1. **The fault model** [open: 2026-11-21; recommend A]. A: section 4.1; "forged but valid" is out of scope and
   its `it.fails` tests are deleted (resolves Restore Q4). B: defend meaning against forgery, which needs signed
   records. Trace for B: a copied, valid record under its own key cannot be told from a real one.
2. **One `work` record per identity** [open: 2026-11-21; recommend A]. A: lanes and owed rows merge; no relation
   spans records; the cost is a whole-record rewrite per acknowledged send. B: keep per-lane records and add a
   boot-wide check. Trace for B: T92 close review 3, where a per-record decode passed a head beside its success.
3. **A head carries its one unknown** [open: 2026-11-21; recommend A]. A: table 6.6. Four visible effects: an
   unknown is told once across reloads; a final answer replaces an unknown not yet heard or kept; a head owes at
   most one unknown, so a second one before the first is heard is not told separately; after a reload an unheard
   unknown from the wire is told with the heads, after the saved rows. B: keep unknown rows beside
   heads. Trace for B: `restore.test.ts:98`, heard once per reload.
4. **No version tags in keys** [open: 2026-11-21; recommend A] (departs SR D1 as proposed). A: nothing is
   re-keyed; an old-version record is one whose name or key does not decode. B: SR's `@tag` keys. Trace for B:
   SR-4, no writer removes the old key; a tag is a second place identity can disagree.
5. **An unreadable obligation is carried, not delivered** [open: 2026-11-21; recommend A] (departs SR 3.4's
   "Held, ends unknown `Restored`" and @review.spec-cohesion-r2 6b). A: Carried. B: deliver without input. Trace
   for B: the user's ending mappers take `(value, { input, key })`; with no input the mapper cannot be called.
6. **An orphan is kept** [open: 2026-11-21; recommend A] (departs DL PD5's discard). A: `Kept(Orphan)`. B:
   discard. Trace for B: a deploy that drops a machine by mistake destroys its users' data before the fix ships.
7. **Claims live in the lane head** [open: 2026-11-21; recommend A] (departs DL PD7). A: section 6.8. B: a claim
   row per Attempt in an entity-store record. Trace for B: a claim row whose head is gone leaves a field
   unconfirmed forever, the T20 class again.
8. **`Compiled.saved`** [open: 2026-11-21; recommend A] (departs TM:285). Trace against: TM-2 trace A, a changed
   key Schema restores and routes to the wrong timer.
9. **One step, 5 to 6, and it tells a format 5 hold once more** [open: 2026-11-21; recommend A]. A: section 6.2
   lands as one format; a format 5 Held head with no row is told `Restored` once after the upgrade, and
   a format 5 owed row not tied to a head is carried, not delivered, because format 5 saved no input for the
   ending mapper. Format 5 was never released, so only fixtures hold such rows. B: 6 for T118 and 7 later; or
   treat such a head as told. Trace for B: X-1; and a hold never told is lost.
10. **SR D2, D3, D4** [open: 2026-11-21; recommend A]: adopted as SR proposed them; D4 is the Carried rule; D3 is
    `Kept(Newer)` for the whole identity.
11. **DL PD2 and PD6** [open: 2026-11-21; recommend A]: one `admit`; positions are not saved. PD3 and PD4 are
    not settled here (H4).
12. **A reset actor is not woken by the boot** [open: 2026-11-21; recommend A]. A: what it is owed waits for the
    ensure that starts it fresh, as a disposed identity's rows do today. B: the boot starts it fresh at once.
    Trace for B: a fresh actor nobody mounted hears an ending and runs effects with no view.

## 16. Process notes

- **What went wrong** (@review.case-studies 2.5): reviews served as the specification. No fault model and no list
  of what writers emit existed before the build, so each review forged one more contradiction; samples varied one
  dimension at a time; two checks could not fail.
- **How to build this cluster.** First the answers to Q1 and Q2, since every table rests on them. Then, in
  order: `record-key.ts` with its round trip; the `Shape` codecs with I2 as a run rule on today's Stories (red
  first: it fails on every format 5 text); the step table with the `lanes/upgrade-5-to-6` Story; `fate.ts` and
  the reference table, one map at a time, each with its mutation row; `capture`'s fate filter; then T56's stamp.
- **First failing checks:** `shop/told-once` (today's `it.fails`), `shop/answer-beside-hold`,
  `shop/bound-to-local` (today's `it.fails` at `restore.test.ts:327`), and I2 over the generated mutations.
- **Where a review pays:** once, after the `Shape` types and `RefRows` compile and before any Story is written,
  by an adversary allowed only the tables. This run's adversary found 22 items in seven minutes from the tables
  alone; the executable model found four failing invariants the prose had hidden.
- **Generator before samples:** build 9.2's mutation generator first; hand-picked forged records are what kept
  T20 open.
- **The model is cheap:** 39,000 cases in six seconds. Keep it beside the Spec and re-run it on every table edit.

## 17. Sidecar log

Six research sidecars (Haiku, effort medium), three reviewers (Haiku, effort high) and one model builder
(Sonnet). Prior art was not fanned out: canonical-text round trips, upcasters that read no schema, and
stamp-as-hint are applied from known practice, unverified by a sidecar (H10).

| Sidecar             | Finding                                                                                                                                                               | Verdict  | Why                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| readers and writers | field tables per kind; identity in six places; no fingerprint in `src/`                                                                                               | accepted | re-read `record.ts:215-456`, `incarnations.ts:423-485`, `ledger.ts:338-412` myself       |
| readers and writers | the boot writes (`saveOwed`, `saveLane`, `incarnations.ts:446-456`)                                                                                                   | accepted | read; SR's "the boot writes nothing" becomes "the judge writes nothing; `install` marks" |
| history             | T20's four holes; T92's shapes and its last blocking item                                                                                                             | accepted | matches @review.case-studies 2.3; the branch is an ancestor, so read by `fef46251..`     |
| fixtures            | nine apps persist; no fixture declares a version; `Flow.private` is saved                                                                                             | accepted | spot-checked `shop/app.ts`; `Flow.private` listed as H6                                  |
| tests and cost      | untested: torn batch, two records one Attempt, a row with no lane record                                                                                              | accepted | each is in 9.2's alphabet or out of the fault model                                      |
| destinations        | D1 to D4, PD2 to PD7, SR-1 to SR-7, DL-1 to DL-5                                                                                                                      | accepted | used as the worklist; 6b's "adopt D1" conflicts with SR's open tags, so D1 is asked (Q4) |
| earlier clusters    | AS 6.5 and 6.6, AT 14 and H4                                                                                                                                          | accepted | read against the files' headings; homes in 6.4 and 14                                    |
| model               | I2 fails: a derived `Held` is not dirty; a stamp change; empty containers; dropped claims                                                                             | accepted | `dirty` defined once (4.4); I2 over the body; normal form in row 7; `Dropped` is dirty   |
| model               | I4 fails: a kept `work` key overwritten by a stepped legacy group                                                                                                     | accepted | row 5, "the work side is whole"                                                          |
| model               | I11 fails: a newer position keeps the work side                                                                                                                       | changed  | deliberate; I11 and 6.1 state the exception                                              |
| model               | I5 fails: an empty format 5 lane record                                                                                                                               | accepted | the step drops it (6.2)                                                                  |
| adversary           | capture removes legacy keys of a kept work side (2)                                                                                                                   | accepted | only the `work` write removes legacy keys                                                |
| adversary           | a store from alternating builds is treated as corrupt (3)                                                                                                             | changed  | the fault model now says formats 1 to 5 were never released; H7 for later formats        |
| adversary           | "told once" fails when the batch is lost (4)                                                                                                                          | changed  | P2 reworded: the handling and the mark share a batch                                     |
| adversary           | format 5 holds are told again (5); a kept unknown is dropped by a final answer (6)                                                                                    | changed  | both now stated and asked (Q9, Q3)                                                       |
| adversary           | cancel removes a carried head (7); a told hold has no exit (8)                                                                                                        | changed  | P1 and I4 name cancel; 6.6 names the lane's exits                                        |
| adversary           | reset beside owed work (9); adoption does not wake (10); dormant claims invisible (11)                                                                                | accepted | `install` rule in 6.6; S4's readers; Q12                                                 |
| adversary           | `rest` can hold a key field (12)                                                                                                                                      | accepted | 6.5 rule; F1 downgraded to "one point" for the input                                     |
| adversary           | the stamp decides at hydrate (13); the judge reads the clock (19)                                                                                                     | accepted | 6.9 reworded; `gcTime` moved to the entry store                                          |
| adversary           | step failure fates (15); an empty table row (16); cells not of type `Cell` (17); undefined types (18); legacy key split (20); empty lane (21); "never delivered" (22) | accepted | each fixed in place                                                                      |
| step and fit check  | `partsOf` is not in `actor-record.ts`; `decodeCanonical` has one caller; `boot` is at `:423`                                                                          | accepted | section 12 corrected                                                                     |
| step and fit check  | `inFlight` is "not Held", so it covers acknowledged heads never sent                                                                                                  | accepted | `hold: "Out"` named and defined for that                                                 |
| step and fit check  | `graph` holds providers' own bindings, read back for providers with no record                                                                                         | accepted | `graph` stays in the shape; H2                                                           |
| seam check          | `selectionFailed`, `firing`, `Refused`, `TimerShape` had no home; `basedOn` missing                                                                                   | accepted | `TimerShape` spelled; `ClaimShape.basedOn`                                               |
| seam check          | DL's record queue and bookmark shapes have no home                                                                                                                    | accepted | H8, H5                                                                                   |
| seam check          | did not finish SR R1 to R10, DL R-L and R-H against the tables                                                                                                        | open     | H1                                                                                       |
| model, re-run       | see the paragraph below this table                                                                                                                                    |          |                                                                                          |

**Model result.** First draft: 39,288 cases in 6 seconds; I2, I4, I5 and I11 failed. Revised text: 44,818 cases
in 8 seconds; I1, I2, I3, I4, I6, I7, I11, P2 and the wake rule pass. I5 failed in 2 cases from a toy field whose
declared initial did not satisfy its own reader, which a typed initial cannot do (the `Starts` rule in 6.4). The
6.6 transition check flagged the second unknown on a head, now stated (Q3). The model covers no per-timer
decode, instances, cache records or format steps 1 to 4. It is a scratch file and is not kept.

The re-run's eight notes, each re-read against the text: the stepped rows with no `rest` or `keyText` (accepted:
`RowShape.keyText` optional, both carried, Q9); the queue and displaced derivation read as "dirty at every boot"
(rejected: the capture writes the derived form, now said in 6.6); row 4 against "first failing row" (accepted:
reworded); `Out` cancel left to the lane (rejected: cluster 4's); a work key with no position (accepted: named
in 6.6); the initial that does not read back (changed: the `Starts` rule); the normal-form wording (accepted:
4.4); the second unknown (accepted: Q3).

**Third run, on those edits:** 43,208 cases in 7 seconds. I2, I3, I4, I6, I7, I11, the transition checks and
the wake rule pass. I1, I5's after-capture half and P2 failed on one hole: a displaced Attempt was saved as an id
only, so the row derived from it had no `rest` and was carried at the second boot. Accepted: a displaced entry
now holds its `rest` (4.4, 6.6). A second hole: a format 5 group whose lane records are all empty stepped to an
empty work body, which normal form rejects. Accepted: it steps to no work record (6.2). With the model's switch
that reads such a row, I1, I5 and I7 pass; that switch left 6 P2 failures the builder did not trace (H13). The
builder wrote and deleted one stray file, `/tmp/x`, against its brief.

## 18. Open holes

- **H1. Not every requirement of SR and DL was checked against these tables. Blocks Spec.** The seam sidecar ran
  out of time on SR R1 to R10 and DL R-L1 to R-L5, R-H1 to R-H6. I checked R-L2, R-L4, R-H2, R-H3, R-E8 and I-L1
  by hand.
- **H2. `graph` stores other identities' wiring a second time. Blocks build for @task.V3.T92's "stored once".**
  SR O1 recommends deriving it where the provider has a record; who reads it at a boot wake was not traced.
- **H3. `codecSig` is not spiked. Blocks build for @task.V3.T56.** Stable under module load order and a minified
  build; SR spike 1. A miss is harmless for records (6.9) and costs a refused hydrate.
- **H4. Hydrate's merge is not designed here. Blocks Spec for @task.V3.T115.** DL PD3, PD4 and DL-2 stay open;
  6.7 gives only the precedence of positions and the "install fires nothing" rule.
- **H5. Streams and bookmarks have no design. Blocks Spec for @task.V3.T25.** `bookmarks` is a reserved map.
- **H6. `Flow.private` fields are saved in clear text. Minor here.** Whether a refresh token belongs in IndexedDB
  is cluster 4's trust question.
- **H7. A later format that moves facts between keys needs a rollback rule. Minor now.** One line in 6.2; no
  trace was run.
- **H8. The order of Attempts on one entity record across identities is not saved. Blocks Spec for T24b.** DL's
  record queue needs it or a rule that rebuilds it.
- **H9. Row 7's body re-encode at the boot has no measured cost. Minor.** The bench decides.
- **H10. Prior art was not surveyed by a sidecar. Minor.**
- **H11. Whether today's saved memory holds `Flow.input` fields was not traced. Minor.** If it does, step 5
  leaves them and the `memory` row drops them without a report.
- **H12. The entity record's and the entry's reference rows are thin. Blocks Spec for T24a.** "What confirmed
  data persists saves" (DL:419) is answered only as `CacheShape`.
- **H13. The last two fixes were not run through the model, and 6 P2 failures are untraced. Blocks Spec until
  one more run.** The displaced entry's `rest` and the empty stepped work side were written after the third run.
  The builder could not tell whether the 6 P2 failures came from its own switch or from table 6.6. The model also covers
  no timer, instance, cache record or step 1 to 4, and the second table of 6.6 was checked on 20 cases only.
- **H14. The types were not compiled. Blocks build.** `RefMapsOf`, `RefRows` and the step table's totality are
  stated, not proved; cluster 5 owns the proof.
