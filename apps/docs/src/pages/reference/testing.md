# Testing Reference

Flow State exposes three deterministic proof surfaces and leaves browser
acceptance with the application that owns the browser boundary.

## Harness Scenario Tests

`runFlowScenario(...)` executes a declared story through a production-backed
harness. `scenarioToReport(...)` evaluates the final state and evidence delta
without introducing a second story checker.

### `test(machine)`

Use the focused harness for machine semantics and installed service Layers. It
owns event dispatch, ready-work flushing, virtual time, resource snapshots,
transaction facts, child trees, issues, receipts, and pending work.

### `test.app(App).scenario(machine)`

Use the app-bound harness when the proof depends on exact app ownership,
resource seeds, fixture names, or the same service assembly used by production.
The maintained recipes keep these tests under each package's `src/testing`
directory.

## `test.model(machine)`

Use the model for shortest/simple path discovery and replay. Model paths must
match the runtime-backed harness for resource previews, rollback, invalidation,
outcome routing, reentry, and cleanup; path enumeration alone is not execution
proof.

## Stories and CLI

Declare stories in `src/app/behavior.ts`, export one `BehaviorGateway`, and run
them through the installed `flow-state` bin. The root acceptance matrix executes
every declared story for the five maintained recipes, so a story that requires
an unavailable service or missing seed fails the release gate.

## React and browser tests

Use happy-dom for focused component rendering and interaction. Use the
package-owned Incident Console Playwright suite for real HTTP/SSE journeys and
installed Chromium behavior; root `nub run test:browser` only delegates to it.

Current evidence is indexed by `examples/FEATURE_COVERAGE.md` and summarized on
[Current Status](/reference/status).
