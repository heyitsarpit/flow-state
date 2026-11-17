import { Option } from "effect";
import { type Manifest, manifests } from "../../fixtures/index.ts";
import type { Story } from "../../src/host/testing/index.ts";
import { bench } from "../declare.ts";
import { LEAK_BYTES, MEASURES, measureSize, memorySubject } from "./memory.ts";
import { persistSubject } from "./persist.ts";
import { bootSubject } from "./startup.ts";
import { storySubject } from "./story.ts";
import { toolingBenches } from "./tooling.ts";
import { valuesSubject, WALKS } from "./values.ts";

/**
 * The default bound on each growth kind's log-log slope: a flat cost may about double per 10x of
 * size, a linear one grow a little faster than its size.
 */
export const GROWTH_BOUNDS = { flat: 0.3, linear: 1.2 } as const;

const idOf = (storyId: string) => storyId.replace("/", ".");

// The Story each app's own benches run: its long Story, or else its saved stress Story.
const ownStory = (m: Manifest) => Option.getOrElse(m.long, () => m.savedStress.story);

// An app persists when any of its machines compiles with persistence on.
const persists = (m: Manifest) =>
  Object.values(m.app.machines).some(
    (entry) => ("machine" in entry ? entry.machine : entry).compiled.persist,
  );

const turnBench = (story: Story<string>) =>
  bench({
    id: `turn.${idOf(story.id)}.per-turn-ms`,
    concern: "turn",
    tags: ["story", story.id.split("/")[0] ?? story.id],
    size: { n: 1, unit: "run" },
    load: () => storySubject(story),
  });

const turnBenches = (m: Manifest) => [
  ...Option.toArray(m.long).map(turnBench),
  turnBench(m.savedStress.story),
  ...m.bench.stories.flatMap((b) => (Option.isNone(b.size) ? [turnBench(b.story())] : [])),
];

const scaleBenches = (m: Manifest) =>
  m.bench.stories.flatMap((b) =>
    Option.toArray(b.size).map((size) =>
      bench({
        id: `scale.${m.name}.${size.series}-${size.n}.per-turn-ms`,
        concern: "scale",
        tags: ["story", size.series, size.growth],
        size: { n: size.n, unit: size.unit },
        series: Option.some({
          name: `${m.name}.${size.series}`,
          maxSlope: Option.getOrElse(size.maxSlope, () => GROWTH_BOUNDS[size.growth]),
        }),
        load: () => storySubject(b.story()),
      }),
    ),
  );

const persistBenches = (m: Manifest) =>
  persists(m)
    ? [
        bench({
          id: `persist.${m.name}.per-batch-ms`,
          concern: "persist",
          tags: ["story", m.name],
          size: { n: 1, unit: "run" },
          load: () =>
            persistSubject([
              ...Option.toArray(m.long),
              m.savedStress.story,
              ...Object.values(m.stories),
            ]),
        }),
      ]
    : [];

const valuesBenches = (m: Manifest) =>
  Option.toArray(m.long).flatMap((story) =>
    WALKS.map((walk) =>
      bench({
        id: `values.${m.name}.long-memories.${walk}-per-value-ms`,
        concern: "values",
        tags: ["walker", m.name, walk],
        size: { n: 1, unit: "run" },
        load: () => valuesSubject(m.app, story, walk),
      }),
    ),
  );

const startupBenches = (m: Manifest) => {
  const story = ownStory(m);

  return [
    bench({
      id: `startup.${m.name}.boot-empty-ms`,
      concern: "startup",
      tags: ["boot", m.name],
      size: { n: 0, unit: "saved" },
      load: () => bootSubject(m.setup, m.app),
    }),
    bench({
      id: `startup.${m.name}.cold-boot-ms`,
      concern: "startup",
      tags: ["boot", "cold", m.name],
      size: { n: 0, unit: "saved" },
      workers: 10,
      warm: false,
      load: () => bootSubject(m.setup, m.app),
    }),
    bench({
      id: `startup.${idOf(story.id)}.cold-run-per-turn-ms`,
      concern: "startup",
      tags: ["first-run", "cold", m.name],
      size: { n: 1, unit: "run" },
      workers: 10,
      warm: false,
      load: () => storySubject(story),
    }),
  ];
};

const memoryBenches = (m: Manifest) =>
  MEASURES.map(({ kind, metric }) =>
    bench({
      id: `memory.${m.name}.${metric}`,
      concern: "memory",
      tags: ["heap", kind, m.name],
      size: measureSize(kind),
      measure: "bytes",
      headline: ["median"],
      budget: kind === "leak-per-cycle" ? Option.some(LEAK_BYTES) : Option.none(),
      gc: true,
      workers: 3,
      budgetMs: 0,
      minRuns: 3,
      load: () => memorySubject(m.setup, m.bench.probe, kind),
    }),
  );

/**
 * Every bench, derived from the fixtures' manifests, then the tooling commands, in concern order.
 *
 * **Details**
 *
 * `turn` times each long Story, saved stress Story and Story a manifest marks; `scale` each sized
 * Story, grouped by series; `persist` the long Story of an app that persists; `values` each
 * machine's walkers over its long Story's published memories; `startup` the app's boot with
 * nothing saved, warm and cold, and its own Story's first run in a fresh process; `memory` the heap
 * of the actors the manifest's probe names.
 */
export const benches = [
  ...manifests.flatMap(turnBenches),
  ...manifests.flatMap(scaleBenches),
  ...manifests.flatMap(persistBenches),
  ...manifests.flatMap(valuesBenches),
  ...manifests.flatMap(startupBenches),
  ...manifests.flatMap(memoryBenches),
  ...toolingBenches,
];
