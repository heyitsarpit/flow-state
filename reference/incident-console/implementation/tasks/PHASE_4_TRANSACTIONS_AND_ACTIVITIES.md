# Phase 4 — Transactions and activities

Status: waiting on Phase 3

## Objective

Implement exact transaction identity and concurrency, the global ordered optimistic
overlay ledger, activity reconciliation, streams, timers, children, and scoped remote
leases on the Phase 2 actor and Phase 3 store owners.

## Governing contracts

`API-007`–`API-009`, `TYPE-006`–`TYPE-008`, `SEM-015`–`SEM-024`, `ARCH-015`,
`ARCH-023`, `WIRE-012`, `SNAP-006`–`SNAP-010`, `PROOF-005`, `PROOF-007`, `PROOF-015`,
and the activity portions of `PROOF-003` and `PROOF-004`.

## Allowed scope

Transaction runner, exact transaction refs, overlay commands, concurrency supervisors,
activity reconciliation, streams, timers, children, scoped lease pattern, snapshots,
receipts/issues, and deterministic tests.

React, story runner, artifact formats, and CLI are forbidden.

## Tasks

- [ ] Use exact transaction refs for generations, actor snapshots, routes, receipts,
      concurrency, persistence, and cleanup.
- [ ] Implement `reject-while-running`, `cancel-previous`, `allow`, and unbounded FIFO
      `serialize` per canonical concurrency key without deduplication.
- [ ] Allocate serialized generation on accepted admission; state exit/disposal drops queued
      attempts without routing an outcome.
- [ ] Store ordered overlays globally by actor, transaction ref, generation, target ref, and
      store order; apply multi-ref previews atomically.
- [ ] Remove exactly one generation's overlays on every terminal path. Success invalidates
      authoritative bases and never promotes preview data.
- [ ] Reconcile activity identity from declaration, exact ref/key, and outcome identity.
- [ ] Use `FiberMap` for replaceable work, `FiberSet` for independent work, and Queue plus one
      supervised worker for serialized work. Run each program as `Effect.scoped` without a
      second manually owned child Scope.
- [ ] Implement keyed streams, timers, and children with generation-gated mailbox completion.
- [ ] Implement continuing remote leases through scoped streams; use a child actor when the
      lease lifecycle is domain behavior.
- [ ] Normalize pending/queued transaction restoration to interruption with no route and no
      automatic retry before first hydrated publication.

## Acceptance

- A transaction-start turn publishes pending status, preview, receipts, issues, and one
  matching store revision together.
- Two actors and several transaction generations can overlap on one resource without
  overwriting or rolling back another generation.
- Success, failure, defect, interruption, restoration, state exit, and disposal each remove
  only owned overlays and preserve the complete Cause where applicable.
- Serialized attempts run FIFO, allocate stable queued identities, and never route work
  that did not start.
- Stream, timer, child, and lease replacement cannot accept stale completion.
- Planned state exit releases work once without synthesizing an external interruption
  outcome; cleanup defects become issues and do not roll back published transitions.

## Deletion obligations

Delete actor-local preview ledgers, descriptor-ID transaction registries, hard-coded
serialize capacity/rejection, generic actor retry/reset methods, duplicate activity Scopes,
legacy invoke/after owners, and the `Stream.never` ignored-cancellation runbook pattern.

## Gates and receipt

Run transaction identity/concurrency/overlay interleaving tests, multi-actor store tests,
stream pressure and completion tests, timer TestClock tests, child supervision tests,
remote-lease exit matrix, restoration tests, package test/typecheck/build. The receipt
includes overlay timelines, queue order, stale-completion evidence, Cause/finalizer matrix,
deletions, and exact exits.
