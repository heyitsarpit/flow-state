# Phase 6: Stories, fixtures, controls, checkpoints, and pure model paths

Status: waiting on Phase 5

## Prerequisites and contract IDs

Phases 1-5 must provide the compiled app graph, exact refs, generation-safe resource and
transaction kernels, one ManagedRuntime owner, idempotent disposal, and host/root authority.
Phase 2 specifically owns the Queue mailbox and package-private acknowledged dispatch consumed
by the runner; Phase 5 does not reimplement that seam.

This phase implements API-013 through API-016, API-013A, TYPE-014 through TYPE-017, ARCH-020,
ARCH-021,
WIRE-021 through WIRE-024, TEST-001 through TEST-006, TEST-008 through TEST-015, TEST-018,
and CUT-007 while consuming SEM-006, TEST-007, and CUT-006. `PROOF-001` through `PROOF-011` and
`PROOF-017` govern the relevant testing work; the receipt closes only their Phase 0-assigned
Phase 6 subcase IDs. Checkpoint evidence
MUST preserve SNAP-001 through SNAP-010 without adding receipt history to actor snapshots.
TEST-016 inspection retention and artifact/CLI integration remain Phase 7 work.

## Allowed scope

- pure story, fixture, control, checkpoint, start, inferred run-result shapes, and the sole named
  `FlowStoryExecutionError` runtime class;
- story compiler and immutable command builder;
- run-local fixture/control instantiation and the single scoped story runner;
- pending-work lifetime inventory and TestClock progress commands;
- pure model discovery from command-empty base stories and `path.story` conversion;
- migration of package-owned tests from legacy harnesses to stories or lower-level internal
  runtime seams;
- package-owned compile/type-performance fixtures and their deterministic threshold script;
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

## Implementation hints (non-normative)

ARCH-028 recommends one acquire/use/release runner, the production runtime with Effect TestClock,
the shared duration normalizer, and exhaustive matching over the closed command AST. Story and
model construction remain inert plain TypeScript; these recommendations do not constrain an
equivalent implementation that satisfies the same tests.

## Tasks

- [ ] Implement the TEST-001/002 immutable story AST and builder. Bind app and machine at
      construction, accumulate literal checkpoint keys, reject duplicate checkpoint names, and
      keep all commands inspectable before execution.
- [ ] Prove `story`, `fixture`, `control`, `model`, `behavior`, and `FlowStoryExecutionError`
      import from `flow-state/testing`, while the root route rejects all six.
- [ ] Implement the exclusive fresh/boot start union from TEST-003, including boot actor
      selection diagnostics and app/machine reachability validation. Fresh starts use the
      production definition memory factory once when present, otherwise using empty memory,
      before shallow memory override; boot starts never invoke it and public snapshots are rejected.
- [ ] Implement `fixture` from `flow-state/testing` and pure fixture graph compilation. Apply TEST-004/005 definition
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
- [ ] Implement checkpoint and final capture as the one `DehydrateBarrier` evidence cut from TEST-008.
      Implement the package-owned `FlowStoryExecutionError` envelope, partial evidence, ordered cleanup
      diagnostics, AbortSignal handling, and non-abortable cleanup from TEST-009 through TEST-011. Keep receipt, trace, and
      inspection history out of actor snapshots and checkpoint roots.
- [ ] Expose the exact frozen error class from API-013A and validate non-negative safe-integer
      time, forward-only `setTime`, no-next-timer failure, equal deadlines, and positive safe-integer
      `maxTurns` before acquisition where applicable.
- [ ] Accept Effect `Duration.Input` for `advance`, normalize it while constructing the immutable
      story plan, and keep `setTime` restricted to forward non-negative safe-integer epoch
      milliseconds.
- [ ] Replace progress controls with TEST-012/013 lifetime inventories. Remove aggregate fibers,
      per-command bounds, implicit timer jumps, arbitrary predicates, and waiting for continuing
      work.
- [ ] Make behavior registration point directly to immutable story definitions without changing
      execution. Keep stories expectation-free; host tests assert returned evidence.
- [ ] Rewrite model discovery to accept only a command-empty base story. Make each programmatic
      traversal call solely own its concrete typed candidates; fixture compilation may read seeds
      but never controls, outcomes, registered stories, or CLI data. Preserve traversal metadata
      and expose live proof only as `path.story` under TEST-014/015.
- [ ] Migrate package tests. Use stories for userland behavior, direct package-private seams only
      when actor/runtime internals are the subject, and Vitest TestClock helpers only for
      Effect-unit tests outside the story runner.
- [ ] Add small, medium, and large story/model compile fixtures plus the package-owned
      `check:type-performance` command. Record TypeScript extended diagnostics and enforce the
      checked-in type/instantiation ceilings and growth ratio; record wall time and peak memory as
      non-gating trend evidence.
- [ ] Prove the new story/fixture/control/model/behavior owners through private packed fixtures;
      keep the public testing route unchanged until the all-route Phase 7 switch.

## Executable acceptance

- Story authoring and registration leave Layer, service, runtime, fixture, and control counters
  at zero.
- Fresh story starts invoke a present definition memory factory once, or use empty memory, and
  apply their override before the first checkpoint; boot starts invoke it zero times, and public
  snapshot starts do not exist.
- Fixture/control collisions and duplicate seeds fail before any acquisition.
- Two concurrent runs of the same plan share no ordinals, logs, waiters, subscriptions, or
  cancellation state.
- `call(1)` can complete before `call(0)` and both real primitive generations publish correctly.
- `.send(event).checkpoint("sent")` captures the acknowledged event turn while a deliberately
  blocked operation remains pending.
- `flush` drains ready work only; `settle` does not fire a future timer; explicit advance drives
  timers, freshness, GC, retries, and serialized work through one TestClock.
- `advance("250 millis")` and the other legal Duration inputs normalize during plan construction;
  invalid durations fail synchronously before any fixture or runtime exists, while `setTime`
  remains an absolute safe-integer epoch millisecond.
- Host cancellation and simultaneous cleanup failure preserve partial evidence, ordered diagnostics, and
  accepted evidence-sequence facts; every other successful run proves completed disposal. Full Effect Cause
  remains package-private.
- The pure model has no Effect import or `Effect.run*`, side-effect spies remain zero during
  discovery, and representative final and prefix `path.story` runs match predicted snapshots
  without generated checkpoint names.
- Packed declarations expose `FlowStoryExecutionError` as the sole named testing runtime class;
  result and path shapes remain inferred, and legacy or replacement aliases fail to import.
- Small, medium, and large story/model compile fixtures pass the package type-performance ceiling
  without superlinear type-instantiation growth.

## Deletion obligations

After replacement proofs pass, record these legacy owners for atomic deletion in Phase 7; Phase 6
removes them only from the package-private vNext tree:

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
inside the new implementation with one owner. No deprecated alias may enter the package-private
vNext tree; the unchanged legacy testing route remains frozen through Phase 6.

## Exact gates

Create focused proof files with these owners, then run:

```sh
pnpm exec vp test packages/flow-state/src/story-plan.test.ts packages/flow-state/src/story-controls.test.ts packages/flow-state/src/story-runner.test.ts packages/flow-state/src/story-model.test.ts
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state test
pnpm --filter flow-state build
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
pnpm --filter flow-state check:type-performance
```

Also run a repository search proving the removed symbols and files are absent from live source,
tests, examples, built declarations, and package exports. The search result belongs in the
receipt; a zero exit from typecheck alone does not prove deletion.

## Receipt requirements

Write `reference/incident-console/implementation/receipts/PHASE_6.md` with:

- prerequisite commit and every TEST/PROOF ID closed;
- final story command, fixture/control, inferred result/error, checkpoint, and pending-work shapes;
- collision and run-isolation tables;
- send/ack/publish ordering evidence and cancellation/cleanup Exit evidence;
- TestClock timestamps proving settlement did not move future time;
- structural and behavioral pure-model proof, candidate ownership, and final/prefix live parity;
- type-performance fixture sizes, wall times, type/instantiation counts, memory, and ceiling;
- exact deleted files, exports, aliases, and zero-match deletion search;
- every command with exit code and test count, diff names, skips, and remaining IDs.

The phase remains pending if any legacy executor or model replay path is reachable from the
package-private vNext tree. The unchanged legacy public testing route remains the sole public
implementation until the atomic Phase 7 cutover.
