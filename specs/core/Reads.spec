spec Reads
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      resource, transaction, stream (contract construction), keys, O.x.lookup,
              O.x.refetch, O.x.subscribe, rows
derives_from  [
              @plan.Operations.O1, @plan.Operations.O2, @plan.Operations.O5,
              @plan.Operations.O6, @plan.Operations.V1, @plan.Operations.V2,
              @plan.Operations.V3, @plan.Operations.V7, @plan.Operations.V10
              ]

requirements
    R1  Inert contracts
        source  @plan.Operations.O1.
        must    resource, transaction and stream return inert contracts; constructing one starts no 
                work. Distinct contracts with one id reachable from one App fail construction. 
                services is required on every contract and checked against the function's R. 
                concurrency is required. Persisted resources require output. A transaction that 
                moves money keys the server by something it recognises, idempotency: "attempt" or 
                the input fields it is, so flow check can warn on a money-shaped write keyed by the 
                Attempt; a server may prune keys, so a re-send on an old key reads first, and Flow 
                keeps no key age. staleTime and gcTime are required on resources; their semantics 
                are written when built (spec-split.md, "written when their phase starts").

    R2  Keys name things
        source  @plan.Operations.O1.
        must    key is a required list of top-level input fields, [] for one; a key field is 
                required with no default (KeyFieldOptional). Equal key records identify the same 
                entry, lane or session in one Runtime regardless of field order; extra fields are 
                ignored. A key is stored as canonical text; a value JSON cannot carry gets a stable 
                name, so 1n restores as "$1n". A key's fingerprint (field names and each field's 
                type and encoded side) is part of the operation's version.

    R3  Key values and bounds
        source  @plan.Operations.O1.
        must    Picked key values accept null, booleans, finite numbers, strings, bigints (named 
                canonically, R2), dense arrays and plain records. Undefined record properties are 
                absent; undefined array items, cycles, accessors, non-plain objects, lone 
                surrogates and unsupported values reject without running getters or coercion. 
                Mutating input later cannot change an admitted key. Key size bounds and the 
                InvalidKey code are written when built.

    R5  Shared entries
        source  @plan.Operations.O2.
        must    Equal contract and key share data and one in-flight lookup across actors in a 
                Runtime. Separate Runtimes share nothing. Freshness (staleTime) is written when 
                built.

    R6  lookup
        source  @plan.Operations.O2.
        must    O.x.lookup(select) returns current data without a request when the entry may serve 
                it, joins an in-flight lookup, or starts one, and points the operation's one lane 
                at that entry. A newer lookup releases the previous one, whose settlement is 
                evidence (Superseded), so only the latest lookup's ending is delivered. One-off 
                read lanes are not persisted, except the Interrupted ending a freeze or an end 
                parks.

    R8  subscribe and triggers
        source  @plan.Operations.O2.
        must    O.x.subscribe places the operation and starts a request only when the entry is 
                missing (or stale, once freshness is built) with none running. Automatic requests 
                use the oldest live placement's input; explicit requests use the caller's input; a 
                running request keeps its starting input. success maps only with lookup and value 
                only with subscribe (VerbMismatch). Flow never retries a failed lookup 
                automatically. Focus and connection triggers are written when built.

    R9  Read endings
        source  @plan.Operations.O2.
        must    success and value see confirmed data only; success carries current data even when 
                ordering rejects its request's result, and equal data still settles the lookup. A 
                read's defect or interruption ends on failure as Defect or Interrupted, which a tag 
                record must map; a mapper that throws or returns no shape ends as Defect with a 
                UserClosure issue. The failure mapping is exhaustive. Flow.ignore means no event 
                and no handler. Unmapped failure leaves its lane tag and an issue.

    R10  value, holds and collection
        source  @plan.Operations.O2.
        must    value fires at placement and then only when confirmed data changes by Equal.equals; 
                restored or hydrated placements do not remap an already mapped value. A live 
                placement, request or optimistic layer holds an entry, and a one-off read holds its 
                latest entry. Releasing one owner preserves shared work until the last owner 
                leaves. Passive reads never hold or start work. Cleared, collected or replaced 
                requests cannot later change data or replacement placements. A source replaces data 
                only if its request started at or after the stored data landed. Collection (gcTime) 
                is written when built.

    R13  Optimistic values
        source  @plan.Operations.O5.
        must    Every reader sees confirmed data with the live optimistic update applied; 
                optimistic values never become confirmed data or cross persistence or hydration. 
                Success keeps the look until a lookup started after settlement confirms it; failure 
                (NotSent included) removes that commit's update without a refetch or overwriting 
                newer data; unknown keeps it, marked uncertain, and refetches the displayed entries 
                once, never looping; a failed refetch keeps the look uncertain until the next 
                natural trigger; an unknown released before the forced repair removes nothing. 
                Stacking several updates is written when built.

    R14  Rows
        source  @plan.Operations.O6.
        must    s.operations.<name> reflects its snapshot and keeps identity until its lane, entry 
                or session changes. A write row is { pending, uncertain, waiting, retryCount, 
                progress? } (plus outstanding under serialize; { pending, retryCount, progress? } 
                under cancel). A keyed write's rows are a keyed list of existing lanes; O.x.get(s, 
                k) is total and a key with no lane reads the idle row. A one-off read's row is 
                undefined before its first lookup and after cancel. Resource tags are Pending, 
                Ready, Refreshing, Failure, Defect and Interrupted; Failure, Defect and Interrupted 
                keep previous data, Refreshing always has data, and all carry data, predicted and 
                key.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  Built later, not specified here: staleTime freshness, gcTime collection, trailing refetch, setData, invalidate 
        and clear with partial keys, write batches and their 256 bound, placeholders, contract.get, key size bounds and 
        InvalidKey, focus and connection triggers, optimistic stacking. The prototype built none of them.
        outcome  They are written in spec-split.md's "written when their phase starts" list, when 
                 phase 4's operations module reaches them.

model
    Entry = (contract id, key) -> { confirmed data, landedAt, stale, request?, trailing? }.

    Hold = a live placement, a request, an optimistic layer, or a one-off read's latest lookup.

    Fresh = confirmed data present, not invalidated, age below staleTime.

    Visible = confirmed data with live optimistic updates applied in start order.

invariants
    I1  Constructing a contract starts no work and acquires no service. [@R1]

    I2  Two key records with equal fields, in any order, give equal canonical text. [@R2]

    I3  Canonical text is a function of the key's value; the stored name of a non-JSON value decodes to the same lane 
        after reload. [@R2]

    I4  An invalid or out-of-bound key changes nothing and runs no getter. [@R3]

    I5  An admitted key is independent of later mutation of the input object. [@R3]

    I7  Per (Runtime, contract, key) at most one lookup is in flight. [@R5]

    I8  A lookup that finds a lookup in flight for its entry joins it and starts no request. [@R5, @R6]

    I9  Of several lookups through one one-off read lane, only the latest's ending is delivered. [@R6]

    I11  A request started before the stored data landed never replaces that data. [@R10]

    I12  value fires only on a confirmed change under Equal.equals, never for an optimistic value. [@R9, @R10, @R13]

    I15  Visible equals confirmed data with exactly the live optimistic updates applied. [@R13]

    I16  No optimistic value is ever confirmed data, persisted or hydrated. [@R13]

    I17  An unknown ending triggers at most one refetch of each displayed entry. [@R13]

    I18  A row object is the same object across publications while its lane, entry or session is unchanged. [@R14]

    I19  O.x.get(s, k) is defined for every valid k. [@R14]

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1]

    @R2
        enforced_by  [@I2, @I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I7, @I8]
        open_by      [@Q1]

    @R6
        enforced_by  [@I8, @I9]
        open_by      [@Q1]

    @R8
        enforced_by  [@I8], placement input rule
        open_by      [@Q1]

    @R9
        enforced_by  [@I12]
        open_by      [@Q1]

    @R10
        enforced_by  [@I11, @I12]
        open_by      [@Q1]

    @R13
        enforced_by  [@I15, @I16, @I17]
        open_by      [@Q1]

    @R14
        enforced_by  [@I18, @I19]
        open_by      [@Q1]

tests
    T1  Inert contracts: construct every reference contract with service spies; zero calls. A missing services 
        list fails construction; a money-shaped write keyed by the Attempt draws flow check's warning (StaticCli Spec). 
        [@I1]
    T2  Key equality and canonical text: one lane whatever order a key is written; a bigint key names a lane and 
        survives a reload. Cases `REV4-H5`, `REV9-NAMES`; wrong runtimes `d119.bigint-no-name`, `d119.bigint-carried`. 
        [@I2, @I3]
    T3  Key fingerprints: a key field's type change is a new version; a reorder is not. Case `P1-H`; wrong runtimes 
        `p1h.key-version-by-names`, `p1h.same-fields-ordered`, `m1.key-order-matters`. [@I3]
    T4  Key values: a throwing getter refuses without being run twice; a cycle refuses; a mutated
            input after admission does not change the key. Case `REV6-H4`. [@I4, @I5]
    T5  Shared lookups: two actors looking up one key share one in-flight request; a second Runtime shares nothing. No 
        prototype case; phase 3 writes this test and its wrong runtime. [@I7, @I8]
    T6  One-off reads: a newer lookup supersedes the open one and only its ending arrives. Cases `REV8-M9`, `PAY-16`; 
        wrong runtimes `reads.bad-lookup-keeps-old`, `pay16.superseded-read-keeps-older`. [@I9]
    T8  Read endings: a throwing mapper ends Defect with a UserClosure issue; an ignored ending runs no handler. Cases 
        `PAY-16`, `R14-IGN-01`; wrong runtime `pay16.read-defect-not-an-issue`. [@I12]
    T9  Older reads never overwrite: a read started before a write's data landed does not replace it; one started after 
        applies. Cases `MED-03`, `REV4-H1`; no live prototype wrong runtime targets resource reads, so phase 3 writes 
        one. [@I11]
    T11  Optimistic endings: success keeps the look until a later lookup; failure removes it without a refetch; unknown 
         keeps it uncertain and refetches once, and a failed refetch leaves it uncertain. Cases `STORE-01`, `STORE-02`, 
         `STORE-03`, `STORE-08`. [@I15, @I16, @I17]
    T12  Rows: pending, uncertain and waiting follow the lane; identity is kept while unchanged; O.x.get of an unknown 
         key reads the idle row. Case `LIKE-01`; lie `lie:a3.like-row-hidden`. [@I18, @I19]
