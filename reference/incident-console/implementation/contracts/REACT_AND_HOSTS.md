# React and host contract

Status: normative vNext contract

This contract defines runtime construction, root and dynamic actor handles, mailbox dispatch,
readiness, React observation, SSR, request-scoped servers, dehydration, and disposal.

## Runtime and actor construction

### HOST-001 — Runtime construction synchronously creates root handles

`runtime({ app, layer?, boot? })` MUST consume the app's already compiled plan and
synchronously create one stable root actor handle with a pure initial or hydrated snapshot
for every module root.
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
runtime.createActor(dynamicMachine, { input, id? });
```

`runtime.actor(machine)` MUST perform compiled-root lookup only. It MUST reject a reachable
non-root machine, a foreign machine, a missing root, and ambiguous ownership. It MUST NOT
create an actor. `runtime.createActor` MUST accept only app-reachable machine definitions and
MUST require the exact machine input. An omitted dynamic actor ID MUST produce a runtime-local
opaque ID; durable dynamic actors MUST use an explicit stable ID or parent-child identity.

```ts
const root = runtime.actor(incidentMachine);
const editor = runtime.createActor(editorMachine, {
  id: "editor:incident-1",
  input: { incidentId: "incident-1" },
});

// INVALID: lookup cannot create a dynamic actor.
runtime.actor(editorMachine);

// INVALID: createActor cannot admit a foreign definition.
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
readiness. Its ManagedRuntime-owned consumer, rather than each send call, waits on Layer
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
a `Deferred` acknowledgment completed after that command's stabilized actor turn publishes
exactly once. It MUST NOT bypass the mailbox, call a second transition engine, flush later
async work, or create a second semantic execution path.

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
children, receipts, and issues MUST come from the same actor revision. Async completion MUST
return through the mailbox with its exact ref and generation before it can publish.

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

Runtime readiness MUST NOT be exposed as a public `isLoading`, `status`, or external-store
property. It is host infrastructure, not application machine state. Tests, SSR, server, CLI,
and inspection hosts MAY await `runtime.ready()` before forcing work.

### HOST-007 — Provider owns a private synchronous readiness store

`FlowProvider` MUST adapt runtime acquisition to a package-private synchronous external store
for React. The store MUST have a stable server snapshot and MUST represent pending, ready, and
failure internally. It MUST NOT be exported from `flow-state`, `flow-state/react`, or any
other route.

During render, Provider MUST throw an acquisition failure to the nearest React error boundary.
While acquisition is pending, Provider MUST expose the root actors' pure initial or hydrated
snapshots and MUST NOT suspend the tree or expose a generic loading value. This resolves Q5
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:541-549`).

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

The hook MUST lease an internal machine observer that subscribes to the actor, evaluates the
view against one atomic snapshot, and publishes through `useSyncExternalStore`. It MUST NOT
create, replace, or dispose the actor. It MUST NOT acquire resources or affect freshness,
retention, invalidation, or retry behavior.

There MUST be no comparator overload, `useResource`, `useTransaction`, `useCan`, Suspense
integration, or promise-throwing resource protocol. The current comparator overload is at
`packages/flow-state/src/react/use-view.ts:13-46`; the current public `useResource` export is
at `packages/flow-state/src/react-entry.ts:5-7`.

### HOST-011 — Observer equality is fixed and revision-safe

Machine observers MUST first compare with `Object.is`, then shallowly reuse equal immutable
arrays and acyclic plain records. Class instances, functions, cyclic structures, and other
opaque values MUST remain identity-compared. Neither views nor hooks may configure equality.

A selector exception MUST be memoized for that actor revision and rethrown to the nearest
React error boundary. Re-reading one revision MUST NOT rerun a failing selector indefinitely
or return inconsistent values. This resolves Q6
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:551-556`).

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

Boot MUST be decoded, version-checked, app-checked, normalized, and installed before any root
activity starts. Runtime MUST NOT expose mutable `hydrateBoot`. The v2 payload MUST contain
Flow and definition versions, app ID, application persistence version, actor identity and
kind, canonical ref inputs, one canonical resource store, referenced primitive identities,
and observed store revisions. Application code owns migration and validation of opaque domain
memory and payloads. These requirements resolve B3
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:95-121`).

### HOST-014 — SSR reads one immutable prepared snapshot

React's `getServerSnapshot` MUST read the runtime's fixed prepared or hydrated construction
snapshot. It MUST NOT read moving actor state, throw a resource Promise, or derive data from a
client-only subscription. Server preload MUST complete through root-machine events before
render begins. Client runtime construction with the same boot payload MUST produce the same
first view selection before subscriptions attach.

### HOST-015 — Request runtimes have one scoped helper

The server route MUST expose exactly:

```ts
await withRequestRuntime(
  { app, layer, boot? },
  async (runtime) => {
    await runtime.ready();
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
  },
);
```

The helper MUST construct one request-scoped runtime, await readiness before invoking the
handler, await the handler, and await disposal in every exit path. If the handler and disposal
both fail, it MUST preserve both causes. Server preload MUST send typed root-machine events
and observe the root; it MUST NOT call services directly and fabricate resource snapshots.
The current helper already preserves handler and cleanup failures but accepts only a raw Layer
(`packages/flow-state/src/runtime/request-runtime.ts:6-53`).

## Effect execution, dehydration, and disposal

### HOST-016 — Effect bridges retain runtime service and error truth

The runtime MUST expose `runPromise` and `runPromiseExit` over Effects whose requirements are
satisfied by the runtime Context. `runPromiseExit` MUST retain both the Effect error and Layer
acquisition error. These bridges MUST reuse the one ManagedRuntime and MUST NOT create an
unowned execution Scope.

### HOST-017 — Dehydration is revision-consistent

`runtime.dehydrate()` MUST return a Promise for one v2 boot payload. Each actor snapshot MUST
be internally atomic and record the resource-store revision it observed. The resource store
MUST be captured once. Actors MAY come from slightly different instants; hydration MUST
rematerialize their primitive projections from canonical store data and recorded refs. The
runtime MUST NOT claim globally linearizable multi-actor capture. This resolves B4
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:123-138`).

Pending and queued transactions MUST restore as `interrupt`, remove their optimistic
overlays, record restoration evidence, and fire no settlement route. In-flight resource work
MUST not be serialized; reconstructed activities decide whether to start a new generation.

### HOST-018 — Disposal is idempotent, complete, and observable

`runtime.dispose()` MUST stop admission, fail buffered mailbox acknowledgments, interrupt
owned activities, await every finalizer, classify complete cleanup Causes, publish one
terminal disposed actor snapshot, complete actor snapshot streams, and settle exactly once.
Flow cleanup MUST continue non-abortably after a host stops waiting. A second dispose call
MUST return the first settlement.

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
mailbox command and produce identical actor snapshots and receipts. Story
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
