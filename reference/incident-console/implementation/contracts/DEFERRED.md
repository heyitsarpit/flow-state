# Deferred guarantees

Status: non-normative record of guarantees deliberately removed or relaxed by the
feature-preserving simplification authorized in `flow-state-e7p.8`.

The public routes and feature families inventoried by `CONTRACT.md` remain in scope.
The entries below are not implementation or proof obligations. They may return only
through a separately accepted contract change after the listed trigger exists. This
file records removed complexity; it does not promise future work.

## DEF-001 — Trusted gateway import policing

- Removed: source scanning for computed dynamic imports and non-literal `require`,
  dependency-manifest graph traversal, undeclared transitive bare-import rejection,
  and ancestor `node_modules` resolution policing.
- Previous owner: `CLI.md` `CLI-003`; `CONTRACT.md` command-line gateway loading.
- Retained: canonical project-root containment, regular `.ts`/`.mts` gateway files,
  trusted unsandboxed execution, Flow/Effect package identity, branded gateway and
  app/Story validation, artifact-only inertness, and temporary-output cleanup.
- Revisit only if: Flow offers an explicit sandbox, hermetic build mode, or security
  claim for executing untrusted gateway code.

## DEF-002 — Hostile JavaScript carrier reflection

- Removed: compatibility guarantees for proxies, throwing getters, descriptors,
  accessors, symbol properties, sparse arrays, custom prototypes, reserved prototype
  behavior, and concurrent mutation passed directly to private persistence or
  artifact decoder functions.
- Previous owner: `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-014`–`WIRE-016` hostile-carrier
  rules and their repeated proof vectors.
- Retained: public byte/file input passes through strict UTF-8, one supported
  compression member, decompressed-byte bounds, JSON parsing, and one package-private
  Effect Schema decoder into fresh package-owned canonical data. Malformed,
  unsupported, cyclic, or over-bound public input fails before runtime mutation with
  stable diagnostic category and available path/bound data.
- Revisit only if: a public API accepts arbitrary live JavaScript object graphs as an
  untrusted persistence or artifact carrier.

## DEF-003 — Full codec-vector multiplication across hosts

- Removed: repeating every ASCII, multibyte, Unicode spelling, lone-surrogate, and
  exact-limit codec vector independently under Node, Bun, Deno, Chromium, Gecko, and
  WebKit.
- Previous owner: `IMPLEMENTATION_WORKFLOW.md` portable text rule and
  `PROOF_MATRIX.md` `PROOF-014` host matrix.
- Retained: the full vector suite runs against the shared production codec on the
  pinned Node toolchain. Every other advertised host executes that same compiled
  codec against a compact portability fixture and records its version.
- Revisit only if: a host-specific codec or text implementation is introduced, or a
  portability failure shows that the shared fixture cannot detect meaningful drift.

## DEF-004 — Prescribed runtime internals

- Removed: exact private phase names, exactly one `ManagedRuntime`, named shell cell
  types, a fixed `Queue`/`SubscriptionRef`/`Deferred` topology, an exact `runSync`
  count, and source-shape proofs for those choices.
- Previous owner: `ARCHITECTURE.md` `ARCH-007`, `ARCH-007A`, `ARCH-024`, and related
  topology prose.
- Retained: inert synchronous construction, at-most-once readiness with cached
  terminal `Exit`, no usable handle before readiness, one coherent lifetime owner,
  reverse rollback, and exact cleanup on failure, interruption, and disposal.
- Revisit only if: multiple valid implementations produce observably different
  ownership, readiness, or cleanup behavior that cannot be constrained directly.

## DEF-005 — Unobservable commit micro-order

- Removed: contractual ordering of permit reservation, store command, issue
  materialization, snapshot assignment, evidence-hub acceptance, reconciliation
  enqueue, acknowledgement, release-gate opening, and StoreFanout release when an
  intermediate step is not observable.
- Previous owner: `SEMANTICS.md` `SEM-004`, `ARCHITECTURE.md` `ARCH-022`, and
  `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-017`–`WIRE-020`.
- Retained: one atomic actor/store cut, FIFO and causal ordering, committed evidence
  only, acknowledgement after publication/evidence acceptance and before user Effect
  settlement, non-blocking isolated sinks, causal StoreFanout, and disposal drain.
- Revisit only if: a new public receipt, transaction, or observation surface exposes
  one of the currently private intermediate phases.

## DEF-006 — Duplicate semantic proof ownership

- Removed: repeating one invariant's complete positive, negative, race, and boundary
  matrix in focused tests, phase validators, packed consumers, examples, browser
  runs, CLI tests, deletion scans, and final verification.
- Previous owner: `PROOF_MATRIX.md` local crosswalk/gate layers,
  `IMPLEMENTATION_WORKFLOW.md` completion gates, and phase-validation Beads.
- Retained: one named executable production-owner proof per invariant. Packed,
  browser, Story, and CLI gates prove public reachability and host integration; they
  retain dedicated cases for failures unique to those integrations.
- Revisit only if: the owning proof cannot exercise a materially different public or
  host boundary.

## DEF-007 — Exact TypeScript benchmark arithmetic

- Removed: the mandatory 25-machine/100-descriptor fixture, exact ten-percent
  instantiation window, and doubled-root ratio below 2.25.
- Previous owner: `TYPE_SYSTEM.md` `TYPE-P03`.
- Retained: representative small and medium fixtures cover every public inference
  family and ordinary invalid use. One medium fixture records extended diagnostics
  on the pinned compiler and fails on a material checked-in regression or excessive
  instantiation/declaration failure.
- Revisit only if: inference-cost regressions escape the representative fixture or a
  stable performance budget is derived from measured consumer projects.

## DEF-008 — Exact internal capacity cutoffs

- Removed: compatibility promises for the precise failure point of internal prepared
  command, retention, and batch capacities when the API does not expose that bound.
- Previous owner: React prepared-mailbox 64/65 rules and internal capacity boundary
  vectors in host, testing, evidence, and validation proofs.
- Retained: every potentially unbounded mechanism is bounded, supports at least its
  documented ordinary capacity, and fails without partial mutation. Caller-supplied
  bounds, public Story/model defaults, and external byte/decompression/node/depth
  limits remain exact.
- Revisit only if: clients must size or negotiate an internal buffer, or a wire/public
  API exposes the exact capacity as data.

## DEF-009 — Human-prose compatibility

- Removed: byte-stable human error messages, CLI prose, whitespace, and human-field
  ordering; exhaustive snapshots whose only assertion is exact wording.
- Previous owner: `PUBLIC_API.md` `AMEND-API-002`, `CLI.md` `CLI-007`/`CLI-008`, and
  their proof rows.
- Retained: stable `_tag`, code, path, structured details, canonical CLI JSON, exit
  status, stdout/stderr ownership, one-document writes, actionable non-empty human
  text, newline termination, and no ANSI for non-interactive output.
- Revisit only if: Flow explicitly publishes a human-text compatibility format for
  shell parsing. Canonical JSON remains the machine interface.

## DEF-010 — Dual truncation-marker semantics

- Removed: separate greatest-dropped inspection semantics and first-omitted trace
  semantics, arithmetic conversion rules between them, and one-CAS or exact drain
  algorithm requirements.
- Previous owner: `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-017`–`WIRE-020` and v2 trace
  artifact clauses.
- Retained: inspection and trace use `truncatedBeforeSequence`; it is `null` exactly
  when nothing was omitted and otherwise equals the greatest omitted runtime-global
  sequence. `trace proof` rejects any non-null marker. Snapshot, clear, attach,
  detach, drain, and sink failure remain atomic and isolated.
- Revisit only if: an already-shipped artifact version requires the old first-omitted
  interpretation. Any migration must use an explicit version boundary.

## DEF-011 — Serialized Effect Cause traversal

- Removed: mirroring Effect `Cause` tree shape, traversal order, fiber ordinals, and
  multiplicity as the stable artifact/CLI `CauseProjection` wire contract.
- Previous owner: `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-020A/B`, `SEMANTICS.md`
  `SEM-023`, and `PROOF_MATRIX.md` artifact/CLI rows.
- Retained: full `Cause` remains in-process until classification and cleanup
  aggregation complete; the two documented public in-process errors retain it.
  Serialized evidence contains ordered stable Flow diagnostics with classification,
  code, path, structured details, and optional human summary. Independently
  actionable cleanup diagnostics preserve order and multiplicity.
- Revisit only if: a supported external consumer needs lossless Effect-internal Cause
  reconstruction and accepts explicit Effect-version coupling.

## DEF-012 — Repeated historical absence inventories

- Removed: copying the complete historical deletion inventory and broad name-search
  matrix into every ordinary implementation and validation Bead.
- Previous owner: `COMPATIBILITY_AND_DELETIONS.md`, `PROOF_MATRIX.md` `PROOF-017`, and
  phase/cutover Beads.
- Retained: the deletion ledger remains authoritative, public export/declaration
  negatives prove removed surfaces, and final cutover performs one mapped
  no-consumer/absence audit. Feature owners prove only deleted behavior intersecting
  their changed boundary.
- Revisit only if: a removed surface reappears or a compatibility layer is proposed.
