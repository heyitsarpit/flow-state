import { Option } from "effect";
import { manifests } from "../fixtures/index.ts";
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

for (const story of longStories) {
  await timeStory(story, WARMUP);
  const runs = await timeStory(story, TIMES);
  const turns = runs[0]?.turns.length ?? 0;
  const perRun = spreadOf(runs.map((r) => r.ms));
  const perTurn = spreadOf(runs.map((r) => r.ms / r.turns.length));

  console.log(`${story.id}: ${TIMES} runs after ${WARMUP} warm-up, ${turns} turns a run`);
  console.log(`  per run  median ${fixed(perRun.median)} ms   p99 ${fixed(perRun.p99)} ms`);
  console.log(`  per turn median ${fixed(perTurn.median)} ms   p99 ${fixed(perTurn.p99)} ms`);
}
