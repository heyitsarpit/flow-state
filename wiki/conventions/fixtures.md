# Fixtures

**Rule:** every public feature and behaviour is proven by a fixture app before it is built. A fixture is a small,
real app in `packages/flow-state-v3/fixtures/<name>/`, written the way an app author would write it, that Flow's
own tests, generator, reload sweep, app mix and bench all run. A hand-written test alone never proves a feature.

**When it applies:** at a Task's requirements, before any code, whenever a Task adds or changes a public feature or
runtime behaviour, and whenever a review finds a bug. The lead lists the proof below; the orchestrator asks for it
and the requirements review checks it (the V3 Epic's instructions, "Fixtures first").

The fixtures, their scenarios, their sources and the migration plan are in code:wiki/conventions/fixture-catalog.md.

## A fixture is a whole app

A fixture models a real product, not a demo of one feature, so its logic is easy to reason about and features mix
the way they do in real apps:

- **Several machines:** shared and local actors, with parent and child or provider and consumer relationships.
- **Several operations of different kinds:** a `resource` read, a `transaction` write, and a stream where the
  product has one, feeding each other as the product's do (a read fills a form, its write updates the list, a
  stream confirms it).
- **The product's flows:** its real screens and user journeys, with a new feature added where that product would
  use it.
- **Few fixtures, rich apps.** A new feature lands in the existing apps that would use it. A new fixture is made only
  when no existing app could carry the feature naturally.
- **Additive growth.** An app grows by new machines added around the old ones, not by rewriting them. An existing
  machine keeps its id, states, memory and Stories, and every Story id stays. A new machine reaches an old one by
  holding its ref (sending its existing events, reading its snapshot) or by consuming a context the old one already
  provides. An edit to an old machine is allowed only where the product can't work without it, kept to one
  declaration, with the reason in the catalog row.

Each catalog row lists its app's machines and operations by name.

## What a fixture holds

```text
fixtures/<app>/
  app.ts                 the `runtimeSetup` app: its entries and the Layer of its services
  services.ts            the service ports the app calls, as the app defines them
  machines/<name>.ts     one definition and its machine per file; a fragment (trait, subroutine) in its own file
  operations/reads.ts    `resource` contracts
  operations/writes.ts   `transaction` contracts
  operations/streams.ts  `stream` contracts
  server/<service>.ts    the fake server behind one service: its endpoints, controls and stored data
  server/layer.ts        the port fake Layer the Stories use, built from `server/*`
  stories/usual.ts       one usual Story per journey
  stories/load.ts        load stress and `seededStress`
  stories/structure.ts   structural stress, each shape also under load
  stories/samples.ts     step samples with edge values, for the generator
  stories/releases.ts    a second release's machines and Stories, when the app persists
  stories/long.ts        the bench's long run
  adapters/<service>.ts  a live adapter over the real API (`fetch`, an SDK), which tests may import
  index.ts               the manifest that registers the fixture with every runner
```

- **Code survives; files may move.** Existing machines, their Stories and their tests are never deleted or rewritten:
  each is modified where a new feature needs it and grown as new features need more complex interactions (the user,
  2026-11-17). Files written before this layout may move into it; machine, persisted and Story ids are strings in
  the code, so a move changes none of them.
- **Only files with content.** An app with no stream has no `operations/streams.ts`.
- **Data comes from a real-shaped source.** Every ending comes from a fake server's answer through the app's own
  service, the path a real `fetch` or SDK call would take; a fixture never injects an outcome
  (@plan.Testing.O3).
- **Self-contained.** Typed code inside the package; no proposal, Task or scenario ids in names or comments. Which
  upstream test a Story copies is written in the catalog, not in code.

## Shared vocabulary

Catalog rows name scenarios by these codes, with parameters (`S1×{4,8,32}`).

| Code | Structure                                                                                   |
| ---- | ------------------------------------------------------------------------------------------- |
| S1   | deep chain: a provider of a provider of a consumer, or nested placements, many layers        |
| S2   | wide fan-out: one parent or provider, many children or consumers                            |
| S3   | forest: several independent trees in one Runtime                                            |
| S4   | dual role: a node that consumes one context and provides another                            |
| S5   | override at a middle layer, with the root changing under it                                 |
| S6   | parent ended, disposed, forgotten or reloaded under live children, in each order            |
| S7   | refused shape: a cycle, a missing provider, a conflicting ref, a duplicate key               |
| S8   | churn: children added and removed while work is live                                        |
| S9   | reload at the deepest node                                                                  |

| Code | Load                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| L1   | many actors                                                                  |
| L2   | a queue far deeper than any app builds, timed on the bench                    |
| L3   | slow, lost, duplicated and out-of-order answers                              |
| L4   | repeated reloads                                                             |
| L5   | bursts faster than turns                                                     |

| Code | Edge value                                                                   |
| ---- | ---------------------------------------------------------------------------- |
| E1   | empty                                                                        |
| E2   | `undefined` or `None` where allowed                                          |
| E3   | a large value: thousands of items, long strings, deep nesting                |
| E4   | a user-declared count (such as `.each({ max })`), at and just past            |
| E5   | delays −1, 0, 2^31 − 1 and 2^31 ms                                           |
| E6   | bigint keys and numbers at 2^53                                              |
| E7   | a value or record that fails to decode                                       |
| E8   | a reload mid-call                                                            |

## Requirements per feature

Each feature or behaviour a Task builds or changes gets all of these, each red before the build:

1. **A home.** An existing fixture changed, or a new one, named for the app it models (`session`, `chat`), not for
   the feature. The feature lands on a named machine in a named journey.
2. **A usual Story.** The feature used the way an app uses it, with checkpoints on what the user would see.
3. **Stress Stories, of load and of structure.** Stress is not only throughput. Load is the `L` codes. Structure is
   the hardest shapes the feature allows an app to build, the `S` codes, and each refused shape is shown refused.
   Each structure names its count and the load it runs under (`S2 × N under L5`), each S6 names its orders
   (parent first, child first, forgotten, reloaded), and each S1 chain also has an S9.
   Each Story's count is set from the bench (large enough to show a measurable shape, small enough for the suite's
   measured time) and recorded in the Story; the counts written today are first guesses, re-measured by
   @task.V3.T83. The follow-up chain stays only as a loop-guard Story.
4. **Step samples with edge values.** `samples` offers every event and world word the feature reacts to, with its
   Schemas' edges, the `E` codes: refusals, holds, drops and a reload mid-way among them.
5. **Combinations.** Where the feature meets others (persistence, lanes, context, schedules, props, emits), the
   fixture or a second one exercises them together, and the fixture joins the app mix and a pair sweep when it
   persists or calls a server.
6. **Variety.** More than one app shape where the feature can be used differently (a singleton and a value-named
   actor; a shared and a local actor; nested and flat states; one tree and a forest), in at least three unrelated
   apps.
7. **Findings.** A bug a review finds is added to `samples` or a Story here, as well as its own titled test, so
   the generator explores the cases around it.
8. **Sources.** Where a real app or SDK has the behaviour, the scenario copies its test or user flow, and the
   catalog names the file and test name it copies. A scenario with no real source says so.

## Where a fixture is registered

Each fixture's `index.ts` exports one manifest, and `fixtures/index.ts` lists every manifest. The runners read that
list, so no runner keeps its own list of fixtures:

| Runner                    | Takes                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| generator, usual          | every manifest's `samples`                                                |
| generator, stress         | every manifest's `stressSamples`                                          |
| profiles                  | every manifest's `samples`                                                |
| app mix                   | every manifest's `mix` set                                                |
| saved stress Stories      | every manifest's `savedStress`                                            |
| reload sweep              | every manifest's `stories`                                                |
| pair sweeps               | every manifest's `pairs`, split into four shard files                     |
| bench                     | every manifest's `long` and `savedStress`                                 |
| CLI and `flow.config.ts`  | every manifest's `app`                                                    |

A manifest (code:packages/flow-state-v3/fixtures/manifest.ts) holds:

| Field           | Holds                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------- |
| `name`          | the fixture's folder name, which prefixes its Story ids (`command-palette`'s are `palette/`) |
| `app`           | the grown app the CLI lists the fixture's Stories under; older Stories keep their own setup, |
|                 | whose app has the same id and fewer machines                                                 |
| `stories`       | every named Story, by export name                                                            |
| `samples`       | step samples for the usual generator: one set per part of the app                            |
| `stressSamples` | step samples for the stress generator, edges included: one set per part                      |
| `long`          | the bench's long run, when the fixture has one                                               |
| `savedStress`   | `{ story, seed }`: the stress Story one `stressSamples` set prints from that seed            |
| `mix`           | the usual and stress samples set the app brings to the mix when it persists or calls a       |
|                 | server: one set, since a mix holds each machine once                                         |
| `pairs`         | each samples set the pair sweep drives, with its `reach`: `writes`, `persisted`,             |
|                 | `cancelsAcknowledging` and `retainsUnknown`                                                   |

Samples are lists so an app grows a new set beside an old one: a set's seeds stay as they were, so its saved
stress Story still replays. A refused shape (S7) is an exported Story builder that a test runs, not a registered
Story, since a refused admission rejects the run every runner makes.

Long runs go behind the stress flag so the default suite stays fast. Planted faults (`tests/faults.ts`) and the
lint overrides in `vite.config.ts` name fixture paths by string and are updated by hand when a path changes.

## The proof a lead gives at requirements

One Task comment per feature, in this shape:

```text
<feature> (<Spec rule>): fixture <name> (changed|new), machine <name>, journey <name>; usual <story>,
load <L codes and stories>, structure <S codes and stories>; samples <E codes>; combos <fixtures or mix/pairs>;
sources <file and test names>; red today: <what fails>.
```

## Prior art

Property-based testing over a model of the app (fast-check's model-based testing), XState's model-based testing
paths, and Flow's own `samplesOf` generator with the reload sweep. How a reference codebase is mined for cases:
code:wiki/plans/flow/references/proposals/ui-primitives-2026-11-16.md.

## Not built yet

A test that each built public feature, by its API name, appears in a fixture: not yet owned by any Task.
