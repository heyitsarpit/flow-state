# Ownership and state

Read this when a change assigns responsibility for persistent state, snapshots, revisions, or lifecycle identity.

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
