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
    R1  One codec, no size or depth bounds
        source  @plan.Inspection.O2; @plan.Pending.D23; @plan.Pending.D27.
        must    One codec carries every value that crosses a process or storage boundary: persisted
                records, server-rendering payloads, trace artifacts and Model bytes. It accepts
                JSON values produced by the owning Schema, of any size: how big a value may be is
                judged by the bench, and the store's quota is the one real limit on size, which
                ends as StorageRefused (@spec.WriteAhead.R13). A value of any depth is carried: every walk
                on its path (the Schema walkers of R6, the codec's writer and re-encode check)
                keeps its own stack, and decoding uses the host's JSON parser (its own stack on
                V8 and JavaScriptCore); a text a host cannot parse fails as CodecMalformed json, never a thrown error.

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
                encoded form (a malformation, or a cycle) is reported only as
                UnencodableValue (its details naming the reason) and never fails the turn (a
                commit's input or key that cannot encode is the one exception: it declines NotSent {
                Unencodable }, an ending,
                @spec.WriteLanes.R12).

                No send waits on a record that may not encode. A persisted commit is admitted only if
                its input encodes canonically; otherwise it declines NotSent { Unencodable }. An
                owed row whose value has no form is saved as its Attempt's unknown { Restored },
                reported UnencodableValue, and a Flow-made row with no value saves `null`. So a record
                fails to encode only on a malformation in its actor's own state: its memory, or its
                name, which its lane and owed records carry too; then the identity is withheld whole
                (@spec.WriteAhead.R4, I21).

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

    R6  One value boundary
        source  @plan.Inspection.O2; @plan.Pending.D27.
        must    Every value that crosses into Flow passes through walkers compiled once per Schema
                from Effect's Schema AST and kept on Compiled: memory at capture, restore and
                comparison, context selections, event payloads (E.X and send), commit inputs and
                lane keys, records at the boot, and trace text. A walker encodes to the Schema's JSON
                form, decodes, and checks the type side. It runs Effect's own parser one recursion
                level at a time: each `Schema.suspend` is a hole that reads its value's result from a
                table, and a level whose holes miss is parsed again once their values are done, from
                an explicit stack. Effect's Schema stays the one source of every rule, a value of any
                depth is walked without the call stack, and a value shared twice is walked once. A
                value whose holes all lie within a fixed budget is parsed once, directly. A value on
                its own path under one Schema (a cycle) has no form. A walker keeps each value's canonical
                text by the object it is (admitted values are immutable, @plan.Pending.D29, and a dev or
                test host deep-freezes them), so a step re-encodes
                only the fields it changed, and a selector that returns the value it returned last
                keeps its selection unwalked. Values compare structurally on an explicit stack, the
                same object at once (as `Equal` holds them; chosen on the bench, Codec T7); memory
                compares field by field. JSON text is written in one pass and trace text with its own
                stack, in the same bytes as before (R2). Decision (agent, the user's Q11 B): proposed.
                Why: guarding Effect's recursive calls one by one leaked in three reviews. Reverse:
                restore D26's limit (specs.log).

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

    I8  For every Schema and value, the walker's encode, decode and check give what Effect's parser gives (success with 
        an equal value, or failure), at any depth, without the call stack. [@R6]

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

    @R6
        enforced_by  [@I8]
        open_by      [@Q1]

tests
    T1  Size and depth: 5,000 items, 3,000,000 bytes, and 100,000 deep beside 5,000 wide encode and decode back equal; 
        in Stories, nests 100,000 deep under Schema.Json, a recursive Schema and Maps save, restore and are heard
            once, never thrown (Codec T7). [@I2]
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
    T7  Value boundary: the walkers agree with Effect's parser on the codec's fixed vectors, the fixtures' Schemas and 
        random values; in Stories, memory, selections, payloads, commit inputs and keys 3,000 and 100,000 deep
            under Schema.Json, a recursive Schema.suspend and Map nests save, restore and are heard once; the bench
            compares equality by a compiled comparator, canonical text and Effect's Equal, and records the choice. [@I8]
