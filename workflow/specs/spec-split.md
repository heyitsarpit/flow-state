# Spec split for production (phases 3 and 4)

Status: current. The split is the runner's call (delegated to the Specs lead), not a decision the user
made. Every Spec it names is a guide: building may show a guarantee or a boundary wrong, and then the
Spec changes, with the change and its reason recorded in `spec-log.md`.

Scope: Specs exist only for what phases 3 and 4 build next, the core modules of the roadmap's phase 4
and what phase 3's conformance rewrite needs to test them. Feature areas get their Spec when their
phase starts. Over-designing ahead of building is avoided on purpose: the prototype showed that
decisions such as a pure TypeScript core are only knowable after building.

## How the split was drawn

`to-spec` splits where contracts evolve independently. The core has ten such contracts:

- what the compiler accepts and emits is independent of how a turn runs it;
- a turn is a pure function of a snapshot and an input; the actor runtime around it (mailboxes,
  lifetime, disposal) changes without changing turn semantics;
- a write lane's cells change without changing reads, and the reverse;
- write-ahead and capture (what is written, and when) change independently of restore's version,
  shape and quarantine rules;
- the failure carrier, the bounded codec and the static CLI are each consumed by every other module
  and change on their own.

Phase 4's module list maps onto these Specs as follows. "Fragments" has no Spec of its own: a
fragment's declaration is a compile contract and its incarnations are turn semantics, so it is
covered by Compile and Turn.

| Phase 4 module                        | Spec                     |
| ------------------------------------- | ------------------------ |
| Compiled and the compiler             | Compile                  |
| lane, step and turn                   | Turn, Actors, WriteLanes |
| persistence edge, write-ahead, driver | WriteAhead, Actors       |
| restore and key versions              | Restore                  |
| fragments                             | Compile, Turn            |
| operations                            | Reads, WriteLanes        |
| CLI check, explain, graph             | StaticCli                |
| (used by all)                         | Diagnostics, Codec       |

## The Specs

Each plan outcome lands in exactly one Spec, or in one area of the list below. Where a core Spec
places an outcome but leaves some of its clauses for later, the list names those clauses. Paths
are under `workflow/specs/core/`.

1. **Compile** (`Compile.spec`): `definition`, `machine`, fragments, `app`, and the `Compiled`
   data view. Provides construction errors, inert construction and the closed app list.
   From @plan.Machines.O1 and @plan.Runtime.O1.
2. **Turn** (`Turn.spec`): one actor's turn over a snapshot: states, transitions, the turn
   algorithm, guards and `check`, schedules, placements and the owner test, `onContext`
   reactions, the snapshot. From @plan.Machines.O2, O3, O4, O5, O6, O7 and O8.
3. **Actors** (`Actors.spec`): the Runtime around turns: setup and readiness, identity and
   lifetime, mailboxes and send, context propagation, disposal, isolation.
   From @plan.Runtime.O2, O3, O4, O5, O6 and O7.
4. **WriteLanes** (`WriteLanes.spec`): commits, endings, the Attempt, lane cells, members,
   cancellation. From @plan.Operations.O3 and O7.
5. **Reads** (`Reads.spec`): contracts and keys, shared lookups, read endings, optimistic
   endings, rows: the parts the prototype proved. From @plan.Operations.O1, O2, O5 and O6; the
   unproved parts of those outcomes are listed below under "written when their phase starts".
6. **WriteAhead** (`WriteAhead.spec`): persistence configuration, what a record holds, capture
   and its batching, durable Attempts. From @plan.Persistence.O1, O2, O3 and O6.
7. **Restore** (`Restore.spec`): restore without replay, record formats, versions, saved-shape
   resets, quarantine, storage failures. From @plan.Persistence.O4 and O5.
8. **Diagnostics** (`Diagnostics.spec`): FlowError, Diagnostic, the code vocabulary, Cause
   survival, safe rendering. From @plan.Diagnostics.O1, O2, O3 and O4.
9. **Codec** (`Codec.spec`): the one bounded canonical codec. From @plan.Inspection.O2.
10. **StaticCli** (`StaticCli.spec`): `flow graph`, `flow check`, static `flow explain`, result
    format and config discovery. From @plan.CommandLine.O1, O3, O5 and O6.

Cross-Spec consistency points, each stated once in its owner and cited by the others:
- the 100 ms grace and "use" (Actors); a turn never reads them;
- the lane cell table (WriteLanes); Turn validates members through it, Actors delivers endings,
  WriteAhead persists lanes, Restore re-delivers;
- the delivery order at restore (Restore) and at disposal (Actors); both put the ending that
  leaves a hold last;
- the codec's bounds (Codec); WriteAhead's scope bounds are its own, and its records obey Codec's;
- identity versions (Actors R11) and what the boot does with old versions (Restore R6);
  `dispose({ forget: true })` (Restore R10); Attempt id uniqueness (WriteLanes R5);
- each Spec's requirement sources name only the plan outcomes it places, and each public name is
  provided by one Spec (`transaction` by Reads).

## Written when their phase starts

These areas have no Spec now. Each will draw from the plan outcomes listed.

| Area                                          | Phase                                      | Plan outcomes                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reads built later (unproved by the prototype) | 4, when the operations module reaches them | the staleTime, gcTime, trailing refetch, setData, invalidate, clear, write batch (256 bound), placeholder, contract.get, key size bound and InvalidKey, focus and connection trigger, and optimistic stacking clauses of @plan.Operations.O1, O2, O5 and O6 |
| Streams                                       | 5                                          | @plan.Operations.O4                                                                                                                                                                                                                                         |
| Entity store                                  | 5                                          | @plan.EntityDomains.O1 to O5, and the record-queue, Overloaded and ModuleDisabled clauses of @plan.Operations.O3                                                                                                                                            |
| Multi-tab and sessions                        | 5                                          | @plan.Persistence.O7                                                                                                                                                                                                                                        |
| Host adapters (IndexedDB, in-memory)          | 5                                          | the `layerIndexedDb` part of @plan.Persistence.O1                                                                                                                                                                                                           |
| Stories, `flow story`, `flow trace`           | 5                                          | @plan.Testing.O1 to O4, O6 to O9; @plan.CommandLine.O2 and O4                                                                                                                                                                                               |
| React and Next.js                             | 5                                          | @plan.React.O1 to O5                                                                                                                                                                                                                                        |
| Server rendering                              | 5                                          | @plan.ServerRendering.O1 to O7                                                                                                                                                                                                                              |
| Lazy features                                 | 5                                          | @plan.LazyFeatures.O1 to O5                                                                                                                                                                                                                                 |
| Inspection                                    | 5                                          | @plan.Inspection.O1, O3, O4, O5 and O6                                                                                                                                                                                                                      |
| Package routes                                | 9                                          | @plan.Package.O1 to O4                                                                                                                                                                                                                                      |

The core Specs cite these areas where a core guarantee meets them (a domain write's record queue, a
stream session's release), and leave the feature's own rules to its future Spec.

Open for the server-rendering Spec, not settled now (carried from the plan merge):
1. Does `dehydrate` wait only for work to settle (@plan.ServerRendering.O2: "future schedules do
   not delay settling"), or also move time deadline by deadline (@plan.Testing.O7; design 2.10.3
   and 2.10.11 say the Story step does)?
2. Is a hydration admission failure reported as `HydrationRejected` with a fallback to client
   loading (@plan.ServerRendering.O4, @plan.Diagnostics.O2), or rethrown to a React error
   boundary (@plan.React.O5)?
3. Which plan owns `Hydrate`'s contract: @plan.ServerRendering.O4 (where it is written),
   @plan.React (its route's behaviour owner), with @plan.Package.O1 listing only the name?

## Out of production scope

- @plan.FlowState.O1 (code disposition) and @plan.FlowState.O2 (build stages): process rules,
  owned by the roadmap, not module behaviour.
- @plan.Testing.O5: removed (models are cut).

## Phase 3's use

The conformance rewrite tests these Specs through its `Port`, with one oracle per guarantee and the
wrong runtime it must fail on beside it. Each Spec's tests name prototype cases and wrong runtimes
from `packages/flow-state-v3/prototypes/` as the reference for how a guarantee was proven. Where a
test says "no prototype wrong runtime", phase 3 writes one.

## Prior art

`specs/runtime/Runtime.spec` was derived from the frozen `workflow/plans/rewrite` plans. It is
superseded as a whole by these Specs and kept unchanged except for a basis line that says so.
