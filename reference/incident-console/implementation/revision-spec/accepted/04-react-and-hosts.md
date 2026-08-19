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
MUST add terminal-disposal authority. Suspended consumers retain their fixed logical provider edges and
block provider disposal under the exact rules in REV-COMP-004 and REV-HOST-005; React cleanup does not
alter graph ownership.

## REV-HOST-002 — Prepare actors during render and attach the same actor during commit

**Change:** Replace the render-time shell-and-swap implementation.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:567-577`, `DESIGN_REVISIONS.md:648-680`, and
`DESIGN_REVISIONS.md:1308-1314`. The replaced implementation is recorded at
`packages/flow-state/src/react/use-actor.ts:20-55,86-130,134-203`.

**Replaces:** A render-time public shell whose no-op commands are later swapped for a different live actor.

**Rule:** During render, `useActor` MUST create one package-private prepared actor with its final opaque
ref, pure initial snapshot, stable public handle, and real command-buffering mailbox. Preparation MUST
NOT create a runtime registry entry, execution scope, subscription fanout, external work, or inspection
evidence. It MAY carry a passive provisional context cut with exact provider refs and observed provider
publication revisions. The cut is render-only and MUST NOT be an installed baseline, provider publication,
persistence input, or ownership edge.

Commit MUST recheck provider identity and revisions, replace stale provisional projections with current
provider truth, atomically install the context baseline, activate that exact actor, and drain buffered
commands exactly once. It MUST NOT replace a shell with another live handle. A selector defect during
attachment MUST abort admission without exposing a partial actor.
`useActor` MUST capture the exact construction tuple for one component incarnation: runtime identity,
machine identity, input, and context-binding identities. A later change to any member MUST synchronously
report the keyed-remount diagnostic, MUST NOT replace or reinitialize the actor, and MUST leave the
original actor untouched. A keyed remount creates a new actor. `useActorByRef` remains lookup-only; a
changed ref resolves the new already-registered handle without construction, ownership, disposal, or
subscription authority.
Abandoned concurrent and server renders MUST leave no runtime registration, subscription, timer,
activity, operation attempt, lifecycle evidence, external work, or terminal-disposal obligation.
Imperative `runtime.createActor` MUST remain the immediately attached and running path for non-React
owners.

**Proof obligations:** Prove final ref and handle identity across prepare and attachment, provisional
context recheck, construction-tuple keyed-remount rejection, delivery of commands buffered before first
attachment, the 64-command bound and synchronous overflow rejection, atomic abandonment closure, and
complete inertness of abandoned preparation.

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

Each actor owns private `publicationRevision` and `machineTurnRevision` counters. The construction
snapshot starts at publication revision `0`; hydration restores persisted counters without resetting
them. Every later immutable snapshot publication increments `publicationRevision` exactly once and
exposes it as `snapshot.revision`. A committed machine turn increments both counters once. Lifecycle,
issue-only, and projection-only publications increment only `publicationRevision` and retain the
preceding `machineTurnRevision`. Selectors, hydration consistency, and checkpoints use publication
revision; inspection correlates publication revision, machine-turn revision, and the runtime-global
evidence sequence. No second public revision field exists.

React Effect setup MUST activate a prepared actor or resume a suspended actor. Effect cleanup MUST
genuinely suspend the same actor. It MUST NOT suppress cleanup, introduce a grace period, predict a later
setup, or terminally dispose the actor. Strict Effects and Activity hide/reveal MUST use this same
production lifecycle because cleanup cannot distinguish reconnection from permanent removal.

A snapshot read, subscription, command, capability check, or other handle operation MUST observe the
actor's truthful lifecycle rather than treating a prepared or suspended actor as active. A prepared
snapshot subscription replays the prepared snapshot and becomes live on activation; a suspended
subscription replays the suspended snapshot once and completes; a disposed subscription replays the
terminal snapshot and completes. Prepared commands buffer up to 64 entries, active commands admit, and
suspended or disposed commands reject without buffering. `can(event)` remains pure transition legality
and is independent of command admission. Selector-exception publication identity follows REV-HOST-006
and does not add a second public error surface.

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

`actor:restore`, `actor:start`, `actor:suspend`, `actor:resume`, and `actor:dispose` MUST use immutable
`LifecycleRecord`s admitted through the same runtime-global evidence hub and sequence allocator as
`TurnRecord`s. The private cause tags are `fresh-creation`, `boot-restoration`, `attachment-commit`,
`attachment-cleanup`, `attachment-reacquisition`, `owner-disposal`, and `runtime-disposal`.
`actor:restore` is an installation fact with `from: "prepared"` and `to: "prepared"` and precedes its
matching `actor:start`. Lifecycle records contain the published snapshot, exact actor/app/plan and
actor-incarnation provenance, `from`, `to`, cause, timestamp, publication revision, machine-turn
revision, and evidence sequence. Sequence allocation occurs under one publication barrier; sink
delivery is asynchronous behind the record release gate. Sink overflow truncates only that sink with
`truncatedBeforeSequence`; sink failure detaches only that sink. `drain()` waits through the accepted
sequence prefix. Runtime disposal stops new admission, drains accepted evidence, then closes sinks and
queues; sequence exhaustion fails before publication without partial evidence or a second history.

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
cancellation and recovery rules. Each actor has one serialized lifecycle lane ordered with its mailbox.
Suspension closes admission at one linearization point; previously admitted mailbox work settles FIFO
before the suspended snapshot publishes, while settlement does not imply external success. Queued finite
resource and transaction occurrences settle as planned interruption without starting adapters and without
automatic retry. Running finite resources release only this actor's ownership; shared StoreKernel work is
interrupted only under its existing final-owner policy. Late completion is fenced from the suspended actor.
Transactions interrupted before the remote boundary remove local previews and settle as interrupted. After
the boundary, cancellation stops local observation, retains remote identity, publishes the accepted
`unknown` or reconciliation-required truth, and never claims rollback or issues a new remote request.
Continuing streams close without a mapped domain outcome; their latest projection remains available, and
resume creates a new generation from live executable input without replaying emissions. Timers are
cancelled and fenced while retaining absolute deadlines; resume performs at most one overdue refresh.
Pending outcomes and occurrence cursors retain only facts required for truthful settlement. An in-flight
context wave completes atomically before suspension; provider changes while detached reconcile through
one ordinary context wave on resume. No baseline `onContext`, finite action, event, or emission is
replayed. A cleanup defect publishes cleanup truth, leaves the actor suspended, and blocks resume until
explicit owner or runtime disposal.

A permanently discarded hook MUST leave no registration or runtime work after suspension cleanup. A
retained escaped handle remains the same inert suspended handle. Only an explicit production-runtime or
owner action MAY terminally dispose it.

**Proof obligations:** Prove balanced Strict Mode and Activity cleanup/reacquisition, retained suspended
provider edges and disposal rejection, resume failure for missing/foreign/tombstoned providers, one
serialized lifecycle lane, FIFO settlement at the suspension boundary, no overlapping live generations,
per-kind finite normalization, preserved timer deadlines, one context reconciliation after resume, no
replay, late-completion fencing, cleanup-failure truth, and no active runtime work after final unmount.

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

If a view selector throws, the exception MUST be memoized by the exact actor publication and passive-store
read cut. Repeated evaluation against that unchanged cut MUST rethrow the same exception without mutating
actor state, issuing an issue-only actor publication, or retrying in a loop. A later actor publication or
matching StoreFanout revision MUST retry the selector. Initial attachment and hydration selector defects
MUST abort admission without exposing a partial actor. This behavior adds no public error or subscription
surface; it preserves the existing selector call boundary.

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
or operation acquisition. Exact exception memoization and recovery follow `REV-HOST-006`; tear-free
reactivity for passive operation reads is closed by `REV-HOST-007`.

## REV-HOST-007 — Dependency-tracked passive views and projection publication

**Change:** Close passive operation-read reactivity without broadening the React API or moving actor state
into React.

**Supersedes:** The `BEH-015` deferral in `REV-HOST-006` and the conflicting implementation-contract
language that requires selectors to declare passive operation dependencies manually.

**Rule:** During each `useView(actor, selector)` evaluation, Flow records every exact descriptor and
canonical `K` read through snapshot-bound `O.getData(K)` or `O.getState(K)`. The dependency set is replaced
after every completed evaluation. The selector is evaluated against one tear-free actor/store boundary;
it never acquires ownership, starts work, changes freshness, mutates state, or creates a user-visible
subscription. Actor publication or a matching canonical StoreFanout revision reruns the selector, and the
shared selector equality suppresses an unchanged selected result.

The runtime installs and releases the dependency lease internally with the actor view lifetime. There is no
manual subscription requirement for machine correctness. `runtime.resources.subscribe()` or equivalent
runtime observation remains an explicit external observation escape hatch and does not synchronize actor
state. A projection-only rerun publishes a complete immutable actor snapshot and does not evaluate machine
transitions. Continuing-operation mappers and `onContext.select` enqueue typed events only after that
publication, through the ordinary actor mailbox.

**Proof obligations:** Cover cross-actor canonical writes, dependency replacement after selector changes,
tear-free reads at a store revision boundary, equality suppression, cleanup on actor suspension/disposal,
and the absence of work or mutation from passive selector evaluation.

## REV-HOST-008 — Construction-owned seeding and trusted host writes

**Change:** Close `BEH-032` without exposing a general post-start cache-writer API.

**Rule:** Boot, SSR dehydration, and Story fixture seeds are construction-owned inputs. Before actor
activation, the receiving runtime validates each seed's app, descriptor, canonical `K`, and resource value,
rejects duplicate descriptor/K seeds even when values are equal, and installs the seed through the one
StoreKernel commit coordinator. A seed creates no operation occurrence, generation, adapter work, mapped
event, or actor command turn; its StoreState publication is part of the construction barrier. Seed values
are Flow-owned immutable copies where Flow owns the container and application-opaque values retain their
application ownership.

The only post-start host write is a package-private capability-scoped `HostWriteLease` issued by the
production RuntimeFactory or Story fixture owner for one live runtime, one compiled app, and one declared
resource family. It accepts only an exact descriptor/K and a non-`undefined` resource value or updater result;
it rejects foreign runtimes, unadmitted families, malformed keys, disposed leases, and transaction/stream
targets. It uses the same authoritative StoreKernel write and generation fencing as actor-authored
`setData`, publishes one StoreFanout revision and one host-write evidence fact, and emits no machine event,
operation occurrence, or implicit retry. The lease is not exported from public runtime, actor, React, Story,
or CLI routes; disposal revokes it idempotently.

**Proof obligations:** Cover seed validation before acquisition, duplicate rejection, no-work/no-occurrence
seeding, host capability provenance and revocation, exact key/resource-family fencing, cross-actor fanout,
one revision and evidence fact per accepted write, rejection after disposal, and absence of a general public
post-start writer.

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

## Historical closure note

The historical blocker register is recorded in [`UNRESOLVED_BEHAVIOR.md`](../UNRESOLVED_BEHAVIOR.md).
The lifecycle, suspension, prepared-host, construction-tuple, prepared-mailbox, selector-defect,
handle-capability, and trusted-host entries owned by this chapter are closed; their implementation proof
obligations remain in the proof matrix and phase receipts.
