---
name: code-patterns
description: Review Flow State TypeScript and Effect code using bad/good patterns for ownership, lifetimes, admission, publication, types, and tests.
---

# Code patterns

These are review patterns, not universal lint laws. A semantic ownership or
lifetime concern belongs in review unless a rule can identify a narrow,
contract-backed unsafe operation. Do not promote a naming heuristic, a generic
relationship, or an ownership judgment to a hard syntax error without that proof.

## Data boundary

- `Data` provides immutable value types when the domain uses it; it does not
  replace every public shape or ownership boundary.
- Private builders may use mutable objects, arrays, Maps, and Sets when their
  mutators stay behind the owner and do not escape into asynchronous work.
- Use `readonly`, `Readonly`, readonly collection views, or custom readonly
  types when a public contract requires a non-mutating shape or when they
  preserve a real type relationship. Do not treat a project-local
  `no-readonly` check as permission to reject those contract-required shapes.
- Capture or freeze once at an observable boundary only when the contract
  requires an immutable snapshot, accepted argument, canonical key, or
  checkpoint. Freezing a Map or Set does not disable its mutators, and freezing
  private data is not an ownership design.
- Use `Result` for success and failure.
- Use `Option` for presence and absence.
- Prefer `Data.TaggedEnum` for three or more domain variants.

## CP-01 — Return phase values

- **Bad:** Workflow `let` bindings, outer placeholders, mutable phase bags, staged `Object.assign`, or a `Ref` used to transport a one-shot result.
- **Good:** Each phase returns a complete value whose owned resources and rollback
  actions are explicit. Register cleanup with acquisition, without an interruptible
  gap. Return current data instead of nesting the entire phase history.
- **Keep:** Explicit cursors for hostile dense-array capture or growing graph worklists. Do not replace a safe loop with attacker-sized allocation, recursion, or wrapper cells.

```ts
// Bad: the valid shape depends on which earlier assignments ran.
let prepared;
let attached;
prepared = yield* prepare(input);
attached = yield* attach(prepared);
return expose(attached);

// Good: the phase value carries the rollback obligation for its owned resource.
const prepared = yield* prepare(input);
const attached = yield* attach(prepared);
const activated = yield* activate(attached);
return yield* expose({
  value: activated.value,
  resource: attached.resource,
  rollback: attached.rollback,
});
```

## CP-02 — Give persistent state one owner

- **Bad:** Separate flags and completion cells describing one protocol, read-then-yield-then-write updates, or a `Ref` for every calculation.
- **Good:** One `Data.TaggedEnum` state for one protocol, with atomic owner
  transitions. Use `MutableRef` for synchronous transitions, `Ref.modify` for
  atomic Effect updates, and `SynchronizedRef.modifyEffect` for effectful
  transitions. Never hold a lock while waiting on work that needs that owner.
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

- **Bad:** Creating shared completion state, closing admission, or reserving cleanup
  merely when a function returns an Effect.
- **Good:** Claim work inside an executing owner transition. Install guaranteed
  completion without an interruption gap; restore interruption separately for
  followers. Shared bootstrap belongs to an owned fiber, so cancelling a waiter
  cannot cancel readiness.
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

- **Bad:** Mutable Cause accumulators, indexed replacement of cleanup results,
  `Cause.combine` when ordered repeated reasons must be preserved, `Cause.squash`
  inside an owner, or retrying a failed finalizer by closing its Scope again.
- **Good:** Release in reverse order, attempt every independent participant, and
  return updated participant state plus all Exits. Preserve failure order and
  multiplicity, including equal reasons. `Cause.combine` remains valid when the
  contract permits its parallel/tree or value-deduplicating semantics.
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
const reasons = exits.flatMap((exit) =>
  Exit.isFailure(exit) ? exit.cause.reasons : [],
);
const cause = Cause.fromReasons(reasons);
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

- **Bad:** Repeating reflection, Schema decoding, membership scans, and copies
  inside a trusted transaction; assuming fresh external input is safe merely
  because its type is readonly.
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

- **Bad:** Lifecycle overlays, revision side maps, duplicate evidence, rereading
  current state for a past record, confusing a reserved sequence with a committed
  or accepted sequence, or retrying mutation after a post-commit publication or
  evidence failure.
- **Good:** One publication owner holds the current snapshot and revisions.
  Reserve capacity before mutation, obtain the committed sequence at the commit
  gate, and capture an accepted delivery cutoff separately. Use the actual store
  result's revision and changed references, finalize publication/evidence before
  acknowledgement, and deliver only the committed accepted cut. After store
  commit, publication or evidence failure preserves that committed cut: do not
  rerun mutation, allocate duplicate evidence, or acknowledge the failed
  publication as successful.
- **Keep:** Passive projection has no record; issue and lifecycle cuts retain their record rules. Protect cleanup credits before irreversible release. Close must not invalidate an already committed owner's prepared record.

## CP-11 — Prefer ordinary owned data at the correct boundary

- **Bad:** Internal `Object.freeze`, persistent collections, recursive copy/freeze
  walkers, or readonly Map/Set facades used as substitutes for ownership. Also
  bad is a blanket ban that rejects a contract-required readonly public shape or
  frozen observable snapshot.
- **Good:** Use private mutable objects, arrays, Maps, and Sets behind their owner.
  Reuse unchanged members by identity; allocate a new container when changing a
  retained value. At a contract-required observable boundary, capture or freeze
  once and preserve the required aliases, cycles, and opaque identity. Update
  lifecycle state at its owner instead of cloning whole attachment graphs.
- **Keep:** Private context lineage contains inherited ancestors only. Reuse it for ordinary events; create a new Map when ancestry changes. Keep the actor's own fence/revision in publication, without a duplicate self-entry.
- **Exception:** Capture/freeze once at an observable boundary that requires it: published snapshots, accepted evidence, executable arguments, canonical keys, or checkpoints. Preserve supported aliases/cycles and opaque application identity, including opaque plain objects. Private graph, plan, ledger, and rollback data need no freeze wrapper.

```ts
// Bad: clone and freeze data passed only to the next internal phase.
const captured = Object.freeze({ ...input });
const prepared = Object.freeze({ ...captured });

// Good: capture external data once, then use ordinary owned values.
const admitted = captureInput(input);
if (Result.isFailure(admitted)) return admitted;
const graph = buildGraph(admitted.success.bindings);
return prepareAdmission(admitted.success, graph);
```

## CP-12 — Name the domain responsibility

- **Review signal, not a lint rule:** `Utils`, `Manager`, `Common`, generic
  `executePhase`, forwarding-only exports, a Service for every helper, or a large
  service collecting unrelated state may hide a boundary. A name alone is not a
  defect; inspect ownership, dependencies, and lifetime.
- **Good:** Use cohesive owner modules with real dependency/lifetime boundaries. Services expose substitutable capabilities; pure algorithms and data need no service lookup. Share compatible data types without imposing shared workflow policy.
- **Keep:** Retryable release distinct from terminal close. Re-export actual public routes; retain a meaningful pure planning phase even when an export is unused.

## CP-13 — Coordinate through an owner

- **Bad:** Recursive downstream callbacks, ignored queue offers, waiting from a lane needed by the awaited wave, or replacing stale ticket inputs with current snapshots.
- **Good:** Callbacks notify a coordinator. Its own fiber captures inputs, offers independent work, and awaits publication/no-op/rejection tickets. Full, stale, suspended, and terminal outcomes settle finitely; healthy branches keep progressing.
- **Keep:** Publication owns lineage and installs compatible ancestor cuts before acknowledgement. The coordinator owns attempts and per-edge debt, merging outstanding cut requirements without completed history. Unrelated events cannot erase debt. No-op lineage reconciliation need not publish a revision or record; admission and resume cross the same coherence boundary. Drain waits for its captured generation, not later roots.

## CP-14 — Express variants and invariants directly

- **Bad:** Conditional empty-object/array spreads, nested workflow ternaries, numbered-phase or syntax-narrating comments, and vague names when the domain concept is known.
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

## CP-16 — Required state must be initialized by its owner

- **Bad:** `?? 0`, `?? new Map()`, or a fabricated scope concealing an
  uninitialized owner, lost revision history, or missing dependencies. Treating a
  missing scope as a successful no-op is also bad. Do not key lifecycle state by a
  replaceable snapshot and then default missing entries.
- **Good:** Initialize scope, revision, cleanup state, and current snapshot
  together in controller-owned identity. Read those required facts directly;
  missing internal state is an invariant failure. Normalize optional external
  values at admission, and keep documented public defaults distinct from missing
  owner state.
- **Keep:** Documented public defaults, zero indegree for a known new graph node, and empty buckets in private builders. These represent expected absence, not lost state.

```ts
// Bad: snapshot-keyed lifecycle state turns missing required facts into a no-op.
const scope = scopes.get(snapshot);
const revision = publicationRevisions.get(snapshot);
if (scope === undefined || revision === undefined) {
  return Result.succeed(undefined);
}

// Good shape: the stable owner carries required facts together.
const lifecycle = controller.lifecycle;
if (lifecycle === undefined) return invariantFailure("lifecycle");
const { scope, revision } = lifecycle;
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

## CP-18 — Put lifecycle state on controller-owned identity

- **Bad:** Immutable-looking values used as command handles, with WeakMaps
  forwarding them to hidden current state, Scope, revision, or cleanup. Keying
  lifecycle state by snapshots makes an older value appear to control current
  work; freezing the value does not explain that mutation.
- **Good:** A stable controller-owned identity holds the lifecycle Scope, revision,
  cleanup state, and current snapshot. Commands target that owner; reads return
  captured values. Older snapshots retain their meaning, and resource release
  belongs to the owner, not whichever snapshot a caller supplies.
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

- **Bad at a public route:** Exposing raw queues, consumer Effects, or Scopes
  where callers need commands and observations. A readonly Queue property still
  permits mutation; a cold consumer Effect can start a second consumer.
- **Good:** Expose typed admission, dispatch, drain, and shutdown at the package
  boundary. The owner starts and supervises one consumer inside its lifetime;
  snapshot reads return values. Fill mailboxes through admission and gate the
  real consumer in tests.
- **Keep:** Check actual package-public routes and their adapters, not every
  internal export or owner field. Infrastructure capabilities intentionally owned
  by a real adapter are not leaks. Do not globally ban Queue or Scope types.

## CP-20 — Share one transition across entrypoints

- **Bad:** Independent synchronous, asynchronous, and prepared paths each validating, advancing counters, consuming reservations, or publishing the same state.
- **Good:** One typed preparation and one shared owner mutation helper. Ordinary
  and prepared entrypoints may differ in admission or waiting, but both invoke the
  same transition and failure policy. A prepared capability attests that fallible
  admission is complete and is non-forgeable by ordinary input.
- **Keep:** Validation, copying, callbacks, clock reads, and sequence allocation out of the interval after irreversible store mutation and before acknowledgement. Test interleaved callers, cancellation, close, and actual store results; failed preparation changes no committed state.

## CP-21 — State retention and delivery semantics

- **Bad:** Assuming bounded ingress bounds downstream buffers, replay-seed
  capacity bounds an active subscriber's unread backlog, or eventual subscription
  closure bounds a slow reader's live retention.
- **Good:** Distinguish replay seed capacity from active-subscriber backlog. State
  the delivery law, retained data, and release event. Choose dropping, coalescing,
  backpressure, or lossless retention only when the consumer contract permits it.
  An arbitrary capacity is not a correctness fix.
- **Keep:** Ordered atomic publications and required activation, latest, suspended, and terminal replay. Each subscription belongs to its consuming Scope and releases on cancellation. Shutdown publishes terminal truth and completes without waiting indefinitely for a paused reader.
- **Be explicit:** Unbounded lossless delivery can retain unbounded lag. A replay slot or documented cost does not change that. Prove release through real acquisition/finalizer observations, not GC timing or fabricated queue counters.

## Review-only obligations

These cases depend on ownership, ordering, generic relationships, or the observation
contract. Review them with real-owner behavior and API proofs; do not turn them into
blanket syntax rules that reject valid designs.

### R-01 — Preserve ordered cleanup causes

- **Bad:** Combining sequential cleanup failures with `Cause.combine` when the
  contract requires ordered repeated reasons; its tree or value-deduplicating
  semantics can lose execution order or make duplicate reasons indistinguishable.
- **Good:** Run independent cleanup stages in reverse order with explicit sequential
  concurrency, retain every `Exit`, and build the final cause from the ordered reason
  list with `Cause.fromReasons`. `Cause.combine` remains valid when the contract
  permits parallel/tree or value-deduplicating semantics.
- **Review proof:** Include repeated equal failures, mixed failures, successful stages,
  and retry behavior. Retry only failed explicit stages; do not replay successful work.

```ts
// Bad: sequential failures are combined as a tree and duplicate reasons are obscured.
cleanupCause =
  cleanupCause === undefined
    ? released.cause
    : Cause.combine(cleanupCause, released.cause);

// Good: preserve every result and classify the ordered reason list.
const exits = yield* Effect.forEach(
  [...steps].reverse(),
  (step) => Effect.exit(step.release),
  { concurrency: 1 },
);
const reasons = exits.flatMap((exit) =>
  Exit.isFailure(exit) ? exit.cause.reasons : [],
);
const cause = Cause.fromReasons(reasons);
```

### R-02 — Release the acceptance lock before sink delivery

- **Bad:** Holding the acceptance semaphore while draining sinks. A slow or failing
  sink then blocks new record acceptance and couples commit capacity to delivery speed.
- **Good:** Capture the accepted prefix under the lock, release the lock, and deliver
  that captured cutoff afterward. The committed prefix and sink delivery remain
  separate phases.
- **Review proof:** Interleave acceptance and drain with a slow sink; prove records
  after the cutoff can be accepted and that delivery does not read a moving boundary.

```ts
// Bad: sink delivery runs while the acceptance semaphore is held.
const drain = () => semaphore.withPermit(drainUnsafe());

const drainUnsafe = Effect.gen(function* () {
  for (const sink of sinks) {
    yield* sink.drain();
  }
});

// Good: capture the accepted prefix, then deliver only through that cutoff.
const drain = () =>
  Effect.gen(function* () {
    const cutoff = yield* semaphore.withPermit(
      Effect.sync(() => captureAcceptedPrefix()),
    );

    return yield* deliverSinksThrough(cutoff);
  });
```

### R-03 — Give sink attachment one owner

- **Bad:** Checking only sink shape or private fields before appending a sink. The same
  sink can then attach twice or attach across runtime hubs.
- **Good:** The evidence hub owns sink identity, rejects duplicate same-hub and
  foreign-hub attachment, and records the current sequence as a late-attachment
  baseline. Delivery filters records to the attachment baseline and captured
  cutoff.
- **Review proof:** Test duplicate attachment, mixed-runtime attachment, and late
  attachment against the documented baseline and delivery contract.

```ts
// Bad: shape validation does not establish ownership or prevent duplicate attachment.
if (!sinkInternals.has(sink)) {
  return Result.fail(invalidEvidence("sink"));
}

sinks.push(sink);
return Result.succeed(undefined);

// Good: the hub owns sink identity and records the attachment baseline.
type Attachment = {
  readonly hub: EvidenceHub;
  readonly baseline: number;
};

const sinkOwners = new WeakMap<EvidenceSink, Attachment>();

const attach = (sink: EvidenceSink) => {
  const previous = sinkOwners.get(sink);

  if (previous !== undefined) {
    return Result.fail(
      previous.hub === hub
        ? duplicateSinkEvidence()
        : foreignSinkEvidence(),
    );
  }

  const baseline = currentSequence();
  sinkOwners.set(sink, { hub, baseline });
  sinks.push({ sink, baseline });
  return Result.succeed(undefined);
};

const deliver = (sink: EvidenceSink, attachment: Attachment, cutoff: number) =>
  deliverRecordsThrough(
    sink,
    recordsAfter(attachment.baseline, cutoff),
  );
```

### R-04 — State the slow-reader retention law

- **Bad:** Treating a replay slot as a bound on active subscriber backlog, or
  treating eventual subscription closure as a bound on live unread data. A
  `SubscriptionRef` latest-value read and its change stream are not the same
  retention law: `get` reads the latest value, while `changes` uses unbounded
  active-reader retention unless a contractually bounded delivery mechanism is
  layered around it.
- **Good:** Choose the contractually correct delivery law: latest-value reads,
  explicitly bounded dropping/coalescing delivery, backpressure, or documented
  lossless retention. Document what is retained and which cancellation or shutdown
  event releases it.
- **Review proof:** Use a real slow reader and real producer. Prove ordering or
  coalescing, retention bounds, and shutdown completion without waiting indefinitely
  for the paused reader.

```ts
// Bad: an unbounded queue retains every unread snapshot for a slow reader.
const snapshots = Stream.fromQueue(unboundedSnapshotQueue);

yield* Queue.offer(unboundedSnapshotQueue, snapshot);

// Good: a latest-value read does not promise a bounded change stream.
const latestSnapshot = yield* SubscriptionRef.get(snapshotRef);
const changes = SubscriptionRef.changes(snapshotRef);
```

```ts
// Good alternative: explicitly bound and document dropping/coalescing behavior.
const snapshots = yield* Queue.dropping<ActorSnapshot>(1);
```

### R-05 — Keep raw runtime infrastructure private

- **Bad at a package-public route:** Exposing `Queue`, `Scope`, or a cold consumer
  `Effect` as public fields. A readonly-looking queue is still a mutation
  capability, and a cold consumer can start a second consumer.
- **Good:** Expose typed command admission, dispatch, drain, and shutdown
  operations. The owner starts and supervises exactly one consumer inside its
  lifetime; tests gate that real consumer through public admission.
- **Review proof:** Inspect the actual package-public route and its adapter
  exceptions together. Internal owner fields and exports are not automatically
  public leaks. Prove that callers cannot bypass admission, create an extra
  consumer, or control the owner's lifetime through an infrastructure handle.

### R-06 — Compare admission and provider fences separately

- **Bad:** Comparing every context fact with one ordinary fact fence, or treating a
  provider fence as the admission target fence.
- **Good:** Compare the admission target fence with the current consumer fence,
  then compare each provider fence with the current fence for that provider. A
  projection fact does not gain a consumer field merely because it is a
  projection. Reject or no-op a mismatched ticket according to the contract.
- **Review proof:** Include a mismatched-fence case and prove that a stale or unrelated
  projection cannot deliver into the current context wave.

```ts
// Good: compare the admission target and provider fences independently.
const targetFence = input.fence;

if (!sameFence(targetFence, currentConsumerFence)) {
  return Result.succeed(undefined);
}

for (const provider of contextProviders(fact)) {
  if (!sameFence(provider.fence, currentProviderFence(provider.key))) {
    return Result.succeed(undefined);
  }
}
```

### R-07 — Preserve adapter generic relationships

- **Bad:** Storing an adapter as `unknown`, recovering it with a cast, or replacing the
  declaration-specific input/output relationship with `(...args: never[]) => void`.
- **Good:** Keep a typed capability that pairs each declaration with its descriptor,
  input, invocation, and result from construction onward. Use an owner-specific
  existential representation when heterogeneous storage must hide the concrete
  declaration; do not restore the relationship with a caller-selected cast.
- **Review proof:** Exercise multiple declaration types and verify that each adapter
  accepts and returns only the type belonging to its own declaration.

```ts
// Bad: the adapter relationship is erased and recovered with a cast.
type StoredOperationAdapter = (...args: unknown[]) => unknown;

const attachOperationAdapter = (
  descriptor: OperationDeclaration,
  adapter: unknown,
) => {
  Object.defineProperty(descriptor, adapterTypeId, { value: adapter });
};

return (descriptor as InternalOperationDescriptor)[adapterTypeId];

// Good: keep the declaration-specific capability intact.
type OperationCapability<Descriptor extends OperationDeclaration> = {
  descriptor: Descriptor;
  invoke: (input: OperationInput<Descriptor>) => OperationResult<Descriptor>;
};

const publishOperation = <Descriptor extends OperationDeclaration>(
  capability: OperationCapability<Descriptor>,
) => capability;
```

### R-08 — Preserve generic identity through construction

- **Bad:** Using `WeakMap<object, unknown>` and casting its result to a caller-selected
  generic such as `AppPlan<Modules>`. The key does not carry proof of that relationship.
- **Good:** Return a typed capability from construction, with the module relationship
  captured by that instance. If heterogeneous storage erases the relationship, its
  lookup must not promise a caller-selected generic. A nominal weak collection may
  prove admission, but it must not forward mutable state or restore erased generic
  identity.
- **Review proof:** Check cross-typed app/module lookups, construction boundaries, and
  older snapshots; no caller assertion may choose the recovered generic.

```ts
// Bad: the key carries no proof for the caller-selected generic.
const plans = new WeakMap<object, unknown>();

const readPlan = <Modules extends AnyModule>(app: App<Modules>) =>
  plans.get(app) as AppPlan<Modules>;

// Good: retain the relationship in the instance created for this module set.
type AppCapability<Modules extends AnyModule> = {
  readPlan: () => AppPlan<Modules>;
};

function makeApp<Modules extends AnyModule>(
  plan: AppPlan<Modules>,
): App<Modules> & AppCapability<Modules> {
  return Object.assign(createApp(plan), {
    readPlan: () => plan,
  });
}
```

### R-09 — Avoid casts after `Object.entries` and `Object.values`

- **Bad:** Casting reflected values directly to a declaration-specific array, such as
  `Object.values(definition.E) as Timer<DefinitionValue>["target"][]`. Do not use
  `Object.values(definition) as const`; a const assertion cannot make an arbitrary
  reflected expression declaration-specific.
- **Good:** Let the owning compiler helper preserve the declaration relationship and
  return the typed collection from the source definition. A narrow, justified
  owner-specific narrowing after reflection may remain valid; it is not a license
  for a caller-selected generic cast.
- **Review proof:** Cover heterogeneous definitions and ensure the helper cannot
  associate an event or target with a different machine definition.

### R-10 — Preserve provider `A/E/R` channels

- **Bad:** Erasing provider acquire effects to `Effect<unknown, unknown, unknown>`,
  restoring their relationships with unchecked casts, or changing a contract's
  declared duplicate-configuration behavior merely to fit a generic failure rule.
- **Good:** Preserve the provider service key and exact acquire `A/E/R` channels
  through admission. Implement duplicate-service behavior exactly as the owning
  contract declares: it may intentionally throw synchronously for duplicate
  configuration, or it may use `Result` or a typed failure channel. Keep the
  existential provider representation explicit and owner-specific.
- **Review proof:** Check duplicate providers, heterogeneous services, typed failures,
  defects, and interruption against the contract. Do not universalize either raw
  throws or typed `Result` failure behavior.
