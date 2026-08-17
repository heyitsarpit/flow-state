# Operations API evolved specification

Status: proposed evolved spec for review

This document evolves the syntax and semantics in OPERATIONS_SPEC.md using the requirements and
use cases in OPERATIONS.md. It is intentionally scoped to the machine-operation seam: resources,
transactions, streams, managed-child boundaries, operation reads, ownership, races, hydration, and
proof.

It is not yet a replacement for contracts/. The P(params)/K(key) resource identity and definition-level O
catalogue below require coordinated contract changes before implementation. Until those changes are
accepted, this file is the target design and the existing contracts remain the current authority.

The design goal is a small API with four clear boundaries:

1. a descriptor defines reusable external behavior;
2. a bound operation retains executable input but does no work;
3. a machine binding owns work and receives outcomes;
4. a read facade observes one immutable snapshot without changing lifecycle.

The proposal keeps the baseline spelling where it is readable, removes overloads where they hide
meaning, and states the runtime rules next to the method that depends on them.

## 1. Decisions and deliberate non-goals

### 1.1 Decisions

The evolved design makes these decisions.

| Decision            | Evolved rule                                                                                                                                          | Requirements covered                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation admission | One flat definition-level operations record admits the exact O catalogue. Listing is inert.                                                           | [O-001](./OPERATIONS.md#o-001--declare-a-closed-named-operation-catalogue), [O-002](./OPERATIONS.md#o-002--preserve-operation-local-types)                                                                                               |
| Operation layers    | Family, bound operation, ref, machine binding, and read facade are distinct capabilities.                                                             | [O-003](./OPERATIONS.md#o-003--make-binding-inert-and-distinguishable-from-execution), [O-005](./OPERATIONS.md#o-005--support-key-only-refs-without-pretending-keys-are-executable)                                                      |
| Resource input      | Parameterized resources use one named, readonly input P. Zero-parameter resources use no input.                                                       | [O-004](./OPERATIONS.md#o-004--define-resource-identity-separately-from-executable-input), [SPEC-018](./OPERATIONS.md#spec-018--resource-input-shape-is-contradictory)                                                                   |
| Resource identity   | A resource identity is descriptor ID plus canonical K. P is retained only by a live executable binding.                                               | [O-004](./OPERATIONS.md#o-004--define-resource-identity-separately-from-executable-input), [O-023](./OPERATIONS.md#o-023--choose-executable-p-when-equal-keys-have-multiple-owners)                                                      |
| Resource vocabulary | read, ensure, observe, refresh, and invalidate each have one meaning. subscribe is reserved for streams.                                              | [O-009](./OPERATIONS.md#o-009--define-fresh-hit-behavior), [O-016](./OPERATIONS.md#o-016--support-one-finite-resource-operation), [O-017](./OPERATIONS.md#o-017--support-continuing-resource-observation)                                |
| Passive reads       | ReadO is bound to one actor candidate snapshot and cannot acquire or mutate operation state.                                                          | [O-008](./OPERATIONS.md#o-008--read-from-cache-without-acquiring-ownership), [O-015](./OPERATIONS.md#o-015--keep-passive-reads-from-changing-operation-lifecycle)                                                                        |
| Invalidation        | Invalidation is a machine-owned declarative activity or transaction target, never an imperative read/ref side effect.                                 | [O-013](./OPERATIONS.md#o-013--distinguish-invalidate-remove-and-authoritative-write), [O-019](./OPERATIONS.md#o-019--invalidate-exact-refs-and-tags)                                                                                    |
| Resource writes     | Arbitrary set/update is excluded. Lookup, boot, and fixture seeding are the canonical write paths; transactions use overlays and invalidation.        | [O-012](./OPERATIONS.md#o-012--seed-a-canonical-cache-entry), [O-013](./OPERATIONS.md#o-013--distinguish-invalidate-remove-and-authoritative-write), [O-034](./OPERATIONS.md#o-034--define-optimistic-preview-and-invalidation-ordering) |
| Transactions        | Transactions are actor-local attempts identified by descriptor plus lane, with P retained per attempt.                                                | [O-026](./OPERATIONS.md#o-026--run-from-one-materialized-input), [O-028](./OPERATIONS.md#o-028--define-transaction-attempt-identity)                                                                                                     |
| Streams             | Streams are actor-owned continuing subscriptions identified by binding slot plus descriptor plus key. They do not write resource cache.               | [O-036](./OPERATIONS.md#o-036--support-a-continuing-keyed-stream), [O-037](./OPERATIONS.md#o-037--replace-stream-generations-by-key)                                                                                                     |
| Children            | Managed children remain a separate machine-composition primitive, not an O operation kind. Parent access crosses an explicit child snapshot boundary. | [O-039](./OPERATIONS.md#o-039--define-the-child-boundary), [O-044](./OPERATIONS.md#o-044--preserve-explicit-child-and-cross-machine-read-boundaries)                                                                                     |

### 1.2 Deliberate non-goals

This revision does not add:

- process-global operation registries or cache stores;
- implicit array-to-many resource bindings;
- arbitrary canonical cache mutation from guards, views, or machine turns;
- transaction result-to-resource promotion without an explicit later write contract;
- a generic retry method shared by resources, transactions, and streams;
- cross-actor transaction scheduling;
- stream replay, buffering, or progress history as a general runtime feature;
- parent-to-child command handles;
- a second React, hook, or host-owned scheduler.

These exclusions keep the operation seam small. The older Everclear example still works because it
uses explicit finite bindings, machine events, transaction invalidation, and an application-owned
submission child. See [O-024](./OPERATIONS.md#o-024--support-known-multiple-keys-without-implicit-array-semantics),
[O-033](./OPERATIONS.md#o-033--support-explicit-retry-as-a-new-attempt), and
[O-039](./OPERATIONS.md#o-039--define-the-child-boundary).

## 2. Operation layers

### 2.1 Family, bound operation, ref, binding, and ReadO

The same authored name appears in several contexts, but each context has a different capability.

| Layer              | Example                                             | Can do                                                                                             | Cannot do                                             |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Family             | O.orderById                                         | Bind P, create a key, create a key-only ref, expose descriptor metadata                            | Read, acquire, run, or mutate                         |
| Bound operation    | O.orderById({ orderId })                            | Read its identity; declare ensure, observe, or refresh; retain P for execution                     | Execute while merely constructed                      |
| Key-only ref       | O.orderById.byKey(orderKey)                         | Read an actor projection; be a target for seed, inspection, or invalidation in its allowed context | Reconstruct P, fetch, or refresh                      |
| Machine binding    | bound.ensure(options), O.orderById.observe(options) | Acquire ownership, start/join work, route outcomes, and release with state                         | Be used by a passive view                             |
| ReadO              | O.orderById.byKey(orderKey).read()                  | Read the current immutable snapshot projection                                                     | Acquire, invalidate, refresh, seed, run, or subscribe |
| Host/store adapter | runtime.resources.read(ref)                         | Inspect or install runtime-global cache data during boot, fixtures, hydration, or inspection       | Become a machine-owned binding                        |

This separation addresses the mixed concepts in [SPEC-001](./OPERATIONS.md#spec-001--binding-syntax-is-internally-inconsistent)
and the object model required by [O-003](./OPERATIONS.md#o-003--make-binding-inert-and-distinguishable-from-execution).

### 2.2 The definition-level catalogue is static and inert

Every descriptor used by a machine operation selector, invalidation target, preview, or transaction
target must be admitted by the definition-level operations record. The record is static metadata:
it contributes operation types, descriptor reachability, and service requirements to AppPlan. It
does not create an actor, store entry, lease, lookup, transaction, or stream.

```ts
const NewIntent = flow.definition({
  id: "Everclear/NewIntent",
  states: ["INACTIVE", "EDITING", "QUOTE_ACTIVE", "SUBMITTING"],
  operations: {
    routeConfig,
    assetPrices,
    walletAccounts,
    assetBalance,
    competitorFees,
    miniAppMode,
    addressLabels,
    orderById,
    routeQuote,
    intentPage,
    walletChanges,
    openWalletDialog,
    submitIntent,
    writeIntentUrl,
    writeFiltersUrl,
    submissionProgress,
  },
});

flow.machine(NewIntent, ({ S, E, O, activity }) => {
  // O contains exactly the declared names and their operation-specific types.
  // Nothing has started merely because the names are present.
  return {
    initial: S.INACTIVE,
    states: {
      INACTIVE: {},
      EDITING: {
        activities: [O.routeConfig().observe(), O.walletAccounts().observe()],
      },
      QUOTE_ACTIVE: {},
      SUBMITTING: {},
    },
  };
});
```

An undeclared descriptor returned from a selector fails before StoreState or actor mutation. A
descriptor reachable only through a passive read does not become executable reachability. This
keeps [O-001](./OPERATIONS.md#o-001--declare-a-closed-named-operation-catalogue),
[O-040](./OPERATIONS.md#o-040--reconcile-dependent-resources-from-one-actor-snapshot), and
[O-044](./OPERATIONS.md#o-044--preserve-explicit-child-and-cross-machine-read-boundaries) aligned.

### 2.3 Operation input is one named value

For a parameterized operation, P is one immutable named value. This makes the revised API readable,
makes selector output uniform, and avoids mixing variadic tuple syntax with object-shaped examples.
P may contain application-owned classes, functions, binary values, or large objects during live
execution; only K has identity and durable-carrier restrictions.

```ts
const orderById = flow.resource({
  id: "everclear.order",

  // P is executable input. The client is deliberately not part of K.
  key: ({ orderId }: OrderInput) => ({ orderId }),

  // lookup receives the original P, not a reconstructed K.
  lookup: ({ orderId, client }: OrderInput) => client.getOrder(orderId),
});
```

Zero-parameter operations use no argument:

```ts
O.routeConfig();
O.routeConfig().read();
O.routeConfig().observe();
```

A whole P is not null. When an application needs a nullable value, it wraps it in a named input,
such as { value: null }. Selector decline is therefore unambiguous:

```ts
O.orderById.observe({
  params: ({ memory }) => (memory.orderId === null ? null : { orderId: memory.orderId }),
});
```

Concrete P and selector forms are structurally distinct. A callable P can be passed to the
concrete bound form; selectors occur only under the params field of an options object. This resolves
[SPEC-020](./OPERATIONS.md#spec-020--selector-overloads-are-unsafe-for-arbitrary-p) while preserving
the baseline callable form from OPERATIONS_SPEC.md.

### 2.4 Key and ref construction

The family exposes a pure key projection and a branded key-only ref. Binding a concrete P evaluates
key(P) once during activation planning, validates and freezes K, and retains the original P for
execution.

```ts
const input = { orderId: "order-1", client };

const bound = O.orderById(input); // inert; retains executable P only
const key = O.orderById.key(input); // pure K projection
const ref = O.orderById.byKey(key); // key-only identity

const view = ref.read(); // passive actor-bound read
```

The bound operation may also expose `bound.ref()` as the same inert exact ref; that call computes
K from its retained P without acquiring ownership or starting work. The family-level `key(P)` and
`byKey(K)` forms are provided when the caller wants those two steps to be explicit.

descriptor.ref(key) remains available to fixture, boot, hydration, and inspection adapters.
O.name.byKey(key) is the normal machine-facing spelling. The two produce the same branded
ResourceRef<K> identity, but no API accepts an unbranded object where a key is required.

K validation is synchronous and bounded. It rejects unsupported values, mutable identity after
construction, cycles, non-finite numbers, reserved keys, and values outside the configured size
bound. The key callback runs before binding ownership or StoreState mutation. A key callback defect
retains the prior published actor snapshot and records a contained planning issue; it does not start
lookup. These rules address [O-004](./OPERATIONS.md#o-004--define-resource-identity-separately-from-executable-input),
[O-005](./OPERATIONS.md#o-005--support-key-only-refs-without-pretending-keys-are-executable), and
[SPEC-021](./OPERATIONS.md#spec-021--key-evaluation-and-callback-failure-boundaries-are-missing).

### 2.5 Context capability matrix

The same O names are narrowed by context. A passive context cannot access machine mutation methods.

| Context                        | Resource                             | Transaction          | Stream                    | Invalidation                |
| ------------------------------ | ------------------------------------ | -------------------- | ------------------------- | --------------------------- |
| Machine binding declaration    | bind, read, ensure, observe, refresh | run, read status     | subscribe, read lifecycle | activity.invalidate targets |
| Guard or transition read       | read, require                        | read status          | read lifecycle            | none                        |
| View selector                  | read, require                        | read status          | read lifecycle            | none                        |
| Fixture/boot/hydration adapter | ref, read, seed, inspect             | ref, read, normalize | ref, read, restart        | seed/restore adapter only   |

The matrix prevents a view from calling invalidate or a guard from calling refresh. It is the
direct API response to [O-008](./OPERATIONS.md#o-008--read-from-cache-without-acquiring-ownership),
[O-015](./OPERATIONS.md#o-015--keep-passive-reads-from-changing-operation-lifecycle), and
[SPEC-019](./OPERATIONS.md#spec-019--bykey-reads-have-no-actorstore-visibility-law).

## 3. Resource API

### 3.1 Descriptor shape

The resource descriptor owns lookup policy and P-to-K identity. Machine-specific selectors,
outcomes, and ownership stay on O bindings.

```ts
const routeQuote = flow.resource({
  id: "everclear.route-quote",
  key: (input: QuoteInput) => normalizeQuoteKey(input),
  lookup: (input: QuoteInput) => ExplorerApi.routeQuote(input),
  staleTime: "5 minutes",
  gcTime: "5 minutes",

  // Metadata derives from K, so equal keys cannot disagree about tags.
  tags: (key) => [intentsTag, quoteTag(key)],

  // Placeholder is a projection policy, not canonical data.
  placeholder: (key) => makeQuotePlaceholder(key),
});
```

Tags and placeholders are evaluated from K, materialized once for the exact-ref lifetime, and
never rerun on an equal-key P. This removes the metadata ambiguity described in
[O-011](./OPERATIONS.md#o-011--define-placeholder-and-retained-value-projections) and
[SPEC-022](./OPERATIONS.md#spec-022--duplicate-same-key-bindings-and-metadata-authority-are-unresolved).

### 3.2 Resource method meanings

| Method     | Ownership                | Starts or joins lookup  | Fresh base                  | Stale base                          | Outcome                              |
| ---------- | ------------------------ | ----------------------- | --------------------------- | ----------------------------------- | ------------------------------------ |
| read       | None                     | No                      | Returns value               | Returns value with stale metadata   | None                                 |
| ensure     | Finite binding           | Yes if missing/stale    | Settles from base           | Waits for replacement success       | At most one terminal result          |
| observe    | Continuing binding       | Yes if missing/stale    | Emits current value once    | Keeps value and ensures replacement | Value revisions and lifecycle errors |
| refresh    | Finite binding           | Yes, forced replacement | Replaces current generation | Replaces current generation         | At most one terminal result          |
| invalidate | Declarative store action | No directly             | Marks stale                 | Advances invalidation metadata      | No operation outcome                 |

The word fetch is removed from the evolved public vocabulary. It is too easy to read as an
immediate effect, while ensure describes the finite binding semantics already present in the
requirements. observe is reserved for continuing resources; subscribe is reserved for streams.
This resolves [SPEC-002](./OPERATIONS.md#spec-002--fetch-and-existing-ensure-semantics-are-unresolved)
and covers [O-009](./OPERATIONS.md#o-009--define-fresh-hit-behavior),
[O-016](./OPERATIONS.md#o-016--support-one-finite-resource-operation), and
[O-017](./OPERATIONS.md#o-017--support-continuing-resource-observation).

### 3.3 Concrete resource bindings

When P is already available, use the baseline bound form. The call creates a declarative binding
expression; it does not start work during machine construction.

```ts
const order = O.orderById({ orderId, client });

activities: [
  order.ensure({
    outcomes: {
      success: (value) => E.OrderLoaded(value),
      failure: (error) => E.OrderLoadFailed(error),
    },
  }),
];
```

A continuing binding uses the same form:

```ts
activities: [
  O.orderById({ orderId, client }).observe({
    outcomes: {
      value: (value) => E.OrderChanged(value),
    },
  }),
];
```

A forced refresh is finite and retains P because it may need to execute a lookup:

```ts
activities: [
  O.intentPage({ query: listQuery, client }).refresh({
    outcomes: {
      success: () => E.RefreshFinished(),
      failure: (error) => E.RefreshFailed(error),
    },
  }),
];
```

Calling read, ensure, observe, or refresh on a bound operation returns a plan expression. It does
not run external work inline. The actor commits the desired binding first; staged work starts only
after the actor snapshot and StoreState revision are published.

This forced replacement behavior is the explicit answer to
[O-018](./OPERATIONS.md#o-018--support-explicit-refresh).

### 3.4 Deferred resource bindings

When P depends on current actor memory or other resource reads, use the family method with an
explicit params selector. Continuing selectors receive state, memory, and snapshot-bound O. They do
not receive event because the desired P must be reconstructible from current state during
reconciliation and hydration.

```ts
activities: [
  O.routeQuote.observe({
    params: ({ state, memory, O }) => {
      const routes = O.routeConfig().read();
      const wallets = O.walletAccounts().read();
      const order =
        memory.orderId === null
          ? null
          : O.orderById.byKey(O.orderById.key({ orderId: memory.orderId })).read();

      if (routes.availability !== "value") return null;
      if (wallets.availability !== "value") return null;
      if (order !== null && order.availability !== "value") return null;

      return buildQuoteInput(memory, routes.value, wallets.value, order);
    },
    outcomes: {
      value: (quote) => E.QuoteChanged(quote),
    },
  }),
];
```

The selector is pure. It does not enumerate StoreState, call lookup, create events, or retain a
closure over mutable memory. If it returns null, the previous binding is released and its result
loses authority. If it returns P whose K is equal to the current binding, the generation and
materialized P are retained.

For edge-triggered operations, the selector may receive event:

```ts
activities: [
  O.writeIntentUrl.run({
    params: ({ event, memory, O }) =>
      event?.type !== E.UrlWriteRequested.id
        ? null
        : { query: makeIntentQuery(memory, O.routeConfig().require()) },
    outcomes: {
      success: () => E.UrlWritten(),
      failure: (error) => E.UrlWriteFailed(error),
    },
  }),
];
```

Resource observe/ensure/refresh selectors never receive event. Transaction run and invalidation
selectors may receive event because they are edge-triggered and do not need to reconstruct an
ongoing desired resource binding. This addresses [O-022](./OPERATIONS.md#o-022--re-evaluate-pure-selectors-without-stale-closures)
and [SPEC-008](./OPERATIONS.md#spec-008--selector-rules-are-incomplete-across-operation-kinds).

### 3.5 Passive resource reads

Within guards, views, and selectors, read is snapshot-bound and side-effect free.

```ts
const routes = O.routeConfig().read();
const orderKey = O.orderById.key({ orderId: memory.orderId });
const order = O.orderById.byKey(orderKey).read();

if (routes.availability !== "value") return false;
if (order.status === "loading") return false;
if (order.status === "failure") return false;
return order.availability === "value" && order.freshness === "fresh";
```

The actor-bound ReadO reads the actor's materialized projection. A ref never materialized by this
actor returns the frozen idle resource snapshot even if another actor owns or the runtime store
retains the same ref. Runtime-global inspection may read any retained entry through the host/store
adapter, but that adapter is not available in ReadO.

Resource reads return the existing bounded ResourceSnapshot shape:

| Snapshot                        | Meaning                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| idle                            | No actor projection exists; no store record is inserted                    |
| loading with empty availability | A lookup generation is active and no canonical value exists                |
| loading with placeholder        | A lookup generation is active and a non-canonical placeholder is projected |
| value, fresh                    | Canonical data is current                                                  |
| value, stale                    | Freshness elapsed; data remains readable                                   |
| value, invalidated              | Explicit invalidation marked the data stale                                |
| value with fetching activity    | Existing value remains readable during refresh                             |
| empty failure                   | The latest finite generation failed without retained canonical data        |

A failed refresh that retains canonical data does not widen the resource snapshot with an error.
The binding outcome, active issue, and inspection record carry the refresh failure. require returns
only a canonical value and rejects idle, placeholder, and empty failure. This preserves the readable
status surface in SNAPSHOTS.md while addressing [O-007](./OPERATIONS.md#o-007--read-the-complete-resource-projection)
and [O-008](./OPERATIONS.md#o-008--read-from-cache-without-acquiring-ownership).

Normal views read the effective merged value when an optimistic overlay exists. A base-only read is
inspection-only; it is not part of ReadO. This gives ordinary UI code the useful value while keeping
authority and overlay history inspectable under [O-014](./OPERATIONS.md#o-014--read-overlays-and-authoritative-values-coherently).

### 3.6 Resource invalidation

Invalidation is a machine-owned declarative activity. It is not a method available on ReadO or a
ref returned from a view. Exact refs and nominal tags are the only targets.

```ts
activities: [
  activity.invalidate({
    targets: ({ event, O }) =>
      event?.type === E.ProviderChanged.id ? [O.walletAccounts().ref()] : [],
  }),
];
```

For a parameterized ref, the binding supplies P so O can compute K once:

```ts
activities: [
  activity.invalidate({
    targets: ({ event, O }) =>
      event?.type === E.OrderSaved.id
        ? [O.orderById({ orderId: event.orderId }).ref(), intentsTag]
        : [],
  }),
];
```

The ref target and tag target are materialized, canonically deduplicated in first-seen order, and
committed in one StoreState revision. Invalidation marks an existing base stale and does not delete
it, execute lookup, or route a domain event. Invalidating a missing ref creates no base and has no
readable projection. Tag invalidation touches already-materialized refs whose retained tag vector
contains the tag; it does not enumerate descriptors or rerun tag callbacks.

An invalidation selector returns an empty target list when its triggering event is irrelevant; it
does not return a nullable target that could be mistaken for one invalid ref.

An active observe binding seeing an invalidated ref starts or joins one replacement lookup if no
current replacement generation exists. ensure remains finite and consumed; it does not restart
because a passive read or invalidation occurred. refresh explicitly forces a new generation.

This makes invalidate, remove/GC, seed, and authoritative write distinct, addressing
[O-013](./OPERATIONS.md#o-013--distinguish-invalidate-remove-and-authoritative-write),
[O-019](./OPERATIONS.md#o-019--invalidate-exact-refs-and-tags), and
[SPEC-005](./OPERATIONS.md#spec-005--invalidation-is-under-specified).

### 3.7 Seeds and authoritative writes

Seeding is available to fixture, boot, hydration, and inspection adapters. It installs canonical
data through the same StoreState path as a lookup but does not create a lookup generation or route a
binding outcome.

```ts
const fixture = flow.fixture({
  seeds: [
    { ref: routeConfig.ref(routeConfig.key()), value: routes },
    { ref: walletAccounts.ref(walletAccounts.key()), value: connectedWallets },
  ],
});
```

Machine code has no set or update method in this revision. A transaction can:

1. apply an optimistic preview to exact refs;
2. commit external work;
3. remove only its own preview;
4. invalidate declared authoritative targets on success;
5. route the server result as a typed machine event.

The server result does not silently become canonical cache data. A later explicit seed or lookup is
the authority transition. This keeps resource lookup as the canonical write owner and addresses
[O-012](./OPERATIONS.md#o-012--seed-a-canonical-cache-entry),
[O-013](./OPERATIONS.md#o-013--distinguish-invalidate-remove-and-authoritative-write), and
[O-034](./OPERATIONS.md#o-034--define-optimistic-preview-and-invalidation-ordering).

## 4. Resource lifecycle semantics

### 4.1 Activation timeline

Every resource binding follows one ordered timeline:

1. Pure selector evaluation produces P or null.
2. If P is null, the old binding is released and no new binding exists.
3. key(P) runs once; K is validated, frozen, and compared with the old identity.
4. Equal identity retains generation, P, cursor, and lease.
5. Changed identity releases the old binding and materializes the new BindingKey.
6. The actor commits the binding projection and StoreState metadata atomically.
7. After publication, the runtime starts or joins lookup work if the operation policy requires it.
8. Completion re-enters the actor/store mailboxes with exact ref and generation.
9. Only the current identity and generation can publish current data or route an outcome.

No user Effect runs during steps 1 through 6. Callback defects in pure steps retain the prior
published snapshot and create a contained issue. Lookup invocation defects belong to the admitted
lookup generation. This is the timing required by [O-021](./OPERATIONS.md#o-021--suppress-stale-generations)
and [SPEC-021](./OPERATIONS.md#spec-021--key-evaluation-and-callback-failure-boundaries-are-missing).

### 4.2 Freshness and lookup deduplication

Freshness starts at canonical value publication. Expiry marks the base stale but does not start
work by itself. An active observe binding may start or join a lookup for missing or stale data.
Focus/reconnect signals may refresh only actively observed stale refs. Offline state does not cancel
or pause current work.

One runtime store owns one current lookup generation for one resource identity. Multiple actor
owners join that generation, but each actor owns its registration, lease, value-revision cursor,
and mapped outcomes. Releasing the owner that caused the lookup does not interrupt work needed by
another owner. Work may settle warm after all registrations release, subject to GC policy.

The store, lookup generations, leases, and transaction lanes belong to one application runtime;
separate runtimes do not observe or deduplicate one another, as required by
[O-006](./OPERATIONS.md#o-006--bound-runtime-scope-to-one-application-runtime).

Lookup completion checks descriptor ID, canonical K, and generation before committing. Old
completion is a no-op for current StoreState; inspection may retain the ignored completion as
history. Old GC finalizers check lease epoch before evicting.

### 4.3 Equal K with multiple P owners

Equal K values assert equivalent canonical results. The runtime does not compare or merge P.

For a new lookup generation, the executable P is the P from the owner whose binding admission
committed that generation. The generation retains that P until completion or replacement. Later
equal-key owners join and do not replace P. If a replacement generation is requested, the current
live owner with the earliest committed BindingKey supplies P; BindingKey ordering is actor identity
plus compiled slot, never object or map iteration order.

If no owner can supply P, a key-only base remains readable but no lookup can start. If P values
contain tenant, credential, locale, feature, or transport facts that affect the result, omitting
them from K is a descriptor bug. The runtime does not try to discover that bug.

This is a deliberate author obligation rather than a hidden equality algorithm. It covers
[O-023](./OPERATIONS.md#o-023--choose-executable-p-when-equal-keys-have-multiple-owners),
[UC-9](./OPERATIONS.md#uc-9--two-actors-share-one-resource-key), and the current proposal's
first-live-owner concern.

### 4.4 Multiple keys

Known finite keys use repeated explicit bindings. The runtime does not interpret arrays as implicit
collections.

```ts
activities: [
  O.assetBalance({ account: primary, assetId }).observe(),
  O.assetBalance({ account: fallback, assetId }).observe(),
];
```

Two bindings in one configuration may not claim the same primitive BindingKey with different
outcome owners. The compiler or activation planner rejects the duplicate before StoreState
mutation. Across actors, equal resource identity joins one lookup while preserving actor-local
projections.

subscribeMany, runtime-sized membership, per-member outcomes, ordering, and collection hydration
remain a future separate primitive. This keeps [O-024](./OPERATIONS.md#o-024--support-known-multiple-keys-without-implicit-array-semantics)
and [SPEC-009](./OPERATIONS.md#spec-009--multiple-keys-are-described-but-collection-ownership-is-deferred)
closed without pretending a collection API exists.

### 4.5 Release and GC

State exit, changed identity, explicit reentry, actor disposal, and runtime disposal release
operation bindings. Planned release:

- removes the actor projection/lease;
- cancels actor-owned transaction, stream, and child work according to kind;
- removes no canonical resource base immediately;
- routes no domain outcome;
- records cleanup failures as issues and inspection facts.

Store GC starts after the last actor registration and in-flight lookup lease release, then waits
gcTime. A base may therefore outlive an actor, but the actor's binding projection disappears at the
release turn. Old GC cannot evict a ref reacquired under a newer lease epoch.

This is the lifecycle needed by [O-025](./OPERATIONS.md#o-025--release-ownership-and-collect-idle-data-exactly),
[O-043](./OPERATIONS.md#o-043--make-route-and-state-lifetime-authoritative), and [UC-7](./OPERATIONS.md#uc-7--leave-a-route-during-active-work).

## 5. Transactions

### 5.1 Descriptor and lane identity

A transaction has no reusable resource value. Its descriptor defines commit, optional preview, typed
invalidation targets, optional lane projection, and concurrency policy.

```ts
const submitIntent = flow.transaction({
  id: "everclear.submit-intent",

  // No lane means one actor-local singleton lane.
  lane: ({ submissionId }: SubmitIntent) => ({ submissionId }),

  preview: {
    apply: ({ params }) => [
      // Preview replaces an effective read; it is not canonical server truth.
      { ref: walletAccounts.ref(walletAccounts.key()), replace: params.signer },
    ],
  },

  commit: (params: SubmitIntent) => IntentSubmitter.submit(params),

  invalidates: ({ params }) => [
    intentsTag,
    assetBalance.ref(assetBalance.key({ account: params.signer, assetId: params.inputAssetId })),
  ],

  concurrency: "reject",
});
```

Transaction identity is descriptor ID plus canonical lane. Actor identity is not part of the
durable ref; it scopes execution and concurrency. The concrete P is retained by the attempt and
is never reconstructed from lane.

If lane is absent, the descriptor exposes one empty lane. If lane is present, byLane(L) reads the
actor-local transaction projection for that lane.

This resolves the vocabulary conflict in [SPEC-010](./OPERATIONS.md#spec-010--transaction-lanes-replace-keys-without-status-compatibility)
while preserving the actor-local constraint in [O-028](./OPERATIONS.md#o-028--define-transaction-attempt-identity).

### 5.2 Run syntax and admission

run is edge-triggered. It is declared in a machine binding, but it admits an attempt only on:

- fresh activation of the binding;
- an accepted domain event turn;
- an accepted timer turn;
- an explicit same-state reentry.

Store fanout, passive read, operation completion, pending outcome delivery, and internal
reconciliation turns do not admit another run.

Use an explicit options object for selectors. This prevents concrete callable P from colliding with
a selector and keeps outcomes outside the selector closure.

```ts
activities: [
  O.submitIntent.run({
    params: ({ event, memory, O }) =>
      event?.type !== E.SubmitRequested.id ? null : buildSubmissionInput(memory, O),
    outcomes: {
      success: (receipt) => E.SubmitSucceeded(receipt),
      failure: (error) => E.SubmitFailed(error),
      defect: () => E.SubmitDefected(),
      interrupt: () => E.SubmitInterrupted(),
    },
  }),
];
```

The selector result is materialized once before key/lane, preview, invalidation, and concurrency
admission. commit receives exactly that P and never rereads memory. A null result declines this
edge without creating a generation.

Static P is also allowed:

```ts
O.openWalletDialog.run({
  params: { network: "evm" },
  outcomes: {
    success: () => E.WalletDialogOpened(),
    failure: (error) => E.WalletDialogFailed(error),
  },
});
```

The static form is still a plan expression. The external commit begins only after the admitting
actor turn publishes. These rules cover [O-026](./OPERATIONS.md#o-026--run-from-one-materialized-input),
[O-027](./OPERATIONS.md#o-027--make-transaction-runs-edge-triggered), and [UC-5](./OPERATIONS.md#uc-5--submit-exactly-one-immutable-intent).

### 5.3 Transaction read

Transactions use the same passive read word, with a lane/ref-specific accessor.

```ts
const evmWalletDialog = O.openWalletDialog.byLane({ network: "evm" }).read();
const submit = O.submitIntent.byLane({ submissionId: memory.submissionId }).read();

if (submit.status === "pending" || submit.status === "queued") {
  return { canSubmit: false, reason: "submission-active" };
}
```

The read returns the existing exact transaction snapshot union:

- idle;
- queued or pending;
- success with A;
- failure with typed E;
- defect;
- interrupt.

Only the latest generation for the current binding remains in the actor snapshot. Older attempts
remain in inspection/TurnRecord history. Removing the binding makes later actor-bound reads idle;
it does not erase history. This keeps transaction status passive as required by
[O-030](./OPERATIONS.md#o-030--read-transaction-status-without-starting-work).

### 5.4 Concurrency policies

Concurrency is per actor and exact transaction ref/lane. There is no cross-actor scheduler.

| Policy    | Admission                                                      | Older attempt                                        | Completion                                                            |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| reject    | No second generation; do not evaluate preview/commit callbacks | Unchanged                                            | No routed outcome for rejected attempt                                |
| cancel    | Admit replacement after planned cancellation                   | Release/interruption is not routed as a user outcome | Only replacement may publish current projection                       |
| allow     | Admit every generation                                         | Older work may continue                              | Only current generation may replace current actor projection or route |
| serialize | Admit every request into one FIFO queue                        | Active work completes; queued inputs stay distinct   | FIFO starts one at a time; queued work is discarded on release        |

The policy applies after P, lane, preview, and invalidation materialization only where the policy
admits callback evaluation. reject must not evaluate user callbacks for the declined second attempt.

The transaction snapshot exposes no synthetic rejected status. A UI may prevent duplicate commands
with can, but correctness still comes from transaction admission. This covers [O-029](./OPERATIONS.md#o-029--support-reject-cancel-allow-and-serialize)
and the duplicate-create use case in [UC-5](./OPERATIONS.md#uc-5--submit-exactly-one-immutable-intent).

### 5.5 Outcomes, cancellation, and retry

Success, typed failure, defect, and external interruption are distinct operation lanes. A mapped
outcome is materialized into the actor's durable pending-outcome map and delivered through the
mailbox; it is never an inline callback.

Planned release, cancel replacement, and discarded queued work do not route interrupt outcomes.
An external interruption of active work may route interrupt when the binding declares it. A defect
is never widened into typed E.

Point of no return is application-owned transaction policy. Before signing or non-idempotent
broadcast, cancel can interrupt the adapter. After the point, the adapter must report an
uncertain or reconciliable domain result rather than claiming that cancellation reversed the
side effect. The Flow operation layer only preserves the lane and generation; it cannot infer
chain truth.

Retry is a new run admission from a new domain event. There is no generic transaction.retry()
method. A retry materializes fresh P, allocates a new generation, and applies the selected
concurrency policy. Hydration never retries a captured attempt.

These rules address [O-031](./OPERATIONS.md#o-031--preserve-typed-failure-defect-and-interruption-lanes),
[O-032](./OPERATIONS.md#o-032--make-cancellation-point-of-no-return-explicit), [O-033](./OPERATIONS.md#o-033--support-explicit-retry-as-a-new-attempt),
and [UC-6](./OPERATIONS.md#uc-6--cancel-superseded-url-writes).

### 5.6 Preview and invalidation ordering

Before external commit starts, Flow materializes and validates:

1. exact transaction ref/lane;
2. concurrency admission;
3. preview replacement list;
4. invalidation target list;
5. immutable commit P.

For an admitted generation, preview application is one atomic StoreState commit. Preview output
is an effective overlay, never canonical base. Every terminal lane removes only its own overlays.
Success additionally invalidates the already-materialized targets. The invalidation callback is
never rerun after commit.

```ts
const save = flow.transaction({
  id: "incident.save",
  lane: ({ incidentId }) => ({ incidentId }),
  preview: {
    apply: ({ params }) => [
      {
        ref: incidentDetail.ref(incidentDetail.key({ incidentId: params.incidentId })),
        replace: params.optimistic,
      },
    ],
  },
  commit: ({ incidentId, patch }) => api.saveIncident(incidentId, patch),
  invalidates: ({ params }) => [
    incidentDetail.ref(incidentDetail.key({ incidentId: params.incidentId })),
  ],
  concurrency: "serialize",
});
```

No transaction result automatically calls set/update on a resource. This keeps canonical resource
authority explicit and addresses [O-034](./OPERATIONS.md#o-034--define-optimistic-preview-and-invalidation-ordering)
and [SPEC-014](./OPERATIONS.md#spec-014--cache-writes-are-rejected-without-a-replacement-path).

## 6. Streams

### 6.1 Stream descriptor and binding

A stream descriptor defines a subscription from P to a Stream value. It owns key(P) because stream
replacement identity is a reusable property of the source, while the machine owns the selector
and outcome mapping.

```ts
const submissionProgress = flow.stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: ProgressInput) => ({ submissionId }),
  subscribe: ({ submissionId }: ProgressInput) => IntentSubmitter.progress(submissionId),
});
```

An unkeyed zero-input stream uses the same family surface without a bound input:

```ts
O.walletChanges.subscribe({
  outcomes: {
    value: () => E.ProviderChanged(),
  },
});
```

For a keyed stream, `O.name(P).subscribe(options)` is the concrete form and
`O.name.subscribe({ params, outcomes })` is the selector form. Both are declarative until their
owning machine binding becomes active.

The machine binding is:

```ts
O.submissionProgress.subscribe({
  params: ({ memory }) => ({ submissionId: memory.submissionId }),
  outcomes: {
    value: (step) => E.ProgressChanged(step),
    complete: () => E.ProgressComplete(),
    failure: (error) => E.ProgressFailed(error),
    defect: () => E.ProgressDefected(),
    interrupt: () => E.ProgressInterrupted(),
  },
});
```

Streams are actor-owned, not runtime-store-global. Equal keys in one binding retain one stream
generation and original P. A changed key releases the old subscription and starts a new generation.
Two actors may subscribe independently; a shared external source must be deduplicated by an
application-owned service or resource rather than an invisible Flow stream registry.

This resolves the descriptor/binding ambiguity in [SPEC-012](./OPERATIONS.md#spec-012--stream-lifecycle-and-transaction-progress-pairing-are-incomplete)
and [O-036](./OPERATIONS.md#o-036--support-a-continuing-keyed-stream) through
[O-038](./OPERATIONS.md#o-038--pair-transaction-and-progress-without-losing-either-lane).

### 6.2 Stream reads and lifecycle

The actor-bound stream reader is keyed and passive:

```ts
const progress = O.submissionProgress.byKey(submissionProgress.key({ submissionId })).read();

if (progress.status === "running") {
  return progress.key;
}
```

The lifecycle union is idle, running, complete, failure, defect, or interrupt. Stream values are
delivered only through mapped value outcomes; they do not update a resource base. A stream's
normal completion is distinct from planned release. Planned release routes no complete or interrupt
event.

Finalizers run exactly once on key replacement, state exit, actor disposal, and runtime disposal.
An old stream generation's late value is ignored by exact binding slot, key, and generation checks.

### 6.3 Submission progress pairing

The submission child owns both the submit transaction and progress stream for one immutable input.
The child stores progress by step ID and preserves the first-seen order for rendering.

```ts
const submissionWorkflow = flow.child({
  id: "everclear.submission-workflow",
  machine: submissionMachine,
});

const submissionMachine = flow.machine(Submission, ({ S, E, O }) => ({
  initial: S.RUNNING,
  states: {
    RUNNING: {
      activities: [
        O.submissionProgress.subscribe({
          params: ({ memory }) => ({ submissionId: memory.input.submissionId }),
          outcomes: {
            value: (step) => E.ProgressChanged(step),
          },
        }),
        O.submitIntent.run({
          params: ({ memory }) => memory.input,
          outcomes: {
            success: (receipt) => E.SubmitSucceeded(receipt),
            failure: (error) => E.SubmitFailed(error),
            defect: () => E.SubmitDefected(),
            interrupt: () => E.SubmitInterrupted(),
          },
        }),
      ],
    },
    FINISHED: {},
  },
}));
```

This pairing remains application-owned rather than becoming a fifth composite operation kind.
It covers [UC-5](./OPERATIONS.md#uc-5--submit-exactly-one-immutable-intent),
[O-038](./OPERATIONS.md#o-038--pair-transaction-and-progress-without-losing-either-lane), and
the older workflow in test/everclear-new-intent/flow-state/machines/submission.machine.ts.

## 7. Managed children and cross-machine reads

### 7.1 Children remain outside O

A managed child owns another actor, so it is not an external operation family. It remains an
explicit activity.child declaration with immutable input, canonical key, and parent outcome mapping.

```ts
activities: [
  activity.child(submissionWorkflow, {
    input: ({ memory }) => memory.submissionInput,
    key: (input) => ({ submissionId: input.submissionId }),
    outcomes: {
      complete: (childSnapshot) =>
        E.SubmissionFinished(childSnapshot.memory.outcome, childSnapshot.memory.steps),
      defect: () => E.SubmissionChildDefected(),
      interrupt: () => E.SubmissionChildInterrupted(),
    },
  }),
];
```

Changing the child key replaces the child generation. Equal key retains original input. The child
accepts no parent-to-child command and exposes no actor handle. A completed child snapshot is
retained by the parent binding until that binding exits.

This is the explicit answer to [O-039](./OPERATIONS.md#o-039--define-the-child-boundary) and
[SPEC-013](./OPERATIONS.md#spec-013--child-operations-are-outside-the-proposed-o-catalogue).

### 7.2 Child and cross-machine read boundaries

Parent O cannot silently read child-owned resource, transaction, or stream registries. A parent may
read a child only through the child projection already present in its own actor snapshot:

```ts
const child = snapshot.children.get(submissionWorkflow);
const progress =
  child.status === "active" || child.status === "complete" ? child.snapshot.memory.steps : [];
```

Shared behavioral facts between sibling actors use a declared resource or stream, not a private
machine-memory read. This keeps Wallet and New Intent coupled through walletAccounts rather than a
cross-actor command. It addresses [O-041](./OPERATIONS.md#o-041--share-one-canonical-resource-across-sibling-actors),
[O-042](./OPERATIONS.md#o-042--fan-out-invalidation-without-cross-actor-commands), and
[O-044](./OPERATIONS.md#o-044--preserve-explicit-child-and-cross-machine-read-boundaries).

## 8. Hydration, disposal, and persistence

### 8.1 Resource bases and bindings

Resource boot persists:

- descriptor ID;
- canonical K;
- canonical value or typed failure;
- freshness and invalidation metadata;
- value revision;
- ordered optimistic overlays;
- actor projections and emission cursors.

It never persists arbitrary executable P. Hydration installs StoreState before ordinary binding
reconciliation. A key-only hydrated base remains readable.

An active continuing resource binding restores its slot, key, lease intent, and value cursor but
not P. After the first hydrated actor publication and pending-outcome barrier, its pure selector
runs once against the restored actor snapshot. If it returns P with the same K, the binding
reacquires execution and ordinary missing/stale policy applies. If it returns null, the base remains
readable without execution and the binding records a missing-input issue only if work was required.

An in-flight resource lookup does not resume. Its old generation is normalized as interrupted
internal execution, without routing a synthetic domain outcome. A fresh selector-provided P may
start a new generation.

This is the revised P/K hydration law for [O-045](./OPERATIONS.md#o-045--hydrate-readable-resource-data-without-serializing-p)
and [UC-8](./OPERATIONS.md#uc-8--hydrate-readable-data-and-reconstruct-executable-work).

### 8.2 Finite resource operations

An active ensure or refresh generation never resumes from serialized execution. If it was pending
at capture, hydration restores its terminal internal interruption and consumed state. No success,
failure, defect, or interrupt domain event is replayed into the machine. A new explicit event,
reentry, or fresh binding activation can request work again.

Already-consumed outcomes and observe value-revision cursors are restored so hydration does not
duplicate events. If the captured store contains a canonical value revision newer than the actor
cursor, the current observe binding emits that latest value once after hydrated publication.

### 8.3 Streams

An active stream fiber, scope, cursor, transport session, and buffer are never serialized. A
running stream's materialized P may be persisted only when it satisfies the canonical durable
carrier. Otherwise dehydration fails with a typed non-durable-active-stream-input error.

Hydration restores the stream binding key and durable P, normalizes the old generation to internal
interrupt without routing it, and starts one fresh subscription after readiness. It does not resume
the old cursor or replay buffered values. A terminal stream remains consumed and does not restart
just because the runtime was hydrated.

### 8.4 Transactions and children

Pending or queued transactions restore as terminal interruption with an issue and inspection
receipt. Their overlays are removed before the first hydrated actor publication. They never retry
automatically and never route a synthetic event. A new user command creates a new generation.

A terminal child restores its frozen complete/defect/interrupt projection and consumed parent
outcome. Hydration does not recreate a completed child actor or replay its parent event.

### 8.5 Disposal ordering

Runtime disposal closes new admission first, then releases actor-owned transactions, streams,
children, and resource registrations, waits for finalizers, publishes disposed snapshots, and
completes snapshot streams. It never publishes a half-released actor/store turn. Repeated disposal
returns the same settled result.

This covers [O-025](./OPERATIONS.md#o-025--release-ownership-and-collect-idle-data-exactly),
[O-035](./OPERATIONS.md#o-035--normalize-pending-transactions-during-hydration),
[O-045](./OPERATIONS.md#o-045--hydrate-readable-resource-data-without-serializing-p), and
[O-046](./OPERATIONS.md#o-046--restore-streams-as-fresh-subscriptions).

## 9. End-to-end examples

### 9.1 Fresh singleton read

```ts
const routes = O.routeConfig().read();

// A fresh seeded base is readable immediately.
// This read does not acquire a lease or start routeConfig.lookup.
if (routes.availability === "value" && routes.freshness === "fresh") {
  return routes.value;
}
```

Covers [UC-1](./OPERATIONS.md#uc-1--read-a-fresh-singleton-resource) and
[O-008](./OPERATIONS.md#o-008--read-from-cache-without-acquiring-ownership).

### 9.2 Prerequisite-driven quote

```ts
const quoteBinding = O.routeQuote.observe({
  params: ({ memory, O }) => {
    const routes = O.routeConfig().read();
    const wallets = O.walletAccounts().read();

    if (routes.availability !== "value") return null;
    if (wallets.availability !== "value") return null;

    return buildActiveQuoteInput(memory, routes.value, wallets.value);
  },
  outcomes: {
    value: (quote) => E.QuoteChanged(quote),
  },
});
```

Amount edits reenter the debounce state, changing the quote binding key. A late amount-10
completion cannot publish over the current amount-12 generation. Covers [UC-2](./OPERATIONS.md#uc-2--wait-for-prerequisites-then-fetch-one-quote),
[O-020](./OPERATIONS.md#o-020--deduplicate-exact-ref-lookup-generations), and
[O-021](./OPERATIONS.md#o-021--suppress-stale-generations).

### 9.3 Provider invalidation

```ts
const walletActivities = [
  O.walletChanges.subscribe({
    outcomes: {
      value: () => E.ProviderChanged(),
    },
  }),
  activity.invalidate({
    targets: ({ event, O }) =>
      event?.type === E.ProviderChanged.id ? [O.walletAccounts().ref()] : [],
  }),
  O.walletAccounts().observe(),
];
```

The stream emits a domain event; invalidation marks the exact wallet ref stale; observe starts or
joins one replacement lookup. New Intent observes the same canonical ref and receives the new value
without reading Wallet memory. Covers [UC-3](./OPERATIONS.md#uc-3--provider-change-invalidates-shared-wallet-data).

### 9.4 Paginated list with previous rows

```ts
const list = O.intentPage.observe({
  params: ({ memory }) => ({
    query: listQueryFrom(memory),
  }),
});

const currentPage = O.intentPage.byKey(O.intentPage.key({ query: listQueryFrom(memory) })).read();

const previousPage =
  memory.previousQuery === null
    ? null
    : O.intentPage.byKey(O.intentPage.key({ query: memory.previousQuery })).read();
```

Filter changes reset cursor/history and change K in one actor turn. The view may deliberately use
previousPage for presentation while currentPage loads; previousPage cannot authorize current submit
or pagination actions. Covers [UC-4](./OPERATIONS.md#uc-4--paginate-while-retaining-prior-rows),
[O-024](./OPERATIONS.md#o-024--support-known-multiple-keys-without-implicit-array-semantics), and
[O-043](./OPERATIONS.md#o-043--make-route-and-state-lifetime-authoritative).

### 9.5 Submit with progress and invalidation

```ts
const submitBinding = O.submitIntent.run({
  params: ({ event, memory, O }) =>
    event?.type === E.SubmitRequested.id ? buildSubmissionInput(memory, O) : null,
  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
    defect: () => E.SubmitDefected(),
    interrupt: () => E.SubmitInterrupted(),
  },
});
```

The input is frozen at admission. A second click is rejected at the actor-local lane. On success,
the transaction removes its own overlay and invalidates the intent tag and signer balance ref. The
submission child retains progress steps and final outcome after primitive release. Covers [UC-5](./OPERATIONS.md#uc-5--submit-exactly-one-immutable-intent),
[O-029](./OPERATIONS.md#o-029--support-reject-cancel-allow-and-serialize), and
[O-038](./OPERATIONS.md#o-038--pair-transaction-and-progress-without-losing-either-lane).

### 9.6 Superseded URL writes

```ts
const writeUrl = O.writeIntentUrl.run({
  params: ({ event, memory, O }) =>
    event?.type === E.DraftChanged.id
      ? { query: makeIntentQuery(memory, O.routeConfig().require()) }
      : null,
  outcomes: {
    success: () => E.UrlWritten(),
  },
});
```

writeIntentUrl uses concurrency cancel. The older materialized query cannot publish after the
newer query. Planned cancellation produces no interrupt domain event. Covers [UC-6](./OPERATIONS.md#uc-6--cancel-superseded-url-writes).

### 9.7 Route exit

```ts
QUOTE_ACTIVE: {
  activities: [
    O.routeQuote.observe({ params: quoteInput }),
    O.writeIntentUrl.run({ params: urlInput }),
  ],
  on: {
    RouteLeft: S.INACTIVE,
  },
}
```

Leaving the state releases quote observation and URL attempts. A lookup may finish warm in the
runtime store, but its old binding cannot route into the inactive actor. Covers [UC-7](./OPERATIONS.md#uc-7--leave-a-route-during-active-work).

### 9.8 Hydrated readable data

```ts
// Host/inspection context can see a hydrated base by key.
const ref = orderById.ref(orderById.key({ orderId }));
const hydrated = runtime.resources.read(ref);

// Actor-bound O only sees a projection if this actor materialized the ref.
const current = O.orderById.byKey(orderById.key({ orderId })).read();
```

The base remains readable without P. A restored observe selector can later supply P and reacquire
lookup. A pending transaction does not resume. Covers [UC-8](./OPERATIONS.md#uc-8--hydrate-readable-data-and-reconstruct-executable-work).

### 9.9 Shared resource key

```ts
// Wallet and New Intent each own an observe binding.
const walletBinding = O.walletAccounts().observe();
const intentBinding = O.walletAccounts().observe();
```

There is one runtime-global wallet lookup generation and two actor-local projections. The first
generation retains its selected P; later equal-key owners join. Releasing one actor leaves the
other owner intact. Covers [UC-9](./OPERATIONS.md#uc-9--two-actors-share-one-resource-key).

### 9.10 Ignored late completion

```ts
// The story resolves call 0 only after call 1 has become current.
await quoteCall.call(0).succeed(quoteForAmount10);
await story.checkpoint("stale-quote-ignored");

await quoteCall.call(1).succeed(quoteForAmount12);
await story.checkpoint("quote-ready");
```

The old generation is retained for inspection but cannot change current resource data, route an
outcome, or authorize submit. Covers [UC-10](./OPERATIONS.md#uc-10--prove-ignored-work-and-cleanup).

## 10. Proof obligations

The revised spec is complete only when focused proofs cover these semantic rows:

| Proof | Required observation                                                                                                                                          | Requirements/use cases          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| P-01  | Definition operation catalogue admits exact names and rejects undeclared refs without starting work.                                                          | O-001, O-002                    |
| P-02  | Bound construction is inert; key evaluation occurs once at activation.                                                                                        | O-003, O-004                    |
| P-03  | Actor-bound missing read returns idle and changes no revision; host read can inspect retained hydrated base.                                                  | O-005, O-008, O-045             |
| P-04  | Fresh ensure settles without lookup; stale observe retains value and starts one replacement.                                                                  | O-009, O-010, O-016, O-017      |
| P-05  | Invalidation marks stale, does not execute, and active observe refetches once.                                                                                | O-019, UC-3                     |
| P-06  | Two actors join one exact resource generation and release independently.                                                                                      | O-020, O-041, UC-9              |
| P-07  | Equal K retains generation/P; replacement uses deterministic owner selection.                                                                                 | O-023, UC-9                     |
| P-08  | Two known keys remain independent; duplicate same BindingKey is rejected.                                                                                     | O-024, UC-4                     |
| P-09  | Old lookup completion and old GC cannot overwrite newer identity/lease.                                                                                       | O-021, UC-2, UC-10              |
| P-10  | Transaction input is materialized once; reject/cancel/allow/serialize obey their admission rules.                                                             | O-026 through O-029, UC-5, UC-6 |
| P-11  | Preview and invalidation are materialized before commit; success removes own overlay and invalidates targets.                                                 | O-034, UC-5                     |
| P-12  | Retry is a new command; pending transaction hydration does not retry.                                                                                         | O-033, O-035                    |
| P-13  | Stream equal key retains, changed key replaces, planned release routes nothing, late values are ignored.                                                      | O-036 through O-038             |
| P-14  | Child completion publishes final snapshot before parent outcome and parent retains terminal output.                                                           | O-039, UC-5                     |
| P-15  | Route exit releases all owned operation work and leaves no late current outcome.                                                                              | O-025, O-043, UC-7              |
| P-16  | Hydration installs store first, restores cursors, reconstructs resource P only through selector, restarts durable streams fresh, and normalizes transactions. | O-035, O-045, O-046, UC-8       |
| P-17  | Story controls observe exact service input, ordinal, late completion, clock boundary, and closed cleanup.                                                     | O-047, O-048, UC-10             |

Every proof must use real operation boundaries and published snapshots. Source-text checks,
fabricated primitive snapshots, wall-clock sleeps, and process-global registries do not prove these
rules.

## 11. Migration notes from OPERATIONS_SPEC.md

The baseline syntax remains recognizable, but these changes are intentional:

| Baseline                                  | Revised rule                                                                    | Reason                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| O.name(P).fetch                           | O.name(P).ensure                                                                | Finite resource acquisition has one name and does not collide with stream subscribe.                    |
| O.name.subscribe(selector)                | O.name.observe({ params: selector, outcomes })                                  | Continuing resource ownership is distinct from stream subscription and selector overloads are explicit. |
| O.name.byKey(K).invalidate()              | activity.invalidate({ targets })                                                | Passive refs and reads cannot perform imperative store mutation.                                        |
| descriptor.ref(K) in machine examples     | O.name.byKey(K) in actor reads; descriptor.ref(K) in host/fixture adapters      | Read context and host identity context are explicit.                                                    |
| transaction key plus byLane proposal      | lane plus actor-local exact transaction ref                                     | A transaction lane is not a resource cache key, but still needs an exact status identity.               |
| stream descriptor key plus open lifecycle | descriptor key plus actor-local keyed subscription and explicit lifecycle read  | Stream generations are not runtime-global cache data.                                                   |
| open set/update                           | excluded from first revision                                                    | Canonical write authority and overlay races need a separate contract.                                   |
| open subscribeMany                        | explicit repeated bindings only                                                 | Runtime-sized collection semantics are not implicit.                                                    |
| active P absent from hydration            | selector reconstruction for resources; durable P requirement for active streams | Resource K is durable identity, while streams need concrete restart input.                              |

These changes answer the issues listed in [OPERATIONS.md](./OPERATIONS.md#current-operations_specmd-issues-to-resolve)
and preserve the source behavior in [UC-1](./OPERATIONS.md#uc-1--read-a-fresh-singleton-resource)
through [UC-10](./OPERATIONS.md#uc-10--prove-ignored-work-and-cleanup).

## 12. Final decision order for contract promotion

When this proposal is accepted, promote it in this order:

1. definition-level operations and O capability types;
2. P/K resource identity, branded keys, refs, metadata, and snapshot readers;
3. resource bindings, lookup generations, invalidation, freshness, leases, and GC;
4. transaction lanes, statuses, concurrency, previews, invalidation, and hydration;
5. actor-owned streams and explicit child boundaries;
6. persistence, story controls, proofs, and migration/deletion records.

Do not implement a later section while an earlier identity or capability decision is still
ambiguous. The operation API is small only when each name has one owner, one lifecycle, and one
read meaning.
