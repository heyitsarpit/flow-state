# Artifact and Inspection Migration Plan

Status: proposal only. This file does not change contracts, source, OpenSpec, or Beads.

Current resolution overlay: retain the single private v2 artifact/inspection owner and the hard deletion
direction. Exact public boot/artifact carriers, request-runtime signature, sink lifecycle, and failure-field
rules remain in the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md); older carrier names in this file
are candidate notation, not accepted API.

## Recommendation

Replace the frozen behavior-artifact, receipt-trace, and inspection families with one Flow-owned private v2 model and two projections:

1. A behavior artifact derived from the inert `AppPlan`, app module records, machine declarations, operation descriptors, and declared Stories.
2. A trace artifact derived from the production runtime's committed `TurnRecord` stream, ordered `LifecycleRecord` evidence, Story checkpoints, failure, and cleanup outcome.

Make inspection a bounded observation sink over that same runtime evidence hub. Make the CLI a host for the shared codec and projections. Remove the legacy v1 artifact, snapshot-derived trace, `Scenario`/local-proof envelopes, child/final-state surfaces, and competing mutable histories.

This preserves the contract-required identity and evidence boundary while removing behavior that cannot be produced by the new AppPlan/app/Story model. The authoritative sources are the live files under:

```text
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/CLI.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PROOF_MATRIX.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/SNAPSHOTS.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/SEMANTICS.md
/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/ARCHITECTURE.md
```

Accepted revisions, prior proposals, fixtures, goldens, and existing receipts are not used as authority. `PERSISTENCE_AND_ARTIFACTS.md:15-21` explicitly keeps those historical materials out of the schema/evidence authority boundary.

## Contract-derived target

### Behavior artifact

The behavior artifact must be a canonical stable-JSON representation of the closed AppPlan and declared Stories. Its required identity and shape are defined in `PERSISTENCE_AND_ARTIFACTS.md:343-358` and `PERSISTENCE_AND_ARTIFACTS.md:362-398`:

- `appId`, `persistenceVersion`, and a private `appPlanFingerprint`.
- Named module records with module IDs as tooling identity only.
- Named machine records with recursive compound state declarations, defaults, events, context requirements, operation identities/requirements, activity slots, and timer slots.
- Story metadata and app/machine association.
- No callbacks, Effects, fixtures, runtime actors, runtime state, or executable behavior.
- Fingerprint preimage excludes Stories.

The AppPlan is the derivation source. It is inert, statically complete, and closed-world; it cannot contain Effects, actor instances, global registries, callbacks, or dynamic runtime expansion (`ARCHITECTURE.md:9-31`). Modules are exact named records and provide tooling grouping for CLI slicing, trace/inspection grouping, artifact sections, and diffs, but are not runtime or persistence identity (`ARCHITECTURE.md:45-72`).

### Trace artifact

The trace artifact must preserve runtime evidence, not a reconstituted machine snapshot. The contract requires app/persistence compatibility, fingerprint, capture time, truncation state, ordered records, checkpoints, outcome, end, failure, and cleanup (`PERSISTENCE_AND_ARTIFACTS.md:343-358`, `PERSISTENCE_AND_ARTIFACTS.md:400-418`). The records are the private projections of committed `TurnRecord` and ordered lifecycle evidence. `TurnRecord` is the sole committed history event, published after actor publication and before acknowledgement; lifecycle records are evidence and do not create machine revisions or extra TurnRecords (`PERSISTENCE_AND_ARTIFACTS.md:274-292`).

The trace must retain:

- global sequence/order and explicit `truncatedBeforeSequence`;
- operation identity (`opId`, canonical `K`, actor, generation, occurrence) and operation/context/store/timer/issue facts;
- stable actor evidence or an explicit Story recipe, plus exact actor lookup at checkpoints;
- `checkpoint.actor`, runtime metadata, and pending-work evidence;
- `run.end` and failure/cleanup sections with the contract's success and failure rules;
- `CauseProjection` in artifacts, while raw `Cause` remains available only through in-process Flow errors.

These are required by `PERSISTENCE_AND_ARTIFACTS.md:420-855`, `PERSISTENCE_AND_ARTIFACTS.md:857-1005`, and `PERSISTENCE_AND_ARTIFACTS.md:1007-1040`.

### Inspection

Inspection is runtime observation, not persistence. It must be explicitly exported and preserve record order, truncation, app identity, and persistence version (`PERSISTENCE_AND_ARTIFACTS.md:330-341`). The contract requires a default capacity of 256, caller-supplied nonnegative capacity, immutable snapshots, an explicit truncation marker, and exactly `{ snapshot(), clear() }` as the inspection buffer surface (`PERSISTENCE_AND_ARTIFACTS.md:294-328`). Attach, drain, dispose, and failure-isolation ordering are part of the runtime proof obligation.

The same committed evidence hub must feed runtime, Story, inspect, and CLI paths. A second mutable history or a fabricated trace snapshot is prohibited (`PUBLIC_API.md:722-741`, `ARCHITECTURE.md:360-390`, `ARCHITECTURE.md:529-550`).

## What is needed and what is derivable

| Contract need | Source of truth | Keep in artifact/inspection migration | Do not derive or preserve from frozen behavior |
|---|---|---|---|
| App and persistence identity | AppPlan/app and boot contract | `appId`, `persistenceVersion`, fingerprint, compatibility checks | Legacy unbranded v1 payloads or silent aliases |
| Module ownership | AppPlan named module records | module ID, machine membership, tooling grouping | Runtime module registries, dynamic module discovery |
| Machine behavior declaration | AppPlan compiled graph | recursive states, default, events, context requirements, operations, activity/timer slots | `graphOf`'s legacy child/final/receipt schema |
| Operation identity | AppPlan descriptor and canonical `K` | descriptor ID, `K`, actor/generation/occurrence facts where observed | Reconstructed identities from receipt buckets |
| Story declaration | app/Story constructors | Story ID and contract-defined metadata, app/machine link | Fixture/seed execution data in a static behavior artifact |
| Runtime facts | committed TurnRecords and lifecycle evidence | ordered facts, lifecycle, actor evidence, pending work, context/store/timer/issue facts | Snapshot-to-trace synthesis, synthetic receipts, second history |
| Story proof | production Story executor and read barrier | exact actor checkpoints, `run.end`, failure, cancellation, cleanup | “final state” as a substitute for end/cleanup proof |
| Inspection retention | bounded sink attached once to evidence hub | capacity 256 default, truncation marker, immutable snapshot, clear marker | Unbounded message buffers and replay-based mutable logs |
| CLI transport | CLI gateway and shared private model | ten leaf commands, bounded decode, atomic output, exact result/exit semantics | CLI-owned parser, runner, validator, history, artifact schema |

## Retain/delete matrix

| Frozen surface or feature | Disposition | Replacement or retained contract value | Exact contract citations |
|---|---|---|---|
| `flow-state/behavior-contract.v1` and `FlowBehaviorContract` | **Delete** | Build private behavior v2 from AppPlan/app/Stories; retain app ID, persistence version, fingerprint, modules, machines, operations, and Stories. | `PERSISTENCE_AND_ARTIFACTS.md:343-398`; `PUBLIC_API.md:117-242`; `API-P01/P02` at `PUBLIC_API.md:755-778` |
| `target.app.inventory()`-driven modules/resources/transactions/streams/views | **Replace** | Derive only contract-defined AppPlan declarations. Remove inventory-only screens, fixtures, generic resource/transaction/stream/view lists unless represented by the v2 machine/operation/context/slot model. | `ARCHITECTURE.md:9-31`; `PERSISTENCE_AND_ARTIFACTS.md:362-398`; `PUBLIC_API.md:430-475` |
| Legacy `graphOf`/graph descriptor | **Split** | Retain pure graph/transition inspection only where it consumes the compiled AppPlan. Replace its artifact shape with recursive v2 machine states; remove legacy child/final/runtime-ownership fields. | `ARCHITECTURE.md:9-31`, `ARCHITECTURE.md:447-472`; `PUBLIC_API.md:117-242`; `WIRE-020A/B` at `PERSISTENCE_AND_ARTIFACTS.md:343-398` |
| `flowStories`, `storyToDoc`, old Story seed/fixture schema | **Replace** | Derive Story summary metadata from new app/Story declarations. Run Stories through the same production runtime and executor; preserve recipe/actor evidence only in trace artifacts. | `PUBLIC_API.md:581-684`; `PUBLIC_API.md:686-720`; `PERSISTENCE_AND_ARTIFACTS.md:343-358`, `PERSISTENCE_AND_ARTIFACTS.md:1007-1040` |
| `FlowReceipt` as committed history | **Delete** | Project committed `TurnRecord` facts and lifecycle evidence into the private trace model. | `PERSISTENCE_AND_ARTIFACTS.md:274-292`; `SEMANTICS.md:164-211`, `SEMANTICS.md:589-640` |
| `TraceLog` and `InspectionLog` as separate mutable histories | **Delete/replace** | One runtime evidence hub; inspection is a bounded attached sink and explicit export. | `PERSISTENCE_AND_ARTIFACTS.md:228-239`, `PERSISTENCE_AND_ARTIFACTS.md:294-341`; `PUBLIC_API.md:722-741`; `ARCHITECTURE.md:360-390`, `ARCHITECTURE.md:529-550` |
| Synthetic `actor:snapshot` and receipt-based snapshot trace | **Delete** | Snapshot/checkpoint evidence is emitted by the production runtime/Story barrier and does not fabricate a committed history event. | `SNAPSHOTS.md:5-38`, `SNAPSHOTS.md:192-232`; `PERSISTENCE_AND_ARTIFACTS.md:274-292`; `SEMANTICS.md:589-640` |
| `flow-state/trace-artifact.v1`, snapshot import/export, `children`, `receipts` | **Delete** | Canonical trace v2 with ordered Turn/Lifecycle records, checkpoints, end/failure/cleanup, truncation, and app compatibility. Reject v1 instead of adapting it silently. | `PERSISTENCE_AND_ARTIFACTS.md:343-358`, `PERSISTENCE_AND_ARTIFACTS.md:400-418`, `PERSISTENCE_AND_ARTIFACTS.md:857-1005`; `CLI.md:121-170`, `CLI.md:272-293` |
| Generic gzip/JSON helpers returning `undefined` on malformed input | **Replace** | Shared bounded v2 codec with hostile-input walking, safe-integer checks, closed diagnostic codes, one gzip member, and explicit failure classification. | `PERSISTENCE_AND_ARTIFACTS.md:228-270`; `CLI.md:121-170`, `CLI.md:216-253` |
| Old inspection owner metadata, arbitrary predicates, redact/serialize callbacks | **Reduce/replace** | Keep only contract-defined app, machine, module, actor, operation, and sequence evidence. Expose projections through named APIs; keep serialization inside the bounded codec. | `PUBLIC_API.md:16-113`; `PUBLIC_API.md:722-741`; `PERSISTENCE_AND_ARTIFACTS.md:228-270` |
| Receipt-bucket trace reports and old coverage obligations | **Replace** | Summarize/diff/prove v2 decoded artifacts. Coverage is declaration/Story metadata, not a claim that runtime facts occurred; incomplete traces fail `trace.proof`. | `PERSISTENCE_AND_ARTIFACTS.md:343-358`, `PERSISTENCE_AND_ARTIFACTS.md:857-1005`; `CLI.md:237-253`, `CLI.md:272-293`; `PROOF_MATRIX.md:382-409` |
| `local-inspection-proof` input/bundle | **Delete** | `trace.proof` accepts the contract trace artifact and exact selectors only. | `CLI.md:60-65`, `CLI.md:121-170`, `CLI.md:272-293`; `PUBLIC_API.md:743-753` |
| `FlowCliScenarioEnvelope`, `scenario-evidence`, `finalState`, `pending.children` | **Delete/replace** | Shared v2 CLI result and trace artifact. Retain Story list/describe/run commands, but use `run.end`, failure, cleanup, checkpoints, and CauseProjection. | `CLI.md:27-58`, `CLI.md:101-119`, `CLI.md:172-235`; `PERSISTENCE_AND_ARTIFACTS.md:400-418` |
| `story paths` and arbitrary event JSON | **Delete** | Keep pure graph/model inspection as a programmatic API only; it is not one of the ten CLI leaves. | `CLI.md:27-58`; `PUBLIC_API.md:743-753`; `PERSISTENCE_AND_ARTIFACTS.md:1007-1040` |
| Public export of FlowReceipt, full diagnostics, TurnRecord, and inspect artifact types | **Delete from root public API** | Keep the v2 decoded model private; expose only named inspect projections and the contract-defined public error boundary. | `PUBLIC_API.md:91-113`; `PUBLIC_API.md:722-741`; `ARCHITECTURE.md:426-445` |
| Old boot/restore path used as artifact compatibility | **Replace at the owning persistence boundary** | Preserve durable app/machine identity, descriptor IDs and `K`, stable actor refs, store facts, context bindings, and compatibility rejection; do not add a generic identity migration or legacy artifact adapter. | `PERSISTENCE_AND_ARTIFACTS.md:25-108`, `PERSISTENCE_AND_ARTIFACTS.md:110-218`; `PUBLIC_API.md:477-579`; `PROOF_MATRIX.md:324-364` |
| Existing behavior/trace/CLI tests and goldens | **Replace** | Test production mechanisms, v2 codec round trips/rejections, Story/runtime parity, bounded sink behavior, atomic CLI output, and negative legacy absence. | `PROOF_MATRIX.md:1-19`, `PROOF_MATRIX.md:382-419`, `PROOF_MATRIX.md:436-508`; `CLI.md:295-324` |

## Migration steps

1. **Freeze the boundary and inventory owners.** Create no compatibility adapter. Treat the v2 private model in `PERSISTENCE_AND_ARTIFACTS.md:343-855` as the only internal handoff. Record each old symbol's receiving owner before deletion: AppPlan compiler, runtime evidence hub, Story executor, inspect projection, or CLI host.

2. **Build the private behavior v2 projection.** Walk only the compiled AppPlan and app/Story declarations. Produce deterministic module, machine, operation, slot, requirement, and Story records. Compute the private fingerprint from the contract-defined preimage, excluding Stories. Validate closed fields, recursive state shape, IDs, and bounds before serialization.

3. **Replace the evidence source.** Make committed `TurnRecord` publication the only trace history and lifecycle records the only lifecycle evidence. Attach the bounded inspection sink exactly once, enforce capacity/truncation/clear semantics, and prove attach, drain, disposal, and failure isolation. Do not migrate `TraceLog` or `InspectionLog` data structures.

4. **Build the private trace v2 projection and Story barrier.** Run app Stories through the production executor. Capture exact actor evidence at checkpoints, ordered records, runtime metadata, pending work, `run.end`, failure/cancellation, and cleanup. Preserve partial evidence on cancellation/failure. Serialize CauseProjection, not raw Cause. A non-null end is not actor-completion proof; success requires completed cleanup.

5. **Replace the inspect route.** Keep named pure graph/transition helpers only when they report planned AppPlan behavior. Replace snapshot/receipt analysis, local-proof creation, old trace import, and legacy artifact types with v2 encode/decode, summarize, diff, proof, and bounded sink APIs. Keep the decoded schema private as required by `PUBLIC_API.md:91-113` and `PUBLIC_API.md:722-741`.

6. **Replace the CLI host.** Implement only the ten leaves in `CLI.md:27-58`. Route behavior build/check and Story commands through the trusted gateway; route artifact-only commands through the shared v2 decoder. Enforce selectors from `CLI.md:60-65`, atomic output and bounded trace capture from `CLI.md:142-170`, result/exit/signal semantics from `CLI.md:172-270`, and trace proof incompleteness rules from `CLI.md:272-293`.

7. **Rewrite proof and deletion tests.** Add production behavior proofs for AppPlan completeness, codec round trip and hostile rejection, TurnRecord/lifecycle ordering, bounded inspection, Story checkpoint/end/failure/cleanup, CLI packed-binary behavior, and app/Story parity. Add negative declaration/source scans only as supporting evidence: they cannot replace runtime or type/declaration proofs (`PROOF_MATRIX.md:1-19`, `PROOF_MATRIX.md:436-456`).

8. **Remove the frozen family after replacement proofs pass.** Delete v1 artifact decoders, receipt/snapshot trace reports, `Scenario`/local-proof envelopes, story-path CLI code, old child/final/children artifact fields, competing histories, and root public exports. Verify no aliases, adapters, translators, parser branches, or second runtime remain (`PROOF_MATRIX.md:436-456`).

## Persistence compatibility guardrails

Compatibility means compatibility with the new app-branded persistence contract, not acceptance of old artifact JSON.

- Retain durable descriptor identity and canonical `K`, app/machine identity, persistence version, stable actor references, accepted resource descriptors, context bindings, and store facts as required by `PERSISTENCE_AND_ARTIFACTS.md:25-108` and `PERSISTENCE_AND_ARTIFACTS.md:110-218`.
- Resolve persisted descriptors through the compiled AppPlan. Reject incompatible plans and structural/domain-invalid payloads using the closed diagnostic vocabulary; do not silently alias or generically migrate identity (`PERSISTENCE_AND_ARTIFACTS.md:62-81`, `PERSISTENCE_AND_ARTIFACTS.md:228-270`).
- Persist key-only resources and accepted facts. Never serialize running streams, fibers, scopes, cursors, emissions, or nonterminal pending transactions (`PERSISTENCE_AND_ARTIFACTS.md:198-218`).
- Treat module renames as artifact-breaking but runtime/persistence-compatible because module IDs are tooling identity, not durable runtime identity (`ARCHITECTURE.md:45-72`; `PUBLIC_API.md:430-475`).
- Reject v1 behavior/trace artifacts explicitly. Do not turn legacy import into an accidental persistence compatibility layer; the contract requires the v2 model and closed rejection behavior (`PERSISTENCE_AND_ARTIFACTS.md:343-358`, `PERSISTENCE_AND_ARTIFACTS.md:362-418`; `CLI.md:121-170`).

## Evidence and proof ownership

| Proof claim | Owning mechanism | Required proof anchor |
|---|---|---|
| AppPlan behavior is complete and inert | AppPlan compiler and declarations | `PROOF_MATRIX.md:57-92`, `PROOF_MATRIX.md:94-124` |
| P/K identity and v2 codec are canonical and bounded | private codec and hostile-input walker | `PROOF_MATRIX.md:171-196`, `PROOF_MATRIX.md:382-409`; `PERSISTENCE_AND_ARTIFACTS.md:228-270` |
| One ordered runtime evidence source exists | TurnRecord hub plus lifecycle publisher | `PROOF_MATRIX.md:366-380`; `ARCHITECTURE.md:360-390` |
| Inspection is bounded and non-persistent | attached sink, snapshot/clear, drain/dispose gates | `PERSISTENCE_AND_ARTIFACTS.md:294-341`; `PROOF_MATRIX.md:366-380` |
| Story trace is real production evidence | Story executor, read barrier, checkpoint/end/cleanup | `PROOF_MATRIX.md:253-310`; `PUBLIC_API.md:581-684` |
| CLI has no semantic duplicate | gateway, shared model, atomic I/O, exact exits | `CLI.md:5-23`, `CLI.md:69-119`, `CLI.md:142-293`; `PROOF_MATRIX.md:382-419` |
| Deleted legacy surfaces are absent | declaration/source scans plus runtime/package proofs | `PROOF_MATRIX.md:436-456`, `PROOF_MATRIX.md:491-508` |

## Unknowns and explicit non-decisions

The contracts define the v2 wire fields, semantics, command grammar, and proof obligations. They do not specify every private TypeScript carrier name, file split, or implementation scheduling detail. Those choices remain implementation work and must not be promoted into contract text by this proposal.

The following are therefore intentionally unresolved:

- the exact private module names for the v2 behavior/trace model and codec;
- the concrete internal API used to obtain the compiled AppPlan from a trusted gateway;
- the concrete sink attachment object used to implement the contract's attach/drain/dispose gates;
- the exact renderer prose for behavior and trace summaries, provided the JSON/result schemas and exit semantics remain contract-compliant;
- the migration order inside the isolated greenfield implementation root.

Do not resolve these unknowns by preserving legacy `FlowReceipt`, `Scenario`, local-proof, `children`, `finalState`, inventory, or v1 codec semantics. If a choice changes a normative field, identity rule, public export, or command grammar, stop and update the appropriate contract through the contract workflow before implementation.

## Completion criterion

This migration is complete only when the v2 behavior and trace artifacts are produced by the AppPlan/app/Story and production runtime mechanisms, respectively; inspection is the bounded projection of the same evidence hub; persistence compatibility checks retain the required durable identity; the ten CLI leaves pass fresh packaged-binary proofs; and the deletion proofs show no v1/Scenario/local-proof/child/final/second-history aliases remain. The focused requirements are `PROOF_MATRIX.md:382-456` and `CLI.md:295-324`.
