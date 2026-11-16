# Fixtures

**Rule:** every public feature and behaviour is proven by a fixture app before it is built. A fixture is a small,
real app in `packages/flow-state-v3/fixtures/<name>/`, written the way an app author would write it, that Flow's
own tests, generator, reload sweep, app mix and bench all run. A hand-written test alone never proves a feature.

**When it applies:** at a Task's requirements, before any code, whenever a Task adds or changes a public feature or
runtime behaviour, and whenever a review finds a bug. The lead lists the proof below; the orchestrator asks for it
and the requirements review checks it (the V3 Epic's instructions, "Fixtures first").

## What a fixture holds

| File          | Holds                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `contracts.ts` | the app's service contracts: the ports it calls, as an app defines them                       |
| `machine.ts`   | definitions, machines and the `runtimeSetup` app, in app-author style                         |
| `server.ts`    | a fake server behind each contract, and the port fake Layer the Stories use                   |
| `stories.ts`   | `usual`, `stress` and saved stress Stories, `samples` for the generator, `long` for the bench |

- **Data comes from a real-shaped source.** Every ending comes from a fake server's answer through the app's own
  service, the path a real `fetch` or SDK call would take; a fixture never injects an outcome
  (@plan.Testing.O3).
- **Self-contained.** Typed code inside the package; no proposal, Task or scenario ids in names or comments.

## Requirements per feature

Each feature or behaviour a Task builds or changes gets all of these, each red before the build:

1. **A home.** An existing fixture changed, or a new one, named for the app it models (`session`, `checklist`), not
   for the feature.
2. **A usual Story.** The feature used the way an app uses it, with checkpoints on what the user would see.
3. **Stress Stories, of load and of structure.** Stress is not only throughput. Load: many actors, long queues,
   repeated reloads, slow and lost answers. Structure: the hardest shapes the feature allows an app to build,
   for example deep chains (a provider of a provider of a consumer, many layers), wide fan-out (one parent, many
   children), several independent trees side by side in one Runtime, a node that is both consumer and provider,
   an override at a middle layer, a parent ended, disposed or reloaded under live descendants, and each refused
   shape (a cycle, a missing provider) shown refused. Each structure is also run under load.
4. **Step samples with edge values.** `samples` offers every event and world word the feature reacts to, with its
   Schemas' edges: empty, `undefined` or `None` where allowed, sizes at and just past every byte or node bound,
   counts at and past every cap (64 follow-ups, 64 queued commits, 1,024 mailbox), refusals, holds, drops, a reload
   mid-way.
5. **Combinations.** Where the feature meets others (persistence, lanes, context, schedules, props, emits), the
   fixture or a second one exercises them together, and the fixture joins the app mix and a pair sweep when it
   persists or calls a server.
6. **Variety.** More than one app shape where the feature can be used differently (a singleton and a value-named
   actor; a shared and a local actor; nested and flat states; one layer of parent and child and several; one tree
   and a forest). A fixture built for a relationship exercises it at more than one depth and width.
7. **Findings.** A bug a review finds is added to `samples` or a Story here, as well as its own titled test, so
   the generator explores the cases around it.

## Where a fixture is registered

A fixture counts only once every runner reaches it:

| Runner                 | Where                                                     |
| ---------------------- | --------------------------------------------------------- |
| generator (usual, stress) | `tests/generated/fixtures.ts` `samples`                |
| app mix                | `tests/generated/fixtures.ts` `mix`, if it persists or calls a server |
| saved stress Stories   | `tests/generated/saved.stress.test.ts`                    |
| reload sweep           | `tests/generated/sweep.test.ts`                           |
| pair sweeps            | a `tests/generated/pairs-<name>.test.ts`, if it has lanes or persistence |
| bench                  | `bench/run.ts` (`long` and `seededStress`)                |

Long runs go behind the stress flag so the default suite stays fast.

## The proof a lead gives at requirements

One Task comment per feature, in this shape:

```text
<feature> (<Spec rule>): fixture <name> (new|changed); usual <story>, stress load <story>,
stress structure <shapes and stories>;
samples edges <list>; combos <fixtures or mix/pairs>; registered in <runners>; red today: <what fails>.
```

## Prior art

Property-based testing over a model of the app (fast-check's model-based testing), XState's model-based testing
paths, and Flow's own `samplesOf` generator with the reload sweep.

## Not built yet

A test that each built public feature, by its API name, appears in a fixture, and that every fixture is
registered with every runner above: @task.V3.T80.
