
# Glossary and identity contract

Status: locked

This file owns Flow terminology and durable/concurrent identity. Other active contracts reference
these rules; they do not redefine them. The active clauses in this contract pack are authoritative.
The revision specification, accepted decisions, proposals, and archived records preserve provenance
only and do not override a contract clause. The corresponding file under `contracts/provenance/` is
the current semantic source and provenance record for this restoration; it is not a competing active
authority, and its transferred wording and IDs MUST NOT be erased by the enhanced shape below.
Affected removed or replaced surfaces defer to `DEL-001` through `DEL-011`; a `REPLACE` entry removes
the old surface and does not permit an alias, overload, adapter, or compatibility wrapper.
Explicitly retained boundaries remain authoritative under `RET-001` through `RET-005`.

## GLO-01 — Definition

### Surface

- One immutable value: explicit machine identity; named state/event schemas; input; readonly
  provider selectors; pure initial-memory factory; flat named operation catalogue.
- Declares one complete static actor family; owns no transition or activity behavior.

### Rule

- Context is pure derived data from an exact provider actor; mutable actor-local domain data is memory.
- Authored IDs and local state/event names preserve spelling; each is non-empty and at most 256 UTF-8
  bytes, with no C0 control, DEL, lone surrogate, or NUL code point.
- No Unicode normalization or locale-sensitive comparison. Composite IDs use
  `<utf8ByteLength>:<segment>` plus a fixed namespace tag; delimiter concatenation is forbidden.
- Durable stable refs use `actor:` plus machine-ID then authored-ID segments. Opaque refs are
  runtime-local and have no durable encoding. State tokens preserve complete paths, for example
  `S.ACTIVE.S.EDITING`; events use one machine-wide protocol.

### Accepts

- The exact definition-derived state/event tokens and the `WIRE-008` stable-ref encoding.
- Canonical operation identity as defined by `PUBLIC_API.md` `API-005`.

### Rejects

- Invalid names, normalization-dependent identity, locale ordering, raw delimiter IDs, and partial
  or duplicate declarations.

### Observable guarantee

- Equal source spellings remain equal only by exact spelling; composed and decomposed spellings are
  distinct identities.

### Proof

- Definition, recursive-token, event-nominality, name-bound, and stable-ref compile/runtime proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-01`; canonical-key detail: `PUBLIC_API.md#API-005`.

## GLO-02 — Machine and actor

### Surface

- A machine is reusable immutable behavior bound to one definition.
- An actor is one live instance with its own ref, mailbox, state, memory, context, operation
  ownership, publications, and lifecycle.

### Rule

- A machine owns transition legality, guards, memory updates, redirects, timers, activities,
  compound behavior, and context-to-event registrations.
- Recursive substates share the actor's memory, context, events, mailbox, operations, and lifetime;
  they have no actor, input, completion, snapshot, or address of their own.
- Machine states are mutually exclusive durable modes. Resource, transaction, stream, and timer
  statuses are overlapping operation lifecycles, not a Cartesian state product.

### Accepts

- Any number of independent actors backed by one machine.

### Rejects

- Child actors, child inputs, child completions, child addresses, or operation statuses represented
  as machine states.

### Observable guarantee

- Substate activity never changes actor identity or creates a second actor lifecycle.

### Proof

- Recursive state and exact actor-family proofs in `TYPE_SYSTEM.md` `TYPE-001`–`TYPE-004`, `TYPE-012`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-02`.

## GLO-03 — Memory, input, and context

### Surface

- Input is supplied once to fresh actor creation. `memory: ({ input }) => Memory` is the sole source
  for `InputOf` and `MemoryOf`; omitting its argument fixes input to `void`.
- Memory is actor-local mutable domain state. Context is inherited readonly projection from exact
  provider refs.

### Rule

- Accepted machine transitions alone change memory. Memory is not cache, server projection, operation
  status, or an escape hatch.
- Restored actors retain serialized memory and never replay input or invoke the initializer.
- Input never changes on a running actor and does not classify local versus shared actors.
- Ordered context turns may change context. If a context value identifies another domain instance,
  the host replaces or re-keys the actor rather than retaining memory across the identity change.

### Accepts

- Fresh input once; persisted memory on restore; exact readonly provider projections.

### Rejects

- Separate initial-memory authority, input replay, runtime input mutation, or context-as-memory.

### Observable guarantee

- `InputOf` and `MemoryOf` are stable across machine inference and restoration.

### Proof

- `TYPE_SYSTEM.md` `TYPE-003`, `TYPE-017`; restoration and context-graph proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-03`.

## GLO-04 — Operation descriptor and family

### Surface

- A descriptor is reusable inert configuration for one named resource, transaction, or stream family.
- Definitions admit descriptors through flat named `operations`; machines receive exact actor-bound
  families through `O`.

### Rule

- A descriptor ID names a family, never parameterized runtime work.
- Declaring/reading a descriptor, projecting a key, or constructing an unreturned plan starts no work.
- Accepted family forms are descriptor-specific `key`, passive `getData`/`getState`, resource
  `lookup`/`subscribe`/`refetch`/`setData`/actor-owned `cancel`, transaction `commit`/`cancel`, and
  stream `subscribe`.
- The named catalogue is closed.

### Accepts

- Exact named operation access through `O` and the family methods in `PUBLIC_API.md` `API-006`.

### Rejects

- Generic registries, operation references, bound entries, and public operation enumeration.

### Observable guarantee

- Inert declaration and passive reads cannot acquire ownership or begin external work.

### Proof

- `PUBLIC_API.md` `API-006`–`API-009`; `TYPE_SYSTEM.md` `TYPE-005`–`TYPE-007`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-04`.

## GLO-05 — Executable input `P` and canonical key domain

### Surface

- `P` is complete immutable executable input retained by live lookup, transaction attempt, or stream
  subscription. It may contain clients/functions and is never identity.
- `K` is the synchronously projected ordered readonly canonical tuple. Resource/transaction identity
  is descriptor ID plus `K`; a live stream also retains its declaration slot.

### Rule

- Service dependencies belong to inferred `R`; runtime-owned capabilities remain outside `P`.
- Canonicalization accepts ordinary dense arrays/plain records, copies into Flow-owned containers,
  recursively freezes them, freezes the top-level tuple, sorts record keys, normalizes `-0` to `0`,
  rejects hostile reflection/unsupported values, and uses the bounded UTF-8 `KBytes` grammar.
- Capability, tenant, account, network, permission, session, and every result-changing discriminator
  must be in `K`; runtime partitioning is not a substitute.

### Accepts

- Complete `P` for executable methods; canonical `K` for passive/key-addressed methods.

### Rejects

- Treating `P` as identity, reconstructing required `P` from `K`, second identity projections,
  custom equality/hash, or omitted result-changing discriminators.

### Observable guarantee

- Equal canonical keys identify equivalent canonical results within one runtime identity domain.

### Proof

- Canonical grammar, defensive-copy/freeze, bounds, reflection, and identity proofs in
  `PUBLIC_API.md` `API-005` and `TYPE_SYSTEM.md` `TYPE-005`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-05`; owner: `PUBLIC_API.md#API-005`.

## GLO-06 — Machine, actor, and operation identity

### Surface

- Descriptor IDs use GLO-01 grammar and validate at pure app compilation.
- Every actor backed by `M` has exact `ActorRef<M>`; stable refs are durable shared identity and
  opaque refs are runtime-local local identity.
- A Story-local recipe is identified by recipe object identity within one run.

### Rule

- Operation identity is descriptor ID plus canonical `K`; complete `P` need not be reconstructible.
- Refs carry no input, bindings, construction policy, ownership, subscription, or disposal authority.
- A recipe carries exact machine, fresh input, and exact compatible bindings, but no runtime/live owner.
- `RunLocalId` identifies a Story run/recipe in that run. `ActorIncarnationId` identifies one runtime
  lifetime. They are independent: one recipe can materialize multiple incarnations, and a later
  incarnation cannot inherit an earlier one.

### Accepts

- Exact machine-branded refs, stable IDs, opaque runtime-local refs, and inert recipes.

### Rejects

- Using descriptor ID alone as parameterized work identity, using either ID domain as the other, or
  embedding ownership/construction state in refs or recipes.

### Observable guarantee

- Incarnation and run identity prevent late facts from crossing actor lifetimes or Story runs.

### Proof

- `PUBLIC_API.md` `API-011`; `TYPE_SYSTEM.md` `TYPE-012`, `TYPE-015`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-06`.

## GLO-07 — App, module, `App.M`, and `AppPlan`

### Surface

- A module is inert tooling metadata with unique app-local ID and exact keyed `machines`.
- An app has explicit ID, persistence version, ordered unaliased modules, and immutable compiled
  `AppPlan`; `App.M` is the complete machine/operation admission universe.

### Rule

- Flattening preserves machine property names. Duplicate durable machine IDs, machine values, or
  tooling owners fail compilation even when property names differ.
- Compilation creates zero actors. Listed machines remain reusable behavior; runtime cannot expand
  the executable universe. Runtime identity is Flow-runtime-scoped; no process-global catalogue.
- Module ID groups CLI slicing, traces, inspection, behavior artifacts, and module diffs, but is not
  machine/actor/persistence/context/runtime/operation identity.
- Renaming or moving tooling ownership is artifact-breaking: use a different group/path and no silent
  compare/alias. Runtime/persistence identity remains compatible; preserving history needs migration.

### Accepts

- Local, shared, and Story-local creation from machines listed in `App.M`.

### Rejects

- Duplicate ownership, `dynamicMachines`, automatic-root admission, runtime machine-family lookup,
  or module ID aliasing.

### Observable guarantee

- `App.M` and `AppPlan` are closed and immutable for the runtime lifetime.

### Proof

- `PUBLIC_API.md` `API-010`; `TYPE_SYSTEM.md` `TYPE-009`–`TYPE-010`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-07`.

## GLO-08 — Actor identity and ownership

### Surface

- `actorRef(machine, id)` is inert. `ensureActor` is durable restore-or-create and returns
  `{ actor, dispose }`; `getActor` is lookup-only; `createActor` always creates a fresh local actor
  and returns a lease.

### Rule

- Only the owning production `Runtime` or designated runtime owner invokes ownership-capable ensure.
- One stable ref per runtime incarnation has one shared lease/lifetime; concurrent ensures join it with
  no per-caller reference counts. Boot-restored actors receive the runtime lease before handles escape.
- A ref is branded to its exact machine, not to one app, and runtime app identity qualifies persisted
  actor identity.
- If Runtime does not ensure a stable actor, runtime ownership lasts until explicit disposal or runtime
  shutdown.
- Lease disposal is async, idempotent, terminal, and rejected before disposal while active/suspended
  consumers remain bound. Successful stable disposal tombstones the ref until runtime shutdown; a later
  runtime may reuse it. Suspended consumers retain logical edge, provider ref/key/incarnation/revision.
- Admission validates the complete binding graph atomically and rolls back in reverse order. Dehydration
  captures every registered non-disposed durable stable actor, including suspended and boot-restored actors,
  plus the transitive stable-provider closure; excludes local, disposed, and tombstoned actors. Opaque
  providers fail closed under `NonDurableContextProvider`.

### Accepts

- `Runtime`-owned shared leases and Story-local creation leases with separate disposal authority.

### Rejects

- Individual disposal on ordinary actor handles/refs, per-caller refcounts, missing/foreign/cyclic
  provider graphs, and opaque persistence providers.

### Observable guarantee

- A handle escapes only after ownership, graph admission, and activation ordering is valid; a disposed
  stable ref cannot be looked up or ensured again in that runtime incarnation.

### Proof

- `PUBLIC_API.md` `API-011`–`API-012`; lease, tombstone, graph, and lifecycle proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-08`.

## GLO-09 — Binding, operation occurrence, and timer identity

### Surface

- `AppPlan` assigns stable declaration slots. Activity identity uses machine/state/activity/ordinal;
  `onMemory` has its authored slot; timer identity uses machine/state/`timer`/authored timer name.

### Rule

- Continuing binding identity is declaration slot + operation kind + exact descriptor + `K`;
  retained `P` is not identity. Activation generation is monotonic instance metadata.
- Equal normalized identity retains work. Changed selector, kind, descriptor, or `K` releases/acquires.
  `false`/`null` release only their declaration. Equal fresh plans retain by slot/identity, not object/P.
- Finite occurrences come only from accepted event-transition `actions`; carry actor incarnation,
  kind, descriptor, `K`, one-based non-reused ordinal, and for shared resources generation/lease epoch.
- Resources/streams are owned by activities or `onMemory`; streams are not resource-store entries and
  have no actor `cancel`. Occurrence/restart laws follow `REV-OPS-015`.

### Accepts

- Exact declaration-slot binding and occurrence identity with separate generation metadata.

### Rejects

- Array ordinal reuse for timers, plan/P identity, runtime-sized single-entry arrays, or stream actor
  cancellation.

### Observable guarantee

- Equal continuing plans reuse the original generation and executable `P`; stale occurrences cannot
  settle another incarnation.

### Proof

- `PUBLIC_API.md` `API-006`–`API-009`; `TYPE_SYSTEM.md` `TYPE-007`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-09`; terminal/restart detail: `REV-OPS-015`.

## GLO-10 — Generation, revision, and turn

### Surface

- A generation orders attempts for one runtime identity. A revision identifies an immutable published
  canonical store or actor snapshot. A turn is one serialized actor mailbox command.

### Rule

- Generation checks fence stale completions even when interruption is requested.
- Canonical store revision increments for canonical values, generations, freshness, invalidation,
  hydration, eviction. Actor preview apply/remove/replay advances only initiating publication/overlay.
- Private actor `publicationRevision` increments every immutable snapshot publication; private
  `machineTurnRevision` only on committed machine turns. Public `snapshot.revision` is publication
  revision; no second public revision field.
- Prepared actor/store revisions start at 0; first generation/value revision/global evidence sequence
  is 1; controlled endpoint/subscription ordinals alone start at 0. Counters are non-negative safe
  integers, increment before mutation, and fail before wrap/reuse/partial publication. Collected store
  lifetimes may restart generation/value revision at 1; actor/global counters never reset.
- Lifecycle/issue-only publications change publication revision only; lifecycle and `TurnRecord` share
  one evidence sequence; projection-only publications retain machine-turn revision and create no record.
- Selector memoization, hydration, and checkpoints use public publication revision; inspection correlation
  may use publication revision, machine-turn revision, and runtime evidence sequence.
- Async completion is a later turn.

### Accepts

- Public snapshot revision, private ordering fields, and runtime-global evidence sequencing.

### Rejects

- Stale authoritative writes, counter wrap/reuse, lifecycle as machine turn, synthetic terminal
  `TurnRecord` on disposal, and actor transitions outside the mailbox.

### Observable guarantee

- Late fenced facts cannot overwrite or republish current facts; one turn publishes coherently.

### Proof

- Generation fencing, publication barrier, selector/checkpoint revision, and turn evidence proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-10`.

## GLO-11 — TurnPlan, CommitPlan, and TurnRecord

### Surface

- `TurnPlan` is the pure result of applying one command to one actor snapshot and stabilizing redirects.
  It contains intended state, memory, receipt intents, and activity changes. `CommitPlan` is package-private
  reconciliation commands. `TurnRecord` is immutable actual-fact evidence; `LifecycleRecord` is private
  lifecycle evidence.

### Rule

- `TurnPlan` performs no Effect and claims no completed Effect. Actions materialize finite plans only
  after guard acceptance; `onMemory` reconciles continuing plans separately.
- `CommitPlan` reserves generations, applies atomic actor/store changes, and stages work. Effects
  start/stop only from post-publication reconciliation queued on the same mailbox. Both plans are private.
- Evidence hub orders `TurnRecord` and `LifecycleRecord` before command acknowledgement. LifecycleRecord
  carries full lifecycle snapshot, actor/app/plan provenance, from/to/cause, publication revision,
  machine-turn revision, timestamp, and evidence sequence. Sinks process asynchronously after ack and
  reread no mutable actor state.
- Occurrences settle once; late results are fenced. Restored nonterminal work is not replayed; durable
  remote identity becomes `unknown` and reconciles through it. Disposal drains accepted evidence and
  creates no synthetic terminal `TurnRecord`.

### Accepts

- Actual committed evidence after publication and private lifecycle evidence through one sequence.

### Rejects

- Effects in planning, competing histories, lifecycle records treated as turns, and restored work replay.

### Observable guarantee

- Acknowledged commands have an ordered immutable evidence prefix independent of later sink processing.

### Proof

- Publication/evidence and operation settlement proofs in `PUBLIC_API.md` `API-014`, `API-016`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-11`.

## GLO-12 — Snapshot and actor state

### Surface

- One immutable public publication contains active leaf state, memory, inherited context, lifecycle,
  issues, `snapshot.revision`, and observed store revision.
- `state.matches(token)` recognizes leaf and active ancestors; nested state values are not exposed.
- Snapshot-bound `O` is passive named-family projection. Receipts are not snapshot fields.

### Rule

- `key`, `getData`, `getState` acquire no work/ownership/freshness and mutate nothing. `useView` cannot
  lookup/refresh/subscribe/commit/write/cancel/invalidate/clear.
- Exact descriptor/`K` reads are dependency-tracked per selector evaluation and rerun after matching
  actor/StoreFanout publication at one tear-free boundary. Projection reruns do not run transitions.
- Package-private `ActorState` atomically owns snapshot and durable binding facts. Persistence captures a
  context-closed cut: selected values are derived, exact provider refs and observed revisions retained.

### Accepts

- Lifecycle `prepared | active | suspended | disposed` and readonly passive snapshot projection.

### Rejects

- Mutable parallel owners, raw receipts in snapshots, nested state values, and mutation from selectors.

### Observable guarantee

- A selector observes one coherent snapshot/store boundary and cannot manufacture operation work.

### Proof

- `PUBLIC_API.md` `API-006`, `API-012`; `TYPE_SYSTEM.md` `TYPE-013`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-12`.

## GLO-08A — Persistence declaration and provider

### Surface

- `persist: true` is declaration metadata on stable refs or named resource/transaction/stream
  descriptors; false by default and not identity. Local actors never become restorable by operation.
- `Persistence` is one inert `RuntimeSetup` host provider for storage, codec, restoration, observation,
  ordered writes, and cleanup.

### Rule

- Persistable actors capture complete stable snapshots. Persistable operations contribute only their
  family facts in `PERSISTENCE_AND_ARTIFACTS.md`.
- Persistence does not choose the durable app set; filter can only exclude declared entries.
- Codec is pure application-value encode/decode; default accepts bounded JSON-safe values and rejects
  unsupported values without silently changing them.

### Accepts

- Optional `persist`, host storage, default/application codec, and declaration-owned filter.

### Rejects

- Persistence on opaque/local identity, undeclared entries selected by filter, unsupported values
  silently coerced, or Persistence added to `RequirementsOf<App>`.

### Observable guarantee

- Persistence remains inert until runtime readiness/disposal boundaries own its effects.

### Proof

- `PUBLIC_API.md` `API-005`, `API-008`, `API-009`, `API-012`; persistence proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-08A`.

## GLO-13 — Issue, receipt, and pending work

### Surface

- Issue is current structured failure/defect/interruption/cleanup/invariant information.
- Receipt is immutable causal evidence of accepted, started, published, rejected, interrupted, or
  finalized work. `pendingWork` is test/tooling inventory, not actor state or settlement.

### Rule

- Operational issue identity includes actor incarnation when present; later lifetimes cannot clear or
  inherit an old occurrence.

### Accepts

- Current issues in snapshot and bounded pending-work/evidence projections.

### Rejects

- Treating receipts as actor state, or pending inventory as settlement.

### Observable guarantee

- A later actor lifetime cannot mutate or inherit an earlier occurrence's issue.

### Proof

- `PUBLIC_API.md` `API-002`, `API-014`, `API-016`; lifecycle/incarnation proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-13`.

## GLO-14 — Passive actor selector and `MachineObserver`

### Surface

- A reusable view is an ordinary selector. `useView(actor, selector)` receives atomic state, readonly
  memory/context, lifecycle, issues, `can(event)`, and passive snapshot-bound `O`.
- `MachineObserver` is package-private exact-actor subscription/sharing adapter.

### Rule

- `useView` creates/disposes no actor and changes no ownership/cache policy. Scalar/non-record uses
  complete-value `Object.is`; named records use fixed-key field-by-field `Object.is`.
- `useView` takes no comparator. `useShallow(selector)` is only explicit React memoization for named
  records. MachineObserver owns no actor, lease, operation, retry, or query-result state machine.
- Passive O reactivity is internal under `REV-HOST-007`; selector defects use revision-scoped memoization
  and retry under `REV-COMP-003`/`REV-HOST-006`.

### Accepts

- Exact actor handle and passive `key`/`getData`/`getState` reads.

### Rejects

- Machine/ref/view-ID arguments, registered views, comparators, mutating O methods, and manual actor
  subscription for correctness.

### Observable guarantee

- Dependency sets are replaced after each evaluation; matching publications rerun one tear-free selector.

### Proof

- `PUBLIC_API.md` `API-012`; `TYPE_SYSTEM.md` `TYPE-013`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-14`; reactivity owner: `REV-HOST-007`.

## GLO-15 — Story, fixture, recipe, command, and checkpoint

### Surface

- Story plans are immutable/inert until `run()`. Recipes are deeply frozen exact-machine/fresh-input/
  exact-binding descriptions with no runtime, mailbox, snapshot, state, operation binding, lease, or handle.
- App Stories target exact recipe or app-owned stable ref. Machine Stories own one implicit fresh actor,
  target-free commands, selected initial context, and `setContext`.
- Fixture is immutable directly referenced per-run environment. Checkpoint is immediate frozen capture.

### Rule

- Story-local recipes materialize through production runtime provider-first and dispose leases in reverse
  dependency order. App Stories use production RuntimeSetup/Runtime and do not inject context directly.
- Commands are `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint`, `run`, `send`,
  plus `setContext` only on machine Stories. `process` drains ready work without moving time; clock
  movement does not process implicitly. `.run()` is the sole execution boundary.
- Story plans inject no operation results; complete Implementations provide external behavior.
- Evidence captures exact actor lookup, `runtime.now`, `runtime.pendingWork`, and automatic `run.end`.
  Capture does not progress, move time, create/dispose/restore, or perform external work; `run.end` does
  not imply completion. Focused context, adapters, persistence, capture, and cleanup follow
  `REV-TEST-005`–`REV-TEST-008`.

### Accepts

- `checkpoint.actor(recipe | ActorRef)` for app Stories and single `snapshot` for machine Stories.

### Rejects

- Bare app/live runtime Story inputs, focused boot/memory/state/snapshot overrides, extra actors, direct
  context injection in app Stories, result injection, and public package-private mechanisms.

### Observable guarantee

- Checkpoints and successful `run.end` are deeply frozen production read cuts; failed execution retains
  completed checkpoints and reports cleanup/cancellation/evidence diagnostics without false success.

### Proof

- `PUBLIC_API.md` `API-013`–`API-015`; `TYPE_SYSTEM.md` `TYPE-014`–`TYPE-017`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-15`.

## GLO-16 — Internal boot and artifact

### Surface

- Boot is package-private immutable runtime-constructor data carrying Flow structural data and opaque
  application payloads. Artifact is explicitly exported versioned behavior/trace envelope.

### Rule

- RuntimeSetup Persistence produces/consumes boot; consumers do not provide boot, decode, or hydrate.
  Flow validates structure/identity; applications validate opaque values through codec.
- Artifacts/CLI represent accepted app Stories, exact actor evidence lookup, `run.end`, module ownership,
  compound states, context requirements, lifecycle records, and operation identities.

### Accepts

- Route-owned artifact byte carrier and private boot path only at their owning boundaries.

### Rejects

- Public boot payloads, decoders, hydration calls, or artifacts that omit required identity/evidence.

### Observable guarantee

- Exact artifact/CLI closure remains `REV-MIG-005`; host seeding/trusted writes remain `REV-HOST-008`.

### Proof

- Persistence/artifact and CLI proofs; public absence proof in `PUBLIC_API.md` `API-P01`.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-16`.

## GLO-17 — Runtime phase and admission transaction

### Surface

- Private linearized phases: `constructed` shell; `booting` validation/acquisition/admission; `ready`
  ordinary work; `failed` no further admission; `disposed` terminal.

### Rule

- Phases are not authored machine state or a public phase union.
- Admission atomically validates app/plan provenance, identity, input, bindings, providers, tombstones,
  and cycles; installs silent baseline/edges, activates, then exposes ownership; failure rolls back
  reverse order. Suspended actors retain logical edges after attachments detach.

### Accepts

- Exact app/plan admission transaction and provider-first graph closure.

### Rejects

- Public runtime phase control, handle escape before graph sealing, partial admission, or forward-order
  rollback.

### Observable guarantee

- Admission either exposes a valid ownership graph or leaves no partially admitted graph.

### Proof

- `PUBLIC_API.md` `API-011`–`API-012`; runtime readiness and rollback proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#GLO-17`.

## Identity laws

### Surface

- `GLO-L1` equal stable refs address one logical actor and equal descriptor+K identities share canonical
  operation data and admitted resource generations only within one runtime incarnation; occurrences
  additionally require actor incarnation and occurrence ordinal.
- `GLO-L2` descriptor ID alone is never parameterized work identity.
- `GLO-L3` app, module tooling, `App.M`, refs, slots, operations, and recipe identities are separate.
- `GLO-L4` stale generation/incarnation facts finalize only bounded own evidence.
- `GLO-L5` passive reads/subscriptions/inspection never manufacture identity, ownership, state, or work.
- `GLO-L6` durable decode uses receiving `AppPlan`/`App.M`; providers restore before consumers.
- `GLO-L7` equal IDs in different runtimes remain isolated; tombstones are runtime-incarnation scoped.

### Rule

- Source/property order and runtime allocation order do not enter runtime or persistence identity.
- Continuing subscriptions are owned bindings, not passive observations; selected context cannot override
  provider truth.

### Accepts

- The seven identity separations and their exact runtime scopes.

### Rejects

- Cross-runtime ownership, stale overwrite, passive identity manufacture, module identity in durable
  addresses, and decode outside the receiving compiled app.

### Observable guarantee

- Identity equality is domain-scoped, generation-fenced, and independent of incidental allocation order.

### Proof

- Identity, persistence, stale-generation, passive-selector, and runtime-isolation proofs.

### Trace

- Provenance: `provenance/GLOSSARY_AND_IDENTITY.md#Identity laws` (`GLO-L1`–`GLO-L7`).
