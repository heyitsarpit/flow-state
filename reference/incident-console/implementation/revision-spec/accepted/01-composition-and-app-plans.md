# Composition and app plans

This document owns accepted revisions for definition dependencies, modules, application plans, actor
admission, actor identity, and actor construction.

## Deletion disposition

The old automatic-root, dynamic-actor, ownership, and shared-selector surfaces changed by this chapter
are classified by `DEL-003`, `DEL-004`, and `DEL-007` in `REV-MIG-004`. Those entries own the complete old
clause inventory and no-residue requirements; the `Supersedes` fields below identify the local semantic
boundary only.

## Shared terms and call shapes

A **definition** owns an actor family's static typed shape. A **machine** owns that family's behavior.
An **actor** is one live instance of a machine, and an actor handle is its stable command surface. Every
actor handle exposes the instance's exact `actor.ref`, but the handle carries no individual-disposal
authority.

An `ActorRef<M>` is the machine-branded identity of one actor backed by machine `M`. A stable ref has an
authored durable ID and can identify a shared actor across runtime restarts. An opaque ref is generated
for a local actor, is meaningful only to its runtime, and is neither durable nor restorable. A ref is
inert: it carries no input, context bindings, construction policy, subscription, ownership, or disposal
authority.

An **owner lease** is the separate `{ actor, dispose }` result returned by an ownership operation. The
lease's `actor` may be passed freely; possession of the whole lease transfers the individual actor
disposal capability. These are the accepted construction and lookup call shapes:

```ts
const ref = actorRef(machine, id);
const sharedLease = runtime.ensureActor(ref, { input, contextBindings });
const sharedActor = runtime.getActor(ref);
const localLease = runtime.createActor(machine, { input, contextBindings });

const localActor = useActor(machine, options);
const registeredSharedActor = useActorByRef(ref);
```

`contextBindings` MAY be omitted when a definition declares no inherited context. Likewise, the input
option is required exactly when the definition's memory initializer requires input; omitting the
initializer argument fixes input to `void`.

An **application plan** (`AppPlan`) is the immutable executable universe compiled from every machine in
`App.M`, including each machine's complete operation graph and requirements. Compiling an app plan
admits machine families but creates no actor instances. A **context-propagation wave** is the bounded,
ordered processing caused by one committed actor turn that changes a provider snapshot.

### Shared selector semantics

The following notation describes the selector contract used by definition context projections,
`onContext.select`, `onMemory.select`, and passive host selectors. It is a shared public shape, not a
requirement to export these aliases by these names:

```ts
type Selector<Input, Value> = (input: Input) => Value;

type SelectionOutput<Output> = Output | false | null;

type ChangedSelectionHandler<Value, Output> = (
  current: Value,
  previous: Value,
) => SelectionOutput<Output>;

type InitialSelectionHandler<Value, Output> = (
  current: Value,
  previous: Value | undefined,
) => SelectionOutput<Output>;
```

A selector MUST be synchronous, pure, and side-effect-free. Flow MUST evaluate it against one atomic,
immutable source snapshot. A selector result is one selected value. A named record is a non-null plain object
result other than an array, with a fixed set of named fields. When a selector returns a named record, Flow
MUST treat its keys as named dependencies: the key set MUST remain fixed and each field MUST be compared
with `Object.is`. Scalar and non-record results MUST be compared as a complete value with
`Object.is`. Flow MUST NOT implicitly widen a selected value with `null` or `undefined`; those values MAY
appear only when the selector's declared result type includes them.

Selection handlers MUST receive the current selected value and the previous selected value as positional
arguments. The `previous` argument MUST be `undefined` only for an initial invocation. A handler MUST
declare every source value that it reads as part of the selector result; reading an unselected source value
inside a handler MUST NOT create an implicit dependency.

Every long-lived selector registration MUST use these equality rules. An equal result MUST retain the last
selected value and produce no downstream work. Selector evaluation MUST NOT accept a per-registration
comparator. Implementations SHOULD use one internal selection evaluator for all these surfaces;
lifecycle-specific adapters MAY decide whether an initial result is installed silently, passed to a factory,
or returned to a host.

Multiple watched values MUST be returned as a named record:

```ts
onMemory.select(
  ({ memory }) => ({
    value: memory.orderInput,
    client: memory.client,
  }),
  (current, previous) =>
    current.value !== null && O.orderById.subscribe({ ...current.value, client: current.client }),
);
```

Arrays remain ordinary selected values and use complete-value `Object.is`. A selector that needs to watch
multiple array items MUST return a named record rather than relying on array positions.

The complete source remains available to the selector, but not implicitly to the handler. A handler that
needs the entire source MUST use direct `onMemory` or select the entire source deliberately, accepting that
every source change becomes a dependency.

`SelectionOutput<Output>` applies only to callbacks that map a selection to an event or continuing plan.
`false` and `null` both mean no output; they MUST NOT be confused with a selected `value` of `false` or
`null`. `undefined` is not a no-output sentinel for these callbacks. A host or machine callback MUST NOT
use a generic truthiness rule that turns valid selected values such as `0` or `""` into absence.

## REV-COMP-001 — Definitions declare inherited readonly context

**Change:** Add a definition-level reactive-context declaration and fix its meaning relative to memory
and input.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:17-45,154-156,1254-1256`.

**Supersedes:** Directly conflicting old uses of `context`; see `REV-MIG-004` for the affected old-clause
disposition.

**Rule:** A definition MAY declare a `context` record of readonly selectors over other actor
definitions. Each selector MUST have the shared `Selector<Input, Value>` shape and MAY select source
state, source memory, or a projection combining both. These definition selectors are pure projections
used to declare dependency edges; they are not long-lived change registrations. Each entry MUST create a
typed definition-level data-dependency edge, and the application plan MUST resolve that edge to one
concrete actor provider.

`context` MUST mean inherited readonly actor projections. Actor-local mutable domain data MUST remain
`memory`. Input MUST be supplied once to establish a fresh actor and its initial memory; context MAY
change throughout the actor lifetime. When a changing value identifies a different domain instance,
including a different document, account, tenant, or order, the host MUST replace or re-key the actor
rather than retain its memory across that identity change.

**Example:**

```ts
const Editor = definition({
  id: "Editor",
  states: ["EDITING", "READ_ONLY", "SIGNED_OUT"],
  events: {
    SessionEnded: null,
  },
  context: {
    sessionState: Session.select(({ state }) => state),
    themeMode: Theme.select(({ memory }) => memory.mode),
  },
  memory: () => ({
    draft: "",
  }),
});
```

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-002 — Context selection and propagation are atomic and ordered

**Change:** Add equality, batching, and propagation-wave semantics for reactive context.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:47-66,1257-1267`.

**Supersedes:** None.

**Rule:** On a provider publication, Flow MUST evaluate every context selector bound to that exact
provider ref against one provider snapshot using the shared selector semantics. Scalar and non-record
selected results MUST use complete-value `Object.is` equality. Named record results MUST use fixed-key,
field-by-field `Object.is` equality. Context selectors MUST NOT accept a custom comparator. A structured
non-record selector is unchanged only when it returns the same provider-owned reference. An unchanged
selected result MUST create no consumer revision or downstream context work.

When several selected results change, Flow MUST install all changed projections in one ordered,
atomic consumer context turn. That turn MUST publish one consumer revision, expose the latest context
to views and future machine callbacks, and reconcile continuing activities once. It MUST NOT publish
intermediate projection combinations, replay event handlers, manufacture a transition, update memory,
or admit finite actions by itself.

Each committed actor turn that changes a provider snapshot MUST start one bounded propagation wave.
Flow MUST mark the reachable context consumers pending and drain the sealed acyclic context graph in
dependency order. A consumer MUST participate at most once in that wave, after its dirty upstream
dependencies for the wave have settled, and MUST receive at most one combined context turn evaluated
from the latest provider snapshots. Publications caused by different actor turns MUST start different
waves and MUST NOT be coalesced merely because they occur close together. A wave ends when its marked
dirty set drains; it MUST NOT wait for global runtime quiescence.

**Proof obligations:** Shared selector proofs MUST cover the required selected-value type, explicit
nullable domains, an initial result with no previous value, changed results with the immediately preceding
selected value, complete-value `Object.is` suppression, named-record field suppression, fresh structured
results, selector purity, and rejection of per-registration comparators. Context proofs MUST additionally show one
current/previous selected-value pair per selected-value change, no intermediate projection combination, and
no context work for an equal result.

## REV-COMP-003 — Context bootstrap is silent and `onContext` emits ordinary events

**Change:** Add bootstrap ordering and the machine-level `onContext.select` mapping.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:68-108,1268-1279`.

**Supersedes:** None.

**Rule:** During bootstrap, Flow MUST evaluate and atomically install every consumer's initial context
projections after its exact providers have been installed or restored and before activation, initial
continuing-activity reconciliation, the first externally observable snapshot, or handle escape. This
installation MUST establish the actor's baseline context. Each `onContext` registration MUST record
its initial selected value from that baseline and MUST NOT emit an event merely because the baseline
was established.

A machine MAY register independent `onContext.select` mappings in its authoring callback before
returning the state configuration. `onContext` MUST be a machine-level registration; it MUST NOT be an
`activities` entry or state-node key. Each registration MUST own its selector and, after a later
selected-value change, MUST invoke its changed-selection handler with `(current, previous)`, where both
arguments are the selected current and previous values, including named selection records where selected;
`previous` MUST be defined. The handler MUST return one typed self-event, `false`, or `null`. The handler
MUST NOT be invoked for the silent initial baseline. `false` and `null` MUST emit no event.

An emitted event MUST enter the ordinary ordered mailbox. Its ordinary state handler MUST remain the
visible owner of transition legality, guards, memory updates, and finite actions. `onContext` MUST NOT
directly target a state, update memory, execute an action, or expose an actor ref. A consumer that only
reads current context in views, future guards, or continuing activities need not register
`onContext`.

**Example:**

```ts
const editorMachine = machine(Editor, ({ S, E, onContext }) => {
  onContext.select(
    ({ context }) => context.sessionState,
    (current) => current === Session.S.SIGNED_OUT && E.SessionEnded(),
  );

  return {
    default: S.EDITING,
    states: {
      EDITING: {
        on: {
          SessionEnded: S.SIGNED_OUT,
        },
      },
      READ_ONLY: {},
      SIGNED_OUT: {},
    },
  };
});
```

**Proof obligations:** Context-bootstrap proofs MUST show that the initial selected value is recorded
without invoking the handler or emitting an event, that a later change receives defined current and
immediately preceding selected values, and that returning `false` or `null` emits no event.

## REV-COMP-004 — Actor construction fixes exact context-provider bindings

**Change:** Add exact provider binding, graph validation, and provider-lifetime rules.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:110-129,1283-1292`.

**Supersedes:** None. Existing actor-construction clauses are replaced separately by REV-COMP-007 and
REV-COMP-011 through REV-COMP-015.

**Rule:** Actor construction MUST bind every declared context slot to one exact `ActorRef` through
`contextBindings`. A stable provider MAY be named before it exists; a local provider MUST contribute
its opaque `actor.ref` after creation. `contextBindings` MUST mirror authored context keys one-for-one.
Several keys MAY repeat the same ref, and a selector MAY return a structured projection; Flow MUST NOT
force projections from one provider into a grouped context shape. Refs MUST NOT become part of the
selected readonly context values.

The application plan and runtime MUST resolve every required provider, reject missing or ambiguous
providers, foreign refs, and context-dependency cycles, and preserve top-down reachability. Each
binding MUST remain fixed for the complete consumer lifetime. Changing a provider MUST require
replacement of the consumer actor; Flow MUST NOT rebind a running actor while retaining its memory or
context history.

A context edge MUST NOT create actor parentage, lifetime ownership, or a command channel. React,
tests, Stories, hosts, and non-React applications MUST use the same compiled context graph.

Individual actor disposal MUST be rejected before disposal begins while any active consumer remains
bound to that actor's ref. The diagnostic MUST identify every dependent actor ref and bound context
key. Rejected disposal MUST NOT retain stale projections or cascade disposal across context edges.
Whole-runtime disposal MUST tear the graph down in reverse dependency order, consumers before
providers. A terminal-looking machine state MUST NOT trigger this rule because it neither completes
nor disposes its actor.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-005 — Persistence captures a context-closed cut

**Change:** Add persistence and restoration rules for context graphs.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:131-152,1293-1302`.

**Supersedes:** Directly conflicting old actor-capture closure rules; see `REV-MIG-004` for the affected
old-clause disposition.

**Rule:** Selected context values are derived runtime data and MUST NOT be serialized as duplicate
consumer state. Dehydration MUST begin only between completed context-propagation waves and MUST
capture a context-closed cut. Every included consumer MUST record its exact `contextBindings` refs and
the provider revision observed for each binding; every referenced provider snapshot MUST be present at
that exact revision. A concurrent mismatch MUST fail the attempt with retryable
`ConcurrentDehydrate`. Unrelated actors MAY still represent different state-only instants; the
stronger closure applies only along context edges.

Hydration MUST restore the included context graph in dependency order, evaluate selectors from the
restored provider snapshots, and install the derived projections as the consumer's silent baseline
before initial continuing-activity reconciliation or handle escape. Hydration MUST NOT replay or
manufacture `onContext` events, and serialized selected values MUST NOT override provider truth.

Dehydration MUST fail terminally when an included durable consumer has a direct or transitive context
dependency on an opaque local provider. Flow MUST NOT serialize, promote, recreate, substitute, or
rebind that provider automatically. `FlowDehydrateError` MUST add the non-retryable kind
`NonDurableContextProvider`, carrying the durable consumer ID, opaque provider diagnostic ID, provider
machine ID, and every failing `contextBindings.<key>` path. Its message MUST identify those exact paths
and direct the host to declare `actorRef(providerMachine, id)`, create or restore that provider through
`runtime.ensureActor(ref, ...)`, and bind that stable ref at those paths. The message MUST NOT suggest
that `runtime.createActor` accepts an ID. The other valid host remedy is to dispose and replace the
durable consumer without the dependency before capture.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-006 — Modules preserve machine property names in `App.M`

**Change:** Replace anonymous module machine tuples and automatic roots with named machine records and
one flattened application catalogue.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:160-193,1189-1196`.

**Supersedes:** Directly conflicting anonymous module-machine and automatic-root grammar. Admission and
automatic-root conflicts are replaced separately by `REV-COMP-007`; see `REV-MIG-004` for the affected
old-clause disposition.

**Rule:** `module({ id, machines })` MUST accept `machines` as an exact keyed record and MUST preserve
each authored property name. `app({ id, persistenceVersion, modules })` MUST accept an ordered array of
unaliased modules and MUST flatten their machine records into one exact `App.M` catalogue. Compilation
MUST reject duplicate machine property names across modules so every `App.M.<name>` resolves to one
exact machine family.

An `App.M` property name MUST be an ergonomic catalogue and TypeScript inference key, not an actor
instance address. A machine's explicit `id` MUST remain its durable machine and artifact identity.

**Example:**

```ts
const CoreModule = module({
  id: "core",
  machines: {
    router: routerMachine,
    auth: authMachine,
  },
});

const TodoApp = app({
  id: "todo-app",
  persistenceVersion: "1",
  modules: [CoreModule, TodosModule],
});

TodoApp.M.router;
TodoApp.M.auth;
TodoApp.M.todos;
```

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-007 — `App.M` closes machine admission and `AppPlan`

**Change:** Replace root and dynamic-machine admission with one closed `App.M` universe.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:187-193,209-215,357-360,1191-1196`.

**Supersedes:** Directly conflicting automatic-root, `dynamicMachines`, `RootActor`, and
`runtime.actor(machine)` rules; see `REV-MIG-004` for the affected old-clause disposition.

**Rule:** `App.M` MUST be the complete machine-admission catalogue. Every local actor creation, shared
actor registration, and Story-local actor MUST use a machine listed in `App.M`. Each listed machine
MUST contribute its complete operation graph and requirements to the immutable `AppPlan`; declaring
an operation MUST make it part of that static universe without acquiring a resource, running a
transaction, or subscribing to a stream. A running runtime MUST NOT expand that executable universe.

App compilation MUST create zero actor instances. A listed module machine is reusable behavior and
MAY back any number of explicitly created actors; it MUST NOT become an automatic root. Flow MUST NOT
accept an app `dynamicMachines` property and MUST remove automatic-root identity, `RootActor`, and
`runtime.actor(machine)`. Exact shared actors MUST instead use the `ActorRef` and owner-lease model in
REV-COMP-011 through REV-COMP-014.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-008 — Module IDs are tooling identity only

**Change:** Clarify the complete scope and rename effect of module identity.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:195-215,1197-1201`; `contracts/CLI.md:12-20`.

**Supersedes:** Every old clause that uses module identity to imply an automatic root actor or runtime
owner. Existing CLI module slicing is retained.

**Rule:** Flow MUST retain `module({ id, machines })`. The module ID MUST be unique within its app and
MUST be exact tooling identity for CLI `--module` slicing, trace and inspection grouping,
behavior-artifact sections, and module-scoped diffs. Module array order MUST NOT qualify the module ID
or any runtime identity.

The behavior CLI MUST continue to accept `--module <id>` on `behavior render` and `behavior diff` so a
caller can render or compare the exact artifact section owned by that module ID. This option MUST NOT
make the module a runtime owner or actor address.

A module ID MUST NOT contribute to machine identity, `App.M` keys, actor refs, actor persistence keys,
context bindings, runtime identity, or operation identity. Renaming a module ID MUST be
artifact-breaking even when its machine record is unchanged; the new build MUST use a different
tooling group and artifact path and MUST NOT silently compare or alias it to the old module section.
The rename MUST remain runtime- and persistence-compatible because admitted machines, stable actor
refs, restored actor state, context bindings, and operation addresses do not contain the module ID.
Tooling that preserves history across the rename MUST perform an explicit artifact migration rather
than modify runtime data.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-009 — Definition input initializes fresh actor memory once

**Change:** Clarify the single input and memory inference path and remove input-based sharing and root
classification.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:224-236,1202-1208,1280-1282`.

**Supersedes:** Directly conflicting input-based actor classification; see `REV-MIG-004` for the affected
old-clause disposition.

**Rule:** Input MUST remain part of the definition's static actor shape. It MUST be supplied once when
a fresh actor is created, and the pure `memory: ({ input }) => Memory` initializer MUST consume it
exactly once to create initial memory. That initializer MUST be the single inference source for
`InputOf` and `MemoryOf`; omitting its argument MUST fix input to `void`. Machine behavior MUST NOT
receive the original input after initialization and MUST operate on memory, inherited context, state,
and events. Restoration MUST install persisted memory without replaying input or invoking the
initializer.

Input MUST NOT classify an actor as local or shared. Void-input and input-bearing machines MAY each
back any number of local or shared actors. `useActor(machine, options?)` MUST create a fresh local actor
and MUST require exact input only when its machine requires input. Before `useActorByRef(ref)` resolves
a shared actor, that actor's runtime owner MUST have supplied its input. Input MUST initialize each
fresh actor once and MUST NOT change on a running actor; new facts MUST arrive through events or
reactive context. Flow MUST NOT replace input with a separate typed-identity API in this revision.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-010 — Static shape, behavior, ownership, services, and fixtures remain separate

**Change:** Reject late behavior provision under an existing machine identity.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:243-247,1209-1210`.

**Supersedes:** None.

**Rule:** Flow MUST NOT add an XState-style `setup()` or `machine.provide()` layer.
`definition(...)` MUST own static actor shape and the reachable operation catalogue;
`machine(...)` MUST own behavior; the app MUST close ownership and reachability; the runtime Layer
MUST supply services; and Story fixtures MUST control test boundaries. A behavior variant MUST use a
distinct definition and durable machine identity rather than late provision under an existing
identity.

**Proof obligations:** No additional clause-specific proof was accepted.

## REV-COMP-011 — Every actor has one exact machine-branded `ActorRef`

**Change:** Replace root and dynamic actor categories with stable and opaque refs branded to one exact
machine.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:696-704,801-809,1334-1343`.

**Supersedes:** Directly conflicting root/dynamic actor identities and actor handles without exact refs;
see `REV-MIG-004` for the affected old-clause disposition.

**Rule:** Every actor backed by machine `M` MUST carry one exact `ActorRef<M>`, and every live actor
handle MUST expose it as `actor.ref`. A declared stable ref MUST identify a durable shared actor. Each
local actor MUST receive a generated opaque runtime-local ref that is not durable or restorable.
Several refs MAY address independent actors of the same machine.

Refs MUST be branded to their exact machine and MUST NOT be branded to one app. A runtime MUST accept
a ref only when its `App.M` contains that exact machine; any app admitting the machine MAY use the same
stable ref, and the runtime's app identity MUST qualify persisted actor identity. Durable shared
identity MUST require an authored stable ID. `actorRef(machine, id)` MUST create an inert durable
address without creating an actor. Two separately constructed refs with the same exact machine and
stable ID MUST denote the same logical actor identity within an app runtime.

An `ActorRef` MUST be identity only. A stable ref MUST contain the exact machine and authored stable ID
required for equality, persistence, and lookup; the accepted rules do not prescribe the internal
representation of a generated opaque ref. Neither ref kind MAY contain input, context bindings,
ownership, construction callbacks, or other creation policy. A ref MUST NOT grant ownership,
subscription, or disposal authority.

**Proof obligations:** Stable-identity proofs are specified by REV-COMP-014.

## REV-COMP-012 — Shared construction, lookup, and local creation have distinct authority

**Change:** Replace overloaded root/dynamic lookup and creation with `ensureActor`, `getActor`, and
ID-free local `createActor`.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:706-736,768-776,804-809,1338-1348`;
`packages/flow-state/src/core/api/runtime-types.ts:27-46,157-164`;
`packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:275-293`.

**Supersedes:** Directly conflicting actor construction, lookup, and ownership surfaces; see `REV-MIG-004`
for the affected old-clause disposition.

**Rule:** `runtime.ensureActor(ref, { input, contextBindings? })` MUST be the durable
restore-or-create boundary used by the production runtime factory or another explicit runtime owner.
It MUST return an owner lease `{ actor, dispose }`. If boot restored the ref, `lease.actor` MUST be
that exact actor, and Flow MUST NOT rerun the fresh memory initializer or replace its context bindings.
Otherwise, Flow MUST create the actor from the supplied fresh input and exact `contextBindings` refs.
Concurrent ensures for one identity MUST join one construction and return authority over that same
actor and idempotent disposal; they MUST NOT create duplicate actors or independent lifetimes.
`ensureActor` is an ownership operation, not a read.

`runtime.getActor(ref)` MUST be lookup-only and MUST return the ordinary actor handle without an owner
lease. It MUST reject a missing, foreign, mismatched, or disposed ref and MUST NOT construct shared
state or grant disposal authority. `useActorByRef(ref)` MUST likewise synchronously resolve the exact
registered shared actor, return its stable command handle, and remain lookup-only; missing, foreign,
disposed, opaque-local, or mismatched refs MUST fail with a stable diagnostic.

`runtime.createActor(machine, { input, contextBindings? })` MUST always create one fresh local actor,
MUST accept no stable ID, MUST assign an opaque runtime-local ref, and MUST return an owner lease
`{ actor, dispose }`. On both creation paths, `actor` MUST be the stable command handle that may be
passed independently, and `dispose` MUST be the creator's explicit lifetime capability. `dispose`
MUST be absent from the actor handle and ref. Transferring the lease MUST transfer ownership
authority; passing only `lease.actor` MUST NOT.

**Example:**

```ts
const shared = runtime.ensureActor(ref, { input, contextBindings });
shared.actor.send(Event());
await shared.dispose();

const existingActor = runtime.getActor(ref);

const local = runtime.createActor(machine, { input, contextBindings });
local.actor.send(Event());
await local.dispose();
```

**Proof obligations:** Contract migration MUST remove disposal from the ordinary actor handle, return
the separate owner lease from `runtime.createActor` and `runtime.ensureActor`, and prove that lookup,
refs, `useActor`, `useActorByRef`, and `useView` cannot recover the lease's authority. The current
implementation starts with `dispose` on the ordinary `FlowActor`, returns that same disposal-capable
handle from `FlowRuntime.createActor`, and installs the method on every actor; migration MUST change all
three owning surfaces rather than merely hide the method in one public type.

## REV-COMP-013 — Owner-lease disposal is explicit, idempotent, and terminal

**Change:** Add one explicit individual-actor disposal authority and define its interaction with the
context graph, Story ownership, and runtime shutdown.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:738-745,761-785`.

**Supersedes:** Directly conflicting disposal-capable actor handles and category-specific ownership
surfaces; see `REV-MIG-004` for the affected old-clause disposition.

**Rule:** `lease.dispose()` MUST be asynchronous, idempotent, and terminal for local and shared
actors. Its first successful call MUST close command admission, release the actor through the
production runtime cleanup path, and make every escaped handle reject later commands with the stable
disposed-actor diagnostic. Concurrent and later calls MUST join or observe the same disposal
completion and MUST NOT execute cleanup twice.

Before disposal begins, the context-graph integrity rule in REV-COMP-004 MUST run. If active consumers
remain, disposal MUST reject with their refs and binding paths, the actor MUST remain active, and the
owner MAY retry after disposing or replacing those consumers.

Dropping a lease MUST NOT dispose its actor implicitly. Runtime registration MUST keep the actor alive
until its owner calls `dispose` or the runtime shuts down; Flow MUST NOT use a garbage-collector
finalizer or timing heuristic for externally visible cleanup. Whole-runtime disposal MUST subsume all
outstanding leases and tear down the complete context graph in reverse dependency order. Calling
`lease.dispose` after runtime shutdown MUST idempotently observe the completed terminal cleanup.

Each Story `run()` that materializes a `story.actor` recipe MUST retain its creation lease, expose only
`lease.actor` to commands and checkpoints, and call `lease.dispose()` during run cleanup. An app-owned
shared actor resolved through `getActor` MUST remain owned by the production runtime factory's retained
lease and MUST NOT be disposed by the Story.

**Proof obligations:** Prove boot-restored and freshly ensured leases; single cleanup under concurrent
ensure or create lease disposal and runtime shutdown; rejection for a dependent consumer without
partial cleanup; terminal command rejection through escaped handles; and absence of a disposal method
on all non-owner actor surfaces.

## REV-COMP-014 — Shared disposal tombstones a ref for one runtime incarnation

**Change:** Add one-lifetime-per-runtime semantics for stable shared refs.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:747-759,787-792,1349-1351`.

**Supersedes:** Directly conflicting stable-identity recreation and ID-bearing local creation rules; see
`REV-MIG-004` for the affected old-clause disposition.

**Rule:** Successful disposal of a stable shared actor MUST leave a tombstone for that ref until the
current runtime is disposed. Both `getActor(ref)` and `ensureActor(ref, ...)` MUST reject with the same
stable disposed-ref diagnostic. `ensureActor` MUST NOT create a second incarnation, accept replacement
input, or install new context bindings under that identity. Another stable actor in that runtime MUST
use a different authored ID.

This one-lifetime rule MUST keep escaped handles, inspection paths, operation generations, persisted
cursors, and former context edges from silently resolving the same ref to a different actor lifetime.

The tombstone MUST be runtime-incarnation state, not permanent revocation of the durable ref. A new
runtime MAY use the same authored ref to restore its persisted actor or create a fresh initial
incarnation under ordinary boot rules. Tombstones MUST NOT be dehydrated as actor snapshots and MUST
NOT shadow a valid actor in a later runtime.

**Proof obligations:** Prove that disposal installs the tombstone only after all cleanup succeeds;
rejected disposal due to active consumers installs no tombstone; concurrent `ensureActor` cannot race
terminal disposal into a replacement actor; lookup and ensure both report the disposed ref after
successful cleanup; and a separately constructed runtime can restore or create the same durable ref
without observing the prior runtime's tombstone.

## REV-COMP-015 — Runtime bootstrap seals the exact actor graph before activation

**Change:** Replace automatic-root startup with one atomic graph bootstrap barrier.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:794-799,1352-1355`.

**Supersedes:** Directly conflicting automatic-root startup and pre-seal handle exposure; see
`REV-MIG-004` for the affected old-clause disposition.

**Rule:** Initial runtime construction MUST be one atomic bootstrap phase. The runtime MUST install and
validate boot actors first, then the production factory MUST complete every initial `ensureActor`, and
then Flow MUST resolve all exact context-provider refs and reject missing providers, duplicate
registrations, foreign machines, and instance cycles. Only after the graph is sealed MAY any actor
activate, external operation begin, or public runtime or actor handle escape. Live hosts and app
Stories MUST cross the same production barrier; Stories MUST NOT use a testing-only registration or
activation path.

**Proof obligations:** No additional clause-specific proof was accepted.
