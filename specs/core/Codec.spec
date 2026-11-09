spec Codec
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/plans/flow/references/proposals/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      the structural codec (encode, decode) used by records, payloads, traces and the
              Model
derives_from  [@plan.Inspection.O2, @plan.Inspection.V3, @plan.Package.C1]

requirements
    R1  One bounded codec
        source  @plan.Inspection.O2.
        must    One codec carries every value that crosses a process or storage boundary: persisted
                records, server-rendering payloads, trace artifacts and Model bytes. It accepts JSON
                values produced by the owning Schema. A value at a bound is accepted and one past it
                rejected: depth 32, 10,000 nodes, 4,096 items per array, 262,144 UTF-8 bytes per
                string or key, 2,097,152 canonical bytes.

    R2  Canonical encoding
        source  @plan.Inspection.O2; @plan.Package.C1.
        must    Encoding is canonical: sorted keys, no whitespace, and no -0, NaN, infinity, cycle,
                lone surrogate or sparse array. Equal accepted data gives equal bytes on every host,
                using ECMAScript and Web APIs only, never Node Buffer or UTF-16 counts.

    R3  Strict decoding
        source  @plan.Inspection.O2.
        must    Decoding rejects a byte-order mark, invalid UTF-8, and any input that does not
                re-encode to exactly the same bytes (duplicate keys, unsorted keys, odd number
                spellings), then decodes with the owning Schema. Mutating an input or output byte
                array afterwards never changes a stored or decoded value.

    R4  Failures
        source  @plan.Inspection.O2.
        must    A failure is one FlowError raised before any actor, store, service or committed
                change: CodecBoundExceeded (the bound, its value and the path), CodecMalformed (one
                reason of utf8, json, nonCanonical, cycle, negativeZero, nonFinite, loneSurrogate,
                notPlain or sparse) or CodecSchemaMismatch (path and issue summary, never data
                values). No raw parser error or Cause escapes. A value with no encoded form inside a
                turn is UnencodableValue and never fails the turn.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as vectors, with a wrong codec for each check.

    Q2  The prototype codec (round-14/codec/codec.ts) has no case pinning these bounds or
        error codes.
            outcome The vectors are written from this Spec, not from the prototype.

model
    Bytes = UTF-8 canonical JSON text.

invariants
    I1  For every accepted value v: decode(encode(v)) equals v, and encode(decode(b)) equals b
        for every accepted b. [@R2, @R3]

    I2  Each bound accepts its exact value and rejects the next one. [@R1]

    I3  Equal values give equal Bytes on Node, Bun, Deno, Chromium, Gecko and WebKit. [@R2]

    I4  Bytes that are not the canonical encoding of their value are rejected. [@R3]

    I5  Decoded values share no memory with the input bytes. [@R3]

    I6  A codec failure happens before any state change and carries no data value or Cause.
        [@R4]

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

tests
    T1  Bounds: each of the five bounds at its value and one past it; the error names the
            bound, value and path. [@I2]
    T2  Malformed vectors: a BOM, invalid UTF-8, a lone surrogate, duplicate keys, unsorted
            keys, -0, 1.0 and 1e0 spellings each fail with their CodecMalformed reason. [@I4]
    T3  Round trip and hosts: a fixed vector set encodes to the same bytes on every listed host
            and round-trips both ways. [@I1, @I3]
    T4  Mutation: mutate the input and output byte arrays after a call; stored and decoded
            values are unchanged. [@I5]
    T5  Schema mismatch: a valid JSON value that fails the owning Schema gives
            CodecSchemaMismatch with a path and no data value; a turn with an unencodable value
            commits and reports UnencodableValue. [@I6]
