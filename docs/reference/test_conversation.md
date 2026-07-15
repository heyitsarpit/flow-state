_This is where the idea gets genuinely strong. Existing frontend testing is bad because the app shape is implicit. In your library, the app shape is explicit: states, events, effects, cache entries, services, and time. So the testing API should not just “help write tests”; it should generate, replay, mutate, and verify flows._

> Status: historical exploration note.
> The testing snippets below predate the implemented `flow-state/testing`
> contract. Treat chained helpers such as `.expectState(...)`,
> `.expectCache(...)`, `.expectEffect(...)`, `.emit(...)`, `.restore(...)`,
> `.fromState(...)`, and `.resources()` as design exploration, not current API.
> The live testing surface is documented in
> [apps/docs/src/pages/guide/testing.md](../../apps/docs/src/pages/guide/testing.md)
> and tracked in [TESTING.md](../../TESTING.md).

Yes: the testing API could be a killer feature.

XState already points in this direction with model-based testing utilities, now moved into `xstate/graph`, with `@xstate/test` deprecated in favor of integrated graph utilities. The goal there is automatically generating test cases from machines to cover paths and edge cases. ([Stately][1]) Effect gives the other half: dependency injection through Layers, deterministic time through `TestClock`, scoped resource cleanup, and test runtimes. ([effect-ts.github.io][2])

Your library should combine these into one testing story.

# The testing philosophy

The API should make these easy:

```txt
1. Start a machine in any state.
2. Inject fake services with typed Effect Layers.
3. Seed cache.
4. Send events.
5. Advance fake time.
6. Resolve/reject/stream mocked Effects.
7. Assert state, context, cache, emitted events, service calls.
8. Generate paths automatically from the machine graph.
9. Replay production snapshots as tests.
```

The product slogan:

```txt
Test the app as a state machine, not as scattered React behavior.
```

## The core API

Single import:

```ts
import { flowTest } from "@effect-flow/test";
```

Basic unit test:

```ts
it("logs in successfully", async () => {
  await flowTest(LoginFlow)
    .provide(
      AuthApi.mock({
        login: () => Effect.succeed({ token: "test-token", userId: "u1" }),
      }),
    )
    .start({
      input: {},
    })
    .expectState("editing")
    .send({ type: "ChangeEmail", email: "arpit@example.com" })
    .send({ type: "ChangePassword", password: "secret" })
    .send({ type: "Submit" })
    .expectState("submitting")
    .flush()
    .expectState("authenticated")
    .expectContext((ctx) => {
      expect(ctx.session._tag).toBe("Some");
    });
});
```

The important thing: `.flush()` does not mean “wait randomly.” It means:

```txt
Run all currently scheduled machine/effect/cache work to quiescence.
```

No `await screen.findByText` unless you are doing a DOM test. No timing hacks.

## The harness object

The test runner should expose a strongly typed harness:

```ts
const h = await flowTest(ProjectEditorFlow)
  .provide(TestProjectApi)
  .seedQuery(["project", "p1"], fakeProject)
  .start({ input: { projectId: "p1" } });

h.state();       // typed current state
h.context();     // typed context
h.resources();   // typed resource states
h.cache();       // cache inspector
h.send(...);     // typed events only
h.clock();       // deterministic time
h.trace();       // state/effect/cache timeline
```

So tests can be imperative when useful:

```ts
await h.send({ type: "Edit" });
await h.send({ type: "ChangeName", name: "New Name" });
await h.send({ type: "Save" });

await h.expectState("saving");
await h.flush();

await h.expectState("viewing");
await h.expectCache(["project", "p1"]).toEqual({
  id: "p1",
  name: "New Name",
});
```

## Mock injection through Effect Layers

This is where Effect makes your library better than XState alone.

Instead of random Jest mocks:

```ts
jest.fn();
```

you define typed service layers:

```ts
const ProjectApiTest = flowTest.layer(ProjectApi, {
  getProject: (id) =>
    Effect.succeed({
      id,
      name: "Test Project",
    }),

  saveProject: (draft) =>
    Effect.succeed({
      ...draft,
      savedAt: new Date(0),
    }),
});
```

Then:

```ts
await flowTest(ProjectEditorFlow)
  .provide(ProjectApiTest)
  .start({ input: { projectId: "p1" } })
  .send({ type: "Edit" })
  .send({ type: "Save" })
  .flush()
  .expectState("viewing");
```

The fake service must satisfy the same Effect type as the real service. That means the mock cannot accidentally return the wrong shape, throw untyped errors, or ignore required dependencies.

## Failure testing should be first-class

Most frontend tests accidentally test only happy paths. Your library can make failures cheap.

```ts
const ProjectApiFails = flowTest.layer(ProjectApi, {
  getProject: () => Effect.fail(new ProjectError.NotFound({ id: "p1" })),

  saveProject: () => Effect.fail(new ProjectError.Network({ retryable: true })),
});
```

Test:

```ts
await flowTest(ProjectEditorFlow)
  .provide(ProjectApiFails)
  .start({ input: { projectId: "p1" } })
  .flush()
  .expectState("failed")
  .expectContext((ctx) => {
    expect(ctx.error?._tag).toBe("NotFound");
  });
```

Even better, add a failure matrix API:

```ts
await flowTest(ProjectEditorFlow)
  .matrix("load failures", {
    service: ProjectApi.getProject,
    failures: [
      new ProjectError.NotFound({ id: "p1" }),
      new ProjectError.Network({ retryable: true }),
      new ProjectError.Unauthorized(),
    ],
  })
  .expectEachFailure({
    NotFound: "failed.notFound",
    Network: "failed.retryable",
    Unauthorized: "failed.unauthorized",
  });
```

That becomes very AI-friendly. The model does not need to invent test cases; the machine/error types tell it what must be covered.

# Model-based path testing

This is the big one.

Because your app is a machine, the test library can generate paths:

```ts
describe("ProjectEditorFlow model", () => {
  flowTest
    .model(ProjectEditorFlow)
    .provide(ProjectApiHappyPath)
    .coverage({
      states: "all",
      transitions: "all",
      guards: "all",
    })
    .events({
      Edit: async ({ h }) => {
        await h.send({ type: "Edit" });
      },

      ChangeName: async ({ h }) => {
        await h.send({ type: "ChangeName", name: "Updated" });
      },

      Save: async ({ h }) => {
        await h.send({ type: "Save" });
        await h.flush();
      },

      Cancel: async ({ h }) => {
        await h.send({ type: "Cancel" });
      },
    })
    .assertState({
      viewing: async ({ h }) => {
        expect(h.context().project._tag).toBe("Some");
      },

      editing: async ({ h }) => {
        expect(h.context().draft._tag).toBe("Some");
      },

      saving: async ({ h }) => {
        expect(h.hasRunningEffect("saveProject")).toBe(true);
      },

      failed: async ({ h }) => {
        expect(h.context().error._tag).toBe("Some");
      },
    })
    .run();
});
```

The library should generate shortest paths to states/transitions and print uncovered states if the test model is incomplete.

Example output:

```txt
Uncovered transition:
  editing --Delete--> confirmingDelete

Uncovered guard branch:
  saving.onFailure where error._tag === "Conflict"

Unreachable state:
  archived
```

That is incredibly useful for humans and AI agents.

## The best API: `plans()`

I would copy the spirit of XState model-based testing but make it Effect-aware:

```ts
const plans = flowTest
  .model(ProjectEditorFlow)
  .withLayer(ProjectApiHappyPath)
  .withCacheSeed([[["project", "p1"], fakeProject]])
  .plans({
    coverage: "all-transitions",
    maxDepth: 8,
  });

for (const plan of plans) {
  test(plan.name, async () => {
    await plan.run();
  });
}
```

Each generated plan should include:

```txt
- initial snapshot
- event sequence
- expected state sequence
- invoked effects
- cache reads/writes
- invalidations
- final assertions
```

## Time testing

Effect’s `TestClock` is perfect here because it lets tests advance time manually instead of waiting for real time; scheduled effects run when the test clock is adjusted. ([Effect][3])

Your API:

```ts
await flowTest(SessionFlow)
  .provide(AuthApiTest)
  .start()
  .expectState("authenticated")
  .advance("29 minutes")
  .expectState("authenticated")
  .advance("1 minute")
  .expectState("refreshingSession")
  .flush()
  .expectState("authenticated");
```

For cache:

```ts
await flowTest(ProjectFlow)
  .provide(ProjectApiTest)
  .start({ input: { projectId: "p1" } })
  .flush()
  .expectQuery(["project", "p1"])
  .fresh()
  .advance("31 seconds")
  .expectQuery(["project", "p1"])
  .stale();
```

For retries:

```ts
await flowTest(SaveFlow)
  .provide(
    ProjectApi.flaky({
      failTimes: 2,
      then: Effect.succeed(savedProject),
    }),
  )
  .start()
  .send({ type: "Save" })
  .expectEffect("saveProject")
  .attempts(1)
  .advance("100 millis")
  .expectEffect("saveProject")
  .attempts(2)
  .advance("200 millis")
  .expectEffect("saveProject")
  .attempts(3)
  .flush()
  .expectState("saved");
```

This is much better than tests filled with `setTimeout`.

# Cache testing

If you tack on TanStack Query-style semantics, cache testing must be excellent.

```ts
await flowTest(ProjectFlow)
  .provide(ProjectApiTest)
  .seedQuery(["project", "p1"], fakeProject, {
    stale: false,
  })
  .start({ input: { projectId: "p1" } })
  .expectState("viewing")
  .expectService(ProjectApi.getProject)
  .notCalled();
```

Stale-while-revalidate:

```ts
await flowTest(ProjectFlow)
  .provide(ProjectApiTest)
  .seedQuery(["project", "p1"], oldProject, {
    stale: true,
  })
  .start({ input: { projectId: "p1" } })
  .expectState("viewing")
  .expectContext((ctx) => {
    expect(ctx.project.value.name).toBe("Old Name");
  })
  .expectBackgroundQuery(["project", "p1"])
  .running()
  .flush()
  .expectContext((ctx) => {
    expect(ctx.project.value.name).toBe("New Name");
  });
```

Mutation invalidation:

```ts
await flowTest(ProjectEditorFlow)
  .provide(ProjectApiTest)
  .seedQuery(["project", "p1"], fakeProject)
  .seedQuery(["projects"], [fakeProject])
  .start({ input: { projectId: "p1" } })
  .send({ type: "Edit" })
  .send({ type: "ChangeName", name: "Updated" })
  .send({ type: "Save" })
  .flush()
  .expectInvalidated(["project", "p1"])
  .expectInvalidated(["projects"]);
```

Optimistic update and rollback:

```ts
await flowTest(ProjectEditorFlow)
  .provide(ProjectApi.failsOnSave)
  .seedQuery(["project", "p1"], fakeProject)
  .start({ input: { projectId: "p1" } })
  .send({ type: "Edit" })
  .send({ type: "ChangeName", name: "Optimistic Name" })
  .send({ type: "Save" })
  .expectCache(["project", "p1"])
  .toMatch({
    name: "Optimistic Name",
  })
  .flush()
  .expectState("editing")
  .expectCache(["project", "p1"])
  .toMatch({
    name: fakeProject.name,
  });
```

That is the kind of thing TanStack Query users test awkwardly today.

# Snapshot testing, but not dumb snapshot testing

XState actors support getting a persisted snapshot and restoring from it, which is useful for restoring workflows across reloads or process boundaries. ([Stately][4]) Your library should make this a testing primitive.

```ts
const snapshot = await flowTest(ProjectEditorFlow)
  .provide(ProjectApiTest)
  .start({ input: { projectId: "p1" } })
  .send({ type: "Edit" })
  .send({ type: "ChangeName", name: "Draft Name" })
  .getSnapshot();

await flowTest(ProjectEditorFlow)
  .provide(ProjectApiTest)
  .restore(snapshot)
  .expectState("editing")
  .expectContext((ctx) => {
    expect(ctx.draft.value.name).toBe("Draft Name");
  });
```

Even better:

```ts
await flowTest(ProjectEditorFlow)
  .fromState("editing", {
    context: {
      project: fakeProject,
      draft: changedDraft,
    },
  })
  .send({ type: "Save" })
  .flush()
  .expectState("viewing");
```

This is huge. You can inject the exact weird app state a bug report describes.

## Production replay

This should exist:

```ts
await flowTest
  .replay(ProjectEditorFlow, productionTrace)
  .provide(ProjectApi.replayFromTrace(productionTrace))
  .expectNoUnexpectedTransitions();
```

If a user reports:

```txt
I clicked save, then cancel, then refreshed, and the draft disappeared.
```

the app can capture:

```txt
state snapshots + events + effect outcomes + cache mutations
```

Then the test runner can replay it.

# Stream and subscription testing

For agent UIs, websocket UIs, upload progress, and live dashboards, this is essential.

```ts
const stream = flowTest.stream<AgentEvent>();

await flowTest(AgentRunFlow)
  .provide(
    AgentApi.mock({
      watchRun: () => stream,
    }),
  )
  .start({ input: { runId: "r1" } })
  .expectState("running")
  .emit(stream, { type: "ToolStarted", tool: "shell" })
  .expectContext((ctx) => {
    expect(ctx.activeTool).toBe("shell");
  })
  .emit(stream, {
    type: "NeedsApproval",
    command: "git push --force-with-lease",
  })
  .expectState("waitingForApproval");
```

Also cancellation:

```ts
await flowTest(AgentRunFlow)
  .provide(AgentApi.withTrackedStream())
  .start({ input: { runId: "r1" } })
  .expectStream("watchRun")
  .active()
  .send({ type: "Stop" })
  .expectState("stopped")
  .expectStream("watchRun")
  .cancelled();
```

This tests one of the most failure-prone frontend areas: leaving subscriptions running after UI state changes.

# Invariants

This is where the library becomes more than a test helper.

You can define invariants directly on the machine:

```ts
const CheckoutFlow = flow.machine({
  // ...

  test: {
    invariants: {
      "cannot be paid without orderId": ({ state, ctx }) =>
        state !== "paid" || ctx.orderId._tag === "Some",

      "cannot submit empty cart": ({ state, ctx }) =>
        state !== "submittingPayment" || ctx.cart.items.length > 0,

      "payment mutation only runs once per order": ({ trace }) =>
        trace.effects("chargeCard").length <= 1,
    },
  },
});
```

Then:

```ts
await flowTest.model(CheckoutFlow).provide(CheckoutApiTest).checkInvariants({
  maxDepth: 12,
});
```

For AI-generated code, invariants are gold. They give the model hard rails:

```txt
Never allow impossible business states.
```

## Property-style event fuzzing

After model paths, add random event sequences:

```ts
await flowTest
  .fuzz(CheckoutFlow)
  .provide(CheckoutApiRandomized)
  .events([
    { type: "AddItem", item: fakeItem },
    { type: "RemoveItem", itemId: "i1" },
    { type: "ApplyCoupon", code: "SAVE10" },
    { type: "SubmitPayment" },
    { type: "Cancel" },
  ])
  .runs(500)
  .maxDepth(20)
  .checkInvariants();
```

This is especially useful for editors, drag/drop, payment flows, agent UIs, and concurrent actions.

# Component testing

The component API should attach the machine harness to React Testing Library or Playwright.

```ts
test("save project through UI", async () => {
  const t = await flowTest.render(ProjectPage, {
    machine: ProjectEditorFlow,
    input: { projectId: "p1" },
    layer: ProjectApiTest,
  });

  await t.expectState("viewing");

  await t.click("Edit");
  await t.type("Project name", "Updated");
  await t.click("Save");

  await t.expectState("saving");
  await t.flush();
  await t.expectState("viewing");

  expect(t.screen.getByText("Updated")).toBeVisible();
});
```

The unique feature is that DOM testing and machine testing talk to each other:

```ts
await t.expectState("waitingForApproval");
await t.expectVisible("Allow command");
```

So you test both:

```txt
semantic app state
visible UI result
```

That avoids brittle tests that only look for text and miss broken workflow state.

# Test recorder

This would be a devtools killer feature.

In dev mode:

```ts
flow.devtools.record();
```

Then click around the app. Export:

```ts
flowTest.case("rename project regression", {
  machine: ProjectEditorFlow,
  snapshot: { ... },
  events: [
    { type: "Edit" },
    { type: "ChangeName", name: "Updated" },
    { type: "Save" },
  ],
  effects: [
    {
      service: "ProjectApi.saveProject",
      result: { _tag: "Failure", error: { _tag: "Conflict" } },
    },
  ],
  expected: {
    state: "editing",
  },
});
```

This is ideal for bug reports and AI coding agents. Instead of saying “write tests,” you give the agent a failing trace.

# The API surface

I would keep the testing package compact:

```ts
flowTest(machine)
  .provide(layer)
  .start(input)
  .restore(snapshot)
  .fromState(state, context)
  .send(event)
  .emit(stream, event)
  .flush()
  .advance(duration)
  .expectState(state)
  .expectContext(assertion)
  .expectResource(key)
  .expectCache(key)
  .expectInvalidated(key)
  .expectEffect(name)
  .expectTrace(assertion)
  .getSnapshot()

flowTest.model(machine)
  .plans(options)
  .coverage(options)
  .events(drivers)
  .assertState(assertions)
  .checkInvariants()

flowTest.render(component, options)
  .click(...)
  .type(...)
  .expectState(...)
  .expectVisible(...)

flowTest.replay(machine, trace)
  .provide(layer)
  .run()
```

That is enough.

# Example: full realistic test

```ts
test("save conflict keeps user in editing and preserves draft", async () => {
  const originalProject = {
    id: "p1",
    name: "Original",
    version: 1,
  };

  const ProjectApiConflict = flowTest.layer(ProjectApi, {
    getProject: () => Effect.succeed(originalProject),

    saveProject: () =>
      Effect.fail(
        new ProjectError.Conflict({
          serverVersion: 2,
        }),
      ),
  });

  await flowTest(ProjectEditorFlow)
    .provide(ProjectApiConflict)
    .start({ input: { projectId: "p1" } })
    .flush()
    .expectState("viewing")
    .send({ type: "Edit" })
    .send({ type: "ChangeName", name: "My Draft" })
    .send({ type: "Save" })
    .expectState("saving")
    .flush()
    .expectState("editing")
    .expectContext((ctx) => {
      expect(ctx.draft.value.name).toBe("My Draft");
      expect(ctx.error.value._tag).toBe("Conflict");
    })
    .expectCache(["project", "p1"])
    .toMatch({
      name: "Original",
      version: 1,
    });
});
```

This is exactly the kind of test that is painful in normal React apps and very clean in your model.

# The real killer feature

The testing API should produce a report like:

```txt
ProjectEditorFlow test coverage

States:
  ✓ loading
  ✓ viewing
  ✓ editing
  ✓ saving
  ✓ failed
  ✗ conflictResolution

Transitions:
  ✓ viewing --Edit--> editing
  ✓ editing --Save--> saving
  ✓ saving --success--> viewing
  ✓ saving --NetworkError--> editing
  ✗ saving --Conflict--> conflictResolution

Effects:
  ✓ ProjectApi.getProject success
  ✓ ProjectApi.getProject NotFound
  ✓ ProjectApi.saveProject success
  ✓ ProjectApi.saveProject NetworkError
  ✗ ProjectApi.saveProject Conflict

Cache:
  ✓ project query seeded
  ✓ save invalidates project
  ✗ save invalidates project list
```

That would make test coverage semantic, not line-based.

Line coverage tells you “this code ran.”

This tells you:

```txt
This app behavior is covered.
```

That is much more valuable.

# My strongest recommendation

Design the testing API before the runtime API is finished.

Because the runtime API should be shaped by what is testable.

The dream test should look like this:

```ts
await flowTest(ProjectEditorFlow)
  .given("cached project exists")
  .when("user edits name and save conflicts")
  .then("draft is preserved")
  .then("machine returns to editing")
  .then("cache rolls back")
  .then("conflict error is visible");
```

And underneath, it should still be real typed code:

```ts
await flowTest(ProjectEditorFlow)
  .seedQuery(["project", "p1"], originalProject)
  .provide(ProjectApi.conflictOnSave)
  .start({ input: { projectId: "p1" } })
  .send({ type: "Edit" })
  .send({ type: "ChangeName", name: "Draft" })
  .send({ type: "Save" })
  .flush()
  .expectState("editing")
  .expectContext((ctx) => {
    expect(ctx.draft.value.name).toBe("Draft");
  });
```

That is the package’s moat:

```txt
Effect gives typed mocks.
Machines give generated paths.
Cache gives observable invalidation.
Snapshots give replayable bugs.
TestClock gives deterministic time.
Traces give debuggability.
```

If this library exists, the testing story should be one of the main reasons someone adopts it.

[1]: https://stately.ai/docs/testing "Testing"
[2]: https://effect-ts.github.io/effect/effect/Layer.ts.html "Layer.ts - effect"
[3]: https://effect.website/docs/testing/testclock/ "TestClock | Effect Documentation"
[4]: https://stately.ai/docs/persistence "Persistence"
