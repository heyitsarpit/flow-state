# Cross-phase type inference gates

[Back to the plan tracker](../TASK.md)

Authority: this is the sole `TI-*` and cross-phase inference acceptance ledger. Runtime shape is stabilized before declarations and packed consumers are finalized.

## Cross-phase type inference acceptance

These ten themes remain first-class checks, but are implemented only inside the
concrete packets below. `TYPE_INFERENCE_CONTRACT.md` supplies the detailed matrix.

### 1. Constructor inference matrix

- [ ] `TI-1` Resource, transaction, stream, machine, child, and view constructors
      pass input-first positive/negative fixtures while preserving explicit
      generic fallbacks and the existing API.

### 2. Cross-definition type propagation

- [ ] `TI-2` Definition types propagate through refs, bindings, routes, actors,
      snapshots, runtime, testing, React, server, inspection, and fixtures without
      restatement or untyped intermediate descriptors.

### 3. Impossible-lane elimination

- [ ] `TI-3` Type-level `never` removes only expressible typed lanes; possible
      lanes remain required and defects/interruption/cleanup remain represented.

### 4. Exact callback-family inputs

- [ ] `TI-4` Each callback receives its exact family inputs, unsafe narrower
      callbacks fail locally, and no universal/bivariant owner bag widens inputs.

### 5. Exact Effect and Layer inference

- [ ] `TI-5` Exact Effect/Stream success, typed error, requirements, and Layer
      provision survive public declarations and semantic seams without erasure.

### 6. Module and app inference

- [ ] `TI-6` Module keys, definition maps, dependencies, app lookups, fixtures,
      and Layer requirements remain exact and stable across module reorder.

### 7. Testing inference

- [ ] `TI-7` Tests infer machine/resource/transaction/stream/child/view/app
      contracts and reject wrong owners, fixtures, states, events, and outcomes.

### 8. React inference

- [ ] `TI-8` Actor snapshots/send, resource values, view outputs, and runtime
      compatibility remain exact from packed React 18/19 declarations.

### 9. Declaration portability and compiler correctness

- [ ] `TI-9` Source and packed declarations remain nameable and portable without
      TS7056, private-name leaks, excessive-depth failures, erased requirements,
      restated public generics, or compiler crashes.

### 10. Dedicated positive and negative type suites

- [ ] `TI-10` Focused family suites cover source and packed declarations; each
      negative proves one intended error and cannot silently stop failing.

### Type-theme execution details

| Theme | Owning packets                            | Required proof                                                                                                                                                  |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TI-1  | P1A.4c, P2.4, P3A.2, P3B.3, P3D.1, P4B.2  | One inferred call, one explicit-generic compatibility call, one wrong upstream input, and one wrong downstream result per constructor family                    |
| TI-2  | Every family packet plus P4A–D            | Reuse the authored definition through ref/binding/runtime/adapter without restating generics; assert exact output and reject wrong owner                        |
| TI-3  | P2.4, P3B.3, P3D.1                        | `never` removes only the typed lane; defect/interruption/finalizer evidence remains in runtime tests and public types                                           |
| TI-4  | P2.4, P3A.2, P3B.3                        | Add one unsafe-narrower regression before replacing each bivariant helper; do not perform a global variance rewrite                                             |
| TI-5  | P1D.1b and each async family              | Assert exact success/error/requirements before and after the owner seam; verify Layer provision leaves only unprovided requirements                             |
| TI-6  | P0.3 and P1C.1                            | Assert exact literal module keys/IDs, definition lookup, fixture names, reorder stability, dependency errors, and app Layer requirements                        |
| TI-7  | Family delegation packets and P4A.1       | Source and packed testing calls infer exact machine/app families and reject wrong-app fixtures, events, states, refs, and outcomes                              |
| TI-8  | P4B.1d/P4B.2                              | Packed React 18 and 19 consumers infer actor send/snapshot, resource values, view outputs, and provider/runtime compatibility                                   |
| TI-9  | Every packed type packet and P5.4 closure | Emit the same public definition from source and packed entry points; reject TS7056/private names/excessive depth without annotations that erase exact types     |
| TI-10 | Every type packet                         | Each negative fixture has one expected diagnostic or a local `@ts-expect-error` whose disappearance fails the suite; run against source and packed declarations |

Shared type files are `packages/flow-state/src/core/api/**`, public entry points,
`packages/flow-state/src/public-api-types.test.ts`, and
`packages/flow-state/src/public-typing-architecture.test.ts`. A family packet
may edit only its relevant API file and directly affected consumers. Any change
to `FlowMachine`, `FlowAppDefinition`, or common conditional helpers requires a
strong-model review plus `T`, `P`, `E`, and `V` before phase closure.

---
