import { Option } from "effect";
import type { Story } from "../../src/host/testing/index.ts";

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

/**
 * One run of a Story, its time divided by the batches it landed, with the keys it wrote, the store's
 * keys and characters at the end, and so the keys written per stored key; the proof fails when it
 * lands none.
 */
export const persistSubject = async (story: Story<string>) => {
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
        : Option.some(
            `${story.id} landed ${first.batches} batches and stored ${first.storedKeys} keys`,
          ),
    shape: async () => ({
      batches: first.batches,
      keysWritten: first.keysWritten,
      storedChars: first.storedChars,
    }),
  };
};
