# Revisit

Deferred items.

- **Story matchers** (2026-11-01, [story-checks/decisions.md](story-checks/decisions.md) C4): `toHaveLane`, `toHaveRecord` and `toBeIn` in a `flow-state/vitest` entry point. Add them if real failure messages feel weak: a matcher receives the checkpoint, so it can report the checkpoint, the step and the lanes that exist. `toBeIn` keeps "at or below this state" for parent states. They build on the checkpoint reads, so nothing blocks adding them later.
- **Other mocking libraries** (2026-11-01, [story-checks/decisions.md](story-checks/decisions.md) W15): MSW handlers can run behind a Flow-owned gate through `getResponse`. A Node prototype on MSW 2.15 took 0 host tasks, kept runs isolated, and supported hold and a lost answer. `setupServer` collides between instances, and MSW's `delay` uses real time. Not run on Flow.
- **Fake additions with no case yet** (2026-11-01, [story-checks/fakes-review-1.md](story-checks/fakes-review-1.md)): a server-level `pushes` observer (reopen if the desk's conversion shows forgotten pushes), a `closed` handler on `Fake.stream` (presence only so far), `release({ take: n })`, a duplex client half, `message` on `Fake.stream` (back with the first duplex fake), `Fake.response(body, init)` for an app's own `FetchHttpClient.Fetch` Layer, deriving a route table from `HttpApi`.
- **Dev and demo servers** (2026-11-01): a `Fake` server cannot run behind the real app in a browser, so the desk's `app/demo-api.ts` is separate and has already drifted. Out of scope for now.
