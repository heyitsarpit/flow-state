# Testing Reference

This page answers one question: which testing lane should own the fact you are
trying to prove?

If a fact can be proved in a smaller lane, start there.

## Choose The Lane

| Lane                    | Start here                                               | Owns                                                                             |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| service tests           | direct `@effect/vitest` suite with a shared Layer        | schemas, typed failures, clocks, redaction, batching, and pure service contracts |
| harness scenario tests  | `test(machine)...run()` or `test.app(App).scenario(...)` | resources, transactions, timers, streams, children, and workflow facts           |
| model/path tests        | `test.model(machine)`                                    | guard-aware event-path discovery and replayable shortest/simple paths            |
| browser/component tests | `happy-dom`, Vitest Browser, or Playwright               | rendered output, hydration, focus, click wiring, and browser-edge behavior       |

## Service Tests

Use direct Effect tests when the behavior lives in a service, schema, or clock
contract.

```ts
import { expect, layer } from "@effect/vitest";

layer(ProjectTestLayer)("project service", (it) => {
  it.effect("loads a project", () =>
    Effect.gen(function* () {
      const project = yield* loadProject(projectId);
      expect(project.id).toBe(projectId);
    }),
  );
});
```

Current proof surface:
`examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts`

Do not widen this into a Flow or browser test unless the behavior crosses that
boundary.

## Harness Scenario Tests

Use the Flow harness when the fact depends on runtime ownership:
resources, transactions, timers, streams, children, or joined workflow state.

```ts
const harness = test
  .app(LaunchWorkspaceApp)
  .scenario(launchWorkspaceMachine)
  .with({
    resources: launchWorkspaceSeed,
    provide: LaunchWorkspaceTestServices,
  })
  .run();

harness.send({ type: "SAVE_PROJECT" });
await harness.flush();
expect(harness.state()).toBe("ready");
```

Current proof surface:
`examples/launch-workspace/src/launchWorkspace.test.ts`

Reach for `test.app(App).scenario(...)` when fixtures, seeded resources, or app
inventory matter. Use focused `test(machine)` when they do not.

Story-backed scenario checks also live here:

```ts
const story = flowStories(launchWorkspaceMachine, [
  {
    id: "overview-ready",
    title: "Overview ready",
    seed: {
      fixtures: ["launchWorkspaceSeed"],
    },
    events: [],
    expectedState: "ready",
  },
]).stories[0]!;

const result = await runFlowScenario(LaunchWorkspaceApp, launchWorkspaceMachine, story);
const report = scenarioToReport(result);
const evidence = createScenarioEvidence(report);

expect(report.ok).toBe(true);
expect(evidence).toMatchObject({ status: "success", ok: true });
```

`runFlowScenario(...)` executes default-start, snapshot-start, and setup-described
stories once the story declares runnable seeds. Use `runFlowScenario(machine,
story)` when the story only needs seeded resources or a boot payload. Use
`runFlowScenario(app, machine, story)` when it also needs typed fixture names from
the app inventory. `scenarioToReport(...)` evaluates the story's `expectedState` and
`expectedFacts` without making you rewrite those expectations in the test body.
`createScenarioEvidence(...)` projects either the outcome or report into the same
bounded status object consumed by CLI human and JSON output.
The CLI keeps `story run --check` because Story remains the authored discovery
vocabulary, while its execution result and check report use Scenario names.
The decoder accepts the serialized `story-run`, `story-run-blocked`, and
`story-test` discriminants for stored artifacts. They are wire values, not
public Story execution aliases.

## Model And Path Tests

Use model tests when you want guard-aware path exploration before or alongside a
live scenario.

```ts
const model = test.model(machine);
const path = model.getShortestPaths()[0]!;
const harness = model.replay(path);

expect(harness.state()).toBe(path.state.value);
```

If the live proof needs the discovered path plus one ready-work drain, use
`await model.replayFlushed(path)` and assert against the returned harness after
that flush boundary.

Current proof surface:
`packages/flow-state/src/flow-test-model.test.ts`

Model paths do not replace runtime scenarios. They help you discover legal
event sequences and then hand them back to the live harness.

When a path should include synchronously resolvable success or done routes,
pass `resolveSyncSuccessRoutes: true` in the traversal options.

## Browser And Component Tests

Use browser-facing tests only for user-visible facts:
rendered text, hydration, focus, click wiring, and real browser boundaries.

```tsx
const markup = renderToStaticMarkup(
  <LaunchWorkspaceOverviewPanel overview={overview} workspace={workspace} />,
);

expect(markup).toContain("Overview view");
```

Current proof surfaces:

- `examples/launch-workspace/src/launchWorkspacePanels.test.tsx`
- `examples/launch-workspace/src/launchWorkspaceShell.test.tsx`

Use plain-prop component tests when the view model is already stable. Move up
to Vitest Browser or Playwright only when DOM APIs or browser behavior exceed
`happy-dom`.

MSW is optional here. Add it only when the browser test still crosses a real
fetch boundary that has not moved behind an Effect Layer.

## One Rule

Do not ask one test to prove service contracts, workflow semantics, and DOM
behavior all at once. Split the proof by owner, then let each lane stay small
and explicit.
