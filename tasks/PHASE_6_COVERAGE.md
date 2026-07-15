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

| Family          | Public capability                                                                                                          | Required alpha evidence                                                                                                    | Planned owner                                           | Status |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| Composition     | `app`, `module`, Layers, fixtures, inventory, and `BehaviorGateway`                                                        | Independently runnable package whose runtime, tests, CLI, and docs use one assembled app                                   | Incident console                                        | Open   |
| Runtime         | `runtime`, `store`, `orchestrators`, scoped disposal, flush, and host cleanup                                              | Boot, run, dispose, and recreate without pending work or duplicate finalization                                            | Incident console plus package lifecycle proofs          | Open   |
| Identity        | `createKey`, `createTag`, refs, descriptor identity, and exact/tag matching                                                | Multiple incident IDs, equal keys under different descriptors, exact invalidation isolation, and packed identity negatives | Incident console plus package identity proofs           | Open   |
| Resources       | `resource`, `ensure`, `observe`, keyed cache, demand deduplication, and stale reads                                        | List/detail navigation, two subscribers to one ref, cached revisit, background refresh, and last-subscriber cleanup        | Incident console                                        | Open   |
| Resource writes | `refresh`, `invalidate`, `patch`, selection, and freshness facts                                                           | Exact and tag invalidation, refresh failure with cached value, selected projections, and visible freshness/diagnostics     | Incident console plus basic posts                       | Open   |
| Transactions    | `transaction`, `run`, optimistic preview, commit, rollback, invalidation, and routed outcomes                              | Assignment/status mutation with visible preview, success, typed 409 rollback/reconcile, and authoritative refetch          | Incident console                                        | Open   |
| Concurrency     | Allow, serialize, cancel/restart, overlap, stale-publication suppression, and bounded queues                               | Same-incident and different-incident writes with controlled completion order and no leaked preview or route                | Incident console plus package interleaving proofs       | Open   |
| Machines        | `machine`, `can`, guards, updates, reentry, dynamic bindings, and exact state/event inference                              | Queue/detail workflow without states per ID/cursor, rejected-event explanation, and source/packed negative typing          | Incident console plus ceremony examples                 | Open   |
| Outcomes        | `outcomes` and typed success, failure, defect, interruption routing                                                        | HTTP success, 404/409/503, cancelled request, stream defect, and child failure use one emitted vocabulary                  | Incident console                                        | Open   |
| Timers          | `after`, timer cancellation, retry timing, restore, and TestClock control                                                  | Bounded retry/backoff whose stale timer cannot fire after state exit, replacement, or disposal                             | Incident console runtime test plus package timer proofs | Open   |
| Streams         | `stream`, pressure policy, typed routes, interruption, and stale-generation suppression                                    | Real SSE timeline, bounded burst, disconnect/reconnect, replay, replacement, and final unsubscribe                         | Incident console                                        | Open   |
| Children        | `child`, input/output/failure, retry, replacement, cancellation, and child inspection                                      | Runbook start, progress, failure, cancel, replace, late old completion, and parent disposal                                | Incident console                                        | Open   |
| Views           | `view`, `selectView`, derived state, and subscription equality                                                             | Queue/detail/runbook read models derived from canonical owners without receipt-history product state                       | Incident console                                        | Open   |
| React           | `FlowProvider`, `useActor`, `useResource`, and `useView`                                                                   | Visible workflows, multiple subscribers, rerender isolation, Strict Mode, unmount, and provider disposal                   | Incident console plus React 18/19 consumers             | Open   |
| Server          | `withRequestRuntime`, boot payloads, dehydrate/hydrate, and request isolation                                              | Request-scoped prefetch and client hydration with no cross-request ownership                                               | Server-prefetch-hydration recipe                        | Open   |
| Testing         | `test.app`, scenarios, fixtures, input, cache, receipts, issues, pending work, timers, transactions, streams, and children | Flagship scenarios use production owners and expose actionable failure evidence without a testing interpreter              | Incident console plus package parity proofs             | Open   |
| Models          | Model/path traversal, seeded property schedules, rehydration, and shrinking                                                | Independent oracle finds invalid transitions or stale publication and prints a reproducible smallest schedule              | Package proof using flagship machines where practical   | Open   |
| Inspection      | Behavior contracts/diffs, stories, graphs, traces, diagnostics, retention, and human/JSON rendering                        | Same flagship gateway produces deterministic behavior, story, and trace evidence with one typed failure case               | Incident console                                        | Open   |
| CLI             | Consumer bin shim and `behavior`, `story`, and `trace` commands                                                            | Packed consumer invokes the installed bin, proves deterministic human/JSON output, and returns nonzero for invalid input   | Incident console plus suite acceptance                  | Open   |
| Packaging       | Root, React, testing, server, inspect, package metadata, and optional peers                                                | Clean tarball consumers execute every supported entrypoint under the declared compatibility matrix                         | P6.4 package matrix                                     | Open   |

## Required stress scenarios

Each scenario needs a short domain name, deterministic setup, the public events or
network actions, expected semantic state, expected receipts/issues/pending work,
and cleanup assertions. Use server controls only to arrange external conditions;
never call them from production frontend code.

| ID  | Scenario                          | Required stress and expected result                                                                                                                                                           | Evidence surfaces                           |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| S1  | Rapid queue churn                 | Change filters and cursors while older list requests remain in flight; only the current identity may publish and the cursor chain must not loop or duplicate rows                             | Runtime, React, browser                     |
| S2  | Shared demand and exact identity  | Mount two consumers of one detail, open another descriptor with an equal key, unmount in both orders, and invalidate only one exact ref                                                       | Runtime, React, package identity negative   |
| S3  | Stale value under refresh failure | Revisit cached detail, show the stale value during refresh, receive a real 503, retain the value with typed failure facts, then recover without a duplicate demand                            | Runtime, browser, trace                     |
| S4  | Detail disappears                 | Delete or hide an incident after the list load but before detail completes; resolve 404 into a coherent empty/not-found state without stale detail or retry loop                              | Runtime, React, browser                     |
| S5  | Competing optimistic editors      | Send two PATCH requests with one `expectedVersion`; one commits, one receives 409, and its preview rolls back or reconciles without erasing the winner                                        | Runtime, browser, transaction trace         |
| S6  | Mutation during navigation        | Start an optimistic write, change filters or detail, then cancel or complete it; no preview, route, invalidation, or UI feedback may publish to the wrong incarnation                         | Runtime, React, model schedule              |
| S7  | Server event during preview       | Deliver an SSE update for the same incident while an optimistic transaction is pending; define and prove merge, conflict, rollback, and final server authority                                | Runtime, browser, story                     |
| S8  | SSE replay and pressure           | Send duplicates, a reconnect replay, an event-ID gap, and a bounded burst; process each accepted event once, report the gap, obey pressure policy, and retain bounded history                 | Runtime, browser, trace                     |
| S9  | Stream replacement race           | Switch details during disconnect/reconnect so the old stream emits late; only the current stream may update state and every subscription must finalize once                                   | Runtime, React, pending-work proof          |
| S10 | Runbook replacement and cancel    | Replace a running child, let the old server job complete late, cancel the new child while the server races to success, and preserve one current terminal outcome                              | Runtime, browser, child tree/trace          |
| S11 | Retry and timer ownership         | Retry one 503 with a controlled timer, exit before it fires, restore once, and dispose; stale timers must not issue HTTP calls or keep the harness non-idle                                   | `test.app`, TestClock, pending work         |
| S12 | Runtime teardown and recreation   | Dispose with an HTTP request, SSE subscription, transaction, timer, and child active, then recreate the same app; all old work finalizes once and cannot publish into the new runtime         | Runtime, React, inspection                  |
| S13 | Testing parity                    | Run one browse, conflict, and runbook sequence through the direct production runtime and public testing facade; snapshots, receipts, issues, Cause, and pending-work truth must agree         | Direct runtime, `test.app`, scenario report |
| S14 | Model and property stress         | Generate bounded event/interleaving schedules for navigation, mutation, reconnect, cancellation, and replacement against an independent model; failures must shrink to a replayable seed      | Model/property test, trace artifact         |
| S15 | Evidence determinism              | Run behavior, story, and trace commands twice in human and JSON modes, then run malformed gateway and impossible-story cases; successful bytes match and failures are typed and nonzero       | Packed CLI                                  |
| S16 | Malformed server payload          | Return 200 with a schema-invalid list, detail, mutation, or SSE payload; decoding must fail explicitly without partially publishing data or corrupting the previous good snapshot             | Runtime, browser, diagnostics               |
| S17 | Empty and shifting result sets    | Apply a filter with no results, traverse the final cursor, then insert or remove incidents between pages; navigation remains usable and stable cursors do not duplicate or loop rows          | Runtime, React, browser                     |
| S18 | Two live operator tabs            | Open the same incident in two browser contexts, update it in one, receive the SSE change in both, then submit a stale edit in the other and reconcile the real 409                            | Browser, transaction/stream trace           |
| S19 | Unsupported and repeated actions  | Derive control availability from canonical machine truth, double-submit an allowed action, and attempt a rejected event; no hidden transition or duplicate external write occurs              | React, runtime, why-no-transition evidence  |
| S20 | API process restart               | Restart the API during an active request, SSE subscription, and runbook; surface degraded state, stop stale work, reconnect or retry explicitly, and recover without duplicate jobs           | Browser, runtime, pending-work proof        |
| S21 | Inspection under event burst      | Produce a bounded high-volume timeline while inspection retention truncates; product state remains correct, the gap is explicit, and behavior/trace rendering stays bounded and deterministic | Runtime, inspection, packed CLI             |

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
