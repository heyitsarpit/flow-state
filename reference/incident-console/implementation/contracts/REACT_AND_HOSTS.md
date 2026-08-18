# React and host contract

Status: normative vNext contract

This contract defines actor identity and ownership, runtime bootstrap, synchronous commands,
React attachment and observation, SSR and request hosts, persistence, disposal, and non-React
host parity. The accepted revision authority is `reference/incident-console/implementation/revision-spec`;
its `REV-*` rules override conflicting clauses below, and its unresolved `BEH-*` entries do not
authorize an implementation choice.

## Deletion disposition

Automatic roots and dynamic actor categories are deleted by `DEL-003`. Child actor snapshots and
child host surfaces are deleted by `DEL-002`. The old actor ownership and lifecycle are replaced by
`DEL-004`. Registered views, old React ownership, and comparator surfaces are deleted or replaced
by `DEL-001`, `DEL-004`, `DEL-007`, and `DEL-008`. Conflicting server, persistence, inspection, and
CLI surfaces are governed by `DEL-010`. These entries own the exhaustive old-clause inventory and
no-residue requirements; this file records the surviving boundaries and their accepted replacements.

## Runtime and actor ownership

### HOST-001 — AppPlan bootstrap replaces automatic roots

`App.M` MUST be the complete machine-admission catalogue. Module-declared machines are named
tooling records; modules do not create automatic root actors, and app compilation creates no
actor instances. The app closes machine and operation reachability before runtime execution.

Initial runtime construction MUST install and validate boot actors first, then the production
runtime factory MUST complete every initial `ensureActor`, and then Flow MUST resolve every exact
context-provider ref. Missing providers, duplicate registrations, foreign machines, and instance
cycles MUST be rejected before activation, external operation, or public runtime or actor handle
escape. Live hosts and app Stories MUST cross this same production bootstrap barrier; a Story MUST
not use a testing-only registration or activation path. The runtime phase is `booting` during this
transaction; any failure closes admission and rolls back owners, dependency edges, actor registrations,
and queued acknowledgments in reverse acquisition order before entering `failed` (or `disposed` when
shutdown wins). No partial graph or lifecycle evidence survives rollback.

This replaces automatic-root construction, `dynamicMachines`, `RootActor`, root-addressable
machine lookup, and pre-seal handle exposure under `REV-COMP-006` through `REV-COMP-008` and
`REV-COMP-015`.

### HOST-002 — Exact refs separate shared lookup, durable creation, and local creation

Every actor backed by machine `M` MUST carry one exact `ActorRef<M>`, and every live actor handle
MUST expose `actor.ref`. A stable ref identifies a durable shared actor; a local actor receives a
generated opaque runtime-local ref that is not durable or restorable. Refs are identity only: they
contain no input, context bindings, callbacks, ownership, or disposal authority.

The runtime surface MUST be:

```ts
actorRef(machine, id);
runtime.ensureActor(ref, { input, contextBindings? });
runtime.getActor(ref);
runtime.createActor(machine, { input, contextBindings? });
```

`actorRef(machine, id)` MUST create an inert durable address without creating an actor. Stable
refs MUST be branded to their exact machine, not to one app, and the app identity qualifies their
persisted actor identity.

`runtime.ensureActor` MUST be the durable restore-or-create boundary for an explicit runtime owner
and MUST return an owner lease `{ actor, dispose }`. A boot-restored ref MUST resolve to that exact
actor without rerunning input initialization or replacing context bindings. Otherwise the runtime
MUST create the actor from the supplied fresh input and exact `contextBindings`. Concurrent ensures
for one identity MUST join one construction and return authority over that actor; they MUST NOT
create duplicate actors or independent lifetimes.

`runtime.getActor(ref)` MUST be lookup-only. It MUST reject a missing, foreign, mismatched, or
disposed ref and MUST NOT construct shared state or grant disposal authority. `useActorByRef(ref)`
has the same lookup-only rule. Opaque local refs are not valid shared lookup identities.

`runtime.createActor(machine, { input, contextBindings? })` MUST always create one fresh local
actor, MUST accept no stable ID, MUST assign an opaque runtime-local ref, and MUST return an owner
lease `{ actor, dispose }`. Passing only `lease.actor` MUST NOT transfer disposal authority.

Input MUST remain part of the definition's static actor shape. It MUST be supplied once when a fresh
actor is created, and the pure memory initializer MUST consume it exactly once to create initial
memory. Restoration MUST install persisted memory without replaying input or invoking the initializer.
Input MUST NOT classify an actor as local or shared; void-input and input-bearing machines MAY each
back any number of local or shared actors. These rules are `REV-COMP-009` and `REV-COMP-011`.

```ts
const PrimarySessionRef = actorRef(sessionMachine, "primary-session");
const shared = runtime.ensureActor(PrimarySessionRef, { input, contextBindings });
shared.actor.send(Session.E.SignOutRequested());
await shared.dispose();

const existingActor = runtime.getActor(PrimarySessionRef);

const local = runtime.createActor(editorMachine, { input, contextBindings });
local.actor.send(Editor.E.SaveRequested());
await local.dispose();
```

The old root/dynamic categories, ID-bearing local creation, overloaded root lookup, and
disposal-capable ordinary actor handle MUST NOT remain as aliases. These rules are
`REV-COMP-011` and `REV-COMP-012`.

### HOST-003 — Owner leases are the only individual disposal authority

`lease.dispose()` MUST be asynchronous, idempotent, and terminal for local and shared actors. Its
first successful call MUST close command admission, release the actor through the production
cleanup path, and make every escaped handle reject later commands with the stable disposed-actor
diagnostic. Concurrent and later calls MUST join or observe the same disposal completion and MUST
NOT execute cleanup twice.

Before disposal begins, the context-graph integrity rule MUST run. If any non-disposed consumers remain,
including suspended consumers, disposal MUST reject with their refs and binding paths, the actor MUST
remain in its current lifecycle, and the owner MAY retry after disposing or replacing those consumers.
Suspension detaches live subscriptions and work but retains the logical dependency edge, so provider
disposal cannot race React cleanup. Dropping a lease MUST NOT dispose its actor implicitly. Whole-runtime
disposal MUST subsume outstanding leases and tear down the context graph in reverse dependency order.

Successful disposal of a stable shared actor MUST leave a tombstone for that ref until the current
runtime is disposed. Both `getActor(ref)` and `ensureActor(ref, ...)` MUST reject with the same
stable disposed-ref diagnostic; `ensureActor` MUST NOT create a second incarnation or install new
context bindings under that identity. A new runtime MAY use the same durable ref under ordinary boot
rules. These rules are `REV-COMP-013` and `REV-COMP-014`.

## Commands and actor observation

### HOST-004 — Public send is synchronous and uses the production mailbox

The public actor command API remains:

```ts
actor.send(event): void;
```

`send` MUST synchronously admit the exact typed event to the actor's production mailbox or report
synchronous admission failure. It MUST NOT return a Promise, Effect, Fiber, snapshot, actor, or
acknowledgment handle, and it MUST NOT subscribe the caller. Equivalent domain commands through a
live host and a Story MUST use the same production mailbox and actor engine.

The Story layer MAY use a package-private acknowledgment on that same mailbox command. The
acknowledgment MUST complete after the ordinary event turn stabilizes and MUST NOT invoke transition
logic directly or drain unrelated ready work. The Story command surface and its explicit processing
boundary are defined by `REV-TEST-006`; no second execution path is permitted.

### HOST-005 — Actor handles expose exact identity and truthful snapshots

An ordinary actor handle MUST expose its exact `ref`, synchronous command access, and the public
actor snapshot used by host observation. Snapshots MUST retain the actor's coherent state, immutable
memory, inherited context, lifecycle, and issues for one actor publication; exact operation-state
projections remain subject to `BEH-023`. Actor state MUST remain in Flow's production runtime; React
MUST NOT store actor state, mailboxes, operation bindings, or cleanup ownership.

Lifecycle changes publish immutable snapshots but are not machine turns. The public `snapshot.revision`
is a per-actor publication revision and advances for every distinct snapshot, including lifecycle and
issue-only publications. A private machine-turn revision advances only for committed machine turns;
the runtime-global evidence sequence is a separate ordering field. Selectors, hydration, and
checkpoints use publication revision, while inspection may correlate all three.

Lifecycle evidence MUST remain on the ordered production evidence path. Its immutable payload contains
the published lifecycle snapshot, exact actor/app/plan and actor-incarnation provenance, `from`, `to`,
discriminated cause, timestamp, publication revision, machine-turn revision, and global evidence
sequence. It is delivered asynchronously through the same hub and release gates as TurnRecords;
bounded sink overflow truncates only that sink and never blocks publication.

A lifecycle transition MUST publish one coherent immutable snapshot through the existing handle
before appending its inspection event. Inspection MUST retain `actor:start`, `actor:restore`, and
`actor:dispose`, add `actor:suspend` and `actor:resume`, and MUST NOT add `actor:prepare`.
`actor:start` records first activation, `actor:suspend` records `active -> suspended`,
`actor:resume` records `suspended -> active`, and `actor:dispose` records a terminal transition
from any non-disposed lifecycle. `actor:restore` remains a separate boot-installation fact and
precedes `actor:start`. Each event MUST carry exact actor metadata, `from`, `to`, and a
discriminated `cause`; first activation distinguishes fresh creation, boot restoration, and
attachment commit, while disposal distinguishes owner disposal from whole-runtime disposal.
Lifecycle evidence MUST NOT create a machine-turn revision or `TurnRecord`; runtime disposal drains
accepted lifecycle and TurnRecord evidence without manufacturing a terminal `TurnRecord`.

### HOST-006 — Runtime factories cross bootstrap before host escape

Live hosts MUST use the production runtime factory and cross the `REV-COMP-015` bootstrap barrier.
The private runtime phase is `constructed | booting | ready | failed | disposed`: booting validates
boot data, acquires the Layer, completes initial ensures, and seals the graph; ready admits ordinary
work; failed closes admission after reverse-order rollback; and disposed is terminal. The runtime
does not expose this phase union or add a readiness API. Any retained `runtime.ready()` surface
observes the existing readiness boundary, with automatic-root assumptions removed.

After bootstrap, `ensureActor` and `createActor` use one linearized admission transaction. It validates
exact app/plan provenance, ref and machine identity, input, bindings, provider graph, tombstones, and
instance cycles, then installs the silent baseline and logical edges before activation and lease escape.
Concurrent ensures join one actor lifetime. A failed admission rolls back staged work, edges, mailbox,
registration, and prepared state in reverse order; no partial handle, snapshot, generation, StoreState
mutation, or lifecycle evidence escapes.

## React

### HOST-007 — FlowProvider accepts only an already-created runtime

The public Provider shape MUST remain:

```tsx
<FlowProvider runtime={runtime}>
  <App />
</FlowProvider>
```

`FlowProvider` MUST NOT accept an app, Layer, boot payload, factory callback, actor ID, or startup
policy. It MUST NOT assemble services, create actors, hydrate mutable state, or own runtime
disposal. Browser runtimes MUST be constructed once outside React bootstrap; request and Story
runtimes MUST remain scope-owned.

The existing private Provider readiness adapter MAY remain as a package-private React integration,
but it MUST NOT create or acquire a runtime, create actors, expose a generic loading value, or own
runtime disposal. Provider MUST NOT host a React-owned actor engine. This retains the accepted
Provider boundary in `REV-HOST-001` and `REV-HOST-006`; the deleted surfaces remain governed by
`DEL-008`.

### HOST-008 — `useActor` prepares one fresh local actor and attaches that actor

The local hook shape MUST be:

```ts
useActor(machine, options?);
```

`useActor` MUST create one fresh local actor in the current Provider runtime, including for a
void-input machine. Its options MUST supply exact fresh input when required and exact
`contextBindings` when the definition declares inherited context; bindings MAY be omitted when
the definition declares none. It MUST NOT accept a stable actor ID. Repeating the hook in different
component incarnations MUST create independent actors, while the actor remains stable for one
component incarnation and ordinary rerenders.

During render, `useActor` MUST create one package-private prepared actor with its final opaque ref,
pure initial snapshot, stable public handle, and real command-buffering mailbox. Preparation MAY carry
a passive provisional context cut with exact provider refs and provider publication revisions, but it
MUST NOT create a runtime registry entry, logical dependency edge, execution scope, subscription fanout,
external work, or inspection evidence.

Commit MUST atomically attach that same actor, validate and install its context baseline, activate
it, and drain buffered commands exactly once. Attachment rechecks provider identity and revision and
uses the current provider snapshots if the provisional cut is stale. A machine, runtime, input, or
context-binding identity change during one component incarnation fails with a keyed-remount diagnostic;
it never replaces the prepared actor or reuses its memory. Prepared buffering is bounded to 64 commands;
overflow rejects synchronously without mutation. Abandoned concurrent and server renders MUST leave no
runtime registration, subscription, timer, activity, operation attempt, lifecycle evidence,
external work, or terminal-disposal obligation. Imperative `runtime.createActor` remains the
immediately attached path for non-React owners. These rules are `REV-HOST-001` and `REV-HOST-002`.

The prepared actor remains inert until attachment; React owns only its attachment lease. Cleanup
suspends that same actor and never terminally disposes it. A retained suspended local actor keeps its
logical context edges and is excluded from provider disposal only by explicit owner/runtime cleanup,
not by React cleanup ordering.

### HOST-009 — React owns attachment lifetime through the production lifecycle

The production lifecycle is the closed union:

```ts
prepared | active | suspended | disposed;
```

Its transitions are `prepared -> active <-> suspended` with a terminal transition to `disposed`.
`prepared` means never attached, with no live runtime resources and command buffering enabled;
`active` means command admission and live resource ownership are enabled; `suspended` preserves
actor continuity while rejecting commands and owning no live attachment resources; `disposed` is
terminal and rejects later operations.

React Effect setup MUST activate a prepared actor or resume a suspended actor. Effect cleanup MUST
genuinely suspend the same actor. It MUST NOT suppress cleanup, introduce a grace period, predict a
later setup, or terminally dispose the actor. Strict Effects and Activity hide/reveal use this same
production lifecycle.

Suspension MUST close command admission immediately and release the active runtime registration,
observer fanout, context subscriptions, continuing-activity scopes, and installed timers. Commands
through an escaped suspended handle MUST fail with a stable actionable diagnostic and MUST NOT be
buffered. Buffering is permitted only while initially prepared.

Suspension MUST preserve the exact ref, public handle, state, immutable memory, last committed
inherited context, mailbox cursors, operation-occurrence records, and absolute timer deadlines.
Resume MUST reattach the same actor, reacquire continuing activities and subscriptions through
production kernels, reinstall timers against their existing absolute deadlines, and reconcile
context bindings against current provider snapshots. An elapsed deadline MUST be due on resume
rather than receive a fresh duration. Changed provider values MUST use the ordinary serialized
context-turn path; `Object.is`-equal values MUST remain silent.

Resume MUST NOT rerun input, memory initialization, initial-state construction, committed events,
finite actions, or `onContext` for the preserved baseline. Suspension and resume MUST NOT manufacture
a second operation attempt, machine-turn revision, or `TurnRecord`; a later real queued fact may do so
normally. Suspension is serialized with the actor mailbox: commands admitted before the close point
retain FIFO order, later commands reject, and suspended commands are never buffered. Queued finite
occurrences settle without starting adapters, unsettled finite work receives the production interruption
request, continuing streams close without a mapped domain outcome, timers retain absolute deadlines,
and pending outcomes and occurrence cursors remain. If an adapter ignores interruption, Flow retains
only the minimum fact needed for truthful settlement and never claims reversal of an irreversible effect.
Resume waits for finalizers, then reconciles continuing declarations and due timers without replaying
finite work. A cleanup defect leaves the actor suspended and blocks resume until owner or runtime
disposal.

Snapshots remain readable in every lifecycle; prepared commands buffer up to 64, active commands admit,
and suspended or disposed commands reject without buffering. Prepared subscriptions replay and become
live on activation; suspended subscriptions replay once and complete; disposed subscriptions replay the
terminal snapshot and complete. `can(event)` remains pure transition legality, separate from command
admission.
These rules are `REV-HOST-003`, `REV-HOST-004`, and `REV-HOST-005`.

### HOST-010 — `useActorByRef` is lookup-only

The shared lookup hook MUST be:

```ts
useActorByRef(ref);
```

It MUST synchronously resolve one already-registered shared actor from the Provider runtime and
return its stable command handle. It MUST NOT call `ensureActor`, construct an actor, acquire
ownership, or dispose an actor. Missing, foreign, disposed, opaque-local, and machine-mismatched
refs MUST fail with stable diagnostics. The hook is command-only and non-reactive.

### HOST-011 — `useView` is the sole ordinary React read path

The exact reactive hook shape MUST be:

```ts
useView(actor, selector);
```

It MUST accept one exact actor handle and MUST NOT accept a machine family or `ActorRef`. It MUST
neither create nor dispose actors nor change operation ownership or cache policy. Public
`flow.view`, view IDs, module view registration, view-bound `can` APIs, `useResource`, broad actor
subscriptions, per-actor React Context, binding components, and view-object hooks MUST be removed
under `DEL-001` and `DEL-008`.

A selector receives one atomic context for one actor revision containing `state`, immutable
`memory`, inherited readonly `context`, `lifecycle`, `issues`, bound `can(event)`, and snapshot-bound
passive `O`. Its selected `value` is required and retains exactly the declared value type. The
`O` catalogue MAY expose passive `key`, `getData`, and `getState` reads; selector evaluation MUST
NOT acquire, refresh, subscribe, commit, write, invalidate, clear, or otherwise mutate runtime
state.

`useView` MUST use the shared selector equality: scalar and non-record results use complete-value
`Object.is`, and named record results use fixed-key, field-by-field `Object.is`. `useShallow(selector)`
MAY remain an explicit React-only memoization adapter for named records, using that same field
comparison. `useView` MUST accept no comparator argument, and selector identity changes MUST NOT
replace the actor subscription.

```ts
const intentActor = useActor(newIntentMachine, {
  input: { draftId: "draft-1" },
});

const model = useView(intentActor, ({ state, memory, context, O, can }) => ({
  state,
  amount: memory.amount,
  themeMode: context.themeMode,
  balance:
    memory.account === null || memory.assetId === null
      ? undefined
      : O.assetBalance.getData([memory.account, memory.assetId]),
  canSubmit: can(NewIntent.E.SubmitRequested()),
}));

const sessionActor = useActorByRef(PrimarySessionRef);
const user = useView(sessionActor, ({ memory }) => memory.user);
```

During each selector evaluation, Flow tracks every exact descriptor/`K` read through passive `O.getData`
or `O.getState` and replaces the dependency set after evaluation. Actor publication or a matching canonical
StoreFanout revision reruns the selector against one tear-free actor/store boundary; the shared selector
equality suppresses an unchanged result. The dependency lease is installed and released internally with
the view lifetime, so callers do not manually subscribe for machine correctness. Projection-only reruns
publish a complete immutable actor snapshot and do not evaluate machine transitions. These rules are
`REV-HOST-006`, `REV-HOST-007`, and `REV-OPS-015`; selector defect memoization and recovery remain
unresolved under `BEH-014`.

## SSR, requests, and persistence

### HOST-012 — SSR preparation remains inert until attachment

SSR and concurrent render hosts MUST use the same prepared-actor rule as React: preparation may
create a pure snapshot, final opaque ref, stable handle, command buffer, and passive provisional context
cut with provider refs and publication revisions, but it MUST NOT acquire ownership, register an actor,
create a logical dependency edge, subscribe, start external work, or publish terminal lifecycle evidence.
The committed host MUST attach that same actor rather than replacing a render-time shell.

Attachment atomically rechecks provider identity and publication revisions, installs the current derived
context baseline before active publication, and then drains the bounded prepared mailbox. A stale
provisional cut is replaced by current provider truth; it is never persisted or emitted as lifecycle
evidence. Prepared command buffering is bounded to 64 entries and abandoned server renders remain inert.

### HOST-013 — Request hosts use production runtime construction

Request-scoped preload and render hosts MUST use the same production runtime factory and AppPlan
bootstrap as live hosts. Request runtimes MUST be isolated from browser and other request runtimes,
and a request host MUST dispose the runtime it owns through the production cleanup path. Request
helpers MUST NOT create automatic roots, install a testing-only actor engine, fabricate child or
final snapshots, or bypass typed machine events and production operation kernels.

The existing request helper's retained handler and cleanup-failure guarantees remain in force unless
an accepted revision changes them. Prepared SSR uses HOST-012's passive provisional context cut and
same-actor attachment; it does not acquire a second runtime or introduce a server-only lifecycle.

### HOST-014 — Boot is immutable constructor input and context-closed persistence

Boot MUST be decoded, version-checked, app-checked, normalized, and installed during production
runtime construction. Runtime MUST NOT expose mutable hydration or use an assertion-cast boot
payload. Restoration MUST install persisted actor memory and exact stable refs without replaying
input or invoking the fresh memory initializer.

Selected context values are derived runtime data and MUST NOT be serialized as duplicate consumer
state. Dehydration MUST begin only between completed context-propagation waves and MUST capture a
context-closed cut. Every included consumer MUST record exact `contextBindings` refs and the provider
revision observed for each binding; every referenced provider snapshot MUST be present at that exact
revision. A concurrent mismatch MUST fail the attempt with retryable `ConcurrentDehydrate`.

Hydration MUST restore the included context graph in dependency order, evaluate selectors from
restored provider snapshots, and install the derived projections as the consumer's silent baseline
before initial continuing-activity reconciliation or handle escape. It MUST NOT replay or
manufacture `onContext` events, and serialized selected values MUST NOT override provider truth.

Dehydration MUST fail terminally when an included durable consumer depends directly or transitively
on an opaque local provider. It MUST NOT serialize, promote, recreate, substitute, or rebind that
provider automatically. `FlowDehydrateError` MUST add the non-retryable kind
`NonDurableContextProvider`, carrying the durable consumer ID, opaque provider diagnostic ID, provider
machine ID, and every failing `contextBindings.<key>` path. Its message MUST identify those exact paths
and direct the host to declare `actorRef(providerMachine, id)`, create or restore that provider through
`runtime.ensureActor(ref, ...)`, and bind the stable ref; it MUST NOT suggest that `runtime.createActor`
accepts an ID. The other remedy is to dispose and replace the durable consumer without the dependency
before capture. This is `REV-COMP-005`.

The exact durable actor capture membership, treatment of suspended stable actors and runtime-local
tombstones, restored ownership, and transitive actor set remain unresolved under `BEH-004`. Stable
and opaque ref encoding details remain unresolved under `BEH-005`.

### HOST-015 — Effect bridges retain runtime service and error truth

The runtime MUST expose the retained Effect bridges over Effects whose requirements are satisfied by
the installed runtime Context. `runPromiseExit` MUST resolve an Exit that retains both Effect and
Layer/runtime failure truth, rather than hiding an acquisition failure in a second execution Scope.
The bridges MUST reuse the production runtime and MUST NOT create an unowned execution Scope.

## Disposal and proof obligations

### HOST-016 — Disposal is owner- and runtime-scoped

An ordinary actor handle and `ActorRef` MUST NOT expose individual disposal. A local or shared owner
lease is the only individual terminal-disposal authority; runtime shutdown subsumes outstanding
leases. React cleanup suspends the actor and does not terminally dispose it. A retained suspended
handle remains the same inert handle until an explicit owner or runtime action disposes it.

Runtime disposal MUST close admission and complete production cleanup for actors, activities,
operation ownership, context edges, and runtime resources, preserving the retained cleanup ordering
and Cause classification boundaries. Lifecycle transitions MUST publish coherent snapshots before
their inspection evidence, use a new publication revision without a machine-turn revision, and enter
the same globally sequenced asynchronous evidence hub as TurnRecords. Runtime disposal MUST accept and
drain the already linearized lifecycle and TurnRecord evidence before closing sinks and queues; it MUST
NOT manufacture a terminal `TurnRecord`. Suspended dependency edges remain retained, and suspension
normalization follows HOST-009 without changing public operation unions or Cause wire shape.

### HOST-P01 — Bootstrap and ownership proof

Proofs MUST cover closed `App.M` admission, unique durable machine IDs, stable and opaque exact refs, boot restoration, fresh
input initialization, exact context bindings, shared lookup, local creation, owner-lease transfer,
non-disposed-consumer disposal rejection, stable-ref tombstones, bootstrap graph sealing, reverse-order
rollback, runtime phases, and absence of
automatic roots and disposal on ordinary handles.

### HOST-P02 — React lifecycle proof

Proofs MUST cover final ref and handle identity across preparation and attachment, provisional context
recheck, construction-tuple keyed-remount rejection, prepared command delivery and the 64-command
bound, inert abandoned preparation, the exact `prepared | active | suspended | disposed` lifecycle,
Strict Mode reconnection, Activity hide/reveal, serialized suspension normalization, retained provider
edges, no active work after final unmount, and lookup-only `useActorByRef` behavior. Selector defects
remain their named unresolved boundary; passive operation-read reactivity MUST cover dependency
replacement, cross-actor StoreFanout, tear-free reads, and cleanup on suspension/disposal.

### HOST-P03 — Selector and host parity proof

Proofs MUST cover passive `useView(actor, selector)`, exact selected-value types, shared scalar and
named-record equality, optional `useShallow`, passive `O` reads, no comparator overload, no registered
views, and live/Story parity through the production actor, mailbox, operation, context, scheduler,
inspection, atomic-read, and cleanup paths. Reactive proofs MUST cover internal dependency tracking,
matching StoreFanout reruns, tear-free reads, and no work from passive selectors.

### HOST-P04 — SSR and persistence-host proof

Proofs MUST cover inert SSR preparation, same-actor attachment, provisional-context recheck,
request-host production construction, context-closed dehydration, provider-revision capture,
opaque-provider rejection, dependency-ordered hydration, and stable-ref tombstones. The proof MUST
show that prepared or restored actors use the production owner and that persistence never replays
context events or exposes selected context as a second source of truth.

### HOST-P05 — Disposal and evidence-drain proof

Proofs MUST cover owner-lease cleanup, runtime shutdown, ordered lifecycle evidence with asynchronous
payloads, admission closure, accepted-record drain, synthetic-terminal-`TurnRecord` absence, and
retained Effect error truth. Exact cleanup failure evidence remains a proof obligation of the existing
cleanup contract; disposal MUST NOT be declared complete while accepted evidence or owned finalizers
remain unprocessed.
