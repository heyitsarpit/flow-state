# Implementation workflow contract

Status: normative implementation contract for the greenfield replacement

Sibling contracts own runtime, API, persistence, CLI, host, Story, deletion, and proof semantics.
This file defines implementation order, ownership, review, tests, and promotion. It is not a second
runtime or API specification.

The active sibling contract pack is the sole semantic authority for this restoration. Archived revision
material and traceability records are provenance only and cannot define or override implementation semantics.
This workflow preserves the wording, semantics, and IDs already transferred into the active contracts.

## Authority and greenfield boundary

### Rule card — authority and source ownership

- Surface: Contract interpretation and implementation location.
- Rule: The active sibling contract pack is the sole semantic authority for implementation. Archived
  revisions, proposals, audits, research, traceability records, the frozen package, and historical examples are
  provenance only. The replacement is built in packages/flow-state-rewrite/. Existing
  packages/flow-state/ code, tests, examples, entrypoints, and records remain frozen reference
  material until late cutover.
- Accepts: Copied legacy code only after its current owner, types, failure lanes, cleanup, and tests are
  checked; each slice naming its contract IDs, bounded module boundary, allowed files, semantic/runtime
  ownership where required, acceptance behavior, and decisive proof before code.
- Rejects: incremental upgrades to the frozen package, hidden compatibility imports, aliases, overloads,
  adapters, parser branches, deprecated wrappers, or semantics inferred from historical material.
- Observable guarantee: A slice can be reviewed against its live semantic/runtime ownership and one named
  proof; source scans, focused typechecks, or lint do not close a required behavior proof.
- Proof: Owner/source-boundary review and named production-path proof.
- Trace: Authority and source-boundary clauses of this contract.

## Dependency order

| Phase | Contract owners | Greenfield boundary | Central proof owners | Depends on |
| --- | --- | --- | --- | --- |
| Static foundation | GLOSSARY_AND_IDENTITY, PUBLIC_API API-001–010, TYPE_SYSTEM TYPE-001–009 | Branded identities, schemas, errors, definitions, operation types, pure App/module compilation | PROOF-001, PROOF-002, TYPE-P01–P04 | None |
| Runtime ownership | ARCHITECTURE ARCH-007–020, SEMANTICS admission/mailbox/lifecycle, REACT_AND_HOSTS HOST-001–006, TYPE_SYSTEM TYPE-010–015 | RuntimeSetup, Runtime.ready, closed AppPlan, admission, leases, mailbox, context, scheduling, cleanup | PROOF-003, PROOF-004, PROOF-015, HOST-P01–P05 | Static foundation |
| Operation kernels | TYPE_SYSTEM operation inference, SEMANTICS SEM-011–021/029–030, SNAPSHOTS operation projections | K, resource store, generations, operation kernels, overlays, cancellation, invalidation, fanout, fencing | PROOF-005, PROOF-006, PROOF-007, SNAP-P01 | Runtime ownership |
| Persistence and evidence | PERSISTENCE_AND_ARTIFACTS WIRE-000–023 including WIRE-020C, SNAPSHOTS capture/hydration, diagnostic clauses | Persistence provider, declaration restoration, private v2 codecs/models, exact trace facts, bounded sinks, raw and share-only artifacts | PROOF-009, PROOF-010, PROOF-014, API-P04, CLI-P01 | Runtime ownership and operation kernels |
| Hosts/Stories/CLI | TESTING REV-TEST-001–010, REACT_AND_HOSTS, CLI, PUBLIC_API API-011–017 | React attachment, Story builders/run, Fixtures/Implementations/seeds, gateway, shared CLI executor | PROOF-008, PROOF-010, PROOF-012, PROOF-014, CLI-P01 | Runtime + kernels + persistence/evidence |
| Cutover/absence | COMPATIBILITY_AND_DELETIONS, PROOF_MATRIX PROOF-016–017 | Entrypoints, examples, packed consumers, browser behavior, deleted-surface absence, final package cutover | PROOF-016, PROOF-017, CLI-P02, CUT-P01–P06 | All prior phases |

### Rule card — portable text and byte boundaries

- Surface: Shared definition, persistence, artifact, stable-ref, and CLI codec code.
- Rule: Cross-runtime code MUST use host-neutral ECMAScript/Web APIs available to the declared
  Node, Bun, Deno, CLI, and browser targets. UTF-8 byte counts and bytes use the WHATWG
  `TextEncoder` semantics; lone surrogates are rejected before encoding with
  `String.prototype.isWellFormed` when available or an equivalent fallback. Node-only `Buffer`
  and runtime-specific encoders are forbidden in shared package code. The complete canonical-codec
  vector suite runs against the shared production codec on the pinned Node toolchain. Bun, Deno, and
  one supported Chromium, Gecko, and WebKit browser each execute that same compiled codec against a
  compact portability fixture containing valid ASCII, multibyte UTF-8, one rejected lone surrogate,
  and one canonical artifact whose bytes or digest match the normative fixture. Receipts record exact
  host versions; host-specific adapters retain focused tests.
- Accepts: One shared UTF-8 boundary helper reused by definition, stable-ref, persistence, and
  artifact owners, with host-specific adapters limited to the host boundary.
- Rejects: UTF-16 `.length` for byte limits, `TextEncoder` output after silent surrogate replacement,
  Node-only byte-counting in browser/Deno code, and a second handwritten encoder for a separate owner.
- Observable guarantee: Equal accepted inputs produce identical UTF-8 bytes and length-prefixed
  identities across supported hosts; invalid durable input fails before serialization or activation.
- Proof: The Node owner suite covers ASCII, 2-byte, 3-byte, and 4-byte characters, 256/257-byte
  authored-name boundaries, lone surrogates, and exact composed/decomposed spelling. Compact portability
  receipts execute the shared codec under the declared Bun/Deno/browser hosts for `PROOF-001`, `PROOF-010`,
  and `PROOF-014`; they do not repeat the complete owner vector matrix.
- Trace: GLO-01, WIRE-007/WIRE-008, WIRE-014–WIRE-020, and the declared package host matrix.

### Rule card — recursive module layout

- Surface: Greenfield source and focused tests.
- Rule: Keep small features flat at their parent. Create a recursive feature folder only for a major
  self-contained module, and co-locate its implementation, validation/private helpers, local codecs such as
  a local UTF-8 helper, and a local `test/` subtree under that module. Folder names describe modules, not
  compile-time/runtime/API proof roles. A module may contain both type-level declarations and runtime
  behavior. Re-export files exist only when a real public route requires them.
- Rejects: Treating `model`, `type`, or `api` as a required taxonomy or as three production owners; splitting
  one module into proof-role folders; or placing a module's private helpers/codecs/tests in unrelated global
  directories without a contract reason.
- Observable guarantee: A slice has one bounded module boundary and a small, discoverable local test tree;
  semantic/runtime ownership guardrails remain independent of folder layout.
- Trace: Source-boundary and slice-readiness clauses of this contract.

### Rule card — dependency and readiness

- Surface: Implementation slice readiness.
- Rule: Implementation work MUST preserve these dependency edges. The future Beads graph may split a
  row into smaller issues, but it MUST NOT combine unrelated semantic owners or reverse an edge. A slice
  is ready only when it identifies exact contract IDs, one bounded module boundary under
  packages/flow-state-rewrite/ and its allowed files, semantic/runtime ownership where required,
  public/internal output including Effect A/E/R, success/typed-failure/defect/interruption/ownership/
  cleanup/ordering acceptance, proof IDs and focused command, dependencies/non-goals/deleted-surface
  absence, and reviewer handback fields.
- Accepts: Inferred shapes when a public helper alias would create a second authority; a blocker when
  implementation requires a missing public name, carrier field, target constructor, inspection route,
  or error member.
- Rejects: citing a proposal, retired phase receipt, frozen implementation, or historical audit as
  semantic authority; inventing public aliases or fields in code/tests/retired documents; reversing
  dependency edges; combining unrelated semantic owners.
- Observable guarantee: Contract ambiguity is surfaced to the owning contract instead of hidden in
  implementation. Dependent work starts only after the required focused proof is recorded.
- Proof: Slice readiness review and dependency-order check.
- Trace: Dependency order, readiness, and inferred-shape clauses.

### Rule card — static Implementation route ownership

- Surface: The root `Implementation` runtime value, its same-name public type, and the inert provider graph.
- Rule: Route assembly has one owner: `packages/flow-state-rewrite/package.json`, `src/index.ts`,
  `src/public/root.ts`, and `src/public/types.ts`, plus the packed API-P01 proof. Provider-graph construction has
  a separate owner: `src/public/implementation.ts` and its focused API/type tests. The route owner only re-exports
  the provider owner; it does not duplicate constructors or provider state. Runtime acquisition, Scope,
  finalization, and `ready()` remain TYPE-010 Runtime-ownership work.
- Accepts: One root runtime value with exactly `succeed`, `effect`, and `merge`, alongside the same-name public
  type, with inert construction and no acquisition in the static phase.
- Rejects: `Object.freeze` as namespace behavior, aliases, secondary/deep routes, duplicate constructor owners,
  provider construction in route files, or TYPE-010 acquisition work in the static slice.
- Observable guarantee: Packed consumers see one exact root route while provider semantics remain owned by
  TYPE-009B and runtime acquisition remains owned by TYPE-010.
- Proof: API-P01 and TYPE-009B provider variance/duplicate/inertness proofs. Focused commands:
  `nub run --filter flow-state-rewrite check:types` and
  `nubx vp test packages/flow-state-rewrite/src/api/tests/public-routes.test.ts`.
- Trace: PUBLIC_API API-001/API-002/API-P01; TYPE_SYSTEM TYPE-009B/TYPE-010.

## Single-owner guardrails

### Rule card — production ownership

- Surface: Runtime, Story, host, model, artifact, and CLI boundaries.
- Rule: Live hosts, Stories, tests, SSR, and CLI share one production runtime and one assembly boundary.
  AppPlan is the closed-world admission boundary. Runtime, actor, operation, persistence, artifact,
  and evidence state stays with production owners; adapters provide inputs only. Pure model discovery
  remains pure; synchronous snapshot reads remain synchronous; Story external behavior is supplied by
  complete typed Implementations and Fixtures; configuration, app identity, provider graphs, clocks,
  seeds, fixtures, and persistence inputs are fixed before Runtime construction.
- Accepts: Fresh Runtime instances for isolation, deterministic host capabilities, complete typed
  Implementations/Fixtures, package-private focused machine plans, and synchronous snapshot reads.
- Rejects: dynamic registration, process-global descriptor/actor registries, second runtime/actor/
  mailbox/scheduler/store/kernel/snapshot/cleanup/evidence systems, runtime-backed pure models,
  Effect interpretation in synchronous reads, Story operation interception, injected results, simulate,
  parallel codecs, parallel result/diagnostic families, and post-materialization mutation.
- Observable guarantee: One owner is named for identity, lifetime, operation facts, persistence, evidence,
  and cleanup; the semantic details remain authoritative in ARCHITECTURE, SEMANTICS, SNAPSHOTS,
  REACT_AND_HOSTS, TESTING, and PERSISTENCE_AND_ARTIFACTS. Artifact and CLI projections consume the one
  v2 model and preserve deleted-surface absence.
- Proof: Architecture scans plus production-path behavior, parity, and absence tests.
- Trace: Single-owner rewrite guardrails; ARCHITECTURE, TESTING, PERSISTENCE_AND_ARTIFACTS, and CLI.

## Reviewer gate

### Rule card — review handback

- Surface: Review for every implementation slice.
- Rule: The reviewer reads the diff, named clauses, trace-only provenance, and proof obligations; runs
  focused checks and `nub run lint`; fixes every formatting, lint, and unambiguous mechanical defect in
  the changed slice before handback; reviews success, typed failure, defect, interruption, ownership,
  cleanup, ordering, and boundary behavior through production owners; checks duplicate authorities,
  hidden compatibility, casts, uncontrolled async work, partial updates, bespoke Effect clones, and
  implementation-detail-only tests.
- Accepts: Mechanical lint/formatting fixes in the changed slice and exact substantive findings returned
  to the implementer.
- Rejects: unresolved lint, unclassified contract/proof gaps, weakened gates, or substantive semantic
  changes hidden as reviewer mechanics.
- Observable guarantee: No slice advances with a blocking finding. The handback is:

      Contract IDs:
      Changed files:
      Focused checks:
      Lint: nub run lint — pass/fail
      Behavior reviewed:
      Fixed findings:
      Blocking findings:
      Remaining advisory findings:

- Proof: Reviewer handback plus focused command receipts.
- Trace: Reviewer gate clauses.

## Test gate and completion

### Rule card — decisive tests

- Surface: New tests and behavior proof.
- Rule: Every test names its unique invariant/failure. Definition tests use behavior names only; their
  contract IDs, proof IDs, production owner, and rationale are mapped in Bead and reviewer metadata.
  Other slices record those fields with the test as required. Default budget is one to three decisive tests
  per slice; more requires distinct lanes, races, public type cases, or required boundary vectors.
- One executable test may satisfy multiple proof IDs when it exercises the same invariant through the same
  production owner; record every satisfied ID in external Bead or reviewer metadata instead of duplicating
  the vector.
- Packed consumers, examples, browser tests, Stories, and installed-CLI tests prove public reachability and
  host integration. They repeat an owner's semantic matrix only when that integration adds a distinct failure,
  race, cleanup, or wire boundary.
- Accepts: Tests prioritizing ownership, ordering, atomicity, cleanup, failure, interruption, hostile input at
  untrusted wire/artifact boundaries, ordinary malformed input at the caller-controlled definition-authoring
  boundary, exact typing, and deleted behavior; production Runtime for runtime proof; TestClock or Flow
  testing time instead of sleeps; bounded Deferred/Queue/PubSub controls; minimal immutable fixtures.
- Rejects: source-text/typecheck-only proof for runtime races, cleanup, behavior, or artifacts; test
  runtimes replacing production owners.
- Observable guarantee: Tests prove the named invariant through the owner whose behavior is contractual.
- Proof: Decisive tests and focused command output.
- Trace: Test gate clauses.

### Rule card — promotion and cutover

- Surface: Slice completion and final package promotion.
- Rule: A slice is ready for dependents only when review has no blocking findings, required focused
  checks pass, and decisive proof is recorded against the named owner. Greenfield replacement is
  complete only after public behavior/types, failure lanes, cleanup, persistence, artifacts, CLI,
  React hosts, Stories, examples, packed consumers, browser behavior, and deletion proofs pass the
  final workspace gates.
- Accepts: A cutover decision backed by the complete set of production proofs.
- Rejects: package cutover claimed from one green focused test, typecheck, lint run, or source scan.
- Observable guarantee: Promotion preserves the contract pack as authority and makes no compatibility
  behavior or semantic choice without an owning contract.
- Proof: Named phase proofs, CLI-P02, PROOF-016/017, and final workspace gates.
- Trace: Completion and cutover clauses; PROOF_MATRIX.
