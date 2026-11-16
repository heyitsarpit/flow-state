import { long as cells, seededStress as cellsStress } from "../fixtures/cells/stories.ts";
import { seededStress as paletteStress } from "../fixtures/command-palette/stories.ts";
import { seededStress as lanesStress } from "../fixtures/lanes/stories.ts";
import { seededStress as playerStress } from "../fixtures/player/stories.ts";
import { seededStress as numberStress } from "../fixtures/number-input/stories.ts";
import { long as pay, seededStress as payStress } from "../fixtures/pay/stories.ts";
import { long as signIn, seededStress as signInStress } from "../fixtures/sign-in/stories.ts";
import { long as sync, seededStress as syncStress } from "../fixtures/sync/stories.ts";
import {
  long as transfers,
  seededStress as transfersStress,
} from "../fixtures/transfers/stories.ts";
import { spreadOf, timeStory } from "./time.ts";

const WARMUP = 100;
const TIMES = 1000;

const fixed = (ms: number) => ms.toFixed(3).padStart(9);

const longStories = [
  transfers,
  pay,
  cells,
  sync,
  signIn,
  transfersStress,
  playerStress,
  payStress,
  cellsStress,
  syncStress,
  signInStress,
  paletteStress,
  numberStress,
  lanesStress,
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
