# Glossary and identity contract

Status: locked

This contract gives every Flow concept one name and every durable or concurrent entity one
identity. Other contracts reference these rules rather than redefining the terms.

The accepted revision specification overrides conflicting clauses in this file. Affected removed
or replaced surfaces defer to `DEL-001` through `DEL-011`; a `REPLACE` entry removes the old surface
and does not permit an alias, overload, adapter, or compatibility wrapper. Explicitly retained
boundaries remain authoritative under `RET-001` through `RET-005`.

## Definitions

### GLO-01. Definition

A definition is one immutable value containing a stable explicit machine identity, named state and
event schemas, actor input, inherited readonly context selectors, a pure initial-memory factory,
and one flat named operation catalogue. It declares the complete static shape of one actor family
but owns no transition or activity behavior. A context selector is a pure projection from an exact
provider actor; context is readonly derived data, while actor-local mutable domain data remains
memory.

Every authored ID and local state/event name MUST retain its exact source spelling and be a
non-empty string of at most 256 UTF-8 bytes with no C0 control, DEL, lone-surrogate, or NUL code
point. Flow MUST NOT apply Unicode normalization or locale-sensitive comparison: composed and
decomposed spellings remain distinct identities. Composite authored IDs use the canonical segment
encoding `<utf8ByteLength>:<segment>` and a fixed namespace tag; raw delimiter concatenation is
forbidden. A durable stable `ActorRef` uses the fixed `actor:` namespace tag followed by two such
UTF-8 segments in order: machine ID, then authored stable ID. Opaque `ActorRef` values are runtime-local
and have no durable encoding.

State tokens are exact definition-derived tokens that preserve the complete readable state path,
including compound ancestors, such as `S.ACTIVE.S.EDITING`. Event tokens remain one machine-wide
event protocol. Stable-ref encoding follows `WIRE-008`; canonical identity encoding follows
`REV-OPS-016`.

### GLO-02. Machine and actor

A machine is reusable immutable behavior bound to one definition. An actor is one live instance of
that machine, and one machine MAY back any number of independent actors. The machine owns
transition legality, guards, memory updates, redirects, timers, activities, compound-state
behavior, and context-to-event registrations; the actor owns one exact ref, mailbox, state,
memory, inherited context, operation ownership, publications, and lifecycle.

Recursive substates express hierarchy inside the same actor. Substates share that actor's memory,
inherited context, event protocol, mailbox, operations, and lifetime; they have no independent
actor, input, completion, snapshot, or address. A machine state is a
durable mutually exclusive behavioral mode. Resource, transaction, stream, and timer statuses are
overlapping operation lifecycles and MUST NOT be expanded into a Cartesian product of machine
states.

### GLO-03. Memory, input, and context

Input is supplied once when a fresh actor is created. The definition's pure
`memory: ({ input }) => Memory` factory derives actor-local memory exactly once and is the single
inference source for `InputOf` and `MemoryOf`; omitting its argument fixes input to `void`. Restored
actors retain serialized memory and MUST NOT invoke the factory or replay input. Input does not
classify an actor as local or shared, and it MUST NOT change on a running actor.

Memory is local mutable domain state changed only by an accepted machine transition. It is not a
cache, server projection, operation status table, or general escape hatch. Context is inherited
readonly projection from exact provider refs and may change through ordered context turns. When a
changing context value identifies a different domain instance, the host MUST replace or re-key the
actor rather than retain its memory across that identity change.

### GLO-04. Operation descriptor and family

An operation descriptor is reusable inert configuration for one named resource, transaction, or
stream family. Its explicit ID identifies the descriptor family, never a parameterized runtime
instance. A definition admits descriptors through its flat named `operations` record, and the
machine receives actor-bound families for those exact names through `O`.

Declaring or reading a descriptor, projecting a key, or constructing an unreturned plan starts no
work. The accepted family methods are the descriptor-specific forms of `key`, passive `getData`
and `getState`, resource `lookup`, `subscribe`, `refetch`, `setData`, and actor-owned `cancel`,
transaction `commit` and `cancel`, and stream `subscribe`. The named catalogue is closed, so generic
registry, operation-reference, bound-entry, and public-enumeration surfaces do not exist.

### GLO-05. Executable input and canonical key domain

`P` is complete immutable executable input retained by a live lookup, transaction attempt, or
stream subscription. It may contain clients and functions and is never operation identity. `K` is
the ordered readonly canonical tuple projected synchronously from `P`; resource and transaction
identity use descriptor ID plus canonical `K`, while a live stream binding also retains its
declaration slot.

Canonical `K` follows `REV-OPS-016`: Flow accepts ordinary dense arrays and plain records, copies them
into Flow-owned containers, recursively freezes them, and freezes the top-level tuple. It sorts record
keys, normalizes `-0` to `0`, rejects hostile reflection and unsupported values, and uses the exact
bounded UTF-8 `KBytes` grammar. Capability, tenant, account, network, permission, session, and every
other result-changing discriminator MUST be represented in `K`; runtime partitioning is not a substitute.

### GLO-06. Machine, actor, and operation identity

Descriptor IDs use the authored-ID grammar in GLO-01 and are validated during pure app
compilation. Operation identity is descriptor ID plus canonical `K`; complete executable `P` is
not identity and need not be reconstructible from `K`. Equal `K` values assert equivalent
canonical results, so every result-changing discriminator MUST be represented in `K` or separated
by runtime.

Every actor backed by machine `M` has one exact machine-branded `ActorRef<M>`. A stable ref has an
authored durable ID and identifies one durable shared actor; a generated opaque ref identifies one
runtime-local actor and is neither durable nor restorable. A Story-local actor recipe is identified
by recipe object identity for one run. Refs carry no input, context bindings, construction policy,
ownership, subscription, or disposal authority. A recipe contains its exact machine, required
fresh input, and exact compatible context bindings, but no runtime or live ownership authority.

`RunLocalId` identifies a Story run or recipe within one run. `ActorIncarnationId` identifies one
runtime lifetime of an actor and is allocated independently for each actor lifetime. The two IDs MUST
not be substituted for one another: a recipe may materialize multiple actor incarnations, and a later
incarnation MUST NOT inherit the identity of an earlier one.

### GLO-07. App, module, `App.M`, and `AppPlan`

A module is an inert tooling boundary with a unique app-local ID and an exact keyed `machines`
record. Its authored machine property names are preserved when modules are flattened into the
app's exact `App.M` catalogue. The module ID groups CLI slicing, trace and inspection output,
behavior artifacts, and module-scoped diffs; it contributes to no machine, actor, persistence,
context, runtime, or operation identity.

An app has an explicit ID, persistence version, ordered unaliased module array, and an immutable
compiled `AppPlan`. `App.M` is the complete machine-admission and operation-admission universe.
Every admitted durable machine ID is unique in one `AppPlan`; duplicate IDs or duplicate machine
tooling ownership are compile-time failures even when module or `App.M` property names differ. App
compilation creates zero actor instances, and a listed machine remains reusable behavior rather than
an actor. Local creation, shared registration, and Story-local creation all use a machine in `App.M`,
and a running runtime cannot expand that executable universe. Runtime identity is scoped to the Flow
runtime; no process-global catalogue is part of the contract.

Renaming a module ID is artifact-breaking: the new build MUST use a different tooling group and
artifact path and MUST NOT silently compare or alias the old module section. The rename remains
runtime- and persistence-compatible because admitted machines, stable actor refs, restored actor
state, context bindings, and operation addresses do not contain the module ID; preserving history
requires explicit artifact migration. The one-tooling-owner rule is part of AppPlan compilation;
moving a machine between modules is artifact-breaking but does not change runtime or persistence
identity.

### GLO-08. Actor identity and ownership

`actorRef(machine, id)` creates an inert stable address without creating an actor. A stable ref is
the durable identity of a shared actor. A local actor receives a generated opaque runtime-local
ref; local creation accepts no stable ID and is not restorable. A ref is branded to its exact
machine, not to one app, and the runtime's app identity qualifies persisted actor identity.

`runtime.ensureActor(ref, { input, contextBindings? })` is the durable restore-or-create boundary
and returns the owner lease `{ actor, dispose }`. `runtime.getActor(ref)` is lookup-only and returns
the ordinary actor handle without an owner lease. `runtime.createActor(machine, { input,
contextBindings? })` always creates a fresh local actor and returns the owner lease. The actor
handle exposes its exact `actor.ref`; neither the handle nor the ref exposes individual disposal.

Only the production runtime factory or an explicit runtime owner may invoke the ownership-capable ensure
path. One stable ref in one runtime incarnation has one shared owner lease and actor lifetime; concurrent
ensures join that authority without per-caller reference counts. A boot-restored stable actor receives its
runtime-owned lease before any public handle escapes, and a later factory ensure joins it. If the factory
does not ensure it, runtime ownership lasts until explicit disposal or runtime shutdown.

Owner-lease disposal is asynchronous, idempotent, and terminal. It is rejected before disposal
begins while any active or suspended consumer remains bound to the actor's ref. A suspended consumer
retains its exact logical provider edge, provider ref, binding key, provider incarnation, last projection,
and provider revision. Successful disposal tombstones a
stable ref for the current runtime incarnation, so lookup and ensure reject that ref until runtime
shutdown; a later runtime may reuse the authored stable ref under ordinary boot rules. Runtime
factory-owned shared leases and Story-local creation leases retain their own disposal authority.
Post-bootstrap admission validates the complete binding graph atomically and rolls back in reverse
order on failure; concurrent ensures join one actor lifetime. Dehydration captures every registered
non-disposed durable stable actor, including suspended and boot-restored actors, plus the transitive
stable-provider closure. Local actors, disposed actors, and runtime-incarnation tombstones are excluded;
opaque providers fail closed under `NonDurableContextProvider`.

### GLO-09. Binding, operation occurrence, and timer identity

AppPlan assigns every authored item a stable compiled declaration slot. A state activity uses
machine ID, state-token ID, activity kind, and its declaration ordinal. An `onMemory` declaration
has its own authored slot. A timer uses machine ID, state-token ID, the literal `timer` kind, and
its unique authored timer name; it does not borrow an activity-array ordinal.

A continuing binding identity contains its declaration slot, operation kind, exact descriptor, and
canonical `K`; executable `P` remains retained by the live binding and is not identity. Activation
generation is monotonic instance metadata allocated when a binding is newly acquired, not part of
binding equality. Equal normalized identity retains existing continuing work; a changed selector
value, operation kind, descriptor, or `K` releases the old binding and acquires a new one. `false`
and `null` release only the declaration that returned them. A fresh equal plan retains existing work
by declaration slot and normalized operation identity, not plan-object or `P` identity.

Finite operation occurrences are actor-owned admissions from accepted event-transition `actions`.
Each occurrence carries its private actor-incarnation token, operation kind, descriptor ID, canonical
`K`, and one-based non-reused ordinal; shared resource work adds its generation and lease epoch.
Continuing resources and streams are owned by state activities or independent `onMemory` entries;
streams are not runtime resource-store entries and have no actor `cancel`. Occurrence terminality,
same-key cancellation, equal-key future `P` selection, and stream restart after hydration follow
`REV-OPS-015`. These rules do not weaken the incarnation and generation fences.

### GLO-10. Generation, revision, and turn

A generation orders attempts for one exact runtime identity. It prevents stale completion from
publishing current facts. Generation checks are required even when Effect interruption is
requested because external work may be uninterruptible.

A revision identifies an immutable published canonical store or actor snapshot. Canonical store revision
increments for canonical values, lookup generations, freshness, invalidation, hydration, or eviction;
actor-local preview apply/remove/replay advances only the initiating actor's publication and overlay cursor.
Each actor has one private `publicationRevision` that increments for every immutable snapshot publication
and one private `machineTurnRevision` that increments only for a committed machine turn. The public
`snapshot.revision` is the publication revision; no second public revision field is added.
Authoritative writes fence older generations; late successes, failures, and finalization from a
fenced generation cannot overwrite or republish current facts.

Prepared actor and store revisions start at zero. The first activity/operation generation,
resource `valueRevision`, and runtime-global evidence sequence are one;
controlled endpoint call/subscription ordinals alone start at zero. Every monotonic counter is a
non-negative safe integer, increments before the mutation it identifies, and MUST fail its owning
invariant before wrap, reuse, or partial publication. A fully collected exact ref may later begin a
new store-owned lifetime at generation and value-revision one because no retained fact still names
the evicted lifetime; actor and runtime-global counters never reset.

Lifecycle transitions publish coherent snapshots and increment only `publicationRevision`; they do
not increment `machineTurnRevision` or create a `TurnRecord`. Issue-only recovery publications also
increment only `publicationRevision`. Lifecycle records and ordinary `TurnRecord`s share one
runtime-global evidence sequence allocated under the publication barrier. Selector memoization,
hydration, and checkpoints use the public publication revision; inspection correlation may use all
three private ordering fields. Projection-only publications retain the preceding machine-turn revision
and do not create a TurnRecord.

A turn is one serialized actor mailbox command, including pure transition planning, redirect
stabilization, immediate reconciliation, one publication, and optional acknowledgment. Later
asynchronous completion is another turn.

### GLO-11. TurnPlan, CommitPlan, and TurnRecord

`TurnPlan` is the pure result of applying one command to one actor snapshot and stabilizing
redirects. It contains intended state, memory, receipt intents, and activity changes but performs
no Effect and claims no Effectful fact already occurred. Event-transition `actions` materialize
finite plans only after guard acceptance; `onMemory` entries reconcile continuing plans separately.

`CommitPlan` is the package-private immutable reconciliation command set derived from a TurnPlan.
Its interpreter reserves generations, applies one atomic actor/store change, and stages owned work.
User Effects start or stop only from the post-publication reconciliation fact queued on the same
actor mailbox. These implementation types remain package-private.

`TurnRecord` is immutable actual-fact evidence derived after a successful machine or issue-only
publication. The
runtime evidence hub accepts `TurnRecord` and private `LifecycleRecord` values through one ordered
sequence before command acknowledgment and assigns no competing history. A `LifecycleRecord` carries
the full immutable lifecycle snapshot plus actor/app/plan provenance, `from`, `to`, cause, publication
revision, machine-turn revision, timestamp, and evidence sequence. Sinks process both record kinds
asynchronously after acknowledgment and MUST NOT re-read mutable actor state for their payload.
Lifecycle records are not machine turns and are not `TurnRecord`s.

Any package-private pending mapped-outcome representation remains an internal actor fact. Occurrences settle
once, late results are fenced, and restored nonterminal work is never replayed; a durable remote identity
becomes `unknown` and reconciles through the same identity. Runtime disposal drains accepted evidence and
does not create a synthetic terminal `TurnRecord`.

### GLO-12. Snapshot and actor state

An actor snapshot is the single immutable public publication containing the exact active leaf state,
immutable memory, inherited readonly context, lifecycle, issues, publication revision exposed as
`snapshot.revision`, and observed store revision from one publication. The lifecycle is the closed
union `prepared | active | suspended | disposed`. `state.matches(token)` recognizes the active leaf
and each active ancestor; Flow does not expose a nested state value. The actor's snapshot-bound
operation projection is available to passive selectors. Receipts are evidence projections and are not
actor snapshot fields.

The snapshot-bound operation projection exposes only passive named-family reads. `key`, `getData`, and
`getState` do not acquire work, retain ownership, change freshness, or mutate state; `useView` selectors
cannot lookup, refresh, subscribe, commit, write, cancel, invalidate, or clear. Exact descriptor/`K` reads
are tracked internally during selector evaluation and replaced after each evaluation; matching actor or
canonical StoreFanout publications rerun the selector against one tear-free boundary. Projection-only
reruns do not evaluate machine transitions.

`ActorState` is the package-private atomic owner containing that public snapshot plus durable
binding facts. Public readers project the snapshot. Dehydration captures a
context-closed cut: selected context values are derived and are not serialized as duplicate
consumer state, while exact provider refs and observed revisions are retained for included
consumers. These facts MUST NOT live in separately mutable owners.

### GLO-13. Issue, receipt, and pending work

An issue is a current structured failure, defect, interruption, cleanup problem, or invariant
violation. A receipt is immutable causal evidence of something the runtime accepted, started,
published, rejected, interrupted, or finalized. Operational issue identity includes the actor
incarnation when one exists, so a later actor lifetime cannot clear or inherit an old occurrence.
`pendingWork` is a live inventory for tests and tooling and is not actor state or settlement by itself.

### GLO-14. Passive actor selector and MachineObserver

A reusable view is an ordinary selector function, not a registered descriptor. `useView(actor,
selector)` accepts one exact actor handle and projects one atomic actor context containing state,
memory, inherited readonly context, lifecycle, issues, `can(event)`, and passive snapshot-bound
`O` reads. It creates or disposes no actor and changes no operation ownership or cache policy.

Scalar and non-record selector results use complete-value `Object.is`; named records use fixed-key,
field-by-field `Object.is`. `useView` accepts no comparator, and `useShallow(selector)` is only an
explicit React memoization adapter for named records. `MachineObserver` is the package-private
exact-actor subscription and sharing adapter; it owns no actor, cache lease, operation, retry, or
query-result state machine. Passive operation-read reactivity is dependency-tracked internally by
`REV-HOST-007`; selector defects use revision-scoped memoization and retry under `REV-COMP-003` and
`REV-HOST-006`.

### GLO-15. Story, fixture, recipe, command, and checkpoint

The public Story constructors are `story.app(runtimeFactory, options?)`,
`story.machine(machine, options?)`, and `story.actor(machine, options?)`. A Story plan is immutable
and inert until `run()`. An actor recipe is a deeply frozen run-local description containing its
exact machine, required fresh input, and exact compatible context bindings; it contains no runtime,
mailbox, snapshot, state, operation binding, disposal authority, or live actor handle.

App Stories target one exact actor recipe or app-owned stable `ActorRef`. Machine Stories own one
implicit fresh actor and use target-free commands; they alone accept selected initial context and
`setContext`. Story-local recipes materialize through the production runtime in provider-first
dependency order and dispose retained owner leases in reverse dependency order. App Stories use
the same typed production runtime factory and do not inject selected context directly.

The closed command surface is `process`, `advance`, `advanceTo`, `advanceToNextTimer`,
`checkpoint`, `run`, `send`, and `simulate`, with `setContext` only for machine Stories.
`process` drains ready production work without advancing time; clock movement and `simulate` do not
process implicitly. `simulate` matches an already-pending controlled operation occurrence and
enters through production completion; it creates no work and directly mutates no actor, store, or
evidence.

A fixture is an immutable directly referenced per-run environment definition. A checkpoint is an
immediate deeply frozen capture through the production atomic read barrier and never progresses
execution. App evidence uses exact `checkpoint.actor(recipe | ActorRef)` lookup; machine evidence
uses its single `snapshot`. Both reserve `runtime.now` and `runtime.pendingWork`. `run.end` is
automatic final run evidence and does not imply actor completion. Focused-context installation,
controlled-operation interception, occurrence persistence, capture sets, and cleanup failure evidence are
closed by `REV-TEST-005` through `REV-TEST-008`; their package-private mechanisms are not additional
public API.

### GLO-16. Boot and artifact

Boot is immutable runtime-constructor input carrying Flow-owned structural data and opaque
application payloads. Compatible app Stories use the app-branded `RuntimeBootPayload<App>` through
the accepted `boot` option and the same production runtime factory as live hosts. Flow validates
its structure and identity; applications validate and migrate their domain payloads.

An artifact is an explicitly exported versioned behavior or trace envelope. Artifact and CLI
schemas must represent the accepted app Stories, exact actor evidence lookup, `run.end`, module
tooling ownership, compound states, context requirements, lifecycle records, and operation
identities. Exact artifact/CLI closure is `REV-MIG-005`; host seeding and trusted writes are
`REV-HOST-008`.

### GLO-17. Runtime phase and admission transaction

The runtime phase is a private linearized lifecycle: `constructed` owns only service-free shell
cells, `booting` validates boot data, acquires the application Layer, and admits the initial graph,
`ready` permits ordinary activation and work, `failed` rejects further admission after rollback, and
`disposed` is terminal. These phases are not a user-authored machine state or a new public phase union.

An admission transaction validates exact app/plan provenance, actor identity, input, context bindings,
provider graph, tombstones, and instance cycles before exposing a handle. It installs the silent
baseline and logical edges, then activates and exposes ownership atomically; failure rolls back in
reverse order. Suspended actors retain logical context edges even after attachment resources detach.

## Identity laws

- `GLO-L1`: Equal stable `ActorRef` identities address the same logical actor identity within one
  runtime incarnation. Equal descriptor-plus-`K` identities share canonical operation data and
  admitted resource generations within one runtime. An operation occurrence additionally requires
  the exact actor incarnation and occurrence ordinal; opaque refs are runtime-local and are never
  durable identities.
- `GLO-L2`: Descriptor ID alone never identifies parameterized operation work. Executable methods
  require complete `P`; passive and key-addressed methods use canonical `K`.
- `GLO-L3`: App identity, `App.M` catalogue names, module tooling identity, actor refs, binding
  slots, operation identities, and Story recipe identity are separate domains and do not depend on
  source property order or runtime allocation order. Module order and property names do not enter
  runtime or persistence identity.
- `GLO-L4`: A stale generation or actor-incarnation fact may finalize only its own bounded evidence
  and cannot mutate, remove, overwrite, or publish current-generation facts. Authoritative writes
  fence older generations.
- `GLO-L5`: A passive `useView` read, actor-snapshot subscription, or inspection observation never
  manufactures identity, ownership, canonical state, or operation work. Snapshot-bound `O` reads
  remain passive; continuing operation subscriptions are owned bindings, not passive observation.
- `GLO-L6`: Durable decoding resolves only through the receiving app's compiled `AppPlan` and
  exact `App.M` machine catalogue. Context-closed persistence restores providers before consumers;
  selected context values do not override provider truth.
- `GLO-L7`: Two runtimes with equal public IDs remain isolated by runtime ownership. A stable ref
  may be reused in a later runtime, while a disposed-ref tombstone applies only to the current
  runtime incarnation.
