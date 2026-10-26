# Diagnostics provenance ledger

Provenance only; @plan Diagnostics is the authority.

Source: ../split-work/inventories/inv-diag-cli-delivery.md. DC = DiagnosticsContract,
CL = CommandLine, PD = ProjectDelivery, under workflow/plans/archive/rewrite/.
Inventory row numbers distinguish repeated archived refs and preserve source table order.
ProjectDelivery entries are handoffs to FlowState; this assignment does not edit that plan.

- DC O1 (inventory row 1) — Diagnostic is the only package-owned expected-failure value — CHANGED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1 (inventory row 2) — Diagnostic is a real Error, directly yieldable, Schema.TaggedError codec — KEPT — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1 (inventory row 3) — Schema identity flow-state/Diagnostic — DROPPED — Codec identity spelling is private; O1 retains the single Schema.TaggedError codec.
- DC O1 (inventory row 4) — Classification is exactly Failure, Defect or Interruption — KEPT — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1 (inventory row 5) — Fields classification, code, path, details, summary, help — KEPT — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1 (inventory row 6) — path is (string or finite number)[]; details is a record of string, finite number, boolean or null; non-finite numbers reject — RESTORED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1 (inventory row 7) — Public aliases DiagnosticPath, FlowPath, DiagnosticScalar, DiagnosticDetails, DiagnosticClassification, DiagnosticDocument, DiagnosticProjection — DROPPED — Public aliases deleted; O1 derives serialized data from the existing codec.
- DC O1 (inventory row 8) — Serialized document derives from the Diagnostic codec; no second projection model; unknown codes reject on decode — RESTORED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O1, O5 (inventory row 9) — FlowUsageCode is a closed set of exactly 19 codes — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O1, O5 (inventory row 10) — InvalidMachineConfigurationReason is a closed set; path/details name real fields and tokens — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O2 (inventory row 11) — Structural decoding returns Result<A, Diagnostic> without running an Effect — CHANGED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O2 (inventory row 12) — Only SchemaError is translated at the decode boundary, with issue paths and safe details; no raw parser exception escapes — RESTORED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O2 (inventory row 13) — Decode once; compilation consumes the decoded value — DROPPED — Private decode/compilation mechanism is not prescribed.
- DC O2 (inventory row 14) — Expected invalid configuration is data, never a generic thrown Error — CHANGED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O2 (inventory row 15) — Owner maps typed failures E to Diagnostic preserving A and R; defects and interruption stay outside E — RESTORED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O2 (inventory row 16) — Keep complete Exit and Cause until cleanup and evidence aggregation finish; Fail, Die, Interrupt stay distinguishable — RESTORED — @plan.Diagnostics.O3; complete Cause, classification precedence and ordered cleanup diagnostics.
- DC O2 (inventory row 17) — Classification precedence: defect, then typed failure, then interruption-only — RESTORED — @plan.Diagnostics.O3; complete Cause, classification precedence and ordered cleanup diagnostics.
- DC O2 (inventory row 18) — Do not squash Cause before an intentionally lossy sync host boundary; no throw or Promise rejection becomes a reusable service failure channel — RESTORED — @plan.Diagnostics.O3; complete Cause, classification precedence and ordered cleanup diagnostics.
- DC O2 (inventory row 19) — Foreign Promise rejection and AbortSignal forwarding map to the same Diagnostic and preserve Cause (ReactAndHosts O4) — CHANGED — @plan.Diagnostics.O3; complete Cause, classification precedence and ordered cleanup diagnostics.
- DC O2 (inventory row 20) — Helper names and private layouts are not consumer contracts — DROPPED — Private helper names/layouts remain implementation choices.
- DC O3 (inventory row 21) — Only a Failure diagnostic with a usage code becomes FlowUsageError at the sync boundary — CHANGED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O3 (inventory row 22) — FlowUsageError exact shape: _tag, code, path, details, constructor — RESTORED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O3 (inventory row 23) — UsageDiagnostic narrowing notation — DROPPED — UsageDiagnostic notation adds no behavior or public export.
- DC O3 (inventory row 24) — FlowPersistenceError kept as a compatibility-only terminal Error — DROPPED — O1/D1 replace the compatibility-only terminal class with FlowError.
- DC O3 (inventory row 25) — Consumers branch on _tag/code/path/details; human text may change and is never parsed — KEPT — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O3 (inventory row 26) — No public cause member; raw Cause serialized nowhere; only two host errors keep Cause in process — CHANGED — @plan.Diagnostics.O1; one FlowError, exact canonical schema/host fields and typed mappings.
- DC O3 (inventory row 27) — Route availability follows PackageContract; deferred root names stay absent — CHANGED — → Package O1/O3; current root route exports FlowError/Diagnostic, old deferral is superseded.
- DC O4 (inventory row 28) — Shared rendering receives Diagnostic only; formatting kept apart from schema; no rendering service or route — KEPT — @plan.Diagnostics.O4; safe rendering separated from the one schema.
- DC O4 (inventory row 29) — Text shape `error[Code] at path: summary` then `help:` — DROPPED — O4 retains safe help, not a fixed sentence template.
- DC O4 (inventory row 30) — Escape path and details; never invent file, line or column; ANSI, stacks, raw input and raw Cause are excluded from renderer input — RESTORED — @plan.Diagnostics.O4; safe rendering separated from the one schema.
- DC O5 (inventory row 31) — Human summaries/help never add a code or reason — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O5 (inventory row 32) — Usage codes that still name a live concept: InvalidCanonicalValue, ForeignActorRef, MismatchedActorRef, DisposedActorRef, RuntimeNotReady, RuntimeDisposed, MissingContextProvider, ContextDependencyCycle, DuplicateActorClaim, UnadmittedMachine, AdmissionOverloaded — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O5 (inventory row 33) — ActorNotActive (work sent to a non-active actor) — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O5 (inventory row 34) — MissingActorRef, WrongOperationKind, InvalidOperationPlan, OperationNotPending, OperationAlreadySettled — DROPPED — O2 removes obsolete usage concepts; idle cancel is a no-op.
- DC O5, O6 (inventory row 35) — DuplicateStreamDeclaration: two declarations in one actor for the same descriptor and canonical key collide, even in distinct slots — CHANGED — @plan.Diagnostics.O2/V3 → Operations O4; distinct slots open independent sessions; old collision code retired.
- DC O5, O6 (inventory row 36) — BlockedByDependents: disposing a provider with active dependents is rejected; consumer bindings cannot be rebound — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O5 (inventory row 37) — Non-usage codes still live: InvalidMachineConfiguration, SchemaValidation, SemanticValidation, InvalidDescriptorId, DuplicateDescriptorId, DuplicateMachineValue, InvalidStateDefault, InvalidTraceRecord, ArtifactIdentityMismatch, BoundExceeded, StorageFailure, CodecFailure, IdentityVersionMismatch, MalformedData, ConcurrentCapture, NonDurableContextProvider, CleanupFailed, IoFailure, InvariantViolation, Defect, Interruption — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O5 (inventory row 38) — DuplicateModuleOwnership, MissingModuleReference — DROPPED — Module concepts deleted; lazy entries use EntryMismatch/EntryLoadFailed.
- DC O5 (inventory row 39) — UnresolvedRequirementId, InvalidStoryMetadata, InvalidLifecycleTransition, InvalidStoryEvidence — DROPPED — Names deleted; O2 maps retained id checks to StoryConfigInvalid and trace lifecycle/Story evidence conditions to InvalidTraceRecord.
- DC O5 (inventory row 40) — WrongArtifactKind, DecompressionFailed — DROPPED — Compression/share kinds deleted; current import schema rejects unsupported data.
- DC O5 (inventory row 41) — EvidenceUnavailable and UnknownSelector are not codes; they project as Failure/InvalidArtifactOperand with details.reason — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O6 (inventory row 42) — Every usage code has meaning, example path/details, message and corrective action — KEPT — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O6 (inventory row 43) — RuntimeNotReady remediation: await the only readiness Effect runtime.ready() — KEPT — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O6 (inventory row 44) — AdmissionOverloaded: new work over a finite bound is rejected and changes nothing; accepted work keeps FIFO settlement — KEPT — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC O6 (inventory row 45) — AdmissionOverloaded also bounds serialized finite work and rejects the whole new batch before any occurrence, preview or adapter call — RESTORED — @plan.Diagnostics.O2; regenerated closed codes/reasons and actionable owner-specific remediation.
- DC D1 (inventory row 46) — One diagnostic model; capability owners decide when, this owner the shape — KEPT — @plan.Diagnostics.D1/D4 and C2; one model; capability owners choose occurrence.
- DC D2 (inventory row 47) — Classify only after complete aggregation; serialized output carries ordered diagnostics, not Cause trees or fiber ids; cleanup diagnostics keep order and multiplicity — RESTORED — @plan.Diagnostics.O3; complete Cause, classification precedence and ordered cleanup diagnostics.
- DC D3 (inventory row 48) — ConcurrentCapture is the canonical retryable capture-conflict code; ConcurrentDehydrate is not an alias — KEPT — @plan.Diagnostics.D3; ConcurrentCapture only, no ConcurrentDehydrate alias.
- DC C1 (inventory row 49) — No second error/execution framework: no feature TaggedError carriers, diagnostic service, Layer, Logger, runner, second codec — KEPT — @plan.Diagnostics.D1/D4 and C2; one model; capability owners choose occurrence.
- DC C2 (inventory row 50) — FlowPath, FlowUsageCode, FlowUsageError, FlowPersistenceError stay off the root until restored — DROPPED — Old names are deleted, not deferred pending restoration.
- DC C3 (inventory row 51) — Evidence status stays honest (every check PLANNED) — KEPT — @plan.Diagnostics.C1 and verification; no product completion claimed.
- DC V1 (inventory row 52) — Decode every code/reason/classification through the production schema; reject unknown codes, non-finite numbers, wrong tags, missing fields — RESTORED — @plan.Diagnostics.V1; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.
- DC V2 (inventory row 53) — Prove A/R preserved, defects outside E, precedence over mixed Fail/Die/Interrupt including cleanup defects — RESTORED — @plan.Diagnostics.V2; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.
- DC V3 (inventory row 54) — Trigger every usage code through its production owner and match its remediation row; no message parsing, no new code — RESTORED — @plan.Diagnostics.V3; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.
- DC V3 (inventory row 55) — Blocked provider disposal with active dependents; duplicate stream in distinct slots; overload keeps accepted FIFO work — CHANGED — @plan.Diagnostics.V3; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.
- DC V4 (inventory row 56) — Only named host errors retain Cause; snapshots, selectors, artifacts and CLI expose none — RESTORED — @plan.Diagnostics.V4; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.
- DC V5 (inventory row 57) — Renderer test with hostile control text, every classification, no invented location, no raw input or stack — RESTORED — @plan.Diagnostics.V5; exhaustive schema/owner/Cause/remediation/containment/renderer proofs, as applicable.

Disposition counts: KEPT 12, CHANGED 9, RESTORED 24, DROPPED 12.

## Vocabulary reconciliation

- The diagnostics inventory drops InvalidLifecycleTransition/InvalidStoryEvidence while the
  inspection inventory restores their rejection cases. Diagnostics O2 retains the conditions under
  InvalidTraceRecord with lifecycle/storyEvidence reasons, without restoring the retired names.
- Ruling 38 excludes six coordination-only codes from the deferred multi-tab design. StoryTabUnknown
  stays active for independent tab/lock-refusal test hosts; no mirror or leader behavior is implied.
- `workflow check --json` reports Diagnostics' fixed ID colliding with the untouched archived
  Diagnostics plan. Resolving archive IDs is outside the four-file assignment.
