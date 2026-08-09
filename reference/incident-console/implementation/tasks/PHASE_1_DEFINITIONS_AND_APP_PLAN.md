# Phase 1 — Definitions, identity, types, and AppPlan

Status: waiting on Phase 0

## Objective

Implement the inert public definition language, exact type propagation, canonical refs,
and one pure compiled `AppPlan`. No runtime work may begin during definition construction
or compilation.

## Governing contracts

`GLO-*`, `API-003`–`API-012`, `TYPE-001`–`TYPE-010`, `TYPE-009A`, `TYPE-P04`,
`ARCH-001`–`ARCH-006`, `ARCH-027`,
`WIRE-001`–`WIRE-003`, `SNAP-008`, `SNAP-009`, `CUT-001`–`CUT-005`, `PROOF-001`,
`PROOF-002`, and `PROOF-017`.

## Allowed scope

Private vNext core definition/types, descriptor constructors, canonical key/ref code, pure app
compiler, focused type/runtime tests, and isolated packed type fixtures. The legacy root and React
routes stay frozen and executable until the all-route Phase 7 cutover.

Actor execution, resource store, transactions, React, story runner, server, inspection,
and CLI execution are forbidden.

## Tasks

- [ ] Enforce the flat grammar: final nodes are the only special state form; hierarchy, parallel regions,
      and shallow/deep history are rejected vNext grammar, while children and concurrent
      activities remain ownership tools rather than statechart emulation.
- [ ] Ensure resource descriptors expose no persistence predicate or selective
      omission policy; vNext captures complete canonical StoreState or fails its bound.
- [ ] Make AppPlan complete before runtime construction. Userland may
      asynchronously import modules before `app(...)`; a running runtime has no extension protocol.
- [ ] Implement `definition(...)`, exact derived state/event IDs, callable event constructors,
      definition-owned pure input/memory initialization, and `StateOf`/`EventOf`/`InputOf`/
      `MemoryOf` inference using implementation-owned `const` type parameters so ordinary
      userland literals require no `as const`, `satisfies`, or explicit generic arguments.
- [ ] Replace the machine overload family with the single
      `machine(definition, ({ S, E, activity }) => config)` constructor. Contextually type the
      kit from the already inferred definition; the behavior callback cannot redeclare memory,
      and descriptor definitions must not refer back to `MemoryOf<typeof machine>`.
- [ ] Implement canonical ref argument/key validation and immutable exact resource and
      transaction refs.
- [ ] Remove resource `key`, hashing, and equality projections. Resource identity is descriptor
      ID plus the frozen canonical lookup-argument tuple; transaction and activity key projections
      remain separate concepts.
- [ ] Implement exact machine-independent resource, transaction, stream, and child descriptors,
      plus view, module, and app definitions, without executing Effectful client callbacks.
      Machine-local selectors and outcome routes belong to inert activity bindings.
- [ ] Compile module roots and views, the transitive closure presented by their activity
      bindings and children, collisions, foreign references, routes, durable resolution,
      persistence version, and hidden Effect requirements into one immutable `AppPlan`.
- [ ] Implement optional exact `app.dynamicMachines` as an inert reachability and requirements
      seed. It creates no actor, supplies no input, adds no root, and accepts no thunk, factory,
      conditional registration, or live mutation.
- [ ] Require root `Input = void`; retain exact input for reachable dynamic machines.
- [ ] Add hostile positive/negative type fixtures, declaration-emit proofs, and a representative
      large-app `--extendedDiagnostics` baseline for type-instantiation regression checks.
- [ ] Keep vNext declarations behind a private package boundary through Phases 1–3. Inventory
      replaced overloads, registries, module inventory/meta, and app-layer assembly for Phase 4;
      do not publish declarations whose executable owners do not exist yet.

## Acceptance

- App compilation is pure and invokes no lookup, commit, stream, guard, selector, route,
  placeholder, tag, memory factory, or service callback.
- All collisions and foreign references inside the presented graph fail deterministically;
  `runtime.createActor` owns rejection of machines absent from that compiled closure.
- Ref identity is exact, durable, immutable, and shared by every new public type.
- Resource identity has no user projection that can collapse different lookup arguments.
- A statically admitted dynamic machine is creatable, contributes its complete requirements, and
  remains invalid for root lookup.
- `A`, `E`, `R`, input, memory, events, states, refs, and selected outputs remain exact.
- Invalid definitions fail locally without widening another type to `any`, `unknown`, or
  `never`.
- Packed declarations expose no private implementation types or deep-import requirement.

## Deletion obligations

Delete these from the private vNext implementation and record them for the Phase 7 public
cutover: `vocabulary`/`Vocabulary`, nested machine `define`, machine-owned memory configuration,
legacy machine overloads, standalone activity constructors, `createKey`, `createTag`, `outcomes`,
`after`, `patch`, `selectView`, resource key/equality projections, transaction `scope`, stream
`pressure`, module inventory/meta, derived app IDs, app-owned Layer assembly, and the process-global
resource registry. They remain frozen only on the legacy public route until Phase 4.

## Gates and receipt

Run focused definition/ref/compiler runtime tests, all positive/negative type fixtures,
source typecheck, package build, isolated private-vNext declaration proof, and the frozen legacy
packed consumers. The receipt includes the planned Phase 4 root export list, compiler collision matrix,
declaration excerpts, deleted symbols, and exact command exits.
