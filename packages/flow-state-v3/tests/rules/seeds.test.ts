import { describe, expect, it } from "vite-plus/test";
import { Step } from "../../src/host/testing/index.ts";
import { checked } from "./rules.ts";
import { fixtureStories } from "./sweep.ts";

describe("every fixture Story under another world", () => {
  it("under another seed, so other session ids and a shuffled load order, every Story keeps every rule (WriteLanes I6)", async () => {
    for (const story of fixtureStories) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      const first = await story.run();
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      const other = checked(await story.run({ steps: story.steps, seed: 2 }));

      const mints = (run: typeof first) =>
        run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));

      expect(mints(other).filter((id) => mints(first).includes(id))).toEqual([]);
    }
  });

  it("ended by a reload, then every actor that wrote attached, every Story keeps every rule (Restore I1)", async () => {
    for (const story of fixtureStories) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      const first = await story.run();

      const writers = new Map(
        first.evidence.flatMap((e) =>
          e._tag === "Minted" ? [[`${e.actor.machine}/${e.actor.name}`, e.actor] as const] : [],
        ),
      );

      const steps = [
        ...story.steps,
        Step.reload({ reattach: true, heldWrites: "abort" }),
        ...[...writers.values()].map((actor) => Step.ensure({ actor })),
        Step.advance({ duration: "5 seconds" }),
      ];

      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
      checked(await story.run({ steps }));
    }
  });
});
