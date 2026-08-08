# Incident Console design decisions

Status: decision rationale; implementation authority moved to
[`implementation/README.md`](./implementation/README.md)

This is the living decision record for the ideal Flow State userland API. It records
what we have actually agreed, what is only a current direction, what remains open, and
which ideas from the first reference should no longer guide implementation.

The earlier reference code and companion notes have been removed. This file preserves the
reasoning that produced the target, while the resolved normative behavior, exact public
surface, proofs, and phased execution rules live under `implementation/`. When prose here
conflicts with a contract there, the implementation contract is authoritative.

## Status vocabulary

- **Settled** means future reference and library work should preserve the decision.
- **Current direction** means the idea is promising, but its syntax or boundary still
  needs review.
- **Open** means no implementation should be selected yet.
- **Withdrawn** means an earlier reference proposal was rejected and must not be treated
  as intended API.

## Settled decisions

### 1. Domain code uses ordinary TypeScript

Application domain models use TypeScript interfaces and types. Core Flow APIs must not
require Effect Schema or any other runtime codec for domain models, machine memory,
events, resource values, transaction inputs, or transaction results. Maintained examples
and this reference use plain TypeScript rather than Schema-based domain declarations.

```ts
export interface Incident {
  readonly id: string;
  readonly status: IncidentStatus;
  readonly assignee: string | null;
}

export function decideStatusChange(
  current: IncidentStatus,
  requested: IncidentStatus,
): StatusChangeDecision {
  // Pure business policy.
}
```

Runtime decoding may still be used where untrusted values enter the application, such as
an HTTP, storage, URL, or hydration boundary. It is optional, chosen by the application,
and belongs to the boundary adapter rather than the Flow descriptor or domain model.

TypeScript types are erased, so inspection and the CLI must not claim runtime payload
validation or display a runtime schema unless the application separately supplies or
generates that metadata.

Flow may use Effect Schema privately to implement its own wire boundaries. That does not
make Schema part of domain authoring, vocabulary authoring, or the public identity of a
Flow value. Flow-owned decoding failures must also be translated into Flow diagnostics;
users should not receive Effect Schema parse errors from a Flow API.

### 2. A machine instance owns its live work

Resources, resource observations, transactions, streams, timers, and child actors are
not owned by individual states. A running machine instance owns and supervises its live
handles; states and transitions orchestrate which work is active and how its results
affect the machine.

Reusable descriptors may be declared outside the machine. The runtime store owns
canonical cached resource values, while the machine instance owns its observation or
refresh operation. Leaving a state may stop an observation without deleting its cached
value.

```ts
const detailWork = [
  flow.observe(incidentListResource, { params: listParams }),
  flow.observe(incidentDetailResource, { params: detailParams }),
  incidentTimeline,
] as const;

export const incidentConsoleMachine = flow.machine(Incident, (S) => ({
  initial: S.DETAIL,
  states: {
    DETAIL: {
      activities: detailWork,
    },

    RUNBOOK: {
      activities: [...detailWork, runbookLease, runbookChild],
    },
  },
}));
```

Runtime reconciliation remains private library machinery governed by the Effect-native
ownership and correctness contract in decision 21. Userland describes activation and
orchestration without pretending a state is the owner of the underlying primitive.

### 3. Machine states declare transitions, redirects, activities, and timers

Keep the readable object grammar built around `states`, `on`, guarded transitions,
`updateMemory`, and `type: "final"`. Replace the opaque eventless term `always` with
`redirect`, and replace the overloaded lifecycle terms `invoke` and `after` with names
that expose their actual semantics:

- `redirect` declares ordered eventless transitions that prevent the machine from
  stabilizing in the current state when a condition matches.
- `activities` declares supervised work that is active while the machine's current
  configuration requires it.
- `timers` declares named delayed transitions that remain scheduled while the current
  configuration requires them.

Generic `entry` and `exit` callbacks are not part of this grammar. State lifecycle work
must be represented by an inspectable activity or timer, memory must change through an
accepted transition's `updateMemory`, and UI reactions belong in React or an explicit
observer. This keeps state changes causal and prevents arbitrary callbacks from hiding
behavior from inspection and replay.

Vocabulary state tokens provide the readable references previously supplied by separate
state-constant objects:

```ts
export const Runbook = flow.vocabulary({
  id: "Incidents/Runbook",
  states: ["LOADING", "WAITING", "RETRYING", "SUCCEEDED", "FAILED", "CANCELLED"],
  events: {
    RunbookLoaded: null,
  },
});

export const runbookMachine = flow.machine(Runbook, (S, E) => ({
  initial: S.LOADING,
  states: {
    LOADING: {
      activities: [
        flow.refresh(runbookResource, {
          params: runbookParams,
          outcomes: { success: E.RunbookLoaded },
        }),
      ],
      on: {
        RunbookLoaded: S.WAITING,
      },
    },
    WAITING: {
      activities: [flow.observe(runbookResource, { params: runbookParams })],
      timers: {
        stale: {
          delay: "30 seconds",
          target: S.RETRYING,
        },
      },
    },
    SUCCEEDED: { type: "final" },
  },
}));
```

A machine state represents a durable, mutually exclusive behavioral mode whose active
status changes the events the machine accepts, the activities or timers it orchestrates,
or the capabilities it exposes to the user. Resource loading or transaction status alone
does not justify another machine state; it becomes a state only when the application
behaves differently because of it. State count is therefore decided by application
behavior, and the reference must not collapse the console to two states solely because
resources and transactions also expose operational status.

Machine lifecycle and operation lifecycle are distinct dimensions. The current machine
state token describes the actor's behavioral mode, while each resource lookup,
observation, refresh, or transaction attempt retains its own primitive-owned lifecycle.
Those operation lifecycles may overlap without forcing their Cartesian product into the
machine vocabulary. An accepted event is the causal application action: it may update
memory, change the machine state, start an operation, or combine those effects, while the
resulting operation is not itself another event or machine state.

Operations are not added to `flow.vocabulary` and there is no `O.*` namespace. Vocabulary
continues to declare states and events only. Resource and transaction descriptors define
primitive families, their resolved refs provide observable runtime identity, and
generations distinguish repeated attempts within one ref. These identities do not create
a third vocabulary kind.

Every resource snapshot and transaction snapshot exposes a readonly `.status` property.
That shared property name is the operation-lifecycle convention, but it is not one
universal `OperationStatus` union: resources retain resource semantics such as `idle`,
`loading`, `success`, `failure`, and `stale`, while transactions retain transaction
semantics such as `idle`, `pending`, `queued`, `success`, `failure`, `defect`, and
`interrupt`. Primitive-specific detail remains available beside `.status`; for example,
a resource may have successful cached data while its `.activity` is `fetching`, so
`.activity`, `.freshness`, and `.availability` must not be collapsed into `.status`.

An actor snapshot provides typed lookup of the exact primitive snapshot a view needs. A
resource is addressed by its resolved resource ref and a transaction is addressed by its
resolved transaction ref. A transaction descriptor alone is not observable identity
because one actor may execute that transaction independently for several application
keys. `saveTodo.ref({ todoId })` and `saveTodo.ref({ todoId: otherTodoId })` therefore own
separate snapshot slots and cannot overwrite one another.

Each transaction ref publishes the latest generation for that ref. Repeated attempts of
the same ref replace its actor-visible lifecycle, and stale completions from older
generations cannot overwrite it. Views selecting the same ref intentionally observe the
same lifecycle; views selecting different refs remain independent. Transaction scope is
only a concurrency and serialization grouping mechanism, not snapshot identity, while
attempt and generation history belongs in receipts and inspection rather than ordinary
views. The shared convention ends at `.status`: views choose their own projection shape
and may include a selected primitive's value, error, status, or more precise fields
without a generic operation wrapper or aggregate lifecycle.

A transaction definition owns the one `key` projection that derives ref identity from its
full resolved params. Its return value is the input accepted by `transaction.ref(...)`, so
execution and observation cannot encode identity differently. Flow canonicalizes the
descriptor ID and that returned key value internally; userland does not construct the
wire key. A transaction that omits `key` is a singleton and exposes only
`transaction.ref()`, whose identity is the transaction descriptor ID.

```ts
export const saveTodo = flow.transaction({
  id: "todos.save",
  params: ({ event }) => ({
    todoId: event.todoId,
    title: event.title,
  }),
  key: ({ todoId }) => ({ todoId }),
  commit: ({ todoId, title }) => api.saveTodo(todoId, title),
});

const save = snapshot.transactions.get(saveTodo.ref({ todoId }));
```

`activities` is an array because each item is already a self-identifying Flow
descriptor. A keyed object would duplicate that identity, while an array composes with
ordinary constants and spreads. The supported activity items are declarative resource
operations such as `flow.ensure`, `flow.observe`, and `flow.refresh`; a state-triggered
transaction such as `flow.run(transaction)`; a stream descriptor; or a child-machine
descriptor. Anonymous callbacks, raw promises, Effects, and manually managed intervals
are not activities because Flow could not identify, inspect, reconcile, or supervise
them reliably.

`flow.observe(ref)` authorizes the runtime to keep that resource current for as long as
the activity remains active. When the host regains focus or reconnects, an actively
observed ref refreshes only if its retained value is stale. `flow.ensure(ref)` is finite
and does not authorize later host-triggered refreshes, while a lookup already paused by an
offline host always resumes on reconnect because that completes requested work rather
than starting new work. These rules are derived from machine ownership and resource
freshness; views do not authorize network activity, and there are no separate
`refetchOnWindowFocus` or `refetchOnReconnect` options.

An activity binding owns the optional translation from its external outcomes into the
machine vocabulary's events. The state's existing `on` table remains the only place
that decides what those events mean for state and memory. An activity must not directly
target a state or update machine memory from an outcome callback.

```ts
DETAIL: {
  activities: [
    flow.observe(incidentResource, {
      params: ({ memory }) => [memory.selectedIncidentId],

      outcomes: {
        success: Incident.E.IncidentLoaded,
        failure: Incident.E.IncidentLoadFailed,
      },
    }),
  ],

  on: {
    IncidentLoaded: Incident.S.DETAIL,
    IncidentLoadFailed: Incident.S.UNAVAILABLE,
  },
},
```

Outcome mapping is optional. A resource activity may update its own canonical resource
snapshot without sending a machine event when no orchestration decision depends on that
outcome. The mapping property is named `outcomes`: it names the external activity
outcomes being translated, while the produced vocabulary events remain visible in the
values. This choice does not rename the existing transaction `routes` property. The
outcome inventory is primitive-specific rather than one universal record. Outcome names
are shared when their semantics are genuinely the same, such as `failure`, `defect`, or
`interrupt`, while finite work, streams, and child actors expose only the success,
value, or completion outcomes they can actually produce.

`outcomes` and transaction `routes` intentionally describe different ownership.
Activity `outcomes` is an optional reaction surface over lifecycle signals observed from
supervised work. Transaction `routes` assigns a command's terminal settlement channels
to vocabulary events as part of the transaction policy. Consequently,
`flow.run(transaction)` only activates the transaction and never adds another
`outcomes` map; the transaction's `routes` already own settlement delivery.

Resource activity outcomes are fixed by lookup lifetime. `flow.ensure` and
`flow.refresh` are finite lookups and expose `success`, `failure`, `defect`, and
`interrupt`. They are consumed after that one exit and do not restart merely because an
unchanged binding remains required; removal followed by activation, changed identity or
parameters, or explicit re-entry creates a new lookup generation.

`flow.observe` is continuing and exposes `value`, `failure`, `defect`, and `interrupt`.
`value` may translate every canonical value publication into an event, while omitting
that mapping lets the resource snapshot update without machine orchestration. An
observation has no `success` or `complete` outcome: it remains required through value
and typed-failure publications until released or interrupted.

```ts
flow.ensure(incidentResource, {
  outcomes: {
    success: Incident.E.IncidentLoaded,
    failure: Incident.E.IncidentLoadFailed,
  },
});

flow.observe(incidentResource, {
  outcomes: {
    value: (incident) => Incident.E.IncidentChanged(incident),
    failure: Incident.E.IncidentLoadFailed,
  },
});
```

Streams expose `value`, `complete`, `failure`, `defect`, and `interrupt`. `value` may
occur many times, while `complete` occurs once after normal stream exhaustion. The
other three exits are mutually exclusive with completion. The selected name is
`complete`, replacing the current stream route name `done`, because it describes the
stream lifecycle directly.

```ts
flow.stream({
  subscribe: connectToTimeline,
  outcomes: {
    value: (entry) => Timeline.E.EntryReceived(entry),
    complete: Timeline.E.StreamCompleted,
    failure: (error) => Timeline.E.StreamFailed(error),
    defect: Timeline.E.StreamDefected,
    interrupt: Timeline.E.StreamInterrupted,
  },
});
```

Child-machine activities expose `complete`, `failure`, `defect`, and `interrupt`.
`complete` occurs once when the child reaches a final state and receives the child's
final snapshot; there is no generic `success` or streaming `value` outcome. After any
terminal outcome the child activity is consumed and does not restart until its binding
is activated as a new generation through removal and return, changed identity or input,
or explicit re-entry.

```ts
flow.child({
  machine: runbookMachine,
  outcomes: {
    complete: (snapshot) => Incident.E.RunbookCompleted(snapshot),
    failure: (issue) => Incident.E.RunbookFailed(issue),
    defect: Incident.E.RunbookDefected,
    interrupt: Incident.E.RunbookInterrupted,
  },
});
```

An activity's `interrupt` outcome does not fire when Flow intentionally releases the
activity because an accepted transition no longer requires it, explicit re-entry
restarts it, or the actor is shutting down. Those planned releases are already causal
facts in transition and lifecycle inspection receipts, and dispatching another event
into the destination state would create stale feedback. `interrupt` is available only
when the activity is interrupted unexpectedly while its binding is still required.
Generation checks suppress any terminal outcome queued by work after its planned
release.

Activity order has deterministic but deliberately limited meaning. Flow resolves every
item against the same committed snapshot, activates items from left to right without
waiting for earlier items to finish, and queues their outcomes until the activation
batch is complete. It releases removed activities from right to left. If one operation
must wait for another's result, userland expresses that causal dependency with states
and events rather than array position.

Reconciliation uses descriptor identity and resolved parameters, not the array index.
An activity required before and after a transition remains active when both are
unchanged; a removed activity is released; a new activity is activated; and changed
parameters replace the old generation. Reordering an unchanged activity does not
restart it. The machine instance remains the runtime owner throughout this process.

The existing transition property `reenter: true` is retained as the explicit exception
to identity preservation. On a self-transition, omitting `reenter` preserves matching
activities and timers; setting `reenter: true` releases and reactivates the activities
and timers required by the final stable destination. There is no separate `restart`
property. The API spells the property `reenter`, while prose may describe the state as
being re-entered.

`timers` is a named object because the local key supplies stable identity and an
inspection label, for example `WAITING/timers/stale`. A timer starts when its declaring
configuration becomes active, is canceled when no longer required, and sends its
declared transition when its delay elapses. The `timers` property itself is sufficient;
there is no `flow.after(...)` wrapper or separately authored timer ID.

A timer is a restricted delayed transition. Its entry has `delay`, an optional `guard`,
a required `target`, and an optional `updateMemory`. When the delay elapses, Flow checks
the guard and either rejects the timer transition or atomically applies its memory patch
and target like any other accepted transition. Timer entries cannot run arbitrary
actions or submit transactions; userland targets a state whose activities own any
resulting work.

`delay` accepts either a fixed Effect `Duration.Input` or a pure resolver over the
activation snapshot. Flow resolves it once when the timer activates, records the
resulting duration and deadline, and restores that deadline during hydration. Later
memory changes do not silently retime an active timer. A changed timer identity or an
explicit `reenter: true` releases it and resolves a new deadline.

Timers are one-shot. A timer is consumed when its deadline produces or rejects its one
delayed transition; it does not expose `repeat`, `interval`, or `every`. Repeating
background schedules belong in an activity implemented with Effect `Schedule` or a
stream. When each interval is meaningful machine behavior, userland models the loop
through explicit states, transitions, and re-entry so inspection can see every cycle.

```ts
timers: {
  autoSave: {
    delay: "10 seconds",
    guard: ({ memory }) => memory.dirty,
    target: Editor.S.SAVING,
    updateMemory: () => ({ autoSaveRequested: true }),
  },
},
```

The machine-level `flow.patch(ref, patch)` descriptor is removed. State activation must
not silently mutate cached server data, and each legitimate use already has a clearer
owner: local drafts belong in machine `memory`, optimistic server changes belong in a
transaction `preview`, and authoritative external changes enter through a resource
observation or stream. The lower-level resource-store patch capability remains for
transactions, infrastructure, and test setup; this decision removes only the descriptor
from machine configuration.

`flow.invalidate(target)` remains available as a finite resource activity:

```ts
activities: [flow.invalidate(IncidentTag)];
```

Its existing cache semantics remain intact, including exact-ref, tag, and filter targets,
freshness policy, active-resource refresh, and inspection receipts. Moving it from the
current `invoke` vocabulary to `activities` changes its lifecycle placement, not what
invalidation means.

`redirect` is available on every ordinary state. A state with only `redirect` naturally
acts as an explicit router, but it is not a special `type: "choice"` state and Flow does
not require userland to add a transient state merely to branch. Use an ordinary guarded
event transition when one event directly causes the choice; use `redirect` when entering
or remaining in the current state is conditional.

```ts
DELIVERY_DETAILS: {
  redirect: {
    when: ({ memory }) => memory.cartContainsOnlyDigitalItems,
    target: Checkout.S.PAYMENT,
  },

  on: {
    DeliveryAddressEntered: Checkout.S.PAYMENT,
  },
},

ASSESSING_RISK: {
  redirect: [
    {
      when: ({ memory }) => memory.risk === "high",
      target: Deployment.S.MANUAL_REVIEW,
    },
    {
      when: ({ memory }) => memory.risk === "medium",
      target: Deployment.S.WAITING_FOR_APPROVAL,
    },
    {
      target: Deployment.S.APPROVED,
    },
  ],
},
```

A redirect is either one routing candidate or an ordered array. Flow selects the first
candidate whose optional `when` predicate returns true; an entry without `when` is the
fallback. `target` is required. A redirect cannot update memory, submit a transaction,
run an action, or omit its target. Those operations must retain a real causal event or
an inspectable activity rather than execute through hidden eventless microsteps.

The predicate is named `when`, not `guard`. Both are read-only predicates, but they
answer different questions: a transition `guard` decides whether a particular event,
timer, or activity outcome may take its attempted transition, while redirect `when`
decides whether the machine may stabilize in its current state. Redirect predicates
read the current state, memory, and other snapshot facts; they do not receive the
previous event as a disguised trigger.

Flow evaluates redirects on fresh actor activation and after every accepted transition,
then repeatedly follows matching redirects until the machine reaches a state with no
enabled redirect. Flow completes this entire stabilization chain before reconciling
activities or timers. Intermediate states and redirect microsteps remain visible to
inspection, receipts, graph tooling, and tests, but their activities and timers never
start merely to be canceled by the next automatic redirect.

A redirect is not a continuously running subscriber. Resource and stream changes must
enter the machine through an accepted event before Flow evaluates redirects again. A
bounded stabilization limit must diagnose redirect loops rather than hanging the actor.

Hydration restores the persisted stable snapshot exactly and does not re-evaluate its
redirects. With the same machine definition and serialized facts, a valid persisted
snapshot was already stable when written. Changes to redirect policy require an
explicit compatible snapshot migration or rejection, while changed external facts must
enter the restored actor through an accepted event. This keeps restoration and replay
dependent on persisted history rather than silently applying today's definition as a
new transition.

### 4. Keep the current transaction authoring model

Keep the existing `params`, `preview`, `commit`, `invalidates`, `routes`, `scope`, and
`concurrency` model. The current explicit ref-based preview is easier to understand than
the proposed callback inputs, descriptor-aware atomic drafts, `authoritative`, and
`unclaimed` surface.

```ts
export const mutateIncident = flow.transaction({
  id: "incidents.mutate",

  params: ({ memory, event, resources }) => {
    // Select and prepare one concrete mutation attempt.
  },

  preview: {
    apply: ({ params }) => [
      { ref: params.detailRef, replace: params.optimisticIncident },
      { ref: params.listRef, replace: params.optimisticPage },
    ],
  },

  commit: ({ incidentId, patch }) => api.patch(incidentId, patch),
  invalidates: ({ params }) => [params.detailRef, params.listRef],
  routes: {
    success: Incident.E.MutationSucceeded,
    failure: Incident.E.MutationFailed,
  },
  concurrency: "reject-while-running",
});
```

This does not prevent isolated improvements to helper names or types. It prevents a
ground-up replacement before the existing model has a concrete, demonstrated problem.

The `flow.outcomes(...)` identity helper is removed from the target API. Transaction
`routes` accepts its object directly and must provide contextual typing without a public
inference helper. If direct literals expose a typing defect, Flow fixes its transaction
types internally rather than adding a no-op userland wrapper.

### 5. Keep explicit runtime construction

The composable runtime boundary remains explicit. An app is an inert definition with an
explicit stable ID and its modules; the runtime receives that app and the Effect Layer
that implements its service requirements. A raw Layer is not an app and must not be used
to discover root machines indirectly.

```tsx
export const IncidentApp = flow.app({
  id: "incident-console",
  modules: [IncidentsModule, RunbooksModule],
});

const runtime = flow.runtime({
  app: IncidentApp,
  layer: createIncidentServicesLayer(),
});

<FlowProvider runtime={runtime}>
  <IncidentConsole />
</FlowProvider>;
```

The runtime adds Flow's internal services and owns the resulting managed Effect runtime;
the provider only exposes that already-assembled Flow runtime to React. There is no
`app.layer(...)` indirection, global definition registry, or provider-owned service
assembly. When an application has no service requirements it may omit `layer`, which is
equivalent to `Layer.empty`.

### 6. Infer transitive application dependencies

An app, machine, or module should not manually repeat every resource, transaction,
stream, child, and service that is already reachable from its declared root machines.
Flow should infer the transitive graph and diagnose collisions or unreachable
declarations; public views are validated against that graph rather than expanding it.

An independent runtime descriptor that cannot be reached from a root machine is outside
the app contract. A public view may read only the actor facts reachable through its bound
machine graph; it does not add resource, transaction, or service dependencies merely by
mentioning them. Modules do not admit an unreachable descriptor through a generic `roots`
collection merely to make it discoverable, because that would still fail to explain who
orchestrates its work. Fixtures belong to behavior or test contracts, and prefetch or
tooling must operate through explicit app behavior or the inferred app graph.

Flow infers descriptor dependencies from the machine graph and preserves Effect service
requirements in the definitions' `R` types. It does not synthesize service implementations:
the application satisfies those requirements with the explicit runtime Layer, and a
missing service remains a construction error rather than a late activity failure.

### 7. Keep the declarative behavior contract

`behavior.ts` remains a real product surface. It supplies curated journeys for behavior
rendering and evidence diffing, story discovery, deterministic story execution, semantic
coverage, documentation, and agent-facing CLI inspection.

The behavior contract must not restate machine topology or app inventories that Flow can
derive. Its authored responsibility is the information that cannot be inferred: which
journeys matter, how they start, which events occur, and where evidence should be captured.

Flow may report whether a story executed and expose its captured evidence, but it does not
decide whether that evidence is semantically correct. It does not own `describe`, `it`,
`expect`, matchers, retries, or general-purpose test-runner semantics. Vitest or another
runner owns every correctness assertion.

### 8. Define features before finalizing files

File layout follows settled responsibilities and public features. The deleted speculative
reference tree is not an implementation template; production files should be organized
only after their vocabulary, capability, module, behavior, and runtime responsibilities
are concrete.

The testing execution boundary is now settled enough to apply this rule.
`flow.story(...)` is the one surviving public declarative execution framework, so files
dedicated to the legacy `flowTest(...)`, `test(...)`, and `runFlowScenario(...)` executors
are removed after their retained capabilities have moved into the shared story-plan
implementation. Story registration, model-path discovery, runtime-backed execution,
progress control, inspection, and debug formatting remain valid responsibilities even
when their current files or public wrappers do not.

### 9. One vocabulary declares states and events before behavior

Each machine uses one declarative `flow.vocabulary(...)` value as the upfront source of
truth for its identity, state names, event names, and event payload constructors. Initial
state and all transition behavior remain in `flow.machine`, because they describe
behavior rather than vocabulary.

```ts
export const Incident = flow.vocabulary({
  id: "Incidents/Console",

  states: [
    "QUEUE",
    "DETAIL",
    "REFRESHING_DETAIL",
    "STARTING_RUNBOOK",
    "RUNBOOK",
    "REPLACING_RUNBOOK",
  ],

  events: {
    QueueOpened: null,
    IncidentOpened: (incidentId: string) => ({ incidentId }),
    AssignmentRequested: (assignee: string | null) => ({ assignee }),
    StatusChangeRequested: (status: IncidentStatus) => ({ status }),
    RunbookStartRequested: null,
  },
});

export type IncidentState = flow.StateOf<typeof Incident>;
export type IncidentEvent = flow.EventOf<typeof Incident>;
```

State names use `SCREAMING_SNAKE_CASE`; most single-word states therefore read as simple
uppercase names such as `QUEUE` and `DETAIL`. Event names use PascalCase, the TypeScript
identifier form of Title Case. The returned API deliberately uses the compact accessors
`Incident.S.*` and `Incident.E.*`, because every reference is already visibly qualified
by the vocabulary.

The vocabulary's required `id` is its complete, collision-free identity. It is available
as `Incident.id`, supplies the prefix for every member ID, and is inherited unchanged by
the machine. A module may inventory or validate that identity, but app or module assembly
must never rewrite it.

Each event owns its constructor signature. Positional arguments, a payload object, or a
more useful input transformed into the final payload are all valid; they are not
competing global conventions. A zero-payload declaration produces an event constructor
that takes no argument.

### 10. Vocabulary members are first-class Flow tokens

A state is a frozen Flow-owned token. An event is a frozen callable Flow-owned token: it
constructs the event when called and also carries its own identity. Callers should not
need an `idOf` helper or read a `.type` property merely to reference a declaration.

```ts
Incident.S.QUEUE;
Incident.S.QUEUE.kind; // "state"
Incident.S.QUEUE.name; // "QUEUE"
Incident.S.QUEUE.id; // "Incidents/Console/S/QUEUE"

Incident.E.IncidentOpened;
Incident.E.IncidentOpened.kind; // "event"
Incident.E.IncidentOpened.name; // "IncidentOpened"
Incident.E.IncidentOpened.id; // "Incidents/Console/E/IncidentOpened"
Incident.E.IncidentOpened("incident-1");
```

Derived identifiers always include `/S/` or `/E/`, so serialized values and inspection
output identify both the vocabulary member and its kind. Renaming a declaration
intentionally changes its derived identity, preventing the TypeScript name, runtime
event, inspection output, and wire representation from silently drifting apart.

In-process snapshots retain the interned state token, so comparisons use the same
first-class value as machine declarations. Serialization writes the token's string ID;
hydration validates that ID and resolves it back to the vocabulary's existing token.
Unknown IDs are rejected rather than materialized as untrusted token objects.

JavaScript coerces object keys to strings, so tokens are not used directly as record
keys. Once a machine is bound to a vocabulary, its `states` and `on` records use local
names that Flow validates against that vocabulary; targets, emitted events, routes,
capability checks, and snapshot expectations use the tokens themselves.

```ts
const incidentMachine = flow.machine(Incident, (S) => ({
  memory: () => ({ selectedIncidentId: null as string | null }),
  initial: S.QUEUE,

  states: {
    QUEUE: {
      on: {
        IncidentOpened: {
          target: S.DETAIL,
          updateMemory: ({ event }) => ({ selectedIncidentId: event.incidentId }),
        },
      },
    },
    DETAIL: {},
  },
}));
```

### 11. Schema privately implements vocabulary wire boundaries

The vocabulary declaration remains Flow's public source of truth. Internally, Flow
compiles its known state IDs and event IDs into Effect Schemas for exact decoding,
encoding, hydration, replay, CLI input, JSON Schema generation, inspection metadata, and
identity arbitraries used by model-based tests. Tokens remain Flow-owned values rather
than public Schema classes, and internal Schema metadata need not be exposed on them.

This derived Schema can validate an event's known identity and envelope, but it cannot
infer a runtime schema for the payload from a TypeScript constructor return type. Event
payload validation is therefore absent unless a future explicit opt-in mechanism is
designed. Flow must never advertise runtime payload validation merely because it uses
Schema internally.

### 12. A machine receives its vocabulary, then aliases its members in a callback

The public constructor is `flow.machine(Vocabulary, (S, E) => config)`. Supplying the
vocabulary first gives TypeScript a stable state and event universe before it
contextually types the callback and nested configuration. The callback receives the
vocabulary's exact state and event namespaces, so the configuration does not repeatedly
spell `Vocabulary.S.*` and `Vocabulary.E.*`.

```ts
export const incidentMachine = flow.machine(Incident, (S, E) => ({
  initial: S.QUEUE,
  memory: () => ({ selectedIncidentId: null as string | null }),
  states: {
    QUEUE: {
      activities: [
        flow.observe(incidentResource, {
          params: ({ memory }) => [memory.selectedIncidentId],
          outcomes: {
            value: (incident) => E.IncidentChanged(incident),
          },
        }),
      ],
    },
    DETAIL: {},
  },
}));

Incident.id; // "Incidents/Console"
incidentMachine.id; // "Incidents/Console"
```

`S` and `E` are conventions rather than reserved parameter names; userland may call them
`state` and `event` or choose other valid local names. The callback runs once while the
machine definition is created and must remain a pure configuration factory. Its
`states` and `on` records still use readable local names that TypeScript constrains to
the vocabulary, while initial states, targets, emitted events, outcome mappings, and
other token references use `S.*` and `E.*`.

The implementation anchors vocabulary inference to the first argument, using an
overload or `NoInfer` where necessary so the callback cannot widen or redefine it. One
vocabulary defines one machine contract: separate machine definitions require separate
vocabularies and identities, even if some of their state or event names happen to match.

The curried `flow.machine(Incident)({...})` form is not selected because it adds a
builder function without providing a stronger inference boundary. Passing a plain
configuration object as the second argument is also no longer selected because it
forces repeated vocabulary qualification. A `vocabulary` key inside the configuration
is not selected because vocabulary is a dependency of the definition, not machine
behavior.

### 13. Machines may own explicit actor-local memory

Finite state and machine memory are separate dimensions of one actor snapshot. A state
token such as `Incident.S.DETAIL` describes the actor's current behavioral mode; memory
retains the application facts needed across events that cannot be encoded in a finite
state name and are not already owned by a resource, transaction, stream, timer, child,
URL, or other authority.

```ts
export const incidentMachine = flow.machine(Incident, (S) => ({
  memory: () => ({
    selectedIncidentId: null as string | null,
    retryCount: 0,
  }),

  initial: S.QUEUE,

  states: {
    QUEUE: {
      on: {
        IncidentOpened: {
          target: S.DETAIL,
          updateMemory: ({ event }) => ({
            selectedIncidentId: event.incidentId,
          }),
        },
      },
    },
    DETAIL: {},
  },
}));
```

`memory` is optional and creates a fresh value for each actor instance. It is included in
the actor snapshot and its serialized form. Machines with no non-derived actor-local
facts omit it instead of declaring an empty object.

`updateMemory` is the only transition property that changes memory. It receives the
current `memory`, event, and ordinary transition readers, then returns a
`Partial<Memory>`. Flow shallowly merges that patch into the current memory after the
transition is accepted. Nested values are replaced explicitly with ordinary immutable
TypeScript:

```ts
updateMemory: ({ memory, event }) => ({
  form: {
    ...memory.form,
    title: event.title,
  },
});
```

There is no separate `setMemory`, full-replacement operation, Immer draft callback, or
public Zustand-style store setter. Returning every top-level field is still one
`updateMemory` patch with the same shallow-merge semantics. Memory can change only as
part of an accepted machine transition, so guards, receipts, inspection, replay, and
tests retain the causal event.

Memory must not duplicate primitive-owned or derived facts. Selected identity, an
unfinished local draft, retry count, pagination cursor, or wizard answers can be memory;
resource values and loading status, transaction status, stream connectivity, capability
booleans, services, subscriptions, promises, and React element references are not.

### 14. Derive capability from real transition acceptance

The current `capabilitiesFor(state)` table duplicates the machine and can drift from its
transition rules. The UI asks whether the exact event it intends to send is currently
accepted, using the existing boolean `flow.can(snapshot, event)` API as its source of
truth.

For a local control, use the existing `flow.can` API directly:

```tsx
const event = Incident.E.AssignmentRequested(selectedAssignee);

<button disabled={!flow.can(actor.getSnapshot(), event)} onClick={() => actor.send(event)}>
  Assign
</button>;
```

`whyNoTransition(machine, snapshot, event)` remains an inspection API for tools, tests,
and diagnostics. It returns `undefined` when a transition is legal and otherwise returns
structural evidence such as no handler, the event being handled only in other states, a
failed guard candidate, or a microstep-limit failure. It is intentionally not renamed or
wrapped as `flow.whyNot`, and it is not injected into `flow.view`.

A boolean guard cannot provide a truthful human explanation for domain policy. Userland
keeps that copy beside the domain decision that owns the policy, while a pure application
selector may combine the event, `flow.can(...)`, and that domain decision for repeated UI
use. It must not reproduce machine acceptance in a separate capability table. Views
must not duplicate transition policy. Ordinary React reads use the authored `flow.view`
and `useView` boundary settled below; direct resource and transaction hooks are not an
alternative component read path.

### 15. A module is a static definition boundary

`flow.module` remains part of the target API. Its complete core authoring shape is an
`id`, an array of root `machines`, and an array of public `views`:

```ts
export const IncidentsModule = flow.module({
  id: "Incidents",
  machines: [incidentConsoleMachine],
  views: [incidentQueueView, incidentDetailView],
});
```

It has no runtime lifecycle, mutable state, services, or live actor instances.
A machine is a reusable behavioral definition and an actor is a live runtime instance of
that machine; actors therefore belong to the runtime actor graph rather than inside a
module.

Within an app, a module establishes the stable feature ownership of its declared public
machine and view entry points. Inspection, behavior coverage, documentation, and CLI
output can therefore attribute an entry point to one feature without a parallel ownership
table. This preserves an existing Flow capability: current modules already contribute
machine ownership paths and app inventory. The target should tighten that contract by
rejecting ambiguous entry-point ownership when the app graph is constructed rather than
allowing ambiguity to survive until an actor starts, and it must apply ownership
consistently to views as well as machines.

The machines declared directly by a module are its app root machine entry points: they
may be instantiated directly by app runtime composition. A child machine reached through
a root machine's activities is inferred from that machine graph and must not be repeated
in the module. This makes `machines` an intentional public root list rather than a full
inventory that can drift.

The views declared directly by a module are its public read entry points. Each view binds
to one of the module's root machines and may project only facts owned by that actor graph.
Flow infers the view's resource, transaction, stream, child, and service dependencies from
that machine graph rather than requiring a second dependency list on the view. Modules do
not repeat those descriptors and do not accept `roots`, fixtures, screens, permissions,
dependency strings, or arbitrary metadata buckets. Fixtures belong to behavior/test
contracts; permissions belong to domain and transition policy; screens belong to UI or
routing; services belong to app runtime composition.

Feature modules export their machine definitions and authored views, not actor factories,
actor IDs, or lookup helpers. Root actor creation and registration follow from app/module
composition, while explicit dynamic creation remains a runtime operation.

### 16. Machines define behavior, actors execute it, and views project live facts

A machine is a reusable, inert behavior definition. An actor is one stable live instance
of that machine with its own snapshot, memory, mailbox, subscriptions, and supervised
work. Creating ten actors from one machine produces ten independent executions, so a
machine definition can never identify the current facts of an actor.

A view is a reusable pure projection definition bound to exactly one machine definition.
Evaluating it always requires one concrete actor snapshot from that machine, so a view
does not combine independent actors or inspect a module-wide or app-wide live scope. A
module-wide or app-wide aggregate observer is outside this contract; any future proposal
must use a different abstraction and requires a new decision.

A direct React view hook resolves the runtime-owned root actor from context only when the
match is deterministic; it diagnoses zero or multiple matches and never silently selects
an arbitrary instance. A caller that owns a dynamic actor passes that actor explicitly.

### 17. Runtime creates actors synchronously; React only consumes them

Runtime construction must synchronously make every module root actor available with its
initial snapshot. React must never await `runtime.start()`, create a temporary actor
shell, or own actor startup merely because a component mounted. Activities, timers,
resource requests, streams, and other asynchronous work begin under the actor in the
background after synchronous creation; their completion is not part of React startup.

The existing public `runtime.createActor(machine, options?)` function remains the
explicit creation boundary for dynamic actors, isolated tests, and host-controlled
composition:

```ts
const runtime = flow.runtime({ app: IncidentApp, layer: createIncidentServicesLayer() });
const incidentActor = runtime.createActor(incidentConsoleMachine, {
  input: { incidentId },
});
```

`createActor` returns one stable, running actor immediately. Passing that actor to
`useView(actor, view)` or another explicit-actor hook subscribes to exactly that instance
and never creates, replaces, or disposes it. Dynamic actors remain owned by the runtime
or by the parent actor that creates them, not by a consuming React component.

Module root machines need no repeated bootstrap declaration: the runtime synchronously
creates and registers one root actor for each root machine inferred from the app's
modules. `useActor(machine)` is retained only as a synchronous lookup for that
runtime-owned root actor. It accepts no actor ID, startup policy, or restoration options,
and it diagnoses both a missing root and an ambiguous match instead of creating or
selecting an actor. Arbitrary component-authored actor IDs are not part of ordinary React
code.

`useActor(machine)` returns the stable actor handle without subscribing the component to
actor snapshots. This keeps command-only components from rendering on every transition;
focused reactive reads belong to `useView`, while callers that already own a dynamic actor
pass that handle explicitly. Actor lookup and actor observation are separate operations.

Runtime construction creates real actors and their pure initial snapshots synchronously,
then starts Layer acquisition and actor activation in the background. Events sent before
the Layer is ready remain ordered in the actor mailbox and no Effectful activity starts
without its environment. A Layer acquisition defect becomes an actor/runtime issue and is
re-thrown by `FlowProvider` to the nearest React error boundary; Flow does not disguise an
invalid application environment as machine loading state.

While acquisition is pending, React may render the machine's pure initial snapshot; Flow
does not expose a generic runtime `isLoading` flag or suspend the tree. An application that
needs a visible boot mode declares it in the root machine and leaves it when an ordinary
bootstrap activity delivers its typed outcome.

Tests, inspection tools, and SSR hosts may force managed-runtime acquisition through the
runtime's existing Effect execution boundary before observing or rendering. This is
separate from actor creation and does not justify a public `runtime.start()` state machine.
Disposal closes the runtime's root Scope and awaits its finalizers.

This preserves the existing synchronous `runtime.createActor` capability and proposes
automatic synchronous creation and registration for inferred module roots. An awaited
`runtime.start()` and React-owned actor creation are explicitly rejected target APIs.
There is no additional feature-level actor factory or lookup surface beside
`runtime.createActor(machine)` and the deterministic React `useActor(machine)` root lookup.

### 18. React projects machine behavior instead of reconstructing query state

The ordinary React read surface is `flow.view` plus `useView`. `MachineObserver` is the
internal live implementation, not a verbose selector hook or a second public authoring
model. A view returns its authored projection directly; `useView` does not wrap that value
in generic query-style activity and failure metadata. View selection remains outside the
component:

```ts
export const todoListView = flow.view(todoMachine, {
  id: "todos.view.list",
  select: (snapshot) => {
    const todos = snapshot.resources.get(todoList.ref());
    const addTodoAttempt = snapshot.transactions.get(addTodo.ref());

    return {
      state: snapshot.value,
      todos: todos.availability === "value" ? todos.value : [],
      loadStatus: todos.status,
      addStatus: addTodoAttempt.status,
    };
  },
});
```

Meaningful asynchronous UI modes belong in the authored machine vocabulary when they
change behavior. A `LOADING` state may accept only retry or cancellation events, a
`SENDING` state may reject another submission while `flow.run(transaction)` is active,
and a `SENT` state may own a timer that returns to `READY`. React renders those state
tokens instead of asking an observer to infer `isLoading`, `isPending`, `isMutating`, or
`isSuccess` from lower-level work.

Flow does not add predefined `LOADING`, `SENDING`, `SENT`, or `FAILED` states to every
machine. A vocabulary declares one only when the application behaves differently in that
mode; operational conditions that do not affect behavior remain primitive inspection
facts. This avoids both a combinatorial state explosion and a parallel query-state model
beside the machine.

Server values remain resource-owned and transaction mechanics remain transaction-owned;
the machine must not copy them into memory merely to make React reads convenient. A view
is the privileged projection boundary over one full read-only actor snapshot, so it may
select resource values, transaction facts, receipts, issues, children, or other facts that
the actor already owns. It never acquires work or changes those primitive records.

The component receives only the selected view value, not the primitive registries. This
keeps resource and transaction mechanics out of React without adding a second
machine-level `expose` selector that would duplicate the view abstraction, force one public
shape onto a machine, and couple behavior configuration to consumer read models.

Views receive the actor snapshot directly rather than separate instrumented `resources`
and `transactions` reader arguments. Flow may track selection dependencies internally as
an optimization, but dependency tracking does not create public query-observer activity or
give the view responsibility for resource and transaction lifecycle.

A view may combine the machine lifecycle with explicitly selected operation lifecycles.
This does not aggregate generic pending state: the view names which resource operation or
transaction attempt matters to its consumer and projects that primitive-owned fact beside
the machine state. Flow prescribes no `{ state, data, operations }` result shape; the
common convention is that the selected resource or transaction snapshot has `.status`,
and the view's return value remains an ordinary user-authored projection.

`useView` never suspends or throws a resource promise. Machines route resource lookup
success and failure into vocabulary events whenever behavior depends on the outcome, then
enter states such as `READY` or `LOAD_FAILED`. A view calls
`snapshot.resources.require(ref)` only in a state where the machine has established that
the value exists; absence is an invariant violation diagnosed by Flow rather than an
implicit loading protocol. React may still use Suspense for unrelated React-owned async
work, but Flow does not integrate Suspense into actor or view observation.

The React overloads are `useView(view)` for the deterministic runtime-owned root and
`useView(actor, view)` for an explicitly owned dynamic actor. The hook leases
an internal observer that subscribes to the actor, evaluates the authored view against one
atomic snapshot, structurally shares equal arrays and plain objects with the previous
selection, and publishes only when the resulting reference changes by `Object.is`. Opaque
values such as class instances remain identity-compared. Selection equality is an internal
observer concern: neither `flow.view` nor `useView` accepts a comparator or equality
option, so one view cannot acquire different rerender semantics at different call sites.
The observer does not create or dispose the actor, retain a query-result state machine, or
own resource acquisition, invalidation, refresh, cache records, or cache collection.
When a resource or transaction lifecycle changes, the actor publishes the corresponding
new primitive snapshot as part of its next atomic snapshot, the observer reevaluates the
view, and React rerenders only if the selected projection changed. A selected `.status`
therefore participates in ordinary view reactivity without a primitive-specific React
hook.

Cache policy does not move onto a view or hook call. Resource descriptors accept
`staleTime` and `gcTime`, the runtime supplies their defaults, the canonical resource
store enforces them, and machine activities and typed events own ensure, refresh, and
invalidation behavior.

The runtime defaults are `staleTime: 0` and `gcTime: "5 minutes"`. A descriptor override
applies to every ref in that resource family, so two components cannot give the same
canonical value conflicting freshness or retention policies.

`staleTime` starts when a resource value is updated. Expiry marks the retained value
stale but neither removes it nor starts work by itself; the next ensure or an explicit
refresh policy decides whether to fetch. `gcTime` starts only when the last machine owner
releases the ref. Reacquisition cancels collection, and an active or in-flight ref is not
collected. Views and React subscriptions are projections rather than resource owners, so
mounting or unmounting them does not affect either clock. A resource descriptor may
override the runtime defaults because freshness and retention are properties of the
resource family, not of one consumer:

```ts
export const todoDetail = flow.resource({
  id: "todos.detail",
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  // ...
});
```

Focus refresh, reconnect refresh, refetch keys, and imperative `refetch` remain rejected
`useView` options. Host refresh is instead derived from an active `flow.observe(ref)` as
settled above.

`useResource(ref)` is removed from the public React API, and Flow does not introduce a
symmetric `useTransaction(...)` hook. Either hook would expose primitive runtime truth
beside the actor-consistent public snapshot projected by a view and give components a
second way to reconstruct machine behavior. Resource and transaction truth remains
available to machine orchestration, authored views, runtime inspection, tests, and
non-React infrastructure; normal components read authored views and send typed machine
events:

```tsx
const actor = useActor(incidentConsoleMachine);
const detail = useView(incidentDetailView);

actor.send(Incident.E.IncidentRefreshRequested());
```

Views do not receive injected `can` or `whyNot` helpers. A view that needs a reusable
capability projection calls the settled `flow.can(snapshot, event)` API with the exact
event, while structural rejection evidence remains in inspection tools and domain policy
continues to own human-facing rejection copy.

### 19. Register ordinary story plans at one app gateway

`flow.story({ app, machine })` is the only public declarative plan builder. Every chain is
an immutable, typed story plan whether it is defined inline in a test file, imported by a
test, or registered as public application behavior. Flow does not retain a separate
`flow.stories(...)` collection abstraction or the older `{ seed, start, events,
expectedState, expectedFacts }` story object language.

`flow.behavior({ stories })` is the single application-level discovery gateway. Each story
already carries its app definition, and the keyed `stories` record supplies the curated
journeys that cannot be inferred. The behavior validates that its stories share one app,
then exposes that app's inferred graph, services, and modules beside the registry.
Documentation, CLI discovery and execution, semantic coverage, and host-runner tests
consume this same gateway. An unregistered story remains private test input and is not
presented as supported product behavior.

Each key in `behavior.stories` is the story's stable external identity within that
behavior. It addresses CLI commands, documentation URLs, reports, filtering, and semantic
coverage independently of the TypeScript variable name, and duplicate keys are rejected.
The gateway does not own a separate fixture registry: each story plan directly retains its
imported `flow.fixture(...)` definitions through its ordinary plan inputs. Flow does not
add fixture-ID lookup, story-specific binding, interpolation, or expression languages.

`flow.story({ app, machine })` binds both the application definition and target machine to
the plan, and validates that the machine belongs to the app graph. The story exposes the
sole public `.run()` execution method. Each call creates a fresh runtime from the story's
app, installs the test store, test orchestrators, Effect `TestClock`, and the story's
fixtures, then executes the plan under one managed scope. Every application Layer used by
a story belongs inside a `flow.fixture(...)`. The caller never
supplies a prebuilt mutable runtime. Registration never changes story execution;
`story.run()` behaves identically before and after the story is added to a behavior.

The initial story object may also contain optional immutable `title`, `description`, and
`tags` for documentation and filtering. These fields never affect execution. The key such
as `"assign-incident"` in `flow.behavior({ stories })` remains the registered story's stable
external identity; an unregistered private story needs no invented key.

Registered stories remain expectation-free. They capture named checkpoint evidence but do
not add expected-state fields, expected-fact fields, assertion callbacks, or another
portable matcher vocabulary. Behavior tooling may execute stories, render or diff their
captured evidence, and measure the machine graph they traverse. A consuming Vitest or other
host-runner test imports the story and asserts correctness from the returned checkpoints.

```ts
import { openIncident, openIncidentFixture } from "./fixtures";

export const assignIncident = flow
  .story({ app: IncidentApp, machine: incidentConsoleMachine })
  .with({ fixtures: [openIncidentFixture] })
  .send(Incident.E.IncidentOpened(openIncident.id))
  .checkpoint("opened")
  .send(Incident.E.AssignmentRequested("Avery"))
  .checkpoint("assigned");

export const IncidentBehavior = flow.behavior({
  stories: {
    "assign-incident": assignIncident,
  },
});
```

### 20. Stories, rehydration, and model paths execute through one lazy runner

Flow has one public declarative execution model. `flow.story({ app, machine })` creates an
immutable lazy plan; builder calls append typed commands and acquire no runtime, actor,
Effect scope, service, or clock until `story.run()` executes the plan. Private test stories,
registered product stories, rehydrated starts, and generated model paths may have different
typed inputs, but they compile to this same plan and run through the same executor, progress
rules, capture logic, diagnostics, and disposal path.

App ownership, fixtures, the selected start mode, and a model-generated event path are
plan inputs or start configuration. Resource seeds, controlled endpoints, and application
Layers are all capabilities of those fixtures rather than parallel `.with(...)` inputs.
They must not create
separate harness families. Model discovery may remain a separate pure graph operation, but
replaying a discovered path compiles its events into the ordinary story plan. A direct
runtime-backed actor remains useful inside low-level library parity and lifecycle tests,
but it is an implementation seam rather than a second recommended userland framework.

`flow.story(...)` is the implementation and public API that survives consolidation. It
retains typed machine binding, fixture definitions, seeded resources, application Layers,
initial machine input, Effect `TestClock` progress, rehydrated starts, and model-path
input. Seeds and Layers survive as fixture capabilities, not direct story-plan inputs.
Existing focused, app-scenario, rehydration, and model execution
branches are replaced by normalization into the common plan rather than preserved as
separate builders. Flow exports no `test(...)` builder; Vitest or another host runner owns
the test-case vocabulary and may execute an inline or imported story plan.

A story plan is always one immutable linear command sequence. It does not contain runtime
branches, loops, predicates, promises, or callbacks. Conditional application behavior
belongs in machine guards and transitions, while tables, property generation, and model
exploration produce several independent linear plans before execution. Ordinary TypeScript
may map values into plans or use pure helpers that append commands while authoring; those
generation-time functions are not stored in the plan and never inspect or mutate a live
actor. This keeps every checkpoint and partial execution prefix inspectable before a run.

Every `story.run()` installs one fresh Effect `TestClock` into the same managed
runtime that owns the machine, resources, transactions, activities, and timers. This
preserves the current `test(...)` implementation's real ownership: `testing/test.ts`
already installs `TestClock.layer()`, while the existing progress controls drive that
runtime with `TestClock.adjust(...)`. The consolidated story runner reuses those mechanisms
rather than adding a Flow clock or scheduler.

The clock starts at Effect's default epoch zero. `advance(duration)` records a command that
delegates to `TestClock.adjust(duration)`, and `setTime(input)` delegates to
`TestClock.setTime(input)`; next-timer advancement also adjusts this same clock. Machine
timers, `Effect.sleep`, schedules, retries, resources, and transactions therefore observe
one time source. `.with(...)` has no clock field, fixtures cannot replace the runtime Clock,
and the legacy custom `clock: () => number` offset layer is removed during consolidation.

Progress commands keep current-time work and future-time movement separate. `flush()`
drains ready work without waiting for external completion or moving `TestClock`. `settle()`
may repeatedly flush and wait for finite work that can complete at the current clock time,
but it never advances to a future timer. `advance(duration)` explicitly adjusts the clock
by that duration and then flushes work made ready at or before the new time.
`advanceToNextTimer()` explicitly jumps to the next timer deadline and then flushes; timers
sharing that deadline follow Effect `TestClock` ordering.

No progress command silently composes another future-time jump. In particular, the current
settling loop that repeatedly adjusts to `pending.nextAfterMillis` is removed, because it
can skip observable machine states such as `SENT` before a checkpoint captures them. Future
timers remain visible in `pendingWork` until the authored plan advances time.

Every looping progress command has one deterministic scheduler-turn bound. The default is
`maxTurns: 100`, and a story may replace it only once through
`.with({ progress: { maxTurns } })`; individual `flush`, `settle`, `advance`, and
`advanceToNextTimer` commands do not accept different bounds. A turn drains currently ready
root and child work, yields through Effect and the JavaScript microtask queue once, then
rechecks pending work. The bound resets for each progress command. `flush()` uses it while
draining ready mailboxes, `settle()` uses it while waiting for current-time finite work, and
the two explicit time-advancement commands use it for the flush after moving `TestClock`.
Exhaustion throws a structured story-execution diagnostic containing the command, turn
bound, completed checkpoints, current evidence, and exact pending work.

`settle()` uses primitive lifetimes rather than the current aggregate `activeFibers`
count. It drains ready root and child mailboxes and waits for active one-shot resource
lookup generations and transaction executions. The current finite lookup attempt started
under a continuing `flow.observe` also counts, but the observation ownership does not
remain blocking after that attempt settles.

Open observations, stream subscriptions, active child actors, and future timers are
continuing supervised work and do not prevent settlement. Emissions, child events, or timer
events that are already ready still drain through the mailbox rule. A finite lookup or
transaction waiting for a later controlled `.perform(...)` command cannot be declared
settled; reaching the progress bound produces a structured diagnostic identifying that
generation rather than hanging or ignoring it.

`pendingWork` must therefore expose active finite resource lookup generations through a
`lookups` inventory, separately from continuing observations, and retain transaction ref
and generation identities. Its mailbox, observation, timer, stream, and child inventories
remain diagnostic evidence. The aggregate `activeFibers` count and public `maxFibers` bound
are removed: concurrency width does not identify unfinished work, and a valid story must
not fail merely because it owns many continuing fibers. Settlement succeeds exactly when
ready mailboxes, active finite lookup generations, and transaction generations are empty
at the current clock time.

Story start configuration is one discriminated union with three mutually exclusive modes:

```ts
type StoryStart<Input, Memory, Snapshot> =
  | {
      readonly kind: "fresh";
      readonly input?: Input;
      readonly memory?: Partial<Memory>;
    }
  | { readonly kind: "snapshot"; readonly snapshot: Snapshot }
  | {
      readonly kind: "boot";
      readonly payload: FlowRuntimeBootPayload;
      readonly actorId?: string;
    };
```

Omitting `start` is equivalent to `fresh` with the machine's declared initial input and
memory. App root machines require `Input = void`; dynamic and isolated actors may require
typed input, which is consumed only while producing their initial memory. A
`snapshot` start restores exactly the supplied actor snapshot. A `boot` start hydrates the
complete runtime payload and selects the actor snapshot from that payload; the caller never
also passes an extracted snapshot. `actorId` may be omitted only when the payload contains
one compatible actor, while ambiguous or missing selection produces a structured execution
diagnostic. Boot payload, snapshot, and fresh-memory overrides cannot be combined.

The legacy `flowTest(...)` public API, `runFlowScenario(...)`,
`runFlowScenarioWithDiagnostics(...)`, and their dedicated executor and overload families
are deleted after migration. The current `test.app(app).scenario(machine)`,
`test.rehydrate(...)`, and app-specific rehydration entry points also do not survive as
independent execution shapes. App ownership is required in the story's initial
`{ app, machine }` binding rather than supplied later through `.with(...)` or `run()`. The
settled `start` union owns actor initialization in every story form.

Pure model exploration accepts an inert base story through `flow.model(baseStory)`. It
preserves the current shortest-path and simple-path algorithms and traversal options for
explicit or snapshot-derived event candidates, event filtering, source and target state
selection, depth and result limits, duplicate-path policy, and custom state and event
serialization. Discovery evaluates only pure transition, guard, redirect, and memory
logic; it never executes a resource lookup, transaction commit, Effect, or synthesized
success route. Asynchronous outcomes enter a model only as explicitly authored candidate
events, while `path.story` provides the live runtime proof.

Each discovered path preserves its predicted final snapshot, per-step event and snapshot
data, issues and issue summaries, weight, and description. It also exposes `path.story`, an
ordinary immutable story plan formed by extending the base story with the discovered event
commands in order. Base-story start configuration and fixtures therefore carry their
resource seeds and Layers into live execution without another replay configuration surface.

The model descriptor's separate `replay(path)` and `replayFlushed(path)` methods are
removed. `path.story.run()` performs the former live-runtime proof, while
`path.story.flush().run()` performs the latter and keeps the ready-work boundary visible in
the plan. The removed replay-only `provide` option moves to the base story's fixtures,
and its custom clock option is already superseded by the story's shared Effect
`TestClock` commands. Model replay returns the same checkpoints, final evidence,
diagnostics, and disposal guarantees as every authored story.

Consolidation preserves the useful capabilities beneath those APIs: deterministic ready
work, `flush`, bounded settling, explicit virtual-time advancement, next-timer advancement,
pending-work diagnostics, typed app fixtures, resource seeding, Layers, boot and snapshot
restoration, actor selection, serialization for restoration proofs, resource and
transaction lifecycle inspection, receipts, issues, traces, children, timers, streams,
story metadata and tags, execution diagnostics, partial failure evidence, CLI evidence, and
pure model-path discovery. These capabilities
become plan inputs, commands, checkpoint projections, run output, or pure discovery tools;
they do not justify another harness.

Deterministic external outcomes are controlled at the dependency boundary. A controlled
Effect service call or stream subscription may expose typed inert commands for success,
typed failure, emitted value, completion, or externally caused interruption. Executing one
of those commands delivers the outcome to the real resource lookup, transaction commit,
stream, or other activity that is awaiting that dependency. Flow then performs its normal
lifecycle publication, optimistic commit or rollback, invalidation, receipt creation, and
outcome routing.

A story-plan command must never assign a resource or transaction status, replace a primitive
snapshot, or fabricate a primitive receipt directly. Those are the facts under test, so
mutating them would bypass the behavior the test claims to prove. Raw `Deferred` mutation,
stream emission, arbitrary callback execution, or arbitrary Effect execution outside the
plan is not the final userland control model; controlled fixtures provide their Layer or
stream implementation and typed command constructors to the plan. The settled command is
`perform(controlCommand)`, with primitive-specific constructors defined below.

Each controlled Effect endpoint assigns a zero-based ordinal when an invocation actually
starts, scoped to that endpoint and one test run. Its inert `call(index)` ref may be created
while the plan is authored and later addresses exactly that invocation. Repeated calls with
identical parameters remain distinct, so a race test may complete `call(1)` before
`call(0)` without relying on “latest” or “next pending” semantics. Controlled streams use
the same convention through endpoint-local `subscription(index)` refs. All ordinals reset
for each independent run.

A control command never waits for its target implicitly. When execution reaches the
command, an invocation or subscription with that exact ordinal must already be active. A
target that has not started, never existed, or has already terminated produces an immediate
test-execution diagnostic containing the endpoint identity, requested ordinal, observed
invocations, and current pending-work facts. The author must explicitly `flush`, settle, or
advance time before the command when progress is required to create its target.

The plan builder records every controlled outcome through one
`perform(controlCommand)` method. The method accepts only a branded inert control command;
callbacks, promises, arbitrary Effects, and unbranded values are rejected. Calling
`perform` appends the command and does not execute it before `story.run()`.

The controlled endpoint owns its primitive-specific outcome constructors. A finite Effect
call ref exposes `succeed(value)`, typed `fail(error)`, `die(defect)`, and `interrupt()`.
A stream subscription ref exposes `emit(value)`, `complete()`, typed `fail(error)`,
`die(defect)`, and `interrupt()`. Constructors that cannot occur for the endpoint are absent;
for example, `fail` is unavailable when its typed error is `never`. This keeps the plan
vocabulary small: `send` supplies machine input, `perform` supplies controlled external
input, progress commands move execution, and `checkpoint` captures evidence.

Flow supplies generic `flow.control.effect(...)` and
`flow.control.stream(...)` endpoint definitions. They own typed invocation or subscription
tracking, ordinal refs, inert outcome commands, and execution diagnostics. They do not
declare, generate, or mock an application's Effect service interface.

An Effect endpoint declares its argument tuple, success value, and typed error channels:

```ts
const addTodoCall = flow.control.effect<readonly [title: string], Todo, TodoApiFailure>({
  id: "TodoApi.add",
});
```

A fixture lists those immutable definitions once and receives a run-local `control`
adapter while constructing its application Layer. `control.effect(endpoint)` returns the
typed service function backed by that run's endpoint instance. The same definition remains
the authoring handle for `addTodoCall.call(0).succeed(todo)` and other inert outcome
commands, so Layer installation and `perform(...)` cannot accidentally address different
controllers:

```ts
const todoApiFixture = flow.fixture({
  id: "todos.fixture.api",
  controls: [listTodosCall, addTodoCall],
  layer: ({ control }) =>
    Layer.succeed(
      TodoApi,
      TodoApi.of({
        list: control.effect(listTodosCall),
        add: control.effect(addTodoCall),
      }),
    ),
});
```

Application test code assembles the controlled endpoint implementations into an ordinary
Effect Layer for its existing service, just as it assembles any other test service Layer.
The resource lookup, transaction commit, or activity continues to depend on the
application-owned service rather than a Flow-generated mock API. This keeps service
structure and dependency policy in userland while removing handwritten `Deferred`, promise,
and controlled-stream machinery from individual tests. The `flow.fixture(...)` definition
below owns both per-run endpoint instantiation and Layer registration through one story
input.

Controlled endpoints are immutable definitions rather than mutable controller singletons.
A reusable control-fixture definition contains their stable IDs and types plus an
application-authored Layer factory. Each story run creates fresh endpoint instances, resets
every endpoint-local ordinal to zero, builds the Layer against those instances, and
registers those same instances for `perform(...)`. Replaying one plan or executing it
concurrently therefore cannot share invocation logs, pending completions, subscriptions,
or cancellation state.

The control-fixture definition is supplied once. Userland must not separately provide a
Layer that closes over one controller and then register a second controller list with the
runner, because those two paths can silently refer to different state. Stable call and
subscription refs authored from the immutable definition resolve to the current run-local
instances only while that run executes.

`flow.fixture(...)` is the one reusable story-setup abstraction. Its immutable definition
has a stable ID and may supply seeded resources, an ordinary Layer or Layer factory,
generic controlled Effect or stream endpoints, or any combination of those capabilities.
The runner instantiates the complete fixture once per run, so its resource seeds, Layer,
and controlled commands belong to the same isolated execution.

Story plans install fixture definitions through one `with({ fixtures: [...] })` input. The
resource-only module fixture convention and a separate public “control fixture” concept do
not survive. A fixture that only seeds resources remains small, while a fixture that owns
controlled dependencies also assembles their application Layer. Fresh-memory overrides,
persisted boot data, and explicit starting snapshots remain variants of the story's
`start` input rather than fixture contents because they select the execution being tested
rather than its reusable environment.

Each story plan owns its fixture dependencies through direct definition references in the
same `with({ fixtures: [...] })` plan input. A fixture's stable ID supports diagnostics,
deduplication, and evidence identity; it is not a string lookup key authored into a story.
Shared fixtures are ordinary exported definitions imported by every story or test that
uses them. Loading `flow.behavior({ stories })` therefore reaches each story's fixture
definitions transitively, so CLI and documentation consumers do not need a second fixture
inventory. The app and behavior gateway remain free of test-environment registration.

The final public story framework does not expose a live mutable actor through `state()`,
`context()`, `getSnapshot()`, registry reader methods, `runtime`, or `actor`. Tests capture
immutable evidence at explicit checkpoints and perform host-runner assertions afterward.
Package-owned runtime parity tests may use a non-exported direct executor seam when the
runtime boundary itself is under test.

The procedural `until`, `untilState`, `untilReceipt`, and `untilIssue` methods are not
carried forward as four public waiting APIs. Their userland cases move to explicit
controlled-dependency commands, `flush`, bounded settling, or virtual-time advancement. If
an irreducible waiting feature is demonstrated later, it must be one bounded plan command
rather than arbitrary live-harness predicates. `advanceUntilIdle` is also removed because
callers must choose explicitly between draining ready work and bounded settling.

Test-only `retryTransaction` and `resetTransaction` are removed from the public framework;
userland tests send the same typed machine events as production, while primitive-level
tests use the internal seam. `trace` and `captureTrace` collapse into one checkpoint or run
projection. Passing events to the execution boundary is removed because events belong in
the visible plan before execution. Product issues remain in checkpoint and final evidence,
while a broken execution carries its diagnostic and partial evidence on the thrown
`FlowStoryExecutionError`. There is no separate diagnostic runner, and scenario report and
evidence wrappers are folded into those two results.
Flow does not evaluate portable semantic expectations for behavior or CLI status; Vitest
or another host runner owns all matcher semantics and pass/fail decisions.

`story.run()` is the only operation that acquires the runtime, actor, Effect scope, and test
clock. It owns disposal in a `finally` boundary on success, assertion-independent domain
failure, interruption, bounded-progress failure, internal error, or cancellation. The
returned value is immutable captured evidence, never a still-running harness.

The return-versus-throw boundary follows plan execution rather than application outcome.
`story.run()` returns normally whenever every authored command executed and Flow captured
the resulting product facts, including typed resource or transaction failure, a primitive
interruption, or a defect that Flow contained and published through ordinary issues and
snapshots. The returned `story-run` value has `checkpoints` and `final`; it has no
`success`, `domain-failure`, `defect`, `interruption`, `blocked`, or `internal-error` status,
because only the host runner can decide whether the captured product outcome is expected.

`story.run()` throws `FlowStoryExecutionError` when the plan cannot execute as authored:
invalid app, machine, fixture, or start input; unresolved boot actor selection; a controlled
command whose exact target is not active; exhausted progress; escaped runner or
infrastructure failure; cancellation; or disposal failure. Former blocked and internal
error result variants are therefore execution diagnostics rather than returned story
statuses. The error identifies the `prepare`, `command`, or `dispose` phase, the command and
zero-based command index when applicable, and the primary cause.

When failure or cancellation occurs after actor creation, the runner captures an
`atFailure` observation immediately before disposal through the same three-root capture used
by checkpoints. The thrown error retains every checkpoint already executed plus that
observation. When all commands finish but disposal fails, the error instead retains the
ordinary pre-disposal `final` observation. If execution and disposal both fail, the error
retains both causes and reports cleanup as failed rather than hiding either failure.

Cancellation stops later plan commands but does not make cleanup abortable. The runner
awaits runtime disposal before rejecting, because returning an error that claims cleanup
completed while finalizers still run would make later tests race leaked work. A successful
`run()` therefore implies disposal completed; a disposal failure always throws. Host-level
termination may still prevent any result from being returned, but Flow does not represent
that unknowable state as successful cleanup.

The public result and error evidence follow this shape, with checkpoint names accumulated
as literal keys by the builder:

```ts
type StoryObservation = Readonly<{
  readonly snapshot: FlowActorSnapshot;
  readonly pendingWork: FlowPendingWork;
  readonly now: number;
}>;

type StoryRun<CheckpointName extends string> = Readonly<{
  readonly kind: "story-run";
  readonly checkpoints: Readonly<Record<CheckpointName, StoryObservation>>;
  readonly final: StoryObservation;
}>;

type StoryExecutionEvidence = Readonly<{
  readonly checkpoints: Readonly<Record<string, StoryObservation>>;
  readonly atFailure?: StoryObservation;
  readonly final?: StoryObservation;
}>;

type StoryCleanup =
  | Readonly<{ readonly status: "complete" }>
  | Readonly<{ readonly status: "failed"; readonly cause: unknown }>;

class FlowStoryExecutionError extends Error {
  readonly phase: "prepare" | "command" | "dispose";
  readonly commandIndex?: number;
  readonly command?: StoryCommand;
  readonly evidence: StoryExecutionEvidence;
  readonly cleanup: StoryCleanup;
  readonly cause: unknown;
}
```

`atFailure` and `final` are mutually exclusive. `atFailure` means the command sequence did
not complete; `final` on an error means every command completed but disposal failed. A
prepare failure before actor creation may have neither, while still retaining any setup
diagnostic and cleanup result that exist.

`checkpoint(name)` appends an immediate, read-only capture command. When execution reaches
that command, the runner records one actor-consistent observation under that unique name
and continues; it never implicitly sends an event, flushes ready work, settles effects,
advances virtual time, or resolves a controlled dependency. A test that needs progress
must request that progress explicitly before the checkpoint. `story.run()` returns
immutable structured output with checkpoints addressable by name, while preserving their
execution order for reporting.

Every checkpoint captures exactly three frozen roots at that command boundary:

- `snapshot` is the complete public actor snapshot, including state, memory, resource and
  transaction snapshots, streams, timers, children, receipts, and issues.
- `pendingWork` records the runtime work inventory at that boundary.
- `now` records the virtual test-clock time used to interpret timers and deadlines.

Typed resource, transaction, receipt, issue, trace, child, timer, stream, and authored-view
readers are pure projections over those three captured roots. They do not consult the live
actor or copy another independently mutable registry into the checkpoint. Duplicate
checkpoint names are rejected while the immutable plan is built. Literal checkpoint names
are accumulated into the result type when TypeScript can preserve them, so a literal
`checkpoint("pending")` produces a typed `run.checkpoints.pending` entry.

Every completed plan that created an actor captures `run.final` through the same three-root
mechanism after the last executed command and before disposal. `final` is not an implicit
named checkpoint and cannot collide with user-authored checkpoint names. Disposal creates
and publishes a new disposed actor snapshot rather than mutating the captured one, so
cleanup receipts and cleanup-triggered interruptions do not enter `final`. Earlier
checkpoints, `atFailure`, and `final` retain immutable published snapshots and copied root
collections; late primitive completions can only attempt a new runtime publication and
cannot mutate captured evidence.

Flow does not own matcher semantics. A checkpoint records evidence but does not contain an
`expect`, assertion callback, or pass/fail decision. Vitest or another runner performs its
ordinary matcher calls after `story.run()` returns, which restores builder locality
without coupling Flow to one test framework:

```ts
const addTodo = flow
  .story({ app: TodoApp, machine: todoMachine })
  .send(Todo.E.AddRequested("Write the testing guide"))
  .checkpoint("after-add");

const run = await addTodo.run();

expect(run.checkpoints["after-add"].snapshot.value).toBe(Todo.S.READY);
```

`checkpoint` is deliberately not named `snapshot`, because machine and actor snapshots
are already domain values in Flow. It is not named `commit`, because transactions already
commit external work. A checkpoint is a story-plan command that captures selected public
evidence at one execution boundary.

### 21. Effect owns execution mechanics; Flow owns machine semantics

The remaining runtime questions are implementation decisions, but they still need a
correctness contract. Flow should use Effect for service acquisition, lifetime,
concurrency, time, and typed failure mechanics. Flow should own the concepts Effect does
not provide: vocabulary tokens, transition stabilization, activity reconciliation,
resource and transaction snapshots, actor publication, receipts, and story commands.
Wrapping an Effect primitive is justified only when the wrapper adds one of those Flow
semantics.

#### Runtime, application graph, and identity

`flow.runtime({ app, layer })` builds one Effect `ManagedRuntime` from Flow's internal
Layer merged with the application's Layer. `ManagedRuntime` is the host bridge because it
acquires the Layer lazily, caches the resulting Context, forks fibers into one owned
Scope, and disposes the whole graph through that Scope. Flow must not reproduce Layer
memoization, environment provisioning, or finalizer execution in custom registries.

The app graph is compiled before runtime work starts. `flow.app({ id, modules })` requires
an explicit collision-free app ID. A root actor ID is derived from the app ID and machine
ID, not from a module property name or module position, so reorganizing a module does not
silently change persisted identity. The same root machine may be owned by only one module
in an app; distinct descriptor definitions with the same ID are rejected app-wide, while
one shared descriptor definition may be reachable from several machine graphs.

Module machines are public roots and therefore require `Input = void`. Reusable machines
may declare typed actor input; `runtime.createActor(machine, { input, id? })`, child
activities, and fresh stories provide it when creating an instance. The machine's pure
memory initializer receives `{ input }`. Snapshots and boot payloads retain the resulting
memory rather than replaying input during restoration.

An omitted dynamic actor ID produces a runtime-local opaque ID and is suitable only for an
ephemeral actor. A dynamic actor that must survive boot restoration requires either an
explicit stable host ID or a stable parent-child activity key. App root IDs use
`${app.id}/root/${machine.id}` and never depend on allocation order.

In-process refs retain their descriptor definition privately. Serialized refs resolve
through the compiled app graph by descriptor ID. There is no process-global descriptor or
app registry, which keeps two runtimes and hot-reloaded definitions from resolving through
each other's mutable state.

All resource and transaction ref inputs use one canonical key domain: `null`, strings,
booleans, finite numbers, readonly arrays of canonical keys, and readonly string-keyed
records of canonical keys. Record keys are sorted during encoding. `undefined`, bigint,
symbols, functions, class instances, cycles, and non-finite numbers are rejected, so ref
equality, persistence, inspection, and CLI addressing cannot disagree.

Calling an event token produces a frozen plain object whose `type` is the token's full
`/.../E/...` ID and whose payload fields are the constructor result. The runtime validates
the Flow-owned identity envelope and maps it to the vocabulary-local `on` key; it does not
invent a second runtime event shape or claim to validate erased domain payload types.

Runtime construction synchronously creates every root actor and its pure initial snapshot.
It then starts managed Layer acquisition and activates the stabilized initial configuration
when the environment is available. A per-actor Effect `Queue` preserves events received in
the meantime. This is one real actor with delayed activation, not a temporary React shell.

#### Actor execution and activity reconciliation

Each actor has one mailbox consumer and one snapshot publisher, so an accepted event,
redirect chain, memory update, and activity reconciliation form one serialized turn. Flow
follows redirects before starting work and fails with a structured issue after 100
microsteps. Intermediate redirect steps remain receipts and inspection facts, but only the
final stabilized configuration owns activities and timers.

An active binding is identified by its activity kind, declared descriptor or timer key, and
resolved primitive ref or child input. Re-entering a configuration with the same binding
retains its work; changing the resolved identity releases the old binding and acquires a
new one. Two bindings that resolve to the same identity in one stabilized configuration are
rejected because two outcome maps cannot truthfully own one execution.

Every active binding owns a child `Scope`. Activity acquisition runs in declaration order,
while the Scope's sequential close runs finalizers in reverse order. Keyed replaceable work
uses `FiberMap`; independent concurrent attempts use `FiberSet`; serialized transaction
attempts use an Effect `Queue`. Timers use `Clock.sleep` in scoped keyed fibers. Child
actors and continuing streams live in their binding scopes, so state reconciliation and
runtime disposal use the same interruption and finalization path.

Typed failures remain ordinary primitive outcomes and may route vocabulary events. A defect
is recorded with its full `Cause` as an issue and primitive defect status where that status
exists; it does not prevent independent bindings from activating. A finalizer defect is a
cleanup issue and receipt, and never rolls back a transition that was already accepted.
Planned scope release does not synthesize an activity interruption outcome, because leaving
a state is not an external failure.

#### One atomic actor snapshot and one React read path

The public actor snapshot is the single immutable publication boundary. It contains the
state token, memory, typed resource and transaction registries, streams, timers, children,
receipts, and issues from the same actor turn. Inspection may retain richer history, while
`pendingWork` remains a separate live-execution inventory used by stories and tooling.

Resource and transaction registries are typed immutable readers rather than exposed
mutable records. `snapshot.resources.get(ref)` and
`snapshot.transactions.get(ref)` always return a primitive snapshot, using the primitive's
idle snapshot when the actor has no retained record. `snapshot.resources.require(ref)`
returns the canonical value only when availability is `value`; otherwise it throws a Flow
invariant diagnostic. Registry serialization and enumeration exist for persistence and
tooling, not as an alternate component API.

An internal `MachineObserver` subscribes to actor publications, evaluates one authored
view, structurally shares arrays and plain objects, and exposes the synchronous store
contract required by React's `useSyncExternalStore`. Neither the observer nor React owns
the actor or any primitive lifetime. A selector defect or failed `require` reaches the
nearest React error boundary. SSR reads the same prepared or hydrated actor snapshot
through `getServerSnapshot`; Flow does not add a promise-throwing Suspense protocol.

#### Resource ownership, freshness, and collection

The canonical resource store should use Effect `RcMap` as its entry-lifetime substrate.
An activity or in-flight operation acquires the entry under its Scope with `RcMap.get`;
the last machine owner releasing it starts `idleTimeToLive`, which is Flow's `gcTime`, and
reacquisition cancels collection. A view, `MachineObserver`, or passive actor projection
does not acquire an `RcMap` lease, so React mount count cannot affect cache lifetime.

`RcMap` owns only reference counting, scoped release, and the idle clock. Each mapped
`ResourceEntry` remains Flow-owned and stores the immutable resource snapshot, update time,
freshness, invalidation, passive actor listeners, and current lookup generation. Effect
`Cache` and `Resource` are not used as the public resource model: `Cache` ties expiry to
lookup caching rather than machine ownership, while `Resource` models a refreshable scoped
value rather than Flow's ref-addressed snapshot and outcome routing.

The store's mutable kernel is one Effect `Ref` containing immutable entry records;
`Ref.modify` makes a multi-ref preview, rollback, hydration, or invalidation one atomic
state change. Network Effects run outside that modify and return commands guarded by their
generation. After a successful modify, an internal `PubSub` announces the changed refs;
actors enqueue that notice and re-read current records before publishing their own atomic
snapshot. `RcMap` finalizers remove collected records through the same modify path, so
collection cannot race a preview or lookup into a half-written store.

Freshness uses Effect `Clock`; a scoped `Clock.sleep(staleTime)` publishes `stale` without
starting work. Invalidating a ref marks it stale and may let an active observation refresh
it, but must not call `RcMap.invalidate`, because that Effect operation destroys the entry.
Lookup generations use `FiberMap` so replacement interrupts the old fiber and an old
completion cannot publish over the current generation. Because an uninterruptible external
effect may still finish, every completion also compares its generation immediately before
publication. `TestClock` therefore controls freshness, collection, retries, and machine
timers through the same time source.

Placeholder data is a descriptor-owned projection used only when no canonical value exists
and a lookup is active. It is marked `isPlaceholderData`, is never persisted or written to
the canonical entry, never produces a value/success outcome, and disappears when that
lookup settles. A stale canonical value remains canonical data and is never replaced by a
placeholder.

Hydration restores canonical values and their original `updatedAt`, then recomputes
freshness immediately from the runtime Clock. An unowned restored entry receives one fresh
full `gcTime` after root ownership has been reconstructed rather than resuming an idle
countdown from the previous process. An actor that has observed a ref may keep projecting
its entry without owning it until `RcMap` collects the entry; collection publishes the
primitive's idle snapshot.

An in-flight lookup is not resumed from serialized execution state. Hydration keeps any
last canonical value, removes placeholder data, records the interrupted generation, and
derives idle or stale/fresh status from the retained value. Reconstructed `ensure`,
`observe`, or `refresh` activities then decide through ordinary policy whether a new lookup
is required.

#### Transaction identity, concurrency, and restoration

For `key: (params) => keyInput`, TypeScript infers `transaction.ref(keyInput)` from the key
function's return type. Flow canonicalizes the descriptor ID plus that value once and uses
the same ref for execution, views, receipts, and persistence. Invalid or non-canonicalizable
keys fail synchronously with a Flow diagnostic; pure key validation may use Effect `Result`
internally without making it a domain authoring requirement.

The actor registry publishes only the latest generation for each transaction ref. Attempt
and generation history belongs in receipts and `pendingWork`. `cancel-previous` uses keyed
fiber replacement, parallel modes use a scoped `FiberSet`, and serialize modes use a
per-concurrency-key `Queue`; `Scope` groups cleanup but is not observable identity. A
terminal status remains until another generation for that ref starts or the actor is
disposed. Production retry and reset are typed machine events that start a new generation,
not generic actor methods.

Every transaction completion checks actor ID, ref, and generation before changing the
actor-visible transaction snapshot or routing an event. Interruption is a cancellation
request rather than proof that the external system did nothing, so an uninterruptible stale
completion may be retained in inspection but cannot publish into current actor state.

Optimistic previews are an ordered Flow-owned overlay ledger on each resource entry. A
layer is identified by actor ID, transaction ref, generation, and a store-wide order; the
published resource snapshot is the authoritative base with active layers replayed over it.
Applying a transaction's multi-ref preview is atomic. Failure or interruption removes that
generation's layers, success marks them committed, and committed layers fold into the base
only when every earlier layer has settled; remaining later layers are then replayed. This
preserves correct out-of-order overlap without copying rollback state into fibers or actor
views.

A transaction whose `routes` emit vocabulary events is bound to that vocabulary contract.
A route-free transaction may be reused because it cannot alter machine state; a reusable
commit that needs different routes must be wrapped in separate app-specific transaction
descriptors. This keeps settlement ownership explicit instead of resolving route conflicts
at runtime.

Pending or queued transactions cannot be resumed generically after process death because
Flow cannot know whether an external commit already occurred. Hydration converts them to an
`interrupt` terminal snapshot with a restoration receipt and issue, without firing a
route. The boot payload retains the resource base and optimistic overlay ledger, so this
normalization can remove interrupted layers and fold already committed layers before the
first hydrated snapshot is published. Terminal snapshots restore normally, and a typed
application event may deliberately start a new generation.

#### Persistence, stories, and model exploration

Runtime boot payloads, trace artifacts, and behavior contracts move together to a v2
Flow-owned envelope. Flow uses private Effect `Schema` codecs for version, token IDs, ref
IDs, primitive statuses, and structural envelopes. Machine memory and domain payloads
remain opaque; an application that changes them migrates and validates the unknown input
before passing it to Flow. V1 artifacts are rejected with a version diagnostic rather than
silently guessed into v2.

The CLI discovers and runs registered stories and inspects v2 artifacts. It does not offer
a generic command that fabricates arbitrary payload-bearing events, because Flow has no
runtime payload schema with which to validate that input. Applications may expose their own
decoded commands, and zero-payload story journeys require no special exception to this
boundary.

`flow.fixture(...)` is the only story environment input. Each run instantiates every
fixture once, composes its Layer, seeds, and controlled endpoints into the fresh test
runtime, and gives all of them one Effect `TestClock`. Repeating the same fixture definition
is deduplicated; different definitions with the same fixture ID and duplicate seeds for one
resource ref are errors. Flow does not inspect duplicate Effect service tags or invent
Layer precedence—an application that needs an override composes it explicitly inside one
fixture.

Story progress is implemented with the same actor queues, fiber inventories, `Clock`, and
Scopes as production. Controlled endpoints may use `Deferred` for one completion and
`Queue` or `PubSub` for streams, but those mechanics stay behind typed inert `perform`
commands. A completed `story.run()` means every command ran, evidence was captured, and the
runtime Scope closed; `Exit` and `Cause` preserve both execution and cleanup failure when
either fails.

Pure model discovery never executes `Effect.runSync`, transaction commits, resource
lookups, or production success routes. It explores only pure machine transitions from
authored candidate events. `path.story` is the one boundary that turns a discovered path
into a live Effect-backed proof.

#### Definition of correct

The implementation is correct only when these invariants are covered by package tests and
the maintained Incident Console reference:

- One accepted actor turn has one total order and publishes one atomic immutable snapshot;
  an older resource or transaction generation can never overwrite a newer one.
- Every fiber, timer, stream, child, cache lease, and controlled endpoint is reachable from
  one owned Scope, and disposing the runtime leaves no live work.
- Resource freshness and collection follow machine ownership and Effect time, while
  mounting, unmounting, or rerendering React components has no effect on either lifecycle.
- Views are pure projections over one actor snapshot, and every machine state change,
  primitive lifecycle change, receipt, or issue they select causes the same observer path
  to reevaluate.
- Production runtime, stories, restoration, and model-path replay use the same actor engine;
  test controls can complete real dependencies but cannot assign the resulting facts.
- Artifact decoding rejects unknown Flow identity and versions, while domain payload
  validation remains owned by the application boundary.

Implementation should proceed in dependency order: compile vocabulary, app graph, refs,
and snapshot types first; build the scoped actor engine and resource/transaction stores
next; then connect observers and React; finally migrate the story runner, artifacts, CLI,
tests, and maintained Incident Console example, verifying each layer through the package
gates.

No known architecture question in this decision record blocks implementation. Private
type names, file boundaries, and helper decomposition may change during implementation as
long as the public decisions and correctness invariants above continue to hold; any change
to ownership, identity, publication, persistence, or React semantics requires a new design
decision rather than being hidden as a refactor.

## Withdrawn proposals

The following ideas appeared in the first reference and should no longer guide library
implementation:

- Requiring Effect Schema or another runtime codec for domain models, memory, events,
  resources, or transactions.
- Using Schema-based domain declarations in maintained examples, or implying that an
  erased TypeScript interface proves runtime validation.
- A separate generic payload map paired with a runtime event-name map; it repeats every
  event alias and becomes unwieldy as the machine grows.
- Requiring one global payload-constructor convention, or treating positional arguments
  and object arguments as competing vocabulary designs.
- Long or PascalCase vocabulary accessors such as `Incident.states.*`,
  `Incident.events.*`, `Incident.State.*`, and `Incident.Event.*`; the selected surface
  is `Incident.S.*` and `Incident.E.*`.
- Tuple-based vocabulary entries whose meaning depends on position rather than named
  properties.
- Nested event groups inside one machine vocabulary; they lengthen every reference
  without adding a separate runtime owner.
- An `idOf(...)` helper for vocabulary members, or computed machine keys such as
  `[Incident.E.IncidentOpened.type]`; first-class tokens carry identity while a
  vocabulary-bound machine validates readable local record keys.
- Making Effect Schema classes the public vocabulary tokens, leaking Schema parse errors
  through Flow APIs, or claiming that schemas for known event IDs also validate their
  erased TypeScript payloads.
- Placing `vocabulary` inside the machine configuration, currying machine construction
  as `flow.machine(Incident)({...})`, or passing a plain configuration object as the
  second argument. The selected form is
  `flow.machine(Incident, (S, E) => ({ ... }))`.
- Keeping the opaque machine term `context`, using a generic `update` property for memory
  changes, or exposing `setMemory`, full replacement, mutable Immer drafts, or a directly
  writable Zustand-style store; the selected pair is `memory` and `updateMemory` with
  one-level shallow merging.
- Giving a vocabulary separate `namespace` and local `id` fields, deriving identity from
  its TypeScript variable name, or allowing a module to rewrite it; one required `id`
  already names the complete machine contract.
- State-owned `resources`, `streams`, and `actors` categories; heterogeneous supervised
  work composes under `activities` instead.
- Collapsing the root console to `queue` and `incident` merely because resources and
  transactions already expose operational state.
- Replacing `states`, `on`, and `type: "final"` with `nodes`, `events`, and `complete`.
- Keeping XState's opaque `always` property, introducing a special `type: "choice"`
  state, or naming eventless routing `route`, `autoRoute`, or `guard`. The selected
  property is `redirect`, available on every ordinary state, with `when` predicates.
- Allowing redirects to update memory, submit transactions, execute arbitrary actions,
  omit their target, or read a previous event. Redirects are inspectable routing-only
  microsteps.
- Keeping generic state `entry` and `exit` callbacks, the overloaded `invoke` property,
  the ambiguous `after` property, or a required `flow.after(...)` wrapper. The selected
  lifecycle vocabulary is `activities` and `timers`.
- Renaming all lifecycle work to another generic bucket such as `work` or `setup`, or
  allowing anonymous callbacks, raw promises, raw Effects, and manually managed
  intervals inside `activities`; lifecycle declarations must remain self-identifying
  and inspectable.
- Exposing `flow.patch(ref, patch)` as a machine activity. Machine-local drafts use
  `updateMemory`, optimistic canonical changes use transaction `preview`, and external
  canonical changes enter through a resource observation or stream. The underlying
  resource-store patch primitive remains available below the machine grammar.
- Removing `flow.invalidate(target)` or replacing it with `flow.refresh`; invalidation
  targets cache freshness across refs, tags, and filters and lets resource policy decide
  whether active records refresh immediately.
- Adding activity `outcomes` to `flow.run(transaction)`, renaming transaction `routes` to
  `outcomes`, or retaining the identity-only `flow.outcomes(...)` helper. Activity
  observation and transaction settlement routing remain distinct surfaces.
- Replacing the current transaction API with callback-derived inputs, atomic descriptor
  drafts, authoritative publication hooks, or unclaimed-result hooks as one redesign.
- Replacing explicit runtime construction with provider-owned app and service assembly.
- Passing a raw Effect Layer as the app, recovering app ownership from services inside that
  Layer, or keeping a process-global definition registry. The runtime receives an explicit
  app definition and an explicit implementation Layer, while refs resolve through that
  runtime's compiled app graph.
- Removing `behavior.ts` or treating tests and runtime traces as substitutes for authored
  declarative journeys.
- Keeping `flow.stories(machine, stories)` collections, repeated
  `{ machine, scenarios }` entries, or the older `{ seed, start, events, expectedState,
expectedFacts }` story-object language. `flow.story({ app, machine })` is the one typed
  plan builder, and `flow.behavior({ stories: { [key]: plan } })` registers selected plans
  directly while inferring their shared app.
- Replacing the existing story vocabulary with `given`, `when`, and `then`.
- Adding a story-specific variable binding, interpolation, or expression language. Shared
  values are ordinary TypeScript fixtures or constants referenced lexically from each
  story section.
- Keeping `test(machine)`, `test.app(app).scenario(machine)`,
  `runFlowScenario(...)`, or `flowTest(machine).start()` as public execution paths.
  `flow.story({ app, machine })` is the one lazy plan builder, its `.run()` method is the
  sole executor, and the host runner alone owns the `test` name.
- Making `behavior.run(story)` the execution boundary, supplying app ownership later
  through `.with(...)` or `run(...)`, accepting a prebuilt mutable runtime, or changing
  execution when a story is registered. Every story binds its app and machine upfront and
  creates a fresh app test runtime for each `.run()`; registration adds discovery identity
  only.
- Treating rehydration or model-path replay as separate runtime harness families. A
  rehydrated actor is a start configuration and a discovered model path is an event source
  for the same plan runner.
- Retaining model-owned `replay(...)` and `replayFlushed(...)` harness methods or dropping
  path metadata and traversal controls during consolidation. `flow.model(baseStory)` keeps
  pure discovery intact, and each result exposes an ordinary `path.story`; explicit
  `.flush()` records the only difference between the former replay modes.
- Executing transaction commits or synthesizing synchronous transaction-success routes
  during pure model exploration. Asynchronous outcomes are authored candidate events, and
  `path.story` is the Effect-backed proof boundary.
- Treating fresh memory, an explicit snapshot, and a runtime boot payload as independent
  combinable inputs, or requiring callers to extract and pass a snapshot beside a boot
  payload. They are exclusive `start` variants, and boot mode owns actor selection from the
  hydrated payload.
- Silently accepting v1 boot, trace, or behavior artifacts as v2, or using Flow's private
  envelope Schema to claim validation of opaque domain data. Version migration and domain
  decoding are explicit application boundaries.
- Resuming serialized resource fibers or pending transaction commits after process death.
  Resource ownership may start a new lookup; pending transactions become interrupted and
  their persisted optimistic overlays roll back without settlement routes.
- Adding a Flow-owned virtual clock, retaining `.with({ clock })` or the legacy
  `clock: () => number` offset Layer, or letting fixtures replace the runtime Clock. Each
  run owns one fresh Effect `TestClock`, and explicit story commands drive that clock.
- Letting `settle()` advance through future timers or preserving the current loop that
  adjusts by `pending.nextAfterMillis`. Settling stays at the current clock time; authored
  `advance(...)`, `setTime(...)`, or `advanceToNextTimer()` commands own every time jump.
- Defining settlement as `activeFibers === 0`, or waiting for continuing observations,
  streams, child actors, and future timers to disappear. `settle()` waits only for ready
  mailboxes, finite resource lookup generations, and transaction executions at the current
  time; `pendingWork` still reports the ignored continuing work.
- Retaining public `maxTicks`, `maxFibers`, or per-command progress bounds. Every looping
  progress command uses the story's one `maxTurns` policy, defaulting to 100, and
  concurrency width is not treated as a hang or settlement condition.
- Returning `domain-failure`, `defect`, `interruption`, `blocked`, or `internal-error`
  story statuses. A completed plan returns captured product evidence regardless of its
  product outcome; an invalid or incomplete execution throws `FlowStoryExecutionError`
  with partial evidence and cleanup truth.
- Allowing runtime branches, loops, predicates, promises, or callbacks inside a story plan.
  Tables, property generation, and model exploration create independent linear plans before
  execution, while machine transitions own conditional application behavior.
- Restoring matcher-owning `.expect(...)` callbacks in the Flow builder. Named checkpoints
  restore local capture boundaries, while the host test runner retains assertion and
  pass/fail ownership.
- Naming a story-plan capture `snapshot` or `commit`. Flow already uses snapshot for machine
  and actor state and commit for transaction effects; the capture command is `checkpoint`.
- Letting `checkpoint(...)` implicitly flush, settle, advance time, or otherwise progress
  execution. Capture is immediate, and every progress boundary remains explicit in the
  recorded plan.
- Preserving live public harness reads such as `state()`, `context()`, `getSnapshot()`,
  registry reader methods, or rehydration-only `runtime` and `actor` handles. Userland tests
  read immutable checkpoints and run output; direct runtime access is package-internal.
- Carrying `until`, `untilState`, `untilReceipt`, `untilIssue`, and `advanceUntilIdle` into
  the final public builder. Explicit controls, ready-work flushing, bounded settling, and
  virtual-time advancement own those use cases without arbitrary procedural predicates.
- Exposing test-only `retryTransaction` or `resetTransaction` as ordinary plan commands.
  Product-level tests send typed machine events, while primitive policy tests use an
  internal seam.
- Completing a test by directly assigning resource or transaction snapshots, statuses, or
  receipts. Controlled commands deliver outcomes through the awaited external service or
  stream boundary so the real Flow primitive performs every lifecycle transition.
- Leaving raw `Deferred` completion, controlled-stream mutation, arbitrary callbacks, or
  arbitrary Effects outside the recorded plan as the ordinary userland control model.
  Controlled fixtures expose typed inert commands instead.
- Generating application Effect services or owning a service-method mocking DSL. Flow
  supplies generic controlled Effect and stream endpoints; application test code composes
  them into its ordinary service Layer.
- Storing observed calls, completions, subscriptions, or ordinals on a module-scoped
  controlled endpoint definition. Every run instantiates isolated state and builds the
  corresponding application Layer against that same state.
- Requiring both a provided controlled Layer and a separate registration of its endpoint
  controllers. One reusable definition installs both sides for each run.
- Keeping named module fixtures as resource-only arrays while introducing another public
  controlled-fixture abstraction. `flow.fixture(...)` is the one reusable setup definition
  for resource seeds, Layers, and controlled endpoints.
- Supplying raw Layers or resource seeds directly to `.with(...)` beside fixtures. A fixture
  is the sole reusable environment input and owns those capabilities per run.
- Adding a fixture registry to the production app, a story collection, or
  `flow.behavior(...)`, or storing fixture IDs in stories for later lookup. Story plans
  hold direct `flow.fixture(...)` definition references, and behavior consumers
  discover those dependencies through the assembled story graph.
- Retaining both `trace` and `captureTrace`, passing hidden event arrays to the execution
  boundary, or requiring a separate diagnostics runner, scenario report conversion, or
  evidence conversion. One structured run already owns those captured facts.
- Adding `flow.whyNot`, injecting `can` or `whyNot` readers into `flow.view`, or treating
  failed boolean guards as human-readable business explanations. `flow.can` answers UI
  capability, the existing inspection API explains structural rejection, and domain
  policy owns user-facing copy.
- Returning a TanStack Query-shaped `{ data, activity, failures }` value from `useView`,
  or deriving generic `isLoading`, `isPending`, `isFetching`, `isRefetching`,
  `isMutating`, and success or failure state from resources and transactions touched by a
  selector. Meaningful UI lifecycle is authored machine behavior; lower-level operational
  status remains available by explicitly selecting the relevant resource or transaction
  snapshot in a view, as well as through runtime inspection and tests.
- Requiring every view to return separate `{ state, data, operations }` fields or another
  standardized result wrapper. Views return ordinary user-authored projections; the
  reusable convention is the `.status` property on each selected primitive snapshot.
- Collapsing resource and transaction lifecycles into one `OperationStatus` union.
  Resources and transactions share the `.status` property name but retain their own
  lifecycle vocabulary and primitive-specific detail.
- Indexing actor-visible transaction status only by descriptor ID, or letting the latest
  execution of one descriptor overwrite executions for other application keys. A resolved
  transaction ref is the observable identity; latest-generation ownership applies within
  that ref only.
- Defining transaction identity independently at the execution site and in each view. The
  transaction-owned `key` function derives the ref from resolved params and powers
  `transaction.ref(...)`, so both paths resolve the same identity.
- Supplying separate instrumented `resources` or `transactions` reader arguments to
  `flow.view` and using the reads to synthesize query-style observer activity. A view
  receives the one read-only actor snapshot directly and returns an authored projection.
- Publishing issues beside the actor snapshot or checkpoint as another independently
  mutable root. Issues are part of the same immutable actor publication as state, memory,
  primitive snapshots, and receipts.
- Adding a machine-level `expose` or `public` selector beside `flow.view`. It duplicates
  the projection boundary and forces behavior configuration to own consumer read models.
- Retaining `useResource` as a public React escape hatch or adding `useTransaction`.
  Primitive runtime truth remains available through machine orchestration, authored
  views, runtime inspection, tests, and non-React infrastructure rather than a parallel
  component read path.
- Exporting feature-level actor factories, component-authored actor IDs, or additional
  lookup helpers. Modules export machine definitions and views; the runtime owns root and
  dynamic actor creation.
- Throwing resource promises from `useView` or adding Flow-owned Suspense behavior.
  Resource outcomes drive explicit machine states; a required value missing from a state
  that promises it is an invariant violation rather than an implicit pending render.
- Adding per-view or per-hook equality options. The observer owns one structural-sharing
  policy, and the same authored view has the same publication semantics at every call site.
- Renaming the established cache clocks to `staleAfter`, `unusedFor`, `retainFor`, or
  another Flow-specific vocabulary. Flow uses the familiar `staleTime` and `gcTime`
  semantics, with machine ownership replacing React observer count as the activity
  boundary.
- Adding `refetchOnWindowFocus` or `refetchOnReconnect` options to resources, views, or
  hooks. Active `flow.observe(ref)` ownership authorizes stale host-triggered refresh;
  finite ensure operations and passive views do not.
- Using React observer count as resource ownership, mapping Flow invalidation to destructive
  `RcMap.invalidate`, or replacing Flow's resource snapshots wholesale with Effect `Cache`
  or `Resource`. `RcMap` supplies entry leases and idle collection only; Flow owns
  freshness, invalidation, generations, and publication.
- Adding operations to `flow.vocabulary`, introducing an `O.*` token namespace, or treating
  an operation as another event or machine state. Events remain causal application actions;
  resource and transaction executions retain their own overlapping runtime lifecycles.
- Finalizing file structure based on any of those withdrawn proposals.
