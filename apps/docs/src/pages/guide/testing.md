# Testing

Put each fact in the smallest lane that owns it, because service semantics,
runtime ownership, and browser behavior fail for different reasons.

| Fact                                                       | Lane                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| Effect services and typed failures                         | direct Effect or `@effect/vitest` test               |
| Resources, transactions, streams, timers, and child actors | `test(machine)` or `test.app(App).scenario(machine)` |
| Guard-aware paths                                          | `test.model(machine)` and `graphOf(machine)`         |
| React rendering and interaction                            | happy-dom component test                             |
| Real client/server journeys                                | application-owned browser test                       |

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

## Browser proofs

Component tests cover rendering and click wiring that happy-dom can represent
honestly. A consuming application owns browser proofs for its network and UI
boundaries.

See [Testing Reference](/reference/testing), [Agent Workflow](/guide/agent-workflow),
and [Current Status](/reference/status) for the command and support boundaries.
