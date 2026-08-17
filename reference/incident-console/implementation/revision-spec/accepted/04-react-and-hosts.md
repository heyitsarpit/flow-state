# React and hosts

This chapter is the complete accepted React and host contract. It defines the public hook surface, the
actor identity and ownership capabilities those hooks consume, render-safe preparation, attachment,
suspension, resumption, disposal, focused reads, inspection evidence, and non-React host parity. A source
location in a `Provenance` field is historical evidence only and adds no semantics to the rule.

## Deletion disposition

The registered-view, old React ownership, lifecycle, and comparator surfaces changed by this chapter are
classified by `DEL-001`, `DEL-004`, `DEL-007`, and `DEL-008` in `REV-MIG-004`. Those entries own the
complete old clause inventory and no-residue requirements; the `Supersedes` or `Replaces` fields below
identify the local semantic boundary only.

## REV-HOST-001 — Separate local creation, shared lookup, and reactive observation

**Change:** Replace the prior combined actor/view surface.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:547-566`, `DESIGN_REVISIONS.md:696-809`,
`DESIGN_REVISIONS.md:811-862`, and `DESIGN_REVISIONS.md:1304-1364`.

**Rule:** Flow MUST retain `actor` as the public name for one live instance of reusable machine logic.
One machine MAY back any number of actors. The React surface MUST consist of these separate operations:

```ts
useActor(machine, options?);
useActorByRef(ref);
useView(actor, selector);
```

`useActor` MUST create one fresh local actor in the current `FlowProvider` runtime, including for a
void-input machine. Repeating `useActor` with the same machine in different component incarnations MUST
create independent actors. Its options MUST supply exact fresh input when the machine requires input and
MUST supply exact `contextBindings` when the definition declares inherited context; bindings MAY be omitted
when the definition declares none. It MUST NOT accept a stable actor ID.
The actor MUST remain stable for the component incarnation and ordinary rerenders. Input and the absence
of input MUST NOT change local-versus-shared meaning.

`useActorByRef` MUST synchronously resolve one already-registered shared actor from the current
`FlowProvider` runtime and return its stable command handle. It MUST be lookup-only and MUST NOT call
`ensureActor`, construct an actor, acquire ownership, or dispose the actor. Missing, foreign, disposed,
and machine-mismatched stable refs MUST fail with stable diagnostics.

`useView` MUST be the sole ordinary reactive subscription path. `useActor` and `useActorByRef` MUST remain
command-only and non-reactive: obtaining a handle alone MUST NOT subscribe the component or cause rerenders
for actor changes.

React MUST own only a local actor's component attachment lifetime. The Flow runtime MUST own actor
state, mailbox, snapshots, operations, inspection, and cleanup; no actor state may be stored in React.

### Composition prerequisites used by the hooks

Actor identity, imperative construction and lookup, owner leases, disposal, tombstones, and bootstrap are
defined once by `REV-COMP-011` through `REV-COMP-015`. React MUST consume those exact capabilities without
altering them: `useActor` receives a local actor handle without exposing its owner lease,
`useActorByRef` uses lookup-only authority, every returned handle exposes its exact ref, and neither hook
MUST add terminal-disposal authority. Suspended-consumer dependency behavior remains unresolved under
`BEH-009`; this chapter does not broaden the active-consumer disposal rule.

## REV-HOST-002 — Prepare actors during render and attach the same actor during commit

**Change:** Replace the render-time shell-and-swap implementation.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:567-577`, `DESIGN_REVISIONS.md:648-680`, and
`DESIGN_REVISIONS.md:1308-1314`. The replaced implementation is recorded at
`packages/flow-state/src/react/use-actor.ts:20-55,86-130,134-203`.

**Replaces:** A render-time public shell whose no-op commands are later swapped for a different live actor.

**Rule:** During render, `useActor` MUST create one package-private prepared actor with its final opaque
ref, pure initial snapshot, stable public handle, and real command-buffering mailbox. Preparation MUST
NOT create a runtime registry entry, execution scope, subscription fanout, external work, or inspection
evidence.

Commit MUST atomically attach that exact actor, validate and install its context baseline, activate it,
and drain buffered commands exactly once. It MUST NOT replace a shell with another live handle.
Abandoned concurrent and server renders MUST leave no runtime registration, subscription, timer,
activity, operation attempt, lifecycle evidence, external work, or terminal-disposal obligation.
Imperative `runtime.createActor` MUST remain the immediately attached and running path for non-React
owners.

**Proof obligations:** Prove final ref and handle identity across prepare and attachment, delivery of
commands buffered before first attachment, and complete inertness of abandoned preparation.

## REV-HOST-003 — Use one truthful production actor lifecycle

**Change:** Expand the actor lifecycle and make React cleanup a real suspension.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:579-604` and
`DESIGN_REVISIONS.md:1304-1323`. The replaced two-state snapshot vocabulary is recorded at
`contracts/GLOSSARY_AND_IDENTITY.md:202-205`.

**Replaces:** The prior `active | disposed` lifecycle union.

**Rule:** The production lifecycle MUST be the closed union
`prepared | active | suspended | disposed`, with transitions `prepared -> active <-> suspended` and
terminal transition to `disposed`. Public actor snapshots and the `lifecycle` value supplied to
`useView` MUST expose the exact current value.

- `prepared` MUST mean never attached, no live runtime resources, and command buffering enabled.
- `active` MUST mean command admission and live runtime-resource ownership are enabled.
- `suspended` MUST preserve actor continuity while rejecting commands and owning no live attachment
  resources.
- `disposed` MUST be terminal and reject every later operation.

React Effect setup MUST activate a prepared actor or resume a suspended actor. Effect cleanup MUST
genuinely suspend the same actor. It MUST NOT suppress cleanup, introduce a grace period, predict a later
setup, or terminally dispose the actor. Strict Effects and Activity hide/reveal MUST use this same
production lifecycle because cleanup cannot distinguish reconnection from permanent removal.

A snapshot read, subscription, command, capability check, or other handle operation MUST observe the
actor's truthful lifecycle rather than treating a prepared or suspended actor as active. The exact
capability-by-lifecycle matrix and selector-exception publication identity remain unresolved under
`BEH-007` and `BEH-016`; this chapter does not infer either answer.

## REV-HOST-004 — Publish coherent lifecycle evidence

**Change:** Add suspension and resumption evidence while preserving the existing actor vocabulary.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:605-624`. The prior inspection vocabulary is recorded
at `packages/flow-state/src/core/api/inspection-event-vocabulary.ts:1-9`.

**Rule:** A lifecycle transition MUST publish one coherent immutable snapshot through the existing
handle before appending its inspection event. Inspection MUST retain `actor:start`, `actor:restore`, and
`actor:dispose`, add `actor:suspend` and `actor:resume`, and MUST NOT add `actor:prepare`.

`actor:start` MUST record first activation, `actor:suspend` MUST record `active -> suspended`,
`actor:resume` MUST record `suspended -> active`, and `actor:dispose` MUST record a terminal transition
from any non-disposed lifecycle. Each event MUST carry exact actor metadata, `from`, `to`, and a
discriminated `cause`. First activation MUST distinguish fresh creation, boot restoration, and attachment
commit; disposal MUST distinguish owner disposal from whole-runtime disposal. `actor:restore` MUST remain
a separate boot-installation fact and precede its `actor:start`.

Lifecycle evidence MUST NOT create a machine revision or `TurnRecord`. An inspection listener reading the
actor after receiving an event MUST already observe the event's `to` lifecycle.

**Proof obligations:** Cover the exact lifecycle union in `getSnapshot`, `useView`, SSR preparation,
Strict Mode reconnection, Activity hiding, explicit disposal, command diagnostics for every non-active
state, absence of preparation evidence, restore-before-start ordering, and snapshot-before-event ordering.

## REV-HOST-005 — Suspend live resources while preserving actor continuity

**Change:** Define exact suspension, resume, and replay boundaries.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:626-647`, `DESIGN_REVISIONS.md:677-691`, and
`DESIGN_REVISIONS.md:1315-1328`.

**Rule:** Suspension MUST close command admission immediately and release the active runtime registration,
observer fanout, context subscriptions, continuing-activity scopes, and installed timers. Commands through
an escaped suspended handle MUST fail with a stable actionable diagnostic and MUST NOT be buffered.
Buffering is permitted only while initially prepared.

Suspension MUST preserve the exact ref, public handle, state, immutable memory, last committed inherited
context, mailbox cursors, operation-occurrence records, and absolute timer deadlines. Resume MUST reattach
the same actor, reacquire continuing activities and subscriptions through production kernels, reinstall
timers against their existing absolute deadlines, and reconcile context bindings against current provider
snapshots. An elapsed deadline MUST be due on resume rather than receive a fresh duration. Changed provider
values MUST use the ordinary serialized context-turn path; `Object.is`-equal values MUST remain silent.

Resume MUST NOT rerun input, memory initialization, initial-state construction, committed events, finite
actions, or `onContext` for the preserved baseline. Suspension and resume MUST NOT manufacture a second
operation attempt, machine revision, or `TurnRecord`; a later real queued fact may do so normally.

Suspension MUST interrupt attachment-owned execution through the production operation kernel's existing
cancellation and recovery rules. The exact per-kind normalization for queued or irreversible transactions,
finite resources, streams, timers, pending outcomes, and context waves remains unresolved under `BEH-010`.

A permanently discarded hook MUST leave no registration or runtime work after suspension cleanup. A
retained escaped handle remains the same inert suspended handle. Only an explicit production-runtime or
owner action MAY terminally dispose it.

**Proof obligations:** Prove balanced Strict Mode and Activity cleanup/reacquisition, no overlapping live
generations, preserved timer deadlines, one context reconciliation after resume, no replay, and no active
runtime work after final unmount.

## REV-HOST-006 — Make views exact, passive actor projections

**Change:** Remove registered view definitions and constrain selectors to atomic passive reads.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:811-857` and
`DESIGN_REVISIONS.md:1351-1364`.

**Rule:** `useView(actor, selector)` MUST accept one exact actor handle and MUST NOT accept a machine family
or `ActorRef`. It MUST neither create nor dispose actors nor change operation ownership or cache policy.
Flow MUST remove public `flow.view`, view IDs, and module view registration. Reusable views MUST be ordinary
selector functions.

A selector MUST have the shared `Selector<Input, Value>` shape and receive one atomic context for one actor
revision containing `state`, immutable `memory`, inherited readonly `context`, `lifecycle`, `issues`, bound
`can(event)`, and snapshot-bound read-only `O`. Its selected `value` is required and retains exactly the
declared `Value` type; it is not implicitly nullable or optional.
The `O` catalogue MAY expose passive `key`, `getData`, and `getState` reads. Selector evaluation MUST NOT
acquire, refresh, subscribe, commit, write, invalidate, clear, or otherwise mutate runtime state.

`useView` MUST use the shared selector equality: scalar and non-record results use complete-value `Object.is`,
and named record results use fixed-key, field-by-field `Object.is`; a direct named-record selector is the
ordinary form. `useShallow(selector)` MAY remain an explicit React-only memoization adapter for named
records, but it MUST use the same field comparison and MUST NOT change the selector's declared value type
or add custom equality to context or memory registrations.
`useView` MUST accept no comparator argument, and selector identity changes MUST NOT replace the actor
subscription.

**Proof obligations:** Type proofs MUST show that `useView` preserves the selector's declared `Value`
type without implicitly adding `null` or `undefined`. Reactive proofs MUST show equal selected results do
not rerender, named-record fields suppress independently unchanged items, fresh non-record structures follow
`Object.is`, and `useShallow` remains an optional React memoization adapter using the shared record comparison.

**Example:**

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

`FlowProvider` MUST continue to receive only an already-created Flow runtime. Flow MUST NOT add a
per-actor React Context, `MachineBindings`, ref provider, prop-drilled state layer, or React-owned actor
engine.

**Failure behavior:** Passing a machine family or `ActorRef` where an actor handle is required MUST fail
through the type system. A selector exception MUST NOT be converted into a mutation, subscription change,
or operation acquisition. Exact exception memoization and recovery behavior remain unresolved under
`BEH-014`; tear-free reactivity for passive operation reads remains unresolved under `BEH-015`.

## Provenance appendix (non-normative)

These locations explain the replaced implementation and the research precedent. They do not add API or
runtime semantics:

- The current shell implementation is at `packages/flow-state/src/react/use-actor.ts:20-55`; render exposes
  that shell at `:86-130`, and asynchronous attachment swaps another actor into it at `:134-203`.
- The current test at `packages/flow-state/src/react/use-actor.test.ts:58-125` proves only that public actor
  creation does not happen during render and that a live actor eventually appears. It does not prove stable
  handle identity, prepared command delivery, Strict Mode cleanup, Activity reconnection, or suspension
  resource cleanup.
- The inspection vocabulary requiring suspend/resume additions while preserving restore, subscription, and
  snapshot evidence is at `packages/flow-state/src/core/api/inspection-event-vocabulary.ts:1-9`.
- The replaced ownership shape exposes `dispose` on every ordinary actor at
  `packages/flow-state/src/core/api/runtime-types.ts:27-46`, returns that handle directly from
  `FlowRuntime.createActor` at `:157-164`, and installs the disposal method at
  `packages/flow-state/src/core/orchestrator/orchestrator-actor-lifecycle.ts:275-293`.
- XState retains an idle actor in `codebases/xstate/packages/xstate-react/src/useActorRef.ts:18-32`, starts it
  from an Effect at `:87-93`, and preserves/restores actor-tree processing state in
  `codebases/xstate/packages/xstate-react/src/stopRootWithRehydration.ts:16-38`. The source ledger used the
  stale prefix `docs/codebases/xstate`; these corrected paths identify the same local research input.
- React's accepted host constraint is the setup-cleanup-setup and hide-reveal behavior stated normatively
  in `REV-HOST-003`; no external document is required to interpret this chapter.

Flow adopts the observable continuity guarantee while keeping the implementation inside Flow's production
runtime; it does not depend on XState's private machinery.

## Unresolved boundaries

The following internal questions remain open and MUST NOT be answered by this chapter: post-bootstrap actor
admission and ensure ownership (`BEH-002`, `BEH-003`); lifecycle publication identity and ordered evidence
(`BEH-007`, `BEH-008`); suspended context dependencies and serialized per-kind cleanup (`BEH-009`,
`BEH-010`); prepared context/SSR, hook construction-tuple changes, and prepared mailbox bounds (`BEH-011`
through `BEH-013`); and selector defects, passive operation-read reactivity, and the complete handle
capability matrix (`BEH-014` through `BEH-016`). Their problem statements are recorded in
[`UNRESOLVED_BEHAVIOR.md`](../UNRESOLVED_BEHAVIOR.md).
