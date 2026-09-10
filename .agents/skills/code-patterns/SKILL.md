---
name: code-patterns
description: Review Flow State TypeScript and Effect code using bad/good patterns for ownership, lifetimes, admission, publication, types, and tests.
---

# Code patterns

## Data rule

- `Data` already provides immutable value types.
- `readonly`, `Readonly`, `ReadonlyMap`, `ReadonlySet`, `ReadonlyArray`, and
  custom `Readonly*` types are banned.
- Use `Data` for immutable values. Keep mutation behind its owner.
- The `anti-slop/no-readonly` rule enforces this boundary.
- Do not add readonly fields to Data examples.
- Use `Result` for success and failure.
- Use `Option` for presence and absence.
- Prefer `Data.TaggedEnum` for three or more domain variants.

## CP-01 — Return phase values

- **Bad:** Workflow `let` bindings, outer placeholders, mutable phase bags, staged `Object.assign`, or a `Ref` used to transport a one-shot result.
- **Good:** Each phase returns a complete value and its rollback actions. Register cleanup with acquisition, without an interruptible gap. Return current data instead of nesting the entire phase history.
- **Keep:** Explicit cursors for hostile dense-array capture or growing graph worklists. Do not replace a safe loop with attacker-sized allocation, recursion, or wrapper cells.

```ts
// Bad: the valid shape depends on which earlier assignments ran.
let prepared;
let attached;
prepared = yield* prepare(input);
attached = yield* attach(prepared);
return expose(attached);

// Good: each phase owns a complete value and its rollback obligation.
const prepared = yield* prepare(input);
const attached = yield* attach(prepared);
const activated = yield* activate(attached);
return yield* expose(activated);
```

## CP-02 — Give persistent state one owner

- **Bad:** Separate flags and completion cells describing one protocol, read-then-yield-then-write updates, or a `Ref` for every calculation.
- **Good:** One `Data.TaggedEnum` state. Use atomic owner transitions. Use `MutableRef` for synchronous transitions, `Ref.modify` for atomic Effect updates, and `SynchronizedRef.modifyEffect` for effectful transitions. Never hold a lock while waiting on work that needs that owner.
- **Keep:** Private `const` Map/Set/array builders in pure algorithms. Their mutators must not escape or be captured by asynchronous work. Persistent indexes mutate only through owner methods.

```ts
// Before: these can describe contradictory states.
let running = false;
let closed = false;
let completion;
```

```ts
// After: one complete data protocol.
type Attempt = Data.TaggedEnum<{
  Idle: {}
  Running: { completion: Deferred.Deferred<Exit.Exit<unknown, unknown>> }
  Done: { exit: Exit.Exit<unknown, unknown> }
}>;

const Attempt = Data.taggedEnum<Attempt>();
const idle = Attempt.Idle();
const running = Attempt.Running({ completion });
const done = Attempt.Done({ exit });
```

The owner still updates the state at a named linearization point. `Data` defines the
variants. `Ref` or `MutableRef` defines the transition.

## CP-03 — Constructing an Effect must not claim work

- **Bad:** Creating shared completion state, closing admission, or reserving cleanup merely when a function returns an Effect.
- **Good:** Claim work when the Effect executes. Install guaranteed completion without an interruption gap; restore interruption separately for followers. Shared bootstrap belongs to an owned fiber, so cancelling a waiter cannot cancel readiness.
- **Keep distinct:** Cached terminal disposal and retryable explicit release stages. A `retryOnFailure` boolean hides different protocols.

```ts
// Bad: discarding dispose() strands every later caller.
const dispose = () => {
  completion ??= Deferred.makeUnsafe();
  return runCleanup(completion);
};

// Good shape: ownership starts only when the returned Effect executes.
const dispose = () =>
  Effect.suspend(() =>
    Effect.uninterruptibleMask((restore) =>
      claimOrJoinDisposal(restore),
    ),
  );
```

## CP-04 — Cleanup returns outcomes without losing failures

- **Bad:** Mutable Cause accumulators, indexed replacement of cleanup results, `Cause.combine` for ordered failure accumulation, `Cause.squash` inside an owner, or retrying a failed finalizer by closing its Scope again.
- **Good:** Release in reverse order, attempt every independent participant, and return updated participant state plus all Exits. Preserve failure order and multiplicity, including equal reasons.
- **Keep:** Cache completed fiber Exits. Retry only failed explicit cancellation, release, or finalizer stages; never replay successful stages or completed work. Later cancellation success cannot erase an earlier interruption. Scope finalizers run once; physical release does not turn their failed Exit into success.

```ts
// Bad: hides stage state and deduplicates equal rc.112 reasons.
let cause;
for (const participant of participants) {
  const exit = yield* Effect.exit(participant.release);
  if (Exit.isFailure(exit)) cause = cause ? Cause.combine(cause, exit.cause) : exit.cause;
}

// Good: sequence is explicit; retain every result before classification.
const exits = yield* Effect.forEach(
  [...participants].reverse(),
  (participant) => Effect.exit(participant.release),
  { concurrency: 1 },
);
const reasons = exits.flatMap((exit) => Exit.isFailure(exit) ? exit.cause.reasons : []);
const cause = reasons.length === 0 ? Option.none() : Option.some(Cause.fromReasons(reasons));
```

## CP-05 — End owned lifetimes promptly

- **Bad:** Detached work, parent finalizers retaining disposed children, borrowed Scopes hidden in actor state, or treating a `closed` boolean as evidence of resource release.
- **Good:** Acquire resources inside the owner's scoped program. Its parent owns the fiber; release awaits the full Exit and removes completed child retention promptly. `Effect.forkIn` handles parent-finalizer removal when its child finishes.
- **Keep:** Ownership visible through acquisition, readiness, drain, disposal, and typed completion. Observe real resource finalizers; later parent shutdown must not repeat completed child cleanup or erase finalizer failures.

## CP-06 — Execute at the host boundary

- **Bad:** Domain `Effect.runSync*`/`runPromise*`, `Date.now`, a fresh default runtime for time reads, or an unmanaged `Effect.promise` bridge.
- **Good:** Return Effects and use the provided Clock and service Context. Capture that environment at runtime construction/readiness. Host adapters own execution and Promise rejection mapping with `Effect.tryPromise`.
- **Keep:** Synchronous postcommit work limited to prepared owned values; a runner cannot bypass this boundary.

```ts
// Bad: loses the provided test/request environment.
const timestamp = Effect.runSync(clock.now);

// Good: run inside the caller's Effect and captured service environment.
const timestamp = yield* clock.now;
```

## CP-07 — Match concurrency to dependencies

- **Bad:** Omitted concurrency on collection operators that accept it, parallel dependent acquisitions, or gated children whose bounded group must finish before their gate opens.
- **Good:** Use `{ concurrency: 1 }` for ordered acquisition and cleanup. Accumulate provided Context with sequential `Effect.reduce`, which takes no concurrency option. Give independent siblings explicit concurrency, barriers, and settlement rules.
- **Keep:** The waiter must not prevent its child or gate releaser from running. Prove progress with deterministic checkpoints, including shutdown settlement, rather than elapsed time.

## CP-08 — Preserve type relationships

- **Bad:** `any`, `as unknown as`, broad definition/`unknown` storage erasing known types, or casting an untyped registry result to a caller-chosen generic.
- **Good:** Carry definition, event, state, descriptor/key, and Effect A/E/R relationships through the owner. Use nominal witnesses for lookup; use closures and narrow existential capabilities when heterogeneous storage must hide a type.
- **Data utilities:** Use `Data.TaggedEnum.Value` to select a full variant. Use `Data.TaggedEnum.Args` to select its constructor fields. Use `WithGenerics` and `Kind` for generic unions. Use `Constructor` for an exported constructor bundle.
- **Keep:** `unknown` at external-input admission. Infer ordinary implementation returns; annotate genuine public, recursive, or inference boundaries. A "trusted registry" label does not prove a cast sound.

```ts
// Bad: the chosen D is supplied by the caller's assertion.
const actor = actors.get(key) as ActorInstance<D>;

// Good shape: the admitted nominal witness controls lookup.
const actor = directory.lookup(machineWitness, stableRef);
```

```ts
// Before: repeat the extraction rules at every call site.
type Done = Extract<Attempt, { _tag: "Done" }>;
type DoneFields = Omit<Done, "_tag">;
```

```ts
// After: derive both types from the tagged enum.
type Done = Data.TaggedEnum.Value<Attempt, "Done">;
type DoneFields = Data.TaggedEnum.Args<Attempt, "Done">;
```

## CP-09 — Admit once, then transform trusted values

- **Bad:** Repeating reflection, Schema decoding, membership scans, and copies inside a trusted transaction; assuming fresh external input is safe because its type is readonly.
- **Good:** `unknown → owner-level Result/Schema admission → owned typed value → plain transforms or Effects`. Capture hostile accessors/proxies, diagnostic precedence, and required stability rereads at that boundary. Preserve opaque identity and reuse private membership indexes afterward.
- **Data boundary:** `Data.taggedEnum` constructs trusted plain data. `$is` checks only `_tag`. It is not Schema admission. Decode unknown input first.
- **Keep:** Capture App-owned machine facts at App construction, preserving allowed mutations before construction. Each phase consumes the previous admitted value; new external mailbox, store, or key data still needs admission.

```ts
// Before: a Data tag check is treated as full validation.
if (Status.$is("Done")(unknownInput)) return unknownInput.exit;
```

```ts
// After: admit first, then match the trusted value.
const admitted = Schema.decodeUnknownResult(StatusSchema)(unknownInput);
const result = Result.map(
  admitted,
  Status.$match({
    Idle: () => undefined,
    Done: ({ exit }) => exit,
  }),
);
```

## CP-10 — Publish one committed cut

- **Bad:** Lifecycle overlays, revision side maps, duplicate evidence, rereading current state for a past record, or fallible work between irreversible mutation and publication/acknowledgement.
- **Good:** One publication owner holds snapshot and actor revisions. Prepare data, time, and capacity before mutation; select the sequence at the commit gate. Use the actual store result's revision and changed refs, then finalize publication/evidence before acknowledgement. Callbacks, downstream notification, and sink delivery follow it.
- **Keep:** Passive projection has no record; issue and lifecycle cuts retain their record rules. Protect cleanup credits before irreversible release. Close must not invalidate an already committed owner's prepared record.

## CP-11 — Prefer ordinary owned data

- **Bad:** Internal `Object.freeze`, persistent collections, recursive copy/freeze walkers, and readonly Map/Set facades used as substitutes for ownership. Freezing a Map does not disable its mutators.
- **Good:** Use private objects, arrays, Maps, and Sets. Reuse unchanged members by identity; allocate a new container when changing a retained value. Update lifecycle state at its owner instead of cloning whole attachment graphs.
- **Keep:** Private context lineage contains inherited ancestors only. Reuse it for ordinary events; create a new Map when ancestry changes. Keep the actor's own fence/revision in publication, without a duplicate self-entry.
- **Exception:** Capture/freeze once at an observable boundary that requires it: published snapshots, accepted evidence, executable arguments, canonical keys, or checkpoints. Preserve supported aliases/cycles and opaque application identity, including opaque plain objects. Private graph, plan, ledger, and rollback data need no freeze wrapper.

```ts
// Bad: clone, wrap and freeze data passed only to the next internal phase.
const captured = immutableRecord({ ...input });
const prepared = immutableRecord({ ...captured });
const graph = readonlyMap(new Map(entries));

// Good: capture external data once, then use ordinary owned values.
const admitted = captureInput(input);
if (Result.isFailure(admitted)) return admitted;
const graph = buildGraph(admitted.success.bindings);
return prepareAdmission(admitted.success, graph);
```

## CP-12 — Name the domain responsibility

- **Bad:** `Utils`, `Manager`, `Common`, generic `executePhase`, forwarding-only exports, a Service for every helper, or a large service collecting unrelated state.
- **Good:** Use cohesive owner modules with real dependency/lifetime boundaries. Services expose substitutable capabilities; pure algorithms and data need no service lookup. Share compatible data types without imposing shared workflow policy.
- **Keep:** Retryable release distinct from terminal close. Re-export actual public routes; retain a meaningful pure planning phase even when an export is unused.

## CP-13 — Coordinate through an owner

- **Bad:** Recursive downstream callbacks, ignored queue offers, waiting from a lane needed by the awaited wave, or replacing stale ticket inputs with current snapshots.
- **Good:** Callbacks notify a coordinator. Its own fiber captures inputs, offers independent work, and awaits publication/no-op/rejection tickets. Full, stale, suspended, and terminal outcomes settle finitely; healthy branches keep progressing.
- **Keep:** Publication owns lineage and installs compatible ancestor cuts before acknowledgement. The coordinator owns attempts and per-edge debt, merging outstanding cut requirements without completed history. Unrelated events cannot erase debt. No-op lineage reconciliation need not publish a revision or record; admission and resume cross the same coherence boundary. Drain waits for its captured generation, not later roots.

## CP-14 — Express variants and invariants directly

- **Bad:** Conditional empty-object/singleton-array spreads, nested workflow ternaries, numbered-phase or syntax-narrating comments, and vague names when the domain concept is known.
- **Good:** Return complete `Data.TaggedEnum` variants. Use `Data.taggedEnum` constructors and `$match` when they make the choice clear. Use named functions or explicit branches for larger or effectful choices. Name the operation, such as capture, publication, lineage merge, or cleanup.
- **Keep:** Comments explaining ordering, ownership, cursor invariants, or sound narrowing. Do not extract a single expression merely to shorten a function.

```ts
// Before: the record's shape is implicit in construction tricks.
const outcome = committed
  ? { ...base, revision }
  : { ...base, pending: true };
```

```ts
// After: four domain variants explain which fields belong together.
type Publication = Data.TaggedEnum<{
  Prepared: { snapshot: Snapshot }
  Published: { snapshot: Snapshot; revision: number }
  Superseded: { snapshot: Snapshot; replacement: Snapshot }
  Rejected: { snapshot: Snapshot; cause: FailureCause }
}>;

const Publication = Data.taggedEnum<Publication>();
const outcome = Publication.Published({ snapshot, revision });
const describe = Publication.$match({
  Prepared: () => "prepared",
  Published: ({ revision }) => `published at ${revision}`,
  Superseded: ({ replacement }) => `superseded by ${replacement}`,
  Rejected: ({ cause }) => `rejected: ${cause}`,
})(outcome);
```

## CP-15 — Test the real owner

- **Bad:** Local Sets proving deduplication, fabricated mailboxes proving capacity, flags standing in for disposal, source/title parity as behavior proof, sleep-based synchronization, or counting pending tests as passes.
- **Good:** Exercise actual owners with Deferred checkpoints, TestClock, scoped fibers, and explicit drains. Decorate real acquisition to observe or gate it; do not replace the behavior under test. Keep faults, revisions, identities, and expected outcomes visible.
- **Data proofs:** Test every constructor and `$match` branch. Add a compile proof for exhaustive cases. Do not use `$is` as proof that untrusted input is valid.
- **Keep:** Pure graph/equality/lineage unit tests and integration tests for cross-owner ordering/lifetimes. Reproduce bugs before repair; new characterization may already pass. Pending cases remain unproven. Consolidate weaker tests only after stronger owner proofs pass; extract only routine typed setup.

## CP-16 — Defaults must not invent missing state

- **Bad:** `?? 0`, `?? new Map()`, or `?? Scope.makeUnsafe()` concealing an uninitialized owner, lost revision history, or missing dependencies.
- **Good:** Initialize required facts in the owning phase. Read the owned Scope and publication state directly. Missing required internal state is an invariant failure; normalize optional external values at admission.
- **Keep:** Documented public defaults, zero indegree for a known new graph node, and empty buckets in private builders. These represent expected absence, not lost state.

```ts
// Bad: silently invents lifetime and ordering truth.
const scope = scopes.get(snapshot) ?? Scope.makeUnsafe("sequential");
const revision = publicationRevisions.get(snapshot) ?? 0;

// Good shape: initialized owner state carries required facts.
const scope = yield* Effect.scope;
const revision = publication.current.publicationRevision;
```

## CP-17 — Use native Effect composition

- **Bad:** Identity-only Result/Exit adapters, hand-written flattening callbacks, or wrappers replacing `undefined` with an Effect without adding policy.
- **Good:** Use `Effect.fromResult`, compose admitted Exits directly, use `Effect.flatten` for nested Effects, and `Effect.void` for a no-op. Direct `yield* exit` preserves its Cause.
- **Keep:** Adapters that classify an invalid empty Cause, map a foreign error, or preserve a host envelope. Normalize once; removing branches must not erase failure information.

```ts
// Bad: repeats the native Result and Exit protocols without adding policy.
const admitted = Result.isFailure(result)
  ? Effect.fail(result.failure)
  : Effect.succeed(result.success);
const restored = Exit.isSuccess(exit)
  ? Effect.succeed(exit.value)
  : Effect.failCause(exit.cause);

// Good: pinned rc.112 already provides these operations.
const admitted = Effect.fromResult(result);
const restored = exit;
```

## CP-18 — Separate snapshots from controller identity

- **Bad:** Immutable-looking values used as command handles, with WeakMaps forwarding them to hidden current state, Scope, or revision. Freezing the value does not explain that mutation.
- **Good:** Commands target a stable owner; reads return captured values. Older snapshots retain their meaning. Resource release belongs to the owner, not whichever snapshot a caller supplies.
- **Keep distinct:** `Data.TaggedEnum` values are snapshots, outcomes, or commands as data. A controller handle remains a separate stable owner.
- **Keep:** Nominal WeakSet/WeakMap mechanisms that prove admission. They are distinct from mutable state-forwarding tables; do not ban weak collections globally.

```ts
// Bad: a value secretly acts as a mutable identity handle.
latestStates.set(previousSnapshot, nextSnapshot);
scopes.set(nextSnapshot, scopes.get(previousSnapshot));
const current = currentState(previousSnapshot);

// Good shape: commands target the stable owner; reads return captured values.
const before = yield* controller.state();
yield* controller.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } });
const after = yield* controller.state();
```

## CP-19 — Keep infrastructure handles private

- **Bad:** Exposing raw queues, consumer Effects, or Scopes where callers need commands and observations. A readonly Queue property still permits mutation; a cold consumer Effect can start a second consumer.
- **Good:** Expose typed admission, dispatch, drain, and shutdown. The owner starts and supervises one consumer inside its lifetime; snapshot reads return values. Fill mailboxes through admission and gate the real consumer in tests.
- **Keep:** Infrastructure capabilities intentionally owned by a real adapter. Do not globally ban Queue or Scope types, or change a public command's return type to hide an internal leak.

## CP-20 — Share one transition across entrypoints

- **Bad:** Independent synchronous, asynchronous, and prepared paths each validating, advancing counters, consuming reservations, or publishing the same state.
- **Good:** One typed preparation and one owner transition. Wrappers differ only in waiting or result exposure. A prepared capability attests that fallible admission is complete; every entrypoint shares mutation and failure policy.
- **Keep:** Validation, copying, callbacks, clock reads, and sequence allocation out of the interval after irreversible store mutation and before acknowledgement. Test interleaved callers, cancellation, close, and actual store results; failed preparation changes no committed state.

## CP-21 — State retention and delivery semantics

- **Bad:** Assuming bounded ingress bounds downstream buffers, replay capacity bounds active unread items, or eventual subscription closure bounds a slow reader's live retention.
- **Good:** State the delivery law, retained data, and release event. Choose dropping, coalescing, backpressure, or lossless retention only when the consumer contract permits it. An arbitrary capacity is not a correctness fix.
- **Keep:** Ordered atomic publications and required activation, latest, suspended, and terminal replay. Each subscription belongs to its consuming Scope and releases on cancellation. Shutdown publishes terminal truth and completes without waiting indefinitely for a paused reader.
- **Be explicit:** Unbounded lossless delivery can retain unbounded lag. A replay slot or documented cost does not change that. Prove release through real acquisition/finalizer observations, not GC timing or fabricated queue counters.
