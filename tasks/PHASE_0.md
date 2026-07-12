# Phase 0 — Established correctness contracts

[Back to the roadmap](../TASK.md)

Phase 0 is complete. It established the contracts and executable proof inputs
used by later phases; it is not an active work queue and should not be reread
unless the current slice touches one of its artifacts.

## Durable outputs

- `API_CONTRACT.md`: supported source and runtime compatibility.
- `TYPE_INFERENCE_CONTRACT.md`: public type direction and exact inference.
- `ARCHITECTURE_CONTRACT.md`: semantic ownership and lifecycle boundaries.
- `CLIENT_STRUCTURE_CONTRACT.md`: client layout, consulted only for layout work.
- `OWNER_MAP.md`: current and intended semantic owners.
- `CAPACITY_POLICY.md`: bounded ownership, overflow, eviction, and cleanup.
- `COMPATIBILITY_CORPUS.md`: permanent source/runtime/wire/export fixtures.
- `LAWS_AND_ORACLES.md`: executable laws and independent models.
- `tasks/SEMANTIC_DECISIONS.md`: selected observable semantics.
- `tasks/EFFECT_ARCHITECTURE.md`: Effect ownership, channels, and lifetime rules.
- `architecture/correctness/BASELINE.md`: historical observations and packed
  compatibility fixture locations; its former performance measurements are not
  gates.

## Established facts

- Resource refs are inert definitions with canonical instance identity; runtime
  owners execute lookup, mutation, invalidation, subscriptions, and hydration.
- App identity is canonical and stable under module reorder. Human presentation
  may derive a separate stable label but cannot replace ownership identity.
- `runtime.orchestrators.start` is the canonical actor-start surface.
  Compatibility aliases remain until an approved migration removes them.
- `getSnapshot()` is the preferred actor read name; `snapshot()` remains a
  compatible alias until the caller inventory is migrated.
- Promise adapters belong only at host/test-runner boundaries. Internal
  orchestration preserves exact Effect success, error, requirements, Scope,
  interruption, and Cause.
- Runtime receipts and inspection facts are bounded diagnostic evidence, never
  canonical business state.
- React consumes caller-owned runtimes and production sources. Render does not
  start, hydrate, or dispose runtime work.
- Unknown durable input is decoded completely to an immutable value before one
  atomic attach. No partial mutation is permitted.
- Story remains authored/CLI vocabulary; Scenario is execution/result
  vocabulary. Existing serialized Story kinds remain compatible.

## Valid compatibility floor

- Existing public calls, exports, aliases, and package entry points remain
  executable unless a separately approved migration says otherwise.
- Source and packed declarations expose the same public requirements without
  private-name leakage, TS7056 expansion, or type-erasing client annotations.
- Current child calls and types remain compatible. Child input selectors,
  outcome routes, independent output/failure generics, and automatic restart
  budgets are future additive work, not assumptions for current phases.
- Wire compatibility is versioned and explicit. Runtime-local identity is never
  advertised as portable durable identity.

## Deferred work

The following remain out of scope unless the roadmap explicitly activates them:

- durable offline queue, undo, replay, or reconnect workers;
- cross-tab or cross-process synchronization;
- automatic child restart budgets;
- provider-owned runtime creation during React render;
- speculative schema/DSL replacement of the existing public API;
- performance, timing, compiler-statistic, declaration-size, or package-size optimization.

Later phases may correct a Phase 0 statement only when live code, tests, and a
valid public/semantic contract prove it wrong. The matching review goal owns
that correction; implementation goals do not reopen Phase 0 for convenience.
