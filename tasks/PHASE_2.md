# Phase 2 — Transactions, concurrency, and atomic publication

[Back to the roadmap](../TASK.md)

Goal 2 uses the Phase 1 actor, ResourceStore, evidence, and Scope owners. It does
not redesign streams, timers, children, React, server, inspection, CLI, or docs.

You can reference the effect-v4 codebase to learn how to use a Effect feature: `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`.

## P2.1 Transaction state and overlap policies

### [ ] P2.1a Generation and synchronous completion

- Install attempt generation and running/pending publication before preview or
  synchronously completing client work can publish.
- Publish one discriminated running-to-terminal state. Only the active
  generation may publish summary, route, issue, receipt, invalidation, queue,
  preview, and pending-count facts.
- Typed failure, defect, interruption, rejection, cancellation, and stale
  completion remain distinct. Testing delegates to the production owner.
- [x] Transaction snapshots, trace detail status, and focused transaction tests
      now distinguish typed failure from defect instead of collapsing both terminal
      lanes into `failure`.
- [x] Focused `submit` and state-owned `flow.run` proofs now pin synchronous
      transactions to a pending-before-terminal publication sequence, including
      runtime subscriber visibility and the Flow Test surface.
- [x] Stale allow-completion proofs now pin routed-event evaluation behind the
      generation owner gate, so stale `routes.success` / `routes.failure` /
      `routes.defect` callbacks cannot execute on either the runtime actor or
      the Flow Test surface.

### [ ] P2.1b Allow and cancel-previous

- `allow` may run every admitted attempt, but latest-started same-scope
  generation alone owns visible publication.
- `cancel-previous` marks prior attempts stale and interrupts them; it never
  claims to undo external I/O that already completed.
- Old finalization removes only old attempt/preview ownership.
- [x] Focused cancel-previous proofs now pin late cancelled-success completion
      to a no-publication lane on both the runtime actor and the Flow Test
      surface, while the replacement generation keeps the visible preview and
      remains the only path that can publish success.
- [x] Focused cancel-previous stale terminal-route proofs now pin
      `routes.success` / `routes.failure` / `routes.defect` evaluation behind
      the live replacement generation, so a cancelled completion cannot execute
      user route code or publish after the newer preview has become
      authoritative.

### [ ] P2.1c Reject, serialize, and admission

- `reject` denies overlap before preview/client work.
- `serialize` is FIFO per canonical concurrency key with bounded capacity and
  typed overflow. Dequeue transfers authority to the exact next generation.
- Cancellation, shutdown, and predecessor failure cannot leak queue slots or
  let stale work publish.
- [x] Focused reject proofs now pin overlap denial ahead of preview publication
      and client work, so the second rejected attempt cannot patch the resource
      store or emit a second preview receipt on either the runtime actor or the
      Flow Test surface.
- [x] Focused serialize proofs now pin typed predecessor failure to one dequeue
      and one successor restart on both the runtime actor and the Flow Test
      surface, while the queued attempt becomes the only live preview owner and
      the queue slot does not leak or stall.
- [x] Focused serialize defect proofs now pin predecessor defect to the same
      one-dequeue successor transfer, so defect finalization also frees the
      queue slot without starting the queued attempt twice or leaving it
      stalled.
- [x] Focused serialize overflow proofs now pin the default one-slot queue to a
      typed third-attempt rejection before preview publication or client work on
      both the runtime actor and the Flow Test surface, so bounded admission
      cannot silently retain unbounded same-key overlap.
- [x] Focused serialize no-progress proofs now pin a never-completing
      predecessor to one active attempt and one retained queued successor on
      both surfaces, so repeated flushes cannot dequeue hidden progress or
      start the queued commit before the live owner settles.

### [ ] P2.1d Independent interleaving model

- A small test oracle models ownership/publication without importing production
  reducers, keys, queue helpers, or fact builders.
- Deterministic/generated interleavings cover start, synchronous completion,
  cancel, allow, reject, queue, stop, replacement, and stale completion.
- [x] Focused overlap-policy oracles now pin the immediate two-attempt
      interleaving for `reject`, `serialize`, `cancel-previous`, and `allow`
      on both surfaces, so queueing, replacement, rejection, and visible preview
      ownership no longer depend on hand-written per-policy assertions alone.
- [x] Focused cancel replacement oracles now pin stale success, failure, and
      defect after `cancel-previous` replacement on both surfaces, so late old
      generation completion cannot overwrite the live preview owner or re-enter
      terminal publication lanes.
- [x] Focused lifecycle oracles now pin active and queued serialized stop/dispose
      interruption on runtime actors and the public rehydrated harness, so late
      completion after shutdown cannot dequeue hidden work or re-enter success,
      failure, or defect publication lanes.
- [x] Bounded generated replacement interleavings now vary `allow` and
      `cancel-previous` across older success, failure, defect, and
      older/newer completion order on both surfaces, so winner publication no
      longer depends on one hand-picked stale-completion example per policy.

## P2.2 Preview and restore

### [ ] P2.2a Atomic preview, rollback, and invalidation

- Validate all preview patches before one ResourceStore batch publishes.
- Overlapping layers preserve the visible winner. Commit/rollback removes only
  the completing generation's layer and cannot restore an older root over newer work.
- Failure, defect, interruption, cancellation, and stale completion clean up
  exactly their own preview; successful invalidation occurs once.
- [x] Focused multi-ref overlap rollback proofs now pin older failure to
      rollback only its own preview layers on both the runtime actor and the
      Flow Test surface, so the newer visible winner survives across every
      touched ref instead of restoring an older root on one resource while
      another stays current.
- [x] Focused multi-ref overlap invalidation proofs now pin the same older
      failure to zero invalidation publication, while the newer winning success
      invalidates each touched ref exactly once on both the runtime actor and
      the Flow Test surface instead of double-publishing or invalidating during
      rollback.
- [x] Focused multi-ref preview-apply defect proofs now pin a later patch throw
      to zero partial preview publication and zero commit start on both the
      runtime actor and the Flow Test surface, so the seeded root survives
      unchanged instead of one touched ref publishing before the batch fails.
- [x] Focused multi-ref cancel-previous cleanup proofs now pin the cancelled
      generation to rollback only its own two-ref preview and publish zero
      invalidation, while the replacement winner stays visible across both refs
      and later invalidates each touched ref exactly once on both surfaces.
- [x] Focused multi-ref stale-defect suppression proofs now pin a cancelled
      generation's later defect to zero transaction-defect receipt publication,
      zero issue publication, and zero extra invalidation on both surfaces, so
      the replacement winner remains the only visible multi-ref result.
- [x] Focused multi-ref stop/dispose cleanup proofs now pin active boundary
      interruption to rollback both preview layers with zero invalidation on
      both the runtime actor and the public rehydrated harness, so a late
      success after shutdown cannot republish either touched ref or leak a
      partial multi-ref winner.

### [ ] P2.2b Prevalidated internal restore

- Internal transaction restore accepts one complete immutable decoded value,
  validates app/actor/definition/generation/policy/ref compatibility, and
  reconciles state atomically or rejects without mutation.
- It is not a second public decoder and does not resume external side effects.
- [x] Focused transaction-restore rejection proofs now pin a restored pending
      transaction snapshot to pre-start rejection when the destination state no
      longer owns that transaction definition, so runtime actors and the public
      rehydrated harness reject the bad restore without actor registration or
      commit replay.
- [x] Focused queued-transaction restore rejection proofs now pin restored
      `queued` transaction snapshots to the same pre-start rejection on both
      surfaces, so restore cannot retain dead queue facts when the runtime has
      no serialized queue ownership metadata to reconcile.
- [x] Focused unknown-transaction restore rejection proofs now pin restored
      terminal transaction facts with machine-unknown ids to the same pre-start
      rejection on both surfaces, so internal restore cannot retain executable
      transaction history that the destination machine never defined.
- [x] Focused pending-transaction receipt completeness proofs now pin restored
      pending transaction facts without a persisted `transaction:start` receipt
      to the same pre-start rejection on both surfaces, so internal restore
      accepts only complete transaction facts instead of synthesizing missing
      active-history evidence.

## [ ] P2.3 Canonical transaction and resource facts

- Keep `flow.transaction`, `params`, `commit`, `preview`, `invalidates`, routes,
  and concurrency as the surviving write vocabulary.
- Resource facts use `resource:*`; write facts use `transaction:*`. Legacy
  `query:*`, `mutation:*`, and `cache:*` receipts are removed from executable
  facts, tests, and docs.
- Facts are readonly, serializable, discriminated, bounded evidence. Adapters
  project them; Launch Workspace does not derive business state from history.
- Cutover marker: runtime, inspection, CLI, JSON, and tests project only the
  canonical `resource:*` and `transaction:*` fact names; historical vocabulary is
  prose-only.
- [x] Launch Workspace readiness proof now reads the canonical `launch.readiness`
      runtime resource and counts `resource:invalidate` receipts instead of the
      obsolete `cache:invalidate` vocabulary, while keeping the Phase 4
      receipt-history boundary explicit in example/docs proof.
- [x] Public receipt types now model canonical `resource:*` and `transaction:*`
      facts as discriminated shapes, so source type tests can require documented
      preview and invalidation fields without closing the fallback lane for
      app-defined noncanonical receipts.
- [x] Trace correlation details now consume canonical `resource:*` and
      `transaction:*` receipts through discriminated narrowing, so inspection
      projections stop pulling queue/generation/preview/freshness fields from
      loose string-indexed bags and ignore noncanonical prefix lookalikes.
- [x] Trace reports and correlation-detail family indexing now share canonical
      `resource:*` and `transaction:*` guards, so noncanonical prefix
      lookalikes stay out of canonical buckets and outcomes and cannot hide the
      final snapshot for same-id resource details.
- [x] Flow Test transaction read helpers and debug formatting now share the
      canonical `transaction:*` guard, so testing-side event views ignore
      noncanonical prefix lookalikes instead of advertising or pretty-printing
      custom write receipts as canonical transaction facts.

## [ ] P2.4 Input-first transaction typing

- Authored Params flow to preview, commit, invalidation, concurrency, and routes.
- Commit Effect success/error/requirements and outcome events remain exact
  through runtime, testing, adapters, and packed declarations.
- Wrong Params, narrower callbacks, invalid outcomes, missing services, and
  impossible lanes fail locally without catch-all overloads or casts.
- [x] `flow.transaction(...)` now treats authored `params` selectors as the
      source of truth for `commit` and `invalidates`, so selector-backed
      transactions reject narrower downstream callbacks without breaking the
      older no-selector `commit`-first inference path.

## Phase 2 exit

- All overlap policies and synchronous/stale interleavings match the independent model.
- Preview/publication/invalidation are atomic and generation-owned.
- Production and testing paths agree; canonical facts and exact public types pass.
- No Phase 3 or adapter semantics were implemented inside transaction owners.
