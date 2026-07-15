# Phase 6 — Alpha feature and scenario coverage

[Back to Phase 6](./PHASE_6.md)

This ledger proves the alpha surface without turning `incident-console` into an
artificial feature inventory. Every shipped capability must be covered by the
flagship, a focused example, a package-level proof, or an explicit alpha limit.
Cross-feature scenarios then stress the real application, runtime, and testing
framework under sequences a production client must handle.

The visible components and human workflows are specified separately in
[the incident-console interaction contract](./PHASE_6_APP.md). Coverage evidence
must exercise those production interactions rather than a testing-only UI.

Before implementing `P6.2`, reconcile this table against the live exports from
`flow-state`, `flow-state/react`, `flow-state/testing`, `flow-state/server`,
`flow-state/inspect`, and the package CLI. Add any missing public capability; do
not declare the matrix complete from this initial inventory alone.

## Coverage rules

- Mark a row `Proved` only with links to executable source, packed, runtime, and
  adapter evidence appropriate to that surface. Prose and a rendered control are
  not proof.
- `Browser` evidence means the incident-console package's `@playwright/test`
  harness driving installed Chromium; root `pnpm test:browser` delegates to it.
  React unit tests, `happy-dom`, screenshots, or an agent's informal browser
  inspection may supplement but never replace it.
- Prefer `incident-console` when the capability belongs naturally to incident
  work. Route SSR/hydration, offline recovery, or an isolated edge to the focused
  example that owns it rather than adding a fake workflow to the flagship.
- `Package proof` is valid for hostile typing, identity, cleanup, and interleaving
  laws that would make application code obscure or unsafe. It must still exercise
  the shipped public entrypoint.
- An `Alpha limit` must be user-visible in `reference/status.mdx`; silence or an
  example-local workaround is not a disposition.

Status values are `Open`, `Proved`, or `Alpha limit`.

## Anti-coverage: forbidden shortcuts

The implementing AI must not mark a feature or scenario covered through any of
the shortcuts below. Reviewers treat their presence as a blocking finding even
when the relevant command exits successfully.

| Forbidden shortcut                                                                                                                                                | Why it is not coverage                                                                            | Required replacement                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pointing to a file, component, route, story declaration, screenshot, README paragraph, or green build                                                             | Existence proves neither behavior nor ownership                                                   | Execute the behavior through its public runtime and required adapter surfaces                                            |
| Using source-text, AST, or snapshot assertions as the only semantic proof                                                                                         | Text shape can remain stable while behavior is wrong, and snapshots hide missing assertions       | Assert domain result, canonical facts, failures, pending work, and cleanup; reserve source checks for architecture rules |
| Replacing fetch, EventSource, HTTP services, or the server with an in-process fake in flagship acceptance                                                         | It bypasses decoding, cancellation, status handling, reconnection, and process ownership          | Start the isolated API and cross a real socket                                                                           |
| Seeding Flow resources or mutating caches to claim a network workflow passed                                                                                      | It proves fixture installation rather than demand, refresh, invalidation, or transaction behavior | Arrange data through the server and drive public application inputs                                                      |
| Importing server handlers, repositories, seeds, another example package, private runtime modules, or test fixtures into production frontend code                  | It erases the ownership boundary the example exists to prove                                      | Share schemas only; call public package entries and the HTTP/SSE API                                                     |
| Reimplementing transitions, cache rules, transaction publication, stream lifecycle, or child ownership inside a test oracle, CLI gateway, or React component      | Agreement between two copied implementations is not independent evidence                          | Observe the single production owner and compare with an independent small model where needed                             |
| Asserting only final state, rendered text, HTTP 200, or “does not throw”                                                                                          | Intermediate preview, stale publication, diagnostics, Cause, and leaks can still be wrong         | Assert the relevant state sequence, receipts/issues, server authority, pending work, and finalizers                      |
| Adding explicit generics, casts, `any`, broad `unknown`, `@ts-ignore`, or duplicated state unions to make an API example compile                                  | It hides the inference or soundness failure under evaluation                                      | Fix or log the library boundary and keep hostile source and packed negatives                                             |
| Using sleeps, retry-until-pass loops, unseeded randomness, oversized timeouts, or unordered snapshots                                                             | The result becomes timing-dependent and cannot shrink to a useful failure                         | Use Deferred gates, TestClock, server controls, bounded seeded schedules, and explicit order assertions                  |
| Calling repo-local CLI sources, importing workspace source from a packed consumer, or hand-editing generated evidence                                             | It bypasses the artifact users install                                                            | Install the tarball, invoke the consumer bin shim, and regenerate evidence from the shipped entrypoints                  |
| Adding production branches or UI controls that exist only to satisfy tests or invoke `/__dev/*`                                                                   | The test path is no longer the user path                                                          | Keep controls in the external scenario driver and drive the same production UI and services                              |
| Letting one happy path stand in for a feature family, marking unchecked behavior “implicitly covered,” or closing a row because a neighboring package test passed | Coverage becomes an assertion without a falsifiable obligation                                    | Link each row to its own relevant evidence or approve and document an alpha limit                                        |
| Ignoring console errors, unhandled rejections, open handles, pending work, duplicate finalization, or nonzero CLI exits after the main assertion                  | Cleanup and diagnostics are part of the public contract                                           | Fail the scenario and prove clean termination and expected exit status                                                   |

## Feature coverage matrix

| Family          | Public capability                                                                                                          | Executable evidence                                                                                                                                                                                                                                                                                                                                              | Status |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Composition     | `app`, `module`, Layers, fixtures, inventory, and `BehaviorGateway`                                                        | [app assembly](../examples/incident-console/src/app/app.ts), [production behavior gateway](../examples/incident-console/src/app/behavior.ts), [runtime tests](../examples/incident-console/src/testing/incident-runtime.test.ts), and [consumer-bin CLI proof](../examples/incident-console/scripts/cli-evidence.mjs) use the same owners.                       | Proved |
| Runtime         | `runtime`, `store`, `orchestrators`, scoped disposal, flush, and host cleanup                                              | [runtime recreation and disposal](../examples/incident-console/src/testing/incident-runtime.test.ts), [Strict Mode ownership](../examples/incident-console/src/testing/incident-react.test.tsx), and [browser teardown/restart](../examples/incident-console/tests/browser/advanced.spec.ts).                                                                    | Proved |
| Identity        | `createKey`, `createTag`, refs, descriptor identity, and exact/tag matching                                                | [incident resources](../examples/incident-console/src/features/incidents/resources.ts), [shared-demand React proof](../examples/incident-console/src/testing/incident-react.test.tsx), and [descriptor-scoped package regressions](../packages/flow-state/src/runtime.test.ts).                                                                                  | Proved |
| Resources       | `resource`, `ensure`, `observe`, keyed cache, demand deduplication, and stale reads                                        | [list/detail resources](../examples/incident-console/src/features/incidents/resources.ts), [runtime scenarios](../examples/incident-console/src/testing/incident-runtime.test.ts), [React demand proof](../examples/incident-console/src/testing/incident-react.test.tsx), and [browser workflows](../examples/incident-console/tests/browser/ordinary.spec.ts). | Proved |
| Resource writes | `refresh`, `invalidate`, `patch`, selection, and freshness facts                                                           | [incident machine](../examples/incident-console/src/features/incidents/machine.ts), [transaction invalidation](../examples/incident-console/src/features/incidents/transactions.ts), [runtime facts](../examples/incident-console/src/testing/incident-runtime.test.ts), and basic-posts package gates.                                                          | Proved |
| Transactions    | `transaction`, `run`, optimistic preview, commit, rollback, invalidation, and routed outcomes                              | [assignment/status transactions](../examples/incident-console/src/features/incidents/transactions.ts), [real 409 runtime proof](../examples/incident-console/src/testing/incident-runtime.test.ts), and [two-tab browser conflict](../examples/incident-console/tests/browser/advanced.spec.ts).                                                                 | Proved |
| Concurrency     | Allow, serialize, cancel/restart, overlap, stale-publication suppression, and bounded queues                               | [repeated-action and navigation proofs](../examples/incident-console/src/testing/incident-runtime.test.ts), [browser interleavings](../examples/incident-console/tests/browser/advanced.spec.ts), and package transaction oracle suites under [`packages/flow-state/src`](../packages/flow-state/src).                                                           | Proved |
| Machines        | `machine`, `can`, guards, updates, reentry, dynamic bindings, and exact state/event inference                              | [queue/detail machine](../examples/incident-console/src/features/incidents/machine.ts), [why-no-transition and model proof](../examples/incident-console/src/testing/incident-runtime.test.ts), plus ceremony and packed type gates.                                                                                                                             | Proved |
| Outcomes        | `outcomes` and typed success, failure, defect, interruption routing                                                        | [HTTP schemas](../examples/incident-console/src/domain/incidents.ts), [routed machine owners](../examples/incident-console/src/features/incidents/machine.ts), [runtime failure assertions](../examples/incident-console/src/testing/incident-runtime.test.ts), and [browser fault cases](../examples/incident-console/tests/browser/advanced.spec.ts).          | Proved |
| Timers          | `after`, timer cancellation, retry timing, restore, and TestClock control                                                  | [runbook retry owner](../examples/incident-console/src/features/incidents/runbook.ts), [TestClock/restore/disposal proof](../examples/incident-console/src/testing/incident-runtime.test.ts), and package timer proofs.                                                                                                                                          | Proved |
| Streams         | `stream`, pressure policy, typed routes, interruption, and stale-generation suppression                                    | [timeline stream](../examples/incident-console/src/features/incidents/timeline.ts), [runtime dedupe/gap/retention proof](../examples/incident-console/src/testing/incident-runtime.test.ts), and [real SSE replay/replacement/burst browser proof](../examples/incident-console/tests/browser/advanced.spec.ts).                                                 | Proved |
| Children        | `child`, input/output/failure, retry, replacement, cancellation, and child inspection                                      | [runbook child](../examples/incident-console/src/features/incidents/runbook.ts), [runtime child/timer proof](../examples/incident-console/src/testing/incident-runtime.test.ts), and [failure/replacement/cancel browser proof](../examples/incident-console/tests/browser/advanced.spec.ts).                                                                    | Proved |
| Views           | `view`, `selectView`, derived state, and subscription equality                                                             | [incident view](../examples/incident-console/src/features/incidents/view.ts), [runtime view assertions](../examples/incident-console/src/testing/incident-runtime.test.ts), and [production React consumers](../examples/incident-console/src/ui/IncidentConsole.tsx).                                                                                           | Proved |
| React           | `FlowProvider`, `useActor`, `useResource`, and `useView`                                                                   | [production runtime boundary](../examples/incident-console/src/ui/FlowRoot.tsx), [Strict Mode/multi-subscriber proof](../examples/incident-console/src/testing/incident-react.test.tsx), browser workflows, and packed React 18/19 consumers.                                                                                                                    | Proved |
| Server          | `withRequestRuntime`, boot payloads, dehydrate/hydrate, and request isolation                                              | [request boot owner](../examples/server-prefetch-hydration/src/server/request-boot.ts), [runtime proof](../examples/server-prefetch-hydration/src/testing/hydration-runtime.test.ts), and [React hydration proof](../examples/server-prefetch-hydration/src/testing/hydration-react.test.tsx).                                                                   | Proved |
| Testing         | `test.app`, scenarios, fixtures, input, cache, receipts, issues, pending work, timers, transactions, streams, and children | [production-owner fixtures and scenarios](../examples/incident-console/src/testing/incident-runtime.test.ts) prove direct-runtime/public-harness parity, receipts, issues, pending work, virtual time, streams, transactions, and children.                                                                                                                      | Proved |
| Models          | Model/path traversal, seeded property schedules, rehydration, and shrinking                                                | [seeded FastCheck/model schedules](../examples/incident-console/src/testing/incident-runtime.test.ts) and independent transaction/stream oracle suites under [`packages/flow-state/src`](../packages/flow-state/src).                                                                                                                                            | Proved |
| Inspection      | Behavior contracts/diffs, stories, graphs, traces, diagnostics, retention, and human/JSON rendering                        | [behavior stories](../examples/incident-console/src/app/behavior.ts), [trace export](../examples/incident-console/src/ui/DiagnosticsDrawer.tsx), [deterministic CLI evidence](../examples/incident-console/scripts/cli-evidence.mjs), and burst browser proof.                                                                                                   | Proved |
| CLI             | Consumer bin shim and `behavior`, `story`, and `trace` commands                                                            | [package-local deterministic/fail-closed proof](../examples/incident-console/scripts/cli-evidence.mjs) plus the [suite packed-consumer acceptance](../scripts/check-example-cli-acceptance.mjs).                                                                                                                                                                 | Proved |
| Packaging       | Root, React, testing, server, inspect, package metadata, and optional peers                                                | [P6.4 alpha-readiness receipt](./receipts/phase-6-alpha-readiness.md), exact-artifact [release owner](../packages/flow-state/scripts/prepare-alpha-release.mjs), and [strict consumer matrix](../packages/flow-state/scripts/check-packed-consumers.mjs).                                                                                                        | Proved |

## Required stress scenarios

Each scenario needs a short domain name, deterministic setup, the public events or
network actions, expected semantic state, expected receipts/issues/pending work,
and cleanup assertions. Use server controls only to arrange external conditions;
never call them from production frontend code.

| ID  | Scenario                          | Executable evidence                                                                                                                                                                              | Status |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| S1  | Rapid queue churn                 | [runtime schedules](../examples/incident-console/src/testing/incident-runtime.test.ts) and [browser queue churn](../examples/incident-console/tests/browser/ordinary.spec.ts)                    | Proved |
| S2  | Shared demand and exact identity  | [Strict Mode consumers](../examples/incident-console/src/testing/incident-react.test.tsx) and [package descriptor regressions](../packages/flow-state/src/runtime.test.ts)                       | Proved |
| S3  | Stale value under refresh failure | [cached-detail 503 browser scenario](../examples/incident-console/tests/browser/advanced.spec.ts) and runtime freshness facts                                                                    | Proved |
| S4  | Detail disappears                 | [remove-before-detail browser scenario](../examples/incident-console/tests/browser/advanced.spec.ts) and runtime 404 routing                                                                     | Proved |
| S5  | Competing optimistic editors      | [runtime conflict proof](../examples/incident-console/src/testing/incident-runtime.test.ts) and [two-context real 409](../examples/incident-console/tests/browser/advanced.spec.ts)              | Proved |
| S6  | Mutation during navigation        | [navigation/completion runtime schedule](../examples/incident-console/src/testing/incident-runtime.test.ts) and browser detail switching                                                         | Proved |
| S7  | Server event during preview       | [delayed mutation plus external SSE](../examples/incident-console/tests/browser/advanced.spec.ts) and transaction trace assertions                                                               | Proved |
| S8  | SSE replay and pressure           | [dedupe/gap/retention runtime proof](../examples/incident-console/src/testing/incident-runtime.test.ts) and [real SSE burst/replay](../examples/incident-console/tests/browser/advanced.spec.ts) | Proved |
| S9  | Stream replacement race           | [old-stream late-event browser scenario](../examples/incident-console/tests/browser/advanced.spec.ts) and runtime pending-work assertions                                                        | Proved |
| S10 | Runbook replacement and cancel    | [runbook lifecycle runtime proof](../examples/incident-console/src/testing/incident-runtime.test.ts) and [replacement/cancel race](../examples/incident-console/tests/browser/advanced.spec.ts)  | Proved |
| S11 | Retry and timer ownership         | [public test.app/TestClock/restore proof](../examples/incident-console/src/testing/incident-runtime.test.ts)                                                                                     | Proved |
| S12 | Runtime teardown and recreation   | [two-generation teardown browser scenario](../examples/incident-console/tests/browser/advanced.spec.ts), runtime disposal, and Strict Mode proof                                                 | Proved |
| S13 | Testing parity                    | [direct-runtime and test.app parity](../examples/incident-console/src/testing/incident-runtime.test.ts)                                                                                          | Proved |
| S14 | Model and property stress         | [seeded generated filter schedules](../examples/incident-console/src/testing/incident-runtime.test.ts) plus package independent interleaving oracles                                             | Proved |
| S15 | Evidence determinism              | [human/JSON double-run and typed failure proof](../examples/incident-console/scripts/cli-evidence.mjs) plus packed suite gate                                                                    | Proved |
| S16 | Malformed server payload          | [schema-invalid detail browser scenario](../examples/incident-console/tests/browser/advanced.spec.ts) and typed decoder diagnostics                                                              | Proved |
| S17 | Empty and shifting result sets    | [stable cursor store proof](../examples/incident-console/server/store.test.ts) and [empty/shifted browser workflows](../examples/incident-console/tests/browser/advanced.spec.ts)                | Proved |
| S18 | Two live operator tabs            | [two-context SSE plus stale edit](../examples/incident-console/tests/browser/advanced.spec.ts)                                                                                                   | Proved |
| S19 | Unsupported and repeated actions  | [double-submit and why-no-transition runtime proof](../examples/incident-console/src/testing/incident-runtime.test.ts)                                                                           | Proved |
| S20 | API process restart               | [isolated API restart with request, SSE, child, and timer active](../examples/incident-console/tests/browser/advanced.spec.ts)                                                                   | Proved |
| S21 | Inspection under event burst      | [runtime bounded history](../examples/incident-console/src/testing/incident-runtime.test.ts), [browser burst](../examples/incident-console/tests/browser/advanced.spec.ts), and CLI trace proof  | Proved |

## Clean implementation constraints

- Scenario files describe domain workflows, not library feature names. Keep one
  production definition per capability and reuse it across runtime, React, browser,
  testing, inspection, and CLI evidence.
- Test helpers may start/reset the server, arm a fault, drive public UI/events,
  and format evidence. They may not calculate expected Flow transitions, mutate
  runtime internals, reproduce cache/transaction/stream ownership, or import
  production code from `testing/`.
- Keep scenario setup, actions, and assertions separate. Shared helpers need one
  clear responsibility; reject a monolithic harness that hides scheduling,
  cleanup, or network actions behind an opaque `runEverything()` call.
- Bound every stress input by count or virtual time. Use explicit gates, seeded
  schedules, TestClock, and shrinkable generators rather than wall-clock sleeps,
  random network delay, or nondeterministic load tests.
- A scenario that exposes awkward API ceremony, duplicated state, a testing-only
  path, or a semantic mismatch becomes a `tasks/BUGS.md` row or reopens `P6.1`.

## Completion gate

`P6.2` is complete only when every feature row is `Proved` or an approved
`Alpha limit`, every scenario passes through its named surfaces, coverage links
resolve to live evidence, and the flagship tree passes the Phase 5 application
structure review without test-only owners or frontend data mocks. A final
anti-coverage audit must find none of the forbidden shortcuts above.
