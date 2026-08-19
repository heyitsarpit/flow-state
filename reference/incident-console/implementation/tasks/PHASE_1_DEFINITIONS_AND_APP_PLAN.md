# Phase 1 — Definitions, identity, types, and AppPlan

Status: review corrections required; Phase 2 blocked

## Objective

Implement the inert public definition language, exact type propagation, canonical refs,
and one pure compiled `AppPlan`. No runtime work may begin during definition construction
or compilation.

## Governing contracts

`GLO-*`, `API-003`–`API-012`, `TYPE-001`–`TYPE-010`, `TYPE-009A`, `TYPE-P04`,
`ARCH-001`–`ARCH-006`, `ARCH-027`,
`WIRE-001`–`WIRE-003`, `SNAP-008`, `SNAP-009`, `CUT-001`–`CUT-004`, `PROOF-001`,
`PROOF-002`, `PROOF-005`, and `PROOF-017`.

## Allowed scope

Private vNext core definition/types, descriptor constructors, canonical key/ref code, pure app
compiler, focused type/runtime tests, and isolated packed type fixtures. The legacy root and React
routes stay frozen and executable until the all-route Phase 7 cutover.

Actor execution, resource store, transactions, React, story runner, server, inspection,
and CLI execution are forbidden.

## Tasks

- [x] Enforce the recursive compound-state grammar: ordinary leaves have no final-node completion
      semantics, compound states own direct `default` entries, and hierarchy is represented inside one
      actor. Subordinate-machine descriptors and child completion surfaces are rejected.
- [x] Ensure resource descriptors expose no persistence predicate or selective
      omission policy; vNext captures complete canonical StoreState or fails its bound.
- [x] Make AppPlan complete before runtime construction. Userland may
      asynchronously import modules before `app(...)`; a running runtime has no extension protocol.
- [x] Implement `definition(...)`, exact derived state/event IDs, callable event constructors,
      definition-owned pure input/memory initialization, and `StateOf`/`EventOf`/`InputOf`/
      `MemoryOf` inference using implementation-owned `const` type parameters so ordinary
      userland literals require no `as const`, `satisfies`, or explicit generic arguments.
- [x] Replace the machine overload family with the single
      `machine(definition, ({ S, E, activity }) => config)` constructor. Contextually type the
      kit from the already inferred definition; the behavior callback cannot redeclare memory,
      and descriptor definitions must not refer back to `MemoryOf<typeof machine>`.
- [x] Implement canonical ref argument/key validation and immutable exact resource and
      transaction refs.
- [x] Remove resource `key`, hashing, and equality projections. Resource identity is descriptor
      ID plus the frozen canonical lookup-argument tuple; transaction and activity key projections
      remain separate concepts.
- [x] Implement exact machine-independent resource, transaction, and stream descriptors,
      plus view, module, and app definitions, without executing Effectful client callbacks.
      Machine-local selectors and outcome routes belong to inert activity bindings.
- [x] Compile module roots and views, the transitive closure presented by their activity
      bindings, collisions, foreign references, routes, durable resolution,
      persistence version, and hidden Effect requirements into one immutable `AppPlan`.
- [x] Implement optional exact `app.dynamicMachines` as an inert reachability and requirements
      seed. It creates no actor, supplies no input, adds no root, and accepts no thunk, factory,
      conditional registration, or live mutation.
- [x] Require root `Input = void`; retain exact input for reachable dynamic machines.
- [x] Add hostile positive/negative type fixtures, declaration-emit proofs, and a representative
      large-AppPlan-carrier `--extendedDiagnostics` baseline for type-instantiation regression
      checks. Phase 6 extends the same gate with story and fixture carriers.
- [x] Keep vNext declarations behind a private package boundary through Phases 1–3. Inventory
      replaced overloads, registries, module inventory/meta, and app-layer assembly for Phase 4;
      do not publish declarations whose executable owners do not exist yet.

## Acceptance

- App compilation is pure and invokes no lookup, commit, stream, guard, selector, route,
  placeholder, tag, memory factory, or service callback.
- All collisions and foreign references inside the presented graph fail deterministically;
  AppPlan records the exact creation-authority closure, while Phase 2 `runtime.createActor` owns
  runtime rejection of machines absent from it.
- Ref identity is exact, durable, immutable, and shared by every new public type.
- Resource identity has no user projection that can collapse different lookup arguments.
- A statically admitted dynamic machine is marked host-creatable by AppPlan, contributes its
  complete requirements, and remains absent from the compiled root set. Runtime creation and
  root-lookup rejection are Phase 2 proofs.
- `A`, `E`, `R`, input, memory, events, states, refs, and selected outputs remain exact.
- Invalid definitions fail locally without widening another type to `any`, `unknown`, or
  `never`.
- Packed declarations expose no private implementation types or deep-import requirement.

## Post-implementation review corrections

The independent review recorded `SP-B026`–`SP-B029` and `SP-N004` in `../SCRATCHPAD.md`.
They are Phase 1 corrections, not permission to start runtime work:

- [ ] Replace record-level `JSON.stringify` canonical emission with the WIRE-001A manual emitter
      and add the missing byte-exact hostile goldens.
- [ ] Reject forged, foreign-kit, and structurally similar activity bindings before a machine or
      AppPlan retains them.
- [ ] Make `FlowUsageError` recognition nominal so hostile reflection failures cannot spoof the
      package-owned error surface.
- [ ] Validate event payload descriptors without invoking accessors or copying symbol properties.
- [ ] Add descriptor-only activity overloads for zero-argument transactions and zero-parameter
      streams, with an optional exact outcomes object and no selector/key; reject subordinate-machine
      descriptors and child completion options.
- [ ] Add negative declaration and compiler proofs for deleted child inputs, lifecycle, completion,
      snapshot, address, persistence, Story, and artifact fields; prove recursive substates remain one
      actor with no child-equivalent owner.
- [ ] Clean declaration/performance temporary directories and run the named thermo-nuclear review
      before rerunning every Phase 1 gate and amending the receipt.

Implementation hint, not a gate: consolidate descriptor and timer duration conversion behind the
ARCH-028 normalizer while keeping definition/AppPlan/compiler work as plain synchronous TypeScript.

## Deletion obligations

Delete these from the private vNext implementation and record them for the Phase 7 public
cutover: `vocabulary`/`Vocabulary`, nested machine `define`, machine-owned memory configuration,
legacy machine overloads, standalone activity constructors, `createKey`, `createTag`, `outcomes`,
`after`, `patch`, `selectView`, resource key/equality projections, transaction `scope`, stream
`pressure`, module inventory/meta, derived app IDs, app-owned Layer assembly, and the process-global
resource registry. They remain frozen only on the legacy public route until the atomic Phase 7
cutover.

## Gates and receipt

Run focused definition/ref/compiler runtime tests, all positive/negative type fixtures,
source typecheck, package build, isolated private-vNext declaration proof, and the frozen legacy
packed consumers. The receipt includes the planned Phase 7 root export list, compiler collision matrix,
declaration excerpts, deleted symbols, and exact command exits.
