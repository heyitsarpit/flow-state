import { describe, expect, it } from "vite-plus/test";
import { Step, type Story } from "../../src/host/testing/index.ts";
import { checked } from "./rules.ts";

/**
 * Declares the tests that run each of the given Stories under another world: another seed, and
 * an ending reload after which every actor that wrote attaches.
 */
export const underAnotherWorld = (which: string, stories: ReadonlyArray<Story<string>>) =>
  describe(`${which} under another world`, () => {
    it("under another seed, so other session ids and a shuffled load order, every Story keeps every rule (WriteLanes I6)", async () => {
      for (const story of stories) {
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
      for (const story of stories) {
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
          // The cut right after the reload lets Restore I1 judge it.
          Step.checkpoint({ name: "~reloaded" }),
          ...[...writers.values()].map((actor) => Step.ensure({ actor, context: new Map() })),
          Step.advance({ duration: "5 seconds" }),
        ];

        // oxlint-disable-next-line no-await-in-loop -- one run at a time: each Story is its own world
        const run = checked(await story.run({ steps }));

        expect(Object.keys(run.checkpoints)).toContain("~reloaded");
      }
    });
  });
