# Owner-side decisions for the plan split (binding on plan writers)

These settle contested or cross-cutting items found by the seven scope inventories, the eight
reviews (four Opus, four Sol) and the code investigation. Plan writers restate them; they do not
reopen them. Where an inventory recommends RESTORE and nothing here overrides it, restore it.

## Scope
- In scope for version 1: SSR hydration (Next.js App Router first), lazy-loaded features,
  multi-tab shared persistence. Out: React Suspense integration (hooks never suspend).
- The old D50 non-goal list shrinks to: Suspense, tier-2 sync engines (sync-engine-adapter.md is a
  future path, not v1), runtime registration of arbitrary machines outside a declared lazy entry,
  machine-to-machine RPC beyond send, cross-origin sync.
- Persistence does not exist in code today (neither package does storage I/O). It is greenfield.
  Reuse: the old package's bounded decoder limits, fail-closed version check, in-flight restore
  rules, newer-wins resource merge, request runtime and inert render shell; the rewrite's
  restore-requires-persist rule.

## Structure
- workflow/plans/flow/FlowState.plan stays the entry: goal, principles and cross-cutting
  decisions, package routes, code disposition, build stages, the plan map. Each capability plan
  owns its outcomes, decisions, constraints, verification and questions in full: it states the
  semantics, not only feature names. C1 (archive is provenance only) stays, so everything kept
  must be written in a current plan.
- Capability plans (workflow/plans/flow/<Name>.plan): Machines, Runtime, Operations,
  EntityDomains, Persistence, MultiTab, ServerRendering, LazyFeatures, React, Testing,
  Diagnostics, Inspection, CommandLine, Package.
- Each capability plan has a ledger reference: workflow/plans/flow/references/ledger/<Name>.md,
  the inventory rows for its archived sources with a final disposition per row
  (KEPT / CHANGED / RESTORED / DROPPED + reason + where it now lives). The ledger is provenance;
  the plan is the authority.
- entity-domain.md sections that cite archived Plans (section 5.6, 6, 6.3 etc.) are repointed to
  current plans; EntityDomains.plan restates what those citations imported.

## Cross-cutting rulings
1. Turn budget: Stories' process() has a fixed private budget (10,000 turns per call) and fails
   with a FlowError code when exceeded; no public option (maxTurns stays deleted). Production has
   no cross-turn budget; flow check warns on a cycle in the static send graph.
2. Models traverse internal events whose producers are statically declared (operation outcomes,
   schedules), driven through fixtures, so models get past SAVING.
3. redirect stays dropped. Recorded question: guarded default children for choosing an initial
   child from input or memory.
4. Redaction: checkpoints and in-process snapshots are faithful (raw). Redaction applies only when
   data leaves the process (artifacts, traces, CLI output, inspector sinks, SSR payloads are NOT
   redacted because they must hydrate faithfully: sensitive fields in an SSR payload are an
   author decision flagged by flow check). Digests are keyed (HMAC with a per-Runtime key; per-run
   key in Stories), so low-entropy values cannot be dictionary-recovered.
5. inspect has two overloads: inspect(app) structural; inspect(runtime) live, passive,
   revision-consistent (domains, frontiers, predictions, queues).
6. attempt.id durability: for a persisted actor, Flow records the attempt (acknowledged
   KeyValueStore write) before invoking the adapter of a remote commit; for a non-persisted actor
   there is no durability (its workflow is lost on crash too). The `unknown` outcome carries the
   attempt; reconciliation re-issues the same attempt.id through an explicit `retry(attempt)`
   form on the commit action; Flow never mints a new id for a reconciliation.
7. Fixtures: two fixtures providing the same service reject; replacement is explicit
   (an `overriding` form). Production Layers follow Effect's merge semantics; flow check warns
   where it can see duplicates.
8. Provider disposal: a bound consumer counts as a use of its provider (it cannot expire);
   explicit disposeActor of a provider with live consumers rejects (FlowError naming them).
9. Incarnations: dispose-then-ensure creates a new incarnation; late outcomes, schedules, issues
   from an old incarnation never reach the new one. ensure while disposing waits, then creates.
   Two refs with the same machine and id but different persist/retain/context reject.
10. Schedules on restore and on resume after a hidden tab: a Duration schedule keeps its
    absolute deadline; overdue fires once (never a burst); a multi-step Schedule restarts from its
    first step. A state's schedules survive changes in its substates and "self".
11. Transitions: restore the exit/entry rule (descendant changes never restart ancestor work;
    parents start before children and stop after; exact semantics of targeting self or an
    ancestor).
12. value outcomes fire only when the confirmed value changes (Equal.equals); never for
    predictions or optimistic layers; equal values are silent. A machine's memory baseline
    (e.g. the editor's `saved`) therefore only ever holds confirmed data.
13. Plain resource writes use the entity §5.5 ordering rule (a source wins if its request started
    at or after the stored field landed); setData fences older lookups.
14. Lane tags are enumerated in the plan. Resource: Pending, Ready, Refreshing, Failure, Defect,
    Interrupted. Stream: Running, Complete, Failure, Defect, Interrupted. The paged-lane field is
    `hasMore` (renamed from `more` to avoid clashing with the `.more` action).
15. Resource `cancel` is deleted (minimal-library 8); O5 must not list it. Transactions do not take
    `persist` (they follow their actor); streams keep opt-in `persist` for latest value.
16. Codec: exact bounds restored (depth 32, 10,000 nodes, 4,096 array items, 262,144-byte strings,
    2 MiB canonical size), shared by persisted data, SSR payloads and artifacts; canonical bytes
    equal on Node, Bun, Deno and browsers, with a test per host.
17. Persistence layout: each scope commits atomically (records plus a manifest written last; the
    manifest names the record set; a torn set is ignored and the last good manifest wins).
    Version mismatch or corrupt data: discard that scope's records with a diagnostic and start
    fresh; compatible shape changes go through Schema decode transformations; no migration API
    in v1. Write flush: coalesced, flushed on page hide and on Runtime dispose.
18. Flow ships an IndexedDB KeyValueStore Layer (Effect 4.0.5 ships memory, file system, SQL and
    Storage only). Import path is `effect/persistence` (not effect/unstable/persistence).
19. Package: effect is a peerDependency; React an optional peer (18 and 19). flow-state/react
    carries "use client"; a flow-state/server route holds server-only code; sideEffects false.
20. Proving app: Dispatch Desk gains a Next.js App Router host (server render, hydrate, reload
    restore, two tabs), with real-browser gates (Chromium, Gecko, WebKit).
21. Process bounds: serialize queues and per-record entity queues are finite; overflow rejects
    the whole batch before work starts.
22. Disposal: runtime.dispose() is bounded (a commit that never settles is recorded unknown);
    disposeActor is idempotent; cleanup failure rejects dispose and quarantines the ref;
    dispose waits for finalizers, evidence and the last persistence write.
23. CLI process guarantees (signals, atomic publication details, output contract, containment,
    one Story executor, truncation-aware queries, package identity check) are restored in full in
    CommandLine.plan.
24. The diagnostic code vocabulary is written out (closed list with remediation), owned by
    Diagnostics.plan, before S2.
25. Cause: full Cause kept until cleanup ends; precedence defect, failure, interruption; Cause is
    never serialized.
26. Build order: S6 (persistence) depends on S5 for entity persistence (split core/entity gates);
    S7 minimal Story infrastructure precedes V5's property suite; S9 depends on S7; new stages
    for ServerRendering, MultiTab and LazyFeatures after S6 and S8; packed-consumer check at every
    stage gate.
27. Evidence handoff: the draft-8 type spike and the runtime model are committed under
    workflow/plans/flow/references/evidence/ with run commands.
28. Structural compilation of deny codes: deny codes come from types (the guard's return type is a
    union of literal codes, read by the TypeScript compiler API in flow check and inspect), not
    from running callbacks.
29. First render: the ensure forms (useActor, useActorByRef(ref, options)) always return a handle.
    Before attach (first render, server render, an unhydrated actor) the handle reads a pure
    pre-attach snapshot computed in render from the default states and initial(input), lanes
    Pending (or placeholder), context read passively from provider snapshots when present;
    render registers nothing, starts nothing, persists nothing, emits no evidence. Sends before
    attach are buffered (bounded, 64) and drained once on attach; overflow rejects. The effect
    attaches the same handle. The lookup form useActorByRef(ref) returns Actor | null. (Settles
    design-ssr Q4 and design-lazy Q1; design-lazy's Actor | null proposal is rejected.)
30. SSR follows design-ssr.md: flow-state/server exports dehydrate(setup, prepare, { scope,
    within, maxBytes? }) owning a private request Runtime; <Hydrate payload> in flow-state/react;
    Story .dehydrate/.hydrate; the no-mismatch rule H1; sensitive data omitted from payloads (this
    supersedes the SSR clause of ruling 4); server-side redirect/notFound decisions call
    operations or services directly, not actors (Q1 accepted for v1).
31. Lazy features follow design-lazy.md: lazy entry { id, load, context? }; synchronous adoption on
    first ensure/create; dormant persisted records carried forward; inspect(app) returns a Promise
    and loads every entry; no per-entry Layers.
32. Multi-tab follows multi-tab.md (M1-M8): one writer tab per (app, scope) by Web Lock; mirrors in
    follower tabs (snapshots from the leader, sends forwarded in order, bounded); per-tab actors
    stay per tab (sends fan out); handover is the O8 restore; confirmed entity records travel as
    versioned peer deltas, unversioned changes as invalidation, predictions never; logout is
    runtime.dispose({ forget: true }); degrade to "run without persistence" on fingerprint
    mismatch, no Web Locks, or no leader answer within 5 s; internal TabCoordination service with
    browser/solo/test Layers, enabled only in browsing contexts; a browser scheduler yielding via
    MessageChannel. Leadership does not move to the visible tab in v1.
33. Design references server-rendering.md, lazy-features.md and multi-tab.md are adopted with the
    rulings above; where a design and a ruling differ, the ruling wins.
34. Ordered alternatives: a handler may be an array of transitions; first passing guard wins; all
    declining falls through to the parent (D18); check reports every declined alternative's reasons.
35. actorRef(machine, id) takes a string or a readonly array of strings; the array form encodes
    unambiguously; string-joined composite ids are a flow check warning.
36. The unknown outcome carries an Attempt (exported Schema: id plus encoded input); O.X.retry(select,
    options) re-issues that exact attempt; a known settled outcome settles at once without invoking.
    List result metadata beyond records and cursor has no repair guarantee (flow check warns).
37. Fixture composition: Layer.provideMerge(fixtures, setup.services); fixtures may require setup
    services and shadow same-tag services; duplicate tags among fixtures reject; provide-nothing
    fixtures allowed; focused Stories take `services`; Story persistence is always a fresh
    in-memory KeyValueStore; run.trace exposes the Inspection O4 events.
38. SUPERSEDES 32 and 33's multi-tab part: multi-tab shared persistence is OUT of version 1 (no
    MultiTab plan, no leader election, mirroring or BroadcastChannel). Kept, because it is one
    call: detect-and-refuse. A Runtime with persistence requests a Web Lock named for (app id,
    scope) with ifAvailable at ready(); if it gets the lock it persists as normal and holds the lock
    until dispose; if another tab holds it, this Runtime runs without persistence (no restore, no
    capture) and reports SecondTabNoPersistence. Where navigator.locks is absent (server, insecure
    origin) there is no check and persistence proceeds. Atomic per-scope writes (ruling 17) still
    keep records whole. design/multi-tab.md stays as a deferred future design.
