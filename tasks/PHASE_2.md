# Phase 2 — Transactions, concurrency, and atomic publication

[Back to the plan tracker](../TASK.md) · [Previous: Phase 1](./PHASE_1.md) · [Next: Phase 3](./PHASE_3.md)

Status: blocked by Phase 1 closure.

Effect construction is governed by the
[binding Effect architecture blueprint](./PHASE_0.md#binding-effect-architecture-blueprint)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Transaction packets use
its scoped fibers, bounded queues/admission, Exit/Cause, and host-boundary rules;
they do not build a Promise concurrency engine.

## Phase 2 execution packets

### `P2.1` Overlap, generation ownership, and stale completion

- [ ] Test same-key and different-key overlapping requests.
- [ ] Test every currently advertised in-memory policy, including allow,
      reject-while-running, cancel-previous, and serialized queued execution.
- [ ] Prove cancelled/replaced requests cannot route or commit late results.
- [ ] Reject stale-generation success, receipts, invalidation, routes, preview
      commit/rollback, issue mutation, and queue ownership.
- [ ] Do not pretend cancellation undoes an already completed external side effect.
- [ ] Keep durable offline queue/replay deferred.
- [ ] Enforce the P0.6 capacity policy for serialized queues and concurrent
      `allow` attempts; overflow is a typed rejection before client work starts.
- [ ] Close BUG-41T with a discriminated transaction snapshot state; pending,
      success, typed failure, defect, interruption, rejection, and stale cannot
      expose contradictory result/error fields.
- [ ] Close BUG-50T: install generation and publish the running/pending state
      before invoking client commit work, including synchronously completing
      Effects. Observers see one valid running-to-terminal sequence.

Files: `core/orchestrator/orchestrator-transaction-{start,concurrency,completion,recovery,ownership,types}.ts`,
registry generation helpers, transaction snapshots/receipts, and transaction tests.

Binding behavior:

- Transaction start linearizes when generation/publication ownership is
  installed before preview or commit begins. External commit execution is not a
  Flow State publication point. Completion linearizes only when the active
  generation's actor/resource batch commits.

- `allow`: every request may execute externally, but the latest-started
  same-transaction generation is the publication owner. An older attempt that
  completes first or last cannot overwrite the summary, route, issue, ordinary
  completion receipt, or invalidation owned by the newer attempt. It may retire
  its own preview layer without disturbing the newer visible overlay. A future
  per-attempt result handle would be a separate API decision.
- `reject-while-running`: reject before preview/commit work starts and emit only
  the documented rejection fact.
- `cancel-previous`: interrupt the previous fiber and mark its generation stale
  before starting the replacement; late finalization may clean itself only.
- `serialize`: queued requests have stable queue identity; completing an old
  generation cannot dequeue/start work belonging to a newer owner.

Tests: same/different concurrency keys for all policies; old success after new
success; old failure/defect/interruption after replacement; external commit that
ignores interruption; cancel racing synchronous completion; queue owner replaced
before dequeue; capacity overflow before work; exact receipt/route/invalidation/
preview/queue assertions; property/model-generated bounded interleavings against
the publication rules; synchronous success/failure/defect before the first
scheduler yield still publishes installed running then terminal authority.

Reference reading — ideas/tests only: inspect
`docs/codebases/tanstack-query/packages/query-core/src/mutationCache.ts`,
`docs/codebases/tanstack-query/packages/query-core/src/retryer.ts`,
`docs/codebases/tanstack-query/packages/query-core/src/__tests__/mutationCache.test.tsx`,
and `docs/codebases/tanstack-query/packages/query-core/src/__tests__/mutations.test.tsx`
for same-scope serial versus different-scope parallel execution, exact
queued-target removal, active-work GC protection, pause/cancel/continue races,
and terminal completion gating. Do not copy its Promise engine, focus/online
globals, unbounded per-scope arrays, silent cleanup catches, or cancellation
vocabulary; implement and test the packet through Effect fibers, Scope,
generations, and the typed Flow State outcome lanes.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/transaction-outcome.test.ts
packages/flow-state/src/runtime-invokes.test.ts)`, `T`, `P`, `E`, `C`.

### `P2.2` Atomic preview, rollback, invalidation, and restore

- [ ] Replace preview overlay descriptor-ID maps with canonical resource-instance identity.
- [ ] Make preview application/rollback atomic with resource state and subscribers.
- [ ] Prove typed failure, defect, interruption, and cancellation restore preview correctly.
- [ ] Invalidate only on documented successful outcomes.
- [ ] Preserve compatible pending facts across restore; reject wrong transaction/app/version.
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

Execution split: `P2.2a` owns preview-layer/store atomicity and `P2.2b` owns
restore reconciliation after the version/ownership contract is fixed. Do not
couple decoder design to the optimistic-store rewrite.

Tests: multi-ref apply succeeds in one publication; second patch failure leaves
both untouched; overlapping previews on one ref commit/rollback in both orders;
two refs of one descriptor remain separate; typed failure/defect/interruption;
restore wrong owner/version is atomic.

Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-rehydration.test.ts)`, `T`, `P`, `E`, `C`.

### `P2.3` Canonical transaction/resource receipts (`CV-4`)

- [ ] Complete the CV-4 packet and fix BUG-14.
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
[Phase 0 compatibility vocabulary](./PHASE_0.md#approved-compatibility-vocabulary-tasks).
Also update Launch Workspace
inventory/status only after runtime tests prove the behavior.

Tests additionally cover exhaustive receipt narrowing, impossible lane fields,
JSON serialization, bounded truncation compatibility, stale facts as inspection-
only evidence, and Launch Workspace deriving readiness from canonical state.

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
