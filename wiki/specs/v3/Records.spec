spec Records
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance and revisable whenever building shows it
              wrong; each change and its reason is recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src
provides      structure, admit, install, encodeStore, Fate, RecordKey, Shape types, steps, shapeOf
derives_from  [
              @plan.Persistence.O2,
              @plan.Persistence.O3,
              @plan.Persistence.O4,
              @plan.Persistence.O5,
              @plan.Persistence.O6,
              @plan.EntityDomains.O1,
              @plan.EntityDomains.O3
              ]

requirements
    R1  Nothing owed is lost
        source  @plan.Persistence.O4, @plan.Persistence.O6.
        must    An ending a write is owed (answered, unknown, not sent) is delivered to its actor, or stays in the
                store byte for byte until the user forgets the identity or cancels that lane. No build, format step or
                definition edit drops one. An unknown is not lost when its Attempt's final answer replaces it (R16).

    R2  Nothing is invented
        source  @plan.Persistence.O4, @plan.Persistence.O6.
        must    No actor hears an ending for an Attempt it never made. An ending whose handling was saved is never
                told again: the handling and the told mark land in one batch, so a crash keeps both or neither. No
                timer fires that the current definition lacks. Caveat: a text that decodes and was never written by
                Flow is the user's data and carries no promise about its meaning (R20).

    R3  A write is never sent twice by a reload
        source  @plan.Persistence.O6.
        must    A restored Attempt is held, never re-sent by the boot.

    R4  A record never becomes another identity's
        source  @plan.Persistence.O4.
        must    A record is read only as the identity its key names. Identity lives only in the key.

    R5  The app always boots
        source  @plan.Persistence.O5.
        must    No stored text, of any size or shape, fails `ready`, throws, or stops another record from loading.

    R6  What is not understood is not destroyed
        source  @plan.Persistence.O5.
        must    A record from a newer build, a removed machine or a machine not yet loaded keeps its bytes.

    R7  A definition edit has one stated effect per kind of name
        source  @plan.Persistence.O4, @plan.Persistence.O5.
        must    A definition edit has one stated effect per kind of name (state, field, slot, schedule, operation),
                the same at every scope, and the app is told what was dropped. The effects are the reference table
                (`algorithm`, Reference table). [decided: user 2026-11-22] A memory field that does not read resets its
                position, so the actor restarts from the definition's initial state and memory. Why: a position with
                one field put back to its initial is a state the machine never reached (R2: nothing invented).
                Reverse: reset only that field. A `slots`, `baselines` or `graph` leaf that does not read is dropped
                alone; the work side is untouched (I11).

    R8  Nothing is saved that the definition does not save
        source  @plan.Persistence.O2.
        must    No key is read or written for a `persist: false` machine; a key an earlier build left is kept and
                reported. [decided: user 2026-11-22] Why: removing at boot loses what the record owed, such as an unsent
                write, while keeping costs one report. Reverse: remove at boot. No key exists for a local actor; no
                prediction is saved, so nothing unconfirmed reads as confirmed after a reload.

    R9  One admission path
        source  @plan.Persistence.O4, @plan.EntityDomains.O3.
        must    Boot, lazy adoption and hydrate call the same `admit(source, texts)` and then `install`. A lazy
                machine adopted later ends in the world an eager boot gives.

    R10  One writer of the store
        source  @plan.Persistence.O3.
        must    `structure`, `admit` and the boot return no `StoreWrite`; `capture` is the only writer and filters by
                fate. The boot marks keys; it does not write.

    R11  The reader accepts what the writer emits and nothing else
        source  @plan.Persistence.O5.
        must    Each kind has one strict, normal-form `Shape` codec used in both directions. A text that decodes
                encodes back to equal JSON. Identifiers are brands with one constructor. Identity is not a field of
                any `Shape`.

    R12  One format number and one step table
        source  @plan.Persistence.O4.
        must    One number, `FORMAT`, for every kind. One step table over whole identity groups, total by type; a step
                reads no definition. Only the write of `work/X` removes keys it does not replace. A test pins the
                pair (`FORMAT`, the hash of the `Shape` Schemas); changing one without the other fails it, so a
                shape change cannot ship without a format step.

    R13  Every key has one fate
        source  @plan.Persistence.O5.
        must    After `admit`, every key has exactly one fate (`algorithm`, Fates). Fates are re-derived at each
                boot and never saved. Reading structure needs no machine.

    R14  Validity is inside one record
        source  @plan.Persistence.O5.
        must    Every relation the format holds spans one record only: everything about one Attempt lives in one
                `work` record, so no check spans records. The one relation, `attemptsOnce`, is a filter in the work
                codec.

    R15  Every name a record holds is resolved through one reference table
        source  @plan.Persistence.O4.
        must    Every map of a `Shape` is a reference to the definition and has exactly one row in the reference
                table; a map without a row does not compile. No other code looks a saved name up in a definition.
                Position names are dropped; obligations are carried.

    R16  Lanes and rows across a reload
        source  @plan.Persistence.O4, @plan.Persistence.O6.
        must    At the boot a head's, queue's, displaced list's and row's endings are derived by the table of
                `algorithm`, Lanes and rows. A head holds at most one unknown. An unknown says "this may have
                applied"; a final answer for the same Attempt replaces it while it is not yet heard or kept. The
                derivation is written by the next capture, so a second boot derives nothing.

    R17  An install fires nothing
        source  @plan.Persistence.O4, @plan.EntityDomains.O3.
        must    Boot, adoption and hydrate put saved facts into the World without calling a user callback other than
                a Schema decode, without an event, and without comparing a saved fact with a current one. Each skipped
                difference is compared once, by a named later occasion (`algorithm`, Occasions that do not compare).

    R18  The data layer's records
        source  @plan.EntityDomains.O1, @plan.EntityDomains.O3.
        must    An entry, an entity record and a claim are saved as stated in `algorithm`, Data layer records. A cache
                record carries no obligation: every failure is `Discard`, the only fate that removes bytes.

    R19  The definition fingerprint never admits
        source  @plan.Persistence.O5.
        must    `shapeOf` is one function with three uses. A stored record is never refused by its stamp; decode
                admits.

    R20  The fault model
        source  @plan.Persistence.O5.
        must    Who can have written a stored text, and what the boot may trust, is the table in `model`, Fault
                model. Forged-but-valid records are out of scope. [decided: user 2026-11-22] Why: defending meaning
                needs signed records. Reverse: B, defend against forgery. The `it.fails` tests of forgery are deleted
                in a later Task.

    R21  Total and linear
        source  @plan.Persistence.O5.
        must    The boot's admission of a store returns for every map of strings, gives each key exactly one fate,
                reads no clock and runs in time linear in the store's bytes plus `K log K`.

open
    Q1  Executable checks are not built.
        outcome  Each test below is written, when its slice is built, as the cheapest check that fully covers it,
                 and each planted fault is caught by `nub run faults`. Until then every Requirement's evidence is
                 open.

    Q2  The executable model covers no timer, instance, cache record or format step 1 to 4, and its second table of 
        `algorithm`, Lanes and rows was checked on 20 cases only. Blocks build for @task.V3.T92.
        outcome  The model is extended to those parts and kept in the package's tests, then re-run on every table
                 edit.

    Q3  Not every requirement of the saved-records and data-layer concepts was checked against these tables (the 
        earlier requirement lists R1 to R10, R-L1 to R-L5, R-H1 to R-H6; R-L2, R-L4, R-H2, R-H3, R-E8 and I-L1 were
        checked by hand). Blocks acceptance of this Spec.
        outcome  A coverage pass against the tables; each gap becomes a Requirement or a stated departure.

    Q4  `codecSig` is not spiked: stable under module load order and a minified build. Blocks build for @task.V3.T56.
        outcome  A spike. A miss is harmless for records (R19) and costs a refused hydrate.

    Q5  The types are not compiled: `RefMapsOf`, `RefRows` and the step table's totality are stated, not proved. Blocks 
        build.
        outcome  The type proof (the types Spec owns the derivation).

    Q6  The calls on this design are listed in the companion (its section 7) with their traces.
        outcome  [decided: agent orchestrator 2026-11-22] internal rules, as this Spec states them: one `work`
                 record, a head's one unknown, no version tags in keys, a carried obligation, claims in the head,
                 `Compiled.saved`, one `admit`, a reset actor not woken. Why: each B fails its trace in the companion
                 (a head decoded beside its success; an unknown heard once per reload; a mapper called with no
                 input). Reverse: the companion's B for that item.
                 [decided: user 2026-11-22] the user's calls, all as recommended (A), with reasoning in the
                 companion: the fault model, a kept orphan (`Kept(Orphan)`), one step 5 to 6, the earlier
                 saved-record choices, a memory field that does not read, `persist` turned off. Why: the trace
                 beside each in the companion. Reverse: the companion's B for that item.

model
    Boot = one `ready()` of a persistent Runtime: read, step formats, structure, admission, install.

    FaultModel = who can have written a stored text, and what the boot may trust. [decided: user 2026-11-22]
        - This build's encoder: reads it, `Live`.
        - An older format's encoder, before any newer one wrote: steps it, then judges it as its own.
        - The same format under another definition (earlier or later release): stage 2, the reference table.
        - A newer format's encoder (a rollback to this build): `Kept(Newer)` for the whole identity, never read,
            never written.
        - A lost suffix of batches (a crash before the acknowledgement): nothing to do. Each batch is atomic
            (`host/store.ts:43-47`) and one capture is one batch, so every prefix is a store an encoder left.
        - A format 5 or older build writing after a format 6 build: not in the model. Formats 1 to 5 were never
            released; a group holding both `work` and legacy keys is kept, not read.
        - A second tab on another build: not in the model. One Runtime writes a scope at a time.
        - A torn batch, a hand edit, bit rot, another program: safety only. R5 and R6 hold: the text is judged like
            any other, and what does not decode is kept or reset by the fate table. No promise about its meaning.
        - A text that decodes and was never written by Flow: not in the model. It is the user's data; no decode can
            tell it from a real record, and no test may require it.

    ValidStore = what `encodeStore` leaves over reachable Worlds, under builds in release order. Stage 1 accepts
        exactly the structural image; stage 2 judges leaves by the codecs that wrote them.

    Admission = `admit(app, Source.Boot())(structure(stored))`. Written in full at each use.

    Dirty = the record's body, encoded again, differs from its stored body. Its causes are exactly: a format step, a
        `Dropped` or `Starts` cell, and a derivation of table Lanes and rows. A differing stamp alone is not dirty;
        the stamp is rewritten when the record is next written.

    Side = a key is on the position side (`actor/`), the work side (`work/`, `lane/`, `owed/`) or the cache side.
        `fail(side)` is `Reset(Structure)` for a position, `Kept(Structure)` for the work side, `Discard` for the
        cache.

    Carried = the JSON of a part stays at its `Place` and every later encode of the record writes it back unchanged;
        it is not delivered while it is carried; its lane key stays held, so a send on that key declines `notSent
        Rejected`; it is reported at each boot as `ObligationCarried { identity, why, count }`. Fates are re-derived
        at each boot, so a build that declares the name again reads it. A cancel naming that lane key, or `forget`,
        removes it.

    Waits = Carried with a second exit: adoption of the fragment or machine runs `resolve` again on that part.

    Starts = the owner named in the cell begins that part as new, with a value the definition typed (a declared
        initial, an empty baseline), so it always encodes and reads back: a `Starts` cell never turns a record into
        `Reset`.

    StateInventory = Each state has one owner and one writer.
        S1  store text of a key: absent or text. Owner `persist.ts` `capture`. Writers capture, forget. Reader the
            boot's admission. Saved: it is the store.
        S2  fate of a key: `Fate`. Owner `core/fate.ts` (new). Writers boot, adopt, hydrate, forget. Readers capture,
            ensure, send, inspection. Not saved: re-derived each boot.
        S3  `World.records`: decoded positions not yet started. Owner fate. Writers boot, adopt; consumed by ensure.
            Readers ensure, `dehydrate`. Not saved.
        S4  `World.dormant`: per identity the structured group, texts kept. Owner fate. Writers boot, hydrate;
            consumed by adopt. Readers adopt, forget, the entity store (claims only). Not saved.
        S5  carried parts: per identity, verbatim JSON by place. Owner fate. Writers boot, adopt. Readers the work
            encoder, cancel, forget. Re-emitted in place.
        S6  marks: keys to write. Owner `persist.ts`. Writers setters, the turn's `apply`, `install`. Reader capture.
            Not saved.
        S7  `FORMAT`: 6. Owner `record-format.ts`. Writer a build. Readers envelope codec, steps. In every envelope.
        S8  shape stamp: text per machine. Owner `core/shape.ts` (new). Writer compile. Readers envelope encoder,
            report code, hydrate's refusal. In every envelope.
        S9  a head's unknown: absent or `{ ending, kept }`. Owner the ledger (`Operations`). Writers boot derivation,
            the wire, a heard turn. Readers `Start`, the work encoder. Saved in the head.
        S10 reports: `FieldDropped`, `RecordShapeChanged`, `RecordUndecodable`, `ObligationCarried`, `RecordKept`,
            `RecordNotPersisted`. Derived; nobody writes them. Readers evidence, CLI, and `Operations`' `recordIssues`,
            which shows as an issue only a report its catalog row marks `issue: true` (`RecordUndecodable`). Not saved.
        Not this Spec's state, but saved through it: memory, timers (`Schedules`), instances (`Changes`), lanes and
        rows (`Operations`), entries and entity records (the entity store). Each crosses as a typed value with a codec
        in `Compiled.saved`. Marks: `apply` marks the position for any change inside the actor, instances included,
        and the work record for any change to a lane or a subject-held row.

    CallbackInputs = The boot's admission and the encoder run user code only inside Schemas.
        - A Schema's decode (memory field, name, input, key, selection, ending, slot value, entry `output`, entity
            field): called by stage 2 per leaf, with that leaf's JSON only. A throw or failure: that leaf "does not
            read", its row of the reference table; `decodeBy` catches a throw (`record-format.ts:34-41`).
        - A Schema's encode (the same leaves): called by `encodeStore` per changed leaf, with that leaf's value only.
            A throw or failure: `UnencodableValue`; the identity is withheld, as today (`persist.ts:410`).
        - `reads.resume`, delays, `keys`, reasons: never called by the boot's admission; `wake` calls them after
            `install` (`Schedules`).
        No callback here reads the clock, the mint, memory, context or props. An entry's age against `gcTime` is the
        entry store's check when `install` hands it the entry.

    Types = Existing/new/changed are marked.
        // NEW: core/record-key.ts. The only reader and writer of key text. Definition-free.
        type RecordKey = Data.TaggedEnum<{
            Actor: { owner: OwnerText };                       // actor/<machine>/<escaped name>
            Work: { owner: OwnerText };                        // work/<machine>/<escaped name>     NEW kind
            Entry: { contract: string; keyText: string };      // entry/<contract>|<key text>       NEW kind
            Entity: { entity: string; keyText: string };       // entity/<entity>|<key text>        NEW kind
            Legacy: { kind: "lane" | "owed"; owner: OwnerText; tail: string };   // read by step 5 only
        }>;
        // A name escapes "%", "/" and "|" (`world.ts:49-60`); a machine id does not. So: cut a legacy lane key at
        // its first "|" (the tail follows), then split the owner at its last "/".
        type OwnerText = { machine: string; nameText: string };

        // NEW: one envelope for every kind. `shape` is absent only on a stepped record.
        type Envelope<Body> = { format: typeof FORMAT; shape?: ShapeStamp; body: Body };

        // NEW: the structural shapes. Strict structs in normal form: a lane entry holds something, a subject or
        // contract map has an entry, a work body has a lane or a row. `rows`, `queue` and `displaced` may be empty.
        // Every reference to the definition is a key of a named map.
        type PositionShape = {
            state: string;
            memory: { [field: string]: Json };                 // no `Flow.input` field: the name holds it
            schedules: { [statePath: string]: ScheduleMap };   // CHANGED: by the state path of the scope, then name
            slots: { [slot: string]: SlotShape };              // CHANGED: was context + seen + baselines
            graph: { [owner: string]: { [slot: string]: ProviderShape } };   // existing: providers' own wiring
            instances: { [address: string]: InstanceShape };   // NEW: by address; no id, no place
            bookmarks?: { [contract: string]: { [keyText: string]: Json } };   // reserved for streams
        };
        type ScheduleMap = { [name: string]: TimerShape | ReadonlyArray<TimerShape> };   // keyed: key-text order
        type ProviderShape = { machine: string; name: string };
        type SlotShape = {
            provider?: ProviderShape;
            seen?: { value: Json };
            baselines: { [reaction: string]: { value?: Json } };
        };
        // `Schedules`' saved timer, spelled once here. `selectionFailed`, `firing` and `Refused` are Flow's own
        // shapes: stage 1 checks them. `TimerShape` is the one name of a saved timer (`SavedTimer` in code:
        // lint refuses "Shape" in a name).
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
            reset?: string;                                    // `Anchor.reset` key text
            memory: { [field: string]: Json };
            schedules: ScheduleMap;                            // an instance is one scope: by name only
        };
        type WorkShape = {                                   // never written with no lane and no row
            lanes: { [subject: string]: { [contract: string]: { [keyText: string]: LaneShape } } };   // "" is the root
            rows: ReadonlyArray<RowShape>;                     // final endings and declines not yet heard, owed order
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
            retryCount: number; // a non-negative integer; the count the next send carries
            hold: "Out" | "Held";                              // Out: acknowledged, perhaps sent, no answer captured
            unknown?: { ending: Json; kept: boolean }; // the one unknown this head still owes; absent: none owed
            claims: ReadonlyArray<ClaimShape>;                 // keys and field names, never a value
        };
        type ClaimShape = { entity: string; keyText: string; fields: ReadonlyArray<string>; basedOn?: Json };
        type RowShape = {
            subject: string;
            contract: string;
            keyText?: string;                                  // absent only after step 5 (a format 5 row with no lane)
            attempt?: string;                                  // absent: a decline or a queued commit, which made none
            rest?: Json; // the input an ending mapper is given; absent after step 5
            ending: Json;                                      // `Operations`' `SavedEnding` of the contract
            kept: boolean;
        };
        type CacheShape =
            | { _tag: "Entry"; data: Json; at: number }
            | { _tag: "Held"; fields: { [name: string]: { value: Json; version?: Json } } }
            | { _tag: "Tombstone"; version?: Json };

        // NEW: the typed side. Brands have one constructor each: a Schema decode built from Compiled, or the mint.
        type ActorRef = { machine: MachineId; name: ActorName };
        type Position = {
            state: StateName;
            memory: Values;
            schedules: ReadonlyMap<StateName, ReadonlyMap<string, Scheduled>>;   // CHANGED: by path, then name
            slots: Slots;
            instances: Instances;
        };
        type Work = { lanes: ReadonlyArray<RestoredLane>; rows: ReadonlyArray<RestoredRow>; carried: Carried };
        type Place =                                         // where a carried part sits in a WorkShape
            | { _tag: "Subject"; subject: string }
            | { _tag: "Contract"; subject: string; contract: string }
            | { _tag: "Lane"; subject: string; contract: string; keyText: string }
            | { _tag: "Row"; after: number }; // the count of read rows before it: order among rows holds
        type Carried = ReadonlyArray<{ place: Place; json: Json; why: "Retired" | "Unread" | "Waits" }>;

        // NEW: core/fate.ts
        type Fate = Data.TaggedEnum<{
            Live: { dropped: ReadonlyArray<Dropped>; dirty: boolean };
            Reset: { why: "Structure" | "State" | "Memory" };            // position only
            Kept: { why: "Foreign" | "Newer" | "Orphan" | "Name" | "Structure" | "NotPersisted" };   // CHANGED: last
            Dormant: {};                                                  // structure read; leaves wait for adoption
            Discard: {};                                                  // entry and entity only
        }>;
        type Source = Data.TaggedEnum<{ Boot: {}; Adopt: { entry: EntryId }; Hydrate: { token: Token } }>;

        `ending` is saved by a codec per contract that is the union of exactly the endings a writer emits. That
        union is `Operations`'; this Spec requires only that it exists and is one Schema.

    ResultTypes =
        type Structured = {
            groups: ReadonlyMap<string, Group>;          // by owner text, in code-unit order
            cache: ReadonlyMap<string, CacheShape>;      // entry and entity records
            fates: ReadonlyMap<string, Fate>;            // keys stage 1 already settled: Kept, Reset, Discard
        };
        type Group = { owner: OwnerText; position: Option<PositionShape>; work: Option<WorkShape>;
            shape: Option<ShapeStamp>; steppedPosition: boolean; legacy: ReadonlyArray<string> }; // legacy: step 5 keys
        type Admitted = {
            records: ReadonlyMap<IdentityKey, Position>; work: ReadonlyMap<IdentityKey, Work>;
            dormant: ReadonlyMap<string, Group>; fates: ReadonlyMap<string, Fate>;
            entries: ReadonlyArray<SavedEntry>; entities: ReadonlyArray<SavedEntity>;
        };
        `World.quarantined` becomes `World.kept: ReadonlyMap<string, Fate>`; `capture` is its only reader on the
        write path.

invariants
    I1  Round trip. For every reachable World `w`, the admission of the store `encodeStore(w)` leaves gives `w`'s saved 
        facts, every fate `Live`, none dirty. [@R1, @R2]

    I2  Image. A `Live`, not dirty record's body encodes back to its stored body. [@R11]

    I3  Total. The admission of a store returns for every map of strings, gives each key exactly one fate, reads no 
        clock, and runs in time linear in the store's bytes plus `K log K`. [@R5, @R13, @R21]

    I4  Bytes kept. A `Kept` or `Dormant` key's bytes never change, and a Carried part's JSON is written back 
        unchanged, until a `forget` or a cancel of that lane. Saved data is removed only by: `Discard`; a first save
        over `Reset`; a `Dropped` cell; the removal of legacy keys by the `work` write that replaces them. [@R1, @R6]

    I5  Idempotent. Admitting a store twice gives equal results. After every dirty key is captured, admitting again 
        gives the same typed values and nothing dirty. [@R2, @R16]

    I6  One Attempt, once. In a `Live` work record each Attempt id is in exactly one of: a head, a displaced list, a 
        row. A head has at most one unknown. [@R2, @R14]

    I7  Endings conserved. For every structurally valid work record, what is owed after `admit` is exactly table Lanes 
        and rows applied to its parts, plus its carried parts: none dropped, none added. [@R1, @R2, @R16]

    I8  Identity once. No `Shape` field repeats what the key holds. Checked by type. [@R4, @R11]

    I9  No name from text. Every `ActorRef` the World takes from the store came from a name codec decode. [@R4]

    I10  One writer. `structure` and `admit` return no `StoreWrite`. Checked by type. [@R10]

    I11  Sides are independent. No failure of a position changes the fate of its work side, and the reverse, except
        `Kept(Newer)`, which holds the whole group (Stage 1, row 4). [@R1, @R13]

    I12  Nothing unsaved leaks in. `encodeStore` writes no key for a machine with `persist: false`, a local actor, a
        life-held row, or a prediction. The gate is the `encodeStore` filter (`algorithm`). [@R8]

    I13  The stamp never admits. No record is refused, kept or reset by its stamp alone; the stamp only chooses the
        report code and may refuse a hydrate piece before decode. [@R19]

    I14  An install fires nothing. `install` calls no user callback other than a Schema decode, raises no event and
        compares no saved fact with a current one. [@R17]

    I15  Shape and format move together. A change to the `Shape` Schemas without a change to `FORMAT` fails the pin
        test, and the reverse. [@R12]

    I16  Carried is not delivered. While a part is Carried it is delivered to no actor, its lane key declines a send
        `notSent Rejected`, and it is reported at each boot. [@R1, @R15]

    I17  Steps read no definition. A step's output is a function of the group's raw JSON and owner text only; what it
        cannot derive it leaves absent. [@R12]

    I18  Position names dropped, obligations carried. A `Dropped` cell exists only for a position-side part or a claim;
        no work-side part of an owed ending is ever `Dropped`. [@R1, @R15]

    I19  A hydrate payload holds no work kind. [@R9, @R18]

operations
    structure(stored: ReadonlyMap<string, string>) -> Structured
        ensures  Stage 1, definition-free. Pure; throws nothing; reads no clock; returns no `StoreWrite`. [@R5, @R10]

    admit(app: CompiledApp, source: Source) -> (s: Structured) -> Admitted
        ensures  Stage 2, per loaded machine. Pure; returns no `StoreWrite`. [@R9, @R10]

    install(a: Admitted, source: Source) -> void
        ensures  On a tx: World maps, marks, wakes (`algorithm`, install). Fires nothing (@R17). [@R9, @R17]

    encodeStore(app: CompiledApp) -> (w: World, marked: ReadonlySet<RecordKey>) -> ReadonlyArray<StoreWrite>
        ensures  The one writer's encoder. Pure. [@R10, @R11]

    capture(marked: ReadonlySet<RecordKey>) -> void
        ensures  Calls `encodeStore` for the marked keys and drops every key whose fate is `Kept` or `Dormant` (a
                 withheld write, reported once per boot). A work-key write removes its group's legacy keys in its own
                 batch. [@R10, @R12]

    forget(identity: IdentityKey) -> void
        ensures  Removes every key of the identity's group, whatever its fate, in one batch.

    dehydrate(identities: ReadonlyArray<IdentityKey>) -> ReadonlyArray<StoreWrite>
        ensures  `encodeStore` over the chosen identities' positions, the entries and the entity records.

    hydrate(payload: Payload) -> void
        ensures  The request gate (app, scope, token; the entity store's), then `admit(app, Source.Hydrate(...))` over
                 the payload's texts, then `install`. A payload has no work kind. [@R9]

algorithm
    The pseudocode below is design guidance; the tables in `algorithm` are binding as the Requirements cite them.

    structure(stored):
        for (key, text) in stored, by code units:
            k = RecordKey.decode(key)                 else fates[key] = Kept(Foreign); continue
            json = decodeCanonical(text)              else failed[key] = side(k); continue
            n = formatOf(json, k) above FORMAT -> newer.add(ownerOf(k)); bad -> failed[key] = side(k)
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
            m = app.machine(owner.machine)   undeclared -> Kept(Orphan);
                lazy, not loaded -> dormant[owner] = g;
                m.persist is false -> Kept(NotPersisted) for every key of the group
            name = m.saved.name.decode(owner.nameText) and encodes back   else Kept(Name)
            position: resolve each PositionShape map by its RefRow against m.saved
                any ResetRecord -> Reset(why); else Live { dropped, dirty: stepped or any Dropped or Starts }
            work:     resolve each WorkShape map; nothing resets; unread parts -> carried at their Place
                apply table Lanes and rows; Live { dirty: stepped or any Dropped or any derivation }
        for c in s.cache: resolve by the Cache rows; any failure -> Discard

    install(a, source):                           // incarnations.ts `boot`, CHANGED; adoption calls it too
        World.records, lanes, rows, kept, dormant, carried <- a   // one replace per map; rows built once
        mark every key that is Live and dirty, and every Discard
        hand entries to the entry store and entity records to the entity store's judge, with the source
        for each identity with a Live position that is owed anything: ensure(actor, wake)
        // reports are derived from a.fates and carried, once per machine with a count

    encodeStore(app)(world, marked):
        for key in marked, fate not Kept, not Dormant, and its machine has persist: true:
            body = the Shape of the World's value in normal form, leaves by m.saved encoders, carried JSON at its Place
            absent value (an ended actor, a work side with no lane, row or carried part) -> remove key
            else write key = canonicalText({ body, format: FORMAT, shape: shapeOf(m) })
            a work key also removes its group's legacy keys

    resolve(row, saved, declared) is one loop over a saved map's entries and one over the declared names the map
        lacks; the row gives the cell for each. The walkers are iterative (`codec-faults.ts` `walker-on-call-stack`),
        so depth is bounded by the text, not the call stack.

    Where the boot's admission writes derived forms: it derives; it does not write. A derivation that changes a head, a
        queue or a displaced list makes the work record dirty, and `install` marks it. The next capture writes the
        derived form (the `Held` head with its unknown, the derived rows in `rows`), so a second boot derives nothing.

    Tables. The tables below are binding as the Requirements cite them.

    Stage 1: structure. Per key, in code-unit order. The first failing row gives the key its result, which only row 4
        may replace.
        1  the key decodes by `RecordKey` and encodes back to the same text                  fails as Kept(Foreign)
        2  the text is canonical JSON (`codec.ts:328` `decodeCanonical`: no BOM, no duplicate key, byte-equal back)
            fails as fail(side)
        3  `format` is an integer from 1 to `FORMAT`; a `work` key is 6; a legacy key is 1 to 5
            above FORMAT: Kept(Newer); else fail(side)
        Per group (one owner's keys), after every key has passed or failed rows 1 to 3:
        4  no key of the group is Kept(Newer)                              fails as every key of the group Kept(Newer)
        5  the work side is whole: every work-side key passed rows 1 to 3, and the group does not hold both a `work`
            key and a legacy key                                            fails as every work-side key Kept(Structure)
        6  each side steps to `FORMAT` (Format plan)                       the position: Reset(Structure); the work
            side: as row 5
        7  each body decodes by its kind's strict, normal-form `Shape` and encodes back to equal JSON   as row 6
        8  `attemptsOnce`: over the work body's heads, displaced lists and rows, no Attempt id occurs twice   as row 5
        Rows 2, 3, 6 and 7 on a position never touch the work side, and rows 2, 3 and 5 to 8 on the work side never
        touch the position. Row 4 is the one exception: a newer build's record means this build cannot tell what the
        identity is owed, so nothing of it is read. Row 8 is the only relation in the format; it sits inside one
        record.

    Format plan. One number, `FORMAT = 6`, for every kind. One table, total by type:
        // CHANGED: was `stepsTo`, a switch for actor records only (`actor-record.ts:348-370`).
        type RawGroup = { position?: Json; work?: Json; lanes: ReadonlyMap<string, Json>; owed?: Json };
        type GroupStep = (g: RawGroup, owner: OwnerText) => Result.Result<RawGroup, "Position" | "Work">;
        const steps: { readonly [N in OlderFormat]: GroupStep };   // OlderFormat = 1 | 2 | 3 | 4 | 5
        - A step reads no definition, but for step 5 to 6's schedule row, which files each saved timer under the
            state on the record's chain that declares it (a format-5 timer names no state), as step 4 to 5 already
            reads it. What it cannot derive it leaves absent; the reference table's "the record lacks
            it" column then decides, as for a definition edit.
        - A step's failure names its side; the other side goes on.
        - Steps 1 to 4 keep today's actor steps and are the identity on lanes and owed rows, which is what the code
            does today by reading them with the current Schema (`record.ts:35, 48`).
        - Step 5 to 6 is the whole plan. Nothing else bumps the number. From format 5 to format 6:
            `machine`, `name`, `operation` in content: compared with the key, then dropped; a mismatch fails the step.
            content at the top level: under `body`; `shape` absent.
            `context`, `seen`, `baselines`: `slots[slot]`; `graph` unchanged.
            `schedules: SavedTimer[]`: `TimerShape` by `Schedules`' decode table: `dueAt` to `Due`, `left` to `Held`,
                neither to `Idle`; `key`, `armedAt`, `attempt` kept; `pausedBy` to `reasons`; no selection.
            `lane/<owner>|<op>|<keyText>` records and `owed/<owner>`: one `work` body: `lanes[""][op][keyText]`, `rows`.
            a lane record with no head, queue or displaced: no lane; a work side left with nothing is no work record,
                and `install` marks its key so the capture removes the legacy keys (normal form).
            a head's or queued `input`: `rest`, the input without the fields the key text's JSON object names; each
                such field must equal the key's.
            `inFlight: true` (any phase but Held, `record.ts` `encodeLane`): `hold: "Out"`.
            `inFlight: false`: `hold: "Held"`.
            an owed unknown row whose Attempt is a head: that head's `unknown`, with the row's `kept`; a second such row
                fails the step.
            a Held head with no such row: `unknown: { ending: Restored, kept: false }`. Format 5 cannot say "told", so
                it is told once more (a hold never told is lost, so P1 over P2) [decided: user 2026-11-22].
            an owed row whose Attempt is a head and whose channel is not unknown: the step fails.
            owed `reason` text: renamed by `Operations`' table, given as data.
            other owed rows: `rows`, in order, with `subject: ""`; `keyText` from the row's lane id; no `rest`: format 5
                saved no input with a row, so stage 2 carries it [decided: user 2026-11-22].
            an owed row with no lane: a row with `keyText` and `rest` absent; stage 2 carries it.
            a displaced Attempt id: `{ attempt }` with no `rest` (format 5 saved none).
            (nothing): `instances: {}`, `claims: []`.
        - `refusal` is not saved. Only the write of `work/X` removes keys: it removes the legacy keys the group was
            stepped from, in its own batch. No other write removes a key it does not replace.
        - A future step that moves facts out of a released format's key leaves that key as a stub of the new format, so
            a rolled-back build sees `Newer`. Tests that pin `"6"` as "newer" pin `FORMAT + 1`.
        - A test pins the pair (`FORMAT`, the hash of the `Shape` Schemas).

    Fates. Every key has exactly one fate after `admit`. The machine is stage 2's first question.
        Live  When: structure holds; the machine is loaded; position: its state and every field read. Bytes:
            rewritten when dirty or changed. Capture: writes. Ensure, send, wake: as any actor; woken by `install`
            when owed. Leaves by: a save; forget.
        Reset  When: a position fails stage 1, or names a state the definition lacks, or holds a field that does not
            read. Bytes: kept until the first save. Capture: writes; the fresh actor's first save replaces it.
            Ensure, send, wake: not woken; the next ensure starts fresh and then hears what its work side owes;
            reported `RecordUndecodable`, or `RecordShapeChanged` when the stamp differs. Leaves by: the first save;
            forget.
        Kept(Newer)  When: any key of the group has a format above `FORMAT`. Bytes: kept. Capture: withheld, reported
            once. Ensure, send, wake: the actor runs unsaved; nothing owed is delivered; a send that needs an
            acknowledgement ends `notSent StorageRefused`. Leaves by: a build that reads it; forget.
        Kept(Structure)  When: the work side fails stage 1. Bytes: kept. Capture: withheld. Ensure, send, wake: the
            position is judged on its own; nothing owed is delivered; sends as for `Newer`. Leaves by: forget.
        Kept(Orphan)  When: the machine is declared nowhere in the app. Bytes: kept. Capture: cannot happen, no ref
            names it. Leaves by: forget of the scope; a build that declares it.
        Kept(Name)  When: the name text does not decode by the machine's name codec to an `ActorName` that encodes
            back; a local name. Bytes: kept. Capture: cannot happen. Leaves by: forget of the scope.
        Kept(Foreign)  When: the key is not this format's. Bytes: kept. Capture: cannot happen. Leaves by: forget of
            the scope.
        Kept(NotPersisted)  When: the machine is declared with `persist: false` and a key of an earlier build exists.
            Bytes: kept; nothing is read or written. Capture: cannot happen. Ensure, send, wake: the actor starts
            fresh in memory; reported `RecordNotPersisted` once per machine with a count (one more `CATALOG` row,
            class Failure, issue false, report true). Leaves by: forget of the identity or scope; a build that
            persists the machine again. [decided: user 2026-11-22] Why: removing loses what the record owed. Reverse:
            remove at boot.
        Dormant  When: the machine is declared lazy and not adopted. Bytes: kept, byte for byte. Capture: cannot
            happen. Ensure, send, wake: send dropped `NotAdopted`. Leaves by: adoption, judged then by this table.
        Discard  When: an entry or entity record fails any stage, or names a removed contract or entity. Bytes:
            removed by the next capture. Capture: removes. Ensure, send, wake: reads as absent. Leaves by: the next
            capture.

    Reference table. Every map of a `Shape` is a reference to the definition and has exactly one row. The type forces
        it:
        // NEW: adding a map to a Shape without a row here does not compile.
        type RefRows = {
            readonly [M in RefMapsOf<PositionShape> | RefMapsOf<WorkShape> | RefMapsOf<CacheShape>]: RefRow
        };
        type RefRow = { reads: "Read"; doesNotRead: Cell; lacksName: Cell; recordLacks: Cell; notLoaded: Cell };
        type Cell = "Dropped" | "Carried" | "Starts" | "ResetRecord" | "Waits" | "Discard" | "Never";
        One function, `resolve(row, saved, declared)`, walks a map against its declared names and codecs and applies
        the row. `Never` marks a cell the shape or the definition makes unreachable; `resolve` treats reaching one as
        the row's `doesNotRead` cell. Columns: present and does not read / absent from the definition / the
        definition has it and the record lacks it / declared, not loaded.
        Position:
        `state` (a leaf path): Never / ResetRecord / Never (strict shape) / Never.
        `memory` field: ResetRecord (the position resets, decided by the user 2026-11-22;
            `FieldDropped` is not reported; resetting only the field gives a state the machine never reached with
            that value, as PAID with total 0) / Dropped,
            reported `FieldDropped` / Starts: its declared initial / Never.
        `slots` entry (provider, `seen`): Dropped, the slot starts unbound / Dropped / Starts: `seen` none, bound at
            the next ensure / Never.
        `slots[].baselines` reaction: Dropped / Dropped / Starts: silent at restore / Never.
        `graph` owner, slot, provider: that entry Dropped / Dropped / Starts: none / Never.
        `schedules` state path: Never (a path is text) / that path's schedules Dropped / Starts: `wake` decides the
            scope as entered / Never.
        `schedules` name: per timer, below / Dropped (`Schedules` decode row 1) / Starts (row 2) / Never.
        a timer's `key`: that timer Dropped (row 3) / Never (`keys` decides later, row 4) / Starts / Never.
        a timer's `reasons` name: Never (a name is text) / that name Dropped (row 5) / Starts: read fresh (row 6) /
            Never.
        a timer's `selection`: Starts: `Unselected`, silent (row 7) / Starts: `Unselected` / Starts: `Unselected` /
            Never.
        `instances` address, `reset`: that instance Dropped (`Changes`' `Dropped` row) / Dropped / Starts: `reconcile`
            under `Begin` / Waits.
        inside an instance, `memory` and `schedules`: the rows above, where ResetRecord means "this instance Dropped" /
            as above / as above / Waits.
        `bookmarks` contract, key: Dropped / Dropped / Starts: none / Never.
        Work:
        `lanes` subject: Never (an address is text) / Carried / Never / Waits.
        `lanes` contract: Never / Carried (`Retired`) / Never / Never.
        `lanes` key text: the lane entry Carried / Never / Never / Never.
        a head's, queued or displaced `rest`, merged with the key: the lane entry Carried / Never / a displaced `rest`
            absent: that entry stays in `displaced`, Carried / Never.
        a head's `unknown.ending`: the lane entry Carried / Never / Never / Never.
        a row's subject, contract: Never / that row Carried / Never / Waits.
        a row's key text, `rest`, `ending`: that row Carried / Never / `keyText` or `rest` absent: that row Carried /
            Never.
        `claims` entity, key, field, `basedOn`: that claim Dropped / Dropped / Never / Never.
        Cache:
        entry contract, key text, `data`: Discard / Discard / Never / Dormant.
        entity name, key text: Discard / Discard / Never / Dormant.
        entity field: that field Dropped / Dropped / Starts: absent / Never.
        `Schedules`' decode rows 8 to 10 (an edited `restartOn`, a saved `firing`, `Refused`) need no row: those
        fields are structure and are kept as saved. Rows 11 and 12 are `wake`'s. A name saved as evidence (a
        failure's `{ code, slot }`) is text and is never looked up.
        Three rules cover every row:
        - Position names are dropped; obligations are carried. A position is where the actor was; losing part of it
            is a reset the app is told about (R7). An obligation is something the world still owes; it is never
            dropped (R1). An owed row is judged alone.
        - Carried, Waits and Starts are defined in `model`.
        - A `Dropped` cell is dirty and reported.

    Identity.
        - A record's identity is its key.
        - Stage 2 decodes `nameText` by the machine's name codec to an `ActorName`; the value must encode back to the
            same text (`identity.ts:81-103`, kept). A local name has no decode.
        - Every identity inside a body (`slots[].provider`, `graph`) is decoded the same way by the provider
            machine's codec. A body string never reaches `ensure`: `ensure` takes `ActorRef`, and `ActorName` has no
            cast.
        - A memory field declared `Flow.input` is not saved; `inputOfName` gives it.
        - A lane's input is read in one way: the key text's fields merged into `rest`, then decoded by the input
            codec. A `rest` that itself holds a key field does not read.
        - There is no version tag in a key and nothing is re-keyed
            [decided: agent orchestrator 2026-11-22]. A build that changes a name or key Schema finds the old text
            either readable (the same identity, by design) or not (`Kept(Name)`, or a Carried lane).

    Lanes and rows across a reload. The boot's admission derives; it writes nothing.
        A saved part to what `admit` gives (heard at `Start`; then saved as):
        head `Out`, no `unknown`: `Held`, `unknown: { Restored, kept: false }`; then `Held`, no `unknown`; if
            refused, `kept: true`.
        head `Out` with `unknown`: `Held`, that `unknown` (it covers the lost answer too); then as above.
        head `Held` with `unknown`: unchanged; owed `Waiting`, or `Kept` when `kept`; then as above.
        head `Held`, no `unknown`: unchanged; owes nothing; not heard; unchanged.
        a queued `rest`: removed from `queue`; a row `notSent Restored` with that `rest`; the row removed; if
            refused, `kept: true`.
        a displaced Attempt with its `rest`: removed from `displaced`; a row unknown `Restored` with that `rest`; the
            row removed; if refused, `kept: true`.
        a row: the row, `Waiting`, or `Kept` when `kept`; removed; if refused, `kept: true`.
        a Carried part: nothing; not heard; unchanged.
        Transitions after the boot that write the same state (`Operations` owns the lane; these are the saved form's
        rules). Head state, then the wire answers finally / the wire answers unknown or its answer is lost / a
        re-send is acknowledged / the unknown is heard / cancel or release:
        `Out`, no `unknown`: head removed, a final row added / `Held`, `unknown` set / impossible / impossible / the
            lane's own rule.
        `Out` with `unknown`: head removed, a final row added, the unknown is dropped / `Held`, the earlier `unknown`
            stays (one slot) / impossible / `Out`, no `unknown` / the lane's own rule.
        `Held` with `unknown`: impossible (nothing is out) / impossible / `Out`, `unknown` stays / `Held`, no
            `unknown` / head removed, unknown dropped.
        `Held`, no `unknown`: impossible / impossible / `Out` / impossible / head removed.
        - An unknown says "this may have applied". A final answer for the same Attempt says whether it did, so it
            replaces an unknown not yet heard or kept. A second unknown for a head that still owes one adds nothing:
            the slot holds one [decided: agent orchestrator 2026-11-22].
        - A `Held` head with nothing owed leaves by the lane's own exits: a re-send, a cancel or a release.
        - Life-held rows are never saved. Only subject-held rows of persisted identities reach the encoder.

    Occasions that do not compare. One rule: an install fires nothing. The differences it skips are compared once, by
        a named later occasion:
        - a saved `seen` against the provider's current value: the subject's `Start` (the wave at
            `incarnations.ts:156-165`); for hydrate, the next publication.
        - a saved selection against a fresh `restartOn` read: `wake` changes no baseline; the owner raises `Context`
            after it (`Schedules`, `Changes`).
        - a saved timer against the clock: `wake` (`Schedules`).
        - a saved instance against what the definition wants: `reconcile` under `Begin` (`Changes`).
        - a restored entity field against a hydrated or fetched one: the entity store's merge table; a restored field
            has no position.
        - a saved entry's age against `staleTime` and `gcTime`: the entry store, when `install` hands it the entry.
        Sources differ only in precedence, one table; the merge of entity fields and entries stays the entity
        store's. Columns: a live incarnation exists / a restored record exists, not started / the identity is
        `Dormant` / none.
        position, `Source.Boot` or `Adopt`: impossible / impossible / impossible / install.
        position, `Source.Hydrate`: keep the World's / keep the saved / the piece waits beside the saved text; at
            adoption the saved wins / install.
        work, `Source.Hydrate`: impossible: a payload has no work kind (type) / impossible / impossible /
            impossible.
        entry: `younger` by `at` / `younger` / waits / install.
        entity field: the merge table / the merge table / n/a / install.
        A hydrate payload is the entity store's envelope `{ app, scope, token, omitted }` around record texts in this
        format. The request gate (app, scope, token) runs before `admit`.

    Data layer records.
        - Entry (`persist: true` requires `output`): `entry/<contract>|<keyText>`, body `{ data, at }`. `data` is by
            the contract's `output` codec. @task.V3.T92 owns the kind and codec; the entry store owns `at`, age and
            `gcTime`.
        - Entity record: `entity/<entity>|<keyText>`, body `Held` or `Tombstone` (`CacheShape`). No position is saved
            (the mint restarts). No claim value and no prediction is saved.
        - Claims are in the head that made them (`ClaimShape`): entity, key text, field names and `basedOn`. `sent`
            is the head's `hold`. They are readable in stage 1 without the machine, so `World.dormant` shows a dormant
            identity's claims to the entity store [decided: agent orchestrator 2026-11-22]. The order of Attempts on one
            entity record across identities is not saved (companion, open holes).
        - Bookmarks are a reserved map of the position. Streams have no design.
        - A cache record carries no obligation: every failure is `Discard`.

    The definition fingerprint. One function, three uses. The stamp never admits anything; decode does.
        // NEW: core/shape.ts
        const signatureOf: (c: Compiled) => Json;       // canonical; sorted names; one `codecSig` per saved leaf
        const shapeOf = (c: Compiled): ShapeStamp => digest(canonicalText(signatureOf(c)));   // pure, no host API
        - `signatureOf` holds exactly what `Compiled.saved` holds: leaf state paths; memory fields; the name codec;
            slots with their provider machine id; schedules with key, reasons and selection; fragments by slot;
            operations with input, key fields and ending. It omits props, emits, events and guards.
        - `codecSig` is the encoded side of a Schema as canonical JSON. How Effect's representation gives it stably
            under load order and minification is not spiked (open Q4).
        - Uses: (a) the report code of a failing record: `RecordShapeChanged` when the stamp differs,
            `RecordUndecodable` when equal or absent; (b) hydrate may refuse a piece whose stamp differs before decoding
            it, because refusing a payload loses nothing (the client fetches); a piece whose stamp matches is still
            decoded and judged; a lazy machine's pieces wait and are compared at adoption; (c) `flow explain` across
            releases. A stored record is never refused by its stamp.
        - No app-wide digest is stored. Where hydrate needs one, it is the digest of the payload's `(machine id,
            shape)` pairs, computed the same way on both sides.

    The throw family. A user read that throws changes only its own check; for this Spec the read is a Schema decode
        per leaf. Detection is per leaf (`decodeBy`): a `slots`, `baselines` or `graph` leaf that does not read is
        dropped alone; a `memory` field that does not read resets its position
        [decided: user 2026-11-22]. The work side is untouched (I11).

composition
    flow
        Boot, adoption and hydrate converge on one path: `structure`, `admit`, `install`. Capture is the one writer.
        `fate.ts` owns S2 to S5. The boot's admission needs no machine for stage 1; stage 2 needs only `Compiled.saved`.

        Offers
            `structure`, `admit`, `install`, `Fate`, `RefRows`: the one admission path for boot, adoption and hydrate.
            `RecordKey`, `Envelope`, the `Shape` types and `steps`: the one saved-format plan.
            `shapeOf`: the one definition fingerprint.
            The mutation alphabet (`tests`, Alphabet) as data with the oracle, for `Fake.storage.mutate`.

        Needs
            `Compiled.saved` from the types Spec: `{ name, states, memory, slots, schedules, fragments, operations }`,
            each leaf a codec. A schedule's key and selection Schemas are in it, so a changed key Schema cannot restore
            and route to the wrong timer. [decided: user 2026-11-22; one answer for the records and types designs: A]

        Schedules (taken). `TimerShape` is `Schedules`' saved timer; its decode rows 1 to 7 are reference rows,
            rows 8 to 10 are structure, row 13 is step 5, rows 11 and 12 stay `wake`'s. No table of `Schedules`
            changes. `Schedules` uses `Position.schedules`'s `Shape` as its saved per-schedule value; this Spec
            owns every saved Schema name.

        Changes (taken). `instances` by address with status, reset, memory and schedules, no id; lanes and rows carry
            `subject` inside the one `work` record instead of two record keys (a change of place, not of rule); marks as
            in `model`. A lazy fragment's parts `Wait`; adoption calls `admit(Source.Adopt)` then `install` on them and
            hands the turn walk's tenth `Change` the decoded instances. Adoption itself is not saved: it is re-derived
            from what is loaded. `Changes`' `Dropped` row must also cover "the instance's memory or reset value does not
            read".

        Operations (handed).
            (a) `SavedEnding` per contract, the exact union writers emit, with the owed-reason rename table as data.
            (b) The in-memory lane holds its head's unknown in one slot as `HeadShape` does, so the encoder is not a
                projection; until then the encoder requires "at most one unknown row for a head's Attempt".
            (c) The second table of `algorithm`, Lanes and rows, "a final answer replaces an unheard unknown", is
                accepted once, here; `Operations` cites it.
            (d) `Origin.HeldAtStart` and the once-guard go.
            (e) The entry store's `at`, age and `gcTime`.
            (f) Attempt ids are never reused across Runtimes (@task.V3.T28 owes it).
            (g) Whether hydrate's "no `onContext`" and restore's wave are one rule (open, companion).
            The retry and idle guards read one view derived from a lane's head (`HeadShape`) and stored nowhere.

        Host and tests (handed). The run rule for I1 and I2; the mutation generator of `tests`, Alphabet, as test
            tooling (`Fake.storage.mutate(kind)` applies one mutation before an open; @task.V3.T112 owns the
            applier and the sweep); the Story store's hostile fake producing the alphabet's mutations; `flow
            explain` reading fates; the type proof that `RefRows` is total.

        Tasks. @task.V3.T92 builds the codec (Stage 1, Format plan, Reference table, Lanes and rows; it owns no state);
            @task.V3.T56 owns Fates (quarantine's exits included), the fingerprint and the `persist` row;
            @task.V3.T48 owns `Dormant` and `Waits`; @task.V3.T115 owns `Source.Hydrate` and the precedence table;
            @task.V3.T28 owns the store adapters; @task.V3.T124 owns the cache rows; @task.V3.T125 and @task.V3.T126 own
            the entity records and claims. No Task's scope is changed here.

rules
    batch  "Heard" and its record change land in one batch with the turn's own position write: one capture is one
           `Store.write` and an identity's keys are never split across batches (`persist.ts` `byIdentity`,
           `write-ahead-scope.test.ts:28`). [@R2]
    order  At a `Start`, endings are delivered in this order: rows in saved order, then the rows derived from queues
           and displaced lists, then heads' unknowns, lanes in key order. This is today's order
           (`ledger.ts:338-378`) with one change: an unknown from the wire not yet heard at capture is told with the
           heads. [@R16]
    wake   `install` wakes an identity only when its position is `Live` and its work owes something after table Lanes
           and rows. With a position that is `Reset` or absent, what it is owed waits for the ensure that starts it,
           as a disposed identity's rows do today (`incarnations.ts:455-466`). Boot and adoption run the same
           `install`. [@R9, @R16]

realization typescript
    Brands, one constructor each. `MachineId`, `ActorName`, `StateName`, `ContractName`, `KeyText`, `AttemptId`,
        `SubjectAddress`, `ShapeStamp`: each is made only by a Schema decode built from `Compiled` or by the mint.
        `restoredLaneId` and `restoredAttemptId` (`world.ts:41`) are deleted. `brandedAs` on the T92 branch is the
        cast this forbids.
    Derived, not hand-written. The typed side of `PositionShape` derives from the definition: `memory` from the
        declared fields, `schedules` from the declared schedules (`Schedules`' `TimerShape`, typed `Scheduled`), 
            `slots` from declared
        context, `instances` from fragment slots. The types Spec proves the derivation; this Spec states it.
    `Compiled.saved` (new): one struct holding every codec a record reads.
    Public types touched: `Store`, `StoreWrite`, `StoreScope` unchanged. `persist: true` unchanged. The boot reports
        gain `ObligationCarried`, `RecordKept` and `RecordNotPersisted`; `LaneRekeyed` and `LaneRekeyCollision` never
        exist.
    Casts and `unknown`s in the area: `decodeBy(value: unknown)` (`record-format.ts:36`) stays, as the one entry of
        stored JSON. The `FLOW_STATE_ALLOW_UNKNOWN` sites in `record.ts` go with their functions. The six `no-id-text`
        suppressions in `record.ts` go: key text is read only in `record-key.ts`.
    Core style. The core uses `Schema`, `Result`, `Option`, `Data` only; no Effect runtime.
    Cost. Sizes: `K` keys, `B` stored bytes, `b` bytes of one record, `L` lanes and `R` rows of one identity.
        `structure`: `O(B + K log K)`; one parse and one re-encode per text, as today (`codec.ts:328`), plus one body
            re-encode for row 7; the sort is the store's key order.
        `admit`: `O(B)` for loaded machines; one `resolve` per map; a dormant group costs its structure only.
        `install`'s rows: `O(R)` per identity; today `O(R^2)`, since `ledger.restore` replaces the list per row.
        capture of a position: `O(changed fields) + O(b)` to join; the per-field text memo stays.
        capture of a work record: `O(changed lanes) + O(b)` to join. New cost: a send in one lane rewrites the
            identity's whole work text, O(b) in its bytes; a per-lane text memo keeps the encode to the changed lane.
            The bench decides.
        `shapeOf`: once per machine at compile.
        marks per step: `O(touched identities)`; today `markMailbox` scans every owed row while mail is queued: mark
            from the tx's touched rows instead.
        saved timers: `O(timers)`; today idle timers by states by schedules: `Schedules` saves every timer as a 
            `TimerShape`.
        Indexes built once at compile: `Compiled.saved`; declared names per reference map as a `Map`; `shapeOf`.
        Hot-path allocations: one body object and one text per marked key; no per-row list copies. The body re-encode
        in row 7 doubles the boot's encode work; the bench decides whether it runs in production or only under the
        run rule.

coverage
    @R1    enforced_by [@I1, @I4, @I7, @I11, @I16, @I18]    open_by [@Q1, @Q2]
    @R2    enforced_by [@I1, @I5, @I6, @I7]                 open_by [@Q1, @Q2]
    @R3    enforced_by [@I7]                                open_by [@Q1]
    @R4    enforced_by [@I8, @I9]                           open_by [@Q1]
    @R5    enforced_by [@I3]                                open_by [@Q1]
    @R6    enforced_by [@I4]                                open_by [@Q1]
    @R7    enforced_by [@I18]                               open_by [@Q1, @Q2]
    @R8    enforced_by [@I12]                               open_by [@Q1]
    @R9    enforced_by [@I19]                               open_by [@Q1]
    @R10   enforced_by [@I10]                               open_by [@Q1]
    @R11   enforced_by [@I2, @I8]                           open_by [@Q1, @Q5]
    @R12   enforced_by [@I15, @I17]                         open_by [@Q1, @Q2]
    @R13   enforced_by [@I3, @I11]                          open_by [@Q1]
    @R14   enforced_by [@I6]                                open_by [@Q1]
    @R15   enforced_by [@I16, @I18]                         open_by [@Q1, @Q5]
    @R16   enforced_by [@I5, @I7]                           open_by [@Q1, @Q2]
    @R17   enforced_by [@I14]                               open_by [@Q1]
    @R18   enforced_by [@I19]                               open_by [@Q1, @Q3]
    @R19   enforced_by [@I13]                               open_by [@Q1, @Q4]
    @R20   enforced_by [@I1]                                open_by [@Q1, @Q6]
    @R21   enforced_by [@I3]                                open_by [@Q1]

tests
    T1  Levels. (1) Executable model (kept beside the Spec in the package's tests): `structure`, `admit` for a toy app, 
        `encodeStore`, and I1 to I7, I11 over generated Worlds and mutated stores. (2) Run rule
            (`tests/rules/records.ts`, extends `recordKinds`): after every Story step that captured, I2 on every key the
            Runtime wrote, and I1 against the World at the cut. (3) Stories: the named rows below, on the fixtures that
            persist (shop, transfers, home, session, wizard, lanes, sign-in, command-palette, cells). [@I1, @I2, @I3,
            @I4, @I5, @I6, @I7, @I11]
    T2  Alphabet. Mutations are generated from the `Shape` types and the key grammar, not from past findings. Per key: 
        delete; copy under another owner; swap the kind prefix; change the name text; a local name. Per envelope:
            `format` plus one, zero, null, a string, fractional, absent; `shape` changed or absent; an extra field. Per
            `Shape` node: delete a field; add a field; null; swap the type; empty a list or map. Per relation: one 
                Attempt
            id in two places (every pair of head, displaced, row); a `work` record beside legacy records, each also with
            a bad format; a lane entry with all three parts empty; a `rest` holding a key field. Per reference row: the
            name absent from the definition; the leaf unreadable; the machine undeclared; the machine lazy. Per 
                sequence:
            capture, kill before or after the acknowledgement, reload, hear, reload. Size: a toy app of two machines, 
                two
            operations, one schedule, one slot and one fragment; Worlds of up to three lanes and four rows; every single
            mutation and every pair on one identity. [@I3, @I4, @I11, @R5, @R6]
    T3  Oracle. The fate table, the stage 1 rows and the reference table are the oracle: for a mutation, the expected 
        fate is the first failing row of Stage 1 or the cell of the reference table. The check fails when the fate
            differs, when any key outside the expected set changes bytes after a capture, or when I1 to I7 or I11 fail.
            [@I1, @I4, @I5, @I6, @I7, @I11]
    T4  Story `shop/pay-across-builds`: a held charge, a renamed field, a dropped schedule. Wrong ending: the charge 
        re-sent; the unknown heard twice; `slow` firing. [@R2, @R3, @R7, @I7]
    T5  Story `shop/told-once`: an unknown heard and saved, then two reloads. Wrong ending: a second `Restored`. [@R2, 
        @I5]
    T6  Story `shop/answer-beside-hold`: a work record with a head and a final row of one Attempt. Wrong ending: both 
        delivered. [@R14, @I6]
    T7  Story `shop/guest-cart-key`: main's records copied under another owner. Wrong ending: the guest reading main's 
        cart as its own identity's content. Asserts only that nothing of main's identity is read from it: a valid
            copy is "forged but valid" (R20). [@R4, @I8, @I9]
    T8  Story `shop/bound-to-local`: a slot's provider named `~9`. Wrong ending: a local actor started from the store. 
        [@R4, @R8, @I9, @I12]
    T9  Story `transfers/retired-wire`: a lane whose operation is gone, beside two live rows. Wrong ending: the live 
        rows not delivered, or the lane dropped. [@R1, @I4, @I16, @I18]
    T10  Story `session/lazy-inbox`: a lazy machine's records, not adopted, owed an ending. Wrong ending: `ready`
            loading it; its bytes changing; adoption not waking it. [@R6, @R9, @I4]
    T11  Story `home/dropped-keyed-timer`: a keyed timer whose key Schema changed. Wrong ending: a firing for the old
            key. [@R2, @R7]
    T12  Story `lanes/upgrade-5-to-6`: format 5 lane and owed records, one with a bad row. Wrong ending: old keys left
            behind or removed while kept; an ending doubled. [@R12, @I4, @I17]
    T13  Story `shop/newer-record`: `FORMAT + 1` on the work record. Wrong ending: an overwrite; an ending told to a
            fresh actor. [@R6, @I4, @I11]
    T14  Story `shop/not-persisted`: a machine now declared `persist: false`, an earlier build's records present, one
            owing an unknown. Wrong ending: the record read, rewritten or discarded; the unknown lost. [@R8, @R1, @I12]
    T15  Planted faults, each caught by `nub run faults`: `shape-not-strict`, `empty-lane-accepted`,
            `key-content-identity-restored`, `attempts-once-off`, `unknown-slot-unsaved`, `carried-dropped-on-encode`,
            `carried-delivered`, `judge-writes`, `capture-ignores-fate`, `step-reads-definition`, `legacy-keys-left`,
            `legacy-keys-removed-while-kept`, `position-failure-resets-work`, `newer-work-read-alone`,
            `orphan-discarded`, `dormant-decoded-at-ready`, `adoption-does-not-wake`, `name-not-encoded-back`,
            `rest-key-field-wins`, `ref-row-missing` (a compile failure), `stamp-admits`, `persist-off-rewritten` (a
            `persist: false` machine's old record is written again), `shape-changed-without-format` (the pin),
            `install-fires-event` (an install raises an event or runs a reaction), `hydrate-carries-work` (a hydrate
            payload holding a lane or row is accepted).
            [@I2, @I4, @I6, @I10, @I11, @I12, @I13, @I14, @I15, @I16, @I17, @I19]
