# Operations

Status: accepted revision contract

This chapter is the complete operations revision. It defines the accepted public surface, identity,
admission, ownership, lifecycle, mutation, examples, and proof obligations without delegating semantics to
an older operations document.

`Provenance` is non-normative trace metadata. The `BEH-*` boundaries remain unresolved behavior problems;
they add no public API and authorize no implementation choice.

## Deletion disposition

The generic registry, old operation-ref, and selector-equality surfaces changed by this chapter are
classified by `DEL-006` and `DEL-007` in `REV-MIG-004`. Those entries own the complete old clause inventory
and no-residue requirements; the `Supersedes` fields below identify the local semantic boundary only.

## Common operation model

- `P` is complete immutable executable input retained by a lookup, transaction attempt, or stream
  subscription. It may contain clients and functions and is never operation identity.
- `K` is the ordered readonly canonical tuple projected from `P`.
- `A` is a successful resource or transaction value, `V` a stream emission, and `E` a typed failure.

A descriptor is reusable inert configuration. A definition admits descriptors through one flat named
`operations` record, and its machine receives actor-bound families for exactly those names through `O`.
Referring to a descriptor or family, projecting a key, reading passive state, or constructing a plan starts
no work. A finite plan is admitted once by an accepted event transition's `actions`; a continuing plan is
owned by an active state through `activities` or `onMemory` until that declaration releases.

One Flow runtime owns one canonical resource store. Actors own finite occurrences, continuing declarations,
and immutable projections into that store, not private resource caches. Transactions and streams remain
actor-owned even though they use the same canonical-key vocabulary.

## REV-OPS-001 — Closed named operation catalogue

**Change:** Replace generic registries and the general operation kit with one closed named catalogue.

**Provenance:** `DESIGN_REVISIONS.md:337-360,405-409,1408-1410`;
`OPERATIONS_SPEC.md:12-52,85-102,861-882`.

**Supersedes:** Public operation `ref`, `byKey`, bound entries, generic `resources.get` and
`transactions.get`, and a general resource/transaction/stream activity kit.

**Rule:** A definition MUST declare one flat record of named resource, transaction, and stream descriptors.
The machine callback MUST receive that same exact `O` catalogue plus actor-bound `onMemory`, `invalidate`,
and `clear` capabilities. The catalogue MUST preserve descriptor namespaces and exact operation value, failure, and
requirement types, and MUST be available to static AppPlan reachability without callback scanning.

Listing a descriptor MUST NOT acquire a resource, run a transaction, or subscribe to a stream. Referring to
`O.name`, calling `O.name.key(P)`, or constructing a plan MUST remain inert. Flow MAY execute a plan only
after an admitted machine declaration returns it. Synchronous store effects MUST participate in the atomic
actor/store publication defined by `REV-OPS-007`; asynchronous external work MUST start only after that
publication.

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

const newIntentMachine = flow.machine(NewIntent, ({ S, E, O, onMemory, invalidate, clear }) => ({
  default: S.INACTIVE,
  states: {
    INACTIVE: {},
    ACTIVE: {
      default: S.ACTIVE.S.EDITING,
      states: {
        EDITING: {},
        SUBMITTING: {},
      },
    },
  },
}));
```

**Proof obligations:** Type proofs MUST show that `O` contains exactly the definition's names and types.
Runtime proofs MUST show that listing, keying, passive reading, and constructing an unreturned plan cause no
ownership, mutation, revision, or external work. Migration MUST remove the superseded surfaces everywhere.

## REV-OPS-002 — Executable input and canonical identity

**Change:** Separate complete executable input `P` from ordered canonical identity `K`.

**Provenance:** `DESIGN_REVISIONS.md:362-382,1411-1417`;
`OPERATIONS_SPEC.md:19-52,841-854`.

**Supersedes:** Any rule treating complete executable input as cache identity and the open canonical-key
categories and limits.

**Rule:** Every authored `key(P)` MUST synchronously return an ordered readonly tuple `K`. Exact resource
identity MUST be descriptor ID plus canonical `K`. A family already supplies its descriptor namespace, so a
key-addressed method accepts `K`:

```ts
type ResourceAddress<K extends readonly unknown[]> = readonly [descriptorId: string, ...key: K];

type ResourceTarget<K extends readonly unknown[]> = readonly [
  resource: ResourceFamily<any, K, any, any>,
  key: K,
];
```

These aliases are conceptual address notation; this revision does not require either name to be exported.

Equal `K` values assert that their `P` values produce equivalent canonical results. Flow MUST NOT inspect
omitted capabilities, test the assertion, switch clients, or fail over between equal-key inputs. Every
result-changing account, network, tenant, permission, session, or other discriminator MUST be in `K` or
separated by runtime.

Canonical `K` MUST contain only `null`, booleans, strings, finite numbers, readonly arrays, and plain readonly
records. Canonicalization MUST sort record keys and normalize `-0` to `0`. It MUST reject `undefined`,
non-finite numbers, bigint, symbols, functions, accessors, class instances, mutable structures, cycles, and
branded secret values. Unbranded strings cannot be classified by intent, so authors MUST treat every key as
observable in persistence, inspection, diagnostics, and artifacts and MUST hash or replace secret material.

One key is limited to 16 nested levels, 256 total value nodes, and 8 KiB in the tagged canonical byte
encoding. These are not state, actor, descriptor, or cache-entry-count limits. Projection, validation,
canonicalization, and defensive freezing MUST finish before ownership, actor/store mutation, admission, or
external work. Failure MUST name the exact `K[index]` or nested record path and abort the whole candidate
turn. Changing grammar, normalization, or limits is an identity compatibility change.

```ts
interface OrderInput {
  readonly orderId: string;
  readonly client: OrderClient;
}

const orderById = flow.resource({
  id: "everclear.order-by-id",
  key: ({ orderId }: OrderInput) => [orderId] as const,
  lookup: ({ orderId, client }: OrderInput, { signal }) => client.getOrder(orderId, { signal }),
});
```

`client` remains executable `P`; only `orderId` is canonical `K`.

**Unresolved boundary:** `BEH-027` owns the exact byte grammar, counting, hostile-reflection behavior, and
how rejection of mutable structures relates to copying ordinary arrays and records into frozen containers.

**Proof obligations:** Cover every canonical category, record-order equivalence, `-0`, every rejection,
cycles, exact paths, and each bound. Invalid input MUST publish and mutate nothing and start no work. Exact
encoder proofs remain blocked on `BEH-027`.

## REV-OPS-003 — Executable-input retention and shared-generation admission

**Change:** Define executable-input ownership when live bindings share one resource identity.

**Provenance:** `DESIGN_REVISIONS.md:384-399,1418-1420`; `OPERATIONS_SPEC.md:851-852`.

**Supersedes:** The open `P` retention and mid-generation handoff question.

**Rule:** Every live executable binding MUST retain its complete immutable `P`. One shared resource
generation MUST pin exactly one `P`, supplied by the plan that first admits it. A later equal-descriptor,
equal-`K` owner MUST join without replacing input or duplicating work. Simultaneous eligibility MUST use
stable runtime acquisition order. An explicit `refetch(P)` admits a replacement generation with its own `P`.

Pinned input MUST NOT hand off mid-generation. Releasing its supplying binding cannot switch the running
lookup to another client. The generation retains `P` until settlement or cancellation. A later automatic
generation uses the oldest remaining eligible binding; a later explicit refetch uses its caller's input.
Settlement releases generation `P` without discarding each still-live binding's independent input.

A hydrated key-only entry remains passively readable and MUST NOT start lookup work until a live binding
supplies executable `P`.

**Example:** Actors `A` and `B` subscribe with distinct clients but equal descriptor and `K`. The first plan
supplies the running client. Releasing `A` cannot switch that generation to `B`; `B` may supply only a later
automatic generation.

Equal-key candidate selection for a later generation uses the oldest eligible binding and the same stable
acquisition order after hydration; `REV-OPS-015` owns the completed rule.

**Proof obligations:** Cover simultaneous eligibility, first admission, equal-key joining, supplying-owner
release, later automatic admission, explicit refetch, settlement cleanup, deterministic post-hydration order,
and inert hydrated key-only data.

## REV-OPS-004 — Runtime-scoped shared resource store

**Change:** Replace actor-private resource caches with one store per Flow runtime.

**Provenance:** `DESIGN_REVISIONS.md:401-403,1421-1423`; `OPERATIONS_SPEC.md:54-83`.

**Supersedes:** Actor- or machine-owned canonical caches and lookup-generation registries.

**Rule:** One runtime MUST own this hierarchy:

```text
Flow runtime
└── canonical resource store
    └── descriptor ID
        └── canonical K
            ├── canonical base and metadata
            ├── generation state
            └── optimistic overlays

Actor
└── finite/continuing ownership and immutable projections
```

Same-runtime actors using equal descriptor and `K` MUST share canonical data and admitted lookup generations
while retaining independent actor lifetimes, occurrences, declarations, and outcome mappings. State exit
releases only that actor's ownership. Another actor may keep the entry active. Invalidation and authoritative
writes MUST fan out to every affected actor. Separate runtimes, SSR requests, tests, and browser roots MUST
remain isolated. Flow MUST NOT create an actor-local copy to compensate for a bad key.

Descriptor configuration may own freshness and collection policy, but exact public state, collection
projection, and never-materialized-entry read visibility remain under `BEH-023`.

**Proof obligations:** Prove same-runtime sharing, independent release, cross-actor fanout, and isolation
between runtimes, SSR requests, tests, and browser roots.

## REV-OPS-005 — Exact operation-family surfaces and passive reads

**Change:** Define one exact family per operation kind and remove alternative spellings.

**Provenance:** `DESIGN_REVISIONS.md:405-409,1403-1428,1469-1470`;
`OPERATIONS_SPEC.md:244-390,494-583,648-699`.

**Supersedes:** Public operation refs, `byKey`, `byLane`, bound entries, `status()`, generic registries,
resource-family invalidation, and public enumeration.

**Rule:** Public family types MUST preserve these relationships:

```ts
interface ResourceFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;
  getData(key: K): A | undefined;
  getState(key: K): StateShapeNotYetAccepted;
  lookup(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  subscribe(params: P, options?: ResourceSubscriptionOptions<A, E>): ContinuingOperationPlan;
  refetch(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  setData(key: K, value: A | ((current: A | undefined) => A | undefined)): CacheWritePlan;
  cancel(key: K): CancellationPlan;
}

interface TransactionFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;
  getState(key: K): StateShapeNotYetAccepted;
  commit(params: P, options?: CommitOptions<P, A, E>): TransactionCommitPlan;
  cancel(key: K): CancellationPlan;
}

interface StreamFamily<P, K extends readonly unknown[], V, E> {
  key(params: P): K;
  getState(key: K): StateShapeNotYetAccepted;
  subscribe(params: P, options?: StreamSubscriptionOptions<P, K, V, E>): ContinuingOperationPlan;
}
```

This interface block is schematic local notation, not a declaration of exported support types. Every
Pascal-cased options and plan name in it stands for the descriptor-specific inferred type at that position.
`StateShapeNotYetAccepted` is a documentation sentinel, not a public type: each `getState(K)` result must be
descriptor- and key-typed, but its closed union remains unresolved under `BEH-023`. In particular, this
sentinel does not decide whether a stream status includes latest emission `V`; that exact public union and
read projection remain unresolved under `BEH-023`. `REV-OPS-015` separately accepts the runtime latest-value
projection behavior. The accepted revision fixes the family
methods, their `P` versus `K` arguments, descriptor-specific value/failure/event relationships, and finite
versus continuing result categories. It does not accept exports with these support names or generic
parameter orders for them.
`lookup`, `commit`, and `subscribe` are the accepted verbs. Transaction `lane` is replaced by `key`. An
omitted transaction key projector MUST behave as `key(P) => []`, giving one actor-local identity.

A resource descriptor owns its ID, key projection, lookup adapter, and authored freshness and collection
policy. Explicit policy values are descriptor configuration, not defaults established by this revision:

```ts
const orderById = flow.resource({
  id: "everclear.order-by-id",
  key: ({ orderId }: OrderInput) => [orderId] as const,
  lookup: ({ orderId, client }: OrderInput, { signal }) => client.getOrder(orderId, { signal }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});
```

The resource methods have distinct accepted lifetimes:

- `lookup(P)` is finite. A usable fresh canonical value may settle it without calling the adapter; otherwise
  it starts or joins the exact lookup generation and releases its finite ownership after one terminal result.
- `subscribe(P)` is continuing desired ownership. It observes the canonical entry, starts or joins ordinary
  lookup policy when acquisition is required, receives later canonical revisions, and retains ownership until
  its authored declaration releases. On activation it publishes an existing canonical value once through
  the authored `value` mapper, then publishes later canonical replacements through that same mapper.
- `refetch(P)` is a finite forced replacement. It admits a new generation even when current data is fresh,
  while existing canonical data remains readable during replacement.
- `setData(K, valueOrUpdater)` is an authoritative finite cache write governed by `REV-OPS-010`.
- `cancel(K)` is actor-owned finite cancellation governed by `REV-OPS-011` and never releases a continuing
  subscription.

A finite lookup that finds a usable fresh value MUST settle without calling the adapter. A missing, stale,
or invalidated entry MUST start or join its exact generation. Success MUST install one canonical base in
the runtime resource store; typed failure, defect, and interruption MUST remain distinct terminal lanes;
and the finite occurrence MUST release ownership after one terminal result. Authored outcome mappers MAY
turn those terminal lanes into typed machine events without changing the public state union:

```ts
actions: () =>
  O.orderById.lookup(
    { orderId, client },
    {
      outcomes: {
        success: order => E.OrderLoaded(order),
        failure: error => E.OrderFailed(error),
      },
    },
  ),
```

Constructing this plan is inert. Ordinary reconciliation, state reentry, and selector changes MUST NOT
restart a consumed finite occurrence. Only another accepted event transition action may admit another
finite lookup or refetch.

Finite `lookup` and `refetch` outcome options use exactly `success(A)`, `failure(E)`, `defect()`, and
`interrupt()`. Continuing resource `subscribe` outcome options use exactly `value(A)`, `failure(E)`,
`defect()`, and `interrupt()`. Each authored mapper returns one typed machine event. An omitted mapper
enqueues no event for that lane, and the mapper receives no `Exit`, `Cause`, state, or lifecycle metadata.

```ts
activities: [
  O.orderById.subscribe(
    { orderId, client },
    {
      outcomes: {
        value: (order) => E.OrderChanged(order),
        failure: (error) => E.OrderFailed(error),
        defect: () => E.OrderDefected(),
        interrupt: () => E.OrderInterrupted(),
      },
    },
  ),
];
```

Resource revisions MUST influence machine behavior only through authored outcome events. The resulting
ordinary event may update state or memory, after which dependent `onMemory` declarations reconcile against
the latest actor-projected resource values. Flow MUST NOT create a second implicit snapshot-dependency
subscription graph.

Per-plan options MUST NOT override descriptor freshness, retry, tags, placeholder, equality, concurrency,
or collection policy. Those policies remain immutable descriptor configuration; the accepted per-plan
surface is limited to the outcome and explicit write mappings described in this chapter.

`key`, `getData`, and `getState` accept `K` and MUST remain passive: no work, ownership, freshness change,
collection retention, or mutation. Methods that may execute descriptor work accept complete `P`; `K` need
not reconstruct it. Actor-bound reads use the immutable operation projection in the same actor snapshot and
MUST NOT reach through mutable global state. A `useView` selector receives only passive `O` capabilities and
cannot acquire, refresh, subscribe, commit, write, cancel, invalidate, or clear.

```ts
const orderKey = O.orderById.key({ orderId, client });
const order = O.orderById.getData(orderKey);
const orderState = O.orderById.getState(orderKey);
const submitState = O.submitIntent.getState([submissionId]);
```

These expressions remain passive for missing, stale, failed, and active identities.

**Unresolved boundary:** `BEH-023` owns the closed state unions, generation and failure projection,
retained-value refresh, collection, cross-actor read visibility, and stream declaration-slot ambiguity.
`BEH-029` owns base versus overlay-effective `getData` and placeholder projection. Signatures and passivity
plus the existence of typed outcome mappers are accepted; exact public state members and the remaining read
projection details are not.

**Proof obligations:** Prove exact methods and descriptor-specific types, the `P`/`K` boundary, passive view
subset, `K = []`, side-effect-free reads, and absence of removed refs, registries, lanes, status aliases, and
enumeration.

## REV-OPS-006 — Finite transition actions and continuing state activities

**Change:** Add event-transition `actions` for finite plans while retaining state activities for continuing
ownership.

**Provenance:** `DESIGN_REVISIONS.md:411-428,1429-1435`; `OPERATIONS_SPEC.md:194-238`.

**Supersedes:** Event grammar that rejects `actions`.

**Rule:** Flow MUST evaluate optional `actions` once and only for the winning accepted event transition. It
returns one inert finite plan, a readonly list, `null`, or an empty list. Omission, `null`, and empty list
admit no finite work. Constructing but not returning a plan is inert. Arbitrary side effects in the callback
are outside the contract.

```ts
on: {
  SubmitRequested: {
    target: S.SUBMITTING,
    actions: ({ event, memory }) => [
      O.submitIntent.commit(
        buildSubmissionInput(event, memory),
        { outcomes: submitOutcomes },
      ),
    ],
  },
}
```

Actions may admit resource lookup/refetch, transaction commit/cancel, cache writes, invalidation, and clear.
Continuing resources and streams remain state `activities`; memory-derived continuing plans remain
independent `onMemory` declarations. `onMemory` MUST NOT admit transaction commits or cache commands, and
machine code MUST NOT manually unsubscribe.

There is no operation `onEvent`, `onSnapshot`, `onEnter`, or `onMemory.once` combinator in this revision.

Only event handlers admit finite `actions`; timer facts remain event-targeting only. Polling uses an existing
`after` timer and an explicit refresh event under `REV-OPS-015`; implementations MUST NOT infer timer actions.

**Proof obligations:** Prove winning/declined/losing transitions; omitted, `null`, empty, single, and list
results; returned versus merely constructed plans; finite versus continuing ownership; and coordinated
contracts, validation, types, and proof rows.

## REV-OPS-007 — Event macrostep ordering and atomic admission

**Change:** Replace candidate-memory action evaluation and open redirect ordering with one atomic event
macrostep.

**Provenance:** `DESIGN_REVISIONS.md:430-445,1436-1440`; `OPERATIONS_SPEC.md:211-220`.

**Rule:** One accepted event macrostep MUST:

1. select the winning transition;
2. evaluate its guard;
3. if accepted, evaluate `updateMemory` and then `actions`;
4. apply target and memory to a candidate actor projection;
5. stabilize redirects;
6. materialize and validate the complete finite-action batch;
7. stage actor and synchronous store changes;
8. commit and publish actor/store revisions atomically; and
9. only then start or join asynchronous work.

Guard, `updateMemory`, and `actions` MUST read the same immutable pre-turn snapshot and event. Actions cannot
see candidate memory. A declined guard evaluates neither later callback. Edge plans remain admitted if
redirects leave the initial target. Any defect in guard, memory, planning, redirects, keys, targets, or batch
validation aborts the unpublished whole turn; no valid prefix survives.

**Example:** A valid `setData` followed by an invalid key publishes neither state nor write and starts no
work. A redirect away from the initial target does not cancel that edge's valid finite commit.

Mixed-command conflicts and transaction/stream completion-side publication order follow `REV-OPS-015`:
conflicting target-changing intentions reject the whole candidate before mutation, while accepted completion
facts publish canonical writes, owner projections, and mapped events in the defined order.

**Proof obligations:** Cover pre-turn reads, guard decline, redirect retention, mixed memory/cache changes,
synchronous/asynchronous plans, every planning failure, one atomic publication, no valid prefix, and work
starting only after publication.

## REV-OPS-008 — Independently reconciled memory-derived continuing work

**Change:** Define state-scoped `onMemory` continuing ownership.

**Provenance:** `DESIGN_REVISIONS.md:424-427,1441-1443`; `OPERATIONS_SPEC.md:104-146,231-242`.

**Rule:** `onMemory` MUST supply current immutable memory when its owning state activates or re-enters and
after every committed memory change. Several direct or selected entries may coexist. Each authored entry
independently owns one continuing resource or stream plan, `false`, or `null`; `false` and `null` release
only that entry.

```ts
activities: [
  onMemory(
    ({ memory }) =>
      memory.orderId !== null &&
      O.orderById.subscribe({
        orderId: memory.orderId,
        client: memory.client,
      }),
  ),
  onMemory.select(
    ({ memory }) => memory.balanceInput,
    (value) => value !== null && O.assetBalance.subscribe(value),
  ),
];
```

State exit, changed normalized identity, actor stop, `false`, or `null` MUST release the affected declaration exactly
once. No actor callback receives an unsubscribe handle. Direct `onMemory` may reevaluate during live
reconciliation; equal normalized identity retains the existing generation and materialized `P`.

One entry MUST NOT return a runtime-sized array. Known finite sets use separate entries:

```ts
activities: [
  O.assetBalance.subscribe(primaryBalanceInput),
  O.assetBalance.subscribe(fallbackBalanceInput),
];
```

Runtime-sized arrays, `subscribeMany`, `subscribeEach`, and implicit array-to-many behavior are deliberately
deferred. Dynamic membership currently uses one aggregate resource or separately owned actors. A future
collection contract must define membership, duplicates, bounds, per-key outcomes, persistence, and release.

Hydration drains pending outcomes, rematerializes continuing declarations from live executable `P`, and
uses the oldest eligible binding for a later generation. This rule defines the live and hydrated
reconciliation boundary under `REV-OPS-015`.

**Proof obligations:** Cover activation/re-entry, memory changes, independent entries, `false`, `null`,
state exit, actor stop, exact-once release, equal live identity retention, hydration without emission replay,
and rejection of deferred collection returns and helpers.

## REV-OPS-009 — Selector suppression and operation-identity reconciliation

**Change:** Separate selector suppression from normalized operation retention.

**Provenance:** `DESIGN_REVISIONS.md:453-465,1444-1447`; `OPERATIONS_SPEC.md:120-151,849`.

**Rule:** `onMemory.select(selector, factory)` MUST use the shared selector semantics and compare scalar
or non-record results with complete-value `Object.is`, or named record results with fixed-key,
field-by-field `Object.is`; it MUST accept no custom comparator. The selector MUST have the shared
`Selector<Input, Value>` shape, and the factory MUST receive `(current, previous)` selected values. On
owning state activation or re-entry,
Flow MUST invoke the factory with the current selected value and `previous: undefined` to establish the
declaration's continuing work. The selection baseline MUST reset when the owning state exits, so every
later state re-entry is a fresh initial invocation. On a later selected-value change, Flow MUST invoke it
with the current selected value and immediately preceding selected value. Equality suppresses the factory;
change reevaluates it. The factory MUST return a continuing plan, `false`, or `null`; `false` and `null`
release only this declaration. Returned continuing work then reconciles by authored declaration slot,
operation kind, exact descriptor, and canonical `K`, never plan-object or executable-`P` identity. A
freshly allocated equal plan retains existing work.

```ts
activities: [
  onMemory.select(
    ({ memory }) => ({
      value: memory.orderInput,
      client: memory.client,
    }),
    (current, previous) =>
      current.value !== null &&
      O.orderById.subscribe({
        ...current.value,
        client: current.client,
      }),
  ),
];
```

Authors SHOULD select one stable immutable value, use a named record for one plan that depends on several
independently changing values, split independently owned plans into separate entries, or use direct
`onMemory` when the plan genuinely depends on the whole memory object.

Equal-key future generations use the oldest eligible retained binding and stable acquisition order across
hydration under `REV-OPS-015`.

**Proof obligations:** Distinguish selection suppression from plan retention; prove initial factory
invocation on activation and re-entry with `previous: undefined`, scalar current/previous values,
named-record field equality and changes, reevaluation on change, no factory call for equality, `false`/`null`
release, retention across fresh equal wrappers, replacement on field/kind/descriptor/key change, and
rejection of custom comparators.

## REV-OPS-010 — Authoritative writes fence older generations

**Change:** Require generation fencing for every successful authoritative resource write.

**Provenance:** `DESIGN_REVISIONS.md:481-493,1451-1454`; `OPERATIONS_SPEC.md:391-413`.

**Rule:** `setData(K, valueOrUpdater)` constructs an inert authoritative-write plan:

```ts
O.orderById.setData([order.id], (current) => reconcileOrder(current, order));
```

Every successful write MUST fence and interrupt all older lookup generations for the identity, whether from
a machine action, transaction success, authoritative stream mapping, or trusted host write. No coexistence
option may let an older result overwrite it. The write installs the canonical base, clears invalidation and
current failure metadata, advances entry revision and generation fence, and publishes once. Continuing
subscribers remain attached and observe the base. `setData` is not optimistic overlay machinery.

Updater `undefined` declines with no change. A fenced finite occurrence settles superseded, records
inspection evidence, emits no mapped domain interruption, and suppresses every late success, failure, and
finalization. A later explicit lookup/refetch may admit normally.

Updater input, actor-scoped overlay behavior, and equal-value revisions/emissions follow `REV-OPS-015`.
`BEH-032` still owns the trusted host API, authority, seeding, and evidence. Trusted writes are accepted
writers and obey the same fencing/fanout, but this chapter invents no host surface.

**Proof obligations:** Hostile races MUST deliver late success/failure/finalization and prove no overwrite or
republication. Cover updater decline, retained subscribers, all accepted write origins, and blocked
equal-value/host details under `BEH-029`/`BEH-032`.

## REV-OPS-011 — Actor-owned finite cancellation

**Change:** Make cancellation occurrence-owned rather than shared-data deletion or unconditional shared-work
abortion.

**Provenance:** `DESIGN_REVISIONS.md:495-509,1455-1458`;
`OPERATIONS_SPEC.md:415-428,599-607`.

**Rule:** Resource lookup and transaction commit adapters receive a Flow-managed `AbortSignal`. Explicit
resource or transaction `cancel(K)` affects only the calling actor's matching finite occurrence, releases
that ownership, records terminal `interrupted` with cause `cancelled`, and suppresses later results to it.
Canonical data remains unchanged. Other actors and continuing subscribers retain ownership. Shared work
continues while any owner remains; cancellation of the final owner interrupts the controller and fences late
completion.

`cancel(K)` does not stop a continuing resource subscription. Streams have no actor `cancel(K)`. Planned
cancel, state release, and concurrency supersession publish status and inspection evidence but no mapped
domain outcome. Unexpected external interruption may use an authored mapper.

Before an adapter's point of no return, the signal may interrupt local work. After signing, broadcast, or
another irreversible effect, local abort cannot claim reversal; the adapter must report truthful domain
status such as submitted, unknown, or requiring reconciliation.

**Example:** With actors `A`, `B`, and `C` on one lookup generation, cancelling `B` settles only `B`. Work
continues for `A` and `C`; cancelling the final owner interrupts the shared controller.

Occurrence settlement, supersession, suspension, disposal, retention bounds, and same-actor same-key
cancellation cardinality follow `REV-OPS-015`. This rule fixes cross-actor ownership and MUST NOT select one
same-key occurrence arbitrarily.

**Proof obligations:** Cover first/middle/final owner cancellation, late completion, canonical data
retention, finite versus continuing ownership, point-of-no-return truth, and no mapped planned outcome.

## REV-OPS-012 — Scoped atomic invalidation and clearing

**Change:** Put cross-resource invalidation/clear on actor-level finite actions and remove ordinary whole-
runtime clear authority.

**Provenance:** `DESIGN_REVISIONS.md:447-451,511-526,1459-1465`;
`OPERATIONS_SPEC.md:430-492`.

**Rule:** Both callbacks accept readonly mixtures of exact `[O.resource, K]`, declared reachable nominal
tags, and admitted resource families:

```ts
type CacheTarget =
  | readonly [resource: AdmittedResourceFamily, key: CanonicalKey]
  | DeclaredReachableResourceTag
  | AdmittedResourceFamily;

declare function invalidate(targets: readonly CacheTarget[]): InvalidationPlan;
declare function clear(targets: readonly CacheTarget[]): ClearPlan;
```

These are conceptual actor-bound signatures, not new globals. Planning resolves all targets, validates
authority and keys, expands tags/families, deduplicates first-seen matches, and rejects the whole action batch
before mutation if any target is invalid or unauthorized.

For a nonempty resolved match set, invalidation retains canonical data, marks every matched identity stale,
publishes all matched mutations atomically in one store revision, and starts no lookup directly. A surviving
subscription may authorize replacement:

```ts
on: {
  ProviderChanged: {
    actions: () => [
      invalidate([
        [O.walletAccounts, []],
        walletResourcesTag,
      ]),
    ],
  },
}
```

For a nonempty resolved match set, clear atomically removes matched bases, failure/freshness metadata, and
overlays; fences generations; interrupts work; and publishes all matched mutations in one store revision. A
surviving subscription observes missing data and may reacquire under ordinary rules:

```ts
on: {
  LoggedOut: {
    target: S.SIGNED_OUT,
    actions: () => [
      clear([walletResourcesTag, O.assetBalance]),
    ],
  },
}
```

The four cache-affecting capabilities remain distinct:

| Capability                     | Canonical data                    | Generation and ownership                                                                         |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `invalidate(targets)`          | retained and marked stale         | starts no work directly; surviving subscriptions may authorize replacement                       |
| `clear(targets)`               | matched data and metadata removed | matching generations are fenced and interrupted; surviving subscriptions see missing data        |
| `O.resource.cancel(K)`         | unchanged                         | releases only calling-actor finite ownership and interrupts shared work only for the final owner |
| `O.resource.setData(K, value)` | replaced authoritatively          | older generations are fenced; continuing subscribers remain attached                             |

Clear exists only as `clear([...targets])` returned by an accepted event transition. Machines receive no
zero-argument clear, AppPlan-external wildcard, or whole-runtime clear. Complete removal belongs to
`runtime.dispose()` as part of its reverse-order graph cleanup; there is no ordinary
`runtime.cache.clear()`. Logout-like transitions MUST release account-scoped continuing work and clear its
data in the same macrostep.

`BEH-030` remains the boundary for expansion bounds, missing/zero-match behavior, and interaction with
active lookup, including whether a valid zero-match command advances a store revision. Mixed-command
conflicts follow `REV-OPS-015`. Family targets for both commands are already accepted.

**Proof obligations:** Cover exact/tag/family/mixed targets, first-seen deduplication, invalid/unauthorized
targets, whole-batch rejection, atomic mutation, fencing/interruption, surviving subscriptions, logout, and
runtime disposal. Prove removed family invalidation, zero-argument/wildcard clear, and runtime cache clear.

## REV-OPS-013 — Transaction admission and explicit resource mappings

**Change:** Replace generic execution and lane vocabulary with keyed finite commits and explicit writes.

**Provenance:** `DESIGN_REVISIONS.md:405-428,481-483,1427-1435`;
`OPERATIONS_SPEC.md:494-597,921-931`.

**Rule:** A descriptor declares ID, optional key projector, and external commit adapter:

```ts
const submitIntent = flow.transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntentInput) => [submissionId] as const,
  commit: (params: SubmitIntentInput, { signal }) => IntentSubmitter.submit(params, { signal }),
  concurrency: "reject",
});
```

Its family exposes only `key`, passive `getState`, finite `commit`, and actor-owned `cancel`. An omitted key
uses `[]`. Status and concurrency identity are actor-local descriptor plus canonical `K`; there is no lane.
`commit(P, options?)` is inert and admitted only by accepted event `actions`. State activation, memory/store
revisions, passive reads, completion, and reconciliation cannot admit or readmit an attempt. Retry is a new
`commit(P)` from a new accepted event, not `retry()`.

Concurrency is evaluated per actor, transaction descriptor, and canonical `K`:

| Policy      | Accepted admission behavior                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `reject`    | Decline a second active attempt without evaluating its commit-side callbacks.                                     |
| `cancel`    | Cancel the previous attempt, then admit its replacement.                                                          |
| `allow`     | Admit independent generations; only the current generation may update the current projection or route an outcome. |
| `serialize` | Materialize each admitted `P` and run the exact-key queue FIFO.                                                   |

Occurrence retention and key-only cancel cardinality follow `REV-OPS-015`; no targeted occurrence-cancel
API is added.

```ts
on: {
  SubmitRequested: {
    target: S.SUBMITTING,
    actions: ({ event, memory }) => [
      O.submitIntent.commit(buildSubmissionInput(event, memory), {
        outcomes: {
          success: receipt => E.SubmitSucceeded(receipt),
          failure: error => E.SubmitFailed(error),
          defect: () => E.SubmitDefected(),
          interrupt: () => E.SubmitInterrupted(),
        },
      }),
    ],
  },
}
```

Success may declare authoritative writes. Results never become canonical data implicitly. Flow confirms the
current attempt generation, applies declared writes through `REV-OPS-010`, then maps the domain outcome:

```ts
O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],
  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
  },
});
```

The accepted mapping includes exact `setData` plans, not completion-side `invalidates` or `clears` options.
Cancellation follows `REV-OPS-011`.

`BEH-023` remains the exact public transaction-state boundary. Occurrence lifetime, cancellation, overlays,
completion-side publication, callback materialization, and conflicts follow `REV-OPS-015`. Writes-before-
outcome is accepted.

**Proof obligations:** Prove event-only admission, passive status, each concurrency policy, no automatic
retry/readmission, current-generation suppression, fenced writes before mapped outcome, no implicit writes,
and no unaccepted mapping options. Exact public state-union proofs remain `BEH-023`; occurrence and
settlement proofs follow `REV-OPS-015`.

## REV-OPS-014 — Stream ownership and explicit resource mappings (historical baseline; amended by REV-OPS-015)

**Change:** Define actor-owned continuing streams and explicit resource mappings. The earlier value-free
stream-status restriction is superseded by `REV-OPS-015`; it remains in this section only as historical
provenance.

**Provenance:** `DESIGN_REVISIONS.md:405-409,481-483,528-541,1427-1428,1466-1468`;
`OPERATIONS_SPEC.md:648-758`.

**Rule:** A descriptor declares ID, key projector, and subscription adapter:

```ts
const submissionProgress = flow.stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: ProgressInput) => [submissionId] as const,
  subscribe: ({ submissionId, client }: ProgressInput, { signal }) =>
    client.progress(submissionId, { signal }),
});
```

Its family exposes only `key`, passive `getState`, and continuing `subscribe`; no actor `cancel`. Streams are
not runtime resource entries. Equal keys in one live declaration retain the generation and original `P`;
changed keys release exactly once and start another. Different actors subscribe independently; Flow does not
deduplicate their streams through the resource store.

State exit, selector replacement, actor disposal, `false`, or `null` unsubscribes and finalizes exactly once. Planned
release maps no completion/interruption event. Late emissions are suppressed by slot, key, and generation.

```ts
activities: [
  onMemory.select(
    ({ memory }) => memory.progressInput,
    (value) =>
      value !== null &&
      O.submissionProgress.subscribe(value, {
        outcomes: {
          value: (step) => E.ProgressChanged(step),
          complete: () => E.ProgressComplete(),
          failure: (error) => E.ProgressFailed(error),
          defect: () => E.ProgressDefected(),
          interrupt: () => E.ProgressInterrupted(),
        },
      }),
  ),
];
```

`getState(K)` exposes actor-owned idle, connecting, running, complete, typed failure, defect, interruption,
and inspection identity. Its exact public union, including whether it carries the latest `V`, remains
unresolved under `BEH-023`; the accepted runtime behavior is the latest-value projection specified by
`REV-OPS-015`, not the earlier value-free restriction. Generation fields and duplicate-live-binding reads
remain under `BEH-023`.

Emissions become durable observable state only through mapped events that later commit memory or explicit
authoritative resource writes. Values never enter the resource store implicitly. Flow verifies current key
and generation, applies declared writes through `REV-OPS-010`, then enqueues the mapped value event. Late
replaced-generation values cannot write; completion/failure cannot erase previous writes.

```ts
O.walletChanges.subscribe(
  { provider },
  {
    writes: ({ value }) => [O.walletAccounts.setData([], value.accounts)],
    outcomes: {
      value: (change) => E.WalletChanged(change),
      failure: (error) => E.WalletStreamFailed(error),
    },
  },
);
```

Planned release stores no further value. Hydration rematerializes an active declaration from live executable
`P` after pending outcomes drain, creates a new generation, and does not replay emissions. Terminal streams
do not restart; missing input fails closed. Completion publication follows `REV-OPS-015`; exact public
state and duplicate-read fields remain under `BEH-023`.

**Proof obligations:** Cover emission, equal-key live retention, key replacement, release/disposal,
completion/failure, exact finalization, late emissions, writes before outcomes, latest-value coalescing,
and no historical emission replay during completion, failure, release, dehydration, or hydration. Remaining
exact public-state and declaration-slot proofs track `BEH-023`; runtime latest-value behavior follows
`REV-OPS-015`.

## Closed exclusions and deferred surfaces

**Provenance:** `DESIGN_REVISIONS.md:243-252,405-409,467-479,511-526,543-545,1448-1450`;
`OPERATIONS_SPEC.md:811-850`; `OPERATIONS.md:484-499`.

The accepted family sets are closed. The machine operations API has no operation `ref`, `byKey`, `byLane`,
bound entry, `status()`, generic registry, public enumeration, general operation kit, resource-family
`.invalidate`, stream `cancel`, zero-argument/wildcard/runtime cache clear, custom selection comparator, or
operation-specific `onEvent`, `onSnapshot`, `onEnter`, or `onMemory.once`. It adds no separate `prefetch`,
`ensure`, `read`, `has`, `require`, `retry`, `update`, `delete`, or `remove` family method.

Runtime-sized continuing collections are deliberately deferred. One authored entry returns one continuing
plan, `false`, or `null`; known finite sets use separate entries. No `subscribeMany`, `subscribeEach`, array-of-plans
return, or implicit array-to-many behavior exists until a future accepted proposal defines membership,
duplicates, bounds, outcomes, persistence, ownership, and release.

Singleton, toggle, and debounce helpers are outside this revision; explicit states and timers remain the
baseline. Timer-owned finite actions are not inferred from event actions and require separate review.

## Unresolved behavior register

These are mandatory closure problems, not accepted answers. `BEH-023` remains open for exact public state
unions and read projections; `REV-OPS-015` closes adjacent runtime behavior without closing that public-shape
boundary. `BEH-024`, `BEH-025`, `BEH-026`, `BEH-028`,
`BEH-029`, and `BEH-031` are closed by the later `REV-OPS-015` amendment; their rows remain here only as
historical indexing.

| Item      | Unresolved behavior                                                                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BEH-023` | Exact public operation state unions, generation/failure/collection projection, cross-actor resource read visibility, and unambiguous stream reads with declaration-slot identity remain unresolved. Adjacent runtime behavior, including latest-value projection, is closed by `REV-OPS-015`; this row remains open for the exact public shape. |
| `BEH-024` | Closed by `REV-OPS-015`: timers remain event-targeting only; polling uses `after` plus an explicit refresh event.                                                                                                                                                                                                                               |
| `BEH-025` | Closed by `REV-OPS-015`: occurrence settlement, supersession, cancellation, disposal, and bounded retention.                                                                                                                                                                                                                                    |
| `BEH-026` | Closed by `REV-OPS-015`: action conflicts and transaction/stream completion-side ordering.                                                                                                                                                                                                                                                      |
| `BEH-027` | Canonical byte grammar, counting, hostile input, copying/freezing, and mutable-input conflict.                                                                                                                                                                                                                                                  |
| `BEH-028` | Closed by `REV-OPS-015`: equal-key candidate-`P` retention and deterministic acquisition order across hydration.                                                                                                                                                                                                                                |
| `BEH-029` | Closed by `REV-OPS-015`: tags, base/effective reads, updater input, overlays, promotion, and equal-value writes.                                                                                                                                                                                                                                |
| `BEH-030` | Tag/family expansion bounds, missing/zero-match behavior, and active-lookup interaction.                                                                                                                                                                                                                                                        |
| `BEH-031` | Closed by `REV-OPS-015`: stream rematerialization from live `P` without emission replay and terminal behavior.                                                                                                                                                                                                                                  |
| `BEH-032` | Boot/SSR/fixture seeding and trusted host-write owner, API, authority, and evidence.                                                                                                                                                                                                                                                            |

Closing any BEH MUST preserve this chapter's public method sets, `P`/`K` boundary, ownership, event-action
admission, and deferred surfaces unless a separate accepted design decision revises them.

## REV-OPS-015 — Runtime-owned reactivity, actor-scoped previews, and continuing projections

**Change:** Close the operation-runtime behavior needed for reactive actor projections, optimistic
transaction previews, canonical cross-actor fanout, and continuing-operation hydration. This amendment
does not add a manual subscription API, a polling helper, a transaction rollback API, or a second operation
registry.

**Supersedes:** The conflicting value-free stream-status, shared-effective-overlay, direct-store-observer,
and unresolved completion-order statements in `REV-OPS-004`, `REV-OPS-014`, `BEH-024` through `BEH-026`,
`BEH-028`, `BEH-029`, and `BEH-031`, and their owning implementation-contract clauses.

**Rule:** Every external callback, timer fact, stream emission, transaction settlement, context wave, and
StoreFanout fact MUST enter the owning actor mailbox. A projection-only fact rereads authoritative current
state, publishes one complete immutable actor snapshot, and MUST NOT evaluate transitions, guards,
`always`, actions, redirects, memory updates, finite work, or hidden events. A continuing-operation outcome
mapper may enqueue one typed event only after that projection publication; the event is a later ordinary
mailbox turn.

StoreKernel owns committed canonical bases and one shared overlay ledger. Store mutation MUST pass through
one package-private commit coordinator. StoreFanout is the sole actor-facing path for canonical revisions;
actors MUST NOT subscribe directly to StoreState. A canonical revision fact contains only a monotonic
revision, changed canonical refs, and its kind. Recipients ignore revisions at or below their cursor,
ignore refs outside their registered dependency set, reread current StoreState, and may coalesce adjacent
projection facts. Lifecycle, terminal operation, cancellation, stream terminal, and mapped events are not
coalesced. StoreFanout never runs transitions or mutates snapshots.

An optimistic transaction layer is scoped to the exact initiating actor incarnation, transaction occurrence,
descriptor, and canonical `K`. Only that actor sees the uncommitted effective projection. A successful
occurrence promotes its layer into the canonical base atomically and then emits one canonical StoreFanout
revision. Failure, defect, and pre-boundary interruption remove only that layer and replay remaining owner
layers without changing canonical state. Post-boundary cancellation removes local provisional state,
publishes `unknown` or reconciliation-required truth, and MUST NOT claim that a remote effect was undone.
Promotion uses a canonical-base compare-and-set; if the base changed, the remote success remains canonical,
the local layer is removed or marked conflicted, and the initiating actor receives a conflict issue. Non-
initiating actors never receive preview or preview-rollback facts.

Transaction concurrency is actor-local and exact-keyed: `reject` declines a second occurrence, `cancel`
removes the prior local layer before admitting its replacement, `allow` keeps independently ordered layers
while only the current generation controls the public projection and mapped event, and `serialize` admits
FIFO with preview application at dequeue. Retry is a new explicit commit event; no policy retries
automatically. A restored nonterminal occurrence is never replayed. If its remote identity is durable, it
becomes `unknown` and must reconcile using the same remote identity.

Continuing resource declarations own their runtime subscriptions; callers MUST NOT manually subscribe for
actor correctness. Resource routes are `value`, `failure`, `defect`, and `interrupt`. The initial
canonical value is delivered once on activation, later canonical replacements may deliver `value`, equal
values are suppressed, and overlay-only changes do not deliver `value`. Planned release emits no
interruption route. Runtime resource observation remains an external escape hatch and is not required for
actor synchronization.

Continuing streams publish a latest-value projection with `hasValue`, emission count, generation, and
terminal status. Emissions are projection-only until a mapped event or explicit `setData` makes them durable
machine or canonical state. Pressure is coalesced to the latest emission. Planned release emits no outcome,
and hydration rematerializes an active declaration from its live executable input without replaying an old
emission; terminal streams do not restart. A missing executable input after hydration fails closed with a
precise diagnostic rather than reconstructing `P` from `K`.

Polling uses the existing `after` timer and an explicit refresh event: one exact key may have one refresh in
flight, the next timer is scheduled only after settlement, failures wait for the next scheduled refresh, and
there is no implicit retry or new `poll` API. Suspension and disposal cancel and fence the timer; resume
performs at most one overdue refresh.

**Proof obligations:** Add runtime and React proofs for mailbox ordering, canonical-only cross-actor fanout,
owner-only preview visibility, promotion/rollback/CAS conflict behavior, projection-only publications,
continuing route ordering, stream latest-value coalescing and terminal hydration, explicit timer-driven
refresh, and the absence of required user subscriptions.
