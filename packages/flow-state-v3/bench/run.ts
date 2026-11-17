import { Option } from "effect";
import { manifests } from "../fixtures/index.ts";
import { stressCrowd16, stressCrowd256 } from "../fixtures/lanes/stories/load.ts";
import { stressWall1024, wall64 } from "../fixtures/session/stories/load.ts";
import { outlineDeep } from "../fixtures/session/stories/values.ts";
import { spreadOf, timeStory } from "./time.ts";

const WARMUP = 100;
const TIMES = 1000;

const fixed = (ms: number) => ms.toFixed(3).padStart(9);

// Stories that save and restore large values: size is judged here, not by a codec bound.
const LARGE = new Set(["session/stress-agenda-long", "session/archive-large"]);

const longStories = [
  ...manifests.flatMap((m) => Option.toArray(m.long)),
  ...manifests.map((m) => m.savedStress.story),
  ...manifests.flatMap((m) => Object.values(m.stories).filter((s) => LARGE.has(s.id))),
];

// A document 100,000 levels deep: each run takes most of a second, so fewer runs time it.
const deepStories = [outlineDeep()];

// Every memory field walker of every fixture app: their text memo's hits and misses so far.
const walkers = manifests.flatMap((m) =>
  Object.values(m.app.machines).flatMap((entry) =>
    ("machine" in entry ? entry.machine : entry).compiled.fields.map((f) => f.walk),
  ),
);

const memoNow = () =>
  walkers.reduce(
    (sum, w) => ({ hits: sum.hits + w.memo().hits, misses: sum.misses + w.memo().misses }),
    { hits: 0, misses: 0 },
  );

for (const [story, warmup, times] of [
  ...longStories.map((s) => [s, WARMUP, TIMES] as const),
  ...deepStories.map((s) => [s, 2, 20] as const),
]) {
  await timeStory(story, warmup);
  const before = memoNow();
  const runs = await timeStory(story, times);
  const after = memoNow();
  const turns = runs[0]?.turns.length ?? 0;
  const perRun = spreadOf(runs.map((r) => r.ms));
  const perTurn = spreadOf(runs.map((r) => r.ms / r.turns.length));

  console.log(`${story.id}: ${times} runs after ${warmup} warm-up, ${turns} turns a run`);
  console.log(`  per run  median ${fixed(perRun.median)} ms   p99 ${fixed(perRun.p99)} ms`);
  console.log(`  per turn median ${fixed(perTurn.median)} ms   p99 ${fixed(perTurn.p99)} ms`);
  console.log(
    `  field text memo: ${(after.hits - before.hits) / times} hits, ${(after.misses - before.misses) / times} misses a run`,
  );
}

// The same work per actor in a small world and a large one: a step's cost should follow the work it
// does, not how many actors the world holds, so the two per-turn medians should be close.
const scaled = [
  [stressCrowd16(), stressCrowd256()],
  [wall64, stressWall1024()],
] as const;

for (const [small, large] of scaled) {
  const medians = [];

  for (const story of [small, large]) {
    await timeStory(story, 5);
    const runs = await timeStory(story, 20);
    medians.push(spreadOf(runs.map((r) => r.ms / r.turns.length)).median);
  }

  const [a = Number.NaN, b = Number.NaN] = medians;
  console.log(
    `${small.id} vs ${large.id}: per turn median ${fixed(a)} vs ${fixed(b)} ms, ratio ${(b / a).toFixed(2)}`,
  );
}
