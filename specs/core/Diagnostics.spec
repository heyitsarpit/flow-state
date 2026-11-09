spec Diagnostics
status        proposed
basis         A guide, and one of the two Specs most likely to change (Codec,
              Diagnostics): no prototype case pins it. Revisable whenever building shows it
              wrong; each change and its reason is recorded in spec-log.md, in
              workflow/plans/flow/references/proposals/, beside spec-split.md.
location      packages/flow-state-v3/src
provides      FlowError, Diagnostic
derives_from  [
              @plan.Diagnostics.O1, @plan.Diagnostics.O2, @plan.Diagnostics.O3,
              @plan.Diagnostics.O4, @plan.Diagnostics.D1, @plan.Diagnostics.V1,
              @plan.Diagnostics.V2, @plan.Diagnostics.V3, @plan.Diagnostics.V4,
              @plan.Diagnostics.V5
              ]

requirements
    R1  FlowError
        source  @plan.Diagnostics.O1; @plan.Diagnostics.D1.
        must    Expected invalid authoring throws FlowError; owned Effects report understood
                expected failures as FlowError in the typed error channel, keeping their success and
                service types.

                FlowError extends Error with readonly _tag "FlowError", code, diagnostics (nonempty,
                code == diagnostics[0].code), optional cause and optional evidence. Defects and
                interruption stay distinct Effect outcomes. No other public error class exists
                except the testing route's PropertyTestFailed.

    R2  Diagnostic
        source  @plan.Diagnostics.O1.
        must    Diagnostic is an Error authors can yield in Effect and encode and decode with its
                exported Schema: classification (Failure, Defect or Interruption), code, path
                (strings or finite numbers), details (string keys to string, finite number, boolean
                or null), summary and help.

                Decoding rejects invalid tags, missing fields, unknown codes and out-of-domain
                values; once a closed details.reason field's values are fixed (deferred to build
                time, @plan.Diagnostics.Q1), decoding also rejects unknown values of it.

    R3  Schema failures
        source  @plan.Diagnostics.O1.
        must    Schema rejection reports SchemaValidation with the actual issue paths and safe 
                details, unless the boundary defines a more specific code. Parser exceptions never 
                escape raw, and a callback defect is never labelled SchemaValidation.

    R4  Diagnostics are not endings or denials
        source  @plan.Diagnostics.O1.
        must    A call's ending is a value the machine maps; Flow's reasons and the evidence kinds 
                Superseded, Released, NothingToResend and InFlight are not diagnostic codes. Denial 
                codes (InvalidTurn, NotInState, LateMayNotLeave, InFlight, Uncertain, RetryLimit, 
                NothingToResend, Unencodable) are check() data, not diagnostics.

    R5  Actionable codes
        source  @plan.Diagnostics.O2.
        must    Codes identify failures independently of wording. Each diagnostic names the 
                affected field, identity or bound in path or details and gives a concrete 
                corrective action in help. Reporting an issue does not itself reject: the owning 
                boundary decides. A specific boundary code wins over a generic configuration code 
                for the same violation.

    R6  Classification
        source  @plan.Diagnostics.O2.
        must    Classification defaults to Failure. InvariantViolation, Defect, GuardDefect, 
                EntryMismatch, ServerOnlyImport, HydrateOutsideProvider and HydrationCrossRequest 
                are Defect; Interruption is Interruption. A failure during lazy adoption keeps the 
                code and classification it would have at App construction. Severity never changes 
                classification.

    R7  A closed vocabulary
        source  @plan.Diagnostics.O2.
        must    The codes are the closed list of @plan.Diagnostics.O2; a code outside it is a 
                defect in Flow. Names marked proposed there stay proposed until the user confirms 
                them.

    R8  Complete causes survive cleanup
        source  @plan.Diagnostics.O3.
        must    An in-process failure keeps its complete Effect Cause, finalizer and cancellation
                failures included. Cleanup never replaces the execution failure or erases another.
                Classification is Defect if any defect exists, else Failure if a typed failure
                exists, else Interruption. Execution or cancellation stays primary; when only
                cleanup fails, the first cleanup failure is primary; the rest keep phase order and
                multiplicity.

                Operation failure, defect, interruption and an unknown remote ending stay distinct.
                Promise adapters and Effect's own AbortSignal keep the complete Cause until the host
                projects the result, and Exit and Cause survive evidence acceptance as well as
                cleanup. A thrown exception or rejection never becomes a reusable service's typed
                failure.

    R9  Causes stay in process
        source  @plan.Diagnostics.O3.
        must    Only the in-process FlowError may expose raw Cause. Cause, stack traces and fiber 
                ids never enter snapshots, checkpoints, persistence, SSR payloads, traces, 
                inspector events or CLI output.

    R10  Safe rendering
        source  @plan.Diagnostics.O4.
        must    Rendering keeps code, path, safe details and help. Control characters in paths, 
                details, summary and help are escaped. Output never exposes raw input, stacks or 
                Cause, and never invents a file, line or column.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  The prototype has no FlowError or Diagnostic codec; no test here has a prototype reference.
        outcome  Phase 3 writes every case and wrong runtime from this Spec.

model
    Primary = diagnostics[0], the failure that names the boundary.

    Leaving = any value written to a snapshot, checkpoint, record, payload, trace, sink event or 
        CLI output.

invariants
    I1  Every FlowError has nonempty diagnostics and code == diagnostics[0].code. [@R1]

    I2  decode(encode(d)) equals d for every valid Diagnostic, and decode rejects every value outside R2's domains. 
        [@R2]

    I3  SchemaValidation is reported only for a Schema rejection. [@R3]

    I4  No Flow reason, evidence kind or denial code is ever a Diagnostic code. [@R4]

    I5  Every emitted code is in the closed list, and every Diagnostic has nonempty help. [@R5, @R7]

    I6  The classification of a code is the one R6 assigns, whatever phase raised it. [@R6]

    I7  The classification of a failure is Defect iff its Cause has a defect, else Failure iff it has a typed failure, 
        else Interruption. [@R8]

    I8  Cleanup failures are appended after the execution failure, never ahead of it, in phase order. [@R8]

    I9  No Leaving value contains a Cause, stack trace or fiber id. [@R9]

    I10  Rendered text contains no raw control character and no location not present in the Diagnostic. [@R10]

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1, @Q2]

    @R2
        enforced_by  [@I2]
        open_by      [@Q1, @Q2]

    @R3
        enforced_by  [@I3]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I4]
        open_by      [@Q1, @Q2]

    @R5
        enforced_by  [@I5]
        open_by      [@Q1, @Q2]

    @R6
        enforced_by  [@I6]
        open_by      [@Q1, @Q2]

    @R7
        enforced_by  [@I5]
        open_by      [@Q1, @Q2]

    @R8
        enforced_by  [@I7, @I8]
        open_by      [@Q1, @Q2]

    @R9
        enforced_by  [@I9]
        open_by      [@Q1, @Q2]

    @R10
        enforced_by  [@I10]
        open_by      [@Q1, @Q2]

tests
    T1  Carrier and codec: every code in the vocabulary round-trips through the Diagnostic Schema; invalid tags, 
        unknown codes and non-finite numbers are rejected; closed reason values are tested once build time fixes them. 
        Wrong runtime to write: a decoder that accepts an unknown code. [@I1, @I2]
    T2  Boundaries: a Schema rejection gives SchemaValidation with the issue path; a throwing callback gives Defect, 
        never SchemaValidation; a specific code beats a generic one. [@I3, @I5, @I6]
    T3  Endings and denials: run the reference scenarios and collect every emitted Diagnostic; none has a Flow reason, 
        evidence kind or denial code as its code. [@I4]
    T4  Mixed causes: a failing execution plus two failing finalizers keeps the execution primary and both cleanup 
        failures in order; only-cleanup failure makes the first cleanup failure primary; classification follows I7; a 
        Promise adapter's rejection and an AbortSignal abort keep their full Cause through evidence acceptance and 
        cleanup. [@I7, @I8]
    T5  No leaks: plant a sentinel string in a thrown error's message and stack; it appears in no snapshot, record, 
        trace or CLI output, only in the in-process FlowError. [@I9]
    T6  Rendering: hostile names with escape sequences render escaped; a Diagnostic without a
            location renders none. [@I10]
