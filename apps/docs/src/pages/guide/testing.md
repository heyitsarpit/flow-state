# Testing

Put each fact in the smallest lane that owns it, because service semantics,
runtime ownership, and browser behavior fail for different reasons.

| Fact                                                       | Lane                                                 | Maintained example                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Effect services and typed failures                         | direct Effect or `@effect/vitest` test               | `examples/basic-cached-posts/src/services`                               |
| Resources, transactions, streams, timers, and child actors | `test(machine)` or `test.app(App).scenario(machine)` | `examples/offline-recovery/src/testing/offline-runtime.test.ts`          |
| Guard-aware paths                                          | `test.model(machine)` and `graphOf(machine)`         | `examples/bounded-infinite-feed/src/testing/feed-runtime.test.ts`        |
| React rendering and interaction                            | happy-dom component test                             | `examples/optimistic-transactions/src/testing/optimistic-react.test.tsx` |
| Real client/server journeys                                | Playwright                                           | `examples/incident-console/tests/browser`                                |

## Runtime scenarios

Prefer `test(machine).with(...).run()` for focused proofs and use
`test.app(App).scenario(machine)` only when app ownership or fixtures matter.
`flowTest(machine).start()` is a narrow migration alias; `flowTest.app(App)` does not exist.

Use an app-bound scenario when resource ownership, fixtures, or installed Effect
services are part of the contract:

```ts
const harness = test
  .app(PostsApp)
  .scenario(postsScreenMachine)
  .with({ resources: [{ ref: postsResource.ref(), value: fixturePosts }] })
  .run();

harness.send({ type: "OPEN_POST", postId: 1 });
await harness.flush();
expect(harness.state()).toBe("detail-1");
```

Use `flush()` for ready work, `advance(...)` for timers, and `settle(...)` only
when the test genuinely needs bounded quiescence. Assertions should read public
snapshots, receipts, issues, and pending-work facts instead of private runtime
state or wall-clock sleeps.

## Model and story proofs

`test.model(machine)` discovers guard-aware paths without executing external
services. A declared story adds reproducible seeds, events, and an expected
state, while the installed CLI proves the same story through the package bin.

The maintained coverage map is `examples/FEATURE_COVERAGE.md`; it links each
claimed feature to the recipe and proof lane that owns it.

## Browser proofs

Component tests are enough for rendering and click wiring that happy-dom can
represent honestly. Incident Console owns the Playwright lane because HTTP,
SSE, focus, reconnect, and full user journeys require an installed browser and
the real API server.

See [Testing Reference](/reference/testing), [Agent Workflow](/guide/agent-workflow),
and [Current Status](/reference/status) for the command and support boundaries.
