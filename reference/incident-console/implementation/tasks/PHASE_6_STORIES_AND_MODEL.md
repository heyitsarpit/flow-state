# Phase 6: Stories, fixtures, controls, checkpoints, and pure model paths

Status: waiting on Phase 5

## Prerequisites and contract IDs

Phases 1-5 must provide the compiled app graph, exact refs, Queue mailbox, package-private
acknowledged dispatch, atomic actor snapshots, generation-safe resource and transaction
kernels, one ManagedRuntime owner, idempotent disposal, and host/root authority.

This phase implements TEST-001 through TEST-015 and TEST-018. It closes PROOF-001 through
PROOF-011 where they concern testing and closes the testing-executor portion of PROOF-017.
Checkpoint evidence MUST preserve SNAP-001 through SNAP-010. TEST-016 inspection retention
and artifact/CLI integration remain Phase 7 work.

## Allowed scope

- pure story, fixture, control, checkpoint, start, run-result, and execution-error types;
- story compiler and immutable command builder;
- run-local fixture/control instantiation and the single scoped story runner;
- pending-work lifetime inventory and TestClock progress commands;
- pure model discovery and `path.story` conversion;
- migration of package-owned tests from legacy harnesses to stories or lower-level internal
  runtime seams;
- deletion of the entire replaced public testing/executor family.

## Forbidden work

- Do not create a testing-only actor, store, transaction interpreter, clock, scheduler, Scope,
  or inspection history.
- Do not expose package-private acknowledged dispatch, a live runtime, actor, controller,
  Deferred, Queue, registry, `state()`, `context()`, or `getSnapshot()` from story results.
- Do not add assertions, matchers, expected-state fields, portable checks, retries, runtime
  branches, callbacks, arbitrary Effects, or implicit waiting to the story plan.
- Do not let `checkpoint`, `flush`, or `settle` move future time.
- Do not let controls assign Flow-owned snapshots, statuses, generations, receipts, or issues.
- Do not run Effects during model discovery.

## Tasks

- [ ] Implement the TEST-001/002 immutable story AST and builder. Bind app and machine at
      construction, accumulate literal checkpoint keys, reject duplicate checkpoint names, and
      keep all commands inspectable before execution.
- [ ] Implement the exclusive fresh/snapshot/boot start union from TEST-003, including boot actor
      selection diagnostics and app/machine reachability validation.
- [ ] Implement `flow.fixture` and pure fixture graph compilation. Apply TEST-004/005 definition
      deduplication, collision, duplicate exact-ref seed, Clock exclusion, and pre-acquisition
      validation rules.
- [ ] Implement generic controlled Effect and stream definitions with per-run adapters. Assign
      ordinals when invocation or subscription starts and provide branded inert terminal commands
      exactly as TEST-006 requires.
- [ ] Build one scoped runner over the production runtime. Instantiate fixtures once, compose the
      application Layer, install one TestClock, create or restore the selected actor, interpret
      commands, capture evidence, and dispose through one acquire/use/release path.
- [ ] Interpret `send` through package-private acknowledged dispatch. Prove the Deferred completes
      after one published actor turn and before blocked async completion. Public actor send remains
      synchronous and void.
- [ ] Implement checkpoint and final capture as the three frozen roots from TEST-008. Implement
      `FlowStoryExecutionError`, partial evidence, combined execution/cleanup Causes, AbortSignal
      handling, and non-abortable cleanup from TEST-009 through TEST-011.
- [ ] Replace progress controls with TEST-012/013 lifetime inventories. Remove aggregate fibers,
      per-command bounds, implicit timer jumps, arbitrary predicates, and waiting for continuing
      work.
- [ ] Make behavior registration point directly to immutable story definitions without changing
      execution. Keep stories expectation-free; host tests assert returned evidence.
- [ ] Rewrite model discovery to satisfy TEST-014 structurally and behaviorally. Preserve path
      traversal metadata and expose live proof only as `path.story` under TEST-015.
- [ ] Migrate package tests. Use stories for userland behavior, direct package-private seams only
      when actor/runtime internals are the subject, and Vitest TestClock helpers only for
      Effect-unit tests outside the story runner.

## Executable acceptance

- Story authoring and registration leave Layer, service, runtime, fixture, and control counters
  at zero.
- Fixture/control collisions and duplicate seeds fail before any acquisition.
- Two concurrent runs of the same plan share no ordinals, logs, waiters, subscriptions, or
  cancellation state.
- `call(1)` can complete before `call(0)` and both real primitive generations publish correctly.
- `.send(event).checkpoint("sent")` captures the acknowledged event turn while a deliberately
  blocked operation remains pending.
- `flush` drains ready work only; `settle` does not fire a future timer; explicit advance drives
  timers, freshness, GC, retries, and serialized work through one TestClock.
- Host cancellation and simultaneous cleanup failure preserve partial evidence and both Causes;
  every other successful run proves completed disposal.
- The pure model has no Effect import or `Effect.run*`, side-effect spies remain zero during
  discovery, and representative `path.story` runs match predicted paths.
- Packed declarations expose only the new public testing concepts and reject all legacy imports.

## Deletion obligations

After replacement proofs pass, delete or fully replace:

- `testing/test.ts`, `testing/flow-test.ts`, `testing/flow-test-builder.ts`,
  `testing/flow-stories.ts`, `testing/flow-story-test.ts`, `testing/focused-app.ts`,
  `testing/scenario-evidence.ts`, and the public runtime-backed harness;
- `testing/flow-test-progress-controls.ts`, `testing/flow-test-runtime-boot.ts`,
  `testing/flow-test-read-surface.ts`, legacy child/read helpers, and custom clock support;
- `testing/controlled-stream.ts` and the controlled-stream source/runtime;
- public `test`, `flowTest`, `runFlowScenario*`, `scenarioToReport`,
  `createScenarioEvidence`, mutable harness, `until*`, `advanceUntilIdle`, test-only
  retry/reset, and runner-specific debug exports;
- static `flowStories(...)`, expectation fields, model `replay`/`replayFlushed`, replay-only
  Layer/clock options, and synchronous Effect execution in `core/machines/flow-paths.ts`;
- module fixture metadata, production fixture registries, and fixture string lookup.

Capabilities such as pending-work diagnostics or normalized parity helpers may survive only
inside the new implementation with one owner and no legacy public vocabulary. No deprecated
alias survives phase closure.

## Exact gates

Create focused proof files with these owners, then run:

```sh
pnpm exec vp test packages/flow-state/src/story-plan.test.ts packages/flow-state/src/story-controls.test.ts packages/flow-state/src/story-runner.test.ts packages/flow-state/src/story-model.test.ts
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state test
pnpm --filter flow-state build
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
```

Also run a repository search proving the removed symbols and files are absent from live source,
tests, examples, built declarations, and package exports. The search result belongs in the
receipt; a zero exit from typecheck alone does not prove deletion.

## Receipt requirements

Write `reference/incident-console/implementation/receipts/PHASE_6_STORIES_AND_MODEL.md` with:

- prerequisite commit and every TEST/PROOF ID closed;
- final story command, fixture/control, result/error, checkpoint, and pending-work shapes;
- collision and run-isolation tables;
- send/ack/publish ordering evidence and cancellation/cleanup Exit evidence;
- TestClock timestamps proving settlement did not move future time;
- structural and behavioral pure-model proof plus path/live parity cases;
- exact deleted files, exports, aliases, and zero-match deletion search;
- every command with exit code and test count, diff names, skips, and remaining IDs.

The phase remains pending if any legacy public executor or model replay path remains.

## Live evidence

- `packages/flow-state/src/testing.ts:1-56` exposes the current overlapping surface.
- `packages/flow-state/src/testing/flow-stories.ts:81-112` owns the unscoped scenario path and
  product-status classification.
- `packages/flow-state/src/testing/runtime-backed-test-harness.ts:170-243` exposes mutable live
  access and manual disposal.
- `packages/flow-state/src/testing/flow-test-progress-controls.ts:164-195` advances future time
  during settlement.
- `packages/flow-state/src/core/machines/flow-paths.ts:1385-1402` and `:1612-1617` run Effects
  during model exploration.
- `reference/incident-console/DESIGN_DECISIONS.md:1198-1634` defines the consolidated target.
