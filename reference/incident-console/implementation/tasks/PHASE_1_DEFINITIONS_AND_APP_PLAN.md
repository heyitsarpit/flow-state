# Phase 1 — Definitions, identity, types, and AppPlan

Status: waiting on Phase 0

## Objective

Implement the inert public definition language, exact type propagation, canonical refs,
and one pure compiled `AppPlan`. No runtime work may begin during definition construction
or compilation.

## Governing contracts

`GLO-*`, `API-003`–`API-012A`, `TYPE-001`–`TYPE-010`, `ARCH-001`–`ARCH-006`,
`WIRE-001`–`WIRE-003`, `SNAP-008`, `SNAP-009`, `CUT-001`–`CUT-005`, `PROOF-001`,
`PROOF-002`, and `PROOF-017`.

## Allowed scope

Public core definition/types, descriptor constructors, canonical key/ref code, pure app
compiler, entry-point exports, focused type/runtime tests, and packed type fixtures.

Actor execution, resource store, transactions, React, story runner, server, inspection,
and CLI execution are forbidden.

## Tasks

- [ ] Implement vocabulary tokens, exact derived IDs, callable event constructors, and
      `StateOf`/`EventOf` inference.
- [ ] Replace the machine overload family with the vocabulary-bound callback grammar and
      typed `memory: ({ input })` initializer.
- [ ] Implement canonical ref argument/key validation and immutable exact resource and
      transaction refs.
- [ ] Implement exact resource, transaction, stream, child, view, module, and app definitions
      without executing client callbacks.
- [ ] Compile module roots and views, transitive descriptors and children, collisions,
      reachability, routes, durable resolution, persistence version, and hidden Effect
      requirements into one immutable `AppPlan`.
- [ ] Require root `Input = void`; retain exact input for reachable dynamic machines.
- [ ] Add hostile positive/negative type fixtures and declaration-emit proofs.
- [ ] Remove replaced overloads, global registries, module inventory/meta and app-layer
      assembly only when no later runtime path depends on them; otherwise isolate deletion as
      an explicit Phase 2 prerequisite without leaving them public.

## Acceptance

- App compilation is pure and invokes no lookup, commit, stream, guard, selector, route,
  placeholder, tag, or service callback.
- All descriptor/root collisions and unreachable/foreign definitions fail deterministically.
- Ref identity is exact, durable, immutable, and shared by every new public type.
- `A`, `E`, `R`, input, memory, events, states, refs, and selected outputs remain exact.
- Invalid definitions fail locally without widening another type to `any`, `unknown`, or
  `never`.
- Packed declarations expose no private implementation types or deep-import requirement.

## Deletion obligations

Delete or make unreachable from public entry points: legacy machine overloads, `createKey`,
`createTag`, `outcomes`, `after`, `patch`, `selectView`, module inventory/meta, derived app
IDs, app-owned Layer assembly, and the process-global resource registry.

## Gates and receipt

Run focused definition/ref/compiler runtime tests, all positive/negative type fixtures,
source typecheck, package build, isolated declaration proof, and all affected packed
consumers. The receipt includes the final export list, compiler collision matrix,
declaration excerpts, deleted symbols, and exact command exits.
