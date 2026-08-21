# React and host contract

Status: normative vNext contract

This file owns runtime/host boundaries: exact actor ownership, synchronous commands, React
attachment and selectors, SSR/request behavior, persistence hosts, trusted host writes, and disposal.
`ARCHITECTURE.md` owns the runtime owners; `SEMANTICS.md` owns turn/lifecycle behavior;
`SNAPSHOTS.md` owns immutable read shapes.
The active clauses in this contract pack are authoritative. The revision specification, accepted
decisions, archived records, and the `provenance/` copies preserve provenance only; unresolved
`BEH-*` entries do not authorize an implementation choice.

## Host-first examples

```ts
const setup = runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({
    storage: webStorage(window.localStorage),
    scope: "user:42",
  }),
});
const runtime = setup.construct();
await runtime.ready();

const shared = runtime.ensureActor(PrimarySessionRef, {
  input,
  contextBindings,
});
shared.actor.send(Session.E.SignOutRequested());
await shared.dispose();

const existing = runtime.getActor(PrimarySessionRef);
const local = runtime.createActor(editorMachine, { input, contextBindings });
local.actor.send(Editor.E.SaveRequested());
await local.dispose();
```

```tsx
<FlowProvider runtime={runtime}>
  <TodoAppView />
</FlowProvider>
```

```tsx
const actor = useActor(newIntentMachine, { input: { draftId: "draft-1" } });
const model = useView(actor, ({ state, memory, context, O, can }) => ({
  state,
  amount: memory.amount,
  themeMode: context.themeMode,
  balance:
    memory.account === null || memory.assetId === null
      ? undefined
      : O.assetBalance.getData([memory.account, memory.assetId]),
  canSubmit: can(NewIntent.E.SubmitRequested()),
}));
```

## Deletion disposition

Automatic roots and dynamic actor categories are deleted by `DEL-003`; child surfaces by `DEL-002`;
old actor ownership/lifecycle by `DEL-004`; registered views, old React ownership, and comparator
surfaces by `DEL-001`, `DEL-007`, and `DEL-008`; conflicting server/persistence/inspection/CLI
surfaces by `DEL-010`. These entries own exhaustive old-clause/no-residue inventory. This file
records only the surviving replacements.

## Runtime and actor ownership

### HOST-001 — AppPlan bootstrap replaces automatic roots

- Surface: `App.M`, runtime bootstrap, live hosts and Stories.
- Rule: `App.M` is the complete machine-admission catalogue; modules name tooling records and create no roots. Bootstrap restores the optional persistence provider, acquires Implementation, installs/validates declared persistable actors, completes every initial `Runtime.ensureActor`, resolves exact context refs, seals the graph, then activates/exposes handles.
- Accepts: One production bootstrap barrier shared by live hosts and Stories.
- Rejects: Automatic roots, `dynamicMachines`, `RootActor`, root lookup, pre-seal handle escape, missing/duplicate/foreign/cyclic providers, partial graph/evidence, and testing-only registration/activation.
- Observable guarantee: Boot failure closes admission and reverses owners/edges/registrations/acks before `failed` (or `disposed` when shutdown wins).
- Proof: `HOST-P01`, `HOST-P04`.
- Trace: `ARCH-001`, `ARCH-007A`, `ARCH-008`, `HOST-006`, `REV-COMP-006`–`REV-COMP-008`,
  `REV-COMP-015`.

### HOST-002 — Exact refs separate shared lookup, durable creation, and local creation

- Surface: `actorRef`, `runtime.ensureActor`, `runtime.getActor`, `runtime.createActor`.
- Rule: Every handle exposes exact machine-branded `actor.ref`. Stable refs identify durable shared actors; local actors receive opaque runtime-local refs. Refs carry identity only. `ensureActor` is restore-or-create and returns `{ actor, dispose }`; `getActor` is lookup-only; `createActor` is fresh local creation without stable ID.

```ts
actorRef(machine, id, { persist?: boolean });
runtime.ensureActor(ref, { input, contextBindings? });
runtime.getActor(ref);
runtime.createActor(machine, { input, contextBindings? });
useActorByRef(ref);
```

- Accepts: `persist` declaration metadata defaulting to `false`; exact input once for fresh actors; exact bindings when declared; concurrent `ensureActor` calls joining one construction.
- Rejects: Stable ref carrying input/bindings/ownership, ID-bearing local creation, missing/foreign/mismatched/disposed/opaque-local lookup, `useActorByRef` construction, or disposal transfer by passing only `lease.actor`.
- Observable guarantee: Restore uses exact actor/memory/bindings without initializer/input replay; a stable ref has one owner authority per runtime.
- Proof: `HOST-P01`, `HOST-P02`.
- Trace: `ARCH-002`–`ARCH-004`, `SEM-029`, `SNAP-001`, `REV-COMP-009`, `REV-COMP-011`.

### HOST-003 — Owner leases are the only individual disposal authority

- Surface: `{ actor, dispose }` owner lease.
- Rule: `lease.dispose()` is async, idempotent, and terminal. First successful call closes admission, runs production cleanup, and makes escaped handles reject with the stable disposed-actor diagnostic. Concurrent and later calls MUST join or observe the same disposal completion and MUST NOT execute cleanup twice. Context-graph integrity is checked before disposal; active/suspended dependents block it with exact dependent refs and binding keys. Suspension retains the logical provider edge, provider ref/incarnation, last projection, and provider revision. Resume fails closed and leaves the consumer suspended when that provider is missing, foreign, or tombstoned; Flow never rebinds or recreates it automatically.
- Accepts: Lease drop without disposal; whole-runtime disposal subsuming leases; suspended consumers retaining logical provider edges; reverse dependency teardown.
- Rejects: Disposal on actor/ref, implicit drop disposal, React cleanup removing edges/rebinding/disposal, provider recreation/rebinding on resume, or disposal of a provider with bound consumers.
- Observable guarantee: Stable shared disposal leaves a runtime tombstone; `getActor`/`ensureActor` reject that ref until runtime disposal, while a new runtime may restore/create a fresh incarnation.
- Proof: `HOST-P01`, `HOST-P02`, `HOST-P05`.
- Trace: `SEM-024`, `ARCH-030`, `HOST-016`, `REV-COMP-011`, `REV-COMP-012`, `REV-COMP-013`, `REV-COMP-014`.

## Commands and actor observation

### HOST-004 — Public send is synchronous and uses the production mailbox

- Surface: `actor.send(event): void`.
- Rule: Admit the exact typed event synchronously to the production mailbox or report synchronous admission failure. It returns no Promise, Effect, Fiber, snapshot, actor, acknowledgment, or subscription. Story may await a package-private acknowledgment on the same mailbox command.
- Accepts: Live and Story domain commands using the same actor engine and mailbox; acknowledgment after ordinary event stabilization only.
- Rejects: Direct transition logic, unrelated ready-work draining, second execution path, or public acknowledgment.
- Observable guarantee: Command admission is synchronous and host/Story parity is preserved.
- Proof: `HOST-P03`, `HOST-P05`.
- Trace: `ARCH-009`, `ARCH-017`, `SEM-006`, `REV-TEST-006`.

### HOST-005 — Actor handles expose exact identity and truthful snapshots

- Surface: actor handle, `actor.ref`, `getSnapshot`, `actor.snapshots`.
- Rule: Handle exposes exact identity, synchronous command, and Flow-owned snapshot. Exact operation-state projections follow `PUBLIC_API.md` `API-006`; React MUST NOT store actor state, mailboxes, operation bindings, or cleanup ownership. Snapshot publication revisions advance for every distinct machine/issue/lifecycle publication; private machine-turn and global evidence sequence remain separate. Lifecycle snapshots precede ordered lifecycle evidence. `actor:restore` is a persistence fact from `prepared` to `prepared` and precedes `actor:start`; `actor:start` means first activation, `actor:suspend` means `active -> suspended`, `actor:resume` means `suspended -> active`, and `actor:dispose` is terminal from any non-disposed lifecycle. Fresh creation, boot restoration, attachment, owner disposal, and runtime disposal remain distinct causes.
- Accepts: `actor:start`, `actor:restore`, `actor:suspend`, `actor:resume`, `actor:dispose`; lifecycle payloads with exact actor/app/plan/incarnation metadata, `from`, `to`, cause, timestamp, revisions, and global sequence.
- Rejects: React-owned actor state/mailbox/operation bindings/cleanup, `actor:prepare`, lifecycle TurnRecord/machine-turn revision, live-state reread for evidence payload.
- Observable guarantee: Inspection observes lifecycle `to` after snapshot publication; bounded sink overflow never blocks or rolls back actor truth. A restored provider/consumer projection cannot be resumed from a missing, foreign, or tombstoned provider.
- Proof: `HOST-P02`, `HOST-P05`, `SNAP-P01`.
- Trace: `SNAP-001`, `SEM-028`, `ARCH-022`, `PUBLIC_API.md` `API-006`.

### HOST-006 — RuntimeSetup and Runtime cross bootstrap before host escape

- Surface: `runtimeSetup(...).construct()`, private phase, `runtime.ready()`.
- Rule: Live hosts construct production Runtime and cross `constructed | booting | ready | failed | disposed` before ordinary work/handle escape. After bootstrap, `ensureActor`/`createActor` use one linearized admission transaction: validate provenance/ref/input/bindings/providers/tombstones/cycles, install silent baseline/edges, attach/activate, expose lease last.
- Accepts: Concurrent ensures joining one actor lifetime; `runtime.ready()` as the sole public readiness Effect.
- Rejects: Exposed phase union, second readiness API, partial handle/snapshot/generation/store/evidence, or reverse-order rollback omission.
- Observable guarantee: Failed admission leaves no partial actor truth; host readiness and actor lifecycle remain separate.
- Proof: `HOST-P01`, `HOST-P05`.
- Trace: `ARCH-007A`, `ARCH-029`, `SEM-027`, `SEM-029`, `REV-COMP-015`.

## React

### HOST-007 — FlowProvider accepts only an already-created runtime

- Surface: `<FlowProvider runtime={runtime}>`.
- Rule: Provider receives only an already-created Flow Runtime. Persistence enters through the same RuntimeSetup before React; Runtime owns persistence readiness/restoration/disposal. FlowProvider is the sole React context wrapper and observes cached `runtime.ready()`.
- Accepts: Browser runtime constructed once outside React bootstrap; request/Story runtime owned by its scope; private readiness adapter for runtime acquisition state only.
- Rejects: Provider app/Implementation/boot payload/factory/actor ID/startup policy/storage/codec/restore callback; React assembly/acquisition/actors/hydration/mutable state/disposal; a second unrelated runtime silently merged.
- Observable guarantee: Nested unrelated runtimes are diagnosed as explicit boundaries and never share actor lookup, persistence, subscriptions, or lifecycle ownership.
- Proof: `HOST-P02`, `HOST-P03`.
- Trace: `ARCH-018`, `ARCH-032`, `HOST-013`, `REV-HOST-001`, `REV-HOST-006`.

### HOST-008 — `useActor` prepares one fresh local actor and attaches that actor

- Surface: `useActor(machine, options?)`.
- Rule: Create one fresh local actor per component incarnation, including void-input machines; options supply exact fresh input and declared bindings, never a stable ID. Render preparation creates final opaque ref, pure initial snapshot, stable handle, bounded real command mailbox, and optional passive provisional context cut, but no runtime registration/edge/ownership/scope/subscription/work/evidence.
- Accepts: Commit-time provider identity/revision recheck, current provider truth replacing stale provisional cut, atomic baseline install/activation, exactly-once command drain, 64 buffered commands.
- Rejects: >64 commands, changed construction tuple without keyed-remount diagnostic, prepared actor replacement/reused memory, abandoned registration/work/evidence/disposal obligation, or `useActorByRef` construction.
- Observable guarantee: Abandoned preparation closes once and remains inert; imperative `runtime.createActor` remains the immediately attached non-React path.
- Proof: `HOST-P02`, `HOST-P04`.
- Trace: `ARCH-018`, `SEM-001A`, `HOST-009`, `REV-HOST-002`.

### HOST-009 — React owns attachment lifetime through the production lifecycle

- Surface: React Effect setup/cleanup; lifecycle `prepared | active | suspended | disposed`.
- Rule: Setup activates prepared or resumes suspended; cleanup genuinely suspends the same actor. No grace period, cleanup suppression, prediction of later setup, or terminal disposal. Suspension closes commands immediately, releases active registration/observer/context subscriptions/continuing scopes/timers, preserves ref/handle/state/memory/context/cursors/occurrence records/absolute deadlines, and waits for production finalizers before resume reconciliation.

```ts
prepared | active | suspended | disposed;
```

The transitions are `prepared -> active <-> suspended` with a terminal transition to `disposed`.
`prepared` means never attached, with no live runtime resources and command buffering enabled;
`active` means command admission and live resource ownership are enabled; `suspended` preserves
actor continuity while rejecting commands and owning no live attachment resources; `disposed` is
terminal and rejects later operations.

Suspension closes command admission immediately and releases the active runtime registration,
observer fanout, context subscriptions, continuing-activity scopes, and installed timers. Commands
through an escaped suspended handle fail with a stable actionable diagnostic and are never buffered;
buffering is permitted only while initially prepared.

Suspension preserves the exact ref, public handle, state, immutable memory, last committed inherited
context, mailbox cursors, operation-occurrence records, and absolute timer deadlines. Resume reattaches
the same actor, reacquires continuing activities and subscriptions through production kernels,
reinstalls timers against existing absolute deadlines, and reconciles context bindings against current
provider snapshots. An elapsed deadline is due on resume rather than receiving a fresh duration;
changed provider values use the ordinary serialized context-turn path and `Object.is`-equal values remain
silent.

Resume does not rerun input, memory initialization, initial-state construction, committed events, finite
actions, or baseline `onContext`. Suspension and resume do not manufacture a second operation attempt,
machine-turn revision, or `TurnRecord`; a later real queued fact may do so normally. Suspension is
serialized with the actor mailbox: commands admitted before the close point retain FIFO order, later
commands reject, and suspended commands are never buffered. Queued finite occurrences settle without
starting adapters, unsettled finite work receives the production interruption request, continuing
streams close without a mapped domain outcome, timers retain absolute deadlines, and pending outcomes
and occurrence cursors remain. If an adapter ignores interruption, Flow retains only the minimum fact
needed for truthful settlement and never claims reversal of an irreversible effect. Resume waits for
finalizers, then reconciles continuing declarations and due timers without replaying finite work. A
cleanup defect leaves the actor suspended and blocks resume until owner or runtime disposal.

| Lifecycle | Commands | Subscriptions |
| --- | --- | --- |
| `prepared` | Buffer up to 64 | Replay and become live on activation |
| `active` | Admit | Remain live |
| `suspended` | Reject without buffering | Replay once and complete |
| `disposed` | Reject without buffering | Replay terminal snapshot and complete |

`can(event)` remains pure transition legality, separate from command admission.
- Accepts: Strict Effects and Activity hide/reveal; commands admitted before close retaining FIFO; current provider changes through ordinary context wave; elapsed timer due on resume; suspended snapshots remaining readable.
- Rejects: Buffering suspended commands, rerunning input/initializer/events/finite actions/baseline `onContext`, replaying finite work/emissions, automatic retry/remote rollback, new operation attempt, machine turn, or TurnRecord from suspend/resume alone.
- Observable guarantee: Cleanup is an actual suspended lifecycle; cleanup defect leaves suspended and blocks resume until owner/runtime disposal. Prepared/active/suspended/disposed command and subscription matrix follows `SEM-007`.
- Proof: `HOST-P02`, `HOST-P05`.
- Trace: `ARCH-030`, `SEM-020`, `SEM-024`, `REV-HOST-003`, `REV-HOST-004`, `REV-HOST-005`.

### HOST-010 — `useActorByRef` is lookup-only

- Surface: `useActorByRef(ref)`.
- Rule: Synchronously resolve one already-registered shared actor from current Provider runtime and return its stable command handle. A changed ref resolves the new registered handle.
- Accepts: Command-only, non-reactive lookup.
- Rejects: `ensureActor`, construction, ownership, disposal, subscription authority, missing/foreign/disposed/opaque-local/mismatched refs.
- Observable guarantee: Ref changes do not create or replace actor lifetimes.
- Proof: `HOST-P02`, `HOST-P03`.
- Trace: `HOST-002`, `ARCH-019`.

### HOST-011 — `useView` is the sole ordinary React read path

- Surface: `useView(actor, selector)`.
- Rule: Accept one exact actor handle; selector receives atomic state, immutable memory, readonly context, lifecycle, issues, bound `can(event)`, and passive `O`. `O` may expose only `key`, `getData`, `getState`. Track exact descriptor/`K` reads, replace dependency set after evaluation, and rerun on matching actor/StoreFanout publication against one tear-free cut.
- Accepts: Scalar/non-record `Object.is`; named-record fixed-key fieldwise `Object.is`; explicit React-only `useShallow`; selector identity changes without replacing actor subscription.
- Rejects: Machine family/ref/view ID, comparator argument, actor creation/disposal, ownership/cache policy changes, registered views, broad subscriptions, binding components, view-bound `can`, operation acquisition, refresh/subscribe/commit/write/invalidate/clear, or selector retry loops.
- Observable guarantee: Passive selectors cannot mutate runtime; selector exceptions are memoized by exact publication/store cut and retry only after later matching publication. Initial attachment/hydration selector defects abort admission without partial actor.
- Proof: `HOST-P02`, `HOST-P03`, `SNAP-P01`.
- Trace: `ARCH-019`, `SEM-025`, `SEM-026`, `REV-HOST-006`, `REV-HOST-007`, `REV-OPS-015`.

## SSR, requests, and persistence

### HOST-012 — SSR preparation remains inert until attachment

- Surface: SSR/concurrent render preparation and committed attachment.
- Rule: SSR uses the same prepared actor rule: pure snapshot, final opaque ref, stable handle, bounded command buffer, optional passive provisional context cut only. Committed host attaches the same actor, rechecks provider identity/revisions, installs current context baseline, activates, and drains.
- Accepts: Stale provisional cut replaced by current provider truth; abandoned server render mailbox closed/inert; 64-command bound.
- Rejects: Ownership/registry/edge/subscription/work/evidence during render, replacing with a second actor/runtime, selector defect partial exposure, or persisted/emitted provisional cut.
- Observable guarantee: SSR preparation is inert until commit attachment.
- Proof: `HOST-P02`, `HOST-P04`.
- Trace: `ARCH-018`, `SEM-001A`, `HOST-008`.

### HOST-013 — Request hosts use production runtime construction

- Surface: request preload/render host.
- Rule: Request hosts use production RuntimeSetup, Runtime, AppPlan bootstrap, typed machine events, and production operation kernels. Each request runtime is isolated and disposed by its owner.
- Accepts: Retained request helper handler and cleanup-failure guarantees unless separately revised.
- Rejects: Browser/runtime sharing, automatic roots, testing-only actor engine, fabricated child/final snapshots, second runtime for prepared SSR, or bypassed operations.
- Observable guarantee: Request behavior has the same ownership and cleanup semantics as live hosts.
- Proof: `HOST-P04`, `HOST-P05`.
- Trace: `ARCH-010`, `ARCH-032`, `HOST-006`.

### HOST-014 — Persistence is provider-owned and context-closed

- Surface: `RuntimeSetup.persistence`, provider codec/storage, dehydrate/hydrate.
- Rule: Runtime owns persistence; no mutable hydration API, public boot payload/decoder, or assertion-cast persisted input. Restore declared persistable memory/refs without input/initializer replay. Capture only non-disposed stable actors opted in by declaration plus transitive stable provider closure; capture between completed context waves as one context-closed cut with exact bindings/provider revisions.
- Accepts: Bounded JSON-safe default codec or provider-supplied custom codec; dependency-ordered provider-before-consumer hydration; derived context installed silently before continuing work/handle escape; retryable `ConcurrentDehydrate`.
- Rejects: Serialized selected context overriding provider truth, opaque local provider serialization/promotion/recreation/substitution/rebinding, local/disposed/tombstoned actors, or `NonDurableContextProvider` treated as retryable.
- Observable guarantee: Opaque provider failure carries a `FlowPersistenceError` with kind
  `NonDurableContextProvider`, the durable consumer ID, opaque provider diagnostic ID, provider machine ID,
  and every failing `contextBindings.<key>` path. Its remediation names `actorRef(providerMachine, id)`
  plus `runtime.ensureActor(ref, ...)`; it never suggests ID-bearing `runtime.createActor`. Hydration emits
  no `onContext` event and never invents selected context truth. A restored stable actor remains Runtime-
  owned even when the current Runtime did not repeat `ensureActor`.
- Proof: `HOST-P04`, `SNAP-P01`.
- Trace: `ARCH-008`, `ARCH-013B`, `SEM-002A`, `SEM-027A`, `REV-COMP-005`, `WIRE-000A`, `WIRE-008`.

### HOST-015 — Effect bridges retain runtime service and error truth

- Surface: runtime Effect bridges, `runPromiseExit`.
- Rule: Bridges execute Effects against the installed runtime Context and reuse the production runtime. `runPromiseExit` resolves an Exit retaining Effect and Implementation/runtime failure truth without a second execution Scope.
- Accepts: Requirements satisfied by installed Context.
- Rejects: Hidden acquisition failure in a second Scope or an unowned execution Scope.
- Observable guarantee: Host bridge error truth matches runtime readiness/Effect truth.
- Proof: `SEM-023`, `HOST-P05`.
- Trace: `ARCH-005`, `ARCH-026`, `ARCH-032`.

### HOST-017 — Trusted host writes are construction-scoped

- Surface: package-private `HostWriteLease` for boot/SSR/Fixture seeding.
- Rule: Only the owning RuntimeSetup/Runtime Scope mints a capability-scoped lease for its exact AppPlan, runtime identity, and allowed boundary. The lease validates exact admitted descriptor/`K` before entering StoreKernel authoritative write path and carries runtime/capability epoch.
- Accepts: Same generation fencing, revision, fanout, and authoritative-write rules as accepted `setData`; construction-scoped boot/SSR/fixture use.
- Rejects: Public construction/storage/callability, foreign/revoked/stale lease, generic runtime writer registry, actor occurrence, domain event, machine turn, or public writer API.
- Observable guarantee: Scope close/runtime disposal revokes the lease; invalid lease fails before StoreState mutation/publication.
- Proof: `HOST-P01`, `SNAP-P01`.
- Trace: `SEM-017`, `ARCH-013`, `SEM-028`.

## Disposal and proof obligations

### HOST-016 — Disposal is owner- and runtime-scoped

- Surface: owner lease, runtime shutdown, React cleanup.
- Rule: Ordinary actor/ref has no terminal authority; lease is individual owner; runtime shutdown subsumes leases; React cleanup suspends. Runtime disposal closes admission, cleans actors/activities/operation ownership/context/runtime resources, preserves Cause classification, accepts/drains linearized lifecycle/TurnRecord evidence, then closes sinks/queues.
- Accepts: Suspended dependency edges retained; lifecycle publication before evidence; cleanup ordering and cause diagnostics preserved.
- Rejects: Synthetic terminal TurnRecord, disposal on React cleanup, dropped lease disposal, or completion claim while accepted evidence/finalizers remain.
- Observable guarantee: Shutdown completes only after owned finalizers and accepted evidence are processed.
- Proof: `HOST-P05`.
- Trace: `HOST-003`, `HOST-009`, `ARCH-025`, `SEM-028`.

### HOST-P01 — Bootstrap and ownership proof

- Surface: admission/identity/ownership/bootstrap proof.
- Rule: Prove closed `App.M`, unique machine IDs, stable/opaque refs, restoration, fresh input, exact bindings, lookup/local creation, lease authority, dependent-disposal rejection, tombstones, graph sealing, reverse rollback, private phases, trusted HostWriteLease provenance/revocation/fencing, and absence of roots/disposal on ordinary handles.
- Accepts: Executable proofs across live/request/Story/test scopes.
- Rejects: Focused type/source checks presented as runtime lifetime proof or legacy root categories treated as active behavior.
- Observable guarantee: All admission and ownership boundaries have evidence-backed closure.
- Proof: This is the host bootstrap proof index; pair with `SNAP-P01` and `HOST-P04`.
- Trace: `HOST-001`–`HOST-003`, `HOST-006`, `HOST-017`.

### HOST-P02 — React lifecycle proof

- Surface: prepared/attachment/suspension/resume/lookup React behavior.
- Rule: Prove final ref/handle identity, provisional context recheck, keyed-remount diagnostics, prepared delivery/64 bound, inert abandonment, exact lifecycle, Strict Mode reconnection, Activity hide/reveal, serialized suspension, retained provider edges, fail-closed resume, no active work after final unmount, lookup-only changed ref, selector defect memoization/retry, and nested-runtime diagnostics.
- Accepts: Production actor/mailbox/context/store paths and dependency cleanup.
- Rejects: React-owned actor engine/state or passing only render-time preparation as active runtime proof.
- Observable guarantee: React controls attachment lifetime only and never silently combines runtimes.
- Proof: Runtime behavior plus `SNAP-P01` passive-read proofs.
- Trace: `HOST-007`–`HOST-012`, `SEM-024`–`SEM-026`.

### HOST-P03 — Selector and host parity proof

- Surface: `useView`/passive reads/live-Story parity.
- Rule: Prove exact selected types, shared equality, optional `useShallow`, passive O reads, no comparator/registered views, production mailbox/operation/context/scheduler/inspection/atomic-read/cleanup parity, dependency replacement, StoreFanout reruns, tear-free reads, and no passive work.
- Accepts: Named family reads and cross-actor canonical sharing with actor-effective isolation.
- Rejects: Direct StoreState subscription, selector ownership, Story result injection, or a second semantic model.
- Observable guarantee: React and Story observe the same Flow semantics.
- Proof: `SNAP-P01`, `SEM-006A`, `SEM-026`.
- Trace: `HOST-004`, `HOST-011`, `ARCH-020`.

### HOST-P04 — SSR and persistence-host proof

- Surface: SSR preparation/attachment, request construction, persistence capture/hydration.
- Rule: Prove inert SSR, same-actor attachment, provisional recheck, production request runtime, context-closed dehydration, provider-revision capture, opaque-provider rejection, dependency-ordered hydration, stable-ref tombstones, and no context-event replay/second truth source.
- Accepts: Production owner and HostWriteLease boundaries.
- Rejects: Server-only actor lifecycle, second runtime, public hydration path, or selected context serialized as authoritative.
- Observable guarantee: Restored/prepared actors use production owners and persist only declared durable closure.
- Proof: `SNAP-010`, `HOST-014`, `HOST-017`.
- Trace: `HOST-008`, `HOST-012`–`HOST-014`.

### HOST-P05 — Disposal and evidence-drain proof

- Surface: owner/runtime cleanup, evidence hub, errors.
- Rule: Prove owner-lease cleanup, runtime shutdown, ordered lifecycle evidence with immutable asynchronous payloads, admission closure, accepted-record drain, no synthetic terminal TurnRecord, frozen `FlowStoryExecutionError`, deterministic cleanup diagnostics, and retained Effect error truth.
- Accepts: Sink-local truncation/detach without runtime rollback; cleanup failure retaining captured end evidence while rejecting Story success.
- Rejects: Declaring disposal complete with pending accepted evidence/finalizers or using sink processing as runtime truth.
- Observable guarantee: Cleanup and evidence are complete and inspectable without a second history.
- Proof: `SEM-023`, `SEM-024`, `SEM-028`, `ARCH-025`.
- Trace: `HOST-003`, `HOST-005`, `HOST-016`.
