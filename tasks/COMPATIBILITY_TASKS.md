# Compatibility vocabulary tasks

[Back to the plan tracker](../TASK.md)

Authority: this is the sole `CV-*` ledger. These are additive or preferred-name migrations; valid aliases remain until a separately approved removal.

## Approved compatibility vocabulary tasks

These are additive/preferred-name migrations. Existing valid aliases remain
until a separate future removal is approved.

### `CV-1` Add `useActor` while retaining `use`

- [ ] Export `useActor` from `flow-state/react` as the clear actor hook name.
- [ ] Keep `use` source- and behavior-compatible as an alias.
- [ ] Make both names share one implementation, inference, ownership, and cleanup path.
- [ ] Prefer `useActor` in new docs and recipes; include an alias migration note.
- [ ] Prove both names from packed React 18/19 consumers.

Implementation detail (`P4B.2`):

- Owner/files: `packages/flow-state/src/react-entry.ts`,
  `packages/flow-state/src/react/use-actor.ts`, React API/type tests, packed
  React 18/19 fixtures, and preferred-name docs only.
- Tests: both exports are the same function value; both infer identical actor
  snapshot/send types; both follow the same Strict Mode cleanup path; both work
  from the packed `flow-state/react` entry.
- Commands: `F(packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, packed React
  fixture commands recorded by P0.1c, `C`.
- Non-goal: do not remove `use`, add generated hooks, or create a second hook.

### `CV-2` Prefer `getSnapshot()` while retaining `snapshot()`

- [ ] Make `getSnapshot()` the preferred actor read spelling across runtime,
      React, testing, stories/scenarios, inspection, and docs.
- [ ] Keep `snapshot()` as a compatibility alias with identical return type,
      identity, timing, and side-effect-free behavior.
- [ ] Route both names through one implementation and add a differential type/runtime test.
- [ ] Inventory callers before any later proposal to remove `snapshot()`.

Implementation detail (`P1C.2`):

- Owner/files: actor public types, canonical actor implementation,
  `packages/flow-state/src/core/orchestrator/**`, and callers discovered by an
  exact `rg -n '\.snapshot\('` inventory. Adapters migrate only when their
  owning packet runs.
- Tests: both methods return the same object identity at the same instant; both
  are side-effect free; aliases remain identical after send/flush/restore/stop;
  packed declarations expose the same return type.
- Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Non-goal: no alias removal. A remaining caller is a migration receipt item,
  not permission to break it.

### `CV-3` Keep Story for authored/CLI concepts and Scenario for execution

- [ ] Use Story for authored examples, story discovery, and CLI commands such as
      `story list`, `story describe`, and `story run`.
- [ ] Use Scenario for executed outcomes, checks, reports, options, blocked
      reasons, and runtime evidence.
- [ ] Add Scenario-named execution/result types without changing CLI Story vocabulary.
- [ ] Preserve current Story-named execution types as compatibility aliases when
      they are public; migrate internals/docs before considering removal.
- [ ] Prove programmatic tests and CLI story execution consume the same Scenario result.

Implementation detail (`P4A.2`):

- Owner/files: `packages/flow-state/src/core/api/story-types.ts`,
  `packages/flow-state/src/testing/flow-stories.ts`,
  `packages/flow-state/src/testing/flow-story-test.ts`, CLI story adapters,
  inspection renderers, compatibility exports, and their tests.
- Tests: authored discovery remains Story-named; execution returns the same
  Scenario result through programmatic and CLI paths; public Story execution
  names are aliases; JSON and human output project one result; domain failure,
  blocked proof, defect, and interruption retain distinct status.
- Commands: `F(packages/flow-state/src/flow-story-helper.test.ts
packages/flow-state/src/flow-story-run.test.ts
packages/flow-state/src/cli-test/flow-state-cli.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Dependency: every production family must have delegated its testing path;
  P4A.1 must have closed aggregate pending/settle parity.

### `CV-4` Preserve transaction and receipt vocabulary

- [ ] Keep `flow.transaction` with `params`, `commit`, `preview`, `invalidates`,
      routes, and concurrency as the write vocabulary.
- [ ] Keep resource runtime facts under `resource:*` receipt names.
- [ ] Keep write runtime facts under `transaction:*` receipt names.
- [ ] Remove new primary docs/runtime output that calls these operations query or
      mutation; retain only explicit historical migration notes where useful.
- [ ] Prove runtime, inspection, CLI, JSON, tests, and docs agree on the same receipt names.

Implementation detail (`P2.3`, projected by `P4D.2`):

- Owner/files: `core/api/receipt-types.ts`, production resource/transaction
  receipt constructors, inspection receipt projections, CLI renderers, and
  focused receipt tests. Launch Workspace business read models are excluded and
  belong only to P4A.3.
- Tests: resource actions emit only `resource:*`; write actions emit only
  `transaction:*`; no new runtime output emits `query:*`, `mutation:*`, or
  `cache:*`; JSON and human output share receipt types.
- Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-format.test.ts)`, `T`, `P`, `D`, `C`.
- Non-goal: historical migration prose may mention old terms when clearly
  labeled; durable offline queue remains deferred.
