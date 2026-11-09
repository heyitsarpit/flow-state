spec Reads
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/plans/flow/references/proposals/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      resource, transaction, stream (contract construction), keys, O.x.lookup,
              O.x.refetch, O.x.subscribe, O.x.setData, O.x.invalidate, O.x.clear, rows,
              contract.get
derives_from  [
              @plan.Operations.O1, @plan.Operations.O2, @plan.Operations.O5,
              @plan.Operations.O6, @plan.Operations.V1, @plan.Operations.V2,
              @plan.Operations.V3, @plan.Operations.V4, @plan.Operations.V5,
              @plan.Operations.V7, @plan.Operations.V10
              ]

requirements
    R1  Inert contracts
        source  @plan.Operations.O1.
        must    resource, transaction and stream return inert contracts; constructing one starts no
                work. Distinct contracts with one id reachable from one App fail construction.
                services is required on every contract and checked against the function's R.
                staleTime and gcTime are required nonnegative Durations (zero: immediately stale or
                collected at the next turn boundary after the last hold; Infinity: never by time);
                invalid values fail construction. concurrency is required. Persisted resources
                require output.

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
        must    Picked key values accept null, booleans, finite numbers, strings, dense arrays and
                plain records. Undefined record properties are absent; undefined array items,
                cycles, accessors, non-plain objects, lone surrogates and unsupported values reject
                without running getters or coercion. Negative zero equals zero. Keys allow at most 
                16
                levels, 256 value nodes and 8,192 UTF-8 bytes of canonical text. An invalid key
                reports InvalidKey with its path and changes nothing before work starts. Mutating
                input later cannot change an admitted key.

    R4  Partial keys
        source  @plan.Operations.O1.
        must    invalidate and clear match a contract plus a partial key: each named property must
                equal the entry's whole property value; {} matches the family. Keys neither
                authorize work nor reconstruct input.

    R5  Shared entries
        source  @plan.Operations.O2.
        must    Equal contract and key share data and one in-flight lookup across actors in a
                Runtime. An entry is fresh only while it has confirmed data, is not invalidated and
                is younger than staleTime. Separate Runtimes share nothing.

    R6  lookup
        source  @plan.Operations.O2.
        must    O.x.lookup(select) returns fresh data without a request, joins an in-flight lookup,
                or starts one, and points the operation's one lane at that entry. A newer lookup
                releases the previous one, whose settlement is evidence (Superseded), so only the
                latest lookup's ending is delivered. One-off read lanes are not persisted, except
                the Interrupted ending a freeze or an end parks.

    R7  refetch
        source  @plan.Operations.O2.
        must    O.x.refetch(k?) starts a request when none is running. While one runs, refetch joins
                it if it started after the entry last became stale; otherwise one trailing request
                starts when it settles and the caller joins that. An entry never has more than one
                running and one trailing request.

    R8  subscribe and triggers
        source  @plan.Operations.O2.
        must    O.x.subscribe places the operation and starts a request only when the entry is
                missing or stale with none running. Time passing alone starts nothing. Automatic
                requests use the oldest live placement's input; a running request keeps its starting
                input. success maps only with lookup and value only with subscribe (VerbMismatch).
                Focus regained and connection restored refetch stale or missing subscribed entries
                with no request running, ordered by contract id then key. Offline blocks nothing.
                Flow never retries a failed lookup automatically.

    R9  Read endings
        source  @plan.Operations.O2.
        must    success and value see confirmed data only; success carries current data even when
                ordering rejects its request's result, and equal data still settles the lookup. A
                read's defect or interruption ends on failure as Defect or Interrupted, which a tag
                record must map; a mapper that throws or returns no shape ends as Defect with a
                UserClosure issue. The failure mapping is exhaustive. Flow.ignore means no event and
                no handler. Unmapped failure leaves its lane tag and an issue.

    R10  value, holds and collection
        source  @plan.Operations.O2.
        must    value fires at placement and then only when confirmed data changes by Equal.equals;
                restored or hydrated placements do not remap an already mapped value. A live
                placement, request or optimistic layer holds an entry, and a one-off read holds its
                latest entry. gcTime on the Runtime Clock removes an entry after its last hold.
                Passive reads never hold or start work. Cleared, collected or replaced requests
                cannot later change data or replacement placements.

    R11  Cache writes
        source  @plan.Operations.O5.
        must    setData(select) returns { key, data }, data a value or updater(current) reading
                confirmed data; undefined declines. A source replaces data only if its request
                started at or after the stored data landed; setData starts and lands when applied.
                Equal accepted writes refresh freshness without value events. invalidate keeps data
                and optimistic values, marks entries stale and refetches subscribed entries with no
                request running; a request started before invalidation cannot make the entry fresh.
                clear removes data and optimistic values, blocks old results and makes surviving
                placements Pending. optimistic and setData on a domain operation are type errors.

    R12  Atomic write batches
        source  @plan.Operations.O5.
        must    A write batch validates all targets before mutation and publishes atomically. More
                than 256 expanded identities (AdmissionOverloaded) or any invalid target 
                (InvalidKey)
                rejects the whole batch; no match is a successful no-op.

    R13  Optimistic values
        source  @plan.Operations.O5.
        must    Every reader sees confirmed data with live optimistic updates applied in start
                order. Base changes and the removal of one update preserve the others; predicted is
                true while any is live. Optimistic values never become confirmed data or cross
                persistence or hydration. Success keeps the look until setData or a lookup started
                after settlement confirms it; failure (NotSent included) removes that commit's
                updates without a refetch or overwriting newer data; unknown keeps them, marked
                uncertain, and refetches the displayed entries once, never looping.

    R14  Rows
        source  @plan.Operations.O6.
        must    s.operations.<name> reflects its snapshot and keeps identity until its lane, entry
                or session changes. A write row is { pending, uncertain, waiting, retryCount,
                progress? } (plus outstanding under serialize; { pending, retryCount, progress? }
                under cancel). A keyed write's rows are a keyed list of existing lanes; O.x.get(s, 
                k)
                is total and a key with no lane reads the idle row. A one-off read's row is 
                undefined
                before its first lookup and after cancel. Resource tags are Pending, Ready,
                Refreshing, Failure, Defect and Interrupted; Failure, Defect and Interrupted keep
                previous data, Refreshing always has data, and all carry data, predicted and key.

    R15  Placeholders and passive reads
        source  @plan.Operations.O6.
        must    placeholder({ previous, input }) may supply Pending data for a new key with no data,
                marked placeholder: true; it never enters the store or persistence. contract.get
                (proposed name) returns the lane-shaped view at that snapshot's store revision, or
                undefined, and creates, holds, refreshes and starts nothing; invalid keys throw.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong
                 runtime; until then every Requirement's evidence is open.

    Q2  The prototype has no staleTime, gcTime, trailing refetch, setData, clear, 
        placeholder,InvalidKey, key bounds, 256-identity batch or optimistic stacking.
            outcome Phase 3 writes those cases and their wrong runtimes from this Spec alone; the
                prototype is no reference for them.

model
    Entry = (contract id, key) -> { confirmed data, landedAt, stale, request?, trailing? }.

    Hold = a live placement, a request, an optimistic layer, or a one-off read's latest
        lookup.

    Fresh = confirmed data present, not invalidated, age below staleTime.

    Visible = confirmed data with live optimistic updates applied in start order.

invariants
    I1  Constructing a contract starts no work and acquires no service. [@R1]

    I2  Two key records with equal fields, in any order, give equal canonical text. [@R2]

    I3  Canonical text is a function of the key's value; the stored name of a non-JSON valuedecodes 
        to the same lane after reload. [@R2]

    I4  An invalid or out-of-bound key changes nothing and runs no getter. [@R3]

    I5  An admitted key is independent of later mutation of the input object. [@R3]

    I6  A partial key matches an entry iff every named property equals the entry's wholeproperty 
        value. [@R4]

    I7  Per (Runtime, contract, key) at most one running and one trailing request exist.[@R5, @R7]

    I8  A lookup of a Fresh entry starts no request. [@R5, @R6]

    I9  Of several lookups through one one-off read lane, only the latest's ending isdelivered. 
        [@R6]

    I10  No request starts because time passed alone. [@R8]

    I11  A request started before the stored data landed, or before an invalidation, never
        replaces data and never makes the entry fresh. [@R10, @R11]

    I12  value fires only on a confirmed change under Equal.equals, never for an optimistic
        value. [@R9, @R10, @R13]

    I13  An entry with a Hold is never collected; an entry without one is collected after gcTime.
        [@R10]

    I14  A rejected write batch changes nothing; an accepted one publishes in one cut. [@R12]

    I15  Visible equals confirmed data with exactly the live optimistic updates applied in start
        order. [@R13]

    I16  No optimistic value is ever confirmed data, persisted or hydrated. [@R13]

    I17  An unknown ending triggers at most one refetch of each displayed entry. [@R13]

    I18  A row object is the same object across publications while its lane, entry or session is
        unchanged. [@R14]

    I19  O.x.get(s, k) is defined for every valid k. [@R14]

    I20  Placeholders and contract.get never write the store, hold an entry or start work.
        [@R15]

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1, @Q2]

    @R2
        enforced_by  [@I2, @I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I5]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I6]
        open_by      [@Q1, @Q2]

    @R5
        enforced_by  [@I7, @I8]
        open_by      [@Q1, @Q2]

    @R6
        enforced_by  [@I8, @I9]
        open_by      [@Q1]

    @R7
        enforced_by  [@I7]
        open_by      [@Q1, @Q2]

    @R8
        enforced_by  [@I10]
        open_by      [@Q1]

    @R9
        enforced_by  [@I12]
        open_by      [@Q1]

    @R10
        enforced_by  [@I11, @I12, @I13]
        open_by      [@Q1, @Q2]

    @R11
        enforced_by  [@I11]
        open_by      [@Q1, @Q2]

    @R12
        enforced_by  [@I14]
        open_by      [@Q1, @Q2]

    @R13
        enforced_by  [@I15, @I16, @I17]
        open_by      [@Q1, @Q2]

    @R14
        enforced_by  [@I18, @I19]
        open_by      [@Q1]

    @R15
        enforced_by  [@I20]
        open_by      [@Q1, @Q2]

tests
    T1  Inert contracts: construct every reference contract with service spies; zero calls.
            Invalid staleTime, gcTime and a missing services list fail construction. [@I1]
    T2  Key equality and canonical text: one lane whatever order a key is written; a bigint key
            names a lane and survives a reload. Cases `REV4-H5`, `REV9-NAMES`; wrong runtimes 
                `m1.key-order-matters`, `d119.bigint-no-name`, `d119.bigint-carried`. [@I2, @I3]
    T3  Key fingerprints: a key field's type change is a new version; a reorder is not. Case
            `P1-H`; wrong runtimes `p1h.key-version-by-names`, `p1h.same-fields-ordered`. [@I3]
    T4  Key values and bounds: each bound at its value and one past it; a throwing getter
            refuses without running twice; a mutated input after admission does not change the
            key. Case `REV6-H4` for getters; bounds have no prototype case (Q2). [@I4, @I5]
    T5  Shared reads on a controlled clock: two actors share one lookup; fresh data starts
            nothing; age past staleTime with a placement refetches; time alone starts nothing;
            collection after gcTime. No prototype case (Q2). [@I7, @I8, @I10, @I13]
    T6  One-off reads: a newer lookup supersedes the open one and only its ending arrives.
            Cases `REV8-M9`, `PAY-16`; wrong runtimes `reads.bad-lookup-keeps-old`,
            `pay16.superseded-read-keeps-older`. [@I9]
    T7  Trailing refetch: a poll faster than its server lands data with at most one running and
            one trailing request. No prototype case (Q2). [@I7]
    T8  Read endings: a throwing mapper ends Defect with a UserClosure issue; an ignored ending
            runs no handler. Cases `PAY-16`, `R14-IGN-01`; wrong runtime
            `pay16.read-defect-not-an-issue`. [@I12]
    T9  Older reads never overwrite: a read started during a write does not overwrite it; one
            started after applies. Cases `MED-03`, `REV4-H1`; wrong runtimes
            `d74-repair-older-no-again`, `d76-older-stub-overwrites`. [@I11]
    T10  Cache writes and batches: setData with an updater, invalidate keeping data, clear making
            placements Pending, a 257-identity batch rejected whole, no match a no-op. No
            prototype case (Q2). [@I6, @I11, @I14]
    T11  Optimistic stacking: two commits stack in start order; removing the first keeps the
            second; success keeps the look until a later lookup; failure removes without refetch;
            unknown keeps it uncertain and refetches once. Cases `STORE-02`, `STORE-03`, `STORE-08`
            for the ending rules; stacking has no case (Q2). [@I15, @I16, @I17]
    T12  Rows: pending, uncertain and waiting follow the lane; identity is kept while unchanged;
            O.x.get of an unknown key reads the idle row. Case `LIKE-01`; lie
            `lie:a3.like-row-hidden`. [@I18, @I19]
    T13  Placeholders and contract.get: a placeholder shows for a new key, never enters the
            store or a capture; contract.get on an old snapshot starts nothing. No prototype case
            (Q2). [@I20]
