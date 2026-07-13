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

### [ ] P2.1b Allow and cancel-previous

- `allow` may run every admitted attempt, but latest-started same-scope
  generation alone owns visible publication.
- `cancel-previous` marks prior attempts stale and interrupts them; it never
  claims to undo external I/O that already completed.
- Old finalization removes only old attempt/preview ownership.

### [ ] P2.1c Reject, serialize, and admission

- `reject` denies overlap before preview/client work.
- `serialize` is FIFO per canonical concurrency key with bounded capacity and
  typed overflow. Dequeue transfers authority to the exact next generation.
- Cancellation, shutdown, and predecessor failure cannot leak queue slots or
  let stale work publish.

### [ ] P2.1d Independent interleaving model

- A small test oracle models ownership/publication without importing production
  reducers, keys, queue helpers, or fact builders.
- Deterministic/generated interleavings cover start, synchronous completion,
  cancel, allow, reject, queue, stop, replacement, and stale completion.

## P2.2 Preview and restore

### [ ] P2.2a Atomic preview, rollback, and invalidation

- Validate all preview patches before one ResourceStore batch publishes.
- Overlapping layers preserve the visible winner. Commit/rollback removes only
  the completing generation's layer and cannot restore an older root over newer work.
- Failure, defect, interruption, cancellation, and stale completion clean up
  exactly their own preview; successful invalidation occurs once.

### [ ] P2.2b Prevalidated internal restore

- Internal transaction restore accepts one complete immutable decoded value,
  validates app/actor/definition/generation/policy/ref compatibility, and
  reconciles state atomically or rejects without mutation.
- It is not a second public decoder and does not resume external side effects.

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

## [ ] P2.4 Input-first transaction typing

- Authored Params flow to preview, commit, invalidation, concurrency, and routes.
- Commit Effect success/error/requirements and outcome events remain exact
  through runtime, testing, adapters, and packed declarations.
- Wrong Params, narrower callbacks, invalid outcomes, missing services, and
  impossible lanes fail locally without catch-all overloads or casts.

## Phase 2 exit

- All overlap policies and synchronous/stale interleavings match the independent model.
- Preview/publication/invalidation are atomic and generation-owned.
- Production and testing paths agree; canonical facts and exact public types pass.
- No Phase 3 or adapter semantics were implemented inside transaction owners.
