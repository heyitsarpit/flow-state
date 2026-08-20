# Preservation and API-drift audit

Date: 2026-08-19

Scope: frozen package at /Users/arpit/Developer/flow-state/packages/flow-state/ and greenfield replacement at /Users/arpit/Developer/flow-state/packages/flow-state-rewrite/

Primary decision: contract sufficiency for implementing and proving the replacement

Allowed change: this report only

## Executive decision

The current contract pack is strong on semantic intent and deletion boundaries, but it is not yet a complete implementation handoff for every public route. The greenfield implementation can begin with the static definition/machine foundation and the closed actor/ref model. It should not invent the runtime factory, fixture/control gateway, application decoder, inspection signatures, or operation-controlled-observation types while those boundaries remain underspecified.

The governing distinction is:

- PUBLIC_API.md, the accepted revisions, and the normative contracts define the target. They are the only sources that can require vNext behavior.
- The frozen package is useful evidence for ergonomics, Effect integration, cleanup pressure, package routes, and proof shape. It is not a compatibility requirement.
- Old tests, examples, generated artifacts, phase receipts, tasks/, and phase-0/ material cannot close a current contract gap. They must not silently become authority.

Recommended minimum before broad implementation:

- Resolve the 11 contract gaps in Section 1, prioritizing CS-01 through CS-08; assign CS-09 through CS-11 to named evidence and cutover owners with bounded decision records.
- Build 7 named source-faithful examples, 4 compile-proof modules, and 10 runtime scenario groups. These are evidence slices, not a coverage target; every proof must name its owner and invariant.
- Keep the frozen package unchanged. Copy only isolated, contract-mapped pure code or infrastructure after the receiving contract owner and proof are identified.

## Authority and evidence boundary

The audit used the following current authority files. Accepted revisions override a directly conflicting untouched contract; silence is not deletion; examples and historical provenance do not add semantics.

Normative contract authority:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/ARCHITECTURE.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/CLI.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/COMPATIBILITY_AND_DELETIONS.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/GLOSSARY_AND_IDENTITY.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PROOF_MATRIX.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/REACT_AND_HOSTS.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/SEMANTICS.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/SNAPSHOTS.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TESTING.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TYPE_SYSTEM.md

Accepted revision authority:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/01-composition-and-app-plans.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/02-machine-authoring.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/03-operations.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/04-react-and-hosts.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/05-stories-and-testing.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/06-migration-and-proofs.md
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/07-deletions-and-cutover.md

Workflow authority at the time of this audit (superseded; the former root workflow documents were later
integrated into `contracts/IMPLEMENTATION_WORKFLOW.md` or removed):
- /Users/arpit/Developer/flow-state/AGENTS.md

The deleted /Users/arpit/Developer/flow-state/reference/incident-console/implementation/tasks/, /Users/arpit/Developer/flow-state/reference/incident-console/implementation/receipts/, and /Users/arpit/Developer/flow-state/reference/incident-console/implementation/phase-0/ material was not used as current authority.

## 1. Contract sufficiency: decisions required before implementation

This is the primary section. A gap is recorded when an implementer must choose a public shape, ownership rule, failure envelope, or proof boundary that the current normative material does not determine. The proposed boundary is a question for the lead, not a chosen answer.

### CS-01 — RuntimeFactory<App> and runtime discovery are named but not shaped

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:517-557, API-012.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:581-606, API-013.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TYPE_SYSTEM.md:295-323, TYPE-010.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:85-99, WIRE-004.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/05-stories-and-testing.md:24-94, REV-TEST-001.

Missing decision: the contracts require story.app(runtimeFactory, options?), say discovery is synchronous and inert, and show runtime({ app, boot? }) or runtime({ app, layer, boot? }). They do not define the exact RuntimeFactory<App> value shape, whether it is a function or object, how app identity and initial actor claims are represented, the exact synchronous discovery result, or the exact return/error type of runtime construction. They also do not define the withRequestRuntime factory handoff.

Why this forces a guess: an implementer must decide where boot, Clock, external capabilities, initial ensureActor calls, and Layer belong. A function returning a discovery record, a callable factory, and a config object all satisfy the prose while producing different public inference and lifecycle ownership.

Affected owner/API/behavior/proof: runtime bootstrap owner; runtime, story.app, withRequestRuntime, FlowProvider, boot validation, actor admission, readiness, and disposal. This blocks TYPE-010, TYPE-011, ARCH-007A, ARCH-008, ARCH-018, REV-COMP-015, REV-MIG-003, PROOF-002, PROOF-004, PROOF-014, and live Story parity in REV-TEST-010.

Frozen evidence: the old public runtime is a layer factory at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:731-733. Its returned shape exposes ManagedRuntime, mutable resources, orchestrators, boot methods, and disposal at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:140-165. This is useful pressure evidence but is incompatible with API-012 and DEL-010.

Decision boundary: define the exact public RuntimeFactory<App> input/output and runtime construction signature, including inert discovery data, acquisition timing, request/SSR ownership, and disposal. Do not copy the old FlowRuntime shape.

### CS-02 — Public descriptor-to-runtime operation types are still schematic

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:246-285, API-005.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:287-329, API-006.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/03-operations.md:36-85, REV-OPS-001.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/03-operations.md:221-375, REV-OPS-005.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/03-operations.md:1018-1076, REV-OPS-017.

Missing decision: API-006 explicitly labels FiniteResourceOptions, ResourceSubscriptionOptions, CommitOptions, StreamSubscriptionOptions, FiniteOperationPlan, ContinuingOperationPlan, CacheWritePlan, CancellationPlan, and StateShapeNotYetAccepted as schematic documentation sentinels. The contracts define the laws and inferred state unions, but not the exact public authoring signatures for options, plan payloads, requirement propagation, cancellation return values, or family-specific outcome-mapper generic order.

Why this forces a guess: several incompatible choices satisfy the prose. Options may carry only signal or also operation metadata; writes may return one plan or a readonly tuple; lookup may return an Effect directly or a descriptor-owned adapter record; continuing work may be declared through subscribe or only through activities. The examples show intent, not the complete type boundary.

Affected owner/API/behavior/proof: descriptor factories and the machine callback O catalogue; resource, transaction, stream, onMemory, activities, finite admission, continuing ownership, and exact A/E/R inference. This blocks TYPE-005 through TYPE-008, TYPE-012, API-P02, PROOF-005 through PROOF-007, and the named operation examples.

Frozen evidence: resources use id/key/lookup/schema/tags/placeholder/freshness at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:88-102; streams have route-bearing overloads at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:521-688; transactions are inferred from old transition/invoke configuration at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:283-372. These shapes include deleted routes and cannot be selected by inference.

Decision boundary: specify one exact authoring grammar for each descriptor and one exact internal plan representation, including option fields, callback arguments, return values, requirement variance, and mapper restrictions. Preserve P/K and named-family semantics; do not preserve old overloads merely because they typecheck.

### CS-03 — Controlled simulate input is behaviorally closed but not publicly type-shaped

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:608-640, API-014.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TESTING.md:361-414, REV-TEST-007.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/05-stories-and-testing.md:373-429, REV-TEST-007 and REV-TEST-008.

Missing decision: simulate accepts operationPlan and observation, but the contract does not define the public type of an operation plan, how the Story author obtains it, or the exact typed mapping from a resource/transaction/stream descriptor to allowed observation variants. ObservationShape is explicitly local explanatory notation, not an exported universal type.

Why this forces a guess: a Story author needs a source-faithful call that can name the operation, P/K, occurrence, and result. Without the plan shape, an implementer may expose a generic object, descriptor method, or inferred callback. Without the observation mapping, a resource could incorrectly accept stream emission or a transaction could accept completion.

Affected owner/API/behavior/proof: testing command interpreter and production external-execution boundary; simulate, occurrence validation, generation fencing, completion classification, and failure diagnostics. This blocks REV-TEST-007, SEM-030, PROOF-007, PROOF-009, PROOF-010, and negative proofs for foreign, settled, suspended, and wrong-kind occurrences.

Frozen evidence: old tests use separate perform, deliver, and receive paths, and the old testing exports include runFlowScenario and mutable scenario evidence at /Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:8-12. This proves why a single production interception point is needed; it does not answer the new plan shape.

Decision boundary: define whether a public Story author obtains a typed plan from the named O family, a Story control value, or another exact constructor, and define family-specific observations without exposing a generic operation registry.

### CS-04 — Fixture, control, and behavior-gateway constructors lack complete shapes

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:686-720, API-015.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:743-753, API-017.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TESTING.md:19-94, REV-TEST-001.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TESTING.md:472-490, REV-TEST-010.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/CLI.md:69-97, CLI-003 and CLI-004.

Missing decision: the route exports behavior, control, and fixture, and the CLI requires a branded BehaviorGateway produced by behavior({ stories }). The contracts do not state the exact fixture value shape, Layer/requirement closure type, control registration and lookup shape, behavior argument and return shape, Story external-ID registration rules, or how one gateway exposes the compiled App and Story records without exposing the private decoded model.

Why this forces a guess: implementers must choose whether fixtures are Effects, Layers, records, or branded descriptors; whether controls are keyed by operation identity or occurrence; and whether behavior accepts a list, record, or app-bound registry. These choices affect TypeScript inference and the trusted CLI loader.

Affected owner/API/behavior/proof: testing route, fixture compiler, control interception, gateway loader, behavior artifact builder, and Story registry. This blocks TYPE-016, PROOF-008, PROOF-009, PROOF-014, CLI-P01, CLI-P02, WIRE-020A, and the source-faithful CLI example.

Frozen evidence: the old testing route exports test, flowTest, runFlowScenario, createScenarioEvidence, and many scenario types at /Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:1-56; the old CLI imports those scenario APIs at /Users/arpit/Developer/flow-state/packages/flow-state/src/cli/index.ts:26-72. DEL-009 and DEL-010 explicitly delete those surfaces.

Decision boundary: define the branded gateway construction call, fixture/control values, typed Story registry, and ownership between registration, behavior compilation, and CLI loading. Keep the decoded artifact model private as required by WIRE-020B.

### CS-05 — Application-owned domain decoding is deliberately left open

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:62-81, WIRE-003.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:517-530, API-012.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/01-composition-and-app-plans.md:297-336, REV-COMP-005.

Missing decision: decodeRuntimeBoot(App, unknown, { decodeDomain }) must be synchronous, but the contract explicitly does not define the locator union, callback mechanics, application envelope, normalized return shape, or diagnostic shape.

Why this forces a guess: the decoder must identify whether an opaque value is actor memory, resource value, transaction value/error, stream value, or another domain slot. Different locators produce different application code and persistence compatibility. A generic value-to-unknown callback erases the boundary WIRE-003 protects.

Affected owner/API/behavior/proof: boot codec and application/runtime boundary; decodeRuntimeBoot, RuntimeBootPayload<App>, dehydrate, hydration, domain validation, and failure reporting. This blocks WIRE-003 through WIRE-005, PROOF-014, CUT-P05, and the persistence example.

Frozen evidence: the old boot surface is mutable and v1-shaped at /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:69-106, with hydrateBoot and broad resource/actor payloads. It demonstrates the need for a new app-branded boundary but supplies no accepted domain locator.

Decision boundary: define the domain-slot locator union, decoder callback input/output, synchronous error envelope, and boundary between Flow structural validation and application normalization. Do not reintroduce mutable hydrateBoot.

### CS-06 — Request/SSR host ownership is named but not callable

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:517-580, API-012.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/REACT_AND_HOSTS.md, HOST-001 through HOST-P05.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:46-54, API-001.

Missing decision: the target route retains withRequestRuntime, and host contracts define prepared/active/suspended/disposed behavior, but they do not give the exact server function signature, request-scoped input, returned result, error propagation, or whether the host owns a runtime lease, promise, or response wrapper. SSR command-buffer limits and prepared escape rules are behavioral, not a complete call shape.

Why this forces a guess: a server adapter can return a runtime, an async callback result, or a request wrapper while claiming to use one runtime. Each choice changes disposal timing and whether a prepared actor can escape before commit.

Affected owner/API/behavior/proof: server adapter, FlowProvider, useActor, useActorByRef, SSR/request disposal, and browser host parity. This blocks HOST-P01 through HOST-P05, REV-HOST-002 through REV-HOST-005, ARCH-024, and PROOF-012 through PROOF-014.

Frozen evidence: the old React implementation creates a render-time inert shell at /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:20-58, then attaches/swaps in an effect at /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:86-207. The accepted target replaces this with one final prepared actor.

Decision boundary: specify the server/request adapter call and ownership result, including disposal timing and which prepared values may cross SSR boundaries. Preserve lifecycle laws, not shell-and-swap.

### CS-07 — Inspect route signatures and projection ownership are not fully enumerated

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:724-741, API-016.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:274-335, WIRE-017 through WIRE-019.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:343-418, WIRE-020A through WIRE-020B.

Missing decision: the target inspect route lists named functions, but the public API does not specify exact argument/result shapes for buildBehaviorContract, analyzeTrace, importTraceArtifact, exportTraceArtifact, diffTrace, attachInspectionSink, or formatting projections. WIRE-020B defines exact package-private envelopes and explicitly says aliases are not exported.

Why this forces a guess: implementation must decide which immutable projection each function returns, malformed-input behavior, compression carrier, and truncation propagation. A private schema does not provide a stable public call shape or compile fixture.

Affected owner/API/behavior/proof: inspection route, TurnRecord hub, bounded sinks, artifact codecs, trace/behavior projections, and CLI. This blocks API-P01, API-P03, PROOF-013, PROOF-014, CLI-004, CLI-005, CLI-007, and packed-consumer proofs.

Frozen evidence: the old inspect route exports captureTrace, createLocalInspectionProof, flowStories, inspectActions, and storyToDoc at /Users/arpit/Developer/flow-state/packages/flow-state/src/inspect.ts:1-179; the old CLI consumes old trace and Story schemas. The deletion ledger requires replacement, not aliases.

Decision boundary: publish exact inspect signatures and projections while keeping TurnRecords and the decoded v2 model private. Define whether each import/export function accepts canonical text, bytes, or a file-neutral carrier, and which package error boundary it uses.

### CS-08 — Public error and diagnostic envelopes are named but not field-complete

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:91-113, API-002.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:576-579, API-012.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TESTING.md:344-359, REV-TEST-006.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:409-418 and 1007-1032, WIRE-020B and WIRE-021 through WIRE-023.

Missing decision: the contracts name FlowBootDecodeError, FlowDehydrateError, FlowDisposeError, and FlowStoryExecutionError, and define some cleanup and Story failure fields. They do not give one complete public field table, stable diagnostic-code union, CauseProjection boundary, or field-presence rule for every negative path: foreign refs, invalid K, graph errors, duplicate declarations, wrong-kind simulation, CLI usage, and host lifecycle failures.

Why this forces a guess: tests can assert only _tag, a stable code/path, or the entire envelope. If the code/path is not closed, implementers will expose accidental Effect/parser details or write weak tests that allow drift.

Affected owner/API/behavior/proof: every production owner and negative compile/runtime/boundary proof; especially TYPE-P02, PROOF-002, PROOF-004, PROOF-005, PROOF-007, PROOF-010, CLI-009, and REV-MIG-005.

Frozen evidence: old snapshots and testing types expose broad FlowIssue, FlowReceipt, scenario status, and raw diagnostic structures through /Users/arpit/Developer/flow-state/packages/flow-state/src/index.ts:42-116 and /Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:14-56. Those are precisely the public diagnostic types the target deletes.

Decision boundary: decide stable public tags, codes, paths, and immutable fields, which facts remain private evidence, and where raw Cause.Cause<unknown> is legal. Do not solve this by exporting old receipts or the diagnostic hierarchy.

### CS-09 — CLI gateway registration is not source-faithful enough to implement

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/CLI.md:27-58, CLI-001.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/CLI.md:69-119, CLI-003 and CLI-004.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:743-753, API-017.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/06-migration-and-proofs.md, REV-MIG-005 and REV-MIG-006.

Missing decision: the CLI grammar, gateway file rules, brand requirement, and artifact version are closed, but the source-level gateway export is not. The contract does not say how a project declares its app, modules, Stories, and external IDs in BehaviorGateway, nor whether behavior({ stories }) takes an app directly, a record, or a factory.

Why this forces a guess: a source-faithful CLI example must export a value the loader can validate before touching the compiled registry. A permissive structural record violates CLI-003; a hidden brand cannot be authored without a specified constructor.

Affected owner/API/behavior/proof: CLI loader, behavior testing export, app plan compilation, Story listing/describing/running, and behavior build/check. This blocks CLI-P01, CLI-P02, PROOF-014, CUT-P06, and the CLI acceptance example.

Frozen evidence: the old CLI has an optional gateway flag and old story-path command at /Users/arpit/Developer/flow-state/packages/flow-state/src/cli/index.ts:74-99 and 851-940. The target requires a mandatory named gateway for gateway-loading commands and deletes story paths.

Decision boundary: specify the consumer-authored gateway expression, exact Story ID/app/module ownership records, and compile-time/package-identity checks before loading. Preserve the shared executor and artifact decoder, not the old parser or registry.

### CS-10 — Public persistence and artifact codec call shapes remain private

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:9-13, schema authority/private-model boundary.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:343-418, WIRE-020A through WIRE-020B.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:56-85, inspect route exports.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/06-migration-and-proofs.md, REV-MIG-005.

Missing decision: the exact v2 wire envelopes are private, but public inspect and runtime surfaces still need stable carriers for decodeRuntimeBoot, dehydrate, trace import/export, compression, and artifact diff. The contracts do not state which public values are accepted at each boundary or whether callers receive branded immutable values, canonical strings, byte arrays, or opaque handles.

Why this forces a guess: implementing the private schema without choosing the public carrier can create duplicate codecs at route boundaries or accidentally export package-private aliases. It prevents a packed consumer from proving that a decoded value cannot be passed to the wrong app.

Affected owner/API/behavior/proof: persistence codecs, inspect route, CLI artifact path, app branding, hydration, and packed-consumer declarations. This blocks API-P01, PROOF-014, CUT-P04, CUT-P05, and WIRE-014 through WIRE-020B acceptance.

Frozen evidence: the old package exposes FlowRuntimeBootPayload, mutable hydrateBoot, and old trace types through /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:69-106 and /Users/arpit/Developer/flow-state/packages/flow-state/src/index.ts:80-102. Those must not be carried forward, but replacement carriers must be specified before deletion.

Decision boundary: define the public carrier at each runtime/inspect/CLI boundary and its branding/error behavior while keeping v2 decoded data and wire aliases private.

### CS-11 — Current example evidence cannot prove the intended consumer contract

Exact contract location:

- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PROOF_MATRIX.md:458-508, API/CLI/type crosswalk and gates.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:757-775, API-P01 through API-P03.
- /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/COMPATIBILITY_AND_DELETIONS.md:115-152, CUT-P01 through CUT-P06.

Missing decision/evidence: package scripts refer to maintained examples, but the current worktree has no /Users/arpit/Developer/flow-state/examples/ directory or tracked example files, and no current-worktree Todo example was discoverable. The old root script assumes six examples at /Users/arpit/Developer/flow-state/packages/flow-state/scripts/check-example-cli-acceptance.mjs:17-24.

Why this forces a guess: the contract calls for source-faithful consumer and CLI proofs, but no current example source fixes how a user imports routes, constructs a gateway, closes requirements, or runs a Story. Recreating one from the old script would silently choose the deleted v1 surface.

Affected owner/API/behavior/proof: package routes, examples, packed consumers, CLI gateway, final proving apps, and browser host proof. This blocks PROOF-016, PROOF-017, API-P01, CLI-P01, and root verify even though the contract IDs exist.

Frozen evidence: /Users/arpit/Developer/flow-state/packages/flow-state/package.json:59-72 contains old build/type/vNext/packed-consumer gates; /Users/arpit/Developer/flow-state/package.json:11-31 refers to workspace examples. These are tooling evidence, not proof that target examples exist.

Decision boundary: name the authoritative vNext consumer examples and restore or provide only their target source after public gateway/runtime shapes are closed. Do not infer or modify Todo as part of this audit.

## 2. Areas sufficiently closed to proceed with source-faithful examples

These areas have enough current authority for an implementer to proceed once the gaps above are assigned. They are anchors, not invitations to add legacy conveniences.

| Area | Current decision | Authority | Drift warning |
|---|---|---|---|
| Definition | definition({ id, states, events, context?, operations?, memory? }); one definition owns static inference; input is consumed once by memory. | API-003; TYPE-001 through TYPE-003; REV-COMP-009 through REV-COMP-010. | Do not add a second schema or setup/provide layer. |
| Machine grammar | machine(definition, callback); recursive default/states; maximum depth 10; exact leaf tokens; no final/child/Boolean reentry. | API-004; REV-MACH-001 through REV-MACH-011; DEL-002 and DEL-005. | Do not copy old initial, final, onDone, invoke, entry, exit, submit, or Boolean reenter. |
| App plan | Named module records flatten into closed App.M; compilation creates no actor and admits no dynamic machine family. | API-010; REV-COMP-006 through REV-COMP-008; DEL-003. | Old array inventories and dynamicMachines are deleted. |
| Refs and leases | actorRef(machine,id), ensureActor, getActor, fresh opaque createActor; only owner leases dispose. | API-011; REV-COMP-011 through REV-COMP-014; DEL-003 and DEL-004. | Do not put dispose on ordinary handles or refs. |
| Passive operation reads | key, getData, getState are passive; P is executable input and K is canonical identity; state unions are exact and inferred. | API-005 and API-006; REV-OPS-002 through REV-OPS-005 and REV-OPS-016 through REV-OPS-017. | Do not reconstruct P from K or expose a generic registry/ref API. |
| React observation | useActor is command-only, useActorByRef is lookup-only, useView(actor, selector) is the ordinary reactive path with shared equality. | API-012; REV-HOST-001 through REV-HOST-008; DEL-001, DEL-007, and DEL-008. | Do not preserve registered views, useResource, or comparators. |
| Story command boundary | process, explicit clock movement, exact send, exact simulate, checkpoint, run; machine Stories are one fresh actor; app Stories use exact targets. | API-013 through API-015; REV-TEST-001 through REV-TEST-010. | Do not alias flush, settle, perform, deliver, receive, final, or mutable scenarios. |
| Runtime ownership | One production runtime, one actor mailbox, one StoreKernel/StoreFanout path, live/Story parity, explicit disposal and evidence ordering. | ARCH-007 through ARCH-032; SEM-001 through SEM-030; REV-TEST-010. | Do not create a testing runtime, second history, or CLI interpreter. |
| Artifacts/CLI | v2 behavior/trace model is package-private and shared; CLI has ten exact leaf commands and one bounded artifact path. | WIRE-020A through WIRE-024; CLI-001 through CLI-012; REV-MIG-005. | Do not keep old story paths, finalState, children, v1 envelopes, or a CLI-only decoder. |

## 3. Secondary preservation and cutover principles

### Retain as useful product behavior

- Synchronous actor.send(event): void into one actor-owned mailbox, with completion/evidence handled at the production boundary. This is retained by RET-002, CUT-006, SEM-001, and SEM-006; the old fluent handle and receipt shape are not retained.
- Descriptor-local A/E/R inference and separation between passive reads, executable P, and canonical K. This is retained by RET-003, RET-004, API-005 through API-009, and REV-OPS-001 through REV-OPS-017.
- Runtime-scoped canonical resource sharing, generation fencing, optimistic overlay ownership, explicit authoritative writes, and bounded invalidation. These are useful behavior patterns under SEM-004, SEM-009 through SEM-018, and REV-OPS-009 through REV-OPS-018.
- Effect integration for service requirements, failure, interruption, scopes, queues, and cleanup where the runtime owns those concerns. Static identity, selectors, codecs, graph validation, snapshots, and domain queues remain ordinary TypeScript unless a current contract assigns an Effect boundary.
- Production-owner test parity. Old runtime-backed helpers show the value of comparing live and Story behavior, but the old harness API is not preserved. The target proof is REV-TEST-010, TEST-015, PROOF-011, and PROOF-016.
- Package route hygiene, ESM output, Node >=22.18.0, Effect 4.0.0-beta.86, optional React peer behavior, packed-consumer checks, and CLI artifact delivery. These are retained by RET-001 and the package manifest subject to API-001 and API-002.

### Intentionally replace

- Flat root machine configuration with recursive compound states and exact default tokens: DEL-005 and REV-MACH-001 through REV-MACH-011.
- Root/dynamic actor categories with closed App.M, exact stable refs, opaque local refs, and owner leases: DEL-003 and REV-COMP-006 through REV-COMP-015.
- Active/disposed plus handle disposal with prepared|active|suspended|disposed and lease-only disposal: DEL-004 and REV-HOST-002 through REV-HOST-005.
- Registered views and comparator subscriptions with passive actor selectors and shared equality: DEL-001, DEL-007, DEL-008, and REV-HOST-006 through REV-HOST-007.
- Old Story/scenario runners with immutable Story plans over the production runtime: DEL-009 and REV-TEST-001 through REV-TEST-010.
- v1 boot/trace/behavior/CLI shapes with package-private v2 schema and shared Story/CLI executor: DEL-010, REV-MIG-005, WIRE-020A through WIRE-024, and CLI-001 through CLI-012.

### Delete rather than port

- Child machines and child capability surfaces: DEL-002 and REV-MIG-006.
- Automatic roots, dynamic machines, dynamic actor IDs/categories, and root ownership: DEL-003.
- Generic activity kits, generic operation refs, byKey/byLane, bound-entry enumeration, and broad resource/transaction lookup: DEL-006.
- flow.view, exported View definitions, view IDs, module view registration, useView(view), and useResource: DEL-001 and DEL-008.
- Final states, actor completion, onDone, final output, mailbox shutdown on final, and Boolean reentry: DEL-005 and REV-MACH-010 through REV-MACH-011.
- Old scenario commands/results, including perform, deliver, receive, flush, settle, run.final, replay, mutable harnesses, finalState, and children artifact fields: DEL-009 and DEL-010.

### Must not be copied

- /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:20-207 shell-and-swap preparation/attachment.
- /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:436-519 direct flat/old machine and registered-view construction.
- /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:692-733 child/module/runtime shapes.
- /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:27-165 handles with disposal, children, receipts, mutable runtime services, and v1 boot.
- /Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:8-56 scenario runner and mutable testing type surface.
- /Users/arpit/Developer/flow-state/packages/flow-state/src/cli/index.ts:851-940 story paths and old model/path command behavior.
- Any old test asserting a deleted name, root/child/final concept, registered view, receipt, mutable scenario, or second testing runtime. Those tests are migration evidence only.

## 4. Old surface/behavior matrix

Disposition meanings follow /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/07-deletions-and-cutover.md:22-43. REPLACE means hard deletion of the old surface with no alias, overload, adapter, parser, or deprecated wrapper.

| Frozen surface or behavior | Current contract owner | Disposition | Exact frozen evidence | Required proof |
|---|---|---|---|---|
| ESM package routes, manifest, Node and Effect peer boundary | API-001; RET-001; CUT-P04 | Preserve boundary; replace exports | /Users/arpit/Developer/flow-state/packages/flow-state/package.json:22-54,74-98 | Packed route/type proof; PROOF-014; API-P01 |
| definition/machine authoring | API-003/API-004; TYPE-001 through TYPE-004; REV-MACH-001 through REV-MACH-011 | Replace shape and semantics | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:436-515; /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/machine-core-types.ts:119-207 | Positive/negative recursive grammar; depth 10; atomic transition proof |
| Flat initial, final/onDone, Boolean reenter, transition submit | DEL-005; REV-MACH-003 and REV-MACH-009 through REV-MACH-011 | Delete/replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/machine-core-types.ts:62-84,119-134; /Users/arpit/Developer/flow-state/packages/flow-state/src/vnext/machine.ts:248,547-560,713-734 | Negative compile and boot/CLI absence proof; PROOF-017 |
| Child machines, child refs/routes/persistence | DEL-002; REV-MACH-001; REV-MIG-006 | Delete | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/machine-invoke-types.ts:29-132; /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:692-719 | Negative declarations/imports/boot/artifact/CLI proof |
| Array module inventory, roots, dynamic machines | API-010; REV-COMP-006 through REV-COMP-008; DEL-003 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/vnext/app-plan.ts; /Users/arpit/Developer/flow-state/packages/flow-state/src/vnext/app-plan-identity.test.ts:21-189 | Closed App.M compile/admission/no-actor-on-compile proof |
| Actor handles with id, children, receipts, retry/reset, dispose | API-011/API-012; REV-COMP-011 through REV-COMP-014; DEL-004 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:27-67 | Exact ref family, lease-only disposal, lifecycle, tombstone, cleanup |
| actor.send mailbox behavior | RET-002; CUT-006; SEM-001 and SEM-006 | Preserve behavior; replace handle result | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:27-46 | Event ordering, sync send, actor publication |
| Resource P/K, named descriptor, passive reads, explicit writes | API-005 through API-007; RET-003/RET-004; REV-OPS-001 through REV-OPS-010 | Preserve concept; replace family | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/resource-transaction-types.ts:12-123,149-246; /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:88-102 | Hostile K input; sharing, generation, passive-read, write-fence proof |
| Generic ensure/observe/refresh, tags, broad invalidation | DEL-006; REV-OPS-005 and REV-OPS-018 | Delete/replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:735-907 | Export absence; named O-family; bounded invalidation/clear |
| Transactions and streams | API-008/API-009; REV-OPS-011 through REV-OPS-017 | Preserve category; replace identity/lifecycle | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/flow-core.ts:521-688; /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/resource-transaction-types.ts:252-300 | Concurrency, unknown transaction, stream latest/count/generation, hydration/no replay |
| Registered views, useResource, comparator | DEL-001, DEL-007, DEL-008; REV-HOST-006/REV-HOST-007 | Delete/replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-resource.ts:16-37; /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-view.ts:13-47; /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/machine-view-stream-types.ts:15-55 | Route absence; selector purity/equality/dependency tracking |
| React shell/attach/swap lifecycle | REV-HOST-002 through REV-HOST-005; HOST-P01 through HOST-P05 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.ts:20-58,86-207 | Prepared final actor, 64-buffer, same actor after commit, suspend/resume, abandoned render |
| Old test/flowTest/Scenario/model/controlled stream exports | DEL-009; REV-TEST-001 through REV-TEST-010; TYPE-014 through TYPE-017 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/testing.ts:1-56; /Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-stories.ts | Immutable plan, exact constructors/targets, production parity, cleanup/error |
| v1 boot/hydrate/dehydrate and actor/resource payloads | WIRE-001 through WIRE-013; REV-COMP-005; DEL-010 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/core/api/runtime-types.ts:69-106,140-165 | App-branded decode, context-closed dehydration, no replay, opaque-domain boundary |
| Old inspect/trace/local-proof types | API-016; WIRE-017 through WIRE-020B; DEL-010 | Replace | /Users/arpit/Developer/flow-state/packages/flow-state/src/inspect.ts:1-179 | One TurnRecord hub, bounded sink, shared v2 model, truncation/artifact validation |
| Old CLI story paths, final/children schemas, second decoder | CLI-001 through CLI-012; REV-MIG-005; DEL-009/DEL-010 | Replace/delete | /Users/arpit/Developer/flow-state/packages/flow-state/src/cli/index.ts:851-983; /Users/arpit/Developer/flow-state/packages/flow-state/scripts/check-example-cli-acceptance.mjs:129-261 | Exact ten-leaf grammar, gateway safety, shared executor, atomic output/exit/signal |
| Maintained examples and Todo consumer | PROOF-016/PROOF-017; API-P01 through API-P03 | Uncertain evidence, not a legacy requirement | No /Users/arpit/Developer/flow-state/examples/ files are present in the current worktree; old script references /Users/arpit/Developer/flow-state/packages/flow-state/scripts/check-example-cli-acceptance.mjs:17-24 | Lead names target examples; packed, declaration, runtime, browser, CLI gates |

## 5. API-drift inventory

Every row needs a source-faithful example or compile proof before the corresponding public owner is accepted. The example must use target routes and names; an old deletion test is not a positive API proof.

| Public area | Shape to demonstrate | Drift trap | Minimum proof owner |
|---|---|---|---|
| Definitions | Literal id, recursive states, event constructors, context selectors, operations, input-to-memory initializer, void-input negative case | Second schema, as-const requirement, initializer on restore | TYPE-001 through TYPE-003; PROOF-001/PROOF-002 |
| Machine authoring | Callback with S/E/O/onContext/onMemory/invalidate/clear, nested defaults, exact matching, redirect, timer, action batch, exact reentry | Direct config, relative strings, runtime tree walk, final/child/invoke fields | REV-MACH-002 through REV-MACH-011; PROOF-003/PROOF-007 |
| App/AppPlan | Exact module records, flattened App.M, requirements, duplicate name/value/ownership negatives, no actor on compilation | Array inventory, module ID in durable identity, dynamic family lookup | REV-COMP-006 through REV-COMP-008; PROOF-002/PROOF-015 |
| Actors/refs | Stable actorRef, ensureActor, getActor, fresh opaque createActor, owner lease, concurrent ensure join, tombstone | Handle disposal, local id, family lookup, context edge as parentage | REV-COMP-011 through REV-COMP-014; TYPE-012; PROOF-004/PROOF-015 |
| Context | Exact provider refs, one slot each, silent baseline, atomic wave, ordinary onContext event, dependency disposal | Implicit provider discovery, rebind with history, initial selector event, parent ownership | REV-COMP-001 through REV-COMP-005; SEM-002A; PROOF-003/PROOF-004 |
| Resources | P/K, passive key/getData/getState, finite lookup/refetch, continuing subscribe, explicit setData, state narrowing | Reconstruct P from K, runtime-wide get/clear, lookup from read, second identity | REV-OPS-001 through REV-OPS-010 and REV-OPS-016 through REV-OPS-018; PROOF-005/PROOF-006 |
| Transactions | Keyed commit/cancel, four policies, explicit writes before mapped outcome, unknown/reconcile state | Retry helpers, completion invalidation, implicit writes, global concurrency | REV-OPS-011 through REV-OPS-013 and REV-OPS-015/REV-OPS-017; PROOF-007 |
| Streams | Keyed subscribe, hasValue/latest/count/generation/terminal, equal-key retention, mapped events, no actor cancel | Resource-store registration, replay, cancel API, runtime-sized arrays | REV-OPS-014 through REV-OPS-017; SEM-022; PROOF-006/PROOF-007 |
| React hosts | FlowProvider, useActor, useActorByRef, useView(actor, selector), command-only hooks, passive selector, tracked reads | Shell swap, useResource, registered views, comparator, React-owned authority | REV-HOST-001 through REV-HOST-008; PROOF-012; HOST-P01 through HOST-P05 |
| Stories | Three constructors, exact options, recipes, inert plan, exact targets, process, clock, checkpoint, run | Callable scenario, focused boot, callbacks, mutable harness, implicit process | REV-TEST-001 through REV-TEST-006; PROOF-008 through PROOF-010 |
| Controlled observations | Family-specific simulate plan/observation, occurrence/generation validation, no unrelated processing | Generic registry, state mutation, bypassed admission/completion | REV-TEST-007; PROOF-007/PROOF-009 |
| Fixtures/controls/models | Requirement-closing fixtures, endpoint controls, pure machine-only model, path Story live parity | Effectful model, fixture instantiation during discovery, app reduced to machine, replay | REV-TEST-009/REV-TEST-010; TEST-014/TEST-015; PROOF-008/PROOF-011 |
| Persistence/artifacts | Branded boot, context-closed dehydration, v2 behavior/trace, checkpoint/end/cleanup/failure, no replay | Mutable hydrate, child/root/final fields, serialized work, duplicate codec authority | WIRE-001 through WIRE-024; PROOF-010/PROOF-014 |
| Inspection | Sink attach/drain/dispose, bounded buffer, TurnRecord/LifecycleRecord projections, behavior/trace diff/import/export | Inline sink failure, unbounded history, snapshot trace, public TurnRecord | WIRE-017 through WIRE-020B; API-016; PROOF-013 |
| CLI | Ten commands, trusted gateway, shared executor/model, data selectors, v2 I/O, output/exit/signal | Old story paths, optional discovery, CLI decoder, arbitrary event JSON, batch runner | CLI-001 through CLI-012; CLI-P01/CLI-P02; PROOF-014/PROOF-017 |

## 6. Minimum high-impact example and proof set

This is the smallest set that exercises distinct contract boundaries. It is not a license to recreate all old examples.

### Seven named examples

1. todo-essentials — final proving app shape only: one definition, nested state, named resource, App.M, stable ref/lease, Story checkpoint/end, and packed import. This is a recommendation for the Todo implementer; this audit did not create or modify Todo.
2. context-editor — two named machines with exact provider refs, silent bootstrap, changed selection, onContext current/previous event, provider disposal rejection, and context-closed dehydration.
3. operations-order-workflow — named resource, transaction, and stream; P/K, passive reads, event actions, explicit writes, concurrency, stream latest/count/generation, and mapped events.
4. canonical-key-hostile-input — positive canonical tuple/record plus negative undefined, cycle, accessor, sparse array, unsupported object, depth, node-count, and byte-limit cases; prove rejection before ownership/mutation/external work.
5. react-lifecycle-host — prepared actor render, 64-command buffer, same actor after commit, suspension/resume, lookup-only useActorByRef, passive useView, selector exception memoization, dependency replacement, and abandoned render cleanup.
6. offline-notes-persistence — branded boot/dehydrate/hydrate, restored stable refs/context graph, key-only resource passivity, transaction unknown/reconciliation, stream latest without replay, and disposed/tombstone exclusion.
7. cli-gateway-artifact — one consumer behavior gateway, behavior build/check/render/diff, Story list/describe/run, trace summarize/proof/diff, atomic output, truncation, failure/cleanup projection, and exit behavior.

### Four compile-proof modules

- public-positive.ts — route exports, definitions, recursive state tokens, App.M, refs/leases, named O families, React hooks, Story constructors, and inferred state narrowing.
- public-negative.ts — old child/view/root/dynamic/receipt/scenario exports; wrong machine family; foreign ref; void input; extra Story option; invalid binding; Boolean reentry; final/initial/submit; comparator; invalid K.
- operations-and-hosts.ts — P/K variance, A/E/R and Layer closure, four transaction policies, resource/transaction/stream unions, passive selector restrictions, and useView family.
- story-persistence-cli.ts — Story targets/recipes, simulate restrictions, model fresh-plan restriction, branded boot input, gateway export, and inspect/CLI routes.

### Ten runtime scenario groups

1. One mailbox turn: pre-turn snapshot, action batch validation, atomic publication, synchronous send.
2. Context: silent bootstrap, one atomic wave, changed selector event, selector defect, reverse dependency disposal.
3. Resource: same-runtime sharing, passive cross-actor read, generation fence, actor preview isolation, authoritative write.
4. Transaction: reject/cancel/allow/serialize, old-generation suppression, writes-before-outcome, remote cancellation truth, unknown hydration state.
5. Stream: equal-key retention, replacement, latest coalescing, terminal/release distinction, duplicate declaration rejection, hydration without replay.
6. Machine lifecycle: compound activity lifetime, timer deadline, redirect order, exact reentry, no final completion.
7. Admission/lifetime: concurrent ensure join, prepared activation, suspension/resume, tombstone, dependent disposal rejection, reverse cleanup.
8. Story execution: inert plan, process versus clock, exact target, simulate production completion, checkpoint read cut, run.end, cleanup failure.
9. Host parity: live and Story commands through one production runtime; compare snapshots, TurnRecords, pending work, generations, and cleanup.
10. Artifact/CLI: codec rejection/canonicalization, gateway safety, shared executor, truncation, atomic output, signal cleanup, exit status.

### Redundant examples to reject

- Do not create one example per scalar selector, record selector, and comparator variant; one selector example plus equality cases is enough.
- Do not create a child-machine example; child capability is deleted and needs negative absence proofs only.
- Do not recreate the old six recipe examples merely because the old check script names them.
- Do not create separate flowTest and live-runtime implementations; use the parity scenario required by REV-TEST-010.
- Do not create examples for singleton/toggle/debounce, runtime-sized continuing collections, subscribeMany/subscribeEach, or a poll API; /Users/arpit/Developer/flow-state/reference/incident-console/implementation/revision-spec/accepted/03-operations.md:858-897 leaves them deferred or excluded.

## 7. Preservation/cutover policy for agents

1. Before copying: name the receiving contract ID, revision ID, owning production module, changed semantics, failure behavior, cleanup behavior, artifact impact, and proof. If any is unknown, record the gap rather than copying.
2. Copy only narrow source-independent pieces: canonical container/encoding utilities, immutable value guards, bounded sink mechanics, or Effect resource/finalizer adapters may be candidates when inputs/outputs and ownership laws match a current contract. A copied helper is not accepted until a production-owner proof exercises it.
3. Do not copy public shapes by default: old FlowActor, FlowRuntime, FlowView, FlowReceipt, FlowScenario, child, root, generic operation, and v1 artifact types are migration evidence, not compatibility targets.
4. Do not copy lifecycle machinery: old React shell, orchestrator API, actor disposal handle, child supervision, mutable testing harness, and old CLI gateway/parser are contradicted by DEL-002, DEL-003, DEL-004, DEL-008, DEL-009, and DEL-010.
5. Keep semantics at the new owner: identity/selectors/codecs/graph validation/snapshots remain ordinary TypeScript; Effect owns runtime services, scopes, queues, interruption, failure, and cleanup where assigned. CLI and Story call production owners.
6. Require a five-part acceptance receipt for copied code: contract/revision crosswalk; positive compile proof; negative compile or absence proof; production runtime proof including failure/interruption/cleanup where relevant; final export/artifact/deletion check. git diff --check is hygiene only.
7. Cut over late: keep /Users/arpit/Developer/flow-state/packages/flow-state/ frozen; implement in /Users/arpit/Developer/flow-state/packages/flow-state-rewrite/; regenerate declarations/artifacts through commands; verify packed consumers, examples, browser hosts, CLI, and nub run verify before calling the replacement useful.

## 8. Handoff

### Todo implementer

- Use todo-essentials as the first target example after CS-01, CS-02, CS-04, and CS-05 are closed by the lead.
- Use API-003, API-004, API-010, API-011, API-013, and API-014 as target language, not as permission to import old helpers.
- Do not modify an old Todo example. No current-worktree Todo source was discoverable during this audit; that absence is an evidence gap, not an invitation to infer the old implementation.
- First acceptance slice: one definition, one nested machine, one named operation, one stable lease, one Story checkpoint/end, and one packed route. Do not add child, view, dynamic-root, or scenario compatibility.

### Lead agent

- Resolve or assign the 11 gaps, starting with CS-01 through CS-08: RuntimeFactory, operation plan/observation, fixture/control/gateway, domain decoding, host ownership, inspect signatures, public errors, and persistence carriers.
- Update the owning normative contract/revision source before implementation; do not let an example become the de facto contract.
- Name the 7 authoritative examples and their production owners, especially the missing current-worktree example/gateway source.
- Map the 4 compile-proof modules and 10 runtime scenario groups into /Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PROOF_MATRIX.md before declaring the rewrite useful.
- Keep the frozen implementation and unrelated dirty-worktree changes untouched. The only file created by this audit is /Users/arpit/Developer/flow-state/reference/incident-console/implementation/PRESERVATION_AUDIT.md.
