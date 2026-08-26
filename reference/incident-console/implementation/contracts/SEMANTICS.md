# vNext runtime semantics

Status: normative vNext contract

These rules define observable behavior. Ownership is assigned in `ARCHITECTURE.md`; public read
shapes are fixed in `SNAPSHOTS.md`; React, SSR, persistence-host, and host-write boundaries are
fixed in `REACT_AND_HOSTS.md`.

## Actor turns and publication

### SEM-001 — One mailbox orders every actor fact

- Surface: active actor mailbox/consumer and prepared React command mailbox.
- Rule: Every accepted event, async completion, store revision, timer, stream emission, context wave, hydration fact, and lifecycle control fact enters the actor mailbox. Lifecycle control is one serialized lane ordered with it, never a second queue. Recursive substates share the actor mailbox, memory, context, operations, and lifetime.
- Accepts: FIFO reentrant sends; finite prepared buffering supporting at least 64 commands.
- Rejects: Overflow beyond the documented implementation bound, abandoned handles, suspended/disposed commands, child facts, and any bypass of the publication barrier.
- Observable guarantee: Accepted facts are processed in mailbox order; abandonment closes the prepared mailbox once, drops buffered commands, and rejects later commands without side effects.
- Proof: `HOST-P02`, `SEM-007`, `HOST-004`.
- Trace: `ARCH-009`, `ARCH-012`, `SEM-024`.

An active actor owns one FIFO mailbox and one logical consumer. The concrete Effect primitive and
internal capacity are implementation details. The prepared React mailbox is the real command-buffering
mailbox required by `REV-HOST-002`; overflow beyond its documented implementation bound rejects
synchronously without mutation. Abandonment closes it at one internal linearization point, never delivers buffered
commands, and leaves the handle inert. Recursive substates share the actor mailbox under
`REV-MACH-001` and `DEL-002`; lifecycle control is one serialized lane, never a second queue.

### SEM-001A — Fresh initialization precedes actor activation

- Surface: fresh/restored actor construction and active leaf selection.
- Rule: A fresh actor invokes its pure memory factory exactly once with supplied input, or materializes canonical empty readonly memory. Root and entered compound defaults resolve to one exact leaf; redirects stabilize outermost-to-innermost without intermediate publication/work. Restoration installs materialized state/memory without factory/input replay.
- Accepts: Pure initial snapshot for a prepared React actor and a passive provisional context cut; machine behavior over state, memory, context, and events after initialization.
- Rejects: Partial active publication/work after an initial defect, rerun input/initializer on restore/resume, or original input in machine behavior.
- Observable guarantee: Fresh construction is deterministic; selector/redirect/initializer defects abort admission without partial actor escape.
- Proof: `HOST-P01`, `HOST-P02`, `HOST-P04`.
- Trace: `ARCH-006`, `SEM-002`, `HOST-008`.

The prepared initial snapshot is the one required by `REV-HOST-002` and may carry only a passive
provisional context cut. Attachment rechecks provider identity and publication revisions, installs
current provider-derived context before activation, and never persists or emits the provisional cut;
selector defects during attachment or hydration abort admission without a partial actor.

### SEM-002 — Event macrosteps plan before commit

- Surface: one accepted event/timer macrostep.
- Rule: Plan in this order: select transition; evaluate guard; evaluate `updateMemory`, then `actions`; apply target/memory; stabilize redirects; materialize/validate all finite actions; stage actor/store changes; commit/publish; then start/join async work. If no transition wins, the event is a no-op with no issue or transition. `updateMemory` is a one-time shallow merge against the pre-turn memory; it does not rerun during redirects. Redirects evaluate against the updated candidate snapshot and read only `{ state, memory, snapshot }`; they never receive the original event, preserve authored transition order, and only re-enter through the declared boundary. A redirect authored on a compound state remains applicable while any descendant is active, including after descendant transitions and memory updates. When several redirects apply on one active path, Flow evaluates the active compound redirects outermost-to-leaf, preserving authored order within each node. `can(event)` performs the same pure guard/transition eligibility query without mutation, issue publication, redirect, action materialization, or operation admission.

| Stage | Reads | May publish/acquire |
| --- | --- | --- |
| plan | one frozen pre-turn snapshot + causal event | nothing |
| candidate | target, updated memory, redirects | nothing until valid |
| validate | complete finite-action batch | nothing on failure |
| commit | staged actor/store facts | one atomic publication |
| reconcile | committed plan | async work after publication |

- Accepts: First authored transition with absent/truthy guard; shorthand one-transition handlers; empty/omitted/null actions as no finite work; redirects that leave the initial target; no-winner events as no-ops.
- Rejects: Later callbacks after a declined guard; candidate reads from `actions`; partial valid prefixes; microstep 101; ancestor/descendant duplicate handlers; timer-inferred finite actions.
- Observable guarantee: Any planning defect discards the whole candidate with no state/memory/activity/occurrence/store/external-work residue; contained defects use `SEM-024A`.
- Proof: State/redirect/action and no-partial-mutation proofs in `SNAP-P01`, `HOST-P03`.
- Trace: `SEM-003`, `SEM-004`, `SEM-019`, `SEM-024A`.

The state declaration is recursive and exact: a leaf is a string; a compound is a single-key
object containing an ordered state list. Root and compound configuration requires `default` and exact
nested `states`. The active public `state` is one definition-derived leaf token; `matches` accepts
that leaf or an active ancestor. Depth is at most ten. `reenter` names an exact active boundary,
releases that boundary's active path, and re-enters the target inside it; inactive/foreign/non-containing
boundaries are rejected. A terminal-looking leaf is ordinary: no final kind, parent completion,
final output, auto-disposal, stream completion, or mailbox shutdown.

Timer guards/updates receive `{ state, memory, snapshot, timer: { name, startedAt, dueAt } }`.
Timers target explicit events only; an `after` timer may target an explicit refresh event, never finite
actions directly.

Timer-owned finite `actions` are not inferred: `REV-OPS-006` accepts actions only on event handlers,
and `REV-OPS-015` accepts timer event-targeting with explicit-refresh polling.

### SEM-002A — Context is readonly, bound, and propagated atomically

- Surface: definition context selectors, `contextBindings`, provider revisions, `onContext.select`.
- Rule: Selectors are synchronous/pure and read one atomic provider snapshot. Each declared slot binds to one exact `ActorRef`; bindings are fixed for the consumer lifetime. Bootstrap installs provider baselines after providers and before activation/first observable snapshot. A changed provider starts one bounded dependency-ordered propagation wave; each dirty consumer receives at most one combined context turn from latest provider snapshots.
- Accepts: Complete-value `Object.is` for scalar/non-record values and fixed-key fieldwise `Object.is` for named records; `(current, previous)` mapping to one typed self-event, `false`, or `null` after a selected change.
- Rejects: Missing/foreign/ambiguous/cyclic providers, refs as selected values, consumer rebinding, actor parentage/lifetime ownership, intermediate context combinations, transition/memory/finite-action work caused only by propagation, or retry against the same provider revision.
- Observable guarantee: Provider publication commits even when a selector throws; the consumer retains its last valid context, publishes one issue-only snapshot, emits no context event, and retries only on a newer provider revision. Changed values publish one atomic context revision and reconcile continuing work once.
- Proof: `HOST-P01`, `HOST-P02`, `HOST-P04`, `HOST-P03`.
- Trace: `SEM-026`, `SEM-027A`, `HOST-014`.

Individual disposal MUST be rejected before it begins while any active or suspended consumer remains
bound to the provider ref, and the rejection MUST identify every dependent actor ref and bound context
key. Suspension detaches live subscriptions/work but retains the logical context edge and provider
incarnation; React cleanup cannot remove or rebind it. Resume fails closed for missing, foreign, or
tombstoned providers. Whole-runtime disposal tears down consumers before providers in reverse dependency
order.

### SEM-003 — Reconciliation produces one CommitPlan

- Surface: package-private `TurnPlan`/`CommitPlan`.
- Rule: Translate a valid plan into one immutable CommitPlan containing store changes, desired state-activity ownership, primitive facts, mapped-operation intentions, and issues. User Effects never run during pure planning or before the actor snapshot. Async completions, timers, streams, context, and StoreFanout facts are later mailbox turns.
- Accepts: Projection-only facts that reread authoritative state and publish one complete snapshot without transition evaluation; mapped outcome events as later ordinary turns.
- Rejects: User Effects in planning, hidden transitions from a projection-only fact, or a second mutable plan owner.
- Observable guarantee: Planned work has one commit boundary and one post-publication reconciliation boundary.
- Proof: `SEM-004`, `SEM-005`, `ARCH-012`.
- Trace: `SEM-002`, `SEM-006A`.

### SEM-004 — Store commit precedes one actor publication

- Surface: actor publication, StoreKernel commit, TurnRecord hub, acknowledgment, StoreFanout.
- Rule: A successful turn exposes one atomic committed actor/store cut. No observer sees an initiating store
  revision without its corresponding committed actor snapshot. Accepted evidence corresponds only to the
  committed cut and is globally ordered. Acknowledgement completes after actor/store publication and evidence
  acceptance without waiting for user Effects. StoreFanout preserves causal order with the initiating
  publication. Permit, reservation, queue, gate, and reconciliation choreography is implementation-defined.
- Accepts: Issue-only publication without StoreState mutation; staged work suppressed by disposal after the boundary; autonomous StoreKernel commits without an initiating actor barrier.
- Rejects: Sequence overflow after mutation, inline sinks, acknowledgment after user Effect settlement,
  disposal interrupting a half-published turn, or StoreFanout exposing stale/half-published truth.
- Observable guarantee: Normal machine publication advances actor publication and machine-turn revisions; issue-only publication advances only publication revision. `.send()` never waits for user Effects to start/settle.
- Proof: `SEM-005`, `SEM-006`, `HOST-P05`.
- Trace: `ARCH-022`, `ARCH-013B`, `SEM-028`.

### SEM-005 — Actor snapshots are complete turn boundaries

- Surface: public `ActorSnapshot`, private actor state.
- Rule: A machine-turn snapshot contains exact leaf state, readonly memory, inherited context, resource/transaction/stream projections, timers, issues, lifecycle, publication revision, and observed store revision from one turn. Projection-only/lifecycle/issue-only publications are complete immutable snapshots with their defined revision effects; private machine-turn revision never becomes a second public field.
- Accepts: Public issue summary and passive readers; full TurnRecord/diagnostic facts only through installed inspect sinks.
- Rejects: Receipts, pending outcomes, `handled`, raw Effect Cause, child projections, or independently mutable snapshot/cursor sources.
- Observable guarantee: `getSnapshot()` and snapshot streams expose one immutable value whose fields cannot later change.
- Proof: `SNAP-P01`, `SNAP-001`, `SNAP-010`.
- Trace: `SEM-004`, `SEM-007`, `ARCH-012`.

### SEM-006 — Public send is synchronous; Story acknowledgment is private

- Surface: `actor.send(event): void`; package-private acknowledged dispatch.
- Rule: Public send admits synchronously and returns `void`; it does not await Implementation, a turn, or async work. Internal/Story dispatch creates one private acknowledgement synchronously, then resolves it after actor publication and TurnRecord acceptance but before sink processing or later work. Its concrete Effect primitive is private.
- Accepts: Story `.send` waiting only for that acknowledgement; contained-defect acknowledgment after issue-only publication/TurnRecord.
- Rejects: Promise/Effect/Fiber/snapshot/actor/ack handles from public send, direct transition invocation, unrelated ready-work draining, or acknowledgment of discarded candidate work.
- Observable guarantee: Command admission is synchronous while Story checkpoints can observe the production publication boundary.
- Proof: `HOST-P02`, `HOST-P03`, `HOST-004`.
- Trace: `ARCH-009`, `ARCH-017`, `SEM-004`.

### SEM-006A — Operation outcomes use the production completion path

- Surface: finite resource `lookup`/`refetch`, transaction `commit`, continuing resource/stream `subscribe`.
- Rule: Plans are inert until an accepted machine declaration/action admits them. Finite outcomes are `success(A)`, `failure(E)`, `defect()`, `interrupt()`; continuing outcomes are `value`/emission, `failure(E)`, `defect()`, `interrupt()` through authored mappers. Mappers receive no Exit/Cause/state/lifecycle metadata.

```ts
// Named declaration shape; each descriptor is admitted by the compiled machine plan.
type OperationExamples = {
  orderById: "resource"; // key(P), lookup(P), subscribe(P)
  submitIntent: "transaction"; // key(P), commit(P)
  updates: "stream"; // key(P), subscribe(P)
};
```

- Accepts: Same operation kernels, StoreKernel, occurrence fencing, and completion mapping in live hosts and Stories; omitted mapper means no event for that lane.
- Rejects: Story result injection, bypassing production completion, child outcome surfaces, queued cancellation starting adapters, or late results mutating a later incarnation/store entry.
- Observable guarantee: Each admitted occurrence settles once; late results remain bounded old evidence only.
- Proof: `HOST-P03`, `SNAP-P01`, `SEM-030`.
- Trace: `ARCH-020`, `ARCH-031`, `SEM-016`, `SEM-018`.

### SEM-007 — Snapshot streams replay the current truth

- Surface: `actor.snapshots`, `getSnapshot()`, lifecycle command admission.
- Rule: Snapshot streams emit atomic immutable snapshots, replay the latest value to late subscribers, emit through disposed, then complete. Prepared subscriptions replay prepared and become live on activation; suspended subscriptions replay suspended once and complete; disposed subscriptions replay terminal and complete.
- Accepts: A finite prepared buffer supporting at least 64 commands; active command admission; pure
  `can(event)` independent of command admission.
- Rejects: Commands in suspended/disposed lifecycles, buffering after preparation, or a terminal-looking machine state completing the stream.
- Observable guarantee: `getSnapshot()` is the same latest immutable truth and `snapshot.revision` identifies every distinct publication.
- Proof: `SNAP-001`, `SNAP-010`, `HOST-P02`.
- Trace: `SEM-005`, `SEM-024`.

## Resource-store semantics

### SEM-008 — StoreState is the only canonical resource authority

- Surface: one runtime-scoped canonical StoreState.
- Rule: StoreState owns descriptor IDs, canonical keys, committed bases/metadata, generations, ordered overlays, monotonic revision, and canonical-deduplicated changed refs. Equal descriptor/`K` shares canonical data/generations inside one runtime while actors retain independent bindings, occurrences, projections, previews, and lifetimes.
- Accepts: Same-runtime sharing; isolated browser roots, SSR requests, tests, and runtimes.
- Rejects: Actor-private canonical caches, cross-runtime sharing, or overlays treated as canonical truth.
- Observable guarantee: Releasing one actor cannot change another actor's lifetime or effective overlay.
- Proof: `SNAP-004`, `SNAP-005`, `SNAP-P01`.
- Trace: `ARCH-013`, `SEM-009`, `SEM-016`.

### SEM-009 — Store revisions are monotonic commit identities

- Surface: canonical revision, changed refs, StoreFanout facts.
- Rule: Base/generation/freshness/invalidation/hydration/eviction changes advance canonical revision. Applying/removing/replaying an actor overlay advances only that actor's publication/overlay cursor. StoreFanout delivers canonical facts through actor mailboxes; recipients ignore stale revisions/undeclared refs and reread current state on newer revisions.
- Accepts: Coalescing adjacent projection-only facts to newest revision/union of refs; immediate autonomous freshness/collection fanout.
- Rejects: Historical-value assumptions after revision jumps; coalescing lifecycle, terminal-operation, cancellation, stream-terminal, or mapped-event facts; direct StoreState subscriptions.
- Observable guarantee: Canonical changes reach affected actors after the initiating publication boundary and never expose stale historical payloads as current truth.
- Proof: `HOST-P03`, `SNAP-P01`.
- Trace: `ARCH-013A`, `SEM-026`.

### SEM-010 — Canonical keys identify parameterized operations

- Surface: `key(P): K`, resource/transaction/stream identity.
- Rule: `K` is an ordered readonly tuple; identity is descriptor namespace plus `K`; complete immutable executable `P` stays on each live binding/generation. Equal-key owners do not replace a running generation's pinned `P`; explicit `refetch(P)` creates a replacement generation with its own `P`.
- Accepts: Dense arrays/plain records copied into Flow-owned frozen containers; sorted record keys; `-0` normalized to `0`; bounded JSON-safe canonical values under `PUBLIC_API.md` `API-005` limits.
- Rejects: Hostile reflection/unsupported values, unbranded secret strings, mutation before canonicalization completes, or failures that leave a partial batch.
- Observable guarantee: Key failure names exact tuple/nested-record path; projection/validation/canonicalization finish before ownership/store/external work. Stable runtime acquisition order selects eligible owners; hydration retains it.
- Proof: `SNAP-P01`, `PUBLIC_API.md` `API-005` references.
- Trace: `ARCH-004`, `SNAP-003`, `SEM-011`.

### SEM-011 — Named operation families separate ownership, reads, and policy

- Surface: flat named resource/transaction/stream descriptor record, actor-bound `O`, `onMemory`, `invalidate`, `clear`.
- Rule: Listing descriptors, `O.name.key(P)`, passive `getData(K)`/`getState(K)`, or constructing an unreturned plan is passive. Resource `lookup` is finite; `subscribe` is continuing ownership; `refetch` is forced finite replacement; `setData` is explicit authoritative write; `cancel(K)` is actor-owned finite cancellation; streams are actor-owned continuing operations, not StoreKernel entries. Offline state never blocks explicit lookup, subscribe, or refetch and never cancels in-flight work. Reconnect/focus may refresh only active subscribed entries that are missing or stale and have no in-flight generation.
- Accepts: Exact named families and descriptor-configured freshness/collection; an omitted transaction key projector means `K = []`.
- Rejects: Generic operation registries, implicit acquire/refresh/subscribe/write, stream `cancel(K)`, browser-offline admission gates, or generic paused-resource policy.
- Observable guarantee: Passive reads never create entries/leases/revisions/work; explicit lookup/subscribe/refetch rules remain distinct and application machines may gate their own activities. Offline does not create a paused-resource policy.
- Proof: `SNAP-P01`, `HOST-P03`.
- Trace: `SNAP-002`, `SEM-010`, `SEM-011A`.

### SEM-011A — Finite resource outcomes belong to an admitted occurrence

- Surface: finite `lookup`/`refetch`, explicit `cancel(K)`.
- Rule: Only an accepted event `actions` result admits a finite occurrence. `cancel(K)` is actor-local bulk cancellation of every current finite occurrence owned by that actor matching `K`; it records accepted interruption, suppresses later results, and interrupts shared work only at final owner.
- Accepts: Fresh canonical lookup settlement without adapter work; stale/missing/invalidated lookup under ordinary generation policy; planned cancel/release/supersession as evidence-only cleanup.
- Rejects: Cancellation changing canonical data, cross-actor cancellation, mapper invocation for planned cleanup, or late completion without fences.
- Observable guarantee: Occurrences settle once; canonical data remains unchanged by cancellation.
- Proof: `SEM-016`, `SEM-018`, `SEM-030`.
- Trace: `SEM-006A`, `SEM-011`, `SEM-021`.

### SEM-011B — Continuing subscriptions map canonical changes explicitly

- Surface: resource `subscribe(P)`.
- Rule: A continuing resource uses exactly `value(A)`, `failure(E)`, `defect()`, `interrupt()` mappers. Activation publishes an existing canonical value once; later canonical replacements map through `value`. Declaration identity is compiled slot + operation kind + descriptor + `K`, never plan object or `P` identity.
- Accepts: Equal normalized plan retaining work; changed slot/kind/descriptor/`K` releasing old binding once and admitting new; one shared generation pinning one `P`.
- Rejects: Equal-value/overlay-only `value` emissions, planned-release interruption outcome, caller-managed subscription, or runtime-sized subscribe-many behavior.
- Observable guarantee: Runtime owns continuing subscriptions and their exact declaration lifetimes.
- Proof: `SEM-019`, `SNAP-008`.
- Trace: `SEM-011`, `SEM-011D`, `SEM-020`.

### SEM-011D — Continuing streams retain a latest projection

- Surface: actor-owned stream declaration/projection.
- Rule: Retain status, `hasValue`, latest value when present, emission count, declaration generation, and terminal status. Emissions are projection-only; durable machine state changes only through mapped events or explicit authoritative `setData`.
- Accepts: Default latest-emission pressure policy; hydration from current executable `P` after pending outcomes drain.
- Rejects: Runtime resource deduplication across actors, emission replay, terminal stream restart, or key-to-input inversion.
- Observable guarantee: Missing executable input fails closed; planned release emits no outcome and stores no further value.
- Proof: `SNAP-008`, `SNAP-P01`.
- Trace: `SEM-006A`, `SEM-017`.

### SEM-011C — Invalidation and clearing are scoped actor actions

- Surface: `invalidate(targets)`, `clear(targets)` returned by accepted event actions.
- Rule: Accept only exact `[O.resource, K]`, declared reachable tags, and admitted families. Validate all targets, expand against one pre-mutation index in descriptor/`K` insertion order, first-seen deduplicate, and reject invalid/unauthorized/beyond-256 expansion before allocation or mutation.
- Accepts: Missing exact targets and zero-match tags/families as successful no-ops; nonempty `invalidate` retaining data/overlays while marking stale; nonempty `clear` fencing/removing data/metadata/overlays and interrupting under final-owner policy.
- Rejects: Whole-runtime/wildcard/zero-argument clear, partial mixed batches, lookup start directly from invalidate, or conflicts that observe a partially changed target set.
- Observable guarantee: Each nonempty action publishes one atomic store revision; surviving subscriptions observe `missing` after clear and may reacquire normally.
- Proof: `SEM-018`, `SNAP-P01`.
- Trace: `ARCH-012`, `SEM-009`, `SEM-017`.

### SEM-012 — Placeholder projection remains passive and actor-scoped

- Surface: placeholder metadata, tags, `getData(K)`/updater reads.
- Rule: Placeholder is descriptor-owned projection metadata, never an implicit write/outcome. Unbound reads use committed base; bound actor reads use base plus that actor's ordered preview layers. Updaters read committed base; equal authoritative writes may refresh freshness but only effective-value changes emit value changes.
- Accepts: Tags derived only from canonical `K` and passive missing projections.
- Rejects: Placeholder defaults/status creating a family, another actor's overlay in a read, or implicit canonical writes.
- Observable guarantee: Passive reads never alter ownership, freshness, revision, or external work.
- Proof: `SNAP-002`, `SNAP-004`, `SNAP-P01`.
- Trace: `SEM-016`, `SEM-017`.

### SEM-013 — RcMap leases do not own data

- Surface: RcMap activity lease/idle GC.
- Rule: RcMap owns exact operation-identity leases/timing only. Expiry may evict canonical data only when its lease epoch still owns the exact entry.
- Accepts: Family-specific collection projection from `PUBLIC_API.md` `API-006`.
- Rejects: RcMap implementing Flow invalidation or old scope evicting reacquired data.
- Observable guarantee: Lease lifetime and canonical data lifetime remain distinct.
- Proof: `SEM-008`, `SEM-020`, `SNAP-005`.
- Trace: `ARCH-014`, `SEM-014`.

### SEM-014 — FiberMap replacement still needs Flow generations

- Surface: FiberMap-owned keyed lookup.
- Rule: Every completion compares exact descriptor/`K` and Flow generation immediately before commit. Removal/finalization deletes the in-flight entry only if it still owns that generation.
- Accepts: FiberMap as an ownership primitive under StoreKernel.
- Rejects: Fiber interruption alone as a publication fence or stale fiber deleting a replacement.
- Observable guarantee: Replacement and cancellation cannot publish stale canonical truth.
- Proof: `SEM-010`, `SEM-030`.
- Trace: `ARCH-015`, `ARCH-015A`.

## Transactions and activities

### SEM-015 — Transaction identity uses descriptor and canonical key

- Surface: transaction execution/projection/route/receipt/persistence.
- Rule: Identity is exact transaction descriptor + canonical `K`; attempts are actor-local generations. Completion requires actor ownership, descriptor/`K`, and generation match. Old attempts remain bounded inspection evidence, not an actor-lifetime registry.
- Accepts: Family-specific public transaction union from `PUBLIC_API.md` `API-006`.
- Rejects: Generic transaction registry, cross-actor lane, or descriptor-only identity for keyed transactions.
- Observable guarantee: A stale transaction cannot route or overwrite current projection.
- Proof: `SEM-018`, `SNAP-006`.
- Trace: `SEM-006A`, `SEM-030`.

### SEM-015A — External transaction cancellation is truthful across the irreversible boundary

- Surface: transaction adapter local work, remote boundary, reconciliation.
- Rule: Before dispatch, durably record remote identity/boundary state. Before the irreversible boundary, abort may classify interruption without mapped outcome. After it, stop local observation and fence late publication; expose `unknown` or reconciliation-required truth without claiming rollback. Reconciliation reuses the remote idempotency identity; compensation is a separate explicit operation.
- Accepts: Local preview discard before boundary; explicit reconciliation/compensation operations.
- Rejects: Automatic retry as a new request, implicit outbox/saga/rollback API, or remote-effect reversal claim.
- Observable guarantee: Remote identity remains evidence and the public projection remains honest about uncertainty.
- Proof: `SEM-023`, `SEM-030`, `SNAP-006`.
- Trace: `ARCH-030`, `SEM-016`, `SEM-020`.

### SEM-016 — Optimistic overlays remain shared-store state

- Surface: StoreKernel overlay ledger and actor-effective read.
- Rule: Each optimistic layer carries initiating actor incarnation, transaction occurrence, descriptor, and `K`; only that actor reads it. Success promotes atomically to canonical StoreState then fanouts; failure/defect/pre-boundary interruption removes only that layer and replays remaining layers. Promotion uses base-revision CAS; changed base preserves remote canonical truth and produces initiating conflict issue.
- Accepts: Post-boundary local provisional removal with `unknown`/reconciliation-required projection; non-initiators receiving only canonical facts.
- Rejects: Overlay as shared canonical truth, another actor's preview/rollback facts, or rollback of an irreversible remote effect.
- Observable guarantee: Preview is actor-scoped; canonical promotion/rollback is fenced and atomic.
- Proof: `SNAP-004`, `SNAP-P01`, `SEM-017`.
- Trace: `ARCH-013`, `SEM-004`, `SEM-015A`.

### SEM-017 — Operation output never becomes canonical implicitly

- Surface: lookup success, transaction/stream mapping, `setData(K, value)`.
- Rule: Lookup success installs canonical data. Transaction/stream output is not canonical unless an admitted mapping explicitly performs authoritative `setData`; that write fences/intercepts older lookup generations, clears invalidation/failure metadata, advances revision/generation, publishes once, and leaves continuing subscribers attached. `undefined` updater output declines.
- Accepts: Typed event/memory use of server values; boot/SSR/fixture writes only through package-private HostWriteLease under `HOST-017`.
- Rejects: Arbitrary cache mutation, implicit response mapping, generic writer registry, or ordinary cache-clear escape hatch.
- Observable guarantee: Canonical truth changes only at explicit accepted write/lookup/store boundaries.
- Proof: `SEM-016`, `SNAP-P01`, `HOST-P01`.
- Trace: `SEM-011C`, `HOST-017`.

Authoritative `setData(K, value)` writes use the generation fencing required by `REV-OPS-010` before
mutation/publication. This package-private construction lane remains the only boot/SSR/fixture writer
under `HOST-017`; `REV-HOST-008` does not authorize a generic runtime registry or cache-clear escape
hatch.

### SEM-017A — Child-machine surfaces are removed

- Surface: hierarchy, child actors, child snapshots/lifecycles/completion/persistence/Story/model.
- Rule: Recursive substates share one actor's memory, context, event protocol, mailbox, operations, and lifetime. Independent workflows require explicit AppPlan actors or remain unsupported.
- Accepts: Explicitly owned stable/local actor for an independent workflow.
- Rejects: Child-equivalent internal owners or public child surfaces.
- Observable guarantee: There is one actor publication source per actor and no hidden child lifetime.
- Proof: `HOST-P03`, `SNAP-P01`.
- Trace: `ARCH-023`, `ARCH-027`, `SEM-022`.

Child-machine surfaces remain removed by `REV-MACH-001`, `DEL-002`, and `REV-MIG-006`; no
child-equivalent internal owner may be smuggled back into the contract.

### SEM-018 — Transaction concurrency is actor-local and keyed

- Surface: transaction descriptor/`K` concurrency policy.

| Policy | Admission | Completion authority |
| --- | --- | --- |
| `reject` | decline second active attempt; no occurrence | current attempt |
| `cancel` | cancel prior, then admit replacement | replacement |
| `allow` | admit independent generations | current generation only for projection/route |
| `serialize` | queue exact-key materialized `P` FIFO | dequeued occurrence |

- Rule: Policies are actor-local per exact descriptor/`K`; omitted key projector means `K = []`. Each admitted occurrence settles once. `reject` consumes no ordinal; `cancel` removes prior local preview; `allow` keeps ordered layers; `serialize` applies preview at dequeue. Retry is a new explicit event. Invalidation/clear conflicts use the same pre-mutation target snapshot.
- Accepts: Queued cancellation settling without adapter start; late-result fencing; planned release/disposal without interruption mapper.
- Rejects: Public transaction scope/lane/cross-actor scheduler, automatic retry, partially expanded mixed target changes, or terminal-history registry.
- Observable guarantee: Concurrency never routes a stale generation as current and never starts canceled queued work.
- Proof: `SEM-011A`, `SEM-015`, `SEM-030`, `SNAP-P01`.
- Trace: `ARCH-015`, `SEM-019`, `SEM-020`.

### SEM-019 — Activity identity uses stable declaration slots

- Surface: state `activities`, `onMemory`, `onMemory.select`, `after` timers.
- Rule: Continuing identity is compiled AppPlan slot + operation kind + descriptor + `K`; `P` is retained input. Equal fresh plans retain work; changed identity releases old once and acquires new. Finite resource/transaction work comes only from event `actions`; continuing work comes from state activities or one independent onMemory declaration. Each onMemory entry returns one plan, `false`, or `null` and owns/releases only itself. A timer consumes its due generation once; the next refresh is scheduled only after settlement, and a failure waits one interval with no implicit retry.
- Accepts: `onMemory.select` with shared equality; activation/reentry `(current, previous: undefined)`; later selected changes with immediately preceding value; compound activity parent-to-child start/child-to-parent stop; one-shot timer generations and explicit refresh event polling.
- Rejects: Unsubscribe handles, runtime-sized arrays/subscribeMany/subscribeEach, timer-inferred finite actions, implicit retry, or resetting unchanged compound timers on descendant transitions.
- Observable guarantee: Work follows declaration/state identity, survives unchanged ancestor paths, and resumes with at most one overdue refresh.
- Proof: `SEM-020`, `SNAP-009`, `HOST-P02`.
- Trace: `SEM-011B`, `SEM-011D`, `ARCH-027`.

### SEM-020 — Scope ownership is singular

- Surface: actor activities, StoreKernel lookup, suspension/resume cleanup.
- Rule: Actor activity bindings run under `Effect.scoped`; FiberMap/FiberSet/keyed Queue implement policy; no manual child Scope. Finalizers run once in reverse acquisition order. StoreKernel owns exact-key lookup generations/in-flight leases; actor scopes own registrations/activity leases. Suspension is one serialized lane; resume waits for finalizers before reconciling continuing declarations/due timers.
- Accepts: Queued finite interruption without adapter start; continuing stream close without mapped outcome; absolute timer retention; minimal ignored-interruption fact; `unknown`/reconciliation-required after remote boundary.
- Rejects: Replaying finite work/emissions/input/initialization, claiming irreversible reversal, or resuming after cleanup defect.
- Observable guarantee: Cleanup defects leave actor suspended and block resume until owner/runtime disposal.
- Proof: `HOST-P02`, `HOST-P05`, `SEM-024`.
- Trace: `ARCH-015`, `ARCH-030`, `SEM-021`.

### SEM-021 — Planned release is cleanup, not a routed outcome

- Surface: state exit, planned cancel, release, concurrency supersession.
- Rule: Release activities and publish cleanup facts if needed, but never synthesize a domain outcome or invoke an authored interruption mapper. Cleanup defects become issues/receipts without rolling back published transition.
- Accepts: Production finalizers and evidence-only planned interruption.
- Rejects: Domain-event routing for planned release or rollback of committed state.
- Observable guarantee: Cleanup is distinguishable from an operation outcome.
- Proof: `SEM-020`, `SEM-023`, `HOST-P05`.
- Trace: `SEM-011A`, `SEM-018`, `SEM-024A`.

### SEM-022 — Continuing remote behavior uses accepted actor ownership

- Surface: remote workflow lifetime.
- Rule: Behaviorally significant remote workflows require an explicit AppPlan actor. A purely operational lease may remain a scoped stream activity using `Effect.acquireRelease`; normal completion, interruption, and release failure remain distinct and release exactly once.
- Accepts: Existing actor/stream ownership.
- Rejects: Child actor/activity equivalents or hidden cancellation channels.
- Observable guarantee: Remote workflow phases have a named owner or are unsupported.
- Proof: `HOST-P01`, `SEM-017A`.
- Trace: `ARCH-023`, `ARCH-032`.

## Failure, disposal, and observation

### SEM-023 — Full Cause determines classification and public error truth

- Surface: operation completion, cleanup, public error boundaries.
- Rule: Retain Exit/full Cause through classification; precedence is defect, typed failure, then interruption-only; empty/unclassifiable failure is invariant defect. Only `FlowDisposeError` and `FlowStoryExecutionError` preserve complete `Cause.Cause<unknown>`; snapshots expose neither raw Cause nor failure lifecycle.
- Accepts: Ordered stable Flow diagnostic projections in TurnRecords/artifacts; squashing only at the JS
  throw/rejection boundary. Serialized diagnostics do not mirror Effect Cause tree shape, traversal order,
  or fiber ordinals.
- Rejects: `Effect.result` as complete truth, `Cause.squash` internally, or raw Cause in actor types.
- Observable guarantee: Failure class and cleanup truth remain recoverable at the declared boundaries.
- Proof: `HOST-015`, `HOST-P05`, `SNAP-006`.
- Trace: `ARCH-026`, `SEM-024A`, `SEM-024B`.

### SEM-024 — Owner-lease disposal and the production actor lifecycle

- Surface: owner lease `{ actor, dispose }`, actor lifecycle.

| From | Allowed transition | Meaning |
| --- | --- | --- |
| `prepared` | `active` | attach/activate same prepared actor |
| `active` | `suspended` | serialized attachment cleanup |
| `suspended` | `active` | resume after cleanup/finalizers |
| any non-disposed | `disposed` | owner/runtime terminal disposal |
| `disposed` | none | terminal |

- Rule: Only the explicit owner lease disposes individually; disposal is async, idempotent, terminal, and closes admission before production cleanup. Runtime disposal subsumes leases and tears down consumers before providers. Stable shared disposal leaves a runtime-incarnation tombstone until runtime disposal. Disposal MUST be rejected before it begins while any active or suspended consumer covered by the context-graph integrity rule remains bound to the actor's ref, and the rejection MUST identify every dependent actor ref and bound context key.
- Accepts: React cleanup as genuine suspension; preserved ref/handle/state/memory/context/operation records/absolute deadlines; fail-closed missing-provider resume; lifecycle snapshots through disposal.
- Rejects: Disposal on actor/ref, dropped-lease disposal, disposal while active/suspended consumers remain bound, implicit rebind/recreate, terminal-looking state completion, or suspended-command buffering.
- Observable guarantee: Escaped handles reject after disposal; tombstoned refs reject `getActor`/`ensureActor` in that runtime; cleanup failure leaves suspended and blocks resume.
- Proof: `HOST-P01`, `HOST-P02`, `HOST-P05`, `SNAP-001`.
- Trace: `ARCH-017`, `ARCH-030`, `HOST-003`, `HOST-016`.

Disposal of a stable shared actor captures the registered, non-disposed persist-enabled stable-actor
set and its transitive stable-provider closure, including suspended persist-enabled actors, while
excluding local, disposed, tombstoned, and non-persist-enabled actors. Opaque providers fail closed as
`NonDurableContextProvider`; stable-ref encoding follows `WIRE-008`.

### SEM-024A — Callback defects retain committed truth

- Surface: user callback defect before/after StoreState commit.
- Rule: Before commit, discard candidate and retain prior state/memory/bindings/store revision; publish one
  issue-only active snapshot with minimal issue summary and private ordered stable diagnostics. It admits no
  occurrence/work/store change and does not retry. An invariant defect closes admission, fails current/buffered
  acknowledgments, finalizes work, and publishes disposed fatal/cleanup truth. After commit, publication uses
  non-failing primitives; abandoning it is invariant failure.
- Accepts: Guard, redirect, timer, memory, binding, key, target, and selector failures before commit under the same prior-truth rule; passive view selector memoization is governed by `SEM-026`.
- Rejects: Partial candidate publication, issue-only retry loops, or claiming a committed StoreState write was rolled back because snapshot publication failed.
- Observable guarantee: A contained defect is visible as one issue-only publication; invariant failure preserves terminal cleanup truth.
- Proof: `SEM-004`, `SEM-005`, `HOST-P05`.
- Trace: `SEM-002`, `SEM-023`, `SEM-024B`.

### SEM-024B — Issue identity has one clearing owner

- Surface: operational issue identity and clearing-owner key.
- Rule: Identity includes source, actor incarnation, exact binding identity when present, generation when present, and issue kind. Clearing owner omits attempt generation but retains actor incarnation/source/binding. Later actor lifetimes cannot clear/inherit/republish older occurrences; later generation success/release by the same owner clears older operational occurrences.
- Accepts: Invariant/cleanup issues surviving disposed snapshot; private stable diagnostics surviving
  operational-summary clearing.
- Rejects: Unrelated success clearing issues, later lifetime clearing old identity, raw Effect Cause in snapshots.
- Observable guarantee: Issue clearing is deterministic and ownership-scoped.
- Proof: `SEM-023`, `SEM-024A`, `SNAP-P01`.
- Trace: `SEM-030`, `SNAP-001`.

### SEM-025 — Views are exact passive actor projections

- Surface: `useView(actor, selector)` and snapshot-bound passive `O`.
- Rule: One exact actor handle supplies one atomic selector context: leaf `state`, immutable `memory`, inherited readonly `context`, lifecycle, issues, bound `can(event)`, and passive `key`/`getData`/`getState` reads. `useActor`/`useActorByRef` are command-only/non-reactive.
- Accepts: Passive exact descriptor/`K` reads; no-operation selected values.
- Rejects: Actor/ref/family/view IDs, actor creation/disposal, operation ownership/cache changes, acquire/refresh/subscribe/commit/write/invalidate/clear, registered views, per-actor React Context, and view-bound `can` APIs.
- Observable guarantee: A selector cannot mutate runtime state or acquire work.
- Proof: `HOST-P03`, `SNAP-P01`.
- Trace: `ARCH-019`, `HOST-011`, `SNAP-002`.

The deleted registered-view, view-ID, module-view, per-actor-React-Context, binding-component, and
view-bound `can` surfaces remain governed by `DEL-001`, `DEL-007`, `DEL-008`, and `RET-005`.

### SEM-026 — Shared selector equality is deterministic and narrow

- Surface: context, `onMemory.select`, `useView`, passive dependency tracking.
- Rule: Synchronous pure selectors use complete-value `Object.is` for scalar/non-record results, fixed-key fieldwise `Object.is` for named plain records, and complete-value equality for arrays. Dependencies from passive `O` reads are replaced after each complete evaluation; a matching actor/canonical publication reruns against one tear-free boundary.
- Accepts: Explicit React-only `useShallow(selector)` for named records using the same fields.
- Rejects: Custom comparators, handlers creating implicit dependencies, ownership/work from selectors, or repeated retry of the same selector error/cut.
- Observable guarantee: Equal values suppress downstream work; selector defects are memoized by exact actor publication + passive-store cut and retry only on later matching publication.
- Proof: `HOST-P02`, `HOST-P03`, `SNAP-P01`.
- Trace: `SEM-002A`, `SEM-025`, `HOST-011`.

Selector exceptions use the revision-scoped memoization and retry rules in `REV-HOST-006`.

### SEM-027 — Runtime readiness remains host state

- Surface: private runtime phase and public `runtime.ready()`.
- Rule: Runtime readiness is `constructed | booting | ready | failed | disposed`, not a user machine state. Booting validates persistence, acquires Implementation, admits initial graph; failed rolls back/closes admission; disposed is terminal. Post-bootstrap admission uses the same transaction law.
- Accepts: Host/React observation of one cached readiness boundary.
- Rejects: Phase union in Runtime, second readiness API, machine loading state standing for runtime acquisition.
- Observable guarantee: Hosts cannot confuse runtime readiness with actor lifecycle `prepared | active | suspended | disposed`.
- Proof: `HOST-P01`, `HOST-006`, `HOST-007`.
- Trace: `ARCH-007A`, `SEM-024`, `HOST-015`.

### SEM-027A — Persistence intent belongs to declarations

- Surface: `actorRef(..., { persist: true })`, resource/transaction/stream declarations, persistence provider.
- Rule: All persistence defaults are `false`. Stable ref `persist: true` opts in the complete snapshot; resource `persist: true` opts in committed canonical entries; transaction/stream `persist: true` opts in only the family projection when its stable owner is also persistable. Provider may narrow by identity-only filtering but never infer durability from reads, active bindings, operation use, or mutable state.
- Accepts: Persistence provider storage/lifecycle and declared stable-provider closure.
- Rejects: Inferred durability, local/disposed/tombstoned actors in capture, or persisted selected context as a second source of truth.
- Observable guarantee: Persistence scope is declaration-owned and opt-in.
- Proof: `HOST-014`, `HOST-P04`.
- Trace: `ARCH-008`, `SEM-002A`, `SEM-024`.

### SEM-028 — Lifecycle evidence is ordered and asynchronously payloaded

- Surface: lifecycle snapshot, `LifecycleRecord`, global sequence/hub/sinks.
- Rule: Lifecycle and machine publications have separate actor ordering fields but one runtime-global sequence. Publish the immutable snapshot and accept its immutable record as one observable cut; release accepted evidence to sinks asynchronously. Record carries snapshot, exact actor/app/plan/incarnation provenance, `from`, `to`, cause, timestamp, publication revision, machine-turn revision, and evidence sequence. Allocation, locking, and release choreography is private.
- Accepts: `actor:start`, `actor:restore`, `actor:suspend`, `actor:resume`, `actor:dispose`; sink-local retained-prefix truncation and sink detachment on failure.
- Rejects: `actor:prepare`, lifecycle as machine turn/TurnRecord, live-state reread as payload, sink overflow blocking/rollback, or synthetic terminal TurnRecord.
- Observable guarantee: Snapshot precedes evidence; runtime disposal drains accepted evidence after terminal lifecycle publication.
- Proof: `HOST-P05`, `SNAP-001`, `HOST-005`.
- Trace: `ARCH-022`, `ARCH-025`, `SEM-004`.

### SEM-029 — Post-bootstrap admission and rollback are linearized

- Surface: `ensureActor`/`createActor` after bootstrap.
- Rule: One transaction validates exact app/plan, machine/ref incarnation, input, bindings, providers, tombstones, duplicate identity, and cycles; installs silent baseline/edges; attaches/activates; exposes lease last. Concurrent ensures for one stable identity join one admission.
- Accepts: One terminal owner authority shared by concurrent ensures.
- Rejects: Partial handle/snapshot/operation generation/StoreState/evidence; registry mutation before validation; fresh incarnation under tombstone.
- Observable guarantee: Failure rolls back staged work, edges, mailbox, registration, and prepared state in reverse order.
- Proof: `HOST-P01`, `HOST-006`.
- Trace: `ARCH-029`, `SEM-024`, `HOST-003`.

### SEM-030 — Occurrence fences include actor incarnation

- Surface: finite occurrence and completion identity.
- Rule: Identity includes actor incarnation, operation kind, descriptor ID, canonical `K`, one-based monotonic non-reused ordinal, and shared store generation/lease epoch where applicable. `reject` consumes no ordinal; `cancel` settles prior and replacement gets new ordinal; `allow`/`serialize` retain separate ordinals; stream emissions create no occurrences.
- Accepts: Bounded cursors on hydration and new stream generation from executable input.
- Rejects: Late facts touching later lifetime/reused ref/collected entry/current mapped event; public occurrence handles; external work replay.
- Observable guarantee: Completion handling publishes only when all applicable fences match.
- Proof: `SNAP-P01`, `HOST-P02`.
- Trace: `ARCH-031`, `SEM-006A`, `SEM-018`.

A continuing stream occurrence identifies its actor-local declaration, while emissions create no
occurrences. Hydration retains bounded cursors and never replays external work; restored streams create
a new generation. This private identity does not add a public occurrence handle, change accepted
operation unions or transaction `unknown` representation, or change Cause wire shape.
