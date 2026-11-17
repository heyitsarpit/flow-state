import { Option } from "effect";
import type { Story } from "../../src/host/testing/index.ts";
import { bench } from "../declare.ts";
import { storyById } from "../stories.ts";

// What a run wrote: its landed batches, the keys they wrote, and the store's keys and text length at the end.
const writesOf = async (story: Story<string>) => {
  const start = performance.now();
  const run = await story.run();
  const ms = performance.now() - start;

  const landed = run.trace.events.flatMap(({ record }) =>
    record._tag === "Write" && record.status === "landed" ? [record] : [],
  );

  const stored = [...run.end.records.stored.values()];

  return {
    ms,
    batches: landed.length,
    keysWritten: landed.reduce((sum, w) => sum + w.keys.length, 0),
    storedKeys: stored.length,
    storedChars: stored.reduce((sum, text) => sum + text.length, 0),
  };
};

// One run of a persisted Story, its time divided by the batches it landed.
const persistSubject = async (id: string) => {
  const story = Option.getOrThrowWith(
    await storyById(id),
    () => new Error(`no fixture Story has the id ${id}`),
  );

  const first = await writesOf(story);

  return {
    op: async () => {
      const done = await writesOf(story);

      return {
        units: Math.max(1, done.batches),
        counters: {
          batches: done.batches,
          keysWritten: done.keysWritten,
          storedKeys: done.storedKeys,
          storedChars: done.storedChars,
        },
        sample: Option.some(done.ms),
      };
    },
    proof: async () =>
      first.batches > 0 && first.storedKeys > 0
        ? Option.none()
        : Option.some(`${id} landed ${first.batches} batches and stored ${first.storedKeys} keys`),
    shape: {
      batches: first.batches,
      keysWritten: first.keysWritten,
      storedChars: first.storedChars,
    },
  };
};

// The long Stories whose apps persist; sign-in's and sync's save nothing.
const PERSISTED = ["cells/long", "shop/long", "session/long", "transfers/long"] as const;

/**
 * Every `persist` bench: each persisted long Story's run time per landed batch, with the keys it
 * wrote, the store's keys and text length at the end, and so the keys written per stored key.
 */
export const persistBenches = PERSISTED.map((id) =>
  bench({
    id: `persist.${id.replace("/", ".")}.per-batch-ms`,
    concern: "persist",
    tags: ["story", id.split("/")[0] ?? id],
    size: { n: 1, unit: "run" },
    runs: 100,
    load: () => persistSubject(id),
  }),
);
