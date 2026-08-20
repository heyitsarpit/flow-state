# Decisions requiring user input

Status: grill frontier complete; all current user-owned decisions are accepted.

## Accepted on 2026-08-20

- `RuntimeSetup.construct()` remains synchronous and inert. `Runtime.ready()` is the one public readiness
  Effect; it performs bootstrap/restoration once and caches its terminal result. `FlowProvider` observes the
  same boundary and does not own Runtime lifecycle.
- `BehaviorGateway` is created as `behavior({ app, stories })`. The explicit App prevents mixed-app inference;
  record keys remain external Story IDs, and both App and Machine Stories must belong to that AppPlan.
- Story external behavior is supplied through complete service `Implementation` values and `Fixture` overrides;
  resource, transaction, and stream kernels remain production-owned. There is no separate `simulate`, control,
  per-call matcher, or result-injection command; `.run()` is the execution boundary and `process()` drains ready
  production work.
- A contained callback defect discards the candidate, publishes one issue-only actor revision, starts no work,
  and acknowledges after the issue publication and TurnRecord are accepted. An invariant defect closes
  admission, fails the acknowledged dispatch/run, and enters terminal cleanup.
- Usage/admission failures use one public `FlowUsageError` with stable `code`, `path`, and `details`; raw
  Effect `Cause` remains public only on `FlowDisposeError` and `FlowStoryExecutionError`.
- Inspection/artifact APIs use one private v2 codec/model owner, a defensive file-neutral byte carrier, immutable
  inferred projections, and bounded inspection attachments with `drain()`/`dispose()`.

This is the only current list of decisions that cannot be safely resolved by mechanical reconciliation or
contract reading. Recommendations are included for the next grill session.

## Q1 — RuntimeSetup construction and readiness (closed)

`RuntimeSetup.construct()` is synchronous and inert. `Runtime.ready()` is the one public readiness Effect;
it performs bootstrap/restoration once and caches its terminal result. `FlowProvider` observes that boundary
without owning Runtime lifecycle.

## Q2 — Exact operation descriptor grammar (closed)

Use the narrow family-specific grammar in the active contracts: inferred P/K/A/E/R, whole-function
Implementations, `fixture({ id, implementation, seeds? })`, explicit writes/outcome mappers, and no generic
option bags or per-call matching. Resources, transactions, and streams default to non-persisted; `persist: true`
opts in their declared facts only when the owning stable actor is also persistable. Transaction persistence stores
reconciliation truth without replaying work; stream persistence stores the latest projection and reconnects
without replaying emissions. The Story builder and `.run()` remain the only testing boundaries.

Evidence: [PUBLIC_API.md](/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/PUBLIC_API.md:246),
[TYPE_SYSTEM.md](/Users/arpit/Developer/flow-state/reference/incident-console/implementation/contracts/TYPE_SYSTEM.md:157).

## Q3 — Public diagnostics and readiness failure shape (closed)

Usage/admission failures use `FlowUsageError` with stable `code`, `path`, and `details`. Persistence failures
use `FlowPersistenceError`; raw `Cause` remains only on `FlowDisposeError` and `FlowStoryExecutionError`.

## Q4 — Inspection and artifact public boundary (closed)

Request-owned Runtime construction, readiness, boot, and hydration helpers remain internal. Inspection/artifact
routes use one private v2 codec/model owner, a defensive file-neutral byte carrier, immutable inferred
projections, and bounded attachments with `drain()`/`dispose()`.

## Not user questions

The following are mechanical and should be resolved without another decision round:

- accepted `behavior({ app, stories })` record-key registration and explicit Story imports;
- App/Machine Story catalog membership and ActorRecipe exclusion;
- `RuntimeSetup`, `Implementation`, `Fixture`, and `--overwrite` vocabulary;
- whole-function service mocks, Fixture precedence, seed boundary, and operation-to-Implementation binding;
- removal of control-registry/per-call matching language and separate result-injection commands from active contracts;
- KEEP/REPLACE/DELETE inventory and proof-owner assignment;
- Beads creation timing.
