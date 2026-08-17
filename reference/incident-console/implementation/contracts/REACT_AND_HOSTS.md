# React and host contract

Status: normative vNext contract

This contract defines runtime construction, root and dynamic actor handles, mailbox dispatch,
readiness, React observation, SSR, request-scoped servers, dehydration, and disposal.

## Runtime and actor construction

### HOST-001 — Runtime construction synchronously creates root handles

`runtime({ app, layer?, boot? })` MUST consume the app's already compiled plan and
synchronously create one stable root actor handle with a pure initial or hydrated snapshot
for every module root. For an unhydrated root, construction invokes its definition's void-input
memory factory exactly once when present, otherwise materializing the canonical empty readonly
memory record, before that initial snapshot exists. Hydrated roots use materialized memory
instead. Fresh root factories run in compiled root order into inert local values before Flow
allocates a Queue, SubscriptionRef, registry entry, consumer, or Layer acquisition. A factory
defect fails fast, later factories are not called, the temporary vector is discarded, and no
handle or activity escapes; earlier pure factory calls have no rollback side effect to perform.
Managed Layer acquisition and activity activation MAY continue asynchronously. React, SSR,
CLI, inspection, and server hosts MUST all address those same handles; no host may create a
temporary actor shell.

This resolves the missing non-React root boundary in B5
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:140-165`) and preserves the settled
synchronous-root direction (`reference/incident-console/DESIGN_DECISIONS.md:941-999`).

### HOST-002 — Runtime exposes exact root lookup and dynamic creation

The host surface MUST include:

```ts
runtime.actor(rootMachine);
runtime.actor(dynamicMachine, { id });
runtime.createActor(dynamicMachine, { input, id? });
```

`runtime.actor(machine)` MUST perform compiled-root lookup only. It MUST reject a reachable
non-root machine, a foreign machine, a missing root, and ambiguous ownership. It MUST NOT create
an actor. `runtime.createActor` MUST accept only machine values present in the app's compiled
transitive closure and MUST require the exact machine input. That closure is seeded by module
roots and the app's static `dynamicMachines` tuple, then expanded through child bindings. Passing
a machine outside that closure MUST throw `UnreachableMachine`; app compilation cannot diagnose
an object that was never presented to it. Static dynamic admission MUST NOT create an instance,
make the machine root-addressable, or let a host install another machine after runtime
construction. An omitted dynamic actor ID MUST produce a runtime-local opaque ID; durable dynamic
actors MUST use an explicit stable ID or parent-child identity.

`runtime.actor(dynamicMachine, { id })` MUST perform lookup only for an existing durable dynamic
actor. It returns that actor's exact stable handle and never creates, adopts, changes input, or
changes disposal ownership. It MUST reject a missing ID, machine mismatch, opaque runtime-local
identity, disposed incarnation, foreign machine, and ambiguous ownership. `createActor` continues
to reject an ID collision; lookup and creation never merge into an idempotent adopt operation.

```ts
const root = runtime.actor(incidentMachine);
const editor = runtime.createActor(editorMachine, {
  id: "editor:incident-1",
  input: { incidentId: "incident-1" },
});
const restoredEditor = runtime.actor(editorMachine, { id: "editor:incident-1" });

// INVALID: lookup cannot create a dynamic actor.
runtime.actor(editorMachine);

// INVALID: createActor cannot admit a foreign machine.
runtime.createActor(foreignMachine, { input: undefined });
```

### HOST-003 — Public send is synchronous and command-only

The public actor command API MUST be:

```ts
actor.send(event): void;
```

`send` MUST synchronously admit the exact typed event to the actor's runtime-owned mailbox or
throw a synchronous Flow diagnostic when admission is impossible because the actor is
disposed or the event identity is foreign. It MUST NOT return a Promise, Effect, Fiber,
snapshot, actor, or acknowledgment handle. This keeps React event handlers ordinary:

```tsx
<button onClick={() => actor.send(Incident.E.RetryRequested())}>Retry</button>
```

An event sent before Layer acquisition completes MUST be admitted directly to the actor's real
Effect Queue with `Queue.offerUnsafe`, remain ordered there, and execute exactly once after
readiness. Synchronous construction has already placed restored pending-outcome IDs and the
boot-activation barrier before the handle escaped, so they remain ahead of every early host event.
Its ManagedRuntime-owned consumer, rather than each send call, waits on Layer
acquisition. Layer acquisition failure MUST close admission, fail queued acknowledged
dispatches, publish runtime failure, and prevent activity execution; it MUST NOT silently drop
the event. The current React shell violates this rule by implementing `send` as a no-op before
attachment (`packages/flow-state/src/react/use-actor.ts:20-57,130-161`).

### HOST-004 — Acknowledged dispatch is package-private and uses the same mailbox

The actor engine MUST provide one package-private operation equivalent to:

```ts
dispatchAcknowledged(actor, event): Effect.Effect<ActorSnapshot, FlowDispatchError>;
```

It MUST enqueue the same mailbox command as public `actor.send`; the only additional field is
a `Deferred` acknowledgment. The Deferred completes after that command's stabilized snapshot
is published and its immutable TurnRecord is accepted by the runtime hub, but before any
external sink processes that record or later asynchronous work settles. It MUST NOT bypass the
mailbox, call a second transition engine, flush later async work, or create a second semantic
execution path.

The story interpreter MUST use this package-private acknowledged dispatch for its `.send`
command. Actor disposal MUST fail every buffered acknowledgment before shutting down the
mailbox. This resolves B6 without changing public React ergonomics
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:167-183`).

### HOST-005 — Actor observation is an Effect Stream of atomic snapshots

Every root and dynamic actor MUST expose:

```ts
actor.getSnapshot(): ActorSnapshot<typeof actor.machine>;
actor.snapshots: Stream.Stream<ActorSnapshot<typeof actor.machine>>;
```

`getSnapshot` MUST return the latest immutable atomic publication synchronously.
`actor.snapshots` MUST replay the latest snapshot to a late subscriber and then publish each
later actor snapshot in order. State, memory, resources, transactions, streams, timers,
children, and active issue summaries MUST come from the same actor revision. Receipts and full
Causes belong to the post-publication TurnRecord inspection stream, not the ordinary actor
snapshot. Async completion MUST
return through the mailbox with its exact ref and generation before it can publish.

Both reads MUST project only the public snapshot from the actor engine's atomic private
`ActorState`; binding cursors and pending outcomes MUST NOT enter the host or React type.

Public actors MUST NOT expose mutable primitive stores, retry/reset transaction methods,
test progress controls, or transport-specific subscriptions. The current actor exposes such
methods at `packages/flow-state/src/core/api/runtime-types.ts:27-46`; vNext removes them.

## Readiness

### HOST-006 — `runtime.ready()` is the public readiness boundary

The runtime MUST expose:

```ts
runtime.ready(): Promise<void>;
```

The Promise MUST settle from the one shared ManagedRuntime Layer acquisition. It MUST resolve
only when the application Context is available, reject with the original Layer acquisition
failure, and return the same settlement to every caller. It MUST NOT create another runtime,
Scope, or Layer build.

The acquisition Promise is created once. If acquisition resolves first, every current/future
`ready()` returns that resolved Promise even after disposal; readiness reports the Layer build,
while shell lifetime separately moves `accepting -> disposing -> disposed`. If disposal wins while
acquiring, readiness rejects with the stable `RuntimeDisposed` FlowUsageError. If acquisition
failure wins first, its original failure remains the cached rejection after disposal. Provider
reads lifetime from its private store and never rewrites acquisition settlement.

Runtime readiness MUST NOT be exposed as a public `isLoading`, `status`, or external-store
property. It is host infrastructure, not application machine state. Tests, SSR, server, CLI,
and inspection hosts MAY await `runtime.ready()` before forcing work.

### HOST-007 — Provider owns a private synchronous readiness store

`FlowProvider` MUST adapt runtime acquisition to a package-private synchronous external store
for React. The store MUST have a stable server snapshot and MUST represent pending, ready,
failure, and terminal disposal internally. It MUST NOT be exported from `flow-state`,
`flow-state/react`, or any
other route.

During render, Provider MUST throw an acquisition failure or the stable disposed-runtime
diagnostic to the nearest React error boundary.
While acquisition is pending, Provider MUST expose the root actors' pure initial or hydrated
snapshots and MUST NOT suspend the tree or expose a generic loading value. This resolves Q5
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:534-539`).

## React

### HOST-008 — Provider accepts only an already-created runtime

The public Provider shape MUST remain:

```tsx
<FlowProvider runtime={runtime}>
  <App />
</FlowProvider>
```

Provider MUST NOT accept an app, Layer, boot payload, factory callback, actor ID, or startup
policy. It MUST NOT assemble services, create actors, hydrate mutable state, or own runtime
disposal. The current Provider already requires an explicit runtime
(`packages/flow-state/src/react/provider.ts:7-16`); vNext preserves that ownership boundary.

Browser runtimes MUST be constructed once outside React bootstrap. Request and story runtimes
MUST remain scope-owned. A component or hook MUST NOT construct a runtime in render, state
initialization, or an Effect hook.

### HOST-009 — `useActor` is synchronous root lookup without observation

The only hook shape MUST be:

```ts
const actor = useActor(incidentMachine);
```

`useActor` MUST return `runtime.actor(machine)`. It MUST accept no actor ID, input, snapshot,
restoration option, ownership policy, equality function, or startup option. It MUST NOT
subscribe the component to actor snapshots. A command-only component therefore MUST NOT
rerender on machine transitions.

```ts
// INVALID
useActor(incidentMachine, { id: "component-owned" });
```

The current hook accepts options, creates a shell, attaches in a layout effect, and broadly
subscribes through `useSource` (`packages/flow-state/src/react/use-actor.ts:86-206`); all four
behaviors are removed.

### HOST-010 — `useView` is the sole ordinary React read path

The exact overloads MUST be:

```ts
useView(view); // deterministic runtime-owned root
useView(actor, view); // explicitly owned dynamic actor
```

The one-argument overload resolves the view through the provider runtime's AppPlan and MUST find
exactly one public root binding. Zero or multiple matches throw a stable diagnostic without
creating an actor or subscription; declaration-time compile restriction is impossible because a
view exists before module root ownership is assigned.

The hook MUST lease an internal machine observer that subscribes to the actor, evaluates the
view against one atomic snapshot, and publishes through `useSyncExternalStore`. It MUST NOT
create, replace, or dispose the actor. It MUST NOT acquire resources or affect freshness,
retention, invalidation, or retry behavior.

There MUST be no comparator overload, `useResource`, `useTransaction`, `useCan`, Suspense
integration, or promise-throwing resource protocol. The current comparator overload is at
`packages/flow-state/src/react/use-view.ts:13-46`; the current public `useResource` export is
at `packages/flow-state/src/react-entry.ts:5-7`.

### HOST-011 — Observer equality is fixed and revision-safe

Machine observers MUST first compare with `Object.is`, then recursively reuse equal immutable
arrays and acyclic plain records with cycle detection. Class instances, functions, cyclic structures, and other
opaque values MUST remain identity-compared. Neither views nor hooks may configure equality.

A selector exception MUST be memoized for that actor revision and rethrown to the nearest
React error boundary. Re-reading one revision MUST NOT rerun a failing selector indefinitely
or return inconsistent values. This resolves Q6
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:544-548`).

### HOST-012 — Capabilities are reactive view projections

State-dependent and payload-dependent capabilities MUST be selected inside a view with
`can(snapshot, exactEvent)`. A component MUST NOT compute a reactive capability from
`actor.getSnapshot()` because `useActor` does not subscribe.

```ts
const editorView = view(editorMachine, {
  id: "todos.editor.view",
  select: (snapshot) => ({
    canAdd: (title: string) => can(snapshot, Todo.E.AddRequested(title)),
  }),
});
```

Flow MUST NOT add `useCan`, make `useActor` broadly reactive, or restore a capability table.
This resolves B11 (`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:257-276`).

## SSR, hydration, and server requests

### HOST-013 — Boot is immutable constructor input

The only hydration boundary MUST be:

```ts
const appRuntime = runtime({ app, layer, boot });
```

Boot MUST be decoded with the shared private v2 Schema, version-checked, app-checked,
normalized, and installed before any root
activity starts. Runtime MUST NOT expose mutable `hydrateBoot`. The v2 payload MUST contain
Flow and definition versions, app ID, application persistence version, actor identity and
kind, canonical ref inputs, one canonical resource store, referenced primitive identities,
and observed store revisions. Unknown storage enters through
`decodeRuntimeBoot(app, unknown, { decodeDomain })` for same-version domain validation; a changed
application persistence version rejects boot rather than invoking a generic migration.
Runtime construction never accepts unknown or an assertion-cast brand. These requirements resolve B3
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:95-121`).

### HOST-014 — SSR reads one immutable prepared snapshot

Server preload MUST complete through typed root-machine events in one request runtime, then that
runtime MUST dehydrate and dispose. Rendering uses a second request-owned runtime constructed from
that boot; React's `getServerSnapshot` reads this render runtime's fixed prepared construction
snapshot. No event or activity mutation may be admitted to the render runtime before server render
finishes. The request helper's private render mode therefore holds every consumer and restored-
activity barrier behind one activation latch while still allowing the shared Layer to become
ready; send/createActor/dehydrate reject in this mode, and disposal closes the latch without ever
activating work. It MUST NOT read moving actor state, throw a resource Promise, or derive data from a
client-only subscription. Client runtime construction with the same boot payload MUST produce the
same first view selection before subscriptions attach. The preload and render runtimes are never
live concurrently and each is disposed by its host scope.

### HOST-015 — Request runtimes have one scoped helper

The server route MUST expose these two inferred shapes:

```ts
withRequestRuntime({ app }, handler); // only when RequirementsOf<App> is never
withRequestRuntime({ app, layer, boot, mode: "render" }, handler);
```

A serviceful preload uses the helper as follows:

```ts
await withRequestRuntime({ app, layer, boot, mode: "active" }, async (runtime) => {
  const actor = runtime.actor(rootMachine);
  actor.send(AppEvents.E.PrefetchRequested());
  await runtime.runPromise(
    actor.snapshots.pipe(
      Stream.filter((snapshot) => snapshot.value === AppStates.S.READY),
      Stream.take(1),
      Stream.runDrain,
    ),
  );
  return runtime.dehydrate();
});
```

The helper has a no-Layer overload only when `RequirementsOf<App>` is `never`; otherwise `layer`
is required and must close every application requirement. `mode` defaults to `"active"`. The helper MUST construct one request-scoped runtime, await readiness before invoking the
handler, await the handler, and await disposal in every exit path. If the handler and disposal
both fail, it MUST throw `AggregateError([primary, cleanup], message, { cause: primary })` in that
order even when both values are reference-equal. A readiness failure is primary and the handler is
not invoked. Server preload MUST send typed root-machine events
and observe the root; it MUST NOT call services directly and fabricate resource snapshots.
The current helper already preserves handler and cleanup failures but accepts only a raw Layer
(`packages/flow-state/src/runtime/request-runtime.ts:6-53`).

## Effect execution, dehydration, and disposal

### HOST-016 — Effect bridges retain runtime service and error truth

The runtime MUST expose `runPromise` and `runPromiseExit` over Effects whose requirements are
satisfied by the runtime Context. `runPromiseExit` MUST resolve an Exit whose error channel retains
both the Effect error and Layer acquisition error; Layer acquisition failure MUST NOT reject this
Promise. These bridges MUST reuse the one ManagedRuntime and MUST NOT create an
unowned execution Scope.

### HOST-017 — Dehydration is revision-consistent

`runtime.dehydrate()` MUST return a Promise for one v2 boot payload. Capture acquires stable
registry leases for every root and durable dynamic actor selected at capture start, then
recursively includes child actors referenced by those snapshots. Every persisted parent,
machine, descriptor, exact ref, activity identity, and optimistic-overlay owner MUST resolve
inside the payload or compiled AppPlan. Runtime-local opaque actors are excluded; if one owns
persistent state that affects an included projection, capture fails with
`NonDurableActorOwnsPersistentState` instead of emitting an orphaned payload.

If a captured running stream owns concrete params outside the canonical durable carrier,
capture MUST fail with terminal `NonDurableActiveStreamParams`. It MUST NOT omit the stream,
rerun its selector during capture, or serialize only a non-invertible activity key.

Each actor snapshot MUST be internally atomic and record the resource-store revision it
observed. The resource store is captured once after the actor set has been leased, and actors
MAY come from slightly different instants. Concurrent replacement that prevents a closed cut
fails with retryable `ConcurrentDehydrate`. Hydration rematerializes primitive projections from
canonical store data and recorded refs; the runtime MUST NOT claim globally linearizable
multi-actor capture. This resolves B4
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:123-138`).

Rejected dehydration MUST throw the exported `FlowDehydrateError`. Its frozen `kind` is exactly
`ConcurrentDehydrate | NonDurableActorOwnsPersistentState | NonDurableActiveStreamParams |
IdentityClosureFailure | PayloadEncodingFailure | ArtifactBoundExceeded | RuntimeDisposed`, and
its readonly `retryable` property is true only for `ConcurrentDehydrate`. Actor/store internals and
full Effect Cause remain private. Field presence is exact: `NonDurableActorOwnsPersistentState`
requires `actorId`; `NonDurableActiveStreamParams` requires `actorId`, `descriptorId`, and `path`;
`IdentityClosureFailure`, `PayloadEncodingFailure`, and `ArtifactBoundExceeded` require `path`;
`ConcurrentDehydrate` and `RuntimeDisposed` expose none of those fields. Inapplicable fields are
absent rather than present as `undefined`.

Pending and queued transactions MUST restore as `interrupt`, remove their optimistic
overlays, record restoration evidence, and fire no settlement route. In-flight resource work
MUST not be serialized; reconstructed activities decide whether to start a new generation.

### HOST-018 — Disposal is idempotent, complete, and observable

`runtime.dispose()` MUST stop admission, fail buffered mailbox acknowledgments, interrupt
owned activities, await every actor-owned finalizer, classify complete cleanup Causes, publish one
terminal disposed actor snapshot with any fatal or cleanup issue summaries, complete actor
snapshot streams, and settle exactly once. Public actor lifecycle has only `active` and
`disposed`; contained operation failure remains active, while a fatal Flow invariant closes
admission and reaches this single disposal path.
Flow cleanup MUST continue non-abortably after a host stops waiting. A second dispose call
MUST return the first settlement.

Disposal begins with an out-of-band shell compare-and-set and races readiness, so it MUST complete
even if Layer acquisition is permanently pending. It interrupts/awaits each consumer, fails the
current and drained buffered Deferreds, then shuts down Queues. Actor snapshots contain only actor-
owned cleanup issues. Application-Layer/global ManagedRuntime finalizer failure is discovered after
actor publication and is recorded as a runtime TurnRecord/diagnostic. After readiness, Flow MUST
dispose and await every actor/activity/store execution Scope before invoking
`ManagedRuntime.disposeEffect`, so an application Layer finalizer cannot race service-using actor
finalizers. The shared dispose Promise
rejects with one `FlowDisposeError` containing one ordered aggregate Cause that retains duplicate
reasons. A half-published store/actor turn
is impossible under SEM-004's uninterruptible commit boundary.

If disposal begins from the acknowledged waiter while the actor is still completing that
acknowledgment, the already-committed turn finishes its uninterruptible tail: it opens the
TurnRecord gate, releases StoreFanout, and clears current-command ownership before honoring
interruption. That acknowledgment remains successful and MUST NOT later be failed or completed a
second time.

When disposal wins before readiness, every buffered public-send command is discarded without
executing its planner, callbacks, or activities; every buffered acknowledged command fails exactly
once with the cached disposed diagnostic. Future public sends throw synchronously. Service-free
terminalization removes every shell registry entry, SubscriptionRef subscriber, Queue, readiness
waiter, and package-owned fiber before the shared dispose Promise settles, so a permanently pending
Layer cannot leave an unreachable runtime shell alive.

Root actors MUST NOT expose individual disposal. `DynamicActor.dispose()` MUST stop only that
dynamic actor and be idempotent. A successful story run or request helper return MUST imply
that runtime disposal completed.

## Proof obligations

### HOST-P01 — Early dispatch and readiness proof

Tests MUST prove that an event sent through synchronous `actor.send` before Layer acquisition
is processed exactly once after readiness, remains mailbox-ordered, and is not lost. Typed
Layer acquisition failure MUST reject `runtime.ready()`, reach Provider's error boundary, fail
package-private waiting acknowledgments, and prevent activity execution.

### HOST-P02 — One-engine acknowledgment proof

Tests MUST prove that public `send` and package-private acknowledged dispatch enqueue the same
mailbox command and produce identical actor snapshots and post-publication TurnRecords. Story
`.send().checkpoint()` MUST capture the acknowledged event turn without flushing a later
operation completion.

### HOST-P03 — Atomic publication proof

Reentrant sends, resource completions, transaction completions, timers, streams, and children
MUST preserve mailbox order. Every acknowledged command MUST publish exactly one immutable
snapshot, and stale generations MUST never overwrite a newer snapshot.

### HOST-P04 — React and SSR proof

Packed React 18 and React 19 tests MUST cover readiness, Provider failure, root lookup,
command-only non-rerender, view rerender, subscribe/unsubscribe races, fixed server snapshots,
hydration-first-render equality, and Strict Mode without leaked runtimes or cache leases. The
live packed runner already provisions both React majors
(`packages/flow-state/scripts/check-packed-consumers.mjs:381-417`).

### HOST-P05 — Disposal proof

Tests MUST prove admission closure, buffered acknowledgment failure, exactly-once finalizers,
complete-Cause classification, terminal snapshot publication, stream completion, dynamic
actor disposal, runtime disposal idempotence, and preservation of simultaneous execution and
cleanup failure.
