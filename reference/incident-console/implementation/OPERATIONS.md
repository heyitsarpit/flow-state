# Operations requirements and use cases

Status: exploratory requirements inventory

This file is the working inventory for the machine-operation API represented by O.name*. It is
deliberately earlier than a contract: it records the actions, observable behavior, ownership rules,
races, and persistence cases that the final API must explain. It does not settle method names or
replace the current contracts.

The scope is the operation seam:

- resources and their cache identity, reads, lookup ownership, refresh, invalidation, and cache
  lifecycle;
- transactions and their attempts, concurrency, outcomes, previews, cancellation, and
  invalidation;
- streams and their continuing keyed subscriptions;
- the operation-facing part of managed children, because the older example uses a child to pair
  submission with progress;
- reads and operation effects inside machine turns, views, stories, hydration, and multiple actors.

Actor composition, React rendering, the general Effect service model, and the rest of the application
contract are included only where an operation cannot be specified without them.

## Observed operation inventory

The older Everclear example exercises this concrete operation set. It is the baseline use-case
inventory for the new API, not a claim that the current runtime already supports these wrappers.

| Kind          | Operations                                                                                                                            | Distinct behavior required                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Resource      | routeConfig, assetPrices, orderById, routeQuote, competitorFees, assetBalance, miniAppMode, addressLabels, intentPage, walletAccounts | Zero-argument singletons, parameterized refs, stale and GC policy, exact reads, continuing observation, refresh, and multiple keys |
| Stream        | walletChanges, submissionProgress                                                                                                     | Unkeyed provider stream, keyed submission progress, value mapping, completion/failure/interruption, and replacement                |
| Transaction   | openWalletDialog, submitIntent, writeIntentUrl, writeFiltersUrl                                                                       | Reject duplicate attempts, invalidate exact refs/tags, cancel superseded URL writes, and preserve materialized inputs              |
| Managed child | submissionWorkflow                                                                                                                    | Immutable input, submissionId replacement key, progress pairing, terminal child snapshot, defect/interruption, and parent output   |

Evidence: test/everclear-new-intent/flow-state/primitives.ts:8-185 and the machine bindings in
test/everclear-new-intent/flow-state/machines.

## How to read this document

Each requirement records the behavior the API needs, the use cases that depend on it, the API and
semantic questions to clarify, and the evidence that exposed the need. Required means the capability
is needed somewhere in the operation surface. Open means the capability is needed but its exact
authority or syntax is unresolved. Rejected for now means the current proposal excludes it and that
exclusion still needs confirmation.

The source example is design material, not shipped behavior. Its inventory is still useful because
it shows the actions the application needs: observe, refresh, invalidate, run, stream, seed,
inspect, release, and protect against late work.

## Working model

The final design needs to distinguish these objects even if the public syntax makes some convenient:

| Object          | Meaning                                                                 | What it must not imply                                    |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Descriptor      | Reusable operation definition with identity, types, and external policy | Running work or owning a cache entry                      |
| P               | Concrete executable input passed to lookup, commit, or subscription     | Durable identity when it contains non-durable data        |
| K               | Canonical identity projection for a resource or continuing binding      | A reversible recipe for reconstructing P                  |
| Ref             | Durable address for one operation family and identity                   | Ownership, execution, or a hidden parent actor            |
| Bound operation | Inert O.name(P) value retaining input and identity                      | Immediate lookup, commit, subscription, or cache mutation |
| Binding         | Machine-owned declaration that selects and retains work                 | A passive read or React subscription                      |
| Generation      | One admitted lookup, attempt, or subscription lifetime                  | The whole descriptor lifetime                             |
| Base            | Canonical resource value and metadata in the runtime store              | An actor-local copy that another actor can publish        |
| Projection      | What one actor snapshot exposes for a ref or attempt                    | A second canonical authority                              |
| Outcome         | A durable mailbox-admitted event derived from work                      | An inline callback into machine behavior                  |

The current proposal recommends P/K separation for resources, descriptor-plus-K identity, and a flat
inert O catalogue. The older contract still defines resources by the full canonical lookup tuple,
so this document treats that as a migration conflict to resolve rather than silently choosing one
side.

## A. Operation catalogue and identity

### O-001 — Declare a closed named operation catalogue

Status: Required.

The machine definition must declare one finite named operation record, and the behavior callback
must receive an O object whose keys and operation kinds are exactly those declarations. Listing a
descriptor must be inert: it must not read, acquire, subscribe, run, or mutate anything.

Use cases: O.routeConfig, O.orderById, O.submitIntent, and O.submissionProgress are statically
available in the New Intent machine, while a view or machine cannot reach an undeclared resource by
manufacturing a ref.

Clarify whether children belong in O or remain a separate activity.child operation. Define how
descriptor reachability is admitted for refs returned by selectors, invalidation callbacks,
previews, and child workflows.

Evidence: DESIGN_REVISIONS.md:156-184,328-331; the older machine declarations under
test/everclear-new-intent/flow-state/machines.

### O-002 — Preserve operation-local types

Status: Required.

Each O.name wrapper must preserve the descriptor input, success value, typed failure,
requirements, identity, and operation kind. A resource wrapper must not expose transaction
methods, and a transaction wrapper must not expose resource cache methods.

Use cases: a route resource can be read or observed, submitIntent can be run, and a progress
stream can be subscribed to without widening A, E, R, P, or K to an untyped registry value.

Clarify the exact inferred types for zero-argument, one-argument, and structured-input operations,
including whether the public wrapper is callable, has byKey, or has both forms. The current
normative machine grammar does not yet admit an operations field or O callback, so this also
requires deciding whether operation admission belongs on the definition or machine and updating
AppPlan reachability and requirements propagation together.

Evidence: contracts/TYPE_SYSTEM.md TYPE-005 through TYPE-008; DESIGN_REVISIONS.md:156-184.

### O-003 — Make binding inert and distinguishable from execution

Status: Required.

Constructing O.name(P), O.name.byKey(K), or a selector must only materialize identity and retain
the input needed for later work. Execution begins only when a machine-owned binding is activated
or an explicit transaction edge is admitted.

Use cases: a guard constructs a ref to inspect an order without starting a request; O.orderById(P)
can be declared in an activity without fetching during machine construction; a view can select a
read without retaining a lease.

Clarify the syntax for an inert bound operation, a read accessor, and an owned binding so an
observe-like method cannot be mistaken for an immediate subscription. A callable P must not be
ambiguous with a selector function, so selector forms need an explicit wrapper or discriminant.

Evidence: OPERATIONS_SPEC.md:16-28,201-206; DESIGN_REVISIONS.md:201-221.

### O-004 — Define resource identity separately from executable input

Status: Required, API open.

A resource must be able to retain arbitrary executable P while addressing canonical data with a
bounded K. Equal K values within one descriptor assert that the corresponding inputs produce
equivalent canonical data.

Use cases: a quote lookup can retain a rich request object while caching by normalized quote
identity; two actors can request the same order with equivalent inputs and join one lookup
generation.

Clarify whether descriptor ID plus canonical K is the sole resource identity, define canonical
bounds and validation, and decide whether key(P) is public or only available through a descriptor
ref helper. Also choose one input shape: the current contract is variadic tuple-shaped while the
proposal is one named object input. Decide how this change updates old resource-ref, wire, type,
and proof contracts.

Evidence: DESIGN_REVISIONS.md:186-208,332-346; the conflicting rules in
contracts/PUBLIC_API.md:256-295 and contracts/SEMANTICS.md:183-190.

### O-005 — Support key-only refs without pretending keys are executable

Status: Required.

A key-only ref must identify, read, seed, inspect, invalidate, and persist a resource entry. It
must not start or refresh lookup work unless the API also receives a live P that can execute the
lookup.

Use cases: hydrated order data is readable from a key-only operation even when the original client
input is gone; an invalidation target names a ref without rerunning lookup; a fixture seeds a ref
before an actor binds it.

Clarify whether refs are created as descriptor.ref(K), O.name.byKey(K), or both, and whether read
returns a raw base, a status union, or an actor-bound projection.

Evidence: OPERATIONS_SPEC.md:73-104,270-279; DESIGN_REVISIONS.md:201-206.

### O-006 — Bound runtime scope to one application runtime

Status: Required.

Shared resource bases and lookup deduplication must be global only within one Flow application
runtime. Separate app runtimes, SSR requests, tests, and browser roots must not share operation
state accidentally.

Use cases: two sibling actors read one canonical wallet-account value and one lookup, while a
second test runtime starts empty and cannot observe the first test's cache.

Clarify which runtime owns StoreState, lookup fibers, leases, and transaction lanes, and ensure no
process-global registry is reachable through O.

Evidence: OPERATIONS_SPEC.md:25-28; contracts/ARCHITECTURE.md:165-206.

## B. Resource reads and cache actions

### O-007 — Read the complete resource projection

Status: Required.

A read must distinguish at least missing, loading, placeholder, value, stale value, failure with
retained value, defect, interruption, invalidated, and collected states where those distinctions
affect a guard or view.

Use cases: New Intent blocks submit while an order is loading, missing, expired, or filled; the
list view keeps prior rows visible while a new page loads; a quote failure remains renderable
without copying primitive status into machine memory.

Clarify the smallest public status union, whether stale data and failure coexist with a value, how
overlays appear in reads, and whether generation metadata is public or inspection-only.

Evidence: test/everclear-new-intent/flow-state/views.ts:57-195;
test/everclear-new-intent/REQUIRED_TESTS.md:18,27-28; contracts/SNAPSHOTS.md.

### O-008 — Read from cache without acquiring ownership

Status: Required.

A read from a guard, view, child snapshot, story assertion, or inspection surface must observe the
current canonical store projection without starting lookup, refreshing, retaining a lease, changing
freshness, or preventing GC.

Use cases: a submit guard reads the exact fresh quote; a view renders an order blocker; a parent
reads a child only through an explicit child snapshot boundary.

Clarify whether read is a method on bound operations, key-only operations, snapshots, or all three.
Define the snapshot boundary so one guard cannot observe a half-published store commit. Decide
whether byKey can read any AppPlan-admitted StoreState entry or only a ref materialized in the
current actor projection; those choices produce different cross-actor and view semantics.

Evidence: OPERATIONS_SPEC.md:235-268; contracts/SEMANTICS.md:68-99,497-504.

### O-009 — Define fresh-hit behavior

Status: Required.

A finite read operation must settle from a fresh canonical value without starting another lookup,
and an observing binding must publish the current value once on activation without duplicating the
same value revision.

Use cases: re-entering a route with fresh route configuration makes no API call; two owners
activating against a fresh order see one value and no duplicate request.

Clarify one public word for the finite operation, such as ensure or fetch, and define whether a
fresh hit produces success, value, or only a projection.

Evidence: OPERATIONS_SPEC.md:102-104; contracts/PUBLIC_API.md:346-353;
contracts/SEMANTICS.md:199-205,264-283.

### O-010 — Define missing and stale-hit behavior

Status: Required.

Missing data must start a lookup when an owning binding activates. Stale data must remain readable
while the owner starts or joins replacement work; invalidation must not silently erase usable data.

Use cases: quote work starts after route, wallet, and order prerequisites arrive; a stale list page
stays visible during refresh; provider change invalidates wallet accounts and the active observer
obtains the replacement.

Clarify whether stale data settles a finite read, whether stale and invalidated are distinct, and
whether passive ensure may trigger work or only an active observer may do so.

Evidence: OPERATIONS_SPEC.md:16-28,94-104;
test/everclear-new-intent/flow-state/machines/intents.machine.ts:103-125;
contracts/SEMANTICS.md:192-216.

### O-011 — Define placeholder and retained-value projections

Status: Open but needed if retained placeholders remain supported.

A descriptor may provide placeholder data while a lookup is active, but placeholder data must be
visibly different from canonical success and must not become persisted or authoritative data.

Use cases: a detail view renders a skeleton-shaped projection while an order lookup runs, while a
prior list page remains explicitly available as previousQuery.

Clarify whether placeholder support remains, whether it is descriptor policy or binding policy, and
how it interacts with stale values and optimistic overlays. If equal K values may come from
different P values, define whether tags and placeholders derive from K or belong to the first
selected P for that exact-ref lifetime.

Evidence: contracts/SEMANTICS.md:218-226,294-299; the current proposal does not specify it.

### O-012 — Seed a canonical cache entry

Status: Required.

The operation surface must support trusted fixture, server-boot, and hydration-time seeding of an
exact resource ref without pretending the seed was a lookup success or running an external Effect.

Use cases: stories seed routes, prices, mini-app mode, labels, and wallet accounts before the first
actor turn; SSR installs a response so the browser can read it before deciding whether to refetch.

Clarify who may seed, whether seed can overwrite fresh data, how revisions and freshness are
assigned, and whether runtime machine code can seed or only boot/fixture infrastructure can.

Evidence: test/everclear-new-intent/flow-state/stories.ts:74-87;
DESIGN_REVISIONS.md:201-206; OPERATIONS_SPEC.md:144-163.

### O-013 — Distinguish invalidate, remove, and authoritative write

Status: Required distinction, exact API open.

The design must not use one word for three different actions:

- invalidation marks a base stale and may authorize active observation to refetch;
- removal or eviction deletes a base or makes it collectible and defines what readers see;
- authoritative write installs canonical data and defines its source and revision authority.

Use cases: provider changes invalidate accounts; GC removes an unowned entry; trusted boot seeds
data; a mutation response either remains a machine event or explicitly writes a resource base.

Clarify whether set/update are intentionally excluded. If included, define atomic ordering, typed
absence, overlay interaction, authority, and allowed callers. If excluded, define the supported
mutation-to-cache pattern.

Evidence: OPERATIONS_SPEC.md:144-163; contracts/SEMANTICS.md:331-339;
test/everclear-new-intent/flow-state/primitives.ts:146.

### O-014 — Read overlays and authoritative values coherently

Status: Required if previews remain.

A transaction preview may project an optimistic value without replacing the canonical base. Reads
must state whether they return the overlay, base, or both, and all actors must see the same ordered
overlay result within one runtime.

Use cases: a save shows an optimistic incident; a failed submit removes only its own preview; a
later overlay is not lost when an older transaction settles.

Clarify whether read returns a merged projection and how callers request base-only or overlay-aware
reads. Define insertion order, removal, failure, hydration, and GC.

Evidence: contracts/PUBLIC_API.md:367-416; contracts/SEMANTICS.md:325-339.

### O-015 — Keep passive reads from changing operation lifecycle

Status: Required.

A view or guard read cannot keep data alive, suppress stale marking, authorize focus/reconnect
refresh, or change a transaction or stream status. Only a stabilized machine binding owns work.

Use cases: a component unmount cannot cancel an actor-owned lookup; a dashboard reads wallet
accounts without becoming an owner; inspection does not prevent GC.

Clarify whether a machine callback O is always read-only, whether views receive the same O shape,
and how child snapshots are read without bypassing ownership.

Evidence: OPERATIONS_SPEC.md:235-268; DESIGN_REVISIONS.md:350-354;
contracts/SEMANTICS.md:192-197.

## C. Resource ownership and lookup behavior

### O-016 — Support one finite resource operation

Status: Required.

A machine must request one finite resource result: use a fresh hit, otherwise start or join one
exact-ref lookup generation, map the result to an event, and become consumed without becoming a
permanent owner.

Use cases: a refresh state requests the current intent page once; a finite order read can precede
a domain action; a finite lookup reports failure without becoming a continuing subscription.

Clarify ensure versus fetch, whether finite operations can be retried by reentry, and whether a
finite binding can join an observer while retaining separate outcome delivery.

Evidence: contracts/PUBLIC_API.md:299-353;
test/everclear-new-intent/flow-state/machines/intents.machine.ts:103-125.

### O-017 — Support continuing resource observation

Status: Required.

A machine must own a resource ref over a state lifetime. The binding observes the current value,
authorizes missing or stale lookup, receives later canonical value revisions, and releases its
lease on state exit.

Use cases: New Intent observes route, prices, wallet accounts, order, balance, quote, and fees;
the list screen observes page and labels; sibling actors observe one wallet resource.

Clarify observe versus subscribe, whether continuing bindings also map finite failures, and the
first-emission and equal-value rules.

Evidence: OPERATIONS_SPEC.md:73-104;
test/everclear-new-intent/flow-state/machines/new-intent.machine.ts:79-98,229-277;
contracts/SEMANTICS.md:262-292.

### O-018 — Support explicit refresh

Status: Required.

A machine must request replacement work for one exact resource identity even when its value is
fresh. Refresh creates or joins the defined replacement generation, preserves the old value
according to policy, and reports its own finite outcome.

Use cases: manual list refresh and the 60-second poll refresh the current filter/cursor; provider
change obtains new accounts; a user retries a failed quote.

Clarify whether refresh requires bound P, whether repeated refreshes replace or serialize, and
whether success is a finite outcome, continuing value, or both.

Evidence: test/everclear-new-intent/flow-state/machines/intents.machine.ts:103-125;
OPERATIONS_SPEC.md:94-104; contracts/SEMANTICS.md:199-205.

### O-019 — Invalidate exact refs and tags

Status: Required.

The API must invalidate exact resource identities and, where needed, nominal tags in one ordered
operation. Invalidation must not execute lookup or route a domain event; active observation may
then refresh according to policy.

Use cases: ProviderChanged invalidates wallet accounts; successful submit invalidates the intent
list tag and signer balance; a filter change can abandon one page ref without invalidating every
page.

Clarify whether key-only invalidation and machine-level target selectors coexist, how vectors are
deduplicated, and whether invalidating a missing ref is observable. Invalidation must be planned
through the actor/store commit boundary, so it cannot be an imperative side effect callable from a
passive guard or view.

Evidence: wallet.machine.ts:18-32; primitives.ts:138-148;
contracts/PUBLIC_API.md:312-353.

### O-020 — Deduplicate exact-ref lookup generations

Status: Required.

Concurrent owners of one exact resource identity must join one runtime-store lookup generation. A
new generation replaces the old only through explicit refresh, identity replacement, or runtime
policy.

Use cases: Wallet and New Intent activate without duplicate account calls; prerequisite fanout
starts one quote call; manual refresh does not create a duplicate page generation.

Clarify join state, replacement trigger, in-flight lease, and behavior when the first owner leaves
while another remains. Keep resource-global lookup ownership distinct from actor-local transaction
concurrency.

Evidence: OPERATIONS_SPEC.md:16-28; contracts/SEMANTICS.md:199-205,420-425.

### O-021 — Suppress stale generations

Status: Required.

A completion publishes only if it still matches descriptor identity and generation. An old result
must not overwrite a newer value, settle a newer finite binding, or re-authorize a changed draft.

Use cases: the quote for amount 10 completes after amount 12; an old GC or lookup finalizer cannot
remove a ref reacquired by a newer owner.

Clarify the comparison tuple for resource completion and whether stale completion is a no-op,
inspection fact, or issue. Define how store revisions and activation generations combine.

Evidence: stories.ts:145-171; contracts/SEMANTICS.md:307-311,427-433.

### O-022 — Re-evaluate pure selectors without stale closures

Status: Required.

A continuing selector derives current P from the current actor snapshot and retains the original
materialized P while the derived identity remains equal. It must not close over mutable memory in
an outcome mapper or require an event it cannot reconstruct during hydration.

Use cases: quote work starts when prerequisites arrive; equal quote inputs retain their generation;
changed amount replaces the quote ref; a late outcome reads current memory.

Clarify selector inputs for resources, transactions, invalidations, refresh, and streams. Decide
which edge-triggered operations may receive event. Define when key/lane callbacks run, how callback
throws are classified, and whether a failed pure callback retains the prior snapshot without
starting work.

Evidence: OPERATIONS_SPEC.md:42-71; new-intent.machine.ts:229-277;
contracts/SEMANTICS.md:27-52.

### O-023 — Choose executable P when equal keys have multiple owners

Status: Open and high risk.

If several owners produce one resource K from different P values, the runtime needs a deterministic
execution-input law. The selected P must not change because object identity or map order changed.

Use cases: two actors request one order with different client instances; one owner leaves while
the other remains; hydrated data is readable before a live owner supplies P.

Clarify or reject the proposed first-live-owner rule. If accepted, define stable handoff,
replacement timing, and what happens when the first owner leaves during lookup. An alternative is
rejecting equal K values whose P values are not proven equivalent.

Evidence: OPERATIONS_SPEC.md:66-71,281-291; DESIGN_REVISIONS.md:201-208,347-349.

### O-024 — Support known multiple keys without implicit array semantics

Status: Required for finite sets; collection API open.

A machine must own several bindings of one descriptor at once. Each exact key is independent and
reconciles and releases separately.

Use cases: New Intent reads balances for selected wallet and asset; a screen reads primary and
fallback accounts; a list retains the previous page while loading a new page.

Clarify that repeated statically compiled O.assetBalance(P).observe bindings are the first form.
Defer runtime-sized collections until membership, bounds, per-key outcomes, ownership, and
persistence are specified together. Also decide whether duplicate same-key bindings in one actor
are rejected during planning or retain independent cursors and outcomes while sharing execution.

Evidence: OPERATIONS_SPEC.md:106-142; contracts/ARCHITECTURE.md:329-333.

### O-025 — Release ownership and collect idle data exactly

Status: Required.

Leaving a state, replacing a key, explicit reentry, actor disposal, and runtime disposal release
the binding lease and work according to operation kind. Resource data may remain warm until gcTime;
collection must never race a newer acquisition.

Use cases: RouteLeft releases timers, quote, list polling, URL work, streams, children, and queued
attempts; releasing one wallet observer does not cancel another owner's lookup.

Clarify release for finite lookups, observations, transactions, streams, and children separately.
Distinguish planned release from interruption and define whether release is public status or only
inspection/issue evidence.

Evidence: REQUIRED_TESTS.md:26; contracts/SEMANTICS.md:413-447.

## D. Transaction actions and semantics

### O-026 — Run from one materialized input

Status: Required.

A transaction run materializes complete commit P at admission, derives exact attempt identity, and
passes immutable input to commit. Commit cannot reread actor memory or mutable resource projection.

Use cases: submit uses the fresh quote and draft that passed admission; URL replacement receives
the query built for that event; later edits cannot alter an admitted write.

Clarify whether O.name.run(P), O.name.run(selector), or activity-only is canonical, and when
validation, preview, invalidation, key/lane calculation, and concurrency admission happen.

Evidence: OPERATIONS_SPEC.md:165-206; new-intent.machine.ts:269-331;
contracts/PUBLIC_API.md:355-416.

### O-027 — Make transaction runs edge-triggered

Status: Required.

A finite run is admitted only from an explicit event, timer, or activation edge. Store fanout,
passive reads, operation completion, and rerenders must not rerun it.

Use cases: SubmitRequested starts one submission; relevant draft changes can trigger a cancelled
URL write but cache fanout cannot; a poll can refresh but not submit.

Clarify whether fresh activation counts as an edge, whether same-state reentry creates one, and
how a null selector affects admission.

Evidence: contracts/SEMANTICS.md:378-402; OPERATIONS_SPEC.md:175-188.

### O-028 — Define transaction attempt identity

Status: Required, naming open.

Every attempt needs exact identity distinguishing actor, descriptor, lane or key, and generation.
It appears in status, cleanup, overlays, pending outcomes, persistence normalization, and inspection.

Use cases: wallet-dialog attempts on different networks can be coordinated; duplicate submit
attempts are rejected; historical attempts remain inspectable after current projection moves on.

Clarify whether lane replaces descriptor key, whether lane identity is optional, and whether the
public ref is byLane(L), ref(K), or an actor-bound attempt handle.

Evidence: OPERATIONS_SPEC.md:165-206,281-291; contracts/SEMANTICS.md:315-323.

### O-029 — Support reject, cancel, allow, and serialize

Status: Required if current policies remain.

The API must define each policy at admission, execution, completion, state exit, and disposal:
reject declines a second active attempt; cancel replaces the prior attempt according to safe
cancellation; allow runs independent generations while suppressing stale actor routes; serialize
queues distinct attempts FIFO for one actor and exact ref.

Use cases: duplicate create clicks are rejected; URL writes cancel old writes; independent work
runs concurrently; future saves serialize without deduplicating.

Clarify public status for rejected, cancelled, queued, running, succeeded, failed, defected,
interrupted, and superseded attempts. Define queued-work disposal and interrupt routing.

Evidence: primitives.ts:127-185; contracts/PUBLIC_API.md:408-416;
contracts/SEMANTICS.md:362-376.

### O-030 — Read transaction status without starting work

Status: Required.

A guard or view can inspect the current attempt for an exact actor/ref or lane, including idle,
queued, running, terminal, or absent, without admitting a new attempt.

Use cases: wallet view shows one status per network; submit knows a submission is active; a view
distinguishes rejected click from running work without copying operation state to memory.

Clarify whether this is byLane(L).status(), a ref read, or a snapshot accessor, and whether
history after configuration exit belongs only to inspection.

Evidence: OPERATIONS_SPEC.md:190-206; views.ts:33-52,104-160.

### O-031 — Preserve typed failure, defect, and interruption lanes

Status: Required.

Completion distinguishes typed domain failure, defect, and interruption. Mappers receive only
their declared payload and deliver a durable mailbox event, never an inline transition.

Use cases: wallet rejection is retryable typed failure; adapter defect is different and
non-retryable; external interruption maps to the documented workflow result; success moves the
parent to submitted.

Clarify cancellation, planned release, runtime disposal, and point-of-no-return mapping. Decide
which facts are operation status versus routed domain events.

Evidence: submission.machine.ts:34-89; contracts/PUBLIC_API.md:513-519;
contracts/SEMANTICS.md:111-145.

### O-032 — Make cancellation point-of-no-return explicit

Status: Required for external side effects.

A transaction must state when cancellation is safe, conditional, or impossible. Runtime must not
claim a broadcast, wallet signing, or non-idempotent effect was undone when it was only interrupted.

Use cases: URL writes cancel before browser commit; wallet confirmation interrupts before signing;
a broadcast is reconciled after its non-idempotent point instead of blindly retried.

Clarify whether point-of-no-return is descriptor policy, application transaction state, or external
service responsibility, and define the status/issue after the point.

Evidence: primitives.ts:187-188; SOURCE_AUDIT.md submission section.

### O-033 — Support explicit retry as a new attempt

Status: Required behavior, API open.

A retry is a new domain command and generation with newly materialized input. It does not replay a
captured Effect, reuse a consumed outcome, or silently retry during hydration.

Use cases: failed submit retries after its error; failed list refresh retries; a user retries a
quote without using an old closure.

Clarify whether retry is an O method, an ordinary event that calls run, or only state reentry.
Define which prior overlays, statuses, and receipts survive.

Evidence: OPERATIONS_SPEC.md:270-279; contracts/PERSISTENCE_AND_ARTIFACTS.md:242-247.

### O-034 — Define optimistic preview and invalidation ordering

Status: Required if previews remain.

A transaction materializes preview replacements and invalidation targets before commit, applies
previews atomically at admission, removes only its own overlays on every terminal lane, and
invalidates authoritative targets on success.

Use cases: successful submit invalidates list and signer balance; failed submit removes only its
preview; targets are not recomputed after input changes.

Clarify whether authoritative-result mapping is excluded. If excluded, define the application
pattern for server-returned canonical values. Define preview reads, hydration, queued serialization,
and target deduplication.

Evidence: primitives.ts:138-148; contracts/PUBLIC_API.md:367-416;
contracts/SEMANTICS.md:325-339.

### O-035 — Normalize pending transactions during hydration

Status: Required.

A pending or queued transaction never resumes serialized execution. Hydration restores truthful
terminal interruption or equivalent normalization, removes its overlay, preserves evidence, and
waits for a new explicit command.

Use cases: reload during wallet submission cannot duplicate a non-idempotent request; a restored
button shows interrupted and lets the user choose retry.

Clarify the normalized public status, receipt/issue shape, and whether the machine sees an outcome
event or only a restored terminal projection.

Evidence: OPERATIONS_SPEC.md:270-279; contracts/PERSISTENCE_AND_ARTIFACTS.md:242-247.

## E. Streams and managed operation workflows

### O-036 — Support a continuing keyed stream

Status: Required.

A machine can own a stream subscription with P and K, receive values, observe normal completion,
typed failure, defect, and interruption, and release the subscription exactly once.

Use cases: wallet changes invalidate accounts; submission progress emits steps; a future remote
operational lease remains active while its state owns it.

Clarify whether lifecycle is readable through a key-only operation, whether streams deduplicate
across actors, and whether a stream may write a resource only through an explicit bridge.

Evidence: primitives.ts:116-125,150-159; contracts/PUBLIC_API.md:418-442.

### O-037 — Replace stream generations by key

Status: Required.

Equal stream keys retain the existing generation and materialized input. A changed key releases
the old subscription and starts a new one; an old value cannot enter the current machine.

Use cases: progress stays attached to one submission ID; a route subscription moves to a new
source; selector reruns do not restart equal work.

Clarify whether equal keys deduplicate across actor slots and what happens when two bindings in one
machine resolve to the same identity.

Evidence: OPERATIONS_SPEC.md:208-233; contracts/PUBLIC_API.md:504-511.

### O-038 — Pair transaction and progress without losing either lane

Status: Required for the demonstrated submission workflow.

A submission workflow starts a transaction and progress stream for one immutable input, preserves
progress steps by identity and order, and settles only when the transaction is terminal.

Use cases: the UI sees wallet confirmation before submit returns; progress remains after the child
releases bindings; stream completion cannot hide a running transaction; failure preserves prior
steps.

Clarify whether this pairing remains application-owned or becomes a composite operation. If it
remains application-owned, define the minimum child/stream boundary the operation contract promises.

Evidence: submission.machine.ts:34-98; BEHAVIOR_PARITY.md:17-20; OPERATIONS_SPEC.md:208-233.

### O-039 — Define the child boundary

Status: Open.

The older example uses activity.child to own Submission, while the current O proposal lists
resources, transactions, and streams only. If children are exposed through O, they need explicit
input, key, read, outcome, and release semantics; if not, the contract must state their boundary.

Use cases: a parent starts one keyed child, rejects a second while submitting, receives a final
child snapshot, and retains terminal output after child release.

Clarify whether child completion is an operation outcome, whether child snapshots are read through
an explicit boundary, and how child defect/interruption differs from transaction failure/interruption.

Evidence: new-intent.machine.ts:382-456; contracts/PUBLIC_API.md:418-519.

## F. Multiple keys, dependencies, and actors

### O-040 — Reconcile dependent resources from one actor snapshot

Status: Required.

A selector reads published prerequisites, returns null until usable, and derives a new exact
identity in a later store revision without copying prerequisite status into machine memory.

Use cases: quote waits for route, wallet, and optional order; balance derives signer from wallet
and route; submit reads the quote matching the current draft.

Clarify whether O reads are bound to one candidate snapshot, which descriptors are admitted, and
how fanout wakes a selector without an extra lookup or duplicate generation.

Evidence: new-intent.machine.ts:87-98,231-277; OPERATIONS_SPEC.md:42-71.

### O-041 — Share one canonical resource across sibling actors

Status: Required.

Multiple actors observe one exact resource ref. One canonical value revision fans out to each
projection, while each binding retains its own outcomes, lease, and release lifecycle.

Use cases: Wallet owns provider changes and account invalidation; New Intent observes the canonical
account resource without reading Wallet memory.

Clarify same-ref bindings in one actor, same-ref bindings across actors, and how a behind actor
projects a newer store revision.

Evidence: wallet.machine.ts:42-44; OPERATIONS_SPEC.md:16-28;
contracts/SEMANTICS.md:163-190.

### O-042 — Fan out invalidation without cross-actor commands

Status: Required.

A resource invalidation or canonical revision reaches projections through the runtime store, not
by sending one actor's event directly to another actor.

Use cases: ProviderChanged invalidates accounts and New Intent recomputes signer/balance;
successful submit invalidates list and balance; no sibling handle is needed.

Clarify whether invalidation is visible as metadata, a value outcome, or both, and how an actor
decides to re-read or rebind.

Evidence: contracts/ARCHITECTURE.md:165-189; contracts/SEMANTICS.md:171-216.

### O-043 — Make route and state lifetime authoritative

Status: Required.

An operation binding is acquired and released with its owning machine configuration. Route
deactivation stops timers, lookups, polling, URL writes, streams, children, and queued attempts
according to operation-specific cleanup.

Use cases: RouteLeft during debounce, quote, or submission makes the root inactive and blocks late
results; leaving Intents stops polling and refresh.

Clarify whether runtime-global lookup may finish warm after actor release and the exact cancellation
point for transactions and streams.

Evidence: REQUIRED_TESTS.md:26; BEHAVIOR_PARITY.md:9-10;
contracts/SEMANTICS.md:420-439.

### O-044 — Preserve explicit child and cross-machine read boundaries

Status: Required boundary, syntax open.

A parent or view cannot silently read another machine's private operation projections. Cross-machine
reads use a declared resource, stream, or explicit child snapshot boundary with its own identity
and lifetime meaning.

Use cases: parent reads completed Submission output; New Intent reads canonical wallet accounts
instead of Wallet memory; a screen cannot discover a foreign transaction in a global registry.

Clarify whether child.snapshot.read(ref) is the final shape, when cross-machine resource reads
are allowed, and how dependency cycles are rejected.

Evidence: OPERATIONS_SPEC.md:235-268; DESIGN_REVISIONS.md:350-354.

## G. Persistence, inspection, and testing

### O-045 — Hydrate readable resource data without serializing P

Status: Required if P/K separation is accepted.

Boot persists resource identity, canonical bases, revisions, freshness, overlays, and projections
without arbitrary executable P. A hydrated key-only entry is readable; lookup waits for a live
binding that supplies P.

Use cases: server-rendered route data is readable immediately; a browser renders a hydrated order
while waiting for a selector to reconstruct input; missing P creates an issue rather than an
invalid serialized input.

Clarify the durable carrier, domain decoder boundary, and normalization of generations and
in-flight work.

Evidence: OPERATIONS_SPEC.md:270-279; DESIGN_REVISIONS.md:201-206;
contracts/PERSISTENCE_AND_ARTIFACTS.md:33-72.

### O-046 — Restore streams as fresh subscriptions

Status: Required if streams are durable desired ownership.

Hydration does not serialize a stream fiber, scope, cursor, transport session, or buffered value.
It restores desired identity and params, normalizes captured execution, and starts one fresh
subscription after readiness without replaying a synthetic domain interruption.

Use cases: wallet listeners reattach after reload; progress is not pretended to resume from an old
transport cursor; terminal streams do not restart merely because they hydrated.

Clarify whether the operations API promises this or leaves stream hydration to application code.

Evidence: contracts/PERSISTENCE_AND_ARTIFACTS.md:221-240; OPERATIONS_SPEC.md:270-279.

### O-047 — Inspect history without changing current truth

Status: Required.

Inspection can show resource generations, transaction attempts, stream lifecycles, invalidations,
outcomes, releases, and cleanup issues after current projections move on. Inspection does not
retain ownership, refetch, or mutate operation state.

Use cases: an ignored quote completion is provable; a rejected duplicate submit is counted; a
successful invalidation is visible after the parent moved to SUBMITTED.

Clarify which facts belong in snapshots versus TurnRecords/receipts and retention/redaction for
opaque P, A, and E.

Evidence: stories.ts:120-224; contracts/SEMANTICS.md:315-323;
contracts/PERSISTENCE_AND_ARTIFACTS.md:304-419.

### O-048 — Control operations through real story boundaries

Status: Required for proof.

Stories and fixtures can seed exact refs, control lookup/commit/stream outcomes, advance TestClock,
inspect exact service arguments and ordinals, and assert closed checkpoints without assigning fake
operation snapshots.

Use cases: the quote story proves 299 ms versus 300 ms, resolves old work after new work, emits
progress, fails a wallet commit, and checks the parent. The list story proves page identity,
previous rows, refresh, and filter reset.

Clarify which controls are public testing API, how controls map to descriptor/params, and whether
app-wide multi-actor checkpoints are required.

Evidence: stories.ts:39-224; REQUIRED_TESTS.md:29-30; contracts/TESTING.md:82-239.

## End-to-end use cases

### UC-1 — Read a fresh singleton resource

The machine owns routeConfig. O.routeConfig resolves zero-argument identity without work during
definition or view construction, projects a fresh seeded base, and creates no duplicate outcome or
passive lease.

Requirements: O-001, O-003, O-006, O-008, O-009, O-012, O-015.

### UC-2 — Wait for prerequisites, then fetch one quote

New Intent reenters debounce after a draft edit. The timer settles once, the selector reads current
route/wallet/order projections, derives one P and K, starts or joins one lookup, and projects
loading. A late completion for the old draft cannot authorize the new draft.

Requirements: O-004, O-007, O-010, O-017, O-020, O-021, O-022, O-040.

Evidence: new-intent.machine.ts:229-380; stories.ts:145-171.

### UC-3 — Provider change invalidates shared wallet data

Wallet's stream emits provider change, maps it to a typed event, invalidates wallet accounts,
and causes one replacement lookup. New Intent derives signer and balance from the replacement
canonical value without reading Wallet memory or receiving a sibling command.

Requirements: O-017, O-019, O-020, O-025, O-041, O-042.

Evidence: wallet.machine.ts:18-44; REQUIRED_TESTS.md:16.

### UC-4 — Paginate while retaining prior rows

The current filter/cursor owns K1. A page or filter event changes memory and identity to K2 in one
revision. The view may render explicitly retained K1 while K2 loads; refresh targets K2 and does
not duplicate its generation; cursor history restores prior keys.

Requirements: O-007, O-010, O-016, O-018, O-020, O-024, O-022, O-043.

Evidence: intents.machine.ts:26-125; REQUIRED_TESTS.md:27-28.

### UC-5 — Submit exactly one immutable intent

Submit reads a fresh quote and prerequisites from one snapshot, materializes one immutable input,
and admits one transaction/child workflow. A second click is rejected. Progress is preserved;
success publishes the receipt and invalidates list/balance targets; typed failure, defect, or
interruption produces the matching workflow result.

Requirements: O-007, O-008, O-014, O-026, O-027, O-029, O-031, O-034, O-038, O-039.

Evidence: new-intent.machine.ts:279-456; primitives.ts:138-148.

### UC-6 — Cancel superseded URL writes

A draft change materializes one URL query. A later relevant change admits a replacement under
cancel. The old write cannot win after the new query, and route entry does not write an echo before
decoded input is installed.

Requirements: O-026, O-027, O-028, O-029, O-032, O-043.

Evidence: primitives.ts:161-185; REQUIRED_TESTS.md:6-8.

### UC-7 — Leave a route during active work

RouteLeft makes the machine inactive, releases owned resources, timers, streams, child workflows,
URL work, and queued attempts, and prevents late results from changing the inactive binding.
Cleanup defects remain observable without synthesizing a domain failure.

Requirements: O-017, O-018, O-025, O-027, O-029, O-036, O-039, O-043.

Evidence: REQUIRED_TESTS.md:26; contracts/SEMANTICS.md:435-447.

### UC-8 — Hydrate readable data and reconstruct executable work

Boot installs canonical resource bases without running lookup code. Key-only hydrated data is
readable. A later live selector supplies P and starts ordinary policy if data is missing or stale.
In-flight lookup and transaction execution are not resumed; restored streams resubscribe fresh.

Requirements: O-004, O-005, O-022, O-035, O-045, O-046.

Evidence: OPERATIONS_SPEC.md:270-279; contracts/PERSISTENCE_AND_ARTIFACTS.md:197-247.

### UC-9 — Two actors share one resource key

Two bindings produce the same K, join one lookup, receive one canonical value revision through
separate projections/outcomes, and release independently. The remaining owner keeps the lookup
policy alive when the first owner leaves.

Requirements: O-006, O-020, O-023, O-025, O-041, O-042.

Evidence: OPERATIONS_SPEC.md:16-28; contracts/SEMANTICS.md:420-425.

### UC-10 — Prove ignored work and cleanup

A story controls two quote calls or transaction generations, resolves the older one after the
newer one, proves the current snapshot remains governed by the newer identity, and then leaves
the route with no owned pending work.

Requirements: O-021, O-025, O-047, O-048.

Evidence: stories.ts:145-188; REQUIRED_TESTS.md:1-30.

## Current OPERATIONS_SPEC.md issues to resolve

### SPEC-001 — Binding syntax is internally inconsistent

The proposal uses O.name(P).fetch, O.name.subscribe(selector), O.name.byKey(K).read, and
descriptor.ref(K) without defining which object owns each method. It is impossible to know whether
a call declares an activity, reads synchronously, or executes immediately.

Proposed improvement: define descriptor, inert bound operation, key-only ref/accessor, and
machine-owned binding as four layers, then give each layer a method table.

### SPEC-002 — fetch and existing ensure semantics are unresolved

The proposal defines fetch as finite fresh-or-lookup behavior, while the current contract calls that
ensure and reserves refresh for forced replacement. The difference affects outcomes, consumption,
stale data, and migration proofs.

Proposed improvement: choose one finite-read verb, define hit/miss/stale outcomes, then map or
retire activity.ensure explicitly.

### SPEC-003 — P/K separation conflicts with current wire and resource contracts

The proposal persists K and never P, while the current contract uses the canonical lookup tuple as
both identity and rerun input. This is a cross-contract migration, not a local wrapper change.

Proposed improvement: revise refs, store identity, hydration, tags, placeholders, fixtures, and
proof rows together before treating K examples as normative.

### SPEC-004 — Same-key executable-input selection is undefined

The proposal recommends first-live-owner selection without defining handoff, lookup replacement,
or behavior when equal keys carry different P. Results could depend on activation order.

Proposed improvement: define deterministic first-owner/handoff semantics with tests, or reject
equal K values whose P values are not proven equivalent.

### SPEC-005 — Invalidation is under-specified

The proposal says invalidation marks stale and does not execute, but leaves removal, authoritative
writes, tag fanout, missing refs, and active subscribe versus finite-read behavior open.

Proposed improvement: specify invalidate, remove/evict, seed, and authoritative write separately,
including which callers are allowed to invoke each.

### SPEC-006 — Cache reads lack a status surface

The proposal shows read() without defining missing/loading/stale/value/error, retained values,
overlays, or child projection reads.

Proposed improvement: define a read result table before finalizing method names, including fields
that are canonical, projected, generation-specific, and inspection-only.

### SPEC-007 — Resource ownership and store scope need one boundary statement

Runtime-global is explained informally, but lookup fibers, leases, freshness, GC, fanout, and
actor release versus in-flight completion are not assigned clearly.

Proposed improvement: state the per-runtime ownership model and release/GC/generation races beside
the resource API.

### SPEC-008 — Selector rules are incomplete across operation kinds

The proposal restricts event for continuing resources and streams but does not fully specify
transaction, invalidation, refresh, or child selectors, or whether O reads bind to one snapshot.

Proposed improvement: make a selector table with inputs and allowed side effects per operation kind,
including hydration reconstruction and stale-closure protection.

### SPEC-009 — Multiple keys are described but collection ownership is deferred

Static repeated bindings are clear; subscribeMany is open with no membership, ordering,
per-key-outcome, bound, or persistence semantics.

Proposed improvement: keep static repetition first and defer runtime-sized collections until one
complete collection contract exists.

### SPEC-010 — Transaction lanes replace keys without status compatibility

The proposal rejects transaction key in favor of lane without defining ref construction, status
reads, history, cross-actor scope, or migration from the older key/ref API.

Proposed improvement: specify attempt identity, lane equality, status projection, concurrency, and
inspection before choosing byLane names.

### SPEC-011 — Cancellation and retry are missing from the action list

The proposal mentions concurrency but not explicit retry, cancellation point-of-no-return, planned
release, queued work, or terminal interruption. The older example explicitly calls out signing and
broadcast boundaries.

Proposed improvement: define cancellation and retry as use cases even if the public API remains a
machine event plus run.

### SPEC-012 — Stream lifecycle and transaction-progress pairing are incomplete

Keyed replacement is described, but cross-actor deduplication, lifecycle reads, hydration restart,
and transaction/stream ordering remain open. The older workflow depends on progress not missing its
first visible step.

Proposed improvement: keep pairing application-owned for now but document the minimum stream
ordering and child boundary it needs.

### SPEC-013 — Child operations are outside the proposed O catalogue

The older implementation uses a keyed child workflow, while the proposal names only resources,
transactions, and streams. Parent completion, child snapshot reads, defect, interruption, and
release cannot be audited until the boundary is explicit.

Proposed improvement: add child as a fourth operation kind with a full method/outcome table, or
state that child remains a separate composition primitive.

### SPEC-014 — Cache writes are rejected without a replacement path

Rejecting set/update avoids authority and overlay problems, but stream-fed data and mutation
responses still need an intentional path.

Proposed improvement: decide whether canonical data enters only through lookup, boot, and fixture,
or define an authoritative-write operation with ordering and validation.

### SPEC-015 — Hydration lacks restoration ordering

The proposal says selectors reconstruct P, streams restart, and transactions do not retry, but it
does not specify pending-outcome ordering, first hydrated publication, or how actors see the store
before ownership reconciliation.

Proposed improvement: specify install store, publish actor projection, restore pending outcomes,
reconcile desired bindings, then admit new host work.

### SPEC-016 — Proof obligations are too broad to guide clarification

The proposal ends with prove selectors, dedupe, release, and hydration but does not map each proof
to one action or hostile race.

Proposed improvement: turn each requirement and use case above into a focused semantic test row,
then defer contract edits until API and semantics are settled.

### SPEC-017 — The proposed O catalogue is absent from the current normative grammar

The proposal and revision ledger introduce definition operations and an O callback, but the active
public API still defines machine callbacks around S, E, and activity and derives reachability from
activity bindings and graph seeds.

Proposed improvement: decide whether operations are static admission metadata on the definition or
machine, then revise callback types, view types, AppPlan reachability, hidden requirements, and
declaration proofs as one change.

### SPEC-018 — Resource input shape is contradictory

The current contract uses exact variadic parameter tuples and tuple selectors, while the proposal
uses one named object P and calls O.name({ ... }). Both can be made type-safe, but a mixed form
cannot define ref construction, key callbacks, tags, placeholders, fixtures, or hydration.

Proposed improvement: choose one-argument named inputs for the revised API or preserve variadic
tuples everywhere; do not let the implementation infer the distinction from runtime arity.

### SPEC-019 — byKey reads have no actor/store visibility law

The proposal implies that any warm or hydrated key can be read, while existing snapshot rules make
a read of an unmaterialized ref idle even if another actor owns it. This changes whether O reads
are actor projections or runtime cache queries.

Proposed improvement: state whether key-only reads are StoreState reads, current-actor projection
reads, or two explicitly named capabilities. Both choices can be valid, but they have different
view determinism and cross-actor semantics.

### SPEC-020 — Selector overloads are unsafe for arbitrary P

The proposal uses null to decline a selector and also permits arbitrary P, including callable or
nullable values. A runtime cannot reliably distinguish O.name(functionInput) from O.name(selector),
and null is not a universally safe sentinel.

Proposed improvement: use an explicit bind/skip result or an options object with a params field,
and make concrete-input and selector forms structurally distinct.

### SPEC-021 — Key evaluation and callback failure boundaries are missing

The proposal says key(P) runs once but does not say whether that is during pure planning, activation,
store materialization, or lookup start. It also does not classify throws from key, lane, selector,
tag, placeholder, or metadata callbacks.

Proposed improvement: specify one timeline from pure selection through canonical validation and
store commit, and reuse one callback-failure matrix: planning callback failure retains the prior
published state, while an already-admitted lookup/commit/subscribe throw defects that generation.

### SPEC-022 — Duplicate same-key bindings and metadata authority are unresolved

Several actors should be able to join one resource generation, but duplicate same-key slots in one
actor could create duplicate value outcomes or conflicting target vectors. Equal K values also make
P-derived tags and placeholders ambiguous.

Proposed improvement: reject duplicate same-key slots during planning or give every slot an explicit
cursor/outcome identity while StoreState deduplicates execution. Make metadata derive from K or
declare first-input ownership for the exact-ref lifetime.

## Clarification order

Resolve the seam in this order:

1. Object layers and identity: O-001 through O-006, including P/K migration.
2. Read result and cache actions: O-007 through O-015, especially invalidate versus remove versus
   write.
3. Resource binding: O-016 through O-025, including same-key input selection and multiple keys.
4. Transaction attempts: O-026 through O-035, including lane identity, concurrency, cancellation,
   retry, overlays, and hydration.
5. Streams and children: O-036 through O-039, including whether children are in O.
6. Coordination and proof: O-040 through O-048, then end-to-end workflows and hostile races.

The first discussion should be O-001 through O-005. Until those layers are settled, names such as
subscribe, fetch, refresh, read, byKey, set, and run cannot be judged independently because each
changes ownership or identity as well as syntax.
