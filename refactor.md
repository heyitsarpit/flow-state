# Runtime rewrite plan

Status: active Phase 2.2 implementation contract (`flow-state-e7p.27`)

This document defines the final shape of the Flow State runtime rewrite. It is
not a file-move checklist. Copying existing behavior into `runtime-next/` is an
implementation technique; the result is accepted only when it has the smaller
owner graph, internal ports, dependency direction, and deletion outcomes
defined here.

## Decision

Close Phase 2.1 at one recorded commit, freeze
`packages/flow-state-rewrite/src/runtime/`, and build the replacement in
`packages/flow-state-rewrite/src/runtime-next/`.

The frozen runtime remains:

- the current public implementation until the Phase 5 facade promotion
- the behavioral and type reference for extracting rewrite test scenarios
- read-only during the rewrite

The new runtime is not a second live authority. Do not import it into the
frozen runtime, share mutable state between the trees, or install a
process-global registry. The frozen test suite establishes the recorded
baseline. New scenario tests exercise `runtime-next/` on its own; this phase
does not build a harness that runs or compares both implementations.

Use a new tree because the change replaces authority boundaries, not isolated
functions. An in-place sequence would need the old wide registry, split
engine/cell/controller state, and package-private owner seam to stay callable
while their state transitions are being removed. That forces compatibility
adapters into the production import graph and makes an intermediate mixed-owner
runtime the thing being tested. `runtime-next/` lets each final owner compile
against its final narrow port while the frozen tests remain a behavior source.
The price is temporary duplication, controlled by the one-way import rule, the
line/concept budget, extracted scenario coverage per slice, and a mandatory
deletion-only cutover. If the new tree begins preserving the old protocols
behind wrappers, stop: that has lost the reason for a parallel rewrite and
should become an in-place cleanup instead.

The rewrite preserves established behavior while changing internal ownership.
It implements the final-shaped runtime and actor facade inside `runtime-next/`
so later phases can depend on it, but it does not widen the package root during
the runtime rewrite. The active public shell remains `app`, `construct()`, and
`ready()` until Phase 5 promotes the API-011/API-012 surface after its owners,
operation kernels, persistence/evidence behavior, and host proofs exist. Phase
6 then performs deletion and absence cutover. Implementation slices may not
invent further exports. A semantic defect discovered during the port and not
named under approved corrections below is recorded separately and is not
silently repaired as part of a refactor slice. Normative contract vocabulary
also survives: in particular, `ActorEngine` remains the actor owner named by
`ARCH-012`; the rewrite simplifies that owner instead of replacing it with a
competing `ActorCell` concept.

## Baseline gate

Do not begin implementation until the completed Phase 2.1 snapshot has:

1. an exact Git commit or tag
2. a recorded `git status --short`
3. a green `nub run --no-check fmt:check`
4. a green rewrite-package typecheck and relevant runtime tests
5. a recorded result for `nub run lint`, including any independently owned
   baseline failures

The shared worktree may contain unrelated changes. Preserve them. A refactor
slice may not hide an existing failure with a new suppression or claim a green
baseline from a narrower check.

## Scope

### Included

- the runtime facade and composition root
- runtime readiness and shutdown ownership
- actor identity and admission ownership
- actor mailbox, publication, lifecycle, and activity ownership
- context graph planning and wave coordination
- evidence records, copying, sequencing, acceptance, and delivery
- pure turn planning
- private runtime services and Layer composition
- the final-shaped internal runtime and actor facades defined below
- a complete frozen-test scenario inventory and executable `runtime-next/` proofs

### Excluded

- changes to `packages/flow-state/`
- changes to normative contracts
- StoreKernel, StoreFanout, persistence codecs or storage, React, SSR, Stories,
  or CLI
- package-root export changes before the Phase 5 promotion
- public exports beyond the exact Phase 5 facade defined below
- generated output edited by hand
- deleting the frozen runtime before the dedicated cutover slice

Future phases may use the new owner boundaries. They may not be preimplemented
inside this rewrite.

### Approved semantic corrections

Preserving established behavior is the default, with five explicit correction groups:

1. Complete the final-shaped runtime/actor facade internally, preserve the
   separate owner lease, derive fresh snapshots internally, and represent
   synchronous send rejection as `Result` instead of throwing. Phase 5, not a
   runtime owner slice, promotes that facade through the package root.
2. Remove the post-store failure window: prepared evidence and context
   publication become total, and observer failure cannot close or roll back a
   committed actor.
3. Bound/coalesce snapshot and context queues, and replace caller-sized
   recursive traversals with iterative worklists.
4. Scope local refs, attachment tokens, runtime ownership, counters, and
   disposal authority to their real owner instead of process-global maps.
5. Replace silent drops or indefinite waits with typed rejection and diagnostics
   that name the retained participant, actor key, or credit.

Each correction gets a dedicated `runtime-next/` test expectation that records
the frozen behavior and the new requirement. Any other behavior change requires
a separate decision before implementation.

## Final runtime facade and Phase 5 public surface

The current rewrite package exposes construction and readiness but hides every
useful runtime operation behind the package-private `runtimeOwner()` seam. That
is an incomplete facade, not a compatibility contract. `runtime-next/`
implements the complete shape behind its own test adapter now so Phase 3 and
Phase 4 can depend on the real boundary instead of `runtimeOwner()`. The package
root remains unchanged until Phase 5 promotes this exact facade without
exporting an internal owner. Phase 6 removes the frozen implementation and
proves its paths and symbols absent.

Existing definition, machine, operation, app, implementation, and diagnostic
exports remain unchanged. The runtime-related part of the final root is:

```ts
export { Diagnostic, actorRef, runtimeSetup };
export type {
  ActorContextSources,
  ActorHandle,
  ActorRef,
  ActorSnapshot,
  ActorStartOptions,
  DispatchReceipt,
  Runtime,
  RuntimeSetup,
};
```

The semantic shape implemented internally now and promoted publicly in Phase 5
is:

```ts
interface Runtime<A extends App, ImplementationError = never> {
  readonly app: A;

  ready(): Effect.Effect<void, ImplementationError | Diagnostic>;
  createActor<DefinitionValue extends MachineDefinition>(
    machine: Machine<DefinitionValue>,
    options: ActorStartOptions<DefinitionValue>,
  ): Effect.Effect<
    Readonly<{
      actor: ActorHandle<DefinitionValue>;
      dispose(): Effect.Effect<void, Diagnostic>;
    }>,
    ImplementationError | Diagnostic
  >;
  ensureActor<DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
    options: ActorStartOptions<DefinitionValue>,
  ): Effect.Effect<
    Readonly<{
      actor: ActorHandle<DefinitionValue>;
      dispose(): Effect.Effect<void, Diagnostic>;
    }>,
    ImplementationError | Diagnostic
  >;
  getActor<DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ): Effect.Effect<ActorHandle<DefinitionValue> | undefined, ImplementationError | Diagnostic>;
  dispose(): Effect.Effect<void, ImplementationError | Diagnostic>;
}

interface ActorHandle<DefinitionValue extends MachineDefinition> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>, Diagnostic>;

  send(event: EventOf<DefinitionValue>): Result.Result<void, Diagnostic>;
  dispatch(event: EventOf<DefinitionValue>): Effect.Effect<DispatchReceipt, Diagnostic>;
  snapshot(): ActorSnapshot<DefinitionValue>;
  flush(): Effect.Effect<void, Diagnostic>;
}
```

The anonymous `{ actor, dispose }` result above is the public owner lease shape
required by API-011. `ActorLease` remains the private authority that backs it;
the package root does not add an `ActorLease` type export. `createActor()` and
`ensureActor()` return owner leases. `getActor()` returns only a non-owning
handle and never grants disposal authority.

The existing `Diagnostic` value gains a same-name public type projection of the
safe diagnostic fields. Runtime signatures do not export the private
classification field or a second error hierarchy.

The start-option relationship is fixed even if the implementation spells the
conditional aliases differently:

```ts
type ActorContextSources<DefinitionValue extends MachineDefinition> = {
  readonly [Slot in keyof DefinitionValue["context"]]: ActorRef<
    Machine<ProviderDefinitionOf<DefinitionValue["context"][Slot]>>
  >;
};

type ActorStartOptions<DefinitionValue extends MachineDefinition> = Readonly<
  ([InputOf<DefinitionValue>] extends [void]
    ? { readonly input?: never }
    : { readonly input: InputOf<DefinitionValue> }) &
    (keyof DefinitionValue["context"] extends never
      ? { readonly context?: never }
      : { readonly context: ActorContextSources<DefinitionValue> })
>;
```

`ProviderDefinitionOf` is a private type projection over the already-public
context selector declaration; it is not another runtime value or export.

`ActorStartOptions` is a public fresh-start value, not the package-private
runtime assembly options. It contains only:

- the machine-derived `input`, required exactly when `InputOf<DefinitionValue>`
  is non-void
- `context`, required exactly when the consumer definition declares context
  slots

`ActorContextSources` maps each declared consumer slot to the matching provider
`ActorRef`. The runtime obtains the selector from the consumer definition and
the current provider fence from `ActorDirectory`; callers never supply a
selector function, fence, store adapter, snapshot callback, command callback,
or prepared owner value.

For a fresh actor, assembly derives the initial state from the compiled root
default, invokes the definition's memory initializer once with `input`, and
evaluates every declared context selector against one captured provider cut to
build the complete initial context and baseline. It creates lifecycle,
operation, timer, issue, revision, and store fields itself. Public callers do
not construct `ActorSnapshot` merely to start an actor. When neither input nor
context is required, the type-proof slice may make the options argument
optional without widening either field elsewhere.

Restoration remains an internal assembly port used by rewrite scenario tests and future
persistence work. A later persistence phase may publish a versioned checkpoint
type and a restore operation. It must not expose `PreparedActorSnapshot`, infer
private machine-turn cursors from a public snapshot, or overload the fresh-start
options with partially restored state.

`createActor` always allocates a new opaque local ref. `ensureActor` uses the
stable supplied ref, joins an existing or in-flight actor when present, and
uses start options only when it wins creation. Every active or in-flight ensure
resolves through the same per-actor `ActorLease` authority and therefore the
same cached terminal disposal result; it never creates a second lease owner.
`getActor` never creates or grants a lease. It accepts stable refs only; an
opaque local ref remains invalid for public lookup as required by HOST-002.
These operations join the runtime's shared readiness attempt internally and
retain its exact `ImplementationError`; callers may use `ready()` as an
explicit startup barrier but correctness does not depend on calling it first.
If disposal wins before readiness, `ready()` and all readiness-dependent
operations observe the same cached `RuntimeDisposed` diagnostic. Cold disposal
is successful cleanup, does not start bootstrap, and never fabricates a defect.

Every API method and factory captures and validates its caller-owned arguments
once when it is called. A function returning an Effect stores either that owned
value or its diagnostic in the Effect; it does not reread the caller's object
when the Effect later executes. Resource acquisition, initializers, selectors,
admission, waiting, delivery, and cleanup remain lazy and run only when the
returned Effect executes.

`send` is the non-blocking synchronous route over mailbox admission and returns
a `Result`; a full, closed, stale, or disposed actor is data, not an exception.
`dispatch` captures the event at the call, performs admission when its Effect
executes, and completes only when the actor cut commits or fails.
`DispatchReceipt` means the actor cut committed. Publication observers run
after that receipt and cannot retroactively fail or close the committed actor.
`flush` captures its admitted work boundary when its Effect executes and waits
only for that boundary. The engine records a monotonic admitted generation and
completed generation in the same non-yielding transition that installs a flush
waiter. Later admissions cannot extend an existing flush, and completion cannot
race ahead of waiter registration.

The following are private implementation vocabulary and must not become package
exports:

- `FlowRuntimeShell`
- `ActorDirectory`
- `ActorEngine`
- `ActorLease`
- `ContextCoordinator`
- `EvidenceJournal`
- runtime queues, fibers, scopes, gates, registries, reservations, or tickets
- `runtime-next/*` deep import routes

The public facade does not expose lifecycle controllers, the `ActorLease`
authority, evidence journals, runtime services, or mutable owner state. The
owner lease's `dispose()` delegates to its private `ActorLease`, and
`Runtime.dispose()` delegates to the shell. `ActorHandle` and `ActorRef` have no
disposal method. These facades do not create second disposal protocols.

## Final runtime object graph

The object graph has one owner for each mutable fact. The number of owners is
not a quota: runtime-wide owners, per-actor owners, and per-actor leases have
different identities and lifetimes. `RuntimeAssembly` constructs and connects
them but owns no domain state.

```text
RuntimeSetup / runtimeSetup
        |
        v
RuntimeAssembly
        |
        +--> FlowRuntimeShell
        |       runtime phase, readiness, participant registration,
        |       shutdown ordering, owned scope
        |
        +--> ActorDirectory
        |       identities, reservations, active entries, pending joins,
        |       incarnations, tombstones
        |
        +--> ActorEngine (one per actor)
        |       mailbox, publication, lifecycle,
        |       acknowledgements, activities, shutdown
        |
        +--> ActorLease (one per exposed actor)
        |       one terminal disposal authority and cached Exit
        |
        +--> ContextCoordinator
        |       registered context participants, waves, tickets,
        |       generations, serialization, shutdown
        |
        +--> EvidenceJournal
                sequence, preparation credits, accepted prefix,
                sink attachment, drain, close

RuntimeServicesLayer
        +--> Clock
        +--> RuntimeEvidence capability backed by EvidenceJournal
```

`ActorPublication` is immutable committed data, not an owner.
`EvidenceSink` is an independently closable delivery resource owned through the
journal; it is not a second evidence sequence or attachment authority.

### Owner authority

| Owner                | Owns                                                                                                  | Does not own                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FlowRuntimeShell`   | runtime phase, readiness, owned scope, registered actor/provider cleanup, close result                | actor maps, actor publications, context graph, evidence sequence        |
| `ActorDirectory`     | identity allocation, reservation state, pending joins, active entries, incarnation fences, tombstones | schemas, mailbox state, lifecycle, lease completion                     |
| `ActorEngine`        | one actor's mailbox, publication, lifecycle, timers, activities, acknowledgements, drain and shutdown | identity allocation, lease completion, context graph, evidence sequence |
| `ActorLease`         | one actor's terminal disposal claim, cached terminal Exit, and retirement handoff                     | identity lookup, mailbox processing, runtime-wide shutdown ordering     |
| `ContextCoordinator` | registered participant views, roots, waves, tickets, generations, queue/gate, close                   | full actor control, actor publication storage, a second graph model     |
| `EvidenceJournal`    | record sequence, preparations, credits, accepted prefix, attachments, drain and close                 | actor mutation, persistence state, sink delivery internals              |

Every mutable fact must appear in exactly one row. A helper module may transform
an owner's data but may not retain another authoritative copy.

## Dependency direction

```text
runtime.ts
    |
runtime-assembly.ts ------> runtime-shell.ts
    |                     actor/actor-directory.ts
    |                     actor/actor-engine.ts
    |                     actor/actor-lease.ts
    |                     context/context-coordinator.ts
    |                     evidence/evidence-journal.ts
    |
    +--------------------> runtime-services.ts

actor/actor-directory.ts -> actor/actor-admission.ts
actor/actor-engine.ts ----> actor/actor-state.ts
actor/actor-engine.ts ----> actor/lifecycle.ts
actor/actor-engine.ts ----> turn-plan.ts
actor/actor-state.ts -----> structural-copy.ts

context/context-coordinator.ts -> context/context-wave.ts
context/context-coordinator.ts -> context/lineage.ts
context/context-coordinator.ts -> ContextParticipant only
context/context-coordinator.ts -> structural-copy.ts

evidence/evidence-journal.ts -> evidence/evidence-record.ts
evidence/evidence-journal.ts -> evidence/evidence-sink.ts
evidence/evidence-record.ts --> structural-copy.ts
```

Dependencies point from assembly to owners and from owners to private decisions
or narrow capabilities. They never point from a pure module back to assembly or
from one owner's helper into another owner's private state.

The following imports are forbidden:

- context code importing the complete `ActorEngine` implementation
- directory code importing actor mailbox or lifecycle internals
- evidence code importing mutable actor state
- pure planning or value modules importing runtime services
- hosts importing owner implementations
- future StoreKernel code importing or invoking the complete `ActorEngine`
  instead of publishing through its own StoreFanout boundary

## Representation rules

Use the smallest representation that expresses the surviving responsibility.

| Meaning                                                                       | Representation                           |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| immutable record or snapshot                                                  | plain readonly value                     |
| a real closed family of variants                                              | discriminated union or `Data.TaggedEnum` |
| recoverable deterministic failure                                             | `Result`                                 |
| validation, normalization, copying, equality, graph ordering, or planning     | plain function                           |
| identity plus mutable state and one lifetime                                  | private owner implementation             |
| suspension, interruption, concurrency, time, resource acquisition, or cleanup | `Effect`                                 |
| deep substitutable capability                                                 | `Context.Service`                        |
| construction and release of contextual capabilities                           | `Layer`                                  |
| repeated host execution against one environment                               | optional host-owned `ManagedRuntime`     |

Rules:

- Do not create a class merely to group functions.
- Do not add `_tag` to a value that is not part of a meaningful union.
- Do not create a custom success/failure union when `Result` expresses it.
- Do not turn every owner into a service tag. Owners are assembled directly.
- Do not use `Layer` as a module system.
- Do not execute Effects with `runSync` or `runPromise` inside domain owners;
  compose and return Effects to the host/runtime boundary.
- Preserve complete `Exit` and `Cause` information across readiness and close.
- Decode `unknown` once at the boundary; do not spread erased values through
  owner APIs.
- Use `Schema` for untrusted input validation. A tag check is not validation.
- Once a value has crossed a public boundary, internal owner ports accept its
  captured type directly. They do not repeat hostile reflection or schema
  admission at every hop.
- Copy or freeze caller-owned data only at the ingress or publication boundary.
  Never freeze a caller's original object, and never maintain separate actor,
  context, and evidence implementations of the same structural copy policy.
- `structural-copy.ts` owns one iterative worklist for arrays and records,
  accessor/sparse-value policy, cycle policy, and opaque identity preservation.
  Policy is explicit per boundary: actor snapshot admission retains its current
  cycle rejection, while context and evidence retain cycle/topology
  preservation. Event and input policy follows their admitted schema and
  recorded frozen behavior; the shared copier does not silently widen it. Actor,
  context, and evidence supply only their fixed private policy; they do not
  implement recursive `Reflect.ownKeys` walkers.
- Traversal depth and collection growth are part of the contract. Caller-sized
  graphs and values use iterative walkers; queues either have a bound or a
  documented coalescing policy.
- A module-level `WeakMap`, `WeakSet`, counter, or nonce may brand immutable
  values, but it may not become runtime, directory, attachment, or local-ref
  authority shared across runtime instances.
- Add a helper or abstraction only when it removes more concepts than it adds.

## General coding practice contract

This table is normative, not advisory. Every rewrite slice identifies the rows
it touches, shows how its owner/API shape satisfies them, and supplies the named
enforcement before review passes.

| ID       | General practice                          | Common issue prevented                                                                                  | Required rewrite contract                                                                                                                                                                                                                                                                                              | Proof or enforcement                                                                                                                  |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `STD-01` | One owner and explicit lifetime           | Shadow registries, hidden globals, double cleanup, or state that outlives its resource                  | Every mutable fact has one named owner. State, registration token, scope, and terminal result move together. Cleanup is idempotent and owner-issued tokens cannot control another runtime or incarnation.                                                                                                              | Object-graph review, two-runtime isolation, repeated/concurrent close, and deletion/absence proofs.                                   |
| `STD-02` | Make illegal states impossible            | Boolean soup, contradictory optional fields, missed new variants, silent fallthrough                    | Closed state machines use state-specific discriminated variants and exhaustive matching. No catch-all branch silently accepts a new tag; no unrelated flags encode another hidden phase machine.                                                                                                                       | Table/model test for every legal and illegal transition plus compile-time exhaustive matching.                                        |
| `STD-03` | Capture and validate once                 | Caller mutation, hostile getter replay, execution-time option drift, repeated decoding                  | Every API and factory captures caller-owned arguments at invocation, validates untrusted data once with `Schema`, and passes an owned typed value internally. Resource acquisition and user work remain lazy; the returned Effect never rereads the caller object.                                                     | Mutation-after-call, hostile accessor/proxy, exact-read-count, and schema-negative proofs.                                            |
| `STD-04` | Preserve exact types and API power        | `any`, widened `unknown`, unsafe generic recovery, mutable exports, or overly wide ports                | Public signatures retain exact machine/input/context/error relationships. Internal consumers receive the narrow capability they need. Assertions stay at one proven boundary; no erased type or mutable owner capability leaks through public declarations.                                                            | Type-mode, negative compile, generated declaration, route-isolation, and packed-consumer proofs.                                      |
| `STD-05` | Keep failures in the right channel        | Expected rejection thrown as a defect, swallowed interruption, or collapsed cleanup cause               | Pure recoverable decisions use `Result`; Effectful expected failures stay in the typed error channel; defects and interruptions remain distinct in `Cause`. Readiness, admission, dispatch, and close retain the complete terminal `Exit`; no post-commit expected failure is introduced.                              | Typed-failure/defect/interruption scenarios, combined-cause, and post-commit failure-injection proofs.                                |
| `STD-06` | Define atomicity and linearization        | Check-then-act races, duplicate admission, half commits, lost wakeups, or rollback gaps                 | Every concurrent operation names one owner transition as its linearization point. Work before that point is fallible and rollback-owned; the committed transition is total. Logic crossing a yield uses an atomic owner transition or opaque reservation/permit rather than rechecking unrelated mutable state.        | Gates immediately before/after each linearization point, both race orders, stage-by-stage rollback, and no-partial-visibility proofs. |
| `STD-07` | Never run external work under a lock      | Reentrant deadlock, slow callback blocking close, or lock-order cycles                                  | Locks and semaphores guard only short non-yielding owner transitions. Record an in-flight token, release the lock, run caller callbacks, user Effects, queue waits, scope close, delivery, or cross-owner cleanup, then reacquire only to settle that exact token.                                                     | Reentrant callback, close-during-callback, slow callback, and lock-free external-work review.                                         |
| `STD-08` | Use structured concurrency                | Detached fibers, abandoned cleanup, blanket uninterruptibility, or unjoinable shutdown                  | Every fiber belongs to an owner scope and is interrupted or joined at close. Only atomic claim/settlement is masked. Cleanup runs once in an owner-supervised fiber; waiter interruption does not cancel it, and later callers join the same cached `Exit`.                                                            | Scope closure, interrupted waiter, later join, exactly-once cleanup, and no-daemon static review.                                     |
| `STD-09` | Bound work and schedule fairly            | Memory growth, unbounded fiber fanout, backpressure collapse, starvation, or busy loops                 | Every queue/subscriber/worklist has a finite bound or explicit coalescing rule. Caller-sized fanout has a finite concurrency limit. Each worker states its fairness rule and yields cooperatively without violating causal ordering; a hot actor/root cannot starve an already-queued peer.                            | Capacity, wide-fanout peak-fiber, slow-consumer, hot/cold peer, long-chain progress, and shutdown tests.                              |
| `STD-10` | Check monotonic authority values          | Numeric wraparound, ABA aliasing, stale fence acceptance, or partial overflow commit                    | Every sequence, revision, generation, ordinal, and epoch uses one checked-successor operation. Overflow is rejected before mutation and produces the owner-defined stable typed terminal result.                                                                                                                       | Near-`Number.MAX_SAFE_INTEGER` proof for every counter owner and stale-token rejection after failure.                                 |
| `STD-11` | Publish immutable owned data              | Live `Map`/`Set`/array mutation, freezing caller data, inconsistent cycle behavior                      | No owner-owned mutable collection crosses a port. Publish owned readonly values, backed read-only views, or narrow queries. `structural-copy.ts` owns iterative copying, but each boundary explicitly chooses cycle, sparse/accessor, and opaque-identity policy; sharing implementation never widens semantics.       | Mutation-after-publication, caller-not-frozen, 20k-depth, cyclic topology/rejection, sparse/accessor, and opaque-identity proofs.     |
| `STD-12` | Specify algorithmic cost                  | Recursive stack failure, repeated whole-graph scans, quadratic membership, retained-key leaks           | Caller-sized traversal is iterative. Context graph validation/reachability/order/wave setup is `O(V + E)` over the affected graph. Canonical keyed lookup is `O(1)`-class, and retention ends at its semantic eviction/release boundary.                                                                               | Deep/wide fixtures, affected-subgraph counters, operation-key eviction, and configured size checks.                                   |
| `STD-13` | Prefer the smallest real abstraction      | Forwarding wrappers, service/tag inflation, duplicated protocols, or speculative helpers                | Plain values/functions own deterministic work; `Effect` owns real suspension/failure/lifetime; services and Layers exist only for substitutable capabilities and acquisition. An abstraction must remove more concepts than it adds, have a named consumer, and preserve one dependency direction toward narrow ports. | Consumer/import inventory, concept budget, forbidden-import checks, and deletion of compatibility layers.                             |
| `STD-14` | Keep tests out of production control flow | Production phase hooks, test-only branches, behavior-changing probes, or mock-only paths                | Fault injection supplies failing owner capabilities or gates the same transaction combinator production uses. Production modules contain no probe callbacks, test constructors, alternate phase branches, or mutable module-level test state.                                                                          | Production-symbol absence check and each failure fixture reaching the named production owner path.                                    |
| `STD-15` | Make quality rules executable             | Permanent lint waivers, unproved casts, scheduler-luck tests, vague diagnostics, or incomplete deletion | `runtime-next/` adds no file-wide size/cognitive-complexity waiver and no suppression/assertion without a local invariant plus negative proof. Tests use deterministic clocks/gates, failures name the retained owner/token, and replaced paths receive explicit absence checks.                                       | Lint/type gates, no-sleep review, owner proof matrix, diagnostic assertions, public export diff, and cutover absence proofs.          |

## Owner contract: `FlowRuntimeShell`

### Purpose

`FlowRuntimeShell` is the one runtime lifecycle state machine. It owns
bootstrap, readiness, participation in shutdown, reverse disposal, the runtime
scope, and the terminal close result.

### State

The existing six phases survive because they represent real observable
lifecycle distinctions:

```ts
type RuntimeShellState<Ready, ReadyError, CloseError> = Data.TaggedEnum<{
  cold: RuntimeCold<CloseError>;
  starting: RuntimeStarting<Ready, ReadyError, CloseError>;
  ready: RuntimeReady<Ready, ReadyError, CloseError>;
  failed: RuntimeFailed<Ready, ReadyError, CloseError>;
  closing: RuntimeClosing<Ready, ReadyError, CloseError>;
  closed: RuntimeClosed<Ready, ReadyError, CloseError>;
}>;
```

Each variant carries every fact needed for its legal transitions, including the
immutable actor registrations and provider releases accepted in that phase.
The complete value is held in one `SynchronizedRef`.

Do not keep actor/provider arrays as separately mutated fields. Do not call
`push`, `splice`, or assign fields inside a value read from the ref. Registration,
unregistration, readiness settlement, the transition to closing, late-close
admission, and terminal settlement each replace the complete state atomically.

### Internal port

This is an internal semantic shape. Exact generic aliases may reuse current
runtime types, but callers receive no direct state access.

```ts
interface FlowRuntimeShell<Ready, ReadyError, CloseError> {
  readonly ready: Effect.Effect<Ready, ReadyError>;

  registerActor(participant: {
    dispose(): Effect.Effect<void, CloseError>;
  }): Effect.Effect<RuntimeRegistration>;

  registerProvider(release: Effect.Effect<void, CloseError>): Effect.Effect<boolean>;

  isOpen(): Effect.Effect<boolean>;
  close(): Effect.Effect<void, CloseError>;
}

interface RuntimeRegistration {
  readonly accepted: boolean;
  unregister(): Effect.Effect<void>;
}
```

Registration is Effectful because it participates in the same atomic state
protocol as close. This does not change the synchronous actor `send` contract;
mailbox admission belongs to `ActorEngine`, not `FlowRuntimeShell`.

### Behavior that must survive

- one bootstrap leader with shared readiness
- interruption-safe readiness settlement
- exact readiness failure retention
- cold close settles readiness once with `RuntimeDisposed` and starts no
  bootstrap work
- actors disposed in reverse registration order
- provider releases in reverse registration order
- quiesce, actor disposal, drain, provider release, owner close, and scope close
  retain their current order
- late actor registrations admitted only during the currently supported closing
  window
- close is idempotent and every caller observes the same terminal result
- the close claim and terminal settlement are the only masked transitions;
  cleanup runs once in an owner-scoped fiber, individual waiters remain
  interruptible, and a later caller can join the same complete `Exit`
- all cleanup attempts run and their failure causes are combined
- late registrations are drained by an iterative owner loop; cleanup does not
  recurse once per registration
- provider registration reports acceptance and never silently discards an
  already-acquired release action

### Required removal

- direct mutation of arrays stored inside owner state
- `getUnsafe` followed by mutation as a transition mechanism
- registration state split between the tagged phase and unrelated fields
- synchronous internal registration maintained only for compatibility
- the fabricated defect used when close wins before readiness is requested
- recursive close loops or close paths that can wait forever without naming the
  participant that still owns a shutdown credit

## Owner contract: `ActorDirectory`

### Purpose

`ActorDirectory` is the only owner of actor identity and admission position. It
does not validate machine schemas, run actor work, or own terminal lease
completion.

Stable and local actors share one directory port but retain their real semantic
differences:

```text
stable: vacant -> pending -> installed -> active -> tombstoned
                     \-> rolled back -> vacant with a newer incarnation next time

local:  unallocated -> reserved -> installed -> active -> removed
                        \-> rolled back with allocation reclamation when legal
```

Only stable admission has a joinable pending slot and retained tombstone. A
local identity is opaque, uniquely allocated, and removed on retirement. Do not
invent a common state merely to make the implementation visually symmetric.

### Internal port

```ts
type ActorAdmissionPosition<DefinitionValue extends MachineDefinition, Actor> =
  | {
      readonly _tag: "create";
      readonly reservation: ActorReservation<DefinitionValue>;
    }
  | {
      readonly _tag: "join";
      readonly join: ActorJoin<DefinitionValue, Actor>;
    }
  | {
      readonly _tag: "active";
      readonly registration: ActorRegistration<DefinitionValue, Actor>;
    };

interface ActorDirectory<Actor> {
  reserve<DefinitionValue extends MachineDefinition>(
    request: ActorReservationRequest<DefinitionValue>,
  ): Result.Result<ActorAdmissionPosition<DefinitionValue, Actor>, PublicDiagnostic>;

  install<DefinitionValue extends MachineDefinition>(
    reservation: ActorReservation<DefinitionValue>,
    actor: Actor,
  ): Result.Result<void, PublicDiagnostic>;

  activate<DefinitionValue extends MachineDefinition>(
    reservation: ActorReservation<DefinitionValue>,
  ): ActorRegistration<DefinitionValue, Actor>;

  find<DefinitionValue extends MachineDefinition>(
    ref: ActorRef<Machine<DefinitionValue>>,
  ): Result.Result<Option.Option<ActorRegistration<DefinitionValue, Actor>>, PublicDiagnostic>;

  rollback<DefinitionValue extends MachineDefinition>(
    reservation: ActorReservation<DefinitionValue>,
  ): void;

  retire<DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    disposedAtSequence: number,
  ): Result.Result<void, PublicDiagnostic>;
}
```

`ActorReservation` owns the creator side of a pending stable slot and any local
allocation token. `ActorJoin` exposes one Effect that settles with the winning
active registration or the exact admission failure; it does not expose a
`Deferred`. The closed `ActorAdmissionPosition` union forces assembly to handle
create, join, and already-active outcomes explicitly. `find` distinguishes a
valid absent ref from an invalid or foreign ref, which lets public `getActor`
return `undefined` without parsing a diagnostic. Callers do not separately
manipulate `pending`, `attachPending`, or local commit bookkeeping.

`install` performs the last fallible directory check. For its still-live
reservation, `activate` is a total owner transition that publishes the already
prepared actor and settles stable joiners. Assembly must not activate a token it
did not install; violating that private invariant is a defect, not a recoverable
directory result after actor startup.

Pure identity operations such as stable-key derivation, local-ref recognition,
schema decoding, capture, validation, and normalization stay plain functions in
`actor-admission.ts`. Cross-owner rollback remains an Effect workflow over
explicit rollback actions.

Stable and local provenance is carried by directory-issued reservation and
identity tokens. It is not inferred from a process-global `WeakSet`. Allocation
counters and rollback data move together through one directory transition; a
caller never restores individual counters or exhaustion flags.

### Behavior that must survive

- stable identity reuse and collision diagnostics
- local identity allocation and recycling
- incarnation and key-ordinal overflow behavior
- exact pending-admission joining
- installation before public activation
- fence checks against stale identities
- rollback of partial admission in reverse order
- stable tombstones and disposed evidence sequence
- local removal and allocation reclamation without manufacturing a tombstone
- iterative dependency-cycle validation with predecessor reconstruction rather
  than recursive DFS and path-array copying

### Required removal

The new tree must not reproduce `ActorIdentityRegistry` as a wide compatibility
port. These current operations are absorbed into the smaller state machine:

- `reserveStable`, `createLocal`, `reserveLocal`, and `commitLocal` become
  `reserve`
- `register` becomes `install`
- `expose` becomes `activate`
- `pending` and `attachPending` become reservation state
- `tombstone` becomes `retire`
- module-global local-ref provenance and hand-restored allocation counters are
  replaced by directory-owned tokens and transitions

The frozen names remain only in the frozen oracle until final cutover.

## Owner contract: `ActorLease`

### Purpose

`ActorLease` is the sole individual terminal disposal authority. It is returned
through an immutable `{ actor, dispose }` owner lease value and remains separate
from the command handle and `ActorRef`.

```ts
interface ActorLease<Actor> {
  readonly actor: Actor;
  dispose(): Effect.Effect<void, PublicDiagnostic>;
}
```

Calling `dispose()` constructs an Effect but does not claim disposal until that
Effect executes. The first executing caller claims the terminal attempt; every
concurrent or repeated caller joins the same completion and observes the same
complete `Exit`. Successful cleanup retires the actor through `ActorDirectory`.
A failed terminal attempt is cached and is not replayed by runtime close.

The implementation checks for an existing terminal claim before running a new
preflight. Preflight applies only while disposal remains unclaimed; it cannot
replace a cached success or failure on a later call.

### Behavior that must survive

- one terminal attempt shared by concurrent and repeated callers
- only terminal claim and result publication are uninterruptible; cleanup runs
  once in an owner-scoped fiber, an interrupted waiter cannot cancel it, and a
  later waiter joins the same cached `Exit`
- preflight failure before the terminal claim when disposal is still blocked
- actor cleanup before directory retirement
- no tombstone or local removal after failed cleanup
- complete ordered cleanup Cause retained and cached
- runtime close joins the same lease authority instead of creating another

### Required removal

- the misleading admission-local `ActorHandle<Definition, Actor>` name; rename
  that internal constraint to `ActorWithRef` or another exact non-public name
- lease completion state stored in `ActorDirectory`
- a second disposal cache in runtime assembly or `ActorEngine`

The public `ActorHandle` is the immutable command/observation facade defined
above. It contains no disposal method or lease completion state. Only the owner
lease returned by `createActor()` or `ensureActor()` delegates disposal to the
private `ActorLease`. The two current types share a name but not a
responsibility and must not be merged.

## Owner contract: `ActorEngine`

### Purpose

One `ActorEngine` owns all mutable execution state for one actor, matching the
normative `ARCH-012` owner vocabulary:

- bounded mailbox and reserved control admission
- acknowledged dispatch and pending completion settlement
- current committed publication and snapshot stream
- lifecycle state and legal lifecycle transitions
- timers, resources, provider reconciliation, and activities
- consumer fiber, drain, and shutdown

Mailbox, publication, lifecycle, and activity are protocols inside the engine.
They are not separate mutable owners.

### Preparation and activation

Preparation is a real phase because user work must not start before directory
installation and runtime registration succeed.

```ts
interface PreparedActorEngine<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly send: (command: ActorCommand<DefinitionValue>) => void;
  readonly dispatch: (command: ActorCommand<DefinitionValue>) => AcknowledgedDispatch;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;

  activate(): Effect.Effect<ActorEngine<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
  abandon(): void;
}

interface ActorEngine<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;

  send(command: ActorCommand<DefinitionValue>): void;
  dispatch(command: ActorCommand<DefinitionValue>): AcknowledgedDispatch;
  dispatchFact(fact: ProjectionFact): Result.Result<void, PublicDiagnostic>;
  dispatchContext(
    ticket: ContextTicket<DefinitionValue>,
  ): Result.Result<ContextProjectionTicket<DefinitionValue>, PublicDiagnostic>;
  snapshot(): ActorSnapshot<DefinitionValue>;
  lifecycleState(): LifecycleSnapshot<DefinitionValue, PublicDiagnostic, ProviderDefinition>;
  installLifecycleMetadata(
    metadata: LifecycleAttachmentMetadata<DefinitionValue, ProviderDefinition>,
  ): Effect.Effect<void, PublicDiagnostic>;
  transitionLifecycle(
    command: LifecycleCommand<PublicDiagnostic>,
  ): Effect.Effect<void, PublicDiagnostic>;
  drain(): Effect.Effect<void, PublicDiagnostic>;
  shutdown(): Effect.Effect<void, PublicDiagnostic>;
}
```

Immediate mailbox admission remains synchronous. `send`, `dispatch`, fact
admission, context-ticket admission, and reserved control admission keep their
current full/closed/accepted semantics. Completion, lifecycle work, draining,
and cleanup remain Effect workflows. `send` and `dispatch` schema-admit and
deeply own the event before mailbox admission; mutating the caller's event after
either method returns cannot change queued work.

### Private protocols

`actor-state.ts` contains immutable values and pure construction or
verification:

- `ActorSnapshot`
- `PreparedActorSnapshot`
- `ActorPublication`
- `ActorPublicationCut`
- store/projection/evidence result values
- snapshot preparation, verification, fencing, and copying

Actor snapshot preparation uses the shared iterative structural copier with
the actor policy: cycles remain a typed rejection, matching the frozen runtime.
Context and evidence use their separate cycle-preserving policies. Sharing the
worklist implementation does not merge these observable boundary rules.

`lifecycle.ts` contains the lifecycle model, pure transition decisions, and
private Effect workflows invoked only by the engine. It does not construct a
second controller object or retain a second current snapshot.

Activities and keyed replaceable work use one engine-owned `FiberMap` where that
matches the current replacement and shutdown semantics. The mailbox remains a
bounded `Queue`. The snapshot stream is an observation route, not a second
publication store.

Mapped events do not re-enter the externally contended ordinary mailbox. The
planned, validated `mappedEvents` array becomes the engine's immediate
continuation worklist before the parent receipt is settled, and the single
consumer drains it iteratively before taking the next external fact. This
retains every mapped event and its causal ordering without reserving an
arbitrary second queue, throwing after commit, or letting an external sender
steal continuation capacity. Long or self-producing continuation chains insert
cooperative interruption/yield checkpoints at a fixed work quantum. Yielding
does not admit another external mailbox fact into the unfinished causal chain,
but it lets shutdown and unrelated fibers make progress.

Drain uses two monotonic engine counters, `admittedGeneration` and
`completedGeneration`. One external fact owns one generation until its complete
causal continuation worklist settles. `flush` atomically captures the admitted
target and installs a waiter only when completion has not reached it. It does
not poll queue emptiness, wait for later admissions, or retain a mutable waiter
array that can miss the final completion edge. Both counters use the shared
checked-successor rule and reject overflow before admitting the fact.

Operation occurrence fences and settled-outcome cursors follow the exact
API-006/SEM-018 retention boundary. Eviction, release, and actor cleanup remove
the corresponding cursor; the engine does not retain an append-only array of
every canonical key ever observed. Lookup is keyed by the canonical operation
key rather than a linear `find`/`findIndex` scan.

Each snapshot subscriber receives the current immutable snapshot followed by a
coalesced latest-value stream. A slow subscriber retains at most one pending
snapshot plus the terminal marker; lossless history belongs to evidence, not to
an unbounded per-subscriber queue. Suspension, disposal, abandonment, and engine
shutdown complete every subscriber exactly once.

### Narrow views

Consumers receive only the capabilities they need. The public actor handle is a
stable facade over command admission, immutable observation, and drain; it does
not reveal the engine or disposal authority. The owner lease is the only
individual disposal facade. The context coordinator receives
`ContextParticipant`. Assembly and tests may receive a wider private engine
port, but that port is not a package export.

### Publication cut protocol

Event, passive, issue, context, and lifecycle publications use one private cut
protocol. No path installs actor state through a second helper.

1. Plan and capture the complete immutable candidate without mutating owner
   state.
2. Preflight every fallible runtime condition: fence, counters, publication
   revision, snapshot ownership, evidence preparation, any context-notification
   permit, every mapped continuation, and store request shape. A successful
   evidence preparation is an opaque one-shot permit whose later acceptance is
   total. Every schema read, user getter, structural copy, clock read, and
   record-shape check occurs by the end of this step.
3. Commit the store once when the turn has store actions. A failure cancels the
   evidence reservation and leaves the actor cut unchanged.
4. Construct the branded record from the typed store result and consume the
   evidence permit through the journal's total, synchronous acceptance
   transition. No expected failure remains after the store commit.
5. Replace publication, evidence sequence, cursors, and related engine state in
   one infallible owner transition, install the already-owned continuation
   worklist, publish any prepared context notification, then settle the
   dispatch receipt.

Machine planning and any work that determines the candidate happen before this
cut and can reject it. Snapshot stream delivery and user publication observers
happen after the committed receipt. Their failures are reported through their
own typed channel and cannot roll back, rewrite, or close the committed actor.
A prepared context notification is a total bounded/coalescing offer, so a
successful actor cut cannot silently lose propagation because another owner was
closed between preflight and commit. A receipt therefore means “the runtime cut
committed,” not “every downstream observer completed.”

Lifecycle transitions use the same cut protocol without the store step. A
lifecycle snapshot cannot become authoritative before its evidence record is
accepted, and lifecycle evidence failure cannot leave a hidden committed state.

### Behavior that must survive

- preparation starts no user work
- one bounded mailbox with reserved control capacity
- synchronous admission and acknowledged dispatch
- one prepared and validated cut before store/evidence/publication commit
- publication-only reads
- reentrant ordering
- mapped continuations are guaranteed before a successful parent receipt and
  cannot fail from ordinary mailbox contention
- context-ticket validation and completion
- activity replacement and interruption
- timer, provider, resource, and attachment cleanup
- drain waits for its captured admission generation and excludes later work
- shutdown settles every pending acknowledgement
- cleanup retains complete failures
- slow snapshot subscribers have constant bounded retention

### Required removal

The canonical new tree contains none of these competing top-level protocols:

- `ActorCell`
- `ActorCellProtocolState`
- `LifecycleController`
- `OwnedLifecycleController`
- `lifecycleRouting`
- duplicate `ActorLifecycle`
- the admission-local type misleadingly named `ActorHandle`
- throwing evidence finalization after publication installation
- observer failure closing an already-committed actor
- unbounded per-subscriber snapshot queues
- queue-empty drain polling, `DrainState.processing`, and mutable drain waiter
  arrays
- `reservedControlFact.before` or another post-commit mailbox-capacity escape
  path for mapped events

`ActorEngine`, `PreparedActorEngine`, and `prepareActorEngine` remain the
canonical actor owner, preparation phase, and construction boundary. Their
ports are reduced to real consumers rather than preserved for compatibility.

Temporary adapters may exist only for one named runtime-next consumer. They
may not hold mutable state or become general production dependencies, and they
must name their deletion slice.

## Owner contract: `ContextCoordinator`

### Purpose

Pure modules decide context graph, lineage, selection, baseline, and wave
results. `ContextCoordinator` owns only scheduling and mutable coordination:

- registered participant views and roots
- active waves and tickets
- graph and wave generations
- edge debt and selection attempts
- serialized queue and concurrency gate
- quiesce, drain, and close state

`runWave` is private. It composes pure planning with participant offers and
ticket settlement; it does not maintain a second graph representation.

### Actor-facing port

The coordinator must not receive a complete `ActorEngine`.

```ts
interface ContextParticipant<DefinitionValue extends MachineDefinition> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  snapshot(): ActorSnapshot<DefinitionValue>;

  offerContext(
    ticket: ContextTicket<DefinitionValue>,
  ): Result.Result<ContextProjectionTicket<DefinitionValue>, PublicDiagnostic>;
}
```

`ContextTicket` is an opaque coordinator-issued one-shot capability. Its private
state contains one deeply owned/frozen `ContextOffer`, origin, graph generation,
consumer fence, expected revision, required vector, replay state, cancellation,
and validation closure. The actor supplies only its current fence and revision
to the ticket's private `consume` operation. The ticket returns the owned offer
or the typed stale/forged/replayed/cancelled result. Callers cannot author or
decompose those fields, and the engine does not reconstruct, copy, or
independently attest the carrier object.

This port intentionally cannot send ordinary commands, dispatch control facts,
shut an actor down, drain it, inspect lifecycle internals, or subscribe to its
complete snapshot stream.

### Coordinator port

```ts
interface ContextRegistration {
  enable(): void;
  unregister(): void;
}

interface ContextCoordinator {
  register(node: ContextNode): Result.Result<ContextRegistration, PublicDiagnostic>;
  prepareNotification(root: ContextRoot): Result.Result<ContextNotification, PublicDiagnostic>;
  publish(notification: ContextNotification): "accepted" | "coalesced";
  cancel(notification: ContextNotification): void;
  quiesce(): Effect.Effect<void, PublicDiagnostic>;
  drain(): Effect.Effect<void, PublicDiagnostic>;
  close(): Effect.Effect<void, PublicDiagnostic>;
}
```

`setOpen`, `reconcile`, ticket settlement, and `runWave` become private state
transitions unless a production consumer proves it needs a separate semantic
operation.

`ContextNotification` is a short-lived, opaque, one-shot coordinator permit.
Preparation checks registration, fence, generation, and close state before an
actor's external store commit. Publishing or cancelling a live permit is a
total synchronous transition. It does not reserve an unbounded queue entry or
give the engine graph access.

`register` creates a dormant node and returns the only token that can enable or
remove it. Enabling and unregistering a live token are total. The coordinator
cannot schedule a dormant node, which keeps failed actor admission invisible
without giving assembly direct graph access.

The coordinator queue retains at most one queued root key per registered node.
Each root slot retains at most one active, one pending, and one latest snapshot.
`publish` reports acceptance or coalescing; `prepareNotification` returns a
typed failure for a closed, stale, or unknown root. Neither operation silently
drops a notification. The worker executes at most one wave per root dequeue. If
newer work remains, it re-enqueues that root once behind already-queued peers;
a continuously hot root cannot starve another root. Participant fanout uses a
finite owner-defined concurrency bound, never caller-sized unbounded fanout.

### Pure context model

Keep graph building, topological ordering, selection, baseline installation,
activation, wave planning, wave application, equality, and projection copying
as plain functions. Maintain explicit provider-to-consumer and
consumer-to-provider indexes so reachability, ordering, and wave capture are
iterative `O(V + E)` over the affected subgraph. A notification must not clone,
snapshot, or repeatedly scan every registered node when only one reachable
component participates.

Use ordinary readonly records for `ContextBaseline`, `ActiveContextBaseline`,
and `ContextWaveResult`. Their current tags do not distinguish alternatives and
are removed unless a real union consumer is found during the port.

Replace the custom passive observer outcome union:

```ts
type PassiveObserverEvaluation<Value, Dependency> = Result.Result<
  { readonly value: Value; readonly dependencies: readonly Dependency[] },
  PublicDiagnostic
>;
```

The rewrite preserves the current successful dependency replacement
semantics: both existing entrypoints replace the committed dependency set after
a complete successful evaluation, while defects leave the previous set intact.
If the port proves that only one entrypoint is needed, delete the alias. A new
non-mutating evaluation operation is a separate semantic change and is not
introduced by this rewrite. Selector defects remain ordinary typed failures and
never publish or replace dependencies.

### Behavior that must survive

- complete provider cuts captured at one graph generation
- deterministic topological ordering
- iterative reachability and topological worklists independent of map insertion
  order
- checked graph and wave generation overflow before any graph or ticket
  mutation
- finite fanout concurrency and fair root scheduling under continuous hot-root
  publication
- diamond and fanout propagation
- selector defect retention and last-valid behavior
- ticket fencing, cancellation, and settlement
- mutation after ticket preparation cannot alter the accepted offer; ticket
  consumption is one-shot and engine-side witness reconstruction is absent
- prepared notification publication is total after an actor store commit
- serialized waves with no scheduler-dependent correctness
- quiesce, drain, and close settle every active ticket

### Required removal

- the `ActorEngine` dependency from context construction
- coordinator access to ordinary actor send, shutdown, or lifecycle control
- redundant singleton tags on plain context records
- `PassiveObserverEvaluation` as a custom Result-like union
- public or cross-owner access to `runWave`
- exported witness validators or caller-visible ticket internals
- `ContextTicketWitness`, actor-side carrier reconstruction, and duplicate
  ticket validation
- silent notification drops and unbounded root-key queues

## Owner contract: `EvidenceJournal`

### Purpose

Evidence is split by responsibility:

- `evidence-record.ts`: immutable facts, records, preparations, credits, and
  constructors
- `evidence-journal.ts`: sequence, preparation credits, accepted prefix,
  attachments, drain, and close
- `evidence-sink.ts`: one independently bounded delivery resource
- root `structural-copy.ts`: the one iterative ownership/copy worklist used by
  actor ingress, context tickets, and evidence records with fixed
  boundary-specific opacity policies

Records and copying have no runtime lifetime. The journal is the one mutable
evidence authority. A sink owns only its queue, delivery outcome, truncation,
and close behavior.

### Journal port

The exact generic families remain source-compatible, but the internal API is
grouped by semantic transition rather than by access to journal internals:

```ts
interface EvidenceCredit {
  readonly fence: ActorFence;
  release(): void;
}

interface TurnEvidencePermit<DefinitionValue extends MachineDefinition> {
  accept(store: ActorStoreResult<DefinitionValue>): EvidenceAcceptance;
  cancel(): void;
}

interface LifecycleEvidencePermit {
  accept(): EvidenceAcceptance;
  cancel(): void;
}

interface EvidenceJournal {
  sequence(): EvidenceSequence | 0;

  registerActor(fence: ActorFence): Result.Result<EvidenceCredit, PublicDiagnostic>;

  prepareTurn<DefinitionValue extends MachineDefinition>(
    credit: EvidenceCredit,
    draft: TurnEvidenceDraft<DefinitionValue>,
  ): Result.Result<TurnEvidencePermit<DefinitionValue>, PublicDiagnostic>;

  prepareLifecycle(
    credit: EvidenceCredit,
    draft: LifecycleEvidenceDraft,
  ): Result.Result<LifecycleEvidencePermit, PublicDiagnostic>;

  attach(token: EvidenceAttachmentToken): Result.Result<void, PublicDiagnostic>;
  drain(): Effect.Effect<EvidenceDrain, PublicDiagnostic>;
  close(): Effect.Effect<EvidenceDrain, PublicDiagnostic>;
}
```

`EvidenceCredit` is the only actor-credit authority. The journal indexes its
opaque token and complete fence; no operation releases or prepares evidence by
string key. `release()` is idempotent and cannot affect a recycled key or newer
incarnation. A stranded-credit diagnostic reports the complete fence.

`prepareTurn` captures and validates the complete record skeleton before the
store commit: timestamp, provenance, fence, before/after snapshots, cause,
publication revisions, every caller-owned value, sequence capacity, and sink
offer slots. The returned permit's total `accept` receives only the already-owned
store result and binds it without reflection, schema work, structural copying,
or sequence overflow. `prepareLifecycle` likewise captures its complete record,
reserved sequence, and terminal-credit disposition before returning its permit.

For a live permit, `accept` and `cancel` are total synchronous transitions.
Acceptance publishes the reserved sequence, settles only that preparation's
reservation/capacity, advances the accepted prefix, and fills the prepared
bounded sink slots in one JavaScript cut; cancellation retires the reservation
and returns all capacity. Neither operation releases the actor-lifetime
`EvidenceCredit`. A terminal lifecycle acceptance marks that credit terminal,
but actor cleanup remains the only path that calls `EvidenceCredit.release()`
and removes it. This makes a failed store commit cancellable and a successful
store commit evidence-finalizable without a second failure window. Sink
delivery, waiting, drain, and close remain Effects. There is no
`acceptSync`/`accept`, `preparePublication`/`acceptPublication`, record
reconstruction, or later `settleOutcome` vocabulary.

Attachment ownership is represented by a journal-issued opaque token rather
than a process-global `WeakMap`. Journal close reports retained actor keys when
credits remain after runtime actor-disposal attempts. It atomically inspects the
remaining complete fences and fails immediately with all of them; it does not
await credits that only already-attempted actor cleanup can release.

### Sink delivery protocol

Each offered sink record receives an explicit offer outcome. Once accepted, it
reaches exactly one accounted terminal state: delivered, truncated/detached, or
failed. A drain interruption cannot dequeue a record and bypass that
accounting.

The sink semaphore protects only queue and in-flight state. Drain claims one
record and records its in-flight token under the semaphore, releases the
semaphore before running the caller-supplied delivery Effect, then reacquires it
to settle that token. Reentrant `drain()` or `close()` joins or observes the
in-flight delivery without deadlock. Slow delivery cannot prevent unrelated
callers from observing close state, and close does not run the delivery Effect a
second time.

### Evidence value cleanup

- Rename `CauseEnvelope` to `TurnCauseEnvelope`.
- Define `TurnCauseEnvelope` as the owned evidence projection of `TurnCause`.
- Define `ProjectionEnvelope` as the owned evidence projection of
  `ProjectionFact`.
- Keep conversion functions next to the source and target types; do not allow
  callers to author narrowed envelopes directly.
- Keep `CompletionEnvelope` as an `Extract` only if a consumer needs that
  narrowed projection.

The current runtime evidence adapter contributes real injected-clock timestamp,
provenance, fence validation, and failed-preparation cancellation policy. Keep
that policy as one narrow private `RuntimeEvidence` capability. Its code may
move next to journal construction or assembly, but it may not be deleted or
reduced to unchecked forwarding. Remove only methods that are proven to forward
without policy.

### Behavior that must survive

- monotonic sequence allocation
- preparation and cancellation ownership
- actor credits and ordinary/outcome preparation distinctions
- stale, repeated, foreign, or recycled-key credits cannot release or prepare
  evidence for another incarnation
- accepted-prefix selection
- attachment fencing and drain
- bounded sink delivery and truncation
- context/evidence cycle and opaque-reference preservation under their explicit
  copy policies; actor snapshot cycle rejection remains unchanged
- iterative copy of caller-sized arrays and records without recursion-depth
  failure
- journal and sink close failure retention
- timestamps supplied by the injected `Clock`, never wall-clock access

### Required removal

- separately authored cause/projection unions that can drift from turn facts
- duplicate sequence or attachment authority
- string-key actor-credit release or lifecycle preparation
- forwarding-only methods that add no clock, provenance, fence, cancellation,
  or runtime-service policy
- persistence mutation through evidence records
- sink internals exposed through the journal port
- process-global attachment ownership
- close waiting indefinitely on an unnamed actor credit
- duplicated direct and prepared publication-record construction
- parallel `preparePublication` and `acceptPublication` paths

## Runtime assembly and services

`runtime.ts` contains the migrated `Runtime`, `RuntimeSetup`, and `runtimeSetup`
facade only. It does not become the composition root.

Each `construct()` call returns a frozen runtime value whose methods close over
that exact assembly. Do not recover its owner through `attachedRuntimeOwners`,
a module-level `WeakMap`, a symbol property, or a public `runtimeOwner()` escape
hatch. Constructing two runtimes from one app produces isolated directories,
shells, context coordinators, evidence journals, and disposal results.

`runtime-assembly.ts` performs one assembly workflow:

1. create the clock and runtime service capabilities
2. create the runtime-wide owners and the per-actor owner factories
3. wire only their narrow ports
4. expose the final-shaped `Runtime`, owner-lease, and `ActorHandle` facades to
   runtime-next tests; Phase 5 alone promotes them through the package root
5. register cleanup with `FlowRuntimeShell`

Assembly may coordinate a multi-owner transaction such as actor admission. It
must not retain mutable domain state after construction.

### Actor admission transaction

Assembly is the coordinator, not another registry. One actor admission follows
this order:

1. Capture the public ref/options once and ask `ActorDirectory.reserve`. Return
   the active actor or await the join branch without invoking an initializer.
2. Only for the create branch, derive or admit the restored snapshot, resolve
   provider refs to current directory fences, capture the initial context cut,
   validate the dependency graph, register the complete-fence evidence credit,
   and construct a prepared engine. Any initializer, selector, schema, copy, or
   reflection failure still has no visible actor.
3. Install the prepared actor in the directory, register a dormant context
   participant, install provider-backlink tokens and provider fences, and
   register the lease cleanup with the runtime shell. Every successful stage
   contributes its owner-issued undo token to one rollback stack.
4. While the directory entry and mailbox remain externally closed, perform the
   restored/start lifecycle publications in their existing order, restore
   machine/publication revisions, reconcile the initial context, reacquire
   timers/resources/work/streams, and activate the engine. Failure abandons the
   engine and runs every undo token in reverse order; no stable joiner succeeds.
5. After all fallible work succeeds, perform the total directory activation,
   enable the context participant and mailbox, settle joiners, and return the
   immutable owner lease containing its public handle. From this point,
   individual disposal goes only through the lease. Lookup returns only the
   already-created handle and grants no disposal authority.

The create branch owns one explicit rollback stack. Owners return opaque tokens
for undoing their own prepared/installed state; assembly never edits an owner's
maps, counters, gates, or `Deferred`s. No fallible transition is allowed after
directory activation. A failure injected after any earlier stage must leave no
pending lookup or join, evidence credit, dependency backlink, provider fence,
context node/root/ticket, live scope, timer, resource, stream, or work fiber;
retrying the same ref must succeed.

`runtime-services.ts` keeps the existing `RuntimeEvidence` identity and the
small Layer that provides `Clock` and runtime evidence. It does not wrap each
owner in `Context.Service`.

`RuntimeAdmissionProbe`, `runtimeSetupForAdmissionTestInternal`, and production
phase callbacks are not ported. Failure tests inject a failing owner capability
or gate the same transaction operation used by production; production
admission contains no test-only branch, callback, or alternate state path.

Use `Layer.succeed` for already-created capabilities. Use `Layer.effect` plus
`Effect.acquireRelease` when construction genuinely acquires a resource. In the
pinned Effect version, do not assume APIs that are absent from the installed
package.

`ManagedRuntime` is optional and host-owned. It does not replace
`FlowRuntimeShell`, own Flow state, or appear inside actor, context, directory,
or evidence code.

## Pure planning boundary

`turn-plan.ts` remains plain data and functions. It owns:

- projection and turn fact types
- event/projection turn inputs
- operation occurrence fences and outcomes
- event, noop, and projection plans
- `isEventForMachine`, `planProjection`, and `planTurn`

It contains no actor, journal, directory, service, or runtime reference. A plan
is data passed into an owner.

Operation authoring files under `src/operation/` remain where they are. New
resource, transaction, stream, operation, and input authoring APIs belong to
Phase 3; all existing runtime execution, restoration, cleanup, and ordering for
those features remain mandatory here.

## Target module tree

```text
packages/flow-state-rewrite/src/runtime-next/
├── runtime.ts
├── runtime-assembly.ts
├── runtime-shell.ts
├── runtime-services.ts
├── actor-ref.ts
├── structural-copy.ts
├── turn-plan.ts
├── actor/
│   ├── actor-admission.ts
│   ├── actor-directory.ts
│   ├── actor-state.ts
│   ├── actor-engine.ts
│   ├── actor-lease.ts
│   └── lifecycle.ts
├── context/
│   ├── context-wave.ts
│   ├── lineage.ts
│   └── context-coordinator.ts
└── evidence/
    ├── evidence-record.ts
    ├── evidence-journal.ts
    └── evidence-sink.ts
```

This is a responsibility map, not a quota. Add a private support file only for
a real import-cycle break, independent proof seam, independent consumer, or
configured file-size failure. Do not add `utils.ts`, `helpers.ts`, generic
manager classes, one file per function, or re-export barrels without a real
public route.

## Deletion contract

The rewrite is not complete when old concepts merely delegate to new code.

| Legacy concept                                     | Required `runtime-next` result                             | Required cutover result                                 |
| -------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| split `ActorEngine` / `ActorCell` authority        | one canonical `ActorEngine` with private state             | old split declarations and imports deleted              |
| `LifecycleController` / `OwnedLifecycleController` | lifecycle is a private `ActorEngine` protocol              | old controller, routing symbol, and factory deleted     |
| duplicate `ActorLifecycle`                         | one canonical lifecycle union                              | duplicate deleted                                       |
| admission-local `ActorHandle<Definition, Actor>`   | exact internal `ActorWithRef`; one public actor facade     | misleading duplicate name deleted                       |
| wide `ActorIdentityRegistry`                       | reduced `ActorDirectory` state-machine port                | old facade deleted                                      |
| full actor dependency in context                   | `ContextParticipant` only                                  | no context import of the complete engine implementation |
| mutable arrays inside runtime shell state          | immutable collections replaced atomically                  | old mutations deleted                                   |
| custom passive outcome union                       | Effect `Result` with unchanged success/defect semantics    | old union deleted                                       |
| redundant singleton tags                           | plain readonly records                                     | old tags and tag branches deleted                       |
| split publication/evidence/lifecycle commits       | one prepared, non-throwing actor cut protocol              | old commit paths deleted                                |
| provisional/final evidence reconstruction          | prevalidated record skeleton plus total permit acceptance  | duplicate prepare/accept paths deleted                  |
| string-key evidence release                        | complete-fence `EvidenceCredit` capability                 | key-only release authority deleted                      |
| queue-empty drain polling and waiter arrays        | monotonic admitted/completed generation barrier            | `DrainState` polling deleted                            |
| mapped-event mailbox re-admission                  | current turn's immediate iterative continuation worklist   | post-commit capacity escape deleted                     |
| unbounded snapshot subscriber queues               | current replay plus one coalesced pending value            | unbounded queues deleted                                |
| repeated recursive reflection/copy policies        | one iterative structural-copy worklist with fixed policies | duplicate walkers deleted                               |
| process-global ownership maps                      | owner-issued opaque tokens scoped to one runtime           | global authority deleted                                |
| `attachedRuntimeOwners` / public-owner lookup      | facade methods close over one private assembly             | lookup map and `runtimeOwner()` deleted                 |
| production admission probes and phase callbacks    | fault injection through owner capabilities at real seams   | probe types, setup variants, and branch hooks deleted   |
| policy-free evidence forwarding                    | absent; real clock/provenance/cancellation policy retained | forwarding-only methods deleted                         |
| compatibility adapter or re-export                 | one named frozen comparison consumer and deletion slice    | zero migration adapters                                 |

During the parallel port, the frozen runtime necessarily retains its old names.
“Absent” means the concept is not recreated as canonical production architecture
in `runtime-next/`. Final repository deletion occurs only in the cutover slice.

## Concept budget

Each owner slice records:

1. current source symbols and every production/test consumer
2. behavior that survives
3. final owner state and internal port
4. types, methods, states, adapters, and imports removed
5. replacement code introduced
6. every applicable `STD-*` row and its executable or static enforcement

A slice fails architectural review when it only moves code, wraps the old API,
or adds an owner class while retaining the previous mutable authority.

The final architecture, promoted through the package root only in Phase 5, must
finish with:

- one authority for every mutable fact, without an owner-count quota
- one runtime composition root
- one public runtime facade
- one public actor facade
- no runtime-related root exports beyond those defined above; all unrelated
  existing root exports remain intact
- fewer top-level runtime protocols
- fewer callable directory transitions
- no engine/cell/controller compatibility layer
- no new global or shadow authority

The production `runtime-next/` target is 3–5k lines, excluding tests and
generated output. Line reduction is supporting evidence; net concept reduction
and preserved behavior remain the contract. Crossing 5k requires an architecture
review that identifies the surviving responsibility, its owner, and why it
cannot be expressed by an existing value or port. The budget never authorizes
silent feature removal.

## Implementation order

1. Record the frozen baseline. Read every frozen runtime test and extract the
   high-level, observable behavior scenarios into requirement-backed
   `runtime-next/` `it.todo` tests. Account for internal-only tests in the
   inventory without copying their private implementation assertions.
2. Lock the final facade shape and its Phase 5 export contract without changing
   the active package root. Implement the `runtime-next/` facade, assembly
   skeleton, and `FlowRuntimeShell` atomic state transitions.
3. Implement `ActorDirectory`, then the pure context and evidence values plus
   their owners.
4. Implement `ActorEngine` last, including the one-cut protocol, bounded
   snapshots, and absorbed lifecycle authority.
5. Run all extracted scenarios, internal facade, and boundedness checks;
   promote the public facade in Phase 5, then perform deletion and absence
   cutover in Phase 6.

Each slice lands directly on its final internal port. A temporary compatibility
adapter may exist only when it has:

- one named consumer
- no mutable state
- no new callers
- an explicit deletion slice

Do not build a broad compatibility layer and plan to simplify it later.

## Scenario extraction and rewrite tests

Before runtime-next implementation, read every test declaration in the frozen
`src/runtime/test/` suites. Record the inventory in
`src/runtime-next/test/scenario-inventory.json`, with the frozen file, line,
title, and disposition for each declaration: an
observable behavior scenario to carry forward, an existing scenario that
already covers the same requirement, or a private implementation check that
must not be copied. The inventory links the frozen file and test title to a
new scenario ID or states why the private check has no direct rewrite test.
Do not turn the old owner graph, method names, internal state, or test hooks
into requirements merely because a frozen test asserted them.

Write the selected high-level scenarios as named `it.todo` cases under
`runtime-next/test/`. Each case has a stable scenario ID and comments stating
the source test(s), relevant contract or approved correction, setup, action,
observable result, and failure or cleanup outcome where applicable. Group
cases by behavior, not by frozen source file. Favor runtime and actor facade
observations; owner-specific tests are added only where the owner proof matrix
requires a property that the facade cannot expose. A correction case states
the frozen outcome and the required new outcome separately.

The frozen suite continues to run as the baseline; the new tests run only
`runtime-next/`. There is no shared runner, dual-runtime adapter, normalized
receipt comparator, or copied test of frozen private internals. Before Phase 5,
facade scenarios import `runtime-next/runtime.ts`, while owner proof tests may
import their owning module. Phase 5 adds public entrypoint and packed-consumer
proofs. Phase 6 proves the frozen implementation absent.

The extracted scenarios cover at least:

1. runtime readiness, cold and racing disposal, create/ensure/get, readiness
   failure, interruption, cached exits, idempotent disposal, interrupted
   waiters, and exactly-once supervised cleanup
2. stable/local actor admission, pending join, rollback after every acquired
   owner token, active ensure reusing the same lease authority, local public
   lookup rejection, fencing, recycled keys, evidence credits, and tombstone
3. public actor send/dispatch/snapshot/flush, owner-lease disposal, absence of
   disposal on lookup handles and refs, mailbox capacity, synchronous
   admission, flush completion-edge races, later-admission exclusion, mapped
   continuation guarantees, post-call event mutation, bounded occurrence-cursor
   retention, cooperative long-chain progress, and reentrant ordering
4. atomic store/evidence/publication ordering, observer failure isolation,
   hostile/deep evidence preflight, lifecycle transitions, restored revisions
   and restore/start evidence order, direct sink-drain interruption,
   reentrant/close-during sink delivery, bounded slow subscribers, drain, and
   shutdown
5. context diamond/fanout waves, deep graph traversal, coalescing, selector
   defects, bounded fanout, hot-root/cold-root fairness,
   forged/replayed/mutated tickets, checked generation overflow, overdue timers,
   resource/work/stream reacquisition and cleanup, stranded credits, sink
   delivery, and cleanup

Assert diagnostics, revisions, accepted/rejected sends, publication order,
cleanup order, evidence sequence, and typed failure/defect/interruption
categories. Avoid assertions on non-contractual runtime nonces, fiber IDs,
object identity, injected timestamps, or unspecified order.

Each implementation slice converts its assigned `it.todo` cases into
executable assertions against the new runtime. A todo is a requirement
placeholder, never passing proof. The Phase 2.2 validation gate reconciles
the inventory against the frozen suite and rejects any unresolved in-scope
`it.todo`, missing scenario, or silently dropped behavior.

## Owner proof matrix

| Boundary             | Required executable proof                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FlowRuntimeShell`   | cold/racing ready-close with one `RuntimeDisposed` Exit, no cold bootstrap, late registration boundary, reverse cleanup, idempotence, combined causes, interrupted waiter with exactly-once supervised cleanup, scope closure                                                                                                                                                              |
| `ActorDirectory`     | stable/local reservation, pending join, activation visibility, rollback after every assembly stage, stale fence, checked near-limit overflow, stable tombstone, local removal, two-runtime isolation                                                                                                                                                                                       |
| `ActorLease`         | lazy terminal claim, concurrent/repeated join, cached Exit checked before preflight, interrupted waiter joining later, failed-cleanup caching, retirement only after successful cleanup                                                                                                                                                                                                    |
| `ActorEngine`        | non-starting prepare, mailbox full/closed, deeply owned event mutation resistance, mapped continuation guarantee and cooperative long-chain progress, reentrancy, atomic store/evidence/publication cut, flush completion race and later-work exclusion, bounded snapshots and occurrence cursors, checked counters, restored lifecycle/timer/resource behavior, shutdown acknowledgements |
| `ContextCoordinator` | graph order independent of insertion, affected-subgraph `O(V + E)` work, complete cuts, diamond/fanout, bounded concurrency/coalescing, hot-root/cold-root fairness, checked generation overflow, forged/replayed/cancelled/stale and post-prepare-mutated tickets, serialized waves, quiesce/drain/close                                                                                  |
| `EvidenceJournal`    | checked sequence capacity, complete-fence credit ABA/replay isolation, policy-correct hostile/deep/cyclic preflight before store, total once-only acceptance after store, cancellation capacity return, stranded-credit immediate close diagnostic, iterative opaque copying                                                                                                               |
| `EvidenceSink`       | accepted-record terminal accounting, direct drain-fiber interruption, reentrant drain, close during delivery, bounded retention, truncation, delivery failure, and exactly-once close                                                                                                                                                                                                      |
| `structural-copy.ts` | the same 20k-deep and cyclic fixtures through actor ingress/snapshot, context offer/ticket, and evidence record policies; actor cycle rejection and context/evidence topology preservation; opaque identity preservation; policy-specific sparse/accessor rejection; caller originals neither mutated nor frozen                                                                           |
| port immutability    | mutation attempts against every returned/publication array, record, map, and set cannot change owner state or later reads; generated declarations expose no mutable collection capability across a public boundary                                                                                                                                                                         |
| facade and promotion | before Phase 5, no root-export drift; in Phase 5, exact runtime exports, required/omitted input and context inference, derived initial snapshot, active/in-flight ensure sharing one lease authority, opaque-local lookup rejection, non-throwing send, dispatch receipt, observation, flush, lease/runtime disposal, handle/ref disposal absence, two machine families, packed consumers  |

Use `TestClock` for timers, polling, retry, and lifecycle time. Do not use sleeps
or scheduler luck as correctness evidence. Concurrency proofs gate immediately
before and after each named linearization point and force both interruption
orders. Closed state machines also receive a table/model test covering every
legal transition and rejecting every illegal transition.

## Verification per slice

Run the smallest owner tests first, then the package checks required by the
changed boundary:

```sh
nub run --no-check fmt:check
nub run lint
nub run --filter flow-state-rewrite check:types
nub run test
```

Run `nub run build` when package output changes. Run
`nub run docs:build` when Phase 5 changes the public API or generated reference.
Run `nub run verify` before claiming workspace closeout.

Every slice also checks:

- `git diff --check`
- every applicable `STD-*` row is named in the slice evidence; an omitted row
  is justified as not applicable rather than silently ignored
- changed production files against the configured size threshold
- no `any`, widened `unknown`, unproved assertions, or mutable exported surfaces
- no raw Promise runner, throw-as-expected-failure, wall clock, or implicit
  concurrency inside Effect workflows
- no caller-sized unbounded fanout, owner lock held across a suspending/external
  Effect, detached fiber, or blanket-masked cleanup workflow
- checked overflow for every changed counter owner and no live mutable
  collection identity crossing an owner or public port
- no production test hook, file-wide complexity waiver, or catch-all tagged
  union branch that hides a newly added state
- explicit cleanup and cancellation proofs
- before Phase 5, no runtime-related public entrypoint drift; during Phase 5,
  exactly the approved additions and no unrelated existing export loss
- queue bounds, coalescing rules, and iterative caller-sized traversals proved

Focused checks do not erase unrelated baseline failures. Report the exact
command, snapshot, and remaining failure.

## Phase 5 promotion and Phase 6 cutover

Public promotion and deletion are separate bounded slices after every owner
boundary and the internal facade pass their executable scenario tests.

Phase 5 must:

1. route the public entrypoints to the approved runtime and actor facades
2. expose `createActor()` and `ensureActor()` as owner-lease acquisition,
   `getActor()` as non-owning lookup, and runtime-wide `dispose()`
3. prove that `ActorHandle` and `ActorRef` have no individual disposal authority
4. update maintained consumers without adding deep imports
5. run public declarations, docs, packed-consumer, host, and API-011/API-012
   proofs

Phase 6 must delete the frozen runtime implementation and all migration
adapters, prove legacy symbols and paths absent, and run package,
docs, packed-consumer, affected browser, and full workspace verification.

After Phase 5 the package root has one live authority: `runtime-next/`. The
frozen tree may remain only as unreachable deletion input until Phase 6. Do not
keep it as an undocumented fallback.

## Done criteria

The rewrite is complete only when all statements below are true:

- established diagnostics, generic relationships, ordering, identity,
  cancellation, and cleanup match the frozen baseline except for the explicit
  facade additions and approved semantic corrections in this document
- the package root remains ready-only until Phase 5, whose public export diff
  adds exactly the approved runtime surface and removes no unrelated existing
  export
- each mutable fact has exactly one named owner
- every owner exposes the smaller semantic port defined here
- pure decisions run without an Effect runtime
- Effect requirements, failure, interruption, time, concurrency, and cleanup
  remain explicit
- the obsolete protocols named in the deletion contract are absent from
  `runtime-next/`
- context depends only on `ContextParticipant`
- no migration adapter has a production caller
- no shadow registry, publication store, context graph, evidence sequence, or
  test-only owner exists
- no unbounded snapshot subscriber queue, recursive caller-sized traversal,
  process-global owner map, or throwing post-commit finalizer exists
- every moved symbol has one canonical import path
- all extracted scenarios and owner proofs pass, with no in-scope `it.todo`
- the cutover slice deletes the frozen implementation and proves absence

If implementation preserves the old split engine/cell/controller authority or
wide registry API behind new wrappers, the parallel rewrite has failed. In that
case, stop and perform the smaller in-place cleanup instead of maintaining two
equivalent trees.

## New surfaces outside this rewrite

- new StoreKernel and StoreFanout owners not present in the frozen runtime
- new resource, transaction, stream, or timer capabilities not already present
  in the frozen runtime
- public checkpoint/persistence codecs, storage adapters, and new hydration APIs
- React, SSR, Stories, CLI, and host-specific `ManagedRuntime`
- public API additions beyond the facade fixed in this document
- shared abstractions not demonstrated by at least three completed modules

These are new surfaces rather than behavior removed from the rewrite. They
depend on owner capabilities and immutable values and do not reach into owner
implementations.

Deferral does not apply to existing private behavior. Restored-snapshot
admission, restored machine/publication revisions, restore/start evidence
ordering, hydration ordering, timer scheduling and overdue handling,
resource/work/stream reacquisition and cleanup, transaction/operation cleanup,
provider reconciliation, suspension/resumption, and failed-restore rollback are
mandatory behavior for this rewrite. Their duplicate controller and adapter code
may be deleted only after equivalent `ActorEngine` paths are executable.

## Appendix: frozen source map

This appendix identifies behavior sources. It does not prescribe the final API.

| Frozen source                                                                                                                | Behavior to preserve                                                 | Final destination                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`runtime.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/runtime.ts)                         | facade, assembly, actor acquisition, service wiring                  | `runtime.ts`, `runtime-assembly.ts`                                                 |
| [`runtime-owner.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/runtime-owner.ts)             | readiness, scope, participant registration, reverse close            | `runtime-shell.ts`                                                                  |
| [`actor-admission.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/actor-admission.ts)         | identities, registry, schema/capture, validation, rollback, leases   | `actor/actor-admission.ts`, `actor/actor-directory.ts`, `actor/actor-lease.ts`      |
| [`actor-engine.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/actor-engine.ts)               | mailbox, publication, dispatch, snapshots, activity, shutdown        | `actor/actor-state.ts`, `actor/actor-engine.ts`                                     |
| [`lifecycle.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/lifecycle.ts)                     | lifecycle model, transitions, resources, timers, providers, disposal | `actor/lifecycle.ts`, private `ActorEngine` workflows                               |
| [`context-wave.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/context-wave.ts)               | graph, selection, baseline, waves, passive observation               | `context/context-wave.ts`                                                           |
| [`context/lineage.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/context/lineage.ts)         | lineage and edge-debt decisions                                      | `context/lineage.ts`                                                                |
| [`context-coordinator.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/context-coordinator.ts) | participants, waves, tickets, generations, serialization, close      | `context/context-coordinator.ts`                                                    |
| [`evidence.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/evidence.ts)                       | records, copying, sequence, credits, acceptance, attachments, close  | `structural-copy.ts`, `evidence/evidence-record.ts`, `evidence/evidence-journal.ts` |
| [`evidence-sink.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/evidence-sink.ts)             | bounded delivery, truncation, failure, close                         | `evidence/evidence-sink.ts`                                                         |
| [`runtime-services.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/runtime-services.ts)       | `Clock`, `RuntimeEvidence`, Layer composition                        | `runtime-services.ts`                                                               |
| [`turn-plan.ts`](/Users/arpit/Developer/flow-state/packages/flow-state-rewrite/src/runtime/turn-plan.ts)                     | facts, causes, projections, pure plans                               | `turn-plan.ts`                                                                      |

For each slice, trace every production and test consumer from these sources
before deleting or collapsing an internal operation. Preserve observable
behavior; do not preserve accidental call authority.
