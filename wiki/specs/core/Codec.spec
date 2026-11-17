spec Codec
status        proposed
basis         A guide, and one of the two Specs most likely to change (Codec,
              Diagnostics): no test pins it yet. Revisable whenever building shows it
              wrong; each change and its reason is recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src
provides      the structural codec (encode, decode) used by records, payloads, traces and the
              Model
derives_from  [@plan.Inspection.O2, @plan.Inspection.V3, @plan.Package.C1]

requirements
    R1  One codec, no size bounds
        source  @plan.Inspection.O2; @plan.Pending.D23.
        must    One codec carries every value that crosses a process or storage boundary: persisted
                records, server-rendering payloads, trace artifacts and Model bytes. It accepts
                JSON values produced by the owning Schema, of any size or depth: how big a value may
                be is judged by the bench, and the store's quota is the one real limit, which ends
                as StorageRefused (@spec.WriteAhead.R13).

    R2  Canonical encoding
        source  @plan.Inspection.O2; @plan.Package.C1.
        must    Encoding is canonical: sorted keys, no whitespace, and no -0, NaN, infinity, cycle, 
                lone surrogate or sparse array. Equal accepted data gives equal bytes on every 
                host, using ECMAScript and Web APIs only, never Node Buffer or UTF-16 counts.

    R3  Strict decoding
        source  @plan.Inspection.O2.
        must    Decoding rejects a byte-order mark, invalid UTF-8, and any input that does not 
                re-encode to exactly the same bytes (duplicate keys, unsorted keys, odd number 
                spellings), then decodes with the owning Schema. Mutating an input or output byte 
                array afterwards never changes a stored or decoded value.

    R4  Failures
        source  @plan.Inspection.O2.
        must    A failure is one FlowError raised before any actor, store, service or committed
                change: CodecMalformed (one
                reason of utf8, json, nonCanonical, cycle, negativeZero, nonFinite, loneSurrogate,
                notPlain or sparse) or CodecSchemaMismatch (path and issue summary, never data
                values).

                No raw parser error or Cause escapes. Inside a turn or a capture, a value with no
                encoded form (a malformation) is reported only as UnencodableValue (its details
                naming the reason) and never fails the turn (a commit's input or key that cannot
                encode is the one exception: it declines NotSent { Unencodable }, an ending,
                @spec.WriteLanes.R12).

                No send waits on a record that may not encode. A persisted commit is admitted only if
                its input encodes canonically; otherwise it declines NotSent { Unencodable }. An
                owed row whose value has no form is saved as its Attempt's unknown { Restored },
                reported UnencodableValue, and a Flow-made row with no value saves `null`. So only an
                actor record can fail to encode (@spec.WriteAhead.R4).

                Elsewhere:
                CodecMalformed is raised only where a codec failure is a
                FlowError: decoding at the boot, payloads, traces, Model bytes and direct calls.
                Decision (agent, 2026-11-11): audit C23, one code per trace. Why: a turn never fails
                on a value it cannot save. Reverse: raise Codec errors inside turns too (spec-log.md,
                T42).

    R5  Record kinds
        source  @plan.Inspection.O2; the record set is @spec.WriteAhead.R4 and @spec.WriteAhead.R5.
        must    A persisted record is one of three kinds, named by its key: `actor/<identity>`,
                `lane/<lane>` and `owed/<identity>`. Each kind has one Schema, and every record
                carries the one `format` number all kinds share, the current format (@spec.WriteAhead.R9); the
                paused-timer step is the first migration step (@spec.Restore.R5 owns the
                steps). A lane's id is the text after `lane/` (@spec.WriteLanes `model`, Lane).

                Each Schema has exactly the fields @spec.WriteAhead.R4 and @spec.WriteAhead.R5 list
                for its kind, so the lane Schema has no `mayHaveApplied`. A row's `channel` is one of
                `success`, `failure`, `notSent` and `unknown` and names its ending's origin, so a
                decoded author failure and a decoded Flow.NotSent with the same tag stay distinct
                (@spec.WriteLanes.I39). A row's Flow-made ending is encoded by the Schemas of
                Flow.NotSent and Flow.Unknown (@spec.WriteLanes.R3). There is no `parked/` or
                `kept/` kind. A key of no kind, or a record its kind's Schema refuses, is
                undecodable and handled by @spec.Restore.R5; it is never coerced. Decision (user,
                2026-11-12): consult round 3, C9. Why: an ending outlives both its lane and its
                actor record. Reverse: restore R5 from commit `9405af2f`. Every record is stored as
                its canonical text (R2) and read strictly (R3). An identity's owed rows fill one
                record, `owed/<identity>`, in owed order.

open
    Q1  Executable checks are not built.
        outcome  Each test below is written, when its slice is built, as the cheapest check that fully covers it (a
                 compile-time test, a run rule applied to every Story run, a Story test or a pure core test) in
                 packages/flow-state-v3/tests/, and each rule gets a planted fault in tests/faults.ts that
                 `nub run faults` must catch.

    Q2  The prototype codec (round-14/codec/codec.ts) has no test pinning these error codes.
        outcome  The checks are written from this Spec, not from the prototype.

model
    Bytes = UTF-8 canonical JSON text.

invariants
    I1  For every accepted value v: decode(encode(v)) equals v. (Canonical bytes coming back equal is I4's.) [@R2, @R3]

    I2  A value of any size or depth encodes and decodes back equal. [@R1]

    I3  Equal values give equal Bytes on Node, Bun, Deno, Chromium, Gecko and WebKit. [@R2]

    I4  Bytes that are not the canonical encoding of their value are rejected. [@R3]

    I5  After encode(v) returns bytes b, mutating b changes no stored value and no later encode(v). [@R3]

    I6  A codec failure happens before any state change and carries no data value or Cause.[@R4]

    I7  Every key the Runtime writes is `actor/<identity>`, `lane/<lane>` or `owed/<identity>`, and its record decodes 
        with that kind's Schema and has `format`; no lane record has a `mayHaveApplied` field, every owed row has a
        `channel`, and each kind round-trips: decode(encode(record)) equals the record. [@R5]

coverage
    @R1
        enforced_by  [@I2]
        open_by      [@Q1, @Q2]

    @R2
        enforced_by  [@I1, @I3]
        open_by      [@Q1, @Q2]

    @R3
        enforced_by  [@I1, @I4, @I5]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I6]
        open_by      [@Q1, @Q2]

    @R5
        enforced_by  [@I7]
        open_by      [@Q1]

tests
    T1  Size: 5,000 items, depth 64 and 3,000,000 bytes encode and decode back equal. [@I2]
    T2  Malformed vectors: a BOM, invalid UTF-8, a lone surrogate, duplicate keys, unsorted keys, -0, 1.0 and 1e0 
        spellings each fail with their CodecMalformed reason. [@I4]
    T3  Round trip and hosts: a fixed vector set encodes to the same bytes on every listed host and round-trips both 
        ways. [@I1, @I3]
    T4  Mutation: mutate the input and output byte arrays after a call; stored and decoded values are unchanged. [@I5]
    T5  Schema mismatch: a valid JSON value that fails the owning Schema gives CodecSchemaMismatch with a path and no 
        data value; a turn with an unencodable value commits and reports UnencodableValue. [@I6]
    T6  Record kinds: over every Story run, every key in the store has one of the three prefixes and its record decodes 
        with that kind's Schema and re-encodes to the same value; no lane record has mayHaveApplied, and an
            author failure tagged Cancelled and a NotSent { Cancelled } decode with different channels. Planted faults: 
                a
            record keyed kept/<lane>; a lane record with mayHaveApplied; an owed row with no channel. [@I7]
