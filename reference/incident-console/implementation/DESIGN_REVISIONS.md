# Flow State vNext design revisions

Status: normative revision overlay

This file tracks the remaining Flow State design and proof work plus the accepted composition,
machine-authoring, React-read, and operations baselines. An accepted decision in this file overrides
every conflicting clause in the existing implementation contracts. Contract clauses untouched by an
accepted decision remain normative. Open questions and proposals override nothing. Examples come
from the current design demo and show API pressure only; they are not normative API unless an
accepted decision explicitly adopts their surface.

We resolve one problem at a time. Accepted answers stay here until they are merged into the
contracts and proof matrix.

## 1. Composition and reactive context — accepted direction

Flow owns top-down actor-state propagation rather than relying on React Context or prop drilling.
A definition declares the readonly reactive context it requires from other actor definitions. Each
entry selects only the source state or memory data the consumer needs; either source state, source
memory, or a projection combining both is valid. The declaration creates a typed definition-level
data-dependency edge, while the app plan resolves that edge to concrete actor providers.

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

`context` has one meaning in Flow: inherited readonly actor projections. Actor-local mutable domain
data remains `memory`; this decision does not revive `context` as a synonym for local memory. Input
also remains distinct: input is supplied once to establish a fresh actor and its initial memory,
while context may change throughout that actor's lifetime. If a changing value identifies a new
document, account, tenant, order, or other domain instance, the host replaces or re-keys the actor
instead of preserving its memory across that change.

Each source publication evaluates every declared context selector bound to that exact provider ref
against one provider snapshot. `Object.is` is the sole selected-result equality; context selectors
accept no custom comparator or shallow-equality mode. A structured selector therefore remains stable
only when it returns a stable provider-owned reference. Authors who need independently compared
derived fields declare separate context slots, which may repeat the same provider ref and still batch
atomically as described below. If several selectors change, Flow batches all changed projections into
one ordered consumer context turn rather than publishing intermediate combinations. That turn
atomically installs the new readonly projections, publishes one consumer revision, makes the latest
context available to views and future machine callbacks, and reconciles continuing activities once.
It does not replay event handlers, manufacture a transition, update memory, or admit finite actions
by itself.

A committed actor turn that changes a provider snapshot starts one bounded context-propagation wave.
Flow marks the reachable context consumers pending and drains the sealed acyclic context graph in
dependency order. Each consumer participates at most once in that wave, after its dirty upstream
context dependencies for the wave have settled; it evaluates its bindings against the latest
provider snapshots and receives at most one combined ordered context turn. A publication caused by a
different actor turn starts a different wave and is never coalesced merely because it occurs nearby
in time. The wave ends when its marked dirty set drains; Flow does not wait for global runtime
quiescence.

Bootstrap evaluates and atomically installs every consumer's initial context projections after its
exact providers have been installed or restored and before activation, initial continuing-activity
reconciliation, the first externally observable snapshot, or handle escape. This installation
establishes the actor's baseline context. Each `onContext` registration records its initial selected
value from that baseline but emits no event merely because the baseline was established; only a
later selected-value change may enqueue its typed self-event.

A machine may register independent context-to-event mappings before returning its state
configuration. `onContext` is a machine-level authoring registration, not an `activities` entry and
not a state-node key. Each registration has its own selector and emits either one typed self-event
or `null` when that selected value changes:

```ts
const editorMachine = machine(Editor, ({ S, E, onContext }) => {
  onContext.select(
    ({ context }) => context.sessionState,
    ({ value, previous }) =>
      value !== previous && value === Session.S.SIGNED_OUT ? E.SessionEnded() : null,
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

The emitted event enters the ordinary ordered mailbox. Its state handler therefore remains the
visible owner of transition legality, guards, memory updates, and finite actions. `onContext`
cannot directly target a state, update memory, execute an action, or expose an actor reference;
allowing those capabilities would turn context into a hidden cross-actor coordination bus. A
consumer that only needs the latest context in views, future guards, or continuing activities does
not register `onContext` at all.

Actor construction binds every declared context slot to one exact `ActorRef`. A stable provider may
be named before it exists; a local provider contributes its opaque `actor.ref` after that provider is
created. `contextBindings` mirrors the authored context keys one-for-one; several keys may repeat the
same ref, and one selector may still return a structured projection. Flow does not force projections
from one provider into a grouped context shape. The app plan and runtime must resolve every required
provider, reject missing or ambiguous providers, reject foreign refs and context-dependency cycles,
and preserve top-down reachability. A binding is fixed for the consumer actor's complete lifetime.
Changing any provider requires replacing the consumer actor; Flow never rebinds a running actor while
preserving its memory or context history. A context edge does not create actor parentage, lifetime
ownership, or a command channel. React only renders runtime-owned actor truth; tests, stories, hosts,
and non-React applications use the same compiled context graph. Actor creation supplies these exact
provider refs under the `contextBindings` option; refs never become part of the selected readonly
context values.

Individual actor disposal is rejected before disposal begins while any active consumer remains bound
to that actor's ref. The diagnostic identifies every dependent actor ref and bound context key. Flow
does not retain stale projections or cascade disposal across context edges because those edges grant
no lifetime ownership. Whole-runtime disposal owns the complete graph and tears it down in reverse
dependency order, disposing consumers before their providers. A terminal-looking machine state does
not trigger this rule because it neither completes nor disposes its actor.

Selected context values are derived runtime data and are never serialized as duplicate consumer
state. Dehydration begins only between completed context-propagation waves and captures a
context-closed cut: every included consumer records its exact `contextBindings` refs and the provider
revision observed for each binding, and every referenced provider snapshot must be present at that
exact revision. A concurrent mismatch fails the attempt with retryable `ConcurrentDehydrate`.
Unrelated actors may still represent different state-only instants; the stronger closure applies
only along context edges.

Hydration restores the included context graph in dependency order, evaluates each selector from the
restored provider snapshots, and installs those derived projections as the consumer's silent
baseline before initial continuing-activity reconciliation or handle escape. It does not replay or
manufacture `onContext` events, and serialized selected values can never override provider truth.

Dehydration fails terminally when an included durable consumer has any direct or transitive context
dependency on an opaque local provider. Flow never serializes, promotes, recreates, substitutes, or
rebinds that provider automatically. `FlowDehydrateError` adds the non-retryable kind
`NonDurableContextProvider`, carrying the durable consumer ID, opaque provider diagnostic ID,
provider machine ID, and every failing `contextBindings.<key>` path. Its message identifies those
exact paths and directs the host to declare `actorRef(providerMachine, id)`, create or restore that
provider through `runtime.ensureActor(ref, ...)`, and supply the stable ref at those bindings. It must
not suggest that `runtime.createActor` accepts an ID. The other valid remedy is to dispose and replace
the durable consumer without that dependency before capture.

Decision: Accepted. Flow combines ordered actors with a constrained readonly reactive context
graph. Context changes may affect views, future decisions, and continuing activities directly, but
state-changing behavior still crosses the machine boundary as a typed event.

### Module and app machine names

Modules preserve authored machine property names instead of accepting anonymous machine tuples:

```ts
const CoreModule = module({
  id: "core",
  machines: {
    router: routerMachine,
    auth: authMachine,
  },
});
```

An app still accepts an ordered array of modules because it does not need another set of module
aliases. App construction flattens the module machine records into one exact `M` catalogue:

```ts
const TodoApp = app({
  id: "todo-app",
  persistenceVersion: "1",
  modules: [CoreModule, TodosModule],
});

TodoApp.M.router;
TodoApp.M.auth;
TodoApp.M.todos;
```

The app compiler rejects duplicate machine property names across modules because every
`App.M.<name>` access must resolve to one exact machine family. These property names are ergonomic
catalogue and TypeScript inference keys, not actor-instance addresses. `App.M` is also the complete
machine-admission catalogue: every local creation, shared registration, and Story-local actor must use
a machine listed there, each listed machine contributes its complete operation graph and requirements
to `AppPlan`, and a running runtime cannot expand that executable universe. The machine's explicit
`id` remains its durable machine and artifact identity.

Flow retains `module({ id, machines })`, and the module ID is exact tooling identity only. It owns CLI
`--module` slicing, trace and inspection grouping, behavior-artifact sections, and module-scoped diffs.
It never contributes to machine identity, `App.M` keys, actor refs, actor persistence keys, context
bindings, runtime identity, or operation identity. Module IDs must be unique within an app because two
equal tooling owners would make inspection and artifact attribution ambiguous; module array order does
not qualify the ID or any runtime identity.

Renaming a module ID is artifact-breaking even when its machine record is unchanged. The new build
uses a different tooling group and artifact path, so Flow does not silently compare it with, or alias
it to, the old module section. The rename is runtime- and persistence-compatible: admitted machines,
stable actor refs, restored actor state, context bindings, and operation addresses retain their
existing identities because none contains the module ID. Tooling that wants history across the rename
must perform an explicit artifact migration rather than changing runtime data.

This retains the existing CLI capability at
`reference/incident-console/implementation/contracts/CLI.md:12-20` while superseding every old clause
that uses module identity to imply an automatic root actor or runtime owner. Flow does not accept a
`dynamicMachines` app property in this revision. App compilation creates zero actor instances: a
module machine is reusable logic, not an automatic root, and may back any number of explicitly created
actors. Flow removes automatic-root identity, `RootActor`, and `runtime.actor(machine)`. Exact shared
actors are addressed by the accepted `ActorRef` and owner-lease model.

## 2. Machine authoring ergonomics — accepted

The authoring decision is closed. Flow removes primitive-access repetition first through the named
`O` catalogue and exact family methods defined in [`OPERATIONS_SPEC.md`](./OPERATIONS_SPEC.md).
Machine code no longer constructs resource refs, reads generic resource or transaction registries,
or routes ordinary operation work through a general `activity` kit.

Input remains part of the definition's static actor shape. It is supplied once when a fresh actor is
created, and the pure `memory: ({ input }) => Memory` initializer consumes it exactly once to create
that actor's initial memory. The initializer is the single inference source for `InputOf` and
`MemoryOf`; omitting its argument fixes input to `void`. Machine behavior never receives the original
input after initialization and instead operates on memory, inherited context, state, and events.
Restoration installs persisted memory without replaying input or invoking the initializer.

Input does not classify an actor as local or shared. A void-input machine may back any number of
local or shared actors, and an input-bearing machine may do the same. `useActor(machine, options?)`
creates a fresh local actor and requires exact input only when the machine requires it. A shared
actor receives its input from its runtime owner before `useActorByRef(ref)` may resolve it. Input
initializes each fresh actor exactly once and does not change on a running actor; new facts arrive
through events or reactive context. Flow does not replace input with a separate typed-identity API.

Flow removes the child-machine primitive and all child input, lifecycle, completion, snapshot, and
addressing surfaces. Recursive substates provide state hierarchy inside one actor; they share that
actor's memory, context, event protocol, mailbox, operations, and lifetime and do not create nested
actors.

Flow does not add an XState-style `setup()` or `machine.provide()` layer. `definition(...)` owns the
static actor shape and reachable operation catalogue, `machine(...)` owns behavior, the app closes
ownership and reachability, the runtime Layer supplies services, and Story fixtures control test
boundaries. A behavior variant requires a distinct definition and durable machine identity rather
than late provision under an existing identity.

Singleton, toggle, and debounce shorthand are not part of this revision. They would only abbreviate
state syntax, while debounce states and timers still express observable admission, replacement, and
ownership boundaries. Flow keeps those states explicit until repeated real examples justify a
separate syntax proposal.

Accepted compound-state baseline: extend the existing state list with recursive named groups. A
single-key object makes the parent-child relationship readable while remaining simple to parse:

```ts
states: [
  "INACTIVE",
  { ACTIVE: ["EDITING", "DEBOUNCING", "QUOTE_ACTIVE"] },
],
```

Every node receives one exact token from that definition, including
`S.ACTIVE.S.EDITING`. Transitions use those tokens directly; Flow performs no relative string
targeting, arbitrary child IDs, or runtime path lookup. Deeper groups use the same recursive shape.

`default` replaces `initial` at the machine root and is also declared on compound state nodes. A transition may
target an exact leaf or a compound token; entering a compound token follows its authored default
path. Each `default` must name one exact direct child. Entering a nested compound state therefore
resolves its default path one level at a time, with every compound node owning its own entry
decision. Every compound state must declare a `default`, even if nothing currently targets that
compound state directly, so every compound token remains independently enterable.

A handler authored on a compound node applies to its descendant states through a compiled exact
handler table. If an ancestor and descendant both declare the same event on one state path,
compilation rejects the ambiguity. Flow performs no runtime leaf-to-parent handler search, implicit
override, or parent fallback after failed descendant guards.

A snapshot exposes one exact active leaf token through `snapshot.state`. Exact identity remains
available through `snapshot.state === S.ACTIVE.S.EDITING`, while the recommended hierarchy check is
`snapshot.state.matches(S.ACTIVE)`. The leaf token's `matches(token)` returns true for itself and
each ancestor, and `snapshot.matches(token)` exposes the same convenience semantics. Flow does not
expose an XState-style nested state value.

An activity on a compound state starts when that compound becomes active and remains alive across
transitions among its descendants. Descendant activities follow their own state membership. Exiting
the compound stops its activity, so moving between sibling leaves does not restart parent-scoped
work.

Nested activities start from parent to child and stop from child to parent. A transition preserves
activities on the unchanged ancestor path and only stops and starts the branches that change. This
ordering guarantees nested lifetimes, but does not claim that an asynchronous parent activity has
finished initializing before a child activity starts; required acquired values belong in resources.

Events remain one machine-wide actor protocol. Leaf and compound states may handle those events in
their own `on` records, but substates do not create nested event identities or separate event
catalogs. The compiler expands compound handlers into the exact active-leaf handler table.

A timer on a compound state starts when that compound becomes active, remains scheduled across
transitions among its descendants, and is cancelled when the compound is exited. Descendant
transitions do not reset the elapsed duration of an unchanged compound timer.

A redirect on a compound state remains applicable while any descendant is active. Redirect
stabilization evaluates the compiled compound redirect whenever the candidate leaf is inside that
compound, including after descendant transitions and memory updates; it is not limited to turns
that target the compound token directly.

When several redirects exist on one active path, Flow evaluates nodes from the outermost active
compound down to the exact leaf and preserves authored redirect order within each node. Parent
invariants therefore gate descendant-specific redirects without forbidding the two from
coexisting.

Flow has no final-state node kind. A terminal-looking state is an ordinary leaf with no authored
transitions or owned work. Entering it does not complete the actor, emit parent completion, produce
final output, close subscriptions, or stop the mailbox; those XState completion semantics are out
of scope.

Flow retains explicit reentry so a transition can restart state-owned activities and timers even
when its resolved target does not otherwise change the active configuration. `reenter` names the
exact state token that forms the restart boundary, such as `reenter: S.ACTIVE` or
`reenter: S.ACTIVE.S.SUBMITTING`; it is not a boolean. Flow releases that active node and its
descendant path, then enters the transition target within that subtree. The compiler rejects a
boundary that is inactive, belongs to another definition, or does not contain the target. Without
`reenter`, unchanged nodes preserve their existing activation and owned work.

Every guard, redirect, timer, memory update, and activity selector receives that same exact active
leaf token as `state`. Exact `===` checks only the leaf; `state.matches(token)` is the recommended
way to check a compound or leaf state. Flow does not add a separate declaring-node callback field,
because the declaration site already identifies that node.

The recursive grammar is conceptually uniform at every level, but Flow accepts at most ten state
levels so runtime validation and TypeScript inference have one explicit bound. A top-level state is
depth one, its child is depth two, and so on. Documentation recommends extracting a separate machine
once nesting exceeds three levels; that is design guidance, not a lower compiler limit.

Accepted operations baseline: a definition declares one flat record of named resource,
transaction, and stream descriptors. The machine callback receives the same exact `O` catalogue,
plus actor-bound `onMemory`, `invalidate`, and `clear` capabilities:

```ts
const NewIntent = flow.definition({
  states: ["INACTIVE", { ACTIVE: ["EDITING", "SUBMITTING"] }],
  operations: {
    routeConfig,
    orderById,
    submitIntent,
    submissionProgress,
  },
});

flow.machine(NewIntent, ({ S, E, O, onMemory, invalidate, clear }) => ({
  // machine configuration
}));
```

The definition remains inert: listing an operation does not acquire a resource, run a transaction,
or subscribe to a stream. It does make the descriptor part of the machine's explicit static
universe, allowing AppPlan reachability and exact operation `A/E/R` to be derived without scanning
callbacks.

Resource lookup input `P` and cache identity `K` are separate types. Every authored `key(P)` returns
an ordered readonly tuple, and exact cache identity is descriptor ID plus canonical `K`. `P` retains
whatever executable values the operation needs, while equal projected keys assert equivalent
canonical results.

Canonical `K` is operation identity, not machine-state identity. Its recursively immutable values are
limited to `null`, booleans, strings, finite numbers, readonly arrays, and plain readonly records.
Flow sorts record keys in the canonical encoding and normalizes numeric `-0` to `0`. It rejects
`undefined`, non-finite numbers, bigint, symbols, functions, accessors, class instances, mutable or
cyclic structures, and branded secret values. Unbranded strings cannot be inspected for intent, so
authors must treat every key as observable in persistence, inspection, diagnostics, and artifacts and
must hash or replace secret material before key construction.

The canonical encoder enforces fixed cross-runtime compatibility limits: at most 16 nested levels,
256 total value nodes, and 8 KiB in the tagged canonical byte encoding. These are limits on one
operation key, never on machine states, actors, or cache-entry count. Key projection, validation,
canonicalization, and defensive freezing finish synchronously before binding ownership, actor or store
mutation, operation admission, or external work. Failure reports the exact `K[index]` or nested record
path and aborts the candidate turn. This closes the bounds question at
`reference/incident-console/implementation/OPERATIONS_SPEC.md:847-848`; changing the grammar or limits
later is an operation-identity compatibility change.

Each live executable binding retains its own complete immutable `P`, but one shared resource
generation pins exactly one `P`: the plan that first admits that generation supplies it. Later owners
with equal descriptor and `K` join the generation without replacing its input or starting duplicate
work. If several bindings become eligible in one serialized reconciliation, stable runtime
acquisition order selects the first; an explicit `refetch(P)` is itself the admitting plan and
therefore supplies its `P`.

Pinned input never hands off mid-generation. Releasing the binding that supplied it does not switch an
in-flight lookup to another client's `P`; generation execution owns that immutable value until the
generation settles or is cancelled under the separate cancellation rules. A future automatically
admitted generation uses the oldest remaining eligible binding, while a future explicit refetch uses
its caller's input. The generation releases its pinned `P` after settlement, but every live binding
continues retaining its own input for later work. A hydrated key-only entry remains passively readable
and starts no lookup until a live executable binding supplies `P`. Equal `K` remains the descriptor
author's assertion that every eligible `P` produces equivalent canonical results; Flow performs no
automatic client failover to test that assertion.

The resource cache is shared by all actors in one Flow runtime. Actors own subscriptions and
immutable projections into canonical entries rather than private caches, so invalidation and writes
fan out to every actor using the same descriptor and key while separate runtimes remain isolated.

Resource families expose `key`, passive `getData` and `getState` reads, finite `lookup` and
`refetch`, continuing `subscribe`, authoritative `setData`, and actor-owned `cancel`. Transactions
expose `key`, `getState`, `commit`, and `cancel`; streams expose `key`, `getState`, and `subscribe`.
There is no public `ref`, `byKey`, bound-entry object, or generic `resources.get` or
`transactions.get` registry.

Accepted event handlers admit finite operation plans through optional transition `actions`:

```ts
on: {
  SubmitRequested: {
    target: S.SUBMITTING,
    actions: ({ event, memory }) => [
      O.submitIntent.commit(buildSubmissionInput(event, memory)),
    ],
  },
}
```

`actions` returns one inert finite plan, a readonly list of plans, `null`, or an empty list, and it
is evaluated only for the winning transition. Omitting it means the transition performs no finite
operation. Continuing resource and stream declarations remain state `activities`, while
memory-derived continuing declarations use independently reconciled `onMemory` entries. This is an
intentional revision to the current API-004 grammar, which presently rejects transition `actions`.

The event macrostep has one exact ordering. Flow selects the winning transition and evaluates its
guard, `updateMemory`, and `actions` in that order; all three callbacks read the same immutable
pre-turn snapshot and accepted event, so `actions` never observes partially updated memory. Flow then
applies the selected target and memory update to a candidate actor projection, stabilizes redirects
against that candidate, and validates the complete finite-action batch. Finite plans belong to the
accepted event edge and remain admitted even when redirect stabilization leaves the transition's
initial target; redirects cannot retroactively cancel an accepted finite action.

Only a completely valid plan may commit. Flow stages actor changes and synchronous cache mutations,
commits them atomically, publishes the resulting actor and store revisions, and only then starts or
joins asynchronous external work. A guard decline evaluates neither update nor actions. A defect in
memory calculation, action planning, redirect stabilization, key materialization, target validation,
or batch validation aborts the whole turn before publication, cache mutation, operation admission, or
external work; no valid prefix survives. This supersedes the candidate-memory action proposal and
open ordering note at `reference/incident-console/implementation/OPERATIONS_SPEC.md:211-220` and must
be proved through mixed memory-update, redirect, cache-action, and asynchronous-start batches.

Actor-level `invalidate` and `clear` accept exact resource-and-key targets, tags, and admitted
families so one accepted action can update several cache entries atomically. They are not
resource-family methods because their useful scope is commonly cross-resource. The detailed API,
lifecycle tables, examples, and proof obligations live in
[`OPERATIONS_SPEC.md`](./OPERATIONS_SPEC.md).

Operation selection has two distinct equality boundaries. `onMemory.select(selector, factory)`
compares the selector's complete result with `Object.is` and accepts no custom comparator; an equal
result skips the factory, while a changed result reevaluates it. Flow then reconciles the returned
operation declarations by normalized runtime identity—declaration slot, operation kind, exact
descriptor, and canonical `K`—rather than by plan-object or executable-`P` reference. Rebuilding an
equal plan therefore does not restart work merely because the callback allocated a fresh wrapper.

This supersedes the shallow record-and-tuple comparison proposed at
`reference/incident-console/implementation/OPERATIONS_SPEC.md:148-150`. Authors select a stable
immutable value directly, split independently changing values into independent declarations, or use
the direct `onMemory` form and rely on operation-identity reconciliation. Proofs must distinguish
selector suppression from plan retention and reject custom comparators that could hide a required
reconciliation.

Runtime-sized collections of continuing operation plans are excluded from this revision. One
authored `activities` entry or `onMemory` declaration returns one continuing resource or stream plan
or `null`; a machine that owns a known finite set writes several independent entries, even when they
use the same descriptor. Flow adds no `subscribeMany`, `subscribeEach`, array-of-plans return, or
implicit array-to-many interpretation.

This boundary is intentional rather than a missing shorthand. Arbitrary membership requires its own
bounds, per-key outcomes, duplicate policy, persistence representation, and release evidence. A
genuinely dynamic collection is modeled for now as one aggregate resource or as separately owned
actors whose lifetimes are already explicit. A future collection proposal needs a concrete use case
and complete lifecycle contract before changing this rule. This accepts the deferral recommended at
`reference/incident-console/implementation/OPERATIONS.md:484-499` and resolves the open collection API
at `reference/incident-console/implementation/OPERATIONS_SPEC.md:850` without adding a surface.

Every successful authoritative `setData(K, valueOrUpdater)` fences and interrupts all older lookup
generations for that exact resource identity. The rule is invariant across machine actions,
transaction-success writes, authoritative stream mappings, and trusted host writes; there is no
coexistence option that permits an older request to overwrite newer authority. The write installs its
base, clears invalidation and current failure metadata, advances the entry revision and generation
fence, and publishes once. Existing continuing subscribers remain attached and observe the new base.

An updater returning `undefined` declines the write and changes no revision, fence, generation, or
owner. A fenced finite occurrence settles as superseded by authoritative write, with inspection
evidence but no mapped domain interruption, and every late success or failure from its old generation
is suppressed. A later explicit lookup or refetch may admit a newer generation normally. This accepts
the proposed fence at `reference/incident-console/implementation/OPERATIONS_SPEC.md:391-413` and
requires hostile-race proofs in which old success, failure, and finalization arrive after the write.

Actor cancellation is occurrence-owned. Explicit resource or transaction `cancel(K)` terminates only
the calling actor's matching finite occurrence, releases that ownership, records terminal
`interrupted` status with cause `cancelled`, and prevents any later result from reaching that
occurrence. Other actors and continuing subscriptions retain their independent ownership. Shared
external work continues unchanged while any owner remains; if the cancelled occurrence was the final
owner, Flow interrupts its controller and generation fencing suppresses late completion.

Planned cancellation, state release, and concurrency-policy supersession publish operation status and
inspection evidence but do not enqueue a mapped domain outcome. The accepted domain event that chose
the cancel or replacement already owns the machine transition. An unexpected external interruption
may use an explicitly authored interruption mapper. Transactions remain subject to the point-of-no-
return rule: cancelling local work cannot claim that signing, broadcast, or another irreversible
external effect was undone. These rules close the shared-owner ambiguity at
`reference/incident-console/implementation/OPERATIONS_SPEC.md:415-428` and must be proved for first,
middle, and final owner cancellation plus late completion.

Machine clearing is available only as `clear([...targets])` returned from an accepted transition's
finite `actions`. Each target is one exact `[O.resource, K]` pair, a declared nominal tag reachable
through the machine's admitted operations, or one admitted resource family. Planning resolves all
targets, validates their authority and canonical keys, expands and deduplicates matches in first-seen
order, and rejects the whole action batch before mutation if any target is invalid. A successful clear
atomically removes every matched canonical base, failure and freshness metadata, and optimistic
overlay, fences its generations, interrupts underlying work, and publishes one store revision.

Machines receive no zero-argument clear, wildcard outside `AppPlan`, or whole-runtime cache-clear
capability. An active continuing subscription that survives the stabilized turn observes the missing
entry and may reacquire it, so logout-like transitions must release account-scoped activities and
clear their data in the same accepted macrostep. Complete clearing belongs only to
`runtime.dispose()`, which already owns reverse-order graph cleanup; Flow exposes no ordinary
`runtime.cache.clear()` escape hatch. This supersedes that proposed escape hatch at
`reference/incident-console/implementation/OPERATIONS_SPEC.md:458-483` and requires exact-entry, tag,
family, mixed-batch, unauthorized-target, active-subscription, and runtime-disposal proofs.

Stream `getState(K)` exposes only the actor-owned generation's lifecycle and terminal facts: idle,
connecting, running, complete, typed failure, defect, interruption, and their inspection identity. It
never contains or retains the latest emitted value. A stream emission becomes durable observable
domain state only when its declared outcome enqueues a machine event that commits memory, or when an
explicit authoritative stream mapping writes a resource. This keeps streams as continuing delivery
channels rather than an undeclared second cache.

Planned release stores no last value, hydration restarts an owned stream without reconstructing a
prior emission, and completion or failure cannot reveal an earlier value through `getState`. Views
that need the latest value select the owning actor's memory or an explicitly written resource. This
closes the value-retention question at
`reference/incident-console/implementation/OPERATIONS_SPEC.md:683-692`; proofs must show that emission,
replacement, release, completion, failure, dehydration, and hydration never manufacture hidden value
retention.

Decision: Accepted. Named operation families solve the primitive read and admission repetition.
Explicit singleton, toggle, and timer states remain the baseline rather than an unresolved API
choice; any future shorthand requires its own motivating examples and lifecycle contract.

## 3. React actors and focused reads — accepted

Flow retains `actor` as the public name for one live instance of reusable machine logic. A machine
may back any number of actors; passing the same machine to `useActor` in several component
incarnations creates independent actors even when that machine has void input. Local actor creation,
shared actor lookup, and reactive observation use three separate hooks:

```ts
useActor(machine, options?);
useActorByRef(ref);
useView(actor, selector);
```

`useActor(machine, options?)` obtains one fresh local actor in the current `FlowProvider` runtime.
The actor is stable for that component incarnation and is not recreated by an ordinary rerender.
The options contain exact fresh input when the machine requires it; input, an actor ID, or the
absence of input never changes the local-versus-shared meaning. React owns only the local actor's
component attachment lifetime. The Flow runtime owns its mailbox, memory, snapshots, operations,
inspection, and cleanup, so no actor state lives in React.

During React's render phase, `useActor` creates one package-private prepared actor rather than calling
the public `runtime.createActor`. The prepared actor already has its final opaque ref, pure initial
snapshot, stable public handle, and real mailbox, which buffers commands until attachment. It has no
runtime registry entry, execution scope, subscription fanout, or external work. Commit atomically
attaches that exact actor to the current runtime, validates and installs its context baseline,
activates it, and drains its buffered commands; the hook never swaps a hollow shell for a different
live handle. An abandoned render leaves only inert locally collectible state and no runtime-visible
actor or work. Imperative `runtime.createActor` remains the immediately attached and running path for
non-React owners.

React attachment uses the production actor lifecycle `prepared -> active <-> suspended`, with
`disposed` as a separate terminal state. Effect setup activates a prepared actor or resumes a
suspended actor. Effect cleanup genuinely suspends the same actor; it must not suppress cleanup,
defer it through a grace period, guess that a matching setup will follow, or terminally dispose the
actor. React intentionally uses the same setup-cleanup-setup sequence for development Strict Effects
that it uses when an Activity hides and later reveals a subtree, and an Effect cleanup cannot tell
whether React will reconnect the retained hook state or discard it permanently.

The actor's public snapshot and the `lifecycle` value supplied to `useView` expose the exact closed
union `prepared | active | suspended | disposed`. These are observable capability states rather than
aliases: `prepared` has never attached and buffers commands, `active` admits commands and owns live
runtime resources, `suspended` preserves actor continuity but rejects commands and owns no live
attachment resources, and `disposed` is terminal and rejects every later operation. A prepared SSR
or concurrent-render snapshot and a suspended escaped handle therefore report their actual state
instead of being mislabeled as active.

Lifecycle changes must publish a coherent immutable snapshot through the same public handle, so a
retained subscriber can never combine one lifecycle value with another lifecycle's resource set. The
inspection vocabulary retains `actor:start`, `actor:restore`, and `actor:dispose` and adds
`actor:suspend` and `actor:resume`. There is no `actor:prepare`: a prepared actor is intentionally
absent from the runtime and an abandoned preparation produces no inspection evidence.

`actor:start` records the first `prepared -> active` transition, `actor:suspend` records `active ->
suspended`, `actor:resume` records `suspended -> active`, and `actor:dispose` records the terminal
transition from `prepared`, `active`, or `suspended`. Each lifecycle event carries the ordinary exact
actor inspection metadata plus `from`, `to`, and a discriminated `cause`; first activation
distinguishes fresh creation, boot restoration, and attachment commit, while disposal distinguishes
owner disposal from whole-runtime disposal. `actor:restore` remains the separate boot-installation
fact and precedes the corresponding `actor:start` event.

The runtime publishes the coherent new lifecycle snapshot before appending its lifecycle inspection
event, so an inspection listener can immediately read a handle that already reports the event's `to`
state. These events are runtime lifecycle evidence rather than machine facts: they create no machine
revision or `TurnRecord`. The old actor vocabulary at
`packages/flow-state/src/core/api/inspection-event-vocabulary.ts:1-9` must add suspend and resume while
preserving restore, subscription, and snapshot evidence. The old `active | disposed` snapshot contract at
`reference/incident-console/implementation/contracts/GLOSSARY_AND_IDENTITY.md:202-205` is explicitly
superseded. Proofs must cover the exact union in `getSnapshot`, `useView`, SSR preparation, Strict Mode
reconnection, Activity hiding, explicit disposal, command diagnostics for every non-active state, the
absence of preparation events, restore-before-start ordering, and snapshot-before-lifecycle-event
ordering.

Suspension closes command admission immediately and releases every attachment-owned live resource:
the active runtime registration, observer fanout, context subscriptions, continuing activity scopes,
and installed timers. A command sent through an escaped handle while suspended fails with a stable,
actionable suspended-actor diagnostic and is never buffered for a possible reconnect. Command
buffering is confined to the initial prepared state before first attachment. Once suspension cleanup
settles, a permanently discarded hook leaves no runtime work or registration behind; the actor is
collectible with the discarded hook state unless user code has retained its handle, in which case
that handle remains the same inert suspended handle and still cannot admit commands.

Suspension preserves the actor's logical identity and durable in-memory continuity: the exact opaque
ref and public handle, state, immutable memory, last committed inherited context, mailbox cursors,
operation-occurrence records, and absolute timer deadlines. Resume reattaches that exact actor,
reacquires its continuing activities and subscriptions through the normal production kernels,
reinstalls timers against their existing absolute deadlines, and reconciles every context binding
against the provider's current committed snapshot. A deadline that elapsed while suspended becomes
due on resume rather than receiving a fresh duration. A changed provider value enters through the
ordinary serialized context-turn path; an unchanged value remains silent under `Object.is`.

Resume is not actor creation or replay. It does not rerun input, memory initializers, initial-state
construction, already committed events, finite actions, or `onContext` for the preserved baseline.
Operation occurrences remain ordinary runtime-owned facts: suspension interrupts attachment-owned
execution through the operation kernel's existing cancellation and recovery rules, and React
reconnection does not invent a second committed attempt. Activation, suspension, and resumption may
emit lifecycle inspection evidence, but none creates a machine revision or `TurnRecord` unless a real
queued runtime fact subsequently commits.

Terminal disposal remains an explicit production-runtime or owner action because React supplies no
terminal-unmount signal. The React adapter therefore delegates prepare, activate, suspend, and resume
to package-private production runtime capabilities and contains no second actor engine or React-only
snapshot restoration algorithm. App and machine Stories use that same actor engine, scheduler,
context propagation, operation kernels, and turn semantics; they do not gain synthetic React
suspend/resume commands. Host conformance tests may exercise the lifecycle capability directly, while
Story timelines contain only domain commands and real runtime facts.

This lifecycle replaces the current shell-and-swap implementation. In
`packages/flow-state/src/react/use-actor.ts:20-55`, `createActorShell` returns a public-looking object
whose `send`, `flush`, `dispose`, and `subscribe` methods are no-ops. In the same file at
`packages/flow-state/src/react/use-actor.ts:86-130`, render exposes that shell, while
`packages/flow-state/src/react/use-actor.ts:134-203` asynchronously attaches and swaps in a different
live actor. The current proof at `packages/flow-state/src/react/use-actor.test.ts:58-125` establishes
only that public actor creation does not happen during render and that a live actor eventually
appears; it does not prove stable handle identity, prepared command delivery, Strict Mode cleanup,
Activity reconnection, or suspension resource cleanup.

The precedent is behavioral rather than an API dependency. XState creates one idle actor in retained
hook state at `docs/codebases/xstate/packages/xstate-react/src/useActorRef.ts:18-32`, then starts it in
an Effect and invokes reconnect-aware cleanup at
`docs/codebases/xstate/packages/xstate-react/src/useActorRef.ts:87-93`. Its
`docs/codebases/xstate/packages/xstate-react/src/stopRootWithRehydration.ts:16-38` preserves the actor
tree and system snapshots, stops the root, and restores the same references and processing state; its
own comment names Strict Effects and Offscreen/Activity as the reason. Flow adopts the observable
guarantee but implements it inside Flow's production runtime instead of copying XState's private
field mutation. React's own contracts likewise require an extra setup-cleanup cycle under Strict
Mode and define hidden Activity trees as cleaning up Effects while preserving state:
<https://react.dev/reference/react/StrictMode>,
<https://react.dev/learn/synchronizing-with-effects>, and
<https://react.dev/reference/react/Activity>.

Contract migration must add proofs for all of the following:

- An abandoned concurrent or server render creates no runtime registration, subscription, timer,
  activity, operation attempt, inspection lifecycle event, or terminal-disposal obligation.
- A retained actor keeps the exact same ref and handle across `prepare -> activate -> suspend ->
resume`; commands buffered before first attachment drain once, while commands attempted during
  suspension reject and never appear after resume.
- React Strict Mode's setup-cleanup-setup sequence and React Activity's potentially long
  hide-reveal sequence each perform real balanced resource cleanup and reacquisition without rerunning
  actor initialization, committed turns, finite actions, or an unchanged `onContext` baseline.
- Timers retain absolute deadlines, continuing activities and subscriptions have no overlapping live
  generations, and context changes accumulated while suspended reconcile once through the ordinary
  serialized context wave after resume.
- Final unmount may leave a suspended handle retained by user code, but the runtime reports no active
  registration or work for it; explicit runtime disposal remains terminal and rejects later resume.
- Equivalent live-host and Story domain commands still produce the same snapshots, operation facts,
  context turns, and `TurnRecord`s because React lifecycle evidence is outside the machine timeline
  and no Story-only lifecycle engine exists.

`ActorRef<M>` is the exact typed address carried by every actor backed by machine `M`. A declared
stable ref identifies a durable shared actor, while each local actor receives an opaque runtime-local
ref that is neither durable nor restorable. Several refs may address independent actors of the same
machine. Refs are branded to their exact machine rather than one app. A runtime accepts a ref only
when its `App.M` contains that exact machine; any app admitting the machine may use the same stable
ref, and the runtime's app identity qualifies its persisted actor identity. Durable shared identity
requires an authored stable ID. `actorRef(machine, id)` creates that inert durable address without an
actor. Two separately constructed refs for the same exact machine and stable ID denote the same
logical actor identity within an app runtime.

Shared construction and lookup remain separate because input and context sources belong to a named
construction owner rather than to identity or an arbitrary first reader:

```ts
const shared = runtime.ensureActor(ref, { input, contextBindings? });
shared.actor.send(Event());
await shared.dispose();

const existingActor = runtime.getActor(ref);

const local = runtime.createActor(machine, { input, contextBindings? });
local.actor.send(Event());
await local.dispose();
```

`ensureActor` is the durable restore-or-create boundary used by the production runtime factory or
another explicit runtime owner. It returns an owner lease containing `{ actor, dispose }`. If boot
already restored the ref, `lease.actor` is that exact actor and Flow neither reruns the fresh memory
initializer nor replaces its source bindings. Otherwise Flow creates the actor from the supplied fresh
input and exact `contextBindings` refs. Concurrent ensures for one identity join one construction and
return authority over that same actor and idempotent disposal; they never produce duplicate actors or
independent lifetimes. Calling `ensureActor` is therefore an ownership operation, not a read.

`getActor` is lookup-only and returns the ordinary actor handle without an owner lease. It rejects a
missing, foreign, mismatched, or disposed ref; Story execution and React reads therefore cannot hide a
missing production registration by constructing shared state or gain disposal authority from an
identity. `createActor` always creates one fresh local actor, accepts no stable ID, assigns an opaque
runtime-local ref, and likewise returns an owner lease containing `{ actor, dispose }`. For both
creation paths, `actor` is the stable command handle that may be passed freely, while `dispose` is the
creator's explicit lifetime capability and is absent from the actor handle and its ref. Transferring
the lease transfers ownership authority; passing only `lease.actor` does not.

`lease.dispose()` is asynchronous, idempotent, and terminal for both local and shared actors. The
first successful call closes command admission, releases the actor through the production runtime's
ordinary cleanup path, and makes every
escaped handle reject later commands with the stable disposed-actor diagnostic. Concurrent and later
calls join or observe the same disposal completion rather than executing cleanup twice. The existing
context-graph integrity rule runs before disposal begins: if active consumers still depend on the
actor, disposal rejects with their refs and binding paths, the actor remains active, and the
owner may retry after disposing or replacing those consumers.

Successful disposal of a stable shared actor leaves a tombstone for that ref until the current runtime
is itself disposed. Both `getActor(ref)` and `ensureActor(ref, ...)` reject with the same stable
disposed-ref diagnostic; `ensureActor` cannot create a second incarnation, accept replacement input,
or install new context bindings under that identity. This keeps one stable ref mapped to at most one
actor lifetime per runtime, so escaped handles, inspection paths, operation generations, persisted
cursors, and former context edges cannot silently change which actor their identity denotes. Creating
another stable actor in that runtime requires a different authored ID.

The tombstone is runtime-incarnation state, not a permanent revocation of the durable ref. A newly
constructed runtime may use the same authored ref to restore its persisted actor or create its fresh
initial incarnation according to the ordinary boot rules. Tombstones are not dehydrated as actor
snapshots and cannot shadow a valid actor in a later runtime; durability spans runtime restarts, while
terminal disposal closes only the actor lifetime inside the runtime where it occurred.

Dropping an owner lease does not implicitly dispose its actor. The active runtime registration keeps
the actor alive until its owner calls `dispose` or the whole runtime shuts down; Flow uses no garbage
collector finalizer or timing heuristic for externally visible cleanup. Whole-runtime disposal
subsumes every outstanding owner lease and still tears down the complete context graph in reverse
dependency order. Calling a lease's `dispose` after runtime shutdown is an idempotent observation of
the already completed terminal cleanup.

This changes the current public ownership shape. `FlowActor` presently exposes `dispose` directly at
`packages/flow-state/src/core/api/runtime-types.ts:27-46`, so any code holding an ordinary actor alias
can destroy it. `FlowRuntime.createActor` presently returns that same disposal-capable handle at
`packages/flow-state/src/core/api/runtime-types.ts:157-164`, and the implementation installs the
method on every actor at
`packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:275-293`. Contract migration
must remove disposal from the ordinary actor handle, return the separate owner lease from
`runtime.createActor` and `runtime.ensureActor`, and prove that lookup, refs, `useActor`,
`useActorByRef`, and `useView` cannot recover the lease's authority.

Story-local ownership follows this same path. Each `run()` retains the lease returned while
materializing a `story.actor` recipe, exposes only `lease.actor` to command execution and checkpoints,
and calls `lease.dispose()` during run cleanup. App-owned shared actors resolved through `getActor`
remain owned through the lease retained by the production runtime factory and are never disposed by
the Story. Proofs must cover boot-restored and freshly ensured leases, single cleanup under concurrent
ensure or create lease disposal and runtime shutdown, dependent-consumer rejection without partial
cleanup, terminal command rejection through escaped handles, and the absence of a disposal method on
all non-owner actor surfaces.

Proofs for stable identity must additionally show that disposal installs the tombstone only after all
cleanup succeeds, that rejected disposal due to active consumers installs no tombstone, that
concurrent `ensureActor` cannot race terminal disposal into a replacement actor, that both lookup and
ensure report the disposed ref after successful cleanup, and that a separately constructed runtime
can legitimately restore or create the same durable ref without observing the prior runtime's
tombstone.

Initial runtime construction is one atomic bootstrap phase. The runtime installs and validates boot
actors first, then the production factory completes every initial `ensureActor`, then Flow resolves
all exact source refs and rejects missing providers, duplicate registrations, foreign machines, and
instance cycles. Only after that graph is sealed may any actor activate, external operation begin, or
public runtime or actor handle escape. Live hosts and app Stories cross this same production barrier;
Stories have no testing-only registration or activation path.

An `ActorRef` is identity only. It contains the exact machine and stable ID needed for equality,
persistence, and lookup, but never contains input, context sources, ownership, construction
callbacks, or other actor creation policy.
`useActorByRef(ref)` synchronously resolves an exact shared actor from the current runtime and returns
its stable command handle. Missing, foreign, disposed, opaque-local, or mismatched refs fail with a
stable diagnostic. It is lookup-only and never calls `ensureActor`. Every live actor handle exposes
its exact `actor.ref`; stable shared actors expose their declared durable identity, while local actors
expose their generated opaque identity. A ref grants no ownership, subscription, or disposal
authority.

`useView(actor, selector)` is the sole ordinary React subscription path. It accepts one exact actor
handle, never a machine family or `ActorRef`; callers resolve a shared ref with `useActorByRef`
before observing it. The actor handle already carries its exact instance identity. `useView` neither
creates nor disposes an actor and cannot change operation ownership or cache policy.

Flow removes the public `flow.view` definition, view IDs, and module view registration. A view is
the reactive projection returned by `useView`, and a reusable view is an ordinary selector function.
The selector receives one exact atomic read context for that actor revision: current `state`,
immutable `memory`, inherited readonly `context`, actor `lifecycle`, current `issues`, a bound
`can(event)` capability check, and snapshot-bound read-only `O`. The `O` catalogue exposes passive
family reads such as `key`, `getData`, and `getState`; selector evaluation cannot acquire, refresh,
subscribe, commit, write, invalidate, clear, or otherwise change runtime state.

```ts
const intentActor = useActor(newIntentMachine, {
  input: { draftId: "draft-1" },
});

const model = useView(
  intentActor,
  useShallow(({ state, memory, context, O, can }) => ({
    state,
    amount: memory.amount,
    themeMode: context.themeMode,
    balance:
      memory.account === null || memory.assetId === null
        ? undefined
        : O.assetBalance.getData([memory.account, memory.assetId]),
    canSubmit: can(NewIntent.E.SubmitRequested()),
  })),
);

const sessionActor = useActorByRef(PrimarySessionRef);
const user = useView(sessionActor, ({ memory }) => memory.user);
```

`useView` compares ordinary selector results with `Object.is`. `useShallow(selector)` explicitly
memoizes a selected plain record or tuple by comparing its top-level members with `Object.is`, so
components can select several related values without a comparator argument or a registered view
object. Selector identity changes may cause reevaluation but must not replace the actor subscription.
Both `useActor` and `useActorByRef` are command-only and non-reactive; a component rerenders for actor
changes only through `useView`.

`FlowProvider` continues to receive only an already-created Flow runtime. Flow adds no per-actor
React Context, `MachineBindings`, ref provider, or prop-drilled state layer. Local and shared actor
state remains runtime-owned outside React; the hooks only create or resolve handles and subscribe to
one exact handle.

Decision: Accepted. Machines are reusable logic, actors are live instances, local actors are the
default `useActor` behavior, every actor carries an exact `ActorRef`, declared stable refs identify
durable shared actors, opaque refs identify runtime-local actors, `useActorByRef` performs shared
lookup, and `useView` is the only reactive read hook.

## 4. App and machine stories — accepted

Story scope is explicit at construction. `story` is a non-callable namespace with three public
constructors:

```ts
story.app(createTodoRuntime, options?);
story.machine(editorMachine, options?);
story.actor(editorMachine, options?);
```

`story.app` accepts the same typed `RuntimeFactory<App>` that the live host uses to construct the
application runtime. It accepts neither a bare app definition nor an already-created runtime. Each
`run()` invokes that production factory once with a deterministic host containing the TestClock,
fixture-backed external capabilities, and any compatible app boot supplied by the Story. The app
continues to contain machines rather than actor instances; production shared-actor creation remains
owned by the runtime factory. Boot restoration, factory ensures, source-graph validation, graph
sealing, and activation use the same atomic production bootstrap as a live host. A missing shared
actor therefore fails through the same `getActor` diagnostic in Stories and live hosts.

`story.machine` proves one machine in isolation. It compiles a package-private one-machine AppPlan
through the production app compiler and gives that plan to the same `FlowRuntime` implementation,
actor engine, operation kernels, context-turn path, scheduler, inspection surface, and cleanup path.
There is no `StoryRuntime`, minimal testing runtime implementation, testing actor, testing mailbox,
testing operation store, or testing snapshot implementation.

Stories are immutable test plans and reusable behavioral examples. Builder calls return new plans
without modifying their receiver. Plans contain no embedded assertions, behavior branches, loops,
predicates, arbitrary execution callbacks, or live actor handles. A runtime factory is production
bootstrap authority rather than a Story command callback. `run()` is the sole execution boundary
and returns immutable named checkpoints plus automatic end evidence for an ordinary test runner to
assert.

### Story-local actors and app targets

`story.actor(machine, options?)` returns a deeply frozen inert recipe for one Story-local actor. It
contains the exact machine and exact fresh input when required, but no runtime, mailbox, snapshot,
state, operation binding, disposal authority, or live actor handle:

```ts
const editor = story.actor(editorMachine, {
  input: { documentId: "document-1" },
});

const leftButton = story.actor(buttonMachine);
const rightButton = story.actor(buttonMachine);
```

The completed plan identifies Story-local targets by recipe object identity. Repeated use of one
recipe resolves one actor during a run; separate recipes create independent actors even when they
use the same machine and input. Each `run()` materializes every referenced Story-local target by
calling `runtime.createActor(target.machine, target.options)` after the production runtime factory
returns. Run cleanup disposes every Story-created actor through the production runtime ownership
path. A Story target whose machine is not admitted by the runtime factory's compiled AppPlan is
rejected.

An app Story command accepts either an inert value returned by `story.actor` or an exact app-owned
`ActorRef`. An `ActorRef` is resolved with `runtime.getActor(ref)` and remains owned by the
production runtime factory. A machine family is never an app command target because several actors
may use the same machine. Shared refs need no Story-local alias, and Story-local recipes are not
accepted by React hooks, `useView`, or ordinary runtime APIs.

```ts
const saveDocument = story
  .app(createDocumentsRuntime, {
    fixtures: [documentsFixture],
    maxTurns: 100,
  })
  .send(editor, Editor.E.EditRequested("Updated"))
  .process()
  .simulate(
    editor,
    Editor.O.save.commit({
      documentId: "document-1",
      body: "Updated",
    }),
    {
      occurrence: 1,
      type: "success",
      value: savedDocument,
    },
  )
  .process()
  .send(PrimarySessionRef, Session.E.SignOutRequested())
  .process()
  .checkpoint("signed-out");
```

### Machine stories

A machine Story owns one implicit fresh actor, so `send` and `simulate` omit the target. It accepts
exact fresh input when the machine requires it and exact initial selected context when the
definition declares context dependencies:

```ts
const signedOutStory = story
  .machine(editorMachine, {
    input: { documentId: "document-1" },
    context: {
      sessionState: Session.S.ACTIVE,
      themeMode: "dark",
    },
    fixtures: [editorFixture],
    maxTurns: 100,
  })
  .send(Editor.E.EditRequested())
  .setContext({
    sessionState: Session.S.SIGNED_OUT,
    themeMode: "dark",
  })
  .process()
  .checkpoint("signed-out");

const machineRun = await signedOutStory.run();

machineRun.checkpoints["signed-out"].snapshot;
machineRun.end.snapshot;
```

`setContext(context)` does not impersonate provider actors or prove their selectors. App Stories
prove production provider resolution and propagation, while machine Stories inject already-selected
values through the production context-turn path to test one consumer's response. A machine Story
cannot accept a runtime boot payload, `ActorRef`, additional actor, raw memory, initial state, or
actor-snapshot override. It invokes the production memory initializer and reaches later
configurations through events, controlled external observations, context changes, and time.

### Commands and controlled observations

The complete command surface is:

```ts
// Both Story kinds
process();
advance(duration);
advanceTo(epochMilliseconds);
advanceToNextTimer();
checkpoint(name);
run({ signal? });

// App Story
send(target, event);
simulate(target, operationPlan, observation);

// Machine Story
send(event);
simulate(operationPlan, observation);
setContext(context);
```

- `send` enters the exact target's production mailbox. A package-private acknowledgement is attached
  to that same mailbox command and completes after its ordinary event turn stabilizes; it does not
  invoke transition logic directly or drain unrelated ready work.
- `process()` replaces both `flush()` and `settle()`. It repeatedly asks the production runtime to
  drain ready mailboxes, context turns, reconciliation, same-time deadlines, scheduler work, and
  finite operation fibers until nothing can progress without another Story command or future clock
  movement. It stops with controlled calls, continuing streams and observations, and future
  TestClock deadlines still visible in pending work. Unknown finite work continues until it
  completes or exhausts `maxTurns`; `process()` never advances time or invents an external result.
- `simulate(...)` matches an already-pending controlled operation rather than creating work. The
  operation plan identifies the exact descriptor and canonical input or key, while the required
  one-based `occurrence` identifies repeated matching admissions for the exact actor target. It
  delivers the observation through the production operation-completion path and never writes actor
  memory, cache state, snapshots, generations, or pending-work evidence directly.
- `setContext(context)` exists only on machine Stories and admits one exact selected-context change
  through the production context-turn path.
- `advance(duration)`, `advanceTo(epochMilliseconds)`, and `advanceToNextTimer()` move the injected
  TestClock. Clock movement and `simulate` do not implicitly call `process()`; progression remains
  visible in the authored plan.
- `checkpoint(name)` freezes named evidence immediately without processing work, moving time, or
  creating restoration input.
- `run({ signal? })` acquires a fresh production runtime, executes the immutable plan, and guarantees
  cancellation and scoped cleanup through the production disposal paths.

Controlled observations use one typed discriminated union:

```ts
{
  occurrence: number;
  type: "success";
  value: Success;
}
{
  occurrence: number;
  type: "failure";
  error: Failure;
}
{
  occurrence: number;
  type: "defect";
  defect: unknown;
}
{
  occurrence: number;
  type: "interruption";
}
{
  occurrence: number;
  type: "emission";
  value: Emission;
}
{
  occurrence: number;
  type: "completion";
}
```

Finite operations accept terminal observations, while streams accept emissions followed by
completion, failure, defect, or interruption. A missing, mismatched, not-yet-admitted,
already-settled, or wrong-kind occurrence fails deterministically. When several actor occurrences
share one canonical resource generation, simulating one linked occurrence settles that production
generation once and updates every attached actor; a second terminal observation fails as already
settled.

### Checkpoint and end evidence

App checkpoints expose exact authored targets through one typed lookup method:

```ts
const appRun = await saveDocument.run();

appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;

appRun.end.actor(editor).snapshot;
appRun.end.actor(PrimarySessionRef).snapshot;
```

`actor(target)` is evidence lookup over the captured checkpoint and never returns a live actor.
Machine checkpoints retain `snapshot` for their one actor and use the same reserved `runtime`
metadata shape:

```ts
machineRun.checkpoints["signed-out"].snapshot;
machineRun.checkpoints["signed-out"].runtime.now;
machineRun.end.snapshot;
machineRun.end.runtime.pendingWork;
```

`runtime` contains exact `now` and `pendingWork` evidence; actor issues remain in their owning actor
snapshots. Every checkpoint and `run.end` is deeply frozen and captured through the production
runtime's atomic read barrier so its actor snapshots and runtime metadata describe the same instant.
`run.end` does not imply an actor final state or completion. A failed execution retains completed
checkpoints plus typed failure-boundary and cleanup evidence but does not manufacture a successful
`run.end`.

Pure model discovery accepts only a command-empty fresh `story.machine` plan because it predicts one
machine's transitions rather than an asynchronous app graph. App Stories prove actual cross-actor
orchestration and cannot be reduced to one predicted machine model.

### **NON-NEGOTIABLE: LIVE EXECUTION, STORIES, AND TESTS MUST SHARE ONE PRODUCTION RUNTIME**

**A Story may create a fresh runtime instance for isolation, but it must never use a separate Story
or test runtime implementation that can drift from live behavior.**

The Story package is limited to immutable plan construction, deterministic host capabilities,
command interpretation, acknowledgement waiting, and evidence collection. Every stateful action
must pass through the production `FlowRuntime`, runtime factory, actor creation and lookup methods,
mailbox, operation kernels, context propagation, scheduler, inspection, atomic read barrier, and
disposal paths. Source architecture proofs must reject a `StoryRuntime`, testing actor, testing
mailbox, testing scheduler, testing operation store, testing transition engine, testing cache, or
testing snapshot implementation. Runtime parity proofs must execute equivalent live-host and Story
command sequences and compare snapshots, turn records, pending work, operation generations, and
cleanup evidence.

### Design status before contract migration

The public API design decisions in this ledger are accepted. Actor composition and ownership, the
React hook split, module tooling identity, Story constructors and commands, transition actions, named
operation families, reactive-context authoring, and the actor/ref/lease capability split are not
reopened by the remaining work. Runtime-sized keyed subscription collections remain the one explicitly
deferred public capability and are outside this migration.

The post-decision audit found behavioral contract gaps that must close before migration can be called
mechanical. They are recorded in
[`DESIGN_BEHAVIOR_GAPS.md`](./DESIGN_BEHAVIOR_GAPS.md). These are behavior problems, not API-change
proposals: they define lifecycle, ordering, ownership, persistence, observation, evidence, cleanup,
compatibility, and proof semantics underneath the accepted surface. An implementation agent must not
rename, overload, replace, or add a competing public API while resolving them.

Contract migration remains normative and coordinated: close each applicable `BEH-*` item, migrate
every superseded contract and public type, update the working operation spec, add the enumerated
compile/runtime/Story/React/inspection proofs, and remove incompatible old surfaces together. A failed
proof may reopen the exact behavior whose guarantee cannot be implemented, but it does not authorize
an implementation agent to silently substitute a different public surface or semantic while this
ledger remains the authority.

### Required contract migration

Promoting this decision requires a coordinated replacement rather than additive aliases:

- Replace callable `story({ app, machine, start? })` with non-callable `story.app(runtimeFactory,
options?)`, `story.machine(machine, options?)`, and `story.actor(machine, options?)`; remove
  `.with(...)`, bare-app app Stories, and live-runtime Story inputs.
- Require the live host and `story.app` to use one typed production runtime factory. Add architecture
  and parity proofs that reject a second runtime, actor, mailbox, scheduler, operation, cache,
  transition, snapshot, or cleanup implementation.
- Replace `perform`, `deliver`, and `receive` with the single generic `simulate` command and the
  accepted occurrence plus discriminated-observation syntax.
- Replace both `flush` and `settle` with `process`, rename `setTime` to `advanceTo`, and remove
  implicit progress from simulated observations and clock movement.
- Replace result `final` with `run.end`, and replace app checkpoint machine-ID maps with
  `checkpoint.actor(storyActor | actorRef)` plus reserved `runtime` metadata.
- Add exact-actor app `send` and `simulate` targeting. Retain target-free `send` and `simulate` only
  for machine Stories, retain `setContext` only for machine Stories, and reject app Stories that
  inject context directly.
- Remove fresh machine-Story memory, state, snapshot, and boot overrides; focused Stories always use
  the production memory initializer and exact input.
- Remove every child-machine Story command, control, snapshot, pending-work, and model surface as
  part of the broader child-machine deletion.
- Update the glossary, public API, testing, type-system, architecture, persistence/artifact,
  compatibility/deletion, CLI, proof matrix, phase tasks, fixtures, compile proofs, and runtime proofs
  together.

Decision: Accepted. Flow exposes immutable app and machine Story builders plus inert Story-local
actor recipes. App Stories invoke the production runtime factory, every command drives the one
production runtime implementation, `simulate` uses exact target and occurrence identity, checkpoints
use exact actor evidence lookup, and successful runs end under `run.end`. ActorRef registration,
owner leases, and module tooling identity are accepted independently of this settled Story surface.

## Accepted revisions

### Composition, input, and actor construction

- Module `machines` are exact keyed records. Apps accept an array of unaliased modules and flatten
  their machine records into `App.M`; duplicate machine keys across modules are compile errors.
- `App.M` keys are ergonomic machine-family catalogue keys, while explicit machine IDs remain
  durable machine and artifact identity. They do not address actor instances. `App.M` is the
  complete machine-admission catalogue for local creation, shared registration, and Story-local
  actors; it contributes every listed machine's full operation graph and requirements to `AppPlan`,
  and no running runtime may expand that universe. App compilation creates zero actors. Flow removes
  automatic-root identity, `RootActor`, `runtime.actor(machine)`, and `dynamicMachines`.
- `module({ id, machines })` remains the tooling grouping boundary. Its unique app-local ID owns CLI
  slicing, trace and inspection grouping, and behavior-artifact sections, but contributes to no
  machine, actor, ref, persistence, context, runtime, or operation identity. Renaming it is
  artifact-breaking and requires explicit artifact migration while remaining runtime- and
  persistence-compatible.
- Definition `memory: ({ input }) => Memory` is the single input and memory inference path. It runs
  once for a fresh actor; restoration installs persisted memory without replaying input.
- Input is orthogonal to actor sharing. Void-input and input-bearing machines may both back any
  number of local or shared actors. `useActor` requires exact input only when the machine requires
  it; `useActorByRef` resolves an actor whose runtime owner already supplied its input. Input
  initializes each fresh actor once and cannot change on a running actor.
- Flow does not add a separate typed-identity replacement for input in this revision.
- Flow adds no XState-style `setup()` or `machine.provide()` layer. Static shape, behavior, app
  closure, runtime services, and test fixtures remain separate owned boundaries.

### Compound-state identity and handler baseline

- State definitions accept recursive single-key parent groups inside the existing ordered state
  list: `states: ["INACTIVE", { ACTIVE: ["EDITING"] }]`.
- Definition-derived state tokens preserve the complete readable path, such as
  `S.ACTIVE.S.EDITING`; transitions never use relative paths or arbitrary node IDs.
- `default` replaces root-level `initial` and is also declared on compound nodes. Targeting a
  compound node enters its authored default path. Each `default` names one exact direct child, so a
  nested default path resolves one compound node at a time. Every compound state must declare one,
  even when no transition currently targets that compound state directly.
- Parent event handlers compile across descendant states. An ancestor/descendant duplicate event
  handler is a compile error, with no implicit precedence, override, or guard-failure fallback.
- `snapshot.state` and every machine callback's `state` are the exact active leaf token. Exact `===`
  checks only that leaf, while `state.matches(token)` and `snapshot.matches(token)` return true for
  the leaf and each active ancestor. Callbacks do not receive a separate declaring-node field.
- Compound-state activities remain alive across transitions among descendants and stop only when
  their compound state is exited. Descendant activities follow their own state membership.
- Nested activities start parent-to-child and stop child-to-parent. Unchanged ancestor activities
  survive a descendant transition; startup order does not imply asynchronous readiness.
- Event schemas and constructors remain machine-wide. Leaf and compound nodes only decide where
  those events are handled; substates do not introduce nested event catalogs or event identities.
- Flow removes child machines. Substates share one actor's memory, context, mailbox, operations, and
  lifetime and create no nested actor input, completion, snapshot, or addressing surface.
- Compound-state timers remain scheduled across descendant transitions and are cancelled only when
  their compound state is exited. Descendant transitions do not reset their elapsed duration.
- Compound redirects remain applicable throughout their compound state's active lifetime and are
  evaluated during stabilization whenever the candidate leaf is one of its descendants.
- Redirects evaluate from the outermost active compound down to the exact leaf, preserving authored
  order within each state. Parent invariants therefore run before descendant redirects.
- Flow has no `type: "final"` node. Terminal-looking states are ordinary leaves, and state nesting
  does not introduce actor completion, parent `onDone`, final output, or mailbox shutdown.
- `reenter` is an exact definition-derived state token, not a boolean. It names the active boundary
  whose activities, timers, and descendant path are released and reactivated around a target inside
  that subtree; invalid or foreign boundaries are compile errors.
- State nesting has a hard maximum depth of ten. The API remains recursively identical at every
  level, while documentation recommends using a separate machine beyond three levels.
- Flow does not add singleton, toggle, or debounce shorthand in this revision. Explicit states and
  timers remain the baseline because they preserve visible legality, replacement, and ownership
  boundaries; future sugar requires a separate proposal with equivalent lifecycle semantics.

### Reactive machine context

- Definitions declare required cross-actor data under `context`; machine behavior cannot add or
  replace those requirements. Context entries are readonly selectors over another definition's
  state and memory, and the exact selected result is contextually typed into the consumer.
- Context selectors use `Object.is` exclusively and accept no custom comparator or shallow mode. A
  changed selected result enters the consumer as an ordered context turn; an unchanged result creates
  no consumer revision or downstream work. Independently compared derived fields use separate context
  slots, which may repeat one provider ref and are still atomically batched.
- One provider publication evaluates every context selector bound to that provider ref against the
  same snapshot. All changed results install in one atomic consumer context turn, producing one
  consumer revision and one continuing-activity reconciliation rather than intermediate projections.
- One committed actor turn defines a bounded context-propagation wave. Flow drains the sealed acyclic
  context graph in dependency order and processes each consumer at most once after its dirty upstream
  dependencies settle, so diamond-shaped branches produce at most one combined consumer context turn.
  Publications from separate actor turns remain separate waves and are never timing-coalesced.
- Bootstrap installs each consumer's initial context projections before activation, initial activity
  reconciliation, its first observable snapshot, or handle escape. That installation establishes the
  baseline for `onContext`; registrations record their initial selected values without emitting
  startup events.
- A context turn publishes the new projection and reconciles dependent continuing activities, but
  it does not replay event handlers, transition state, update memory, or admit finite actions.
- `onContext.select` is registered in the machine authoring callback before the state configuration
  is returned. It maps a selected context change to one typed self-event or `null`; it is neither an
  activity declaration nor a state-node field.
- The resulting event uses the ordinary mailbox and state handlers, so the state graph remains the
  visible owner of transition legality, guards, memory updates, and actions. `onContext` cannot
  target a state or execute those effects directly.
- Input establishes an actor and its initial memory once and is not available to later machine
  behavior. Reactive environment belongs in context; a changed domain identity replaces the actor
  rather than silently retaining memory.
- The app plan owns provider resolution and the context graph independently of React. It rejects
  missing, ambiguous, and cyclic providers; context edges create neither actor parentage nor
  lifetime ownership. Each context-provider binding is fixed for the consumer actor's lifetime;
  changing a provider requires replacing that consumer rather than retaining its memory across a
  rebind. `contextBindings` mirrors context keys one-for-one, permits the same ref under several keys,
  and does not require selectors from one provider to share a grouped result shape.
- Individual provider disposal is rejected while an active consumer remains bound to its ref, with a
  diagnostic naming the dependent refs and context keys. Whole-runtime disposal tears the graph down
  in reverse dependency order, consumers before providers; context edges never cascade individual
  disposal or preserve stale projections.
- Selected context values are never serialized. Dehydration records exact binding refs and observed
  provider revisions and succeeds only on a context-closed cut; concurrent edge mismatch is retryable
  `ConcurrentDehydrate`, while unrelated actors may retain state-only skew. Hydration restores the
  graph in dependency order and recomputes the silent context baseline from provider snapshots before
  activity reconciliation or handle escape.
- Dehydration fails with non-retryable `NonDurableContextProvider` when an included durable consumer
  depends on an opaque provider. The diagnostic names the consumer, provider machine and opaque ID,
  and every failing `contextBindings.<key>` path, then directs the host to use
  `actorRef(providerMachine, id)` plus `runtime.ensureActor` and bind that stable ref at those paths;
  Flow never promotes, substitutes, or silently rebinds the provider.

### React selectors and actor commands

- Flow has no public `flow.view` definition, view ID, or module view registry. One exact actor handle
  supplies instance identity and exact selector typing directly to `useView`.
- `useActor(machine, options?)` creates one fresh local actor in the current Flow runtime and is
  command-only. Repeated use of the same machine creates independent actors regardless of input.
- During render, `useActor` returns one inert prepared actor with its final opaque ref, initial
  snapshot, stable handle, and command-buffering mailbox but no runtime registration, execution scope,
  or external work. Commit attaches and activates that exact actor and drains buffered commands;
  abandoned renders leave no runtime state. Imperative `runtime.createActor` remains immediately
  attached and running.
- React attachment follows `prepared -> active <-> suspended`, while `disposed` is terminal. Effect
  cleanup always performs real production-runtime suspension because Strict Effects, Activity hiding,
  and final unmount are indistinguishable at cleanup time; it never suppresses cleanup, waits through
  a grace period, or guesses whether a reconnect will occur. Suspension removes active registration,
  observers, context subscriptions, continuing work, and timers and rejects commands through escaped
  handles. Resume keeps the exact ref, handle, state, memory, context baseline, mailbox cursors,
  operation facts, and absolute deadlines, then reacquires live resources and reconciles current
  provider context without replaying initialization, committed events, finite actions, or unchanged
  `onContext`. Only an explicit production-runtime or owner action terminally disposes the actor.
- Public actor snapshots and `useView` expose the exact lifecycle union `prepared | active |
suspended | disposed`; each value truthfully describes command admission and live-resource
  ownership. Lifecycle publication remains snapshot-coherent. Inspection retains `actor:start`,
  `actor:restore`, and `actor:dispose`, adds `actor:suspend` and `actor:resume`, emits no preparation
  event, and publishes the new snapshot before the lifecycle event. Exact `from`, `to`, and `cause`
  accompany ordinary actor metadata; lifecycle evidence creates no machine `TurnRecord`.
- React delegates this lifecycle to the production actor engine. Strict Mode and Activity proofs drive
  the adapter, while live-host and Story parity proofs verify the same scheduler, context, operations,
  and turn semantics without adding React lifecycle commands to Story timelines. Lifecycle inspection
  evidence is permitted, but suspend and resume alone create no machine revision or `TurnRecord`.
- Every actor carries one exact `ActorRef`. Declared stable refs identify durable shared actors;
  generated opaque refs identify runtime-local actors and are not restorable. Several refs may
  address independent actors of one machine. Refs are branded to their exact machine, and a runtime
  rejects a ref unless that exact machine belongs to its `App.M`; refs are not app-branded.
  Every handle exposes `actor.ref`. `runtime.createActor(machine, { input, contextBindings? })` always creates
  an opaque local actor, accepts no ID, and returns an owner lease containing `{ actor, dispose }`.
  The lease's idempotent asynchronous `dispose` is the only individual terminal-disposal authority for
  that local actor; ordinary actor handles and refs carry none, and dropping the lease does not trigger
  implicit cleanup. Runtime shutdown subsumes outstanding leases. `actorRef(machine, id)` creates an
  inert stable identity containing only the exact machine and authored durable ID.
  `runtime.ensureActor(ref, { input,
contextBindings? })` is the owner-only restore-or-create boundary and also returns `{ actor,
dispose }`: boot state wins over fresh input, concurrent calls join one construction and one
  idempotent terminal lifetime, and later calls cannot replace memory or source bindings.
  `runtime.getActor(ref)` and `useActorByRef(ref)` are lookup-only and reject a missing registration.
  A ref grants no ownership or disposal authority. Successful shared-actor disposal tombstones its
  stable ref for that runtime, so later lookup and ensure both reject instead of creating a second
  incarnation; a new runtime may restore or freshly create the same durable ref.
- Initial bootstrap installs boot actors, completes factory ensures, resolves every source ref,
  rejects missing providers, duplicate registrations, foreign machines, and instance cycles, then
  seals the graph before activation, external work, or public handle escape. Live and Story hosts use
  this same production barrier.
- `useView(actor, selector)` is the sole ordinary React subscription path. It accepts neither a
  machine family nor an `ActorRef` and evaluates against one atomic actor revision.
- Selectors receive current state, immutable memory, inherited readonly context, lifecycle, issues,
  `can(event)`, and snapshot-bound read-only `O`. They cannot acquire or mutate operation state.
- Selector results use `Object.is` by default. `useShallow(selector)` memoizes top-level members of
  selected plain records and tuples with `Object.is`; there is no comparator argument on `useView`.
- Actor state, mailboxes, operations, inspection, and cleanup remain Flow-runtime-owned outside
  React. `FlowProvider` supplies only the existing runtime; Flow adds no per-actor React Context,
  binding component, or prop-drilled state layer.

### App-level stories

- `story.app(runtimeFactory, options?)`, `story.machine(machine, options?)`, and
  `story.actor(machine, options?)` are separate constructors on one non-callable `story` namespace.
  They produce immutable plans and inert local-actor recipes rather than live runtime objects.
- Every app Story invokes the same production runtime factory used by the live host. Machine Stories
  compile a package-private one-machine AppPlan and use the same `FlowRuntime`; Flow has no separate
  Story runtime, actor engine, mailbox, scheduler, operation store, cache, or snapshot implementation.
- Apps contain machines rather than actors. The production runtime factory creates and registers
  shared actors through `runtime.ensureActor`, while `story.actor` describes a local actor that each
  `run()` creates through `runtime.createActor` and disposes through the production runtime path.
- App `send` and `simulate` commands target either one exact Story actor recipe or one exact
  `ActorRef`. Recipes use object identity within a run, refs resolve through `runtime.getActor`,
  and a missing ref fails rather than creating an actor. Machine families are invalid targets because
  one machine may back several actors.
- Machine stories own one implicit fresh actor, so `send(event)` and `simulate(plan, observation)`
  omit a target. They may inject exact selected context through `setContext` for focused consumer
  tests, but they cannot accept extra actors, refs, boot data, raw memory, state, or snapshots.
- `process()` replaces both `flush()` and `settle()`. It drains all work that can progress without
  another Story command or future time, stops at controlled and continuing work or future deadlines,
  and fails on unchanged unknown finite work after `maxTurns`.
- `simulate` replaces `perform`, `deliver`, and `receive`. It matches an already-pending exact
  operation plan plus a required one-based occurrence, then admits one typed success, failure,
  defect, interruption, emission, or completion observation through the production completion path.
- `checkpoint` retains one temporal meaning in both modes: freeze named evidence immediately without
  progressing execution. App evidence uses `checkpoint.actor(storyActor | actorRef).snapshot`;
  machine evidence uses `checkpoint.snapshot`; both reserve `runtime.now` and `runtime.pendingWork`.
- `advanceTo` replaces `setTime`. Simulated outcomes and clock movement never implicitly call
  `process`; progress is always authored explicitly.
- A successful run returns named `checkpoints` and automatic `run.end` evidence. `run.end` replaces
  `final` and does not imply an actor final state or completion.
- Pure model discovery accepts only a command-empty fresh machine story. App stories prove actual
  cross-actor orchestration and are not reduced to one predicted machine model.
- Ref registration, durable identity, local cleanup under concurrent React rendering, non-React
  ownership, and multi-instance context-provider resolution are accepted alongside Story targets,
  simulation syntax, checkpoint lookup, and one-runtime execution.

### Operations API and semantics

The detailed working contract is [`OPERATIONS_SPEC.md`](./OPERATIONS_SPEC.md). This ledger records
the accepted direction without duplicating its lifecycle tables, examples, or proof obligations.

- A machine definition contains one flat named `operations` record, and its callback receives the
  exact `O` catalogue. Listing a descriptor or constructing a plan is inert, while returning the
  plan from an admitted machine declaration authorizes Flow to execute it.
- Resource input `P` remains separate from cache key `K`. Every `key(P)` returns an ordered readonly
  tuple, exact identity is descriptor ID plus canonical `K`, and equal keys assert equivalent
  canonical results even when their executable inputs differ.
- Canonical keys contain only bounded immutable canonical data: `null`, booleans, strings, finite
  numbers, readonly arrays, and plain readonly records. Records canonicalize by sorted keys, `-0`
  normalizes to `0`, unsupported or secret-branded values and cycles reject with an exact path, and
  fixed limits are 16 levels, 256 nodes, and 8 KiB of canonical bytes.
- Every live binding retains its own `P`. The plan that admits a shared resource generation pins its
  immutable `P` for that generation; equal-key joiners never replace it, owner release never causes a
  mid-flight handoff, and hydrated key-only data waits for a live binding before new work can start.
- One Flow runtime owns one shared resource cache. Actors own continuing subscriptions and immutable
  projections into canonical entries, so actors using the same descriptor and `K` share data and
  lookup generations without sharing actor lifetime.
- Resource families expose `key`, `getData`, `getState`, `lookup`, `subscribe`, `refetch`, `setData`,
  and `cancel`. There is no public `ref`, `byKey`, bound-entry object, public enumeration API, or
  generic `resources.get` registry.
- Transactions use `key` rather than `lane` and expose `key`, `getState`, `commit`, and `cancel`.
  Streams use the same `key` vocabulary and expose passive state plus continuing `subscribe`.
- Accepted event handlers may declare optional transition `actions`. The callback is evaluated only
  for the winning transition and returns one inert finite plan, a readonly list, `null`, or an empty
  list; omitting it means that the transition admits no finite operation.
- Transition `actions` admit finite work such as resource lookup, transaction commit, cancellation,
  cache writes, invalidation, and clearing. State `activities` retain continuing resource and stream
  subscriptions, so the field names expose the difference in lifetime rather than two spellings for
  the same mechanism.
- The winning guard, `updateMemory`, and `actions` evaluate in order against one pre-turn snapshot and
  event. Flow applies target and memory, stabilizes redirects, validates the entire action batch,
  atomically commits actor and synchronous store mutations, publishes, and only then starts external
  work. Redirects do not cancel edge-admitted finite actions, and any planning defect aborts the
  entire unpublished turn without retaining a valid prefix.
- `onMemory` provides current memory on state activation and after committed memory changes. Multiple
  direct or selected declarations reconcile independently and may return continuing resource or
  stream declarations, but they cannot admit transaction commits or cache commands.
- `onMemory.select` compares its complete selected result with `Object.is` and has no custom
  comparator. Changed selections may rebuild plan objects, but Flow retains equal continuing work by
  declaration slot, operation kind, exact descriptor, and canonical `K`, never by plan or `P` object
  reference.
- Runtime-sized arrays of continuing plans and `subscribeMany` or `subscribeEach` APIs are excluded.
  Known finite sets use separately authored activity declarations; arbitrary dynamic collections use
  an aggregate resource or separately owned actors until a concrete collection contract is proposed.
- Every successful authoritative `setData` fences and interrupts older generations for its exact
  resource identity; there is no coexistence option. A declined updater changes nothing, fenced finite
  occurrences settle as superseded without mapped domain outcomes, and late results cannot overwrite
  the authoritative base.
- Explicit `cancel(K)` terminates only the calling actor's finite occurrence. Shared work continues
  while another owner remains and is interrupted only after the final owner releases; planned cancel,
  release, and supersession record terminal status and inspection evidence without mapping another
  domain outcome, while unexpected external interruption may use an authored mapper.
- Actor-level `invalidate` and `clear` accept exact resource-and-key pairs, tags, and admitted
  families, allowing one action to update multiple cache entries atomically. They are cross-resource
  capabilities rather than methods on each resource family.
- `clear([...targets])` is transition-action-only, validates and deduplicates exact entries, declared
  tags, and admitted families before one atomic removal, and exposes no wildcard or whole-runtime
  machine authority. Complete cache removal occurs only through `runtime.dispose()`; there is no
  ordinary `runtime.cache.clear()`.
- Stream `getState(K)` exposes lifecycle and terminal facts but never retains the latest emission.
  Values become durable observable state only through mapped machine events and memory or explicit
  authoritative resource writes.
- `useView(actor, selector)` receives the named `O` catalogue with passive read capabilities only.
  Selector evaluation never starts, retains, refreshes, invalidates, or subscribes to work.
- Adding transition `actions` intentionally changes the current API-004 grammar, which rejects that
  field. Promotion therefore requires coordinated updates to the public API contract, semantics,
  validation, the accepted runtime execution order, and proof rows.
