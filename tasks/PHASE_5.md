# Phase 5 — Deletion, packed cutover, examples, and final correctness

[Back to the roadmap](../TASK.md)

Goal 5 closes the implementation. It may delete displaced code and align public
documentation, and it rebuilds reference applications against the final public
surface, but it does not introduce a new architecture or feature family.

You can reference the effect-v4 codebase to learn how to use a Effect feature: `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`.

Execution order is `P5.0`, the red-green application work in `P5.4`, `P5.1`,
`P5.2`, `P5.3`, `P5.5`, then `P5.6`. The new applications must expose actual
public callers before deletion decides that a surface is displaced; final packed
cutover and documentation use the corrected application suite rather than an
earlier speculative inventory.

## P5.0 — Independent-audit corrections

Phase 5 owns the defects found by the independent Phase 2-4 implementation
audit. Earlier phases remain complete; these are final-correctness corrections
that must close before deletion and packed cutover can establish the final
supported surface.

### [x] P5.0a Remove the bivariant transaction shadow

- Close [BUG-18T](./BUGS.md#reopened-bug-18t-the-identity-carrier-still-casts-into-the-bivariant-shadow).
- Replace the `FlowTransactionBinding` cast to
  `UnknownFlowTransactionDefinition` with one canonical runtime representation
  that does not restate callbacks through bivariance, `unknown`, or casts.
- Add hostile source and packed declaration witnesses that reject a narrower
  commit/preview/invalidation/route/queue callback at the carrier boundary while
  preserving exact Params, Value, Error, Requirements, Event, and selector input.

### [x] P5.0b Make boot v1 nested records strict

- Close [BUG-62](./BUGS.md#bug-62-boot-v1-nested-records-are-not-strict).
- Validate the documented fields and required discriminants of every nested
  resource, transaction, stream, timer, and child snapshot before any owner is
  mutated; unknown or contradictory fields must reject rather than be ignored.
- Add deterministic nested-family matrices for unknown and missing fields,
  absent versus present `undefined`, contradictory lifecycle states, invalid or
  non-finite facts, generations, and repeated hydration.

### [x] P5.0c Decompose and scope the function-output collector

- Close [BUG-63](./BUGS.md#bug-63-the-output-collector-crossed-the-decomposition-boundary).
- Split the Launch Workspace output collector by adapter family behind a small
  coordinator instead of extending the current 1,011-line `main` orchestration.
- Scope subscriptions, actors, and runtimes so normal completion and failed
  output writes finalize every acquired owner exactly once; add a deterministic
  failed-write cleanup regression.

## [x] P5.1 Delete displaced implementations

- Remove duplicate caches, actor/test engines, stream/timer/child owners,
  inspection builders, legacy shims, and obsolete exports/files with no
  supported callers.
- Prove static, dynamic, CLI, generated, example, package-export, and test callers
  before deleting. A bare search result is not sufficient for generated/CLI entry points.
- Remove legacy aliases and wire forms once the owning cutover criterion migrates
  callers or names an explicit wire exception.
- Delete dead branches and wrappers rather than leaving disconnected fallback paths.
- Cutover marker: deletion is the default for migrated aliases, shims, and old
  wire forms; retained exceptions must be named in the owning criterion.

## [x] P5.2 Packed public cutover

- Install the produced package into representative core-only, React 18, React
  19, testing, server, inspect, and Launch Workspace consumers.
- Prove supported root/subpath exports, peer behavior, ESM-only contract,
  environment neutrality, executable behavior, and exact declarations.
- Reject private/deep imports, private-name leakage, TS7056/excessive-depth
  failures, duplicate-package ownership aliasing, and type-erasing annotations.
- Package size, gzip, compiler timing, throughput, and growth statistics are not gates.
- Cutover marker: prove the produced package exposes only the supported public
  contract while preserving root/subpath, React 18/19, peer, ESM, and packed
  declaration behavior.

## [ ] P5.3 Documentation truth

- Close [BUG-65](./BUGS.md#bug-65-the-agent-workflow-cli-guide-is-stale).
- Document only shipped calls and executable behavior. Remove migration/run/phase
  vocabulary from durable user guidance.
- Keep API, testing, React, server, CLI application truth, environment support, and
  known limits aligned with live code.
- Prefer executable examples and docs build over tests that assert prose contains
  particular phrases.
- Cutover marker: docs name shipped calls only; migration notes may mention
  removed legacy aliases as historical context, not supported usage.

## [x] P5.4 Rebuild five reference applications

Rebuild the behaviors of five deliberately different TanStack Query React
examples as first-class Flow State applications under `examples/`. Treat the
upstream examples as behavioral references, not implementation templates: the
rebuilds must use Flow State and Effect ownership, must not depend on TanStack
Query at runtime, and must not add a parallel cache, transaction engine, or
hydration protocol to make the comparison work.

Every application must:

- Be an independently runnable workspace package with a focused README, public
  package-entry imports only, and no deep imports from `src/`.
- Follow the normal client boundaries in
  [`CLIENT_STRUCTURE_CONTRACT.md`](../CLIENT_STRUCTURE_CONTRACT.md): use
  `domain/`, `services/`, `features/<feature>/`, `app/`, `ui/`, and `testing/`,
  plus `server/` where a host boundary exists. Omit genuinely empty directories,
  but keep feature definitions, app assembly/runtime creation, React rendering,
  server ownership, and test fixtures in their prescribed owners. Each app must
  expose its assembled `BehaviorGateway` from `src/app/behavior.ts` so the
  standard CLI can load it without a custom path.
- Review each completed tree against the contract's responsibility and
  dependency-direction rules. Reject monolithic assembly, test-only definition
  copies, feature-owned runtimes, server/client boundary inversion, wildcard
  barrels that obscure ownership, and production imports from `testing/`.
- Name the exact upstream files it references and map each borrowed behavior to
  the Flow State owner that implements it. Explain intentional semantic
  differences instead of disguising them behind similar UI.
- Exercise the behavior through the visible application and through
  deterministic runtime and React tests. Replace upstream randomness, network
  access, wall-clock sleeps, and global state with controlled Effect services,
  layers, `Deferred`, and `TestClock` as appropriate.
- Include source and packed declaration witnesses for the public APIs it teaches,
  and participate in the normal workspace format, lint, test, build, and packed
  consumer verification.
- Record every confirmed library defect in `tasks/BUGS.md` before fixing or
  working around it. Link the bug from the example task and add a deterministic
  regression at the owning library boundary; an example-local workaround does
  not close the bug.
- If a required Flow State feature or API is broken, the example build may skip
  that blocked behavior only after recording it in `tasks/BUGS.md`; leave its
  task and coverage row incomplete until the library defect is fixed. the example still has to be built.

Use this TDD loop for each behavior:

1. Add a failing deterministic behavioral test through the public
   `flow-state/testing` entrypoint. React rendering tests may supplement this
   proof, but they do not replace production-runtime execution.
2. Make the smallest application implementation pass, then rerun the focused
   runtime and React tests.
3. When it helps explain or falsify the behavior, generate application truth
   through the packed `flow-state` CLI. This is optional in an individual
   red-green cycle, but generated evidence must come from the same app, gateway,
   stories, and runtime facts as the test.
4. Inspect and refactor the passing slice, log any confirmed library bug, and
   rerun its focused tests before starting the next behavior.

CLI coverage is mandatory at example closeout even though step 3 is optional
within a small TDD cycle. From the workspace root, build the executable with
`pnpm --filter flow-state build`; `packages/flow-state/package.json` and its
`bin.flow-state` field are the authority for what that build must emit. Every
example must depend on `flow-state` as a workspace/installed package, then invoke
the package-manager bin shim from that example with
`pnpm exec flow-state --help`. Do not call a repo-local source or compatibility
script, and do not use `pnpm --filter flow-state exec flow-state`, because a
package does not install its own bin shim for itself.

Use only these durable discovery commands through the consumer's bin shim:

- `flow-state --help`
- `flow-state behavior --help`
- `flow-state story --help`
- `flow-state trace --help`

After choosing the smallest relevant job, run that subcommand's own `--help`
and follow the live flags instead of copying commands from an older guide. Across
the suite, exercise one useful operation from each family, cover human and JSON
output, prove repeated output is deterministic, and prove typed non-success
output for a failing or invalid case. The CLI remains a host adapter and must
not own example semantics. Close
[BUG-64](./BUGS.md#bug-64-behavior-self-diff-reports-a-false-resource-change)
before accepting the declared-facts lane.

### [x] P5.4a Basic cached posts

- Reference
  `docs/codebases/tanstack-query/examples/react/basic/src/index.tsx`.
- Build `examples/basic-cached-posts` as the intentionally boring starting
  point: load a post list, open a keyed post detail, return to the list, and open
  the same detail again from cached data while a background refresh runs. Keep
  the application small enough that a new user can understand the complete
  Flow State setup without first learning transactions, hydration, or SSR.
- Use one small posts-screen machine for list/detail navigation and resource
  ownership. Its states invoke `flow.ensure` for the list or selected keyed
  detail; React sends navigation/refresh events and reads the actor, resource,
  and view without starting work from a hook.
- Prove initial loading, success, typed failure and retry, independent keyed
  detail caching, cached-data visibility during refresh, refresh replacement,
  navigation, and runtime cleanup with deterministic services rather than live
  HTTP or timing controls.
- Required Flow State coverage: `createKey`, `flow.resource`, `flow.ensure`,
  `flow.refresh`, `flow.machine`, `flow.view`,
  app/module/layer/runtime/store/orchestrator assembly, `FlowProvider`,
  `useActor`, `useResource`, `useView`, and the `flow-state/testing` app harness.
  Use its behavior gateway for the suite's packed declared-facts CLI proof.

### [x] P5.4b Optimistic transaction rollback

- Reference
  `docs/codebases/tanstack-query/examples/react/optimistic-updates-cache/src/pages/index.tsx`
  and its `src/pages/api/data.ts` fixture.
- Build `examples/optimistic-transactions` around `flow.transaction` preview,
  commit, rollback, invalidation, and refetch behavior rather than mutating an
  application-owned cache.
- Prove success, typed failure, cancellation, overlapping optimistic writes,
  exact rollback to the preceding visible layer, and rejection of stale
  completions with controlled gates rather than timing assumptions.
- Keep the editable entity in its canonical resource and apply explicit draft
  edits through `flow.patch`; the machine owns only editing/submission/feedback
  workflow state. Add an actor-owned `flow.after` timer that dismisses terminal
  feedback. Snapshot and rehydrate during that delay, then prove one firing at
  the remaining deadline. These behaviors must remain subordinate to the
  optimistic-write story rather than becoming a second application.
- Required Flow State coverage: `createTag`, `flow.machine`, `flow.patch`,
  `flow.after`, `flow.transaction`, `flow.outcomes`, `flow.run`,
  `flow.invalidate`, `flow.view`, `useActor`, `useView`, scenario execution and
  reports, transaction debug formatting, saved-trace evidence, and transaction
  overlap evidence. Its packed CLI proof owns reproducible story execution and
  saved runtime evidence.

### [x] P5.4c Bounded bidirectional feed

- Reference
  `docs/codebases/tanstack-query/examples/react/infinite-query-with-max-pages/src/pages/index.tsx`
  and its `src/pages/api/projects.ts` fixture.
- Build `examples/bounded-infinite-feed` with cursor-keyed resources and an
  explicit navigation/window owner. Keep at most three pages in the visible
  window without claiming that view-window eviction removes canonical resource
  data from the runtime.
- Prove forward and backward traversal, boundary cursors, the three-page window,
  deduplication, background refresh, typed page failure and retry, and that a
  stale completion for an evicted cursor cannot alter the current window.
- Required Flow State coverage: keyed `flow.resource`, `flow.ensure`,
  `flow.refresh`, `flow.machine`, guards and `flow.can`, `flow.view`,
  `useResource`, `useActor`, `useView`, model traversal/replay, behavior stories,
  `selectView` for deterministic non-React projection, graph/path generation,
  and no-transition explanations. Its packed CLI proof owns path discovery and
  exact-path checking.

### [x] P5.4d Server prefetch and client hydration

- Reference
  `docs/codebases/tanstack-query/examples/react/nextjs-app-prefetching/app/page.tsx`,
  `app/get-query-client.ts`, `app/providers.tsx`, and `app/pokemon-info.tsx`.
- Build `examples/server-prefetch-hydration` with a request-scoped server
  runtime, `dehydrateBoot`, `hydrateBoot`, and one stable client owner. Do not
  create runtimes during React render or share request state through a module
  singleton.
- Prove isolated concurrent requests, server-prefetched first render, atomic
  rejection of invalid boot input, deterministic repeated hydration, post-commit
  client ownership and cleanup, and supported React 18 and React 19 packed use.
- Required Flow State coverage: `withRequestRuntime`, runtime `dehydrateBoot`
  and `hydrateBoot`, `FlowProvider`, `useResource`, and testing rehydration. Use
  its live behavior contract as one side of the packed declared-facts comparison
  against another example, verifying deterministic human and JSON output.

### [x] P5.4e Offline recovery and queued work

- Reference
  `docs/codebases/tanstack-query/examples/react/offline/src/App.tsx` and
  `docs/codebases/tanstack-query/examples/react/offline/src/movies.ts`.
- Build `examples/offline-recovery` around cached reads, explicit connectivity,
  persisted boot data, and user work queued while offline. Model queued work as
  durable domain data and start a new transaction after reconnect; hydration
  must never pretend to resume an interrupted external effect.
- Prove cached availability while offline, boot round-trip of queued work,
  exactly-once draining across repeated reconnect signals, visible typed
  failure with retry, cancellation, and finalization of every acquired owner.
- Model host connectivity as a `flow.stream` backed by
  `createControlledStream` in tests. While online, the parent machine uses
  `flow.observe` for the movie resource and owns an outbox-draining
  `flow.child`. The child reads a declared durable outbox resource and service;
  do not invent child input, output, or failure routes absent from the public
  contract. Disconnect, replacement, retry, and shutdown must finalize the
  stream, observation, and child generations exactly once.
- Distinguish two queue cases: in-process offline work exercises the supported
  transaction queue/replay/undo contract, while work restored after boot is
  durable outbox data that starts a new transaction after reconnect. Never claim
  that hydration resumed an interrupted external effect.
- Required Flow State coverage: `flow.observe`, `flow.stream` pressure and stale
  generations, `flow.child` lifecycle/retry, queued `flow.transaction`, boot
  hydration, `useActor`, `useResource`, `useView`, controlled streams, test
  rehydration, scenario evidence/debug formatters, bounded application evidence,
  and trace artifact round-trip/comparison. Its packed CLI proof owns runtime
  evidence comparison and a focused proof slice.

P5.4 is complete only when all five examples run from their documented commands,
their deterministic tests pass, and the packed public cutover installs and
executes them as consumers of the produced package. The coverage decisions in
[`examples/FEATURE_COVERAGE.md`](../examples/FEATURE_COVERAGE.md) are acceptance
conditions: every `C` must resolve to visible example code plus a deterministic
test, CLI claim, or packed type witness as appropriate.

## [ ] P5.5 Final correctness closure

- Reconcile public exports, declarations, cutover corpus, owner map, known
  defects, behavior/type inventories, and dead-code inventory against live code.
- Run the full affected runtime, type, packed-client, Launch Workspace, and docs
  verification. Fix every correctness/type-safety blocker.
- Re-run every example's packed CLI acceptance, proving shared application
  truth, human/JSON parity, deterministic artifacts, and explicit non-success
  exits before accepting generated documentation.
- Review once for cutover contract, identity, ownership, Effect channels, stale
  generations, atomicity, finalization, adapter thinness, diagnostics, and docs truth.
- Feature deferral is valid only when the active public contract already permits
  it and names a later owner; correctness failures are not deferred.

## [ ] P5.6 Independent review and correction loop

Run this loop only after `P5.0` through `P5.5` and their full verification are
green. Each round starts from the current Git diff and live contracts, derives
its own acceptance claims, and reviews changed production owners plus direct
callers without relying on an earlier round's disposition.

Each review round must use a fresh reviewer that did not implement the slice it
is judging. The reviewer records findings and performs no product fix; the Phase
5 implementer applies and verifies corrections afterward. If a fresh reviewer
is unavailable, report that review round as blocked instead of relabeling an
implementer self-review as independent.

For each round:

1. Run a review-only thermo-nuclear audit. Try to falsify changed invariants with
   hostile deterministic runtime, cleanup, generation, capacity, source-type,
   packed-declaration, application-truth, and CLI text/JSON/failure probes.
   Record every confirmed defect in `BUGS.md` before changing product code.
2. Fix every blocking or presumptive-blocker finding under its Phase 5 owner,
   add the missing regression, and run focused verification followed by
   `pnpm fmt`, `pnpm lint`, and `pnpm verify`.
3. Commit the verified correction before starting the next round, then derive
   the next review from the new committed state rather than reusing the previous
   review model.

Complete three mandatory rounds:

- [ ] Review 5.1 audited the post-`P5.5` implementation, recorded its findings,
      and fixed and verified every blocker.
- [ ] Review 5.2 independently audited the corrected implementation, recorded
      its findings, and fixed and verified every blocker.
- [ ] Review 5.3 independently audited the corrected implementation, recorded
      its findings, and fixed and verified every blocker.

If Review 5.3 records any finding or its fixes change product code, public types,
wire behavior, ownership, lifecycle, generated output, or documentation, run one
final confirmation round:

- [ ] Review 5.4 independently audited the final corrected implementation and
      produced no unresolved blocking or presumptive-blocker finding. This row
      is not required only when Review 5.3 itself is clean and makes no changes.

## Final definition of done

- One semantic owner remains per capability and adapters contain no shadow engines.
- Exact Effect/Stream/Layer types and lifecycle/finalizer behavior are proved.
- Source, packed, runtime, wire, and environment contract checks agree.
- Supported documentation matches executable truth.
- Full affected verification passes without accepted failures.
- The `P5.6` review loop independently re-derives these claims across at least
  three rounds, and the final required round is clean before the roadmap is
  marked complete.
