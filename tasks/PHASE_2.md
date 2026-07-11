# Phase 2 — Transactions, concurrency, and atomic publication

[Back to the plan tracker](../TASK.md) · [Previous: Phase 1](./PHASE_1.md) · [Next: Phase 3](./PHASE_3.md)

Manifest only; packet readiness is tracked in [TASK.md](../TASK.md); independent
families do not wait for an unrelated whole-phase close.

Effect construction is governed by the
[binding Effect architecture blueprint](./EFFECT_ARCHITECTURE.md)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Transaction packets use
its scoped fibers, bounded queues/admission, Exit/Cause, and host-boundary rules;
they do not build a Promise concurrency engine.

## Phase 2 execution packets

### P2.1 transaction concurrency family

#### P2.1a State, generation, and synchronous completion

- [ ] Install generation/publication authority and publish a discriminated
      running/pending state before preview or client commit can run.
- [ ] Close BUG-41T and BUG-50T: success, typed failure, defect, interruption,
      rejection, and stale states cannot expose contradictory fields; a
      synchronously completing Effect still yields one running-to-terminal sequence.
- [ ] Completion publishes actor/resource/preview/issue/receipt facts only when
      the active generation owns the final batch.
- [ ] Delegate transaction execution and pending facts in flowTest to this
      production owner; delete/disable its duplicate write path in the same receipt.
- [ ] Keep external side effects outside Flow State rollback guarantees.

Files: transaction start/completion/ownership/types, generation helpers,
snapshots/receipts, testing transaction delegation, and focused tests.

Tests: synchronous success/failure/defect before first yield; observer sees
running then terminal; stale completion cannot publish; direct runtime and
flowTest agree; external Effect may already have run despite rejected publication.

#### P2.1b Allow and cancel-previous

- [ ] Same/different keys follow the documented overlap policy.
- [ ] For allow, every attempt may run externally but latest-started generation
      alone owns summary, route, issue, ordinary completion receipt, invalidation,
      and visible preview result.
- [ ] For cancel-previous, mark old generation stale and interrupt it before
      starting replacement; late cleanup retires only its own preview/fiber.
- [ ] An interruption-ignoring client Effect cannot publish over its replacement.

Tests: old success/failure/defect/interruption before and after new completion;
same/different keys; cancel racing synchronous completion; exact preview/receipt/
route/invalidation assertions.

#### P2.1c Reject, serialize, and admission

- [ ] Reject-while-running and capacity overflow reject before preview/commit work.
- [ ] Serialized requests use stable queue identity and FIFO per key.
- [ ] Completing/stopping an old owner cannot dequeue or start a newer owner's work.
- [ ] Enforce configured queue/concurrent-attempt limits with typed outcomes.
- [ ] Never claim strict global fairness or progress behind a never-completing
      uninterruptible serialized predecessor.

Tests: reject executes zero callbacks; FIFO same-key and parallel different-key;
queue owner replacement; admission overflow; stop/cancel/dequeue races.

#### P2.1d Model/property interleavings

- [ ] Build a small independent publication/ownership model that does not import
      production reducers, key encoders, queue helpers, or receipt builders.
- [ ] Generate bounded start/allow/cancel/reject/serialize/complete/stop schedules,
      shrink failures while preserving the schedule, and keep permanent seeds.
- [ ] Assert state, owner generation, pending count, preview layers, queue, and
      visible evidence after every step.

Reference reading — ideas/tests only:
`docs/codebases/tanstack-query/packages/query-core/src/mutationCache.ts`,
`docs/codebases/tanstack-query/packages/query-core/src/retryer.ts`,
`docs/codebases/tanstack-query/packages/query-core/src/__tests__/mutationCache.test.tsx`,
and `docs/codebases/tanstack-query/packages/query-core/src/__tests__/mutations.test.tsx`
may supply same-scope/different-scope, exact queued-target, active-work,
pause/cancel/continue, and terminal-gating race shapes. Do not copy the Promise
engine, focus/online globals, unbounded arrays, silent cleanup catches, or
cancellation vocabulary.

Commands for each subpacket: F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/transaction-outcome.test.ts
packages/flow-state/src/runtime-invokes.test.ts); T; P; E; C. P2.1d also runs the
dedicated model/property test recorded in its receipt.

### P2.2 preview and internal restore family

#### P2.2a Atomic preview, rollback, and invalidation

- [ ] Replace preview overlay descriptor-ID maps with canonical resource-instance identity.
- [ ] Make preview application/rollback atomic with resource state and subscribers.
- [ ] Prove typed failure, defect, interruption, and cancellation restore preview correctly.
- [ ] Invalidate only on documented successful outcomes.
- [ ] Close BUG-4 and BUG-7 without creating a second optimistic-state owner.

Files: `orchestrator-transaction-preview.ts`, transaction invalidation/recovery,
ResourceStore batch primitive from P1B.2, transaction/resource snapshots,
hydration glue, and transaction/rehydration tests.

Atomic means all preview patches validate first, then one store batch publishes;
failure leaves the store and actor snapshot unchanged. Rollback recomputes the
remaining overlay stack from one root per canonical ref and publishes once.
Commit removes only the completing generation's layers. No timestamp mutation or
descriptor-ID search may stand in for identity.

The guarantee covers Flow State-owned preview/resource/actor facts only. A
client Effect that already called a remote system is not rolled back. Cross-owner
atomicity requires one explicit batch/publication barrier or one canonical state
source with derived projections; two sequential assignments are not atomic.

Tests: multi-ref apply succeeds in one publication; second patch failure leaves
both untouched; overlapping previews on one ref commit/rollback in both orders;
two refs of one descriptor remain separate; typed failure/defect/interruption;
stale generation removes only its own layer.

#### P2.2b Internal prevalidated restore

- [ ] Accept only a complete, immutable, already-decoded internal transaction
      restore value from P4C's boundary decoder.
- [ ] Reconcile compatible pending generation/preview ownership atomically or
      reject before mutation.
- [ ] Never inspect unknown wire input, choose a version, or add v2 fields here.

Tests: compatible internal restore; wrong transaction/app ownership; stale/newer
conflict; one invalid internal entry yields zero mutation. Unknown/version/wire
tests belong only to P4C.1a.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-rehydration.test.ts)`, `T`, `P`, `E`, `C`.

### `P2.3` Canonical transaction/resource receipts (`CV-4`)

- [ ] Complete the CV-4 packet without editing adapter/client business read models.
- [ ] Ensure receipt construction is production-owner-owned and adapters only project it.
- [ ] Add one receipt vocabulary registry/test so new primary runtime receipt
      types cannot reintroduce `cache:*`, `query:*`, or `mutation:*` names.
- [ ] Close BUG-31 with discriminated, readonly, serializable receipt fact unions
      for transaction/resource lanes while preserving the compatible public
      `FlowReceipt` supertype during migration.
- [ ] Include runtime/actor incarnation and monotonic fact sequence where needed;
      keep raw params, keys, context, service errors, and unbounded values out of
      receipts by default.
- [ ] Treat receipts as bounded evidence, never as the authoritative business or
      runtime state used to decide readiness, ownership, or retry behavior.

Files/tests/commands are in
[CV-4](./COMPATIBILITY_TASKS.md#cv-4-preserve-transaction-and-receipt-vocabulary).
This packet does not change Launch Workspace business/readiness derivation;
BUG-39 and that proof belong exclusively to P4A.3.

Tests additionally cover exhaustive receipt narrowing, impossible lane fields,
JSON serialization, bounded truncation compatibility, and stale facts as
inspection-only evidence.

### `P2.4` Input-first transaction declarations

- [ ] Make `params` selector return or explicit Params the sole upstream Params contract.
- [ ] Contextualize commit/preview/invalidation/concurrency/routes from fixed Params.
- [ ] Infer success/failure/requirements from commit only after Params is fixed.
- [ ] Replace bivariant callback types one family at a time, each with a concrete
      unsoundness regression and compatibility fixture. `[SMART]`
- [ ] Preserve `flow.transaction`, `submit`, `flow.run`, preview, invalidates,
      routes, and existing concurrency call shapes.
- [ ] Complete `CV-4`: emit only canonical `transaction:*` write receipts and
      `resource:*` resource receipts on new runtime paths.

Files: `core/api/resource-transaction-types.ts`, transaction callback/outcome
types, `core/transactions/**`, orchestrator transaction consumers, public type
tests, and packed fixtures. Keep behavior changes in P2.1–P2.3; this packet is a
reviewed type-family refactor.

Tests: inferred Params fixes every downstream callback; explicit Params remains
compatible; wrong/narrower Params callback fails locally; commit infers exact
success/error/requirements; `never` typed failure removes only the typed failure
route; refs/events in preview/invalidation/routes remain exact; source and packed
declarations agree.

Commands: `F(packages/flow-state/src/transaction-callbacks.test.ts
packages/flow-state/src/transaction-outcome-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/transaction-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

Non-goal: no global removal of every `BivariantCallback`; change only the
transaction family after its unsafe-narrower regression is red.

### Phase 2 closure

- [ ] Input-first positive/negative transaction fixtures pass from packed declarations.
- [ ] Overlap/concurrency/late-completion matrix passes.
- [ ] No duplicate transaction runner or optimistic state owner remains.
- [ ] BUG-4/6/7/14/18T/31/41T/50T are closed; synchronous completion cannot
      precede installed running/generation authority.
- [ ] Durable offline queue/replay remains explicitly deferred and unadvertised.

---
